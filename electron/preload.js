import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('atStrategy', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
