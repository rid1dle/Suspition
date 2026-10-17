import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Sfx, notesFor, SOUND_NAMES } from '../src/lib/sfx.ts';

describe('sound sets per world', () => {
  test('should change how each sound is played for soft, tense and playful worlds', () => {
    const tense = notesFor('clue', 'tense');
    const soft = notesFor('clue', 'soft');
    const playful = notesFor('clue', 'playful');
    assert.equal(tense.length, soft.length);
    assert.ok(playful[0][0] > tense[0][0], 'playful is higher');
    assert.ok(soft.every((n) => n[3] === 'sine'), 'soft is gentle sine tones');
    assert.ok(soft[0][2] > tense[0][2], 'soft notes ring longer');
    for (const name of SOUND_NAMES) assert.ok(notesFor(name, 'playful').length, name);
  });

  test('should play nothing before the first tap', () => {
    const sfx = new Sfx();
    sfx.setSet('playful');
    assert.equal(sfx.play('news'), false);
  });
});
