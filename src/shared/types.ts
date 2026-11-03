// Types shared by the Electron main process, the preload bridge and the renderer.

export type MediaCommand = 'toggle' | 'play' | 'pause' | 'next' | 'prev';

export interface MediaState {
  active: boolean;
  app?: string;
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

export interface IslandSnapshot {
  media: MediaState;
  timers: TimerState[];
  /** System volume of the default output device; null until reported or with no device. */
  volume: VolumeState | null;
  /** Null until Windows has reported it. */
  power: PowerState | null;
  /** Setting: fade the island away after 10 s with nothing happening. */
  hideWhenIdle: boolean;
}

/** An app in the island's "Recent apps" row. */
export interface RecentApp {
  id: string;
  name: string;
  /** Icon as a data URL, or null when Windows doesn't provide one. */
  icon: string | null;
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
  timer(action: TimerAction): void;
  volume(cmd: VolumeCommand): void;
  getRecentApps(): Promise<RecentApp[]>;
  onRecentApps(cb: (apps: RecentApp[]) => void): () => void;
  openApp(id: string): void;
  showMenu(): void;
  quit(): void;
}
