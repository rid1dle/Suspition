import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { storyIssues } from '../server/story.ts';
import { GENERATION_SYSTEM, storyCheckPrompt } from '../server/prompts.ts';
import { makeScenario, whereaboutsFor } from './fixtures.ts';

const kinds = (s, kind) => storyIssues(s, { players: [], difficulty: 'easy', rounds: 3 }).filter((l) => l.startsWith(`${kind}:`));
const world = () => {
  const s = makeScenario(4);
  s.truth.whereabouts = whereaboutsFor(s);
  return s;
};

describe('herrings that mislead', () => {
  test('should flag a herring whose target has a witness at the crime time', () => {
    const s = world();
    assert.deepEqual(kinds(s, 'herring').filter((l) => /witness/.test(l)), []);
    s.suspects[1].alibi_witness = 'The Butler';
    assert.match(kinds(s, 'herring').join(), /red_herrings\[0\].*p2.*witness/);
    const t = world();
    t.truth.whereabouts[1].seen_by = ['n1'];
    assert.match(kinds(t, 'herring').join(), /red_herrings\[0\].*p2.*witness/);
  });

  test('should flag a suspect cleared before anything points at them', () => {
    const s = world();
    assert.deepEqual(kinds(s, 'suspect').filter((l) => /before/.test(l)), []);
    s.suspects[2].pointer_clue_ids = ['c2'];
    s.suspects[2].cleared_by_clue_ids = ['c3'];
    assert.match(kinds(s, 'suspect').join(), /suspects\[2\].*cleared.*before/);
  });

  test('should ask for refutations that make the herring impossible', () => {
    assert.match(GENERATION_SYSTEM, /The refutation must make it impossible, not just less likely\./);
    assert.match(storyCheckPrompt(makeScenario(3)), /impossible, not just less likely/);
  });
});
