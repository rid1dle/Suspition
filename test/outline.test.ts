import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup } from '../server/game.ts';
import { SCENARIO_SCHEMA, OUTLINE_SCHEMA, OUTLINE_REVIEW_SCHEMA, OUTLINE_REVIEW_SYSTEM } from '../server/prompts.ts';
import { makeScenario } from './fixtures.ts';

// Story runs 4 to 6: the worlds scored 7 as designs before anyone played ("the who is too easy", "the culprit has
// nothing to play"), and patching a finished world moved that by a point at most. The design is now planned and
// reviewed first, while it is cheap to change, and the world is written from it.
const workDir = tmpdir();
const lobby = () => {
  const g = createGame();
  for (const name of ['Asha', 'Bina', 'Chetan']) addPlayer(g, { name });
  applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
  return g;
};
const outline = { premise: 'PREMISE-X', culprits_play: 'COVER-X', who_stays_hidden: ['KEY-ALSO-FITS-X'], false_solution: 'FALSE-X', layers: ['LAYER-X'], planted_early_paid_late: ['PLANT-X'], final_choice: 'CHOICE-X', rounds: [{ round: 1, beat: 'BEAT-X', question: 'Q-X', wrong_theories: ['WRONG-X'], atmosphere: 'RAIN-X' }] };
const review = { interest: 7, lotm: 6, notes: ['NOTE-X: the key fits only one person.'] };

function fakeRun({ out = outline, rev = review, worlds = 1 } = {}) {
  const calls = [];
  let written = 0;
  const run = async (opts) => {
    calls.push(opts);
    if (opts.schema === OUTLINE_SCHEMA) {
      if (out instanceof Error) throw out;
      return out;
    }
    if (opts.schema === OUTLINE_REVIEW_SCHEMA) {
      if (rev instanceof Error) throw rev;
      return rev;
    }
    if (opts.schema === SCENARIO_SCHEMA) {
      written += 1;
      return written < worlds ? makeScenario(2, { phases: 3, hints: 2 }) : makeScenario(3, { phases: 3, hints: 2 });
    }
    return { verdict: 'ok', problems: [], patches: [], players: [] };
  };
  return { run, calls };
}

describe('a world is planned and reviewed before it is written', () => {
  test('should outline, review, then write the world from both', async () => {
    const { run, calls } = fakeRun();
    await new GM({ workDir, random: () => 0, run, outline: true }).generate(lobby());
    const order = calls.map((c) => c.schema).filter((x) => [OUTLINE_SCHEMA, OUTLINE_REVIEW_SCHEMA, SCENARIO_SCHEMA].includes(x));
    assert.deepEqual(order, [OUTLINE_SCHEMA, OUTLINE_REVIEW_SCHEMA, SCENARIO_SCHEMA]);
    const write = calls.find((c) => c.schema === SCENARIO_SCHEMA);
    for (const s of ['PREMISE-X', 'KEY-ALSO-FITS-X', 'CHOICE-X', 'WRONG-X', 'NOTE-X: the key fits only one person.']) assert.ok(write.prompt.includes(s), s);
    const rv = calls.find((c) => c.schema === OUTLINE_REVIEW_SCHEMA);
    assert.equal(rv.system, OUTLINE_REVIEW_SYSTEM);
    assert.ok(rv.prompt.includes('PREMISE-X'));
  });

  test('should ask the outline for what keeps the who hidden, the culprit\'s play and the final choice', async () => {
    const { run, calls } = fakeRun();
    await new GM({ workDir, random: () => 0, run, outline: true }).generate(lobby());
    const ask = calls.find((c) => c.schema === OUTLINE_SCHEMA);
    assert.match(ask.prompt, /^Design a mystery/);
    assert.match(ask.prompt, /write only its design/);
    for (const k of ['who_stays_hidden', 'culprits_play', 'final_choice', 'planted_early_paid_late', 'wrong_theories']) assert.ok(JSON.stringify(OUTLINE_SCHEMA).includes(k), k);
  });

  test('should keep the outline when a draft is written again', async () => {
    const { run, calls } = fakeRun({ worlds: 2 });
    await new GM({ workDir, random: () => 0, run, outline: true }).generate(lobby());
    const writes = calls.filter((c) => c.schema === SCENARIO_SCHEMA);
    assert.equal(writes.length, 2);
    assert.ok(writes[1].prompt.includes('PREMISE-X'));
    assert.equal(calls.filter((c) => c.schema === OUTLINE_SCHEMA).length, 1, 'planned once');
  });

  test('should write from the outline alone when the review fails', async () => {
    const { run, calls } = fakeRun({ rev: new Error('GM took longer than 180s.') });
    await new GM({ workDir, random: () => 0, run, outline: true }).generate(lobby());
    const write = calls.find((c) => c.schema === SCENARIO_SCHEMA);
    assert.ok(write.prompt.includes('PREMISE-X'));
    assert.ok(!write.prompt.includes('NOTE-X'));
  });

  test('should write the world as before when the outline fails', async () => {
    const logs = [];
    const { run, calls } = fakeRun({ out: new Error('GM took longer than 300s.') });
    const world = await new GM({ workDir, random: () => 0, run, outline: true, log: (l) => logs.push(l) }).generate(lobby());
    assert.equal(world.players.length, 3);
    assert.ok(!calls.find((c) => c.schema === SCENARIO_SCHEMA).prompt.includes('THE DESIGN TO BUILD'));
    assert.ok(logs.some((l) => /gm outline skipped/.test(l)), logs.join('\n'));
  });

  test('should not plan first when the GM was not asked to', async () => {
    const { run, calls } = fakeRun();
    await new GM({ workDir, random: () => 0, run }).generate(lobby());
    assert.equal(calls.filter((c) => c.schema === OUTLINE_SCHEMA).length, 0);
  });

  test('should log the review\'s scores, never the design', async () => {
    const logs = [];
    const { run } = fakeRun();
    await new GM({ workDir, random: () => 0, run, outline: true, log: (l) => logs.push(l) }).generate(lobby());
    assert.ok(logs.includes('gm outline review: interest 7, lotm 6, 1 note'), logs.join('\n'));
    assert.ok(!logs.some((l) => /-X/.test(l)), 'logs never carry the design');
  });
});
