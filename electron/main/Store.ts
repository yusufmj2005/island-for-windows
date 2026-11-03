// Small JSON store in the user's app data folder for settings, timers and recent apps.
import fs from 'node:fs';
import path from 'node:path';
import type { TimerState } from '../../src/shared/types';
import type { StoredRecentApp } from './RecentAppsService';

export interface Settings {
  /** Horizontal nudge from the screen centre, for off-centre webcams. */
  offsetX: number;
  /** Distance of the window from the top of the screen. */
  offsetY: number;
  openAtLogin: boolean;
  /** Fade the island away after 10 s with nothing happening; it returns on activity or hover. */
  hideWhenIdle: boolean;
  /** Hide while a fullscreen app or game is in front. */
  autoHideFullscreen: boolean;
}

export interface StoredState {
  settings: Settings;
  timers: TimerState[];
  recentApps: StoredRecentApp[];
}

const DEFAULTS: StoredState = {
  settings: { offsetX: 0, offsetY: 0, openAtLogin: false, hideWhenIdle: true, autoHideFullscreen: true },
  timers: [],
  recentApps: [],
};

export class Store {
  private state: StoredState;
  private writeHandle: NodeJS.Timeout | null = null;

  constructor(private file: string) {
    this.state = this.load();
  }

  get(): StoredState {
    return this.state;
  }

  update(patch: Partial<StoredState>) {
    this.state = { ...this.state, ...patch };
    this.scheduleWrite();
  }

  updateSettings(patch: Partial<Settings>) {
    this.update({ settings: { ...this.state.settings, ...patch } });
  }

  /** Writes pending changes immediately (used on quit). */
  flush() {
    if (!this.writeHandle) return;
    clearTimeout(this.writeHandle);
    this.writeHandle = null;
    this.write();
  }

  private load(): StoredState {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        settings: { ...DEFAULTS.settings, ...raw.settings },
        timers: Array.isArray(raw.timers) ? raw.timers : [],
        recentApps: Array.isArray(raw.recentApps) ? raw.recentApps : [],
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  private scheduleWrite() {
    if (this.writeHandle) return;
    this.writeHandle = setTimeout(() => {
      this.writeHandle = null;
      this.write();
    }, 300);
  }

  private write() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] write failed', err);
    }
  }
}
