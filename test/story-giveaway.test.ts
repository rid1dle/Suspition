import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { storyIssues, pointsAtCulprit } from '../server/story.ts';
import { GENERATION_SYSTEM, storyCheckPrompt } from '../server/prompts.ts';
import { makeScenario } from './fixtures.ts';

const players = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `Player${i}` }));
const world = () => {
  const s = makeScenario(4);
  s.players[0].role_title = 'Head Gardener';
  s.players[1].role_title = 'Night Guard';
  s.players[2].role_title = 'Day Guard';
  return s;
};
const giveaways = (s) => storyIssues(s, { players, difficulty: 'normal', rounds: 3 }).filter((l) => l.startsWith('giveaway:'));

describe('giveaways by role, in every round', () => {
  test("should flag a clue that names the culprit's role when only they have it", () => {
    const s = world();
    s.clues[1].shows = 'Soil from the gardener\'s boots on the stairs.';
    assert.match(giveaways(s).join(), /clues\[1\]\.shows/);
    assert.equal(pointsAtCulprit(s, players, 'A gardener was seen.'), true);
  });

  test('should not count small words in a role title, like from or with', () => {
    const s = world();
    s.players[0].role_title = 'Tea Broker from Calcutta';
    s.clues[1].shows = 'A cup fell from the loft ladder.';
    assert.equal(pointsAtCulprit(s, players, 'A fall from the loft ladder'), false);
    assert.deepEqual(giveaways(s), []);
    assert.equal(pointsAtCulprit(s, players, 'The broker was seen.'), true);
  });

  test('should not flag a role word two characters share', () => {
    const s = world();
    s.players[0].role_title = 'Guard Captain';
    s.clues[1].shows = 'A guard walked past the window.';
    assert.deepEqual(giveaways(s), []);
  });

  test('should flag a last-round clue that names the culprit', () => {
    const s = world();
    s.clues[1].reveal_round = 3;
    s.clues[1].shows = 'Character 1 signed the ledger.';
    assert.match(giveaways(s).join(), /clues\[1\]\.shows/);
  });

  test('should ask the GM never to single out the culprit by role, initial or trait', () => {
    assert.match(GENERATION_SYSTEM, /Never single out the culprit by a role, an initial or a trait only they have\./);
    assert.match(storyCheckPrompt(makeScenario(3)), /a role, an initial or a trait only they have/);
  });
});
