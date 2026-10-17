import { readFile } from 'node:fs/promises';
import { createGame, addPlayer, applySetup, attachScenario, startPlay, beginAsk } from '../server/game.js';
import { GM } from '../server/gm.js';

const [, , file = 'game-data/try-scenario.json', model, question = 'I search the ballroom near where the body was found. What do I notice?'] = process.argv;
const scenario = JSON.parse(await readFile(file, 'utf8'));
const game = createGame();
for (const p of scenario.players) addPlayer(game, { name: p.character_name.split(' ')[0] });
applySetup(game, { tone: 'tense', length: 'short', hints: 3 });
attachScenario(game, scenario);
startPlay(game);
const ask = beginAsk(game, 'p2', { kind: 'question', text: question });

const gm = new GM({ workDir: 'game-data/try', playModel: model || undefined, log: console.log });
const started = Date.now();
const result = await gm.answer(game, 'p2', ask);
console.log(`model=${model || 'default'} ${Date.now() - started}ms`);
console.log(JSON.stringify(result, null, 2));
