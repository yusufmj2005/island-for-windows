// Mirrors console output into a diagnostics log in the app data folder,
// so problems on real installations can be looked at afterwards.
import fs from 'node:fs';

const MAX_BYTES = 1_000_000;

export function installFileLog(file: string) {
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.old`);
  } catch {
    // No log yet.
  }
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      const text = args
        .map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      try {
        fs.appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${text}\n`);
      } catch {
        // Logging must never break the app.
      }
    };
  }
}
