// @ts-nocheck -- legacy JS, typed file by file later
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, addPlayer, applySetup, attachScenario, startPlay, beginAsk, completeAsk } from '../server/game.ts';
import { GM } from '../server/gm.ts';

const [, , file] = process.argv;
const scenario = JSON.parse(await readFile(file, 'utf8'));
const game = createGame();
for (const p of scenario.players) addPlayer(game, { name: p.character_name.split(' ')[0] });
applySetup(game, { tone: 'tense', length: 'short', hints: 2 });
attachScenario(game, scenario);
startPlay(game);
game.state.found.p1.push('c13', 'c4');

const gm = new GM({ workDir: join(tmpdir(), 'detective-gm') });
const show = (label, result) => {
  console.log(`\n=== ${label}`);
  for (const l of result.lines ?? []) console.log(`${l.speaker ? `${l.speaker}: ` : '   '}${l.text}`);
  console.log('learned:', JSON.stringify(result.learned));
};
const ask = async (pid, text, label) => {
  const a = beginAsk(game, pid, { kind: 'question', text });
  const result = await gm.answer(game, pid, a);
  completeAsk(game, pid, result);
  show(label, result);
};

await ask('p1', 'I find Tapan the forest guard and ask him straight: who do you think killed Mira?', '1. Asha asks Tapan who did it (he has no evidence)');
await ask('p1', 'I show Tapan the camera trap card from 9:38 and the size ten drag marks, and I tell him Ben wears size ten boots.', '2. Asha shows Tapan the evidence');
await ask('p3', 'I go to Tapan and ask: has anyone told you anything new about tonight?', '3. Chitra asks Tapan later');
await ask('p3', 'I ask Rekha: whose boots were on the walkway at 9:38?', '4. Chitra asks Rekha, who was never shown the camera card');
console.log('\nRECORD:', JSON.stringify(game.state.knowledge.map((k) => `${k.character_id} r${k.round}: ${k.fact} (${k.how})`), null, 1));
