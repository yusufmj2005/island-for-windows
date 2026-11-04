// Types shared by the Electron main process, the preload bridge and the renderer.

export type MediaCommand = 'toggle' | 'play' | 'pause' | 'next' | 'prev';

/** One app with a media session, for the source picker. */
export interface MediaSource {
  /** The session's app id, e.g. "Spotify.exe" or "Chrome". */
  app: string;
  /** Readable name, e.g. "Spotify". */
  name: string;
  title: string;
  playing: boolean;
}

/** Player actions beyond the basic buttons. */
export type MediaAction =
  | { type: 'seek'; positionMs: number }
  | { type: 'select'; app: string }
  /** Bring the playing app's window to the front (or start it). */
  | { type: 'open' };

export interface MediaState {
  active: boolean;
  app?: string;
  /** Readable name of `app`. */
  appName?: string;
  /** The player accepts seeking (dragging the progress bar). */
  canSeek?: boolean;
  /** All apps with a media session; more than one shows the source picker. */
  sessions?: MediaSource[];
  title?: string;
  artist?: string;
  album?: string;
  playing?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  positionMs?: number;
  durationMs?: number;
  /** Wall-clock time (ms) at which positionMs was sampled by the player. */
  updatedAtMs?: number;
  trackKey?: string;
  artDataUrl?: string | null;
}

export interface TimerState {
  id: string;
  label: string;
  durationMs: number;
  /** Wall-clock end time while running, otherwise null. */
  endsAt: number | null;
  /** Remaining time while paused, otherwise null. */
  pausedRemaining: number | null;
  status: 'running' | 'paused' | 'completed';
  completedAt?: number;
}

export interface PowerState {
  /** False on desktops; nothing battery-related is shown then. */
  hasBattery: boolean;
  percent: number;
  pluggedIn: boolean;
  charging: boolean;
}

export interface VolumeState {
  /** 0-100. */
  level: number;
  muted: boolean;
}

export type VolumeCommand = { type: 'set'; level: number } | { type: 'toggle-mute' };

/** A screenshot (any image) that just landed on the clipboard. */
export interface ScreenshotPreview {
  id: string;
  /** Small PNG data URL for the island. */
  thumb: string;
  width: number;
  height: number;
}

/** Names of the apps using the microphone / camera right now. */
export interface PrivacyState {
  mic: string[];
  camera: string[];
}

export interface IslandSnapshot {
  media: MediaState;
  timers: TimerState[];
  privacy: PrivacyState;
  /** System volume of the default output device; null until reported or with no device. */
  volume: VolumeState | null;
  /** Null until Windows has reported it. */
  power: PowerState | null;
  /** Setting: fade the island away after a while with nothing happening. */
  hideWhenIdle: boolean;
  idleHideSeconds: number;
}

export interface IslandSettings {
  /** Horizontal nudge from the screen centre, for off-centre webcams. */
  offsetX: number;
  /** Distance of the window from the top of the screen. */
  offsetY: number;
  openAtLogin: boolean;
  /** Show a thumbnail when a screenshot (or any image) is copied to the clipboard. */
  showScreenshots: boolean;
  /** Fade the island away with nothing happening; it returns on activity or hover. */
  hideWhenIdle: boolean;
  /** How long "nothing happening" lasts before it fades. */
  idleHideSeconds: number;
  /** Hide while a fullscreen app or game is in front. */
  autoHideFullscreen: boolean;
}

/** What the settings window shows. */
export interface SettingsInfo {
  settings: IslandSettings;
  version: string;
  /** The hide / show shortcut in use, or null if every candidate was taken. */
  hideShortcut: string | null;
}

export type SettingsAction = 'open-log' | 'open-repo' | 'clear-recent-apps' | 'quit';

/** An app in the island's "Recent apps" row. */
export interface RecentApp {
  id: string;
  name: string;
  /** Icon as a data URL, or null when Windows doesn't provide one. */
  icon: string | null;
  pinned: boolean;
}

export interface IslandAlert {
  id: string;
  title: string;
  subtitle?: string;
}

export type TimerAction =
  | { type: 'start'; durationMs: number; label?: string }
  | { type: 'pause'; id: string }
  | { type: 'resume'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'add'; id: string; ms: number }
  | { type: 'dismiss'; id: string }
  | { type: 'restart'; id: string };

export interface HitRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Only detect the cursor here (the hidden island's wake zone); never capture clicks. */
  passive?: boolean;
}

export interface IslandApi {
  getSnapshot(): Promise<IslandSnapshot>;
  onSnapshot(cb: (s: IslandSnapshot) => void): () => void;
  onPointer(cb: (inside: boolean) => void): () => void;
  onAlert(cb: (a: IslandAlert) => void): () => void;
  setHitRect(rect: HitRect | null): void;
  media(cmd: MediaCommand): void;
  mediaAction(action: MediaAction): void;
  timer(action: TimerAction): void;
  volume(cmd: VolumeCommand): void;
  onScreenshot(cb: (shot: ScreenshotPreview) => void): () => void;
  saveScreenshot(id: string): Promise<boolean>;
  revealScreenshot(): void;
  dragScreenshot(id: string): void;
  getRecentApps(): Promise<RecentApp[]>;
  onRecentApps(cb: (apps: RecentApp[]) => void): () => void;
  openApp(id: string): void;
  /** Right-click menu for a recent app: pin / unpin, remove. */
  showAppMenu(id: string): void;
  showMenu(): void;
  quit(): void;
  openSettings(): void;
  getSettingsInfo(): Promise<SettingsInfo>;
  onSettingsInfo(cb: (info: SettingsInfo) => void): () => void;
  updateSettings(patch: Partial<IslandSettings>): void;
  settingsAction(action: SettingsAction): void;
}
