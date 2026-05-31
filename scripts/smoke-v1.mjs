import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAtStrategyServer } from '../server/at-strategy-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const cacheDir = path.join(root, '.cache');
const chromeProfile = path.join(cacheDir, 'chrome-v1-profile');
const screenshotPath = path.join(cacheDir, 'v1-acceptance.png');
const viteUrl = 'http://127.0.0.1:5176/';
const cdpPort = 9225;
const chromePath = findChrome();
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

await mkdir(cacheDir, { recursive: true });
await testMultiplayerProtocol();
await testBrowserReleaseProbe();

async function testMultiplayerProtocol() {
  const server = createAtStrategyServer({ host: '127.0.0.1', port: 8793 });
  await server.listen();
  try {
    const health = await (await fetch('http://127.0.0.1:8793/health')).json();
    assert('multiplayer health endpoint is live', health.ok && health.name.includes('AT Strategy'));

    await runRoomScenario({
      format: '1v1',
      mapId: 'fractured-frontier',
      seed: 42,
      players: [
        { name: 'Host 1v1', factionId: 'synthekon', color: '#38bdf8', team: 1, ready: true },
        { name: 'Guest 1v1', factionId: 'ironveil', color: '#f97316', team: 2, ready: true },
      ],
    });

    await runRoomScenario({
      format: '2v2',
      mapId: 'void-crater',
      seed: 84,
      players: [
        { name: 'Blue', factionId: 'synthekon', color: '#38bdf8', team: 1, ready: true },
        { name: 'Green', factionId: 'vorreth', color: '#84cc16', team: 1, ready: true },
        { name: 'Orange', factionId: 'ironveil', color: '#f97316', team: 2, ready: true },
        { name: 'Purple', factionId: 'synthekon', color: '#a855f7', team: 2, ready: true },
      ],
    });

    await runRoomScenario({
      format: 'ffa',
      mapId: 'obsidian-ridge',
      seed: 126,
      updatePlayer: true,
      players: [
        { name: 'Alpha', factionId: 'synthekon', color: '#38bdf8', team: 1, ready: true },
        { name: 'Beta', factionId: 'vorreth', color: '#84cc16', team: 2, ready: true },
        { name: 'Gamma', factionId: 'ironveil', color: '#f97316', team: 3, ready: true },
        { name: 'Delta', factionId: 'vorreth', color: '#a855f7', team: 4, ready: true },
      ],
    });

    console.log('Multiplayer protocol smoke: passed (health, 1v1, 2v2, FFA, lobby capacity, state relay, AI takeover)');
  } finally {
    await server.close();
  }

  async function runRoomScenario({ format, mapId, seed, players, updatePlayer = false }) {
    const url = 'ws://127.0.0.1:8793';
    const clients = await Promise.all(players.map(() => openWs(url)));
    const host = clients[0];
    try {
      await Promise.all(clients.map((client) => client.waitFor((message) => message.type === 'server:welcome')));

      host.sendJson({ type: 'lobby:list' });
      await host.waitFor((message) => message.type === 'lobby:list');

      host.sendJson({ type: 'lobby:create', format, mapId, player: players[0] });
      const joined = await host.waitFor((message) => message.type === 'lobby:joined' && message.room.format === format);
      const roomId = joined.room.id;

      for (let index = 1; index < clients.length; index += 1) {
        clients[index].sendJson({ type: 'lobby:join', roomId, player: players[index] });
        await clients[index].waitFor((message) => message.type === 'lobby:joined' && message.room.id === roomId);
      }

      const roomUpdate = await host.waitFor(
        (message) => message.type === 'lobby:update' && message.room.id === roomId && message.room.players.length === players.length,
      );
      assert(`${format} room has expected player count`, roomUpdate.room.players.length === players.length);
      assert(`${format} room keeps selected map`, roomUpdate.room.mapId === mapId);
      for (const player of players) {
        const publicPlayer = roomUpdate.room.players.find((candidate) => candidate.name === player.name);
        assert(`${format} preserves faction for ${player.name}`, publicPlayer?.factionId === player.factionId);
        assert(`${format} preserves color for ${player.name}`, publicPlayer?.color === player.color);
      }

      if (updatePlayer) {
        clients[1].sendJson({
          type: 'lobby:update-player',
          player: { ...players[1], name: 'Beta Updated', factionId: 'ironveil', color: '#facc15' },
        });
        await host.waitFor(
          (message) =>
            message.type === 'lobby:update' &&
            message.room.players.some(
              (player) => player.name === 'Beta Updated' && player.factionId === 'ironveil' && player.color === '#facc15',
            ),
        );
      }

      const overflow = await openWs(url);
      try {
        await overflow.waitFor((message) => message.type === 'server:welcome');
        overflow.sendJson({
          type: 'lobby:join',
          roomId,
          player: { name: 'Overflow', factionId: 'synthekon', color: '#ffffff', ready: true },
        });
        await overflow.waitFor((message) => message.type === 'server:error' && message.message === 'Room is full');
      } finally {
        overflow.close();
      }

      host.sendJson({ type: 'match:start', seed });
      await Promise.all(clients.map((client) => client.waitFor((message) => message.type === 'match:start' && message.seed === seed)));

      clients.at(-1).sendJson({ type: 'match:input', tick: seed, input: { command: 'move', ids: [1], x: seed % 9, z: 4 } });
      await host.waitFor((message) => message.type === 'match:input' && message.tick === seed);

      host.sendJson({ type: 'match:state', tick: seed + 1, state: { sentAt: Date.now(), resources: { metal: seed } } });
      await Promise.all(clients.slice(1).map((client) => client.waitFor((message) => message.type === 'match:state' && message.tick === seed + 1)));

      clients.at(-1).close();
      await host.waitFor((message) => message.type === 'match:ai-takeover');
    } finally {
      for (const client of clients) {
        client.close();
      }
    }
  }
}

