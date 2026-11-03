// Turns raw state into ranked activities and decides which view and size the island shows.
import type { IslandSnapshot, MediaState, TimerState } from './shared/types';

export type Activity =
  | { kind: 'media'; id: 'media'; priority: number; media: MediaState }
  | { kind: 'timer'; id: string; priority: number; timer: TimerState };

/** Highest priority first. Finished timers outrank everything; then running timers, then music. */
export function rankActivities(s: IslandSnapshot, mediaVisible: boolean): Activity[] {
  const list: Activity[] = [];
  for (const timer of s.timers) {
    const priority = timer.status === 'completed' ? 90 : timer.status === 'running' ? 75 : 45;
    list.push({ kind: 'timer', id: timer.id, priority, timer });
  }
  if (s.media.active && mediaVisible) {
    list.push({ kind: 'media', id: 'media', priority: s.media.playing ? 65 : 30, media: s.media });
  }
  // Stable sort: among equal priorities, the first timer started stays in front.
  return list.sort((a, b) => b.priority - a.priority);
}

export type View =
  | 'idle'
  | 'idle-hover'
  | 'compact-media'
  | 'compact-timer'
  | 'alert'
  | 'expanded-media'
  | 'expanded-timer'
  | 'launcher'
  | 'launcher-media'
  | 'timer-setup'
  | 'battery'
  | 'volume';

export interface Shape {
  width: number;
  height: number;
  radius: number;
}

// Starting values from the design review; tune by eye.
export const SHAPES: Record<View, Shape> = {
  idle: { width: 126, height: 34, radius: 17 },
  'idle-hover': { width: 140, height: 37, radius: 18.5 },
  'compact-media': { width: 252, height: 36, radius: 18 },
  'compact-timer': { width: 216, height: 36, radius: 18 },
  alert: { width: 352, height: 68, radius: 34 },
  'expanded-media': { width: 384, height: 172, radius: 38 },
  'expanded-timer': { width: 372, height: 92, radius: 46 },
  launcher: { width: 384, height: 96, radius: 34 },
  'launcher-media': { width: 384, height: 152, radius: 36 },
  'timer-setup': { width: 384, height: 148, radius: 38 },
  battery: { width: 300, height: 36, radius: 18 },
  volume: { width: 300, height: 36, radius: 18 },
};

/** Height of the secondary bubble, which matches the compact pill. */
export const BUBBLE_SIZE = 36;

export const TIMER_COLOR = '#ff9f0a';

export function remainingMs(t: TimerState, now: number) {
  if (t.status === 'running' && t.endsAt != null) return Math.max(0, t.endsAt - now);
  if (t.status === 'paused' && t.pausedRemaining != null) return t.pausedRemaining;
  return 0;
}

/** Media position, extrapolated from the player's last sample while playing. */
export function mediaPositionMs(m: MediaState, now: number) {
  const base = m.positionMs ?? 0;
  const extra = m.playing && m.updatedAtMs ? Math.max(0, now - m.updatedAtMs) : 0;
  return Math.min(m.durationMs ?? Infinity, base + extra);
}
