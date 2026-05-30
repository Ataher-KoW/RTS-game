import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(root, '.cache');
const chromeProfile = path.join(cacheDir, 'chrome-v02-profile');
const screenshotPath = path.join(cacheDir, 'v0.2-acceptance.png');
const viteUrl = 'http://127.0.0.1:5174/';
const cdpPort = 9223;
const chromePath = findChrome();
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

await mkdir(cacheDir, { recursive: true });
await rm(chromeProfile, { recursive: true, force: true });

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5174'], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let viteOutput = '';
vite.stdout.on('data', (chunk) => {
  viteOutput += chunk.toString();
});
vite.stderr.on('data', (chunk) => {
  viteOutput += chunk.toString();
});

let chrome;
try {
  await waitForHttp(viteUrl, 25000);
  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1366,768',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${chromeProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      viteUrl,
    ],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );

  await waitForHttp(`http://127.0.0.1:${cdpPort}/json`, 25000);
  const page = await getPage();
  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.evaluate', {
    expression: `
      new Promise((resolve) => {
        const started = performance.now();
        function check() {
          if (window.atStrategyGame?.runAcceptanceProbe) {
            resolve(true);
            return;
          }
          if (performance.now() - started > 20000) {
            resolve(false);
            return;
          }
          setTimeout(check, 100);
        }
        check();
      })
    `,
    awaitPromise: true,
    returnByValue: true,
  });
  const probe = await cdp.send('Runtime.evaluate', {
    expression: 'window.atStrategyGame.runAcceptanceProbe()',
    awaitPromise: true,
    returnByValue: true,
  });
  if (probe.exceptionDetails) {
    console.error(JSON.stringify(probe.exceptionDetails, null, 2));
    throw new Error('v0.2 acceptance probe threw in the browser');
  }
  const value = probe.result?.value;
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  cdp.close();

  if (!value?.passed) {
    console.error(JSON.stringify(value ?? probe, null, 2));
    throw new Error('v0.2 acceptance probe failed');
  }

  console.log(JSON.stringify(value, null, 2));
  console.log(`Acceptance screenshot: ${screenshotPath}`);
} finally {
  chrome?.kill();
  vite.kill();
}

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Retry until the dev server or CDP endpoint is up.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${viteOutput}`);
}

async function getPage() {
  const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith(viteUrl));
  if (!page) {
    throw new Error('Could not find AT Strategy page in Chrome DevTools target list');
  }
  return page;
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
      const id = nextId++;
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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
