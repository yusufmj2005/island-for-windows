import { useEffect, useState } from 'react';
import type { IslandAlert, IslandSnapshot, RecentApp } from '../shared/types';

const EMPTY: IslandSnapshot = { media: { active: false }, timers: [], volume: null, power: null, hideWhenIdle: false };
const ALERT_MS = 4500;

/** Live state pushed from the main process. */
export function useIsland() {
  const [snapshot, setSnapshot] = useState<IslandSnapshot>(EMPTY);
  const [pointerInside, setPointerInside] = useState(false);
  const [alert, setAlert] = useState<IslandAlert | null>(null);
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);

  useEffect(() => {
    window.island.getSnapshot().then(setSnapshot);
    window.island.getRecentApps().then(setRecentApps);
    const offs = [
      window.island.onSnapshot(setSnapshot),
      window.island.onPointer(setPointerInside),
      window.island.onAlert(setAlert),
      window.island.onRecentApps(setRecentApps),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    if (!alert) return;
    const id = setTimeout(() => setAlert(null), ALERT_MS);
    return () => clearTimeout(id);
  }, [alert]);

  return { snapshot, pointerInside, alert, recentApps, dismissAlert: () => setAlert(null) };
}
