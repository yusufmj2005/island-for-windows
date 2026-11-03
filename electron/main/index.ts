import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  Tray,
} from 'electron';
import path from 'node:path';
import type { HitRect, IslandSnapshot, MediaState, PowerState, PrivacyState, VolumeState } from '../../src/shared/types';
import { installFileLog } from './log';
import { RecentAppsService } from './RecentAppsService';
import { ScreenshotService } from './ScreenshotService';
import { Store } from './Store';
import { TimerService } from './TimerService';
import { WindowsHelper } from './WindowsHelper';
import { MediaService } from './media/MediaService';
import { parseHitRect, parseMediaAction, parseMediaCommand, parseTimerAction, parseVolumeCommand } from './validate';

// The window is a fixed transparent canvas big enough for the largest island state.
// The island morphs inside it; the window itself never resizes.
const WIN_WIDTH = 460;
const WIN_HEIGHT = 260;
/** How often the main process checks whether the cursor is over the island. */
const POINTER_POLL_MS = 40;
/** How often the island re-asserts that it sits above other always-on-top windows. */
const RAISE_EVERY_MS = 3000;
/** Hides or restores the island instantly, e.g. before screen sharing. The first free one wins. */
const HIDE_SHORTCUTS = ['Control+Alt+Space', 'Control+Alt+I', 'Control+Shift+Alt+H'];
/** Fullscreen must hold this long before the island hides or returns, to avoid flicker while switching apps. */
const FULLSCREEN_DEBOUNCE_MS = 400;

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let store: Store;
let timers: TimerService;
let recentApps: RecentAppsService;
let media: MediaService;

let hitRect: HitRect | null = null;
let pointerInside = false;
let capturingMouse = false;
let power: PowerState | null = null;
let volume: VolumeState | null = null;
let privacy: PrivacyState = { mic: [], camera: [] };
let helper: WindowsHelper;
const screenshots = new ScreenshotService();
let manuallyHidden = false;
let fullscreenInFront = false;
let hideShortcut: string | undefined;
let tray: Tray | null = null;

/** Shows or hides the window. Hiding never stops timers or the media helper. */
function applyVisibility() {
  if (!win) return;
  const hide = manuallyHidden || (fullscreenInFront && store.get().settings.autoHideFullscreen);
  if (hide && win.isVisible()) {
    setPointerInside(false);
    win.hide();
  } else if (!hide && !win.isVisible()) {
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
  }
}

function toggleHidden() {
  manuallyHidden = !manuallyHidden;
  applyVisibility();
}

function snapshot(): IslandSnapshot {
  return {
    media: withAppNames(media.getState()),
    timers: timers.getTimers(),
    privacy,
    volume,
    power,
    hideWhenIdle: store.get().settings.hideWhenIdle,
  };
}

/** Adds readable app names ("Spotify", "Firefox") to the media state for the player. */
function withAppNames(state: MediaState): MediaState {
  const name = (app: string) => recentApps.nameForMediaApp(app) ?? appLabel(app);
  const sessions = Array.isArray(state.sessions) ? state.sessions : state.sessions ? [state.sessions] : [];
  return {
    ...state,
    appName: state.app ? name(state.app) : undefined,
    sessions: sessions.map((s) => ({ ...s, name: name(s.app) })),
  };
}

/** "Spotify.exe" -> "Spotify"; opaque ids stay as they are. */
const appLabel = (app: string) => app.replace(/\.exe$/i, '').split('!')[0];

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('island:snapshot', snapshot());
}

function positionWindow() {
  if (!win) return;
  const display = screen.getPrimaryDisplay();
  const { offsetX, offsetY } = store.get().settings;
  win.setBounds({
    x: Math.round(display.workArea.x + (display.workArea.width - WIN_WIDTH) / 2 + offsetX),
    y: display.bounds.y + offsetY,
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
  });
}

/**
 * Click-through: the window ignores the mouse except while the cursor is over the
 * island. The main process polls the cursor position itself rather than trusting
 * renderer enter/leave events, so a missed event can never leave the window stuck
 * blocking clicks to the apps underneath.
 *
 * Mouse forwarding ({ forward: true }) is deliberately not used: on Windows, once the
 * cursor has crossed the transparent area with forwarding on, Chromium stops
 * receiving clicks on the island. The polling above makes forwarding unnecessary.
 */
