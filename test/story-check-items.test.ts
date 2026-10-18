import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATION_SYSTEM, storyCheckPrompt } from '../server/prompts.ts';
import { makeScenario } from './fixtures.ts';

describe('the check reads for impossible clues, motives and goals', () => {
  test('should ask the check for impossible clues, motive sources and reachable goals', () => {
    const p = storyCheckPrompt(makeScenario(3));
    assert.match(p, /9\. No clue or witness carries a mark of something that happens later, or of a place they were not at\./);
    assert.match(p, /10\. Every suspect's motive can be learned in play: from a clue, a card or a GM character's sheet\./);
    assert.match(p, /11\. Every player's goal can be reached: the thing or person it needs exists and can be found\./);
  });

  test('should keep the secretly kind victim out of hidden facts and clues too', () => {
    assert.match(GENERATION_SYSTEM, /Do not make the twist "the victim was secretly kind"\. Do not use it in hidden facts or late clues either\./);
  });
});
