import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, addPlayer, applySetup } from '../server/game.js';
import { GM } from '../server/gm.js';

const [, , file = 'game-data/current-game.json'] = process.argv;
const saved = JSON.parse(await readFile(file, 'utf8'));
const game = createGame();
for (const p of saved.players) addPlayer(game, { name: p.name, wish: p.wish });
applySetup(game, saved.setup);
console.log('players:', game.players.map((p) => p.name).join(', '), '| setup:', JSON.stringify(game.setup));

const gm = new GM({ workDir: join(tmpdir(), 'detective-gm'), setupEffort: process.env.DETECTIVE_SETUP_EFFORT || 'medium', log: console.log });
const started = Date.now();
try {
  const scenario = await gm.generate(game);
  console.log(`OK in ${Math.round((Date.now() - started) / 1000)}s: ${scenario.title}`);
} catch (err) {
  console.log(`FAILED after ${Math.round((Date.now() - started) / 1000)}s: ${err.message}`);
}
