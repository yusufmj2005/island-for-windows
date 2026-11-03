import { useEffect, useRef, useState, type WheelEvent } from 'react';
import type { VolumeState } from '../shared/types';

/** Volume change per mouse-wheel notch (deltaY of 100), in percent. */
const PERCENT_PER_NOTCH = 2;
/** How long the volume bar stays after the last scroll or mute. */
const SHOW_MS = 1500;
/** After a local change, ignore reports from Windows this long so the bar doesn't jump back. */
const SETTLE_MS = 600;

/**
 * Scroll-to-change-volume. The shown level updates instantly on scroll; Windows'
 * reports take over again once scrolling stops. Precision touchpads send small deltas,
 * which accumulate until they add up to a whole percent.
 */
export function useVolumeControl(system: VolumeState | null) {
  const [level, setLevel] = useState(system?.level ?? 0);
  const [muted, setMuted] = useState(system?.muted ?? false);
  const [showing, setShowing] = useState(false);
  const lastLocal = useRef(0);
  const carry = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!system || Date.now() - lastLocal.current < SETTLE_MS) return;
    setLevel(system.level);
    setMuted(system.muted);
  }, [system]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const show = () => {
    lastLocal.current = Date.now();
    setShowing(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowing(false), SHOW_MS);
  };

  const onWheel = (e: WheelEvent) => {
    if (!system) return;
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
    setMuted(!muted);
    window.island.volume({ type: 'toggle-mute' });
    show();
  };

  return { available: !!system, level, muted, showing, onWheel, toggleMute };
}
