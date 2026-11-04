// Keeps a most-recently-used list of apps, from the windows you bring to the front,
// and launches them again. Entries are matched to Start menu apps where possible,
// because those carry proper names and a launch ID that works for every kind of app
// (desktop, Store, launcher-based).
import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { RecentApp } from '../../src/shared/types';
import type { DeviceUser, SeenApp, StartApp } from './WindowsHelper';

/** How many apps are remembered; the island shows the first few. */
const MAX_REMEMBERED = 12;

export interface StoredRecentApp {
  id: string;
  name: string;
  launch: { kind: 'apps-folder'; appId: string } | { kind: 'path'; path: string };
  /** File the icon is read from. */
  iconPath: string | null;
  lastUsed: number;
  /** Pinned apps stay at the front, in the order they were pinned (the value is when). */
  pinnedAt?: number;
}

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isPackaged = (p: string) => /\\WindowsApps\\/i.test(p);

/** "C:\Program Files\WindowsApps\Claude_4.4.0_x64__pzs8sxrjxfjjc\app\claude.exe" -> "Claude_pzs8sxrjxfjjc" */
function packageFamily(p: string) {
  const full = p.match(/\\WindowsApps\\([^\\]+)\\/i)?.[1];
  const parts = full?.split('_');
  return parts && parts.length >= 5 ? `${parts[0]}_${parts[parts.length - 1]}` : null;
}

export class RecentAppsService extends EventEmitter<{ change: [] }> {
  private apps: StoredRecentApp[];
  private startApps: StartApp[] = [];
  private icons = new Map<string, string | null>();
  private lastKey = '';

  constructor(initial: StoredRecentApp[], private ownExe: string) {
    super();
    this.apps = initial;
  }

  getStored() {
    return this.apps;
  }

  /** The list for the island, newest first, with icons as data URLs. */
  async list(): Promise<RecentApp[]> {
    return Promise.all(
      this.apps.map(async (a) => ({ id: a.id, name: a.name, icon: await this.icon(a), pinned: a.pinnedAt != null })),
    );
  }

  /** The Start menu entry for a media session's app id ("Spotify.exe", "Chrome", an AUMID). */
  private startAppForMedia(appId: string) {
    const id = appId.toLowerCase();
    return (
      this.startApps.find((s) => s.id.toLowerCase() === id) ??
      this.startApps.find((s) => s.path && path.basename(s.path).toLowerCase() === id) ??
      // "308046B0AF4A39CB;PrivateBrowsingAUMID" -> the Firefox entry
      this.startApps.find((s) => id.startsWith(`${s.id.toLowerCase()};`))
    );
  }

  /** "Spotify.exe" -> "Spotify", "308046B0AF4A39CB" -> "Firefox"; null when unknown. */
  nameForMediaApp(appId: string) {
    return this.startAppForMedia(appId)?.name ?? null;
  }