function setPointerInside(inside: boolean) {
  if (!win) return;
  // A passive rect (the hidden island's wake zone) only reports the cursor; clicks
  // still go to the apps underneath.
  const capture = inside && !hitRect?.passive;
  if (capture !== capturingMouse) {
    capturingMouse = capture;
    win.setIgnoreMouseEvents(!capture);
    // Another always-on-top window (game overlay, picture-in-picture, Task Manager...)
    // may have gone above the island since; without this its clicks would land there.
    if (capture) raiseToTop();
  }
  if (inside === pointerInside) return;
  pointerInside = inside;
  win.webContents.send('island:pointer', inside);
}

/** While one of Island's menus is open, don't raise the island over it. */
let menuOpen = false;
const menuOptions = () => ({ window: win ?? undefined, callback: () => (menuOpen = false) });
function popupMenu(menu: Electron.Menu) {
  menuOpen = true;
  menu.popup(menuOptions());
}

const WM_MOUSEACTIVATE = 0x0021;
const PRESS_MESSAGES: Record<number, 'left' | 'right' | 'middle'> = { 0x0201: 'left', 0x0204: 'right', 0x0207: 'middle' };

/**
 * The island never takes focus (focusable: false), so it doesn't steal it from the app
 * you're using. But when you click a window that isn't active, Windows first sends it
 * WM_MOUSEACTIVATE, and Chromium answers "don't activate, and discard this click"
 * (MA_NOACTIVATEANDEAT) for windows that can't be focused: the press is dropped and
 * only the release reaches the page, so nothing on the island responds.
 * Windows still tells us about each such click, so put the press back ourselves.
 */
function restoreSwallowedPresses(w: BrowserWindow) {
  w.hookWindowMessage(WM_MOUSEACTIVATE, (_wParam, lParam) => {
    if (w.isDestroyed() || w.isFocusable()) return; // focusable windows get their press normally
    // lParam: low word = hit-test code, high word = the mouse message that caused it.
    const button = PRESS_MESSAGES[lParam.readUInt16LE(2)];
    if (!button) return;
    const p = screen.getCursorScreenPoint();
    const b = w.getBounds();
    w.webContents.sendInputEvent({ type: 'mouseDown', x: p.x - b.x, y: p.y - b.y, button, clickCount: 1 });
  });
}

/** Puts the island back on top of the always-on-top layer, without taking focus. */
function raiseToTop() {
  if (!win || win.isDestroyed() || !win.isVisible() || menuOpen) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

function pollPointer() {
  if (!win || win.isDestroyed() || !win.isVisible() || !hitRect) {
    setPointerInside(false);
    return;
  }
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const x = p.x - b.x;
  const y = p.y - b.y;
  setPointerInside(x >= hitRect.x && x < hitRect.x + hitRect.width && y >= hitRect.y && y < hitRect.y + hitRect.height);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    // Clicking the island should not steal focus from the app you're using.
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  positionWindow();
  restoreSwallowedPresses(win);

  // Never navigate away or open new windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const devUrl = process.env.ISLAND_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));

  win.once('ready-to-show', () => {
    win?.showInactive();
    applyVisibility();
  });
  win.on('closed', () => {
    win = null;
  });
}

/** Folder holding the helper script and tray icons, in dev and when packaged. */
const resourceDir = () => (app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'));

/**
 * Tray icon in the notification area: always there, even while the island is hidden,
 * so the app can be shown, hidden or quit at any time.
 */
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(resourceDir(), 'tray.png')));
  tray.setToolTip('Island');
  tray.on('click', toggleHidden);
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu()));
}

function showMenu() {
  if (win) popupMenu(buildMenu());
}

