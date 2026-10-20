import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup } from '../server/game.ts';
import { SCENARIO_SCHEMA, STORY_CHECK_SCHEMA, AUDIT_SCHEMA, HUNT_SCHEMA, HUNT_SYSTEM, huntPrompt } from '../server/prompts.ts';
import { applyStoryPatches } from '../server/story.ts';
import { makeScenario } from './fixtures.ts';

const workDir = tmpdir();
const lobby = () => {
  const g = createGame();
  for (const name of ['Asha', 'Bina', 'Chetan']) addPlayer(g, { name });
  applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
  return g;
};
const rules = { playerCount: 3, phases: 3, hints: 2 };
const ok = { verdict: 'ok', problems: [], patches: [] };
const none = { holes: [], contradictions: [], unpaid_setups: [], unplanted_payoffs: [], dead_branches: [] };
const REPAIR = /These problems were found and are not fixed yet/;

function fakeRun({ hunt = none, repair = ok } = {}) {
  const calls = [];
  const run = async (opts) => {
    calls.push(opts);
    if (opts.schema === SCENARIO_SCHEMA) return makeScenario(3, { phases: 3, hints: 2 });
    if (opts.schema === HUNT_SCHEMA) {
      if (hunt instanceof Error) throw hunt;
      return hunt;
    }
    if (opts.schema === STORY_CHECK_SCHEMA) return REPAIR.test(opts.prompt) ? repair : ok;
    if (opts.schema === AUDIT_SCHEMA) return { players: [] };
    return {};
  };
  return { run, calls };
}

describe('a reader hunts the finished world for holes before play', () => {
  test('should read the world after the cards are written', async () => {
    const { run, calls } = fakeRun();
    await new GM({ workDir, random: () => 0, run, hunt: true }).generate(lobby());
    const cards = calls.findIndex((c) => c.schema === AUDIT_SCHEMA);
    const hunt = calls.findIndex((c) => c.schema === HUNT_SCHEMA);
    assert.ok(cards >= 0 && hunt > cards, `cards at ${cards}, hunt at ${hunt}`);
    assert.equal(calls[hunt].system, HUNT_SYSTEM);
  });

  test('should not hunt when the GM was not asked to', async () => {
    const { run, calls } = fakeRun();
    await new GM({ workDir, random: () => 0, run }).generate(lobby());
    assert.equal(calls.filter((c) => c.schema === HUNT_SCHEMA).length, 0);
  });

  test('should send every problem it found to one repair, by kind', async () => {
    const { run, calls } = fakeRun({ hunt: { ...none, holes: ['The money is never found.'], unpaid_setups: ['The elephants in the tea rows.'] } });
    await new GM({ workDir, random: () => 0, run, hunt: true }).generate(lobby());
    const repairs = calls.filter((c) => c.schema === STORY_CHECK_SCHEMA && REPAIR.test(c.prompt));
    assert.equal(repairs.length, 1);
    assert.match(repairs[0].prompt, /- Hole: The money is never found\./);
    assert.match(repairs[0].prompt, /- Set up and never used: The elephants in the tea rows\./);
    assert.match(repairs[0].prompt, /change every place that states it/);
  });

  test('should apply the repair patches to the world', async () => {
    const { run } = fakeRun({
      hunt: { ...none, holes: ['Nothing says why the glove is wet.'] },
      repair: { verdict: 'patch', problems: [], patches: [{ path: 'clues.0.shows', value: 'A glove, wet from the well.' }] },
    });
    const world = await new GM({ workDir, random: () => 0, run, hunt: true }).generate(lobby());
    assert.equal(world.clues[0].shows, 'A glove, wet from the well.');
  });

  test('should not call a repair when the hunt finds nothing', async () => {
    const { run, calls } = fakeRun();
    await new GM({ workDir, random: () => 0, run, hunt: true }).generate(lobby());
    assert.equal(calls.filter((c) => REPAIR.test(c.prompt ?? '')).length, 0);
  });

  test('should keep the world playable when the hunt fails', async () => {
    const logs = [];
    const { run, calls } = fakeRun({ hunt: new Error('GM took longer than 300s.') });
    const world = await new GM({ workDir, random: () => 0, run, log: (l) => logs.push(l), hunt: true }).generate(lobby());
    assert.equal(world.clues[0].shows, 'CLUE-1-SHOWS');
    assert.equal(calls.filter((c) => REPAIR.test(c.prompt ?? '')).length, 0);
    assert.ok(logs.some((l) => /gm hunt skipped/.test(l)), logs.join('\n'));
  });

  test('should log only how many problems of each kind it found, never the world', async () => {
    const logs = [];
    const { run } = fakeRun({ hunt: { ...none, holes: ['CLUE-1-SHOWS has no cause.', 'Character 1 is in two places.'] } });
    await new GM({ workDir, random: () => 0, run, log: (l) => logs.push(l), hunt: true }).generate(lobby());
    assert.ok(logs.includes('gm hunt: holes 2'), logs.join('\n'));
    assert.ok(!logs.some((l) => /CLUE-|Character 1/.test(l)), 'logs never carry the world');
  });
});

describe('what the hunt reads', () => {
  test('should show the reader the truth, the cards, the clues and the round plans', () => {
    const p = huntPrompt(makeScenario(3, { phases: 3, hints: 2 }));
    for (const s of ['OPENING', 'PRIVATE-1', 'CLUE-1-SHOWS', 'NPC-SECRET']) assert.ok(p.includes(s), s);
  });

  test('should ask for things set up and never used, and payoffs nothing planted', () => {
    assert.match(HUNT_SYSTEM, /unpaid_setups/);
    assert.match(HUNT_SYSTEM, /unplanted_payoffs/);
    assert.deepEqual(Object.keys(HUNT_SCHEMA.properties).sort(), ['contradictions', 'dead_branches', 'holes', 'unpaid_setups', 'unplanted_payoffs']);
  });
});

describe('a repair may cut a detail nothing uses', () => {
  test('should let a patch rewrite the opening scene, the background, the key objects and a place', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyStoryPatches(s, [
      { path: 'opening_scene', value: 'Rain on the roof.' },
      { path: 'background', value: '["The estate is old."]' },
      { path: 'key_objects', value: JSON.stringify([{ name: 'A key', about: 'Brass.', where: 'l1', where_is_public: true }]) },
      { path: 'locations.0.public_info', value: 'Big and cold' },
      { path: 'phases.1.planned_beat', value: 'The cook remembers the bell.' },
    ], rules);
    assert.equal(out.applied, 5, JSON.stringify(out.skipped));
    assert.equal(s.opening_scene, 'Rain on the roof.');
    assert.deepEqual(s.background, ['The estate is old.']);
    assert.equal(s.key_objects[0].name, 'A key');
    assert.equal(s.locations[0].public_info, 'Big and cold');
    assert.equal(s.phases[1].planned_beat, 'The cook remembers the bell.');
  });

  test('should undo a repair patch that names the culprit in the opening scene', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyStoryPatches(s, [{ path: 'opening_scene', value: 'Character 1 stands by the well, soaked.' }], rules, { players: [] });
    assert.equal(out.applied, 0);
    assert.equal(s.opening_scene, 'OPENING');
  });
});
