import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { publicSystem, playSystem, CONTINUITY_RULES } from '../server/prompts.ts';

describe('the GM never lies, but may hold things back', () => {
  test('should back true reveals and never confirm or expose a lie out loud', () => {
    const p = publicSystem({});
    assert.match(p, /You never lie: everything you say is true\. You may hold things back to keep the game interesting\./);
    assert.match(p, /When a player tells the room something true, back it up\./);
    assert.match(p, /When a player lies or bends the story to the room, never confirm it, and do not expose it unless evidence the room has already seen does: stay vague, say nobody can confirm it yet, or point to where it could be checked\./);
  });

  test('should hold to the same rule in private answers', () => {
    assert.match(playSystem({}), /You never lie: everything you say is true\. You may hold things back to keep the game interesting\./);
  });

  test("should keep a player's lie out of the established facts", () => {
    assert.match(CONTINUITY_RULES, /What a player says out loud is not a fact: put it in canon only as "<name> said \.\.\.", never as true\./);
  });
});
