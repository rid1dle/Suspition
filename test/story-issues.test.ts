import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { storyIssues } from '../server/story.ts';
import { makeScenario } from './fixtures.ts';

const players = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `Player${i}` }));

// A world that meets Normal: 3 culprit clues over 2 rounds, a built herring per innocent, a suspect entry for everyone.
function goodWorld(phases = 3) {
  const s = makeScenario(4, { phases });
  s.npcs[1].importance = 'minor';
  s.clues.push({ id: 'c4', name: 'Boot print', where: 'l2', shows: 'CLUE-4-SHOWS', does_not_prove: '', importance: 'essential', can_be_destroyed: false, reveal_round: 2 });
  s.key_deductions[0].clue_ids = ['c1', 'c2', 'c4'];
  s.suspects.push({ character_id: 'n1', motive_against_victim: 'MOTIVE-N1', where_at_crime_time: 'Kitchen', alibi_witness: '', pointer_clue_ids: ['c3'], cleared_by_clue_ids: ['c2'] });
  s.red_herrings = ['p2', 'p3', 'p4'].map((id) => ({ points_at: id, clue_ids: ['c3'], why_convincing: 'WHY', refuted_by_clue_ids: ['c2'] }));
  return s;
}
const issues = (s, opts = {}) => storyIssues(s, { players, difficulty: 'normal', rounds: s.phases.length, ...opts });
const only = (list, kind) => list.filter((l) => l.startsWith(`${kind}:`));

describe('story issues found by code', () => {
  test('should find nothing wrong in a well-made world', () => {
    assert.deepEqual(issues(goodWorld()), []);
  });

  test('should return nothing for an old world without the new fields', () => {
    const s = makeScenario(4);
    delete s.suspects;
    delete s.red_herrings;
    s.clues[0].shows = 'Character 1 did it.';
    assert.deepEqual(issues(s), []);
  });

  test('should find a clue that names the culprit before the last round', () => {
    const s = goodWorld();
    s.clues[0].shows = 'A glove with Character 1 stitched inside.';
    const found = only(issues(s), 'giveaway');
    assert.equal(found.length, 1);
    assert.match(found[0], /clues\[0\]\.shows/);
    s.clues[0].reveal_round = 3;
    assert.deepEqual(only(issues(s), 'giveaway'), []);
  });

  test('should find a culprit\'s name in a hint or a card line', () => {
    const s = goodWorld();
    s.hint_ladder[0].text = 'Look hard at Player1.';
    s.players[2].public_info = 'Owes money to Character 1.';
    s.players[3].distrust_why = 'Character 1 lied about the shed.';
    s.phases[1].options = ['Character 1', 'Someone else'];
    const found = only(issues(s), 'giveaway').join('\n');
    assert.match(found, /hint_ladder\[0\]\.text/);
    assert.match(found, /players\[2\]\.public_info/);
    assert.match(found, /players\[3\]\.distrust_why/);
    assert.match(found, /phases\[1\]\.options/);
  });

  test('should let the last hint name a person on Normal, the middle one on Easy and none on Hard', () => {
    const s = goodWorld();
    const last = s.hint_ladder.length - 1;
    s.hint_ladder[last].text = 'It was Character 1.';
    assert.deepEqual(only(issues(s), 'giveaway'), []);
    assert.equal(only(issues(s, { difficulty: 'hard' }), 'giveaway').length, 1);
    s.hint_ladder[last].text = 'HINT';
    s.hint_ladder[2].text = 'It was Character 1.';
    assert.equal(only(issues(s), 'giveaway').length, 1);
    assert.deepEqual(only(issues(s, { difficulty: 'easy' }), 'giveaway'), []);
  });

  test('should let a culprit introduce themselves by name', () => {
    const s = goodWorld();
    s.players[0].intro_line = 'I am Character 1, the cook.';
    assert.deepEqual(only(issues(s), 'giveaway'), []);
  });

  test('should find culprit clues that are too few or bunched in one round', () => {
    const s = goodWorld();
    s.key_deductions[0].clue_ids = ['c1', 'c2'];
    assert.match(only(issues(s), 'spread').join(), /key_deductions.*2 clues.*needs 3/);
    const t = goodWorld();
    t.clues[3].reveal_round = 1;
    t.clues[1].reveal_round = 1;
    assert.match(only(issues(t), 'spread').join(), /1 round.*needs 2/);
  });

  test('should count rounds for a Hard game of 3 rounds', () => {
    const s = goodWorld(3);
    s.clues.push({ id: 'c5', name: 'Key', where: 'l1', shows: 'CLUE-5-SHOWS', does_not_prove: '', importance: 'essential', can_be_destroyed: false, reveal_round: 3 });
    s.key_deductions[0].clue_ids = ['c1', 'c2', 'c4', 'c5'];
    assert.deepEqual(only(issues(s, { difficulty: 'hard' }), 'spread'), []);
    s.clues[4].reveal_round = 2;
    assert.equal(only(issues(s, { difficulty: 'hard' }), 'spread').length, 1);
  });

  test('should find a suspect with no motive, no pointer or a clearing clue that also points', () => {
    const s = goodWorld();
    s.suspects[1].motive_against_victim = '';
    s.suspects[2].pointer_clue_ids = [];
    s.suspects[3].cleared_by_clue_ids = ['c3'];
    const found = only(issues(s), 'suspect').join('\n');
    assert.match(found, /suspects\[1\].*motive/);
    assert.match(found, /suspects\[2\].*no clue points/);
    assert.match(found, /suspects\[3\].*clears and points/);
  });

  test('should find a culprit who has a clearing clue and a GM character with no entry', () => {
    const s = goodWorld();
    s.suspects[0].cleared_by_clue_ids = ['c2'];
    s.suspects = s.suspects.filter((x) => x.character_id !== 'n1');
    const found = only(issues(s), 'suspect').join('\n');
    assert.match(found, /suspects\[0\].*culprit.*clear/);
    assert.match(found, /n1.*no suspects entry/);
  });

  test('should find too few herrings, one at the culprit, and one refuted too early', () => {
    const s = goodWorld();
    s.red_herrings = s.red_herrings.slice(0, 2);
    assert.match(only(issues(s), 'herring').join(), /2 red herrings.*needs 3/);
    const t = goodWorld();
    t.red_herrings[0].points_at = 'p1';
    assert.match(only(issues(t), 'herring').join(), /red_herrings\[0\].*culprit/);
    const u = goodWorld();
    u.red_herrings[1].refuted_by_clue_ids = ['c3'];
    assert.match(only(issues(u), 'herring').join(), /red_herrings\[1\].*rules itself out/);
    const v = goodWorld();
    v.red_herrings[2].refuted_by_clue_ids = ['c1'];
    assert.match(only(issues(v), 'herring').join(), /red_herrings\[2\].*later round/);
  });

  test('should find an innocent at the crime place at the crime time who was awake', () => {
    const s = goodWorld();
    s.truth.whereabouts[2].location_id = 'l1';
    assert.match(only(issues(s), 'presence').join(), /truth\.whereabouts\[2\].*p3/);
    s.truth.whereabouts[2].doing = 'Asleep in the corner chair.';
    assert.deepEqual(only(issues(s), 'presence'), []);
  });

  test('should find a clue that sits nowhere real', () => {
    const s = goodWorld();
    s.clues[1].where = 'behind the clock';
    assert.match(only(issues(s), 'where').join(), /Clue c2 sits nowhere real/);
  });
});
