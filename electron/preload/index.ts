import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IslandApi } from '../../src/shared/types';

function subscribe<T>(channel: string, cb: (value: T) => void) {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: IslandApi = {
  getSnapshot: () => ipcRenderer.invoke('island:get-snapshot'),
  onSnapshot: (cb) => subscribe('island:snapshot', cb),
  onPointer: (cb) => subscribe('island:pointer', cb),
  onAlert: (cb) => subscribe('island:alert', cb),
  setHitRect: (rect) => ipcRenderer.send('island:hit-rect', rect),
  media: (cmd) => ipcRenderer.send('island:media', cmd),
  timer: (action) => ipcRenderer.send('island:timer', action),
  volume: (cmd) => ipcRenderer.send('island:volume', cmd),
  getRecentApps: () => ipcRenderer.invoke('island:get-recent-apps'),
  onRecentApps: (cb) => subscribe('island:recent-apps', cb),
  openApp: (id) => ipcRenderer.send('island:open-app', id),
  showMenu: () => ipcRenderer.send('island:menu'),
  quit: () => ipcRenderer.send('island:quit'),
};

contextBridge.exposeInMainWorld('island', api);
