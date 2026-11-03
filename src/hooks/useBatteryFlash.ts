import { useEffect, useRef, useState } from 'react';
import type { PowerState } from '../shared/types';

/** How long the charging / low-battery pill stays before the island returns to normal. */
const FLASH_MS = 4000;
/** Percentages that trigger a low-battery warning when crossed while unplugged. */
const LOW_THRESHOLDS = [20, 10];

export type BatteryFlash = 'charging' | 'low';

/**
 * Briefly shows the battery when it matters: when a charger is plugged in, and when
 * the level drops past 20% or 10% on battery. Nothing on startup or on desktops.
 */
export function useBatteryFlash(power: PowerState | null) {
  const [flash, setFlash] = useState<BatteryFlash | null>(null);
  const prev = useRef<PowerState | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = power;
    if (!power?.hasBattery || !before?.hasBattery) return;
    if (power.pluggedIn && !before.pluggedIn) setFlash('charging');
    else if (!power.pluggedIn && LOW_THRESHOLDS.some((t) => before.percent > t && power.percent <= t)) setFlash('low');
  }, [power]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);

  return { flash, dismissFlash: () => setFlash(null) };
}
