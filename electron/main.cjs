const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const isDev = !app.isPackaged;
const isSmoke = process.env.AT_STRATEGY_ELECTRON_SMOKE === '1';
let lanServer = null;
let lanServerInfo = null;
let serverFactory = null;

async function createWindow() {
  await markSmoke('main-start');
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: !isSmoke,
    title: 'AT Strategy',
    backgroundColor: '#071018',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await window.loadURL('http://127.0.0.1:5173');
    if (!isSmoke) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
    return;
  }

  if (isSmoke) {
    window.webContents.once('did-finish-load', async () => {
      await markSmoke('loaded');
      setTimeout(() => app.quit(), 250);
    });
    window.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`AT Strategy packaged smoke failed: ${code} ${description}`);
      app.exit(1);
    });
  }
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow).catch(async (error) => {
  await markSmoke(`error ${error.message}`);
  app.exit(1);
});

ipcMain.handle('lan-host:start', async (_event, options = {}) => {
  if (!lanServer) {
    serverFactory ||= (await import('../server/at-strategy-server.mjs')).createAtStrategyServer;
    lanServer = serverFactory({ port: Number(options.port || 8787), host: '0.0.0.0' });
    lanServerInfo = await lanServer.listen();
  }
  return lanServerInfo;
});

ipcMain.handle('lan-host:stop', async () => {
  if (lanServer) {
    await lanServer.close();
    lanServer = null;
    lanServerInfo = null;
  }
  return { stopped: true };
});

ipcMain.handle('save:list', async () => {
  const dir = await ensureSaveDir();
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort().reverse();
  return files;
});

ipcMain.handle('save:write', async (_event, { name = 'autosave', data } = {}) => {
  const dir = await ensureSaveDir();
  const safeName = String(name).replace(/[^a-z0-9._-]/gi, '-').slice(0, 48) || 'save';
  const filename = `${safeName}.json`;
  await writeFile(path.join(dir, filename), `${JSON.stringify(data, null, 2)}\n`);
  return { filename };
});

ipcMain.handle('save:read', async (_event, filename) => {
  const dir = await ensureSaveDir();
  return JSON.parse(await readFile(path.join(dir, path.basename(filename)), 'utf8'));
});

ipcMain.handle('settings:read', async () => {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
});

ipcMain.handle('settings:write', async (_event, settings = {}) => {
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function ensureSaveDir() {
  const dir = path.join(app.getPath('userData'), 'saves');
  await mkdir(dir, { recursive: true });
  return dir;
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function markSmoke(stage) {
  if (process.env.AT_STRATEGY_SMOKE_FILE) {
    await writeFile(process.env.AT_STRATEGY_SMOKE_FILE, `${stage} ${new Date().toISOString()}\n`, { flag: 'a' });
  }
}
