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
  mediaAction: (action) => ipcRenderer.send('island:media-action', action),
  timer: (action) => ipcRenderer.send('island:timer', action),
  volume: (cmd) => ipcRenderer.send('island:volume', cmd),
  onScreenshot: (cb) => subscribe('island:screenshot', cb),
  saveScreenshot: (id) => ipcRenderer.invoke('island:screenshot-save', id),
  revealScreenshot: () => ipcRenderer.send('island:screenshot-reveal'),
  dragScreenshot: (id) => ipcRenderer.send('island:screenshot-drag', id),
  getRecentApps: () => ipcRenderer.invoke('island:get-recent-apps'),
  onRecentApps: (cb) => subscribe('island:recent-apps', cb),
  openApp: (id) => ipcRenderer.send('island:open-app', id),
  showAppMenu: (id) => ipcRenderer.send('island:app-menu', id),
  showMenu: () => ipcRenderer.send('island:menu'),
  quit: () => ipcRenderer.send('island:quit'),
  openSettings: () => ipcRenderer.send('island:open-settings'),
  getSettingsInfo: () => ipcRenderer.invoke('island:get-settings-info'),
  onSettingsInfo: (cb) => subscribe('island:settings-info', cb),
  updateSettings: (patch) => ipcRenderer.send('island:update-settings', patch),
  settingsAction: (action) => ipcRenderer.send('island:settings-action', action),
};

contextBridge.exposeInMainWorld('island', api);
