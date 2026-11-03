// Dev runner: Vite dev server for the renderer, esbuild watch for main/preload,
// and an Electron process that restarts whenever main/preload rebuild.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { watchElectron } from './build-electron.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];

let child = null;
let restarting = false;

function launch() {
  child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, ISLAND_DEV_URL: url },
  });
  child.on('exit', () => {
    if (restarting) return;
    server.close();
    process.exit(0);
  });
}

let started = false;
await watchElectron(() => {
  if (!started) return;
  restarting = true;
  child?.once('exit', () => {
    restarting = false;
    launch();
  });
  child?.kill();
});

started = true;
launch();
