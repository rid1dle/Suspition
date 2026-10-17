import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LEARNING, type Db } from './index.ts';
import type { Game, Learning } from '../../server/types.ts';

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
};
const list = (dir: string) => readdir(dir).catch(() => [] as string[]);

// First start on an existing install: bring every JSON game, person and playtest into the database.
// It never deletes or changes a file, and does nothing once the database has games.
export async function importOnce(db: Db, { gameData, dataset }: { gameData: string; dataset: string }) {
  if (db.hasGames()) return { skipped: true };
  const seen = new Set<string>();
  let games = 0;
  const current = await readJson<Game>(join(gameData, 'current-game.json'));
  if (current?.id) {
    db.saveGame(current);
    db.setCurrent(current.id);
    seen.add(current.id);
    games += 1;
  }
  // Unlabelled files first: "-before-rework" style copies are older snapshots of the same game.
  const files = (await list(join(dataset, 'games'))).filter((f) => f.endsWith('.json')).sort((a, b) => a.length - b.length);
  for (const f of files) {
    const game = await readJson<Game>(join(dataset, 'games', f));
    if (!game?.id || seen.has(game.id)) continue;
    seen.add(game.id);
    const learning: Learning = LEARNING.includes(game.learning as Learning) ? (game.learning as Learning) : 'real';
    db.saveGame({ ...game, learning, note: String(game.note ?? '') });
    games += 1;
  }
  let playtests = 0;
  for (const id of await list(join(dataset, 'playtests'))) {
    const game = await readJson<Game>(join(dataset, 'playtests', id, 'game.json'));
    const report = await readJson<unknown>(join(dataset, 'playtests', id, 'report.json'));
    if (!game?.id || !report) continue;
    if (!seen.has(game.id)) {
      db.saveGame({ ...game, learning: 'playtest' });
      seen.add(game.id);
      games += 1;
    }
    db.savePlaytest(id, game.id, report);
    playtests += 1;
  }
  let people = 0;
  for (const f of (await list(join(dataset, 'people'))).filter((x) => x.endsWith('.json'))) {
    const p = await readJson<{ username: string; name: string; answers?: []; createdAt?: number }>(join(dataset, 'people', f));
    if (!p?.username) continue;
    db.savePerson({ username: p.username, name: p.name ?? p.username, answers: p.answers ?? [], createdAt: p.createdAt ?? Date.now() });
    people += 1;
  }
  return { games, people, playtests };
}
