import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM } from '../server/prompts.ts';
import { makeScenario as baseScenario, whereaboutsFor } from './fixtures.ts';

const makeScenario = (n, opts = {}) => {
  const s = baseScenario(n, opts);
  s.truth.whereabouts = whereaboutsFor(s);
  return s;
};

const rules = { playerCount: 4, phases: 3, hints: 3 };
const errorsOf = (s) => G.validateScenario(s, rules).join(' | ');

describe('suspects, red herrings, whereabouts and clue rounds in the world', () => {
  test('should ask for suspects, built red herrings, whereabouts and clue rounds in the world', () => {
    const p = SCENARIO_SCHEMA.properties;
    assert.deepEqual(Object.keys(p.truth.properties.crime.properties), ['time', 'location_id']);
    assert.deepEqual(Object.keys(p.truth.properties.whereabouts.items.properties), ['time', 'character_id', 'location_id', 'doing', 'seen_by']);
    assert.deepEqual(Object.keys(p.suspects.items.properties), ['character_id', 'motive_against_victim', 'where_at_crime_time', 'alibi_witness', 'pointer_clue_ids', 'cleared_by_clue_ids']);
    assert.deepEqual(Object.keys(p.red_herrings.items.properties), ['points_at', 'clue_ids', 'why_convincing', 'refuted_by_clue_ids']);
    assert.deepEqual(p.clues.items.properties.reveal_round, { type: 'integer', minimum: 1, maximum: 5 });
    assert.deepEqual(p.key_deductions.items.properties.about.enum, ['culprit', 'method', 'motive', 'other']);
    for (const phrase of ['Everyone is a suspect.', 'a secret crime of their own is not a motive', 'Red herrings are built, not labelled.', '"It is a different crime" never rules anything out.', 'Never write in a clue\'s own text that it has nothing to do with the death.', 'No giveaways.', 'Each clue has a reveal_round', 'Whereabouts: in truth.whereabouts', 'Nobody but the culprit and the victim is at truth.crime\'s place at its time', 'Do not make the twist "the victim was secretly kind".']) {
      assert.ok(GENERATION_SYSTEM.includes(phrase), `missing: ${phrase}`);
    }
    assert.ok(!GENERATION_SYSTEM.includes('Innocent players hide real things'), 'the old herring rule is replaced');
  });

  test('should fail a draft whose suspects miss a character or name an unknown clue', () => {
    const s = makeScenario(4);
    s.suspects = s.suspects.filter((x) => x.character_id !== 'p3');
    assert.match(errorsOf(s), /p3 needs a suspects entry/);
    const t = makeScenario(4);
    t.suspects[1].pointer_clue_ids = ['c99'];
    assert.match(errorsOf(t), /suspects .*p2.* unknown clue c99/);
    const u = makeScenario(4);
    u.red_herrings[0].refuted_by_clue_ids = ['c42'];
    assert.match(errorsOf(u), /red_herrings .* unknown clue c42/);
    const v = makeScenario(4);
    v.red_herrings[0].points_at = 'p9';
    assert.match(errorsOf(v), /red_herrings .* unknown character p9/);
    const w = makeScenario(4);
    w.truth.whereabouts[0].location_id = 'l9';
    assert.match(errorsOf(w), /truth\.whereabouts .* unknown place l9/);
    const x = makeScenario(4);
    x.truth.crime.location_id = 'nowhere';
    assert.match(errorsOf(x), /truth\.crime\.location_id must be a place/);
  });

  test('should name a clue that sits nowhere real, for the story check to fix', () => {
    const s = makeScenario(4);
    assert.deepEqual(G.clueWhereErrors(s), []);
    s.clues[0].where = 'under the big rug';
    assert.match(G.clueWhereErrors(s).join(), /Clue c1 sits nowhere real/);
  });

  test('should fail a draft whose clue opens after the last round', () => {
    const t = makeScenario(4);
    t.clues[1].reveal_round = 4;
    assert.match(errorsOf(t), /Clue c2 opens in round 4; the game has 3 rounds/);
    const u = makeScenario(4);
    delete u.clues[2].reveal_round;
    assert.match(errorsOf(u), /Clue c3 opens in round undefined/);
  });

  test('should fail a draft with no deduction about the culprit, the method or the motive', () => {
    for (const about of ['culprit', 'method', 'motive']) {
      const s = makeScenario(4);
      for (const k of s.key_deductions) if (k.about === about) k.about = 'other';
      assert.match(errorsOf(s), new RegExp(`Need a key deduction about the ${about}`));
    }
  });

  test('should pass the fixture world after it gains the new fields', () => {
    assert.deepEqual(G.validateScenario(makeScenario(4), rules), []);
    assert.deepEqual(G.validateScenario(makeScenario(5, { phases: 4 }), { ...rules, playerCount: 5, phases: 4 }), []);
  });

  test('should still pass an old world without the new fields', () => {
    const s = makeScenario(4);
    delete s.suspects;
    delete s.red_herrings;
    delete s.truth.crime;
    delete s.truth.whereabouts;
    for (const c of s.clues) delete c.reveal_round;
    for (const k of s.key_deductions) delete k.about;
    s.clues[0].where = 'under the big rug';
    assert.deepEqual(G.validateScenario(s, rules), []);
  });
});

describe('names written where ids belong', () => {
  test('should turn character and place names into ids in the story fields', () => {
    const s = makeScenario(4);
    s.red_herrings[0].points_at = 'Character 2';
    s.suspects[1].character_id = 'character 2';
    s.truth.whereabouts[1].location_id = 'The Kitchen';
    s.truth.whereabouts[1].seen_by = ['The Butler'];
    s.truth.crime.location_id = 'Ballroom';
    s.clues[0].where = 'the ballroom';
    G.resolveStoryIds(s);
    assert.equal(s.red_herrings[0].points_at, 'p2');
    assert.equal(s.suspects[1].character_id, 'p2');
    assert.equal(s.truth.whereabouts[1].location_id, 'l2');
    assert.deepEqual(s.truth.whereabouts[1].seen_by, ['n1']);
    assert.equal(s.truth.crime.location_id, 'l1');
    assert.equal(s.clues[0].where, 'l1');
    assert.deepEqual(G.validateScenario(s, rules), []);
  });

  test('should leave a name that matches nobody as it is, so the check still catches it', () => {
    const s = makeScenario(4);
    s.red_herrings[0].points_at = 'Somebody Else';
    G.resolveStoryIds(s);
    assert.equal(s.red_herrings[0].points_at, 'Somebody Else');
    assert.match(G.validateScenario(s, rules).join(), /unknown character Somebody Else/);
  });
});
