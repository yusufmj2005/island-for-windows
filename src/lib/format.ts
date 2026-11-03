/** 75_000 -> "1:15", 3_725_000 -> "1:02:05". Rounds up so a countdown never shows 0:00 early. */
export function formatClock(ms: number, roundUp = true) {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "Spotify.exe" -> "Spotify", "308046B0AF4A39CB" -> "" (opaque app IDs aren't worth showing). */
export function appName(id?: string) {
  if (!id) return '';
  const base = id.split('!')[0].split('\\').pop()!.replace(/\.exe$/i, '');
  if (/^[0-9A-F]{12,}$/i.test(base)) return '';
  const known: Record<string, string> = { msedge: 'Edge', chrome: 'Chrome', firefox: 'Firefox', brave: 'Brave' };
  return known[base.toLowerCase()] ?? base.split('.').pop() ?? base;
}
