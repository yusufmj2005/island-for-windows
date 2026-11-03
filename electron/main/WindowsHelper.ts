// Runs resources/windows-helper.ps1 in Windows PowerShell 5.1. One process serves the
// media session API (GSMTC, as the app's MediaProvider), fullscreen detection and the
// app-usage signals behind "Recent apps".
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import type { MediaCommand, PowerState, VolumeCommand, VolumeState } from '../../src/shared/types';
import type { MediaProvider, MediaProviderEvents } from './media/MediaProvider';

const MAX_BACKOFF_MS = 30_000;

/** The app behind a window, as the helper sees it. */
export interface SeenApp {
  path: string | null;
  aumid: string | null;
  name: string;
}

/** An app using the microphone or camera. */
export interface DeviceUser {
  path: string | null;
  /** Package family name, for Store apps. */
  family: string | null;
  name: string | null;
}

/** A Start menu entry: its display name and the ID Windows launches it by. */
export interface StartApp {
  name: string;
  id: string;
  /** The exe the entry points at, when its ID is a path. */
  path: string | null;
}

type HelperEvents = MediaProviderEvents & {
  /** A fullscreen app or game is in front on the primary display. */
  fullscreen: [boolean];
  'start-apps': [StartApp[]];
  /** Apps with open windows at startup, front-most first. */
  'open-apps': [SeenApp[]];
  /** The app in front changed. */
  foreground: [SeenApp];
  /** Battery presence, level or charging state changed. */
  power: [PowerState];
  /** System volume or mute changed (from Island or anywhere else). */
  volume: [VolumeState];
  /** Apps using the microphone / camera changed. */
  privacy: [{ mic: DeviceUser[]; camera: DeviceUser[] }];
  /** Something new was put on the clipboard. */
  clipboard: [];
};

const toDeviceUsers = (v: unknown): DeviceUser[] =>
  Array.isArray(v)
    ? v.flatMap((u: Record<string, unknown>) => {
        const user = { path: str(u?.path), family: str(u?.family), name: str(u?.name) };
        return user.path || user.family ? [user] : [];
      })
    : [];

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
const toSeen = (v: unknown): SeenApp | null => {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = str(o.name);
  return name ? { path: str(o.path), aumid: str(o.aumid), name } : null;
};

export class WindowsHelper extends EventEmitter<HelperEvents> implements MediaProvider {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stopped = true;
  private backoffMs = 1000;
  private restartHandle: NodeJS.Timeout | null = null;

  constructor(private scriptPath: string) {
    super();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.spawnHelper();
  }

  stop() {
    this.stopped = true;
    if (this.restartHandle) clearTimeout(this.restartHandle);
    if (this.child) {
      this.child.stdin.end('quit\n');
      const c = this.child;
      setTimeout(() => c.kill(), 1500);
      this.child = null;
    }
  }

  send(cmd: MediaCommand) {
    this.child?.stdin.write(`${cmd}\n`);
  }

  volume(cmd: VolumeCommand) {
    this.child?.stdin.write(cmd.type === 'set' ? `vol-set ${cmd.level}\n` : 'mute-toggle\n');
  }

  private spawnHelper() {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath],
      { windowsHide: true },
    );
    this.child = child;

    readline.createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (d) => console.error('[windows-helper]', String(d).trim()));
    child.on('error', (err) => console.error('[windows-helper] spawn failed', err));
    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      if (this.stopped) return;
      console.warn(`[windows-helper] exited (${code}); restarting in ${this.backoffMs} ms`);
      this.emit('state', { active: false });
      this.emit('fullscreen', false);
      // Don't leave the mic / camera dot on from before the crash; the restart re-reports it.
      this.emit('privacy', { mic: [], camera: [] });
      this.restartHandle = setTimeout(() => this.spawnHelper(), this.backoffMs);
      this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
    });
  }

  private handleLine(line: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        console.log('[windows-helper] ready');
        this.backoffMs = 1000;
        break;
      case 'media': {
        const { type: _type, ...state } = msg;
        this.emit('state', state as MediaProviderEvents['state'][0]);
        break;
      }
      case 'art':
        if (typeof msg.trackKey === 'string') {
          this.emit('art', {
            trackKey: msg.trackKey,
            dataUrl: typeof msg.dataUrl === 'string' && msg.dataUrl.startsWith('data:image/') ? msg.dataUrl : null,
          });
        }
        break;
      case 'fullscreen':
        this.emit('fullscreen', msg.value === true);
        break;
      case 'start-apps':
        if (Array.isArray(msg.apps)) {
          const apps = msg.apps.flatMap((a: Record<string, unknown>) => {
            const name = str(a?.name);
            const id = str(a?.id);
            return name && id ? [{ name, id, path: str(a.path) }] : [];
          });
          this.emit('start-apps', apps);
        }
        break;
      case 'open-apps':
        if (Array.isArray(msg.apps)) this.emit('open-apps', msg.apps.map(toSeen).filter((a): a is SeenApp => !!a));
        break;
      case 'clipboard':
        this.emit('clipboard');
        break;
      case 'privacy':
        this.emit('privacy', { mic: toDeviceUsers(msg.mic), camera: toDeviceUsers(msg.camera) });
        break;
      case 'volume':
        if (typeof msg.level === 'number') {
          this.emit('volume', { level: Math.max(0, Math.min(100, Math.round(msg.level))), muted: msg.muted === true });
        }
        break;
      case 'power':
        this.emit('power', {
          hasBattery: msg.hasBattery === true,
          percent: typeof msg.percent === 'number' ? Math.max(0, Math.min(100, msg.percent)) : 0,
          pluggedIn: msg.pluggedIn === true,
          charging: msg.charging === true,
        });
        break;
      case 'foreground': {
        const app = toSeen(msg.app);
        if (app) this.emit('foreground', app);
        break;
      }
      case 'error':
        console.warn('[windows-helper]', msg.message);
        break;
    }
  }
}
