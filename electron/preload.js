import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('atStrategy', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  startLanHost: (options) => ipcRenderer.invoke('lan-host:start', options),
  stopLanHost: () => ipcRenderer.invoke('lan-host:stop'),
  listSaves: () => ipcRenderer.invoke('save:list'),
  writeSave: (payload) => ipcRenderer.invoke('save:write', payload),
  readSave: (filename) => ipcRenderer.invoke('save:read', filename),
  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
});
