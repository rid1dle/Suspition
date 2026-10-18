import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup } from '../server/game.ts';
import { SCENARIO_SCHEMA, STORY_CHECK_SCHEMA, AUDIT_SCHEMA, storyCheckPrompt } from '../server/prompts.ts';
import { applyStoryPatches } from '../server/story.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM, makeScenario } from './fixtures.ts';

const workDir = tmpdir();
const lobby = () => {
  const g = createGame();
  for (const name of ['A', 'B', 'C']) addPlayer(g, { name });
  applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
  return g;
};
const rules = { playerCount: 3, phases: 3, hints: 2 };

// A fake GM run that answers by schema: worlds, checks (in order) and an empty card check.
function fakeRun(checks, { worlds = [() => makeScenario(3, { phases: 3, hints: 2 })] } = {}) {
  const calls = [];
  const run = async (opts) => {
    calls.push(opts);
    if (opts.schema === SCENARIO_SCHEMA) return worlds[Math.min(calls.filter((c) => c.schema === SCENARIO_SCHEMA).length, worlds.length) - 1]();
    if (opts.schema === STORY_CHECK_SCHEMA) {
      const next = checks.shift();
      if (next instanceof Error) throw next;
      return next;
    }
    if (opts.schema === AUDIT_SCHEMA) return { players: [] };
    throw new Error('unexpected call');
  };
  return { run, calls };
}
const ok = { verdict: 'ok', problems: [], patches: [] };

