import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { STORY_CRAFT, VOICE_CHECK_SYSTEM } from '../server/prompts.ts';

describe('the players solve the case, not the GM characters', () => {
  test('should tell the GM a character never agrees a theory is right or says what clues prove together', () => {
    assert.match(STORY_CRAFT, /The players solve it\./);
    assert.match(STORY_CRAFT, /never agrees that a theory of who did it, or how, is right/);
    assert.match(STORY_CRAFT, /never tells players what to compare/);
  });

  test('should have the knowledge check drop lines that solve the case for the players', () => {
    assert.match(VOICE_CHECK_SYSTEM, /solving for the players/);
    assert.match(VOICE_CHECK_SYSTEM, /So yes, it fits/);
    assert.match(VOICE_CHECK_SYSTEM, /what two clues prove together/);
  });
});
