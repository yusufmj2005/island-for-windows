// Screenshot previews: when an image lands on the clipboard (Win+Shift+S, Print Screen,
// Snipping Tool), the island shows a thumbnail you can save or drag into another app.
import { app, clipboard, nativeImage, shell, type NativeImage, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScreenshotPreview } from '../../src/shared/types';

const THUMB_HEIGHT = 160;

/** "Screenshot 2026-11-03 143512.png" */
function fileName(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Screenshot ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

export class ScreenshotService {
  private last: { id: string; image: NativeImage; name: string } | null = null;
  private savedPath: string | null = null;

  /** Reads the clipboard; returns a preview if it now holds an image. */
  async check(): Promise<ScreenshotPreview | null> {
    if (!(await clipboard.has('image/png'))) return null;
    const item = (await clipboard.read()).find((i) => i.types.includes('image/png'));
    if (!item) return null;
    const blob = await item.getType('image/png');
    const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    if (width < 16 || height < 16) return null;
    const id = randomUUID();
    this.last = { id, image, name: fileName() };
    this.savedPath = null;
    // Only the height is given, so the aspect ratio is kept.
    const thumb = image.resize({ height: Math.min(THUMB_HEIGHT, height), quality: 'good' });
    return { id, thumb: thumb.toDataURL(), width, height };
  }

  /** Saves the shown screenshot to Pictures\Screenshots. */
  async save(id: string) {
    if (this.last?.id !== id) return false;
    const dir = path.join(app.getPath('pictures'), 'Screenshots');
    // Snipping Tool auto-saves here with the same naming; never overwrite its file.
    const base = this.last.name.replace(/\.png$/, '');
    let file = path.join(dir, this.last.name);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${base} (${n}).png`);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(file, this.last.image.toPNG());
      this.savedPath = file;
      console.log(`[screenshot] saved ${file}`);
      return true;
    } catch (err) {
      console.error('[screenshot] save failed', err);
      return false;
    }
  }

  reveal() {
    if (this.savedPath) shell.showItemInFolder(this.savedPath);
  }

  /** Starts a native file drag, so the screenshot can be dropped into any app. */
  drag(id: string, sender: WebContents) {
    if (this.last?.id !== id) return;
    // A drag needs a real file; use the saved one, or a temporary copy.
    let file = this.savedPath;
    if (!file) {
      const dir = path.join(os.tmpdir(), 'Island');
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, this.last.name);
      if (!fs.existsSync(file)) fs.writeFileSync(file, this.last.image.toPNG());
    }
    sender.startDrag({ file, icon: this.last.image.resize({ width: 96 }) });
  }
}
