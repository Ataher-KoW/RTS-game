import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const releaseDir = path.join(root, 'release');
const targets = [
  {
    name: 'unpacked',
    exe: path.join(releaseDir, 'win-unpacked', 'AT Strategy.exe'),
    port: 9335,
  },
  {
    name: 'portable',
    exe: path.join(releaseDir, 'AT Strategy 1.0.0.exe'),
    port: 9336,
  },
];

for (const target of targets) {
  await smokeTarget(target);
}

async function smokeTarget(target) {
  if (!existsSync(target.exe)) {
    throw new Error(`Missing packaged executable: ${target.exe}`);
  }

  const smokeFile = path.join(root, '.cache', `packaged-${target.name}-ui-smoke.txt`);
  await rm(smokeFile, { force: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    AT_STRATEGY_ELECTRON_SMOKE: '1',
    AT_STRATEGY_SMOKE_KEEP_OPEN: '1',
    AT_STRATEGY_SMOKE_FILE: smokeFile,
    AT_STRATEGY_REMOTE_DEBUGGING_PORT: String(target.port),
  });
  const child = spawn(target.exe, [], {
    cwd: root,
    windowsHide: true,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const page = await waitForPage(target.port, 90000);
    const cdp = await connectCdp(page.webSocketDebuggerUrl);
    try {
      const result = await evaluate(cdp, `
        new Promise((resolve) => {
          const started = performance.now();
          function check() {
            const setupText = document.querySelector('#setupPanel')?.textContent || '';
            const logo = document.querySelector('.brand-logo');
            const scripts = [...document.scripts].map((script) => script.src);
            const styles = [...document.styleSheets].length;
            const ready = setupText.includes('Skirmish Setup') &&
              setupText.includes('AT Strategy') &&
              logo?.naturalWidth > 0 &&
              Boolean(window.atStrategyGame?.runV10AcceptanceProbe);
            if (ready) {
              resolve({
                ready,
                title: document.title,
                setupText,
                logoSrc: logo?.getAttribute('src') || '',
                logoComplete: Boolean(logo?.complete),
                scripts,
                styles
              });
              return;
            }
            if (performance.now() - started > 30000) {
              resolve({ ready, title: document.title, setupText, scripts, styles });
              return;
            }
            setTimeout(check, 100);
          }
          check();
        })
      `);
      if (!result.ready) {
        throw new Error(`${target.name} packaged UI did not render setup screen: ${JSON.stringify(result)}`);
      }
      console.log(
        `Packaged UI smoke ${target.name}: title="${result.title}", logo="${result.logoSrc}", scripts=${result.scripts.length}, styles=${result.styles}`,
      );
    } finally {
      cdp.close();
    }
  } finally {
    killProcessTree(child.pid);
  }

  if (stderr.trim()) {
    console.warn(`Packaged UI smoke ${target.name} stderr:\n${stderr.trim()}`);
  }
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already exited.
  }
}

async function waitForPage(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((entry) => entry.type === 'page' && entry.url.includes('index.html'));
        if (page) {
          return page;
        }
      }
    } catch {
      // The packaged app is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for packaged Electron CDP on port ${port}`);
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  const callbacks = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !callbacks.has(message.id)) {
      return;
    }
    const { resolve, reject } = callbacks.get(message.id);
    callbacks.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          callbacks.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 60000);
        callbacks.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(JSON.stringify(response.exceptionDetails, null, 2));
  }
  return response.result?.value;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
