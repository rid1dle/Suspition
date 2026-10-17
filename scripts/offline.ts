// @ts-nocheck -- legacy JS, typed file by file later
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { openDb } from '../src/db/index.ts';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 4321;

export const dataDir = () => resolve(process.env.DETECTIVE_DATA_DIR ?? join(ROOT, 'game-data'));

// The live game the repair scripts work on: the database's current game, or a JSON file given by path.
// save() keeps the old version next to it and returns where.
export async function currentGame(arg, { dataDir: dir = dataDir() } = {}) {
  if (arg) {
    const file = resolve(arg);
    return {
      dir: dirname(file),
      load: () => readJson(file),
      save: async (game, tag) => {
        const backup = file.replace(/\.json$/, `.before-${tag}.json`);
        await copyFile(file, backup);
        await writeFile(file, JSON.stringify(game));
        return backup;
      },
      close: () => {},
    };
  }
  const db = openDb(join(dir, 'suspition.db'));
  return {
    dir,
    load: async () => db.loadCurrent(),
    save: async (game, tag) => {
      const before = db.loadCurrent();
      const backup = join(dir, `${game.id}.before-${tag}.json`);
      if (before) await writeFile(backup, JSON.stringify(before));
      db.saveGame(game);
      db.setCurrent(game.id);
      return backup;
    },
    close: () => db.close(),
  };
}

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
