import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickTwists, generationPrompt, TWISTS, SCENARIO_SCHEMA, GENERATION_SYSTEM } from '../server/prompts.js';
import { createGame, addPlayer, applySetup } from '../server/game.js';

const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('pickTwists', () => {
  test('should pick two different twists for a small group', () => {
    const picked = pickTwists(4, seq(0, 0));
    assert.equal(picked.length, 2);
    assert.notEqual(picked[0].id, picked[1].id);
  });

  test('should never offer a culprit team below six players', () => {
    for (let i = 0; i < 200; i += 1) {
      assert.ok(!pickTwists(5).some((t) => t.id === 'culprit-team'));
    }
  });

  test('should pick three twists for six or more players and allow a culprit team', () => {
    const last = 0.999;
    const picked = pickTwists(6, seq(last, last, last));
    assert.equal(picked.length, 3);
    assert.ok(picked.some((t) => t.id === 'culprit-team'));
  });

  test('should vary between games', () => {
    const seen = new Set(Array.from({ length: 50 }, () => pickTwists(4).map((t) => t.id).sort().join('+')));
    assert.ok(seen.size > 5, `only ${seen.size} combinations in 50 games`);
  });
});

describe('generationPrompt', () => {
  const game = (n) => {
    const g = createGame();
    for (let i = 0; i < n; i += 1) addPlayer(g, { name: `P${i}`, wish: i === 0 ? 'a retired spy' : '' });
    applySetup(g, { setting: 'A ski lodge', tone: 'funny', length: 'long', hints: 4, notes: 'no gore' });
    return g;
  };

  test('should carry the setup answers, wishes and chosen twists', () => {
    const twists = [TWISTS[0], TWISTS[3]];
    const prompt = generationPrompt(game(4), twists);
    for (const text of ['A ski lodge', 'funny', 'exactly 5', 'at least 5', 'no gore', 'a retired spy', TWISTS[0].text, TWISTS[3].text]) {
      assert.ok(prompt.includes(text), `missing ${text}`);
    }
  });

  test('should ask for two unaware culprits when the culprit-team twist is drawn', () => {
    const team = TWISTS.find((t) => t.id === 'culprit-team');
    assert.match(generationPrompt(game(6), [team]), /Exactly two culprits/);
  });
});

describe('scenario schema', () => {
  test('should require a soundtrack with closed choices the browser can play', () => {
    assert.ok(SCENARIO_SCHEMA.required.includes('music'));
    const music = SCENARIO_SCHEMA.properties.music;
    assert.ok(music.properties.palette.enum.includes('music_box'));
    assert.ok(music.properties.mode.enum.includes('phrygian'));
    assert.match(GENERATION_SYSTEM, /music: the game's soundtrack/);
    assert.match(GENERATION_SYSTEM, /12-year-old/);
    assert.match(GENERATION_SYSTEM, /never "phase"/);
    assert.match(GENERATION_SYSTEM, /start_location/);
  });
});