function buildMenu() {
  const settings = store.get().settings;
  const nudge = (dx: number) => {
    store.updateSettings({ offsetX: store.get().settings.offsetX + dx });
    positionWindow();
  };
  return Menu.buildFromTemplate([
    {
      label: manuallyHidden ? 'Show island' : 'Hide island',
      accelerator: hideShortcut,
      registerAccelerator: false,
      click: toggleHidden,
    },
    { type: 'separator' },
    { label: 'Start 5 min timer', click: () => timers.apply({ type: 'start', durationMs: 5 * 60_000 }) },
    { type: 'separator' },
    {
      label: 'Position',
      submenu: [
        { label: 'Nudge left', click: () => nudge(-10) },
        { label: 'Nudge right', click: () => nudge(10) },
        {
          label: 'Lower by 4 px',
          click: () => {
            store.updateSettings({ offsetY: Math.min(40, settings.offsetY + 4) });
            positionWindow();
          },
        },
        {
          label: 'Reset position',
          click: () => {
            store.updateSettings({ offsetX: 0, offsetY: 0 });
            positionWindow();
          },
        },
      ],
    },
    {
      label: 'Show screenshot previews',
      type: 'checkbox',
      checked: settings.showScreenshots,
      click: (item) => store.updateSettings({ showScreenshots: item.checked }),
    },
    {
      label: 'Hide when idle (10 s)',
      type: 'checkbox',
      checked: settings.hideWhenIdle,
      click: (item) => {
        store.updateSettings({ hideWhenIdle: item.checked });
        broadcast();
      },
    },
    {
      label: 'Hide in fullscreen apps',
      type: 'checkbox',
      checked: settings.autoHideFullscreen,
      click: (item) => {
        store.updateSettings({ autoHideFullscreen: item.checked });
        applyVisibility();
      },
    },
    {
      label: 'Open at login',
      type: 'checkbox',
      checked: settings.openAtLogin,
      click: (item) => {
        store.updateSettings({ openAtLogin: item.checked });
        // Unpackaged, Electron must be told which app to run, like the shortcuts do.
        app.setLoginItemSettings(
          app.isPackaged
            ? { openAtLogin: item.checked }
            : { openAtLogin: item.checked, path: process.execPath, args: [app.getAppPath()] },
        );
      },
    },
    { type: 'separator' },
    { label: 'Open diagnostics log', click: () => shell.openPath(logFile()) },
    { label: 'Quit Island', click: () => app.quit() },
  ]);
}

function registerIpc() {
  ipcMain.handle('island:get-snapshot', () => snapshot());
  ipcMain.on('island:hit-rect', (_e, raw) => {
    hitRect = raw === null ? null : parseHitRect(raw);
    pollPointer();
  });
  ipcMain.on('island:media-action', (_e, raw) => {
    const action = parseMediaAction(raw);
    if (action) helper.mediaAction(action);
  });
  ipcMain.on('island:media', (_e, raw) => {
    const cmd = parseMediaCommand(raw);
    if (cmd) media.command(cmd);
  });
  ipcMain.on('island:timer', (_e, raw) => {
    const action = parseTimerAction(raw);
    if (action) timers.apply(action);
  });
  ipcMain.handle('island:screenshot-save', (_e, id) => typeof id === 'string' && screenshots.save(id));
  ipcMain.on('island:screenshot-reveal', () => screenshots.reveal());
  ipcMain.on('island:screenshot-drag', (e, id) => {
    if (typeof id === 'string') screenshots.drag(id, e.sender);
  });
  ipcMain.on('island:volume', (_e, raw) => {
    const cmd = parseVolumeCommand(raw);
    if (cmd) helper.volume(cmd);
  });
  ipcMain.handle('island:get-recent-apps', () => recentApps.list());
  // Only IDs from the list are accepted, so the renderer can never launch an arbitrary path.
  ipcMain.on('island:open-app', (_e, raw) => {
    if (typeof raw === 'string' && raw.length < 1024) recentApps.open(raw);
  });
  ipcMain.on('island:app-menu', (_e, raw) => {
    const a = typeof raw === 'string' ? recentApps.find(raw) : undefined;
    if (!a || !win) return;
    menuOpen = true;
    Menu.buildFromTemplate([
      { label: `Open ${a.name}`, click: () => recentApps.open(a.id) },
      { type: 'separator' },
      { label: a.pinnedAt != null ? 'Unpin' : 'Pin to front', click: () => recentApps.togglePin(a.id) },
      { label: 'Remove from list', click: () => recentApps.remove(a.id) },
    ]).popup(menuOptions());
  });
  ipcMain.on('island:menu', () => showMenu());
  ipcMain.on('island:quit', () => app.quit());
}

