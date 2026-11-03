// Owns timer state. All times are wall-clock timestamps, so nothing drifts and
// timers stay correct across sleep (see reconcile()).
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { IslandAlert, TimerAction, TimerState } from '../../src/shared/types';

/** Completed timers disappear on their own after this long. */
const COMPLETED_TTL_MS = 60_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export interface TimerEvents {
  change: [];
  alert: [IslandAlert];
}

export class TimerService extends EventEmitter<TimerEvents> {
  private timers: TimerState[];
  private wake: NodeJS.Timeout | null = null;

  constructor(initial: TimerState[]) {
    super();
    this.timers = initial;
    // Timers that ended while the app was closed complete quietly.
    this.reconcile(false);
  }

  getTimers() {
    return this.timers;
  }

  apply(action: TimerAction) {
    const now = Date.now();
    if (action.type === 'start') {
      this.timers.push(this.newTimer(action.label ?? 'Timer', action.durationMs, now));
    } else {
      const t = this.timers.find((x) => x.id === action.id);
      if (!t) return;
      switch (action.type) {
        case 'pause':
          if (t.status === 'running' && t.endsAt) {
            t.pausedRemaining = Math.max(0, t.endsAt - now);
            t.endsAt = null;
            t.status = 'paused';
          }
          break;
        case 'resume':
          if (t.status === 'paused' && t.pausedRemaining != null) {
            t.endsAt = now + t.pausedRemaining;
            t.pausedRemaining = null;
            t.status = 'running';
          }
          break;
        case 'add':
          if (t.status === 'running' && t.endsAt) t.endsAt = Math.max(now + 1000, t.endsAt + action.ms);
          else if (t.status === 'paused' && t.pausedRemaining != null)
            t.pausedRemaining = Math.max(1000, t.pausedRemaining + action.ms);
          t.durationMs = Math.max(1000, t.durationMs + action.ms);
          break;
        case 'restart':
          Object.assign(t, this.newTimer(t.label, t.durationMs, now), { id: t.id });
          break;
        case 'cancel':
        case 'dismiss':
          this.timers = this.timers.filter((x) => x.id !== t.id);
          break;
      }
    }
    this.reconcile(true);
  }

  /**
   * Completes overdue timers, expires old completed ones and schedules the next wake-up.
   * Called after every change and when the system resumes from sleep.
   */
  reconcile(withAlerts = true) {
    const now = Date.now();

    for (const t of this.timers) {
      if (t.status === 'running' && t.endsAt != null && t.endsAt <= now) this.complete(t, now, withAlerts);
    }
    this.timers = this.timers.filter(
      (t) => !(t.status === 'completed' && now - (t.completedAt ?? now) >= COMPLETED_TTL_MS),
    );

    let next = Infinity;
    for (const t of this.timers) {
      if (t.status === 'running' && t.endsAt != null) next = Math.min(next, t.endsAt);
      if (t.status === 'completed') next = Math.min(next, (t.completedAt ?? now) + COMPLETED_TTL_MS);
    }

    if (this.wake) clearTimeout(this.wake);
    this.wake = null;
    if (next !== Infinity) {
      this.wake = setTimeout(() => this.reconcile(true), Math.min(MAX_TIMEOUT_MS, Math.max(0, next - now)));
    }
    this.emit('change');
  }

  dispose() {
    if (this.wake) clearTimeout(this.wake);
  }

  private complete(t: TimerState, now: number, withAlert: boolean) {
    Object.assign(t, { status: 'completed', endsAt: null, pausedRemaining: 0, completedAt: now });
    if (withAlert) this.emit('alert', { id: randomUUID(), title: `${t.label} done`, subtitle: formatDuration(t.durationMs) });
  }

  private newTimer(label: string, durationMs: number, now: number): TimerState {
    return { id: randomUUID(), label, durationMs, endsAt: now + durationMs, pausedRemaining: null, status: 'running' };
  }
}

function formatDuration(ms: number) {
  const min = Math.round(ms / 60_000);
  if (min >= 60 && min % 60 === 0) return `${min / 60} hr timer`;
  if (min >= 1) return `${min} min timer`;
  return `${Math.round(ms / 1000)} sec timer`;
}
