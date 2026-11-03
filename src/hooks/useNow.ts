import { useEffect, useState } from 'react';

/**
 * Current time, re-rendering every `intervalMs` while `active`.
 * Uses requestAnimationFrame for short intervals so it pauses when nothing is shown.
 */
export function useNow(active: boolean, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    if (intervalMs >= 100) {
      const id = setInterval(() => setNow(Date.now()), intervalMs);
      return () => clearInterval(id);
    }
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last >= intervalMs) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, intervalMs]);

  return now;
}
