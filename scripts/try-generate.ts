// @ts-nocheck -- legacy JS, typed file by file later
import { writeFile } from 'node:fs/promises';
import { createGame, addPlayer, applySetup, validateScenario } from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { LENGTHS } from '../server/prompts.ts';

const [, , out = 'game-data/try-scenario.json', setting = 'A monsoon gala at a 1950s Bombay hotel', count = '4'] = process.argv;
const game = createGame();
for (const name of ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha', 'Farid', 'Gita', 'Hari'].slice(0, Number(count))) addPlayer(game, { name });
applySetup(game, { setting, tone: 'tense', length: 'short', hints: 3, notes: '' });

const gm = new GM({ workDir: 'game-data/try', setupModel: process.env.DETECTIVE_SETUP_MODEL, setupEffort: process.env.DETECTIVE_SETUP_EFFORT, log: console.log });
const started = Date.now();
const scenario = await gm.generate(game);
console.log(`generated in ${Math.round((Date.now() - started) / 1000)}s`);
console.log('errors:', validateScenario(scenario, { playerCount: Number(count), phases: LENGTHS.short.phases, hints: 3 }));
await writeFile(out, JSON.stringify(scenario, null, 2));
console.log('wrote', out);
