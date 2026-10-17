import { writeFile } from 'node:fs/promises';
import { createGame, addPlayer, applySetup, validateScenario } from '../server/game.js';
import { GM } from '../server/gm.js';
import { LENGTHS } from '../server/prompts.js';

const [, , out = 'game-data/try-scenario.json', setting = 'A monsoon gala at a 1950s Bombay hotel'] = process.argv;
const game = createGame();
for (const name of ['Asha', 'Ben', 'Chitra', 'Dev']) addPlayer(game, { name });
applySetup(game, { setting, tone: 'tense', length: 'short', hints: 3, notes: '' });

const gm = new GM({ workDir: 'game-data/try', setupModel: process.env.DETECTIVE_SETUP_MODEL, setupEffort: process.env.DETECTIVE_SETUP_EFFORT, log: console.log });
const started = Date.now();
const scenario = await gm.generate(game);
console.log(`generated in ${Math.round((Date.now() - started) / 1000)}s`);
console.log('errors:', validateScenario(scenario, { playerCount: 4, phases: LENGTHS.short.phases, hints: 3 }));
await writeFile(out, JSON.stringify(scenario, null, 2));
console.log('wrote', out);