describe('the consistency check', () => {
  test('should keep the world when the check says ok', async () => {
    const logs = [];
    const { run, calls } = fakeRun([ok]);
    const gm = new GM({ workDir, random: () => 0, run, log: (l) => logs.push(l) });
    const world = await gm.generate(lobby());
    assert.equal(world.clues[0].shows, 'CLUE-1-SHOWS');
    const check = calls.find((c) => c.schema === STORY_CHECK_SCHEMA);
    assert.equal(check.timeoutMs, 180_000);
    assert.match(check.prompt, /^You check a mystery for holes before anyone plays it\./);
    assert.match(check.prompt, /The code already found these problems:[\s\S]*spread:/);
    assert.ok(logs.some((l) => l === 'gm story check: ok, 0 patches, 0 skipped'), logs.join('\n'));
    assert.ok(!logs.some((l) => /CLUE-|MOTIVE|Character 1/.test(l)), 'logs never carry the world');
  });

  test('should apply allowed patches and skip others', async () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyStoryPatches(s, [
      { path: 'clues.0.shows', value: 'A glove, wet at the cuff.' },
      { path: 'clues.2.reveal_round', value: '2' },
      { path: 'red_herrings', value: JSON.stringify([{ points_at: 'p3', clue_ids: ['c3'], why_convincing: 'W', refuted_by_clue_ids: ['c2'] }]) },
      { path: 'truth.culprit_ids', value: '["p2"]' },
      { path: 'clues.9.shows', value: 'nothing there' },
    ], rules);
    assert.equal(out.applied, 3);
    assert.equal(s.clues[0].shows, 'A glove, wet at the cuff.');
    assert.equal(s.clues[2].reveal_round, 2);
    assert.equal(s.red_herrings[0].points_at, 'p3');
    assert.deepEqual(s.truth.culprit_ids, ['p1']);
    assert.equal(out.skipped.length, 2);
    assert.match(out.skipped.join(), /truth\.culprit_ids/);
    assert.match(out.skipped.join(), /clues\.9\.shows/);

    const { run } = fakeRun([{ verdict: 'patch', problems: [{ what: 'x', fix: 'y' }], patches: [{ path: 'clues.0.shows', value: 'NEW' }, { path: 'truth.method', value: 'poison' }] }]);
    const logs = [];
    const world = await new GM({ workDir, random: () => 0, run, log: (l) => logs.push(l) }).generate(lobby());
    assert.equal(world.clues[0].shows, 'NEW');
    assert.equal(world.truth.method, 'METHOD');
    assert.ok(logs.includes('gm story check: patch, 1 patches, 1 skipped'), logs.join('\n'));
  });

  test('should undo patches that break the world', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyStoryPatches(s, [{ path: 'clues.0.shows', value: 'CHANGED' }, { path: 'clues.1.where', value: 'n9' }], rules);
    assert.equal(out.applied, 0);
    assert.equal(s.clues[0].shows, 'CLUE-1-SHOWS');
    assert.equal(s.clues[1].where, 'l2');
    assert.equal(out.skipped.length, 2);
    const t = makeScenario(3, { phases: 3, hints: 2 });
    assert.equal(applyStoryPatches(t, [{ path: 'clues.0.reveal_round', value: '7' }], rules).applied, 0);
    assert.equal(t.clues[0].reveal_round, 1);
    const u = makeScenario(3, { phases: 3, hints: 2 });
    assert.equal(applyStoryPatches(u, [{ path: 'suspects', value: 'not json' }], rules).applied, 0);
    assert.equal(u.suspects.length, 3);
  });

  test('should rewrite once when the check asks and an attempt is left, with the problems in the prompt', async () => {
    const { run, calls } = fakeRun([{ verdict: 'rewrite', problems: [{ what: 'Hole in the timeline', fix: 'Move the cook' }], patches: [] }, ok]);
    await new GM({ workDir, random: () => 0, run }).generate(lobby());
    const drafts = calls.filter((c) => c.schema === SCENARIO_SCHEMA);
    assert.equal(drafts.length, 2);
    assert.match(drafts[1].prompt, /A previous draft broke these rules[\s\S]*Hole in the timeline/);
    assert.equal(calls.filter((c) => c.schema === STORY_CHECK_SCHEMA).length, 2);
  });

  test('should apply the patches when a rewrite is asked and no attempt is left', async () => {
    const rewrite = { verdict: 'rewrite', problems: [{ what: 'Hole', fix: 'Fix' }], patches: [{ path: 'clues.0.shows', value: 'PATCHED' }] };
    const { run, calls } = fakeRun([rewrite, rewrite]);
    const world = await new GM({ workDir, random: () => 0, run }).generate(lobby());
    assert.equal(calls.filter((c) => c.schema === SCENARIO_SCHEMA).length, 2);
    assert.equal(world.clues[0].shows, 'PATCHED');
  });

  test('should keep the first world when the rewrite comes back broken', async () => {
    const { run } = fakeRun([{ verdict: 'rewrite', problems: [{ what: 'Hole', fix: 'Fix' }], patches: [] }], { worlds: [() => makeScenario(3, { phases: 3, hints: 2 }), () => makeScenario(2)] });
    const world = await new GM({ workDir, random: () => 0, run }).generate(lobby());
    assert.equal(world.players.length, 3);
  });

  test('should keep the world when the check fails or times out', async () => {
    const logs = [];
    const { run } = fakeRun([new Error('GM took longer than 180s.')]);
    const world = await new GM({ workDir, random: () => 0, run, log: (l) => logs.push(l) }).generate(lobby());
    assert.equal(world.clues[0].shows, 'CLUE-1-SHOWS');
    assert.ok(logs.some((l) => /^gm story check skipped: GM took longer/.test(l)));
    assert.ok(logs.some((l) => /^gm story issues: .*spread 1/.test(l)), logs.join('\n'));
  });

  test('should show "Checking the story for holes" while it runs', async () => {
    const steps = [];
    const { run } = fakeRun([ok]);
    await new GM({ workDir, random: () => 0, run }).generate(lobby(), (e) => steps.push(e.kind));
    assert.ok(steps.indexOf('story') > steps.indexOf('checking'));
    assert.ok(steps.indexOf('story') < steps.indexOf('cards'));

    const gm = new FakeGM();
    gm.gate = new Promise(() => {});
    gm.progressEvents = [{ kind: 'attempt', attempt: 1 }, { kind: 'plan', steps: [{ title: 'Booking the wedding', covers: ['title'] }, { title: 'Hiding the clues', covers: ['clues'] }, { title: 'Giving secrets', covers: ['players'] }] }, { kind: 'checking' }, { kind: 'story' }];
    const app = await new App({ gm, store: new MemoryStore(), clock: () => 1_000 }).init();
    for (const name of ['A', 'B', 'C']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'cozy', length: 'short', hints: 2 });
    const p = app.tableView().progress;
    assert.equal(p.step, 'story');
    assert.ok(p.steps.some((s) => s.id === 'story' && s.label === 'Checking the story for holes'));
    assert.deepEqual(p.plan.at(-1), { title: 'Checking the story for holes', state: 'active' });
  });

  test('should put the fixed checklist and the issues in the check prompt', () => {
    const prompt = storyCheckPrompt(makeScenario(3), ['spread: too few']);
    assert.match(prompt, /7\. Every red herring is convincing and ruled out by a different, later clue\./);
    assert.match(prompt, /The code already found these problems: \n- spread: too few/);
    assert.match(prompt, /Choose rewrite only when the story cannot be fixed with patches\./);
  });
});
