import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { publicSystem } from '../server/prompts.ts';
import { cleanRead } from '../server/reader.ts';
import { gameInReading } from './fixtures.ts';

describe('fixes from the story playtest', () => {
  test('should hand the out-loud GM alibis as claims nobody checked, never as a record', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const pub = G.publicKnowledge(game);
    assert.ok('alibis_claimed_not_checked' in pub);
    assert.ok(!('where_people_say_they_were' in pub));
    const sys = publicSystem(pub);
    assert.match(sys, /alibis_claimed_not_checked is only what each person says/);
    assert.match(sys, /Never call anything "the record"/);
  });

  test('should keep a whole spoken line, not cut it at 30 words', () => {
    const line = Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ');
    assert.equal(cleanRead({ kind: 'say', said_aloud: line }, 'move').said_aloud, line);
  });
});
