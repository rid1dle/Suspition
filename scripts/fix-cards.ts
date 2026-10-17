// @ts-nocheck -- legacy JS, typed file by file later
import { writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GM } from '../server/gm.ts';
import { applyAudit } from '../server/game.ts';
import { gameFile, serverIsUp, readJson, STOP_FIRST } from './offline.ts';

// Makes every player card say what that character did, saw and said, wherever else the story mentions it.
async function main() {
  const file = gameFile(process.argv[2]);
  const draftFile = join(dirname(file), 'fix-cards-draft.json');
  const game = await readJson(file);
  if (!game?.scenario || !['reading', 'playing'].includes(game.status)) {
    console.log('There is no game in progress to fix.');
    process.exit(1);
  }
  const draft = await readJson(draftFile);
  let audit = draft?.gameId === game.id ? draft.audit : null;
  if (!audit) {
    console.log('The GM is checking every card against the whole story. This takes a minute or two.');
    const gm = new GM({ workDir: join(tmpdir(), 'detective-gm'), log: (m) => console.log(m) });
    audit = await gm.auditCards(game.scenario);
    await writeFile(draftFile, JSON.stringify({ gameId: game.id, audit }));
  }
  const counts = (audit.players ?? []).map((e) => `${game.players.find((p) => p.id === e.player_id)?.name ?? e.player_id}: ${(e.add?.length ?? 0) + (e.known_hidden_fact_ids?.length ?? 0)}`);
  console.log(`Things to add to each card: ${counts.join(', ')}`);
  if (await serverIsUp()) {
    console.log(`The fixes are ready. ${STOP_FIRST}`);
    return;
  }
  const fresh = await readJson(file);
  await copyFile(file, file.replace(/\.json$/, '.before-fix-cards.json'));
  const n = applyAudit(fresh.scenario, audit);
  await writeFile(file, JSON.stringify(fresh));
  await rm(draftFile, { force: true });
  console.log(`Done. ${n} fact${n === 1 ? '' : 's'} added. Each phone shows "Your card has new things you remember."`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
