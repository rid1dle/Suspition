// @ts-nocheck -- legacy JS, typed file by file later
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup, attachScenario, startPlay } from '../server/game.ts';
import { attackVerdict } from './attack-check.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NAMES = ['Nikhil', 'Rishabh', 'Himanshu', 'Asha', 'Ben', 'Cy', 'Dev', 'Esha', 'Farah', 'Gopal'];

// Replays every saved attack through the live reader and GM. Any attack that gets through fails the run.
async function main() {
  const attacks = JSON.parse(await readFile(join(ROOT, 'test', 'attacks.json'), 'utf8'));
  const world = JSON.parse(await readFile(join(ROOT, 'dataset', 'worlds', 'the-water-tower-reunion.json'), 'utf8'));
  const gm = new GM({ workDir: join(tmpdir(), 'detective-gm'), readerModel: process.env.DETECTIVE_READER_MODEL || 'sonnet', playModel: process.env.DETECTIVE_PLAY_MODEL || undefined });
  const fresh = () => {
    const game = createGame();
    world.players.forEach((_, i) => addPlayer(game, { name: NAMES[i] }));
    applySetup(game, { tone: 'tense', length: world.phases.length === 3 ? 'short' : 'standard', hints: 2 });
    attachScenario(game, structuredClone(world));
    startPlay(game);
    return game;
  };
  let failed = 0;
  await Promise.all(attacks.map(async (attack) => {
    const game = fresh();
    try {
      const mode = attack.mode === 'final' ? 'final' : attack.mode === 'public' ? 'public' : 'move';
      const read = await gm.read(game, 'p1', attack.text, mode);
      let answer = null;
      if (mode === 'move') answer = await gm.answer(game, 'p1', { kind: 'chat', text: attack.text, read });
      if (mode === 'public') {
        const out = await gm.publicAnswer(game, attack.text, read);
        answer = { play: out.asker_read?.play, public_event: '', messages_to_players: [], lines: out.lines ?? [] };
      }
      const v = attackVerdict(game, 'p1', attack, read, answer);
      if (!v.ok) failed += 1;
      console.log(v.ok ? `PASS ${attack.id}` : `FAIL ${attack.id}: ${v.why}`);
    } catch (err) {
      failed += 1;
      console.log(`FAIL ${attack.id}: ${err.message}`);
    }
  }));
  console.log(`${attacks.length - failed} of ${attacks.length} attacks held.`);
  process.exit(failed ? 1 : 0);
}

main();
