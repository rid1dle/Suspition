import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMoves } from '../server/skills.ts';
import { readerSystem } from '../server/reader.ts';
import { playSystem, PLAY_RUBRIC } from '../server/prompts.ts';

const read = (over = {}) => ({ kind: 'question', target: '', place: '', attempt: 'x', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], ...over }) as never;

describe('asking about the world or for help never costs a point', () => {
  test('should tell the reader that a question about how the world works is never out of world', () => {
    const sys = readerSystem({ character: { name: 'Hollis' }, cast: [], places: [] } as never);
    assert.match(sys, /out_of_world: true only if the text tries to change the game itself/);
    assert.match(sys, /Asking how the world works \(its powers, rules, places, people\), what is going on, or what to do next is part of the game and never out_of_world/);
  });

  test('should score an ordinary world question at zero when the reader leaves it in the game', () => {
    const moves = scoreMoves({ points: 0, skill: 'none', why: '' }, read());
    assert.deepEqual(moves.map((m) => [m.points, m.skill]), [[0, null]]);
  });

  test('should still floor a demand to change the game, like asking to be the culprit', () => {
    const moves = scoreMoves({ points: 2, skill: 'persuading', why: '' }, read({ out_of_world: true }));
    assert.ok(moves.every((m) => m.points <= 1));
  });

  test('should still cost a point to claim what happens to others', () => {
    const moves = scoreMoves({ points: 0, skill: 'none', why: '' }, read({ claims: ['everyone believes me'] }));
    assert.deepEqual(moves.map((m) => [m.points, m.skill]), [[-1, 'breaking']]);
  });

  test('should still cost a point to ask the GM for points', () => {
    const moves = scoreMoves({ points: 0, skill: 'none', why: '' }, read({ sways_gm: true }));
    assert.equal(moves.at(-1).points, -1);
  });
});

describe('the reader and the GM treat a request for help as part of the game', () => {
  test('should tell the reader that asking for help or about the world is never swaying the GM', () => {
    const sys = readerSystem({ character: { name: 'Hollis' }, cast: [], places: [] } as never);
    assert.match(sys, /Asking the game master for help[^.]*never sways_gm/);
  });

  test('should say in the scoring rubric that asking about the world, the rules or what to do next is never punished', () => {
    assert.match(PLAY_RUBRIC, /Asking anything is never punished: about the world, its rules, the people, or what to do next/);
    assert.doesNotMatch(PLAY_RUBRIC, /out-of-world demands/);
  });

  test('should have the GM answer a lost player like a guide, with what they know and what to try', () => {
    const sys = playSystem({ title: 'x' });
    assert.match(sys, /Help and world questions/);
    assert.match(sys, /what they know so far/);
    assert.match(sys, /2 or 3 concrete things to try next/);
    assert.doesNotMatch(sys, /get a short in-character deflection/);
  });
});