  /** Starts (or reopens) a media app through the Start menu; false if it isn't listed there. */
  launchMediaApp(appId: string) {
    const s = this.startAppForMedia(appId);
    if (!s) return false;
    spawn('explorer.exe', [`shell:AppsFolder\\${s.id}`], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }

  /** A readable name for an app using the mic or camera, using the Start menu where it can. */
  displayName(user: DeviceUser) {
    const fam = user.family?.toLowerCase();
    const match =
      (fam ? this.startApps.find((s) => s.id.toLowerCase().startsWith(`${fam}!`)) : undefined) ??
      (user.path ? this.startApps.find((s) => same(s.path, user.path)) : undefined);
    if (match) return match.name;
    if (user.name) return user.name;
    // "Microsoft.WindowsCamera_8wekyb3d8bbwe" -> "WindowsCamera"
    return user.family?.split('_')[0].split('.').pop() ?? 'An app';
  }

  setStartApps(apps: StartApp[]) {
    this.startApps = apps;
  }

  /** Apps already open when Island starts: added behind anything remembered, without reordering it. */
  seed(open: SeenApp[]) {
    const now = Date.now();
    open.forEach((seen, i) => {
      const entry = this.resolve(seen);
      if (entry && !this.apps.some((a) => a.id === entry.id)) this.apps.push({ ...entry, lastUsed: now - (i + 1) * 1000 });
    });
    this.commit();
  }

  /** An app came to the front: move it to the start of the list. */
  touch(seen: SeenApp) {
    const entry = this.resolve(seen);
    if (!entry) return;
    const pinnedAt = this.apps.find((a) => a.id === entry.id)?.pinnedAt;
    this.apps = [{ ...entry, lastUsed: Date.now(), pinnedAt }, ...this.apps.filter((a) => a.id !== entry.id)];
    this.commit();
  }

  find(id: string) {
    return this.apps.find((a) => a.id === id);
  }

  togglePin(id: string) {
    const a = this.find(id);
    if (!a) return;
    a.pinnedAt = a.pinnedAt == null ? Date.now() : undefined;
    this.commit();
  }

  /** Empties the list except for pinned apps. */
  clearUnpinned() {
    this.apps = this.apps.filter((a) => a.pinnedAt != null);
    this.commit();
  }

  /** Drops an app from the list; it comes back only if you use it again. */
  remove(id: string) {
    this.apps = this.apps.filter((a) => a.id !== id);
    this.commit();
  }

  async open(id: string) {
    const a = this.apps.find((x) => x.id === id);
    if (!a) return;
    console.log(`[recent-apps] opening ${a.name}`);
    if (a.launch.kind === 'apps-folder') {
      // The same route the Start menu uses; works for desktop, Store and URL-based entries.
      spawn('explorer.exe', [`shell:AppsFolder\\${a.launch.appId}`], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const error = await shell.openPath(a.launch.path);
      if (error) console.warn(`[recent-apps] could not open ${a.launch.path}: ${error}`);
    }
  }

  private commit() {
    // Pinned first (oldest pin first), then most recently used; pinned apps are never dropped.
    this.apps.sort((a, b) => (a.pinnedAt ?? Infinity) - (b.pinnedAt ?? Infinity) || b.lastUsed - a.lastUsed);
    const pinned = this.apps.filter((a) => a.pinnedAt != null);
    this.apps = [...pinned, ...this.apps.filter((a) => a.pinnedAt == null).slice(0, MAX_REMEMBERED)];
    const key = this.apps.map((a) => `${a.id}${a.pinnedAt != null ? ' (pinned)' : ''}`).join('\n');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.emit('change');
  }

  /** Works out how to name, show and relaunch the app behind a window. */
  private resolve(seen: SeenApp): Omit<StoredRecentApp, 'lastUsed'> | null {
    if (same(seen.path, this.ownExe)) return null;
    const exe = seen.path ? path.basename(seen.path).toLowerCase() : '';
    const family = seen.path ? packageFamily(seen.path) : null;

    const match =
      this.startApps.find((s) => same(s.id, seen.aumid)) ??
      this.startApps.find((s) => same(s.path, seen.path)) ??
      (family ? this.startApps.find((s) => s.id.toLowerCase().startsWith(`${family.toLowerCase()}!`)) : undefined) ??
      this.startApps.find((s) => same(s.name, seen.name)) ??
      // Helper processes (e.g. steamwebhelper.exe) belong to the app installed above them.
      (exe.includes('helper') && seen.path
        ? this.startApps.find((s) => s.path && seen.path!.toLowerCase().startsWith(path.dirname(s.path).toLowerCase() + '\\'))
        : undefined);

    if (match) {
      return {
        id: `start:${match.id.toLowerCase()}`,
        name: match.name,
        launch: { kind: 'apps-folder', appId: match.id },
        iconPath: match.path ?? seen.path,
      };
    }
    // Not in the Start menu: launch the exe directly, unless it's a Store app, which can't be.
    if (seen.path && !isPackaged(seen.path)) {
      return { id: `path:${seen.path.toLowerCase()}`, name: seen.name, launch: { kind: 'path', path: seen.path }, iconPath: seen.path };
    }
    return null;
  }

  private async icon(a: StoredRecentApp) {
    if (!a.iconPath) return null;
    if (!this.icons.has(a.iconPath)) {
      try {
        const img = await app.getFileIcon(a.iconPath, { size: 'large' });
        this.icons.set(a.iconPath, img.isEmpty() ? null : img.toDataURL());
      } catch {
        this.icons.set(a.iconPath, null);
      }
    }
    return this.icons.get(a.iconPath) ?? null;
  }
}
