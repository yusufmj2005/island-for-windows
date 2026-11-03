import { useEffect, useRef, useState, type WheelEvent } from 'react';
import type { VolumeState } from '../shared/types';

/** Volume change per mouse-wheel notch (deltaY of 100), in percent. */
const PERCENT_PER_NOTCH = 2;
/** How long the volume bar stays after the last change. */
const SHOW_MS = 1500;
/** After scrolling on the island, ignore Windows' reports this long so the bar doesn't jump back. */
const SETTLE_MS = 600;

/**
 * Volume on the island, kept in step with Windows both ways:
 * - scrolling on the island changes the system volume, shown instantly;
 * - changes made elsewhere (keyboard volume keys, Windows' slider, other apps) bring up
 *   the same bar and follow it live.
 * Precision touchpads send small deltas, which accumulate until they add up to a percent.
 */
export function useVolumeControl(system: VolumeState | null) {
  const [level, setLevel] = useState(system?.level ?? 0);
  const [muted, setMuted] = useState(system?.muted ?? false);
  const [showing, setShowing] = useState(false);
  const lastLocal = useRef(0);
  const known = useRef<VolumeState | null>(null);
  const carry = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    setShowing(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowing(false), SHOW_MS);
  };

  useEffect(() => {
    const before = known.current;
    known.current = system;
    if (!system) return;
    // Our own scroll is still settling: Windows is just echoing it back.
    if (Date.now() - lastLocal.current < SETTLE_MS) return;
    setLevel(system.level);
    setMuted(system.muted);
    // Changed outside Island: show it. Not for the first report after startup.
    if (before && (before.level !== system.level || before.muted !== system.muted)) show();
  }, [system]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const onWheel = (e: WheelEvent) => {
    if (!system) return;
    lastLocal.current = Date.now();
    carry.current += (-e.deltaY / 100) * PERCENT_PER_NOTCH;
    const step = Math.trunc(carry.current);
    carry.current -= step;
    const next = Math.max(0, Math.min(100, level + step));
    if (next !== level) {
      setLevel(next);
      if (muted && step > 0) setMuted(false); // turning it up unmutes, like the volume keys
      window.island.volume({ type: 'set', level: next });
    }
    show();
  };

  const toggleMute = () => {
    if (!system) return;
    lastLocal.current = Date.now();
    setMuted(!muted);
    window.island.volume({ type: 'toggle-mute' });
    show();
  };

  return { available: !!system, level, muted, showing, onWheel, toggleMute };
}
