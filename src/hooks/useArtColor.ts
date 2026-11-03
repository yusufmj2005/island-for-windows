import { useEffect, useState } from 'react';

const FALLBACK = '#f5f5f7';

/** Picks a vivid accent colour from album art, for the waveform and progress bar. */
export function useArtColor(dataUrl?: string | null) {
  const [color, setColor] = useState(FALLBACK);

  useEffect(() => {
    if (!dataUrl) {
      setColor(FALLBACK);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const size = 24;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      g.drawImage(img, 0, 0, size, size);
      const { data } = g.getImageData(0, 0, size, size);
      // Weight each pixel by saturation x brightness so the accent isn't a muddy average.
      let r = 0, gr = 0, b = 0, total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const pr = data[i], pg = data[i + 1], pb = data[i + 2];
        const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
        const sat = max === 0 ? 0 : (max - min) / max;
        const w = sat * sat * (max / 255) + 0.002;
        r += pr * w; gr += pg * w; b += pb * w; total += w;
      }
      setColor(liftColor(r / total, gr / total, b / total));
    };
    img.src = dataUrl;
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  return color;
}

/** Brightens dark colours so they stay readable on the black island. */
function liftColor(r: number, g: number, b: number) {
  const max = Math.max(r, g, b, 1);
  const scale = max < 170 ? 170 / max : 1;
  const c = (v: number) => Math.min(255, Math.round(v * scale));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}