const logFile = () => path.join(app.getPath('userData'), 'island.log');

// Matches build.appId, so Windows (taskbar, notifications) identifies the app as Island.
app.setAppUserModelId('com.yusuf.island');

app.whenReady().then(() => {
  installFileLog(logFile());
  console.log(`[island] starting v${app.getVersion()} (Electron ${process.versions.electron})`);
  store = new Store(path.join(app.getPath('userData'), 'island-state.json'));
  const saved = store.get();

  timers = new TimerService(saved.timers);
  timers.on('change', () => {
    store.update({ timers: timers.getTimers() });
    broadcast();
  });
  timers.on('alert', (alert) => win?.webContents.send('island:alert', alert));

  helper = new WindowsHelper(path.join(resourceDir(), 'windows-helper.ps1'));
  let fullscreenTimer: NodeJS.Timeout | undefined;
  helper.on('fullscreen', (value) => {
    clearTimeout(fullscreenTimer);
    fullscreenTimer = setTimeout(() => {
      if (value === fullscreenInFront) return;
      console.log(`[island] fullscreen app in front: ${value}`);
      fullscreenInFront = value;
      applyVisibility();
    }, FULLSCREEN_DEBOUNCE_MS);
  });
  media = new MediaService(helper);
  media.on('change', broadcast);

  recentApps = new RecentAppsService(saved.recentApps, process.execPath);
  helper.on('start-apps', (apps) => recentApps.setStartApps(apps));
  helper.on('open-apps', (apps) => recentApps.seed(apps));
  helper.on('foreground', (seen) => recentApps.touch(seen));
  helper.on('privacy', ({ mic, camera }) => {
    const names = (users: typeof mic) => [...new Set(users.map((u) => recentApps.displayName(u)))];
    privacy = { mic: names(mic), camera: names(camera) };
    console.log(`[island] mic: ${privacy.mic.join(', ') || '-'}  camera: ${privacy.camera.join(', ') || '-'}`);
    broadcast();
  });
  // A screenshot writes several clipboard formats in a burst; look once it settles.
  let clipboardTimer: NodeJS.Timeout | undefined;
  // No window to bring forward (e.g. Spotify closed to the tray): start or reopen the app.
  helper.on('media-focus', ({ app, ok }) => {
    if (!ok && !recentApps.launchMediaApp(app)) console.warn(`[media] can't open ${app}`);
  });
  helper.on('clipboard', () => {
    clearTimeout(clipboardTimer);
    clipboardTimer = setTimeout(async () => {
      if (!store.get().settings.showScreenshots) return;
      const shot = await screenshots.check().catch(() => null);
      if (shot && win && !win.isDestroyed()) win.webContents.send('island:screenshot', shot);
    }, 250);
  });
  helper.on('volume', (state) => {
    volume = state;
    broadcast();
  });
  helper.on('power', (state) => {
    power = state;
    broadcast();
  });
  recentApps.on('change', async () => {
    store.update({ recentApps: recentApps.getStored() });
    const list = await recentApps.list();
    if (win && !win.isDestroyed()) win.webContents.send('island:recent-apps', list);
  });

  registerIpc();
  createWindow();
  createTray();
  media.start();

  hideShortcut = HIDE_SHORTCUTS.find((s) => globalShortcut.register(s, toggleHidden));
  if (hideShortcut) console.log(`[island] hide shortcut: ${hideShortcut}`);
  else console.warn('[island] no hide shortcut available; all candidates are taken');

  setInterval(pollPointer, POINTER_POLL_MS);
  // Keeps the island visible above other on-top windows, not just clickable on hover.
  setInterval(raiseToTop, RAISE_EVERY_MS);
  screen.on('display-metrics-changed', positionWindow);
  screen.on('display-added', positionWindow);
  screen.on('display-removed', positionWindow);
  powerMonitor.on('resume', () => timers.reconcile(true));
});

app.on('second-instance', () => {
  manuallyHidden = false;
  applyVisibility();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => {
  media?.stop();
  timers?.dispose();
  store?.flush();
});
app.on('window-all-closed', () => app.quit());
