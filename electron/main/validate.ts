// Validation for every payload that crosses the IPC boundary from the renderer.
import type { HitRect, MediaCommand, TimerAction } from '../../src/shared/types';

const MEDIA_COMMANDS: readonly string[] = ['toggle', 'play', 'pause', 'next', 'prev'];
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 64;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function parseMediaCommand(v: unknown): MediaCommand | null {
  return typeof v === 'string' && MEDIA_COMMANDS.includes(v) ? (v as MediaCommand) : null;
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
