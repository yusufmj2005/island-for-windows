// Small JSON store in the user's app data folder for settings, timers and recent apps.
import fs from 'node:fs';
import path from 'node:path';
import type { IslandSettings, TimerState } from '../../src/shared/types';
import type { StoredRecentApp } from './RecentAppsService';

export type Settings = IslandSettings;

export interface StoredState {
  settings: Settings;
  timers: TimerState[];
  recentApps: StoredRecentApp[];
}

const DEFAULTS: StoredState = {
  settings: {
    offsetX: 0,
    offsetY: 0,
    openAtLogin: false,
    showScreenshots: true,
    hideWhenIdle: true,
    idleHideSeconds: 10,
    autoHideFullscreen: true,
  },
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
