// @ts-nocheck -- legacy JS, typed file by file later
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentGame, serverIsUp } from './offline.ts';
import { GM } from '../server/gm.ts';
import { validateScenario, startPositions } from '../server/game.ts';
import { LENGTHS, GENERATION_SYSTEM, SCENARIO_SCHEMA } from '../server/prompts.ts';
import { GENERATION_STEPS, stepForKey } from '../server/progress.ts';

const port = Number(process.env.PORT) || 4321;

export function sameStory(before, after) {
  const problems = [];
  const ids = (list) => (list ?? []).map((x) => x.id).join(',');
  for (const key of ['players', 'npcs', 'locations', 'clues', 'key_deductions']) {
    if (ids(before[key]) !== ids(after[key])) problems.push(`${key} changed`);
  }
  if ([...before.truth.culprit_ids].sort().join() !== [...after.truth.culprit_ids].sort().join()) problems.push('culprits changed');
  before.players.forEach((p, i) => {
    const q = after.players[i];
    if (!q) return;
    if (p.side !== q.side) problems.push(`${p.id} side changed`);
    if (ids(p.hidden_facts) !== ids(q.hidden_facts)) problems.push(`${p.id} hidden facts changed`);
    if (p.character_name !== q.character_name) problems.push(`${p.id} name changed`);
  });
  if (before.phases.length !== after.phases.length) problems.push('number of rounds changed');
  return problems;
}

async function main() {
  if (await serverIsUp()) {
    console.log(`The game server is running on port ${port}. Stop it first (Ctrl+C), then run this again.`);
    process.exit(1);
  }
  const current = await currentGame(process.argv[2]);
  const game = await current.load();
  if (!game?.scenario) {
    console.log('There is no game with a world to rewrite.');
    process.exit(1);
  }
  if (!game.scenario) {
    console.log('This game has no mystery yet. Nothing to rewrite.');
    return;
  }
  const before = game.scenario;
  const prompt = `Here is a finished mystery. Rewrite it in plain, simple English, following the writing style and length limits exactly.

Keep everything the same: every id, every name, every side, the culprits, every clue, every fact and the truth. Only make the words shorter and simpler.
Add the fields it may be missing: x, y and neighbors for each location, start_location for every player and GM character, and a music theme.

THE MYSTERY:
${JSON.stringify(before)}`;

  let last = null;
  const gm = new GM({ workDir: join(tmpdir(), 'detective-gm'), setupEffort: 'medium', log: (m) => console.log(m) });
  console.log(`Rewriting "${before.title}" in simple words. This takes a few minutes.`);
  const after = await gm.call('simplify', {
    system: GENERATION_SYSTEM,
    prompt,
    schema: SCENARIO_SCHEMA,
    effort: 'medium',
    timeoutMs: 900_000,
    onProgress: (e) => {
      const step = e.kind === 'key' ? stepForKey(e.key) : null;
      if (step && step !== last) {
        last = step;
        console.log(`  ${GENERATION_STEPS.find((s) => s.id === step).label}`);
      }
    },
  });

  const problems = [
    ...sameStory(before, after),
    ...validateScenario(after, { playerCount: before.players.length, phases: before.phases.length, hints: Math.min(game.setup?.hints ?? 1, after.hint_ladder.length) }),
  ];
  if (problems.length) {
    console.log(`Not saved. The rewrite changed the story:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }

  game.scenario = after;
  if (game.state) {
    const opening = game.state.events.find((e) => e.kind === 'opening');
    if (opening) opening.text = after.opening_scene;
    game.state.positions ??= startPositions(after);
  }
  const backup = await current.save(game, 'simplify');
  current.close();
  console.log(`Done. "${after.title}" is now in simple words, with a map and music. The old version is in ${backup}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
