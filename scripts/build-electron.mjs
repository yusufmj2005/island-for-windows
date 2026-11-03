// Bundles the Electron main and preload scripts with esbuild.
import { pathToFileURL } from 'node:url';
import { build, context } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

export const entries = [
  { ...common, entryPoints: ['electron/main/index.ts'], outfile: 'dist-electron/main.js' },
  { ...common, entryPoints: ['electron/preload/index.ts'], outfile: 'dist-electron/preload.js' },
];

export async function watchElectron(onRebuild) {
  const notify = { name: 'notify', setup: (b) => b.onEnd((r) => r.errors.length === 0 && onRebuild?.()) };
  const ctxs = await Promise.all(entries.map((e) => context({ ...e, plugins: [notify] })));
  await Promise.all(ctxs.map((c) => c.watch()));
  return ctxs;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await Promise.all(entries.map((e) => build(e)));
}
