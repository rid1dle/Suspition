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
// It never deletes or changes a file. Everything goes in one transaction, marked done at the end,
// so a crash halfway imports nothing and the next start tries again.
export async function importOnce(db: Db, { gameData, dataset }: { gameData: string; dataset: string }) {
  if (db.getMeta('imported')) return { skipped: true };
  const current = await readJson<Game>(join(gameData, 'current-game.json'));
  // Unlabelled files first: "-before-rework" style copies are older snapshots of the same game.
  const gameFiles = (await list(join(dataset, 'games'))).filter((f) => f.endsWith('.json')).sort((a, b) => a.length - b.length);
  const games = (await Promise.all(gameFiles.map((f) => readJson<Game>(join(dataset, 'games', f))))).filter((g): g is Game => Boolean(g?.id));
  const playtests = (await Promise.all((await list(join(dataset, 'playtests'))).map(async (id) => ({
    id,
    game: await readJson<Game>(join(dataset, 'playtests', id, 'game.json')),
    report: await readJson<unknown>(join(dataset, 'playtests', id, 'report.json')),
  })))).filter((p) => p.game?.id && p.report);
  const people = (await Promise.all((await list(join(dataset, 'people'))).filter((x) => x.endsWith('.json'))
    .map((f) => readJson<{ username: string; name: string; answers?: []; createdAt?: number }>(join(dataset, 'people', f))))).filter((p) => p?.username);

  return db.transaction(() => {
    const seen = new Set<string>();
    const fresh = (id: string) => !seen.has(id) && !db.loadGame(id);
    let gameCount = 0;
    if (current?.id && fresh(current.id)) {
      db.saveGame(current);
      db.setCurrent(current.id);
      seen.add(current.id);
      gameCount += 1;
    }
    for (const game of games) {
      if (!fresh(game.id)) continue;
      seen.add(game.id);
      const learning: Learning = LEARNING.includes(game.learning as Learning) ? (game.learning as Learning) : 'real';
      db.saveGame({ ...game, learning, note: String(game.note ?? '') });
      gameCount += 1;
    }
    for (const p of playtests) {
      if (fresh(p.game!.id)) {
        db.saveGame({ ...p.game!, learning: 'playtest' });
        seen.add(p.game!.id);
        gameCount += 1;
      }
      db.savePlaytest(p.id, p.game!.id, p.report);
    }
    for (const p of people) db.savePerson({ username: p!.username, name: p!.name ?? p!.username, answers: p!.answers ?? [], createdAt: p!.createdAt ?? Date.now() });
    db.setMeta('imported', new Date().toISOString());
    return { games: gameCount, people: people.length, playtests: playtests.length };
  });
}
