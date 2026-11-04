// Validation for every payload that crosses the IPC boundary from the renderer.
import type {
  HitRect,
  IslandSettings,
  MediaAction,
  MediaCommand,
  SettingsAction,
  TimerAction,
  VolumeCommand,
} from '../../src/shared/types';

const MEDIA_COMMANDS: readonly string[] = ['toggle', 'play', 'pause', 'next', 'prev'];
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 64;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function parseMediaCommand(v: unknown): MediaCommand | null {
  return typeof v === 'string' && MEDIA_COMMANDS.includes(v) ? (v as MediaCommand) : null;
}

const SETTINGS_ACTIONS: readonly string[] = ['open-log', 'open-repo', 'clear-recent-apps', 'quit'];
export const IDLE_HIDE_CHOICES: readonly number[] = [5, 10, 30, 60];

export function parseSettingsAction(v: unknown): SettingsAction | null {
  return typeof v === 'string' && SETTINGS_ACTIONS.includes(v) ? (v as SettingsAction) : null;
}

/** Keeps only known settings with valid values; anything else in the patch is dropped. */
export function parseSettingsPatch(v: unknown): Partial<IslandSettings> | null {
  if (!isObj(v)) return null;
  const patch: Partial<IslandSettings> = {};
  if (isNum(v.offsetX, -800, 800)) patch.offsetX = Math.round(v.offsetX);
  if (isNum(v.offsetY, 0, 40)) patch.offsetY = Math.round(v.offsetY);
  if (typeof v.idleHideSeconds === 'number' && IDLE_HIDE_CHOICES.includes(v.idleHideSeconds)) patch.idleHideSeconds = v.idleHideSeconds;
  for (const key of ['openAtLogin', 'showScreenshots', 'hideWhenIdle', 'autoHideFullscreen'] as const) {
    if (typeof v[key] === 'boolean') patch[key] = v[key];
  }
  return patch;
}

export function parseMediaAction(v: unknown): MediaAction | null {
  if (!isObj(v)) return null;
  if (v.type === 'open') return { type: 'open' };
  if (v.type === 'seek' && isNum(v.positionMs, 0, MAX_TIMER_MS)) return { type: 'seek', positionMs: Math.round(v.positionMs) };
  // App ids are exe names or AppUserModelIDs; keep them to one safe line for the helper.
  if (v.type === 'select' && typeof v.app === 'string' && /^[\w.!\-; ]{1,200}$/.test(v.app)) return { type: 'select', app: v.app };
  return null;
}

export function parseVolumeCommand(v: unknown): VolumeCommand | null {
  if (!isObj(v)) return null;
  if (v.type === 'toggle-mute') return { type: 'toggle-mute' };
  if (v.type === 'set' && isNum(v.level, 0, 100)) return { type: 'set', level: Math.round(v.level) };
  return null;
}

export function parseHitRect(v: unknown): HitRect | null {
  if (!isObj(v)) return null;
  const { x, y, width, height } = v;
  if (!isNum(x, -10_000, 10_000) || !isNum(y, -10_000, 10_000)) return null;
  if (!isNum(width, 0, 10_000) || !isNum(height, 0, 10_000)) return null;
  return { x, y, width, height, passive: v.passive === true };
}

export function parseTimerAction(v: unknown): TimerAction | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'start':
      if (!isNum(v.durationMs, 1000, MAX_TIMER_MS)) return null;
      return {
        type: 'start',
        durationMs: v.durationMs,
        label: typeof v.label === 'string' ? v.label.slice(0, 40) : undefined,
      };
    case 'add':
      return isId(v.id) && isNum(v.ms, -MAX_TIMER_MS, MAX_TIMER_MS) ? { type: 'add', id: v.id, ms: v.ms } : null;
    case 'pause':
    case 'resume':
    case 'cancel':
    case 'dismiss':
    case 'restart':
      return isId(v.id) ? { type: v.type, id: v.id } : null;
    default:
      return null;
  }
}
