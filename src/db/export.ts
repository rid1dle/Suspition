import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forDataset } from '../../server/game.ts';
import { datasetName } from '../../server/store.ts';
import type { Db } from './index.ts';

// Writes every game (with its learning tag and note) and every person's answers to the git dataset.
export async function exportFromDb(db: Db, datasetDir: string) {
  await mkdir(join(datasetDir, 'games'), { recursive: true });
  await mkdir(join(datasetDir, 'people'), { recursive: true });
  let games = 0;
  for (const summary of db.listGames()) {
    if (summary.learning === 'playtest') continue;
    const game = db.loadGame(summary.id);
    if (!game?.scenario || !game.players?.length) continue;
    await writeFile(join(datasetDir, 'games', datasetName(game)), `${JSON.stringify(forDataset(game), null, 1)}\n`);
    games += 1;
  }
  const people = db.peopleList();
  for (const { username } of people) {
    await writeFile(join(datasetDir, 'people', `${username}.json`), `${JSON.stringify(db.person(username), null, 1)}\n`);
  }
  return { games, people: people.length };
}