async function testBrowserReleaseProbe() {
  await rm(chromeProfile, { recursive: true, force: true });
  const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5176'], {
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
    await waitForHttp(viteUrl, 25000, () => viteOutput);
    chrome = spawn(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--window-size=1440,860',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${chromeProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
        viteUrl,
      ],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );

    await waitForHttp(`http://127.0.0.1:${cdpPort}/json`, 25000, () => viteOutput);
    const page = await getPage();
    const cdp = await connectCdp(page.webSocketDebuggerUrl);
    await delay(2000);
    const ready = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const started = performance.now();
          function check() {
            if (window.atStrategyGame?.runV10AcceptanceProbe) {
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
    if (!ready.result?.value) {
      throw new Error('v1 acceptance probe was not exposed by the browser app');
    }

    const probe = await cdp.send('Runtime.evaluate', {
      expression: 'window.atStrategyGame.runV10AcceptanceProbe()',
      awaitPromise: true,
      returnByValue: true,
    });
    if (probe.exceptionDetails) {
      console.error(JSON.stringify(probe.exceptionDetails, null, 2));
      throw new Error('v1 acceptance probe threw in the browser');
    }
    const value = probe.result?.value;
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    cdp.close();

    if (!value?.passed) {
      console.error(JSON.stringify(value ?? probe, null, 2));
      throw new Error('v1 acceptance probe failed');
    }

    console.log(JSON.stringify(value, null, 2));
    console.log(`Acceptance screenshot: ${screenshotPath}`);
  } finally {
    chrome?.kill();
    vite.kill();
  }
}

function openWs(url) {
  const socket = new WebSocket(url);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve({
        sendJson(payload) {
          socket.send(JSON.stringify(payload));
        },
        waitFor(predicate, timeoutMs = 8000) {
          const existing = messages.find(predicate);
          if (existing) {
            return Promise.resolve(existing);
          }
          return new Promise((innerResolve, innerReject) => {
            const waiter = {
              predicate,
              resolve: innerResolve,
              timer: setTimeout(() => {
                waiters.splice(waiters.indexOf(waiter), 1);
                innerReject(new Error('Timed out waiting for WebSocket message'));
              }, timeoutMs),
            };
            waiters.push(waiter);
          });
        },
        close() {
          socket.close();
        },
      });
    }, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
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

function assert(name, condition) {
  if (!condition) {
    throw new Error(`Smoke assertion failed: ${name}`);
  }
}

async function waitForHttp(url, timeoutMs, getOutput) {
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
  throw new Error(`Timed out waiting for ${url}\n${getOutput()}`);
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
        }, 300000);
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
