import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 4321;

export function gameFile(arg) {
  return resolve(arg ?? join(process.env.DETECTIVE_DATA_DIR ?? join(ROOT, 'game-data'), 'current-game.json'));
}

export async function serverIsUp() {
  try {
    await fetch(`http://localhost:${port}/api/info`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export const STOP_FIRST = 'Stop the game server (Ctrl+C), run this again to use it, then start the server.';
