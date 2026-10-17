import { writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GM } from '../server/gm.js';
import { validateScenario, attachScenario } from '../server/game.js';
import { GENERATION_SYSTEM, SCENARIO_SCHEMA } from '../server/prompts.js';
import { GENERATION_STEPS, stepForKey } from '../server/progress.js';
import { gameFile, serverIsUp, readJson, STOP_FIRST } from './offline.js';

export function reworkPrompt(scenario, { npcs, players }, problems = []) {
  return `Here is a mystery that has not started yet. Rework its cast.

Keep: the setting, the title, the victim and what happened to them, the culprits (same player ids and sides), every player's id, character_name, role_title and public_info, the number of rounds (phases), and the music.

Change:
- The story centres on the ${players} player characters. Each of them has real private_info, a clear goal and hidden facts tied to the case.
- Use exactly ${npcs} GM characters (ids n1${npcs > 1 ? ` to n${npcs}` : ''}), every one with importance "minor": background people who know only everyday things, hold no clue and no secret that matters, and send players to each other.
- Anything a GM character knew, saw or held that matters moves to a player character (private_info, starting_knowledge, hidden_facts), to a place, or into a clue found in a place. A clue's where is a place, never a GM character.
- Remove every other GM character from the story completely: truth, timeline, clues, hints, rounds, opening and background.
- Rewrite truth, public_timeline, clues, key_deductions, phases, hint_ladder, opening_scene and background so they all fit. Keep case_question (write one if it is missing).

Follow every design rule and the writing style.
${problems.length ? `\nA previous draft broke these rules, avoid them:\n- ${problems.join('\n- ')}\n` : ''}
THE MYSTERY:
${JSON.stringify(scenario)}`;
}

export function castProblems(before, after, { npcs, hints }) {
  const problems = [];
  const players = (s) => s.players.map((p) => `${p.id}|${p.character_name}|${p.side}`).join(',');
  if (players(before) !== players(after)) problems.push('The players, their names or their sides changed.');
  if ([...before.truth.culprit_ids].sort().join() !== [...after.truth.culprit_ids].sort().join()) problems.push('The culprits changed.');
  problems.push(...validateScenario(after, { playerCount: before.players.length, phases: before.phases.length, hints, npcs, npcRole: 'background' }));
  return problems;
}

export function applyRework(game, scenario, { npcs }, now = Date.now()) {
  const keep = { illustration: game.state?.illustration ?? null, mapEdits: game.state?.mapEdits ?? {} };
  attachScenario(game, scenario, now);
  game.state.illustration = keep.illustration;
  game.state.mapEdits = Object.fromEntries(Object.entries(keep.mapEdits).filter(([id]) => scenario.locations.some((l) => l.id === id)));
  game.setup = { ...game.setup, npcs, npcRole: 'background' };
  return game;
}

function args(argv) {
  const out = { npcs: 2, file: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--npcs') out.npcs = Number(argv[(i += 1)]);
    else out.file = argv[i];
  }
  return out;
}

async function makeDraft(game, opts) {
  const gm = new GM({ workDir: join(tmpdir(), 'detective-gm'), setupEffort: 'medium', log: (m) => console.log(m) });
  const hints = game.setup?.hints ?? 1;
  let problems = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    console.log(attempt === 1 ? 'The GM is reworking the story. This takes a few minutes.' : 'The first try broke a rule. The GM is trying again.');
    let last = null;
    const after = await gm.call(`rework#${attempt}`, {
      system: GENERATION_SYSTEM,
      prompt: reworkPrompt(game.scenario, { npcs: opts.npcs, players: game.players.length }, problems),
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
    problems = castProblems(game.scenario, after, { npcs: opts.npcs, hints });
    if (!problems.length) {
      await gm.completeCards(after);
      return after;
    }
  }
  console.log(`Not saved. The GM could not keep to the rules:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

async function main() {
  const opts = args(process.argv.slice(2));
  if (!Number.isInteger(opts.npcs) || opts.npcs < 0 || opts.npcs > 6) {
    console.log('Use --npcs with a number from 0 to 6.');
    process.exit(1);
  }
  const file = gameFile(opts.file);
  const draftFile = join(dirname(file), 'rework-draft.json');
  const game = await readJson(file);
  if (!game?.scenario || game.status !== 'reading') {
    console.log('This only works before round 1 starts (while everyone is reading their cards).');
    process.exit(1);
  }
  const draft = await readJson(draftFile);
  const ready = draft?.gameId === game.id && draft?.npcs === opts.npcs ? draft.scenario : null;
  const up = await serverIsUp();

  if (up && ready) {
    console.log(`The new story is ready. ${STOP_FIRST}`);
    return;
  }
  const scenario = ready ?? await makeDraft(game, opts);
  if (!ready) await writeFile(draftFile, JSON.stringify({ gameId: game.id, npcs: opts.npcs, scenario }));
  if (await serverIsUp()) {
    console.log(`The new story is ready. ${STOP_FIRST}`);
    return;
  }

  const fresh = await readJson(file);
  await copyFile(file, file.replace(/\.json$/, '.before-rework.json'));
  applyRework(fresh, scenario, opts);
  await writeFile(file, JSON.stringify(fresh));
  await rm(draftFile, { force: true });
  console.log(`Done. "${scenario.title}" now centres on the players.`);
  console.log(`People the GM plays (background only): ${scenario.npcs.map((n) => `${n.name}, ${n.role_title}`).join('; ') || 'none'}`);
  console.log('Everyone should read their card again: it may have changed. Round 0 starts from the beginning.');
  console.log(`The old version is in ${file.replace(/\.json$/, '.before-rework.json')}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
