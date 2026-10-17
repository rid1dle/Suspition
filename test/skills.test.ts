import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMove, scoreMoves, playTotal, skillSplit, rating, RUBRIC_VERSION, SKILLS, SKILL_LABELS } from '../server/skills.ts';

const clean = { claims: [], out_of_world: false, sways_gm: false };

describe('play points', () => {
  test('should take a point and tag swaying when the reader says the move sways the GM, even if the GM gave +2', () => {
    const m = scoreMove({ points: 2, skill: 'persuading', why: 'great' }, { ...clean, sways_gm: true }, { from: 'private' });
    assert.equal(m.points, -1);
    assert.equal(m.skill, 'swaying');
    assert.equal(m.rubric, RUBRIC_VERSION);
  });

  test('should tag breaking when a move only makes claims and the GM gave nothing', () => {
    const m = scoreMove({ points: 0, skill: 'none', why: '' }, { ...clean, claims: ['everyone believes me'] }, { from: 'private' });
    assert.deepEqual([m.points, m.skill], [-1, 'breaking']);
  });

  test('should take one point off a real move that also made a claim', () => {
    const m = scoreMove({ points: 2, skill: 'searching', why: 'found the glove' }, { ...clean, claims: ['no one sees me'] }, { from: 'private' });
    assert.deepEqual([m.points, m.skill], [1, 'searching']);
    const thin = scoreMove({ points: 1, skill: 'bluffing', why: 'x' }, { ...clean, claims: ['the world helps me'] }, { from: 'private' });
    assert.deepEqual([thin.points, thin.skill], [0, null]);
  });

  test('should cap out-loud questions at one point and never below zero for asking', () => {
    assert.equal(scoreMove({ points: 2, skill: 'questioning', why: '' }, clean, { from: 'out loud' }).points, 1);
    assert.equal(scoreMove({ points: -1, skill: 'breaking', why: '' }, clean, { from: 'out loud' }).points, 0);
  });

  test('should give no skill to an ordinary move and refuse made-up skills', () => {
    assert.equal(scoreMove({ points: 0, skill: 'searching', why: '' }, clean, { from: 'private' }).skill, null);
    assert.equal(scoreMove({ points: 1, skill: 'mind control', why: '' }, clean, { from: 'private' }).skill, null);
    assert.equal(scoreMove(null, clean, { from: 'private' }).points, 0);
  });

  test('should credit a real find and add a separate swaying demerit', () => {
    const moves = scoreMoves({ points: 2, skill: 'searching', why: 'You found the wrench.' }, { ...clean, sways_gm: true }, { from: 'private' });
    assert.deepEqual(moves.map((m) => [m.points, m.skill]), [[2, 'searching'], [-1, 'swaying']]);
    assert.match(moves[1].why, /game master/);
  });

  test('should give only the swaying demerit when there was no real move', () => {
    assert.deepEqual(scoreMoves({ points: 0, skill: 'none', why: '' }, { ...clean, sways_gm: true }, { from: 'private' }).map((m) => [m.points, m.skill]), [[-1, 'swaying']]);
    assert.deepEqual(scoreMoves({ points: 1, skill: 'searching', why: '' }, clean, { from: 'private' }).map((m) => m.points), [1]);
  });

  test("should clamp a player's play total to -2..3", () => {
    const m = (points) => ({ points, skill: 'searching', rubric: RUBRIC_VERSION });
    assert.equal(playTotal([m(2), m(2), m(2)]), 3);
    assert.equal(playTotal([m(-1), m(-1), m(-1)]), -2);
    assert.equal(playTotal([]), 0);
  });

  test('should ignore moves scored under an older rubric', () => {
    assert.equal(playTotal([{ points: 2, skill: 'searching', rubric: RUBRIC_VERSION - 1 }, { points: 1, skill: 'searching', rubric: RUBRIC_VERSION }]), 1);
  });

  test('should split points by skill', () => {
    const r = RUBRIC_VERSION;
    assert.deepEqual(skillSplit([{ points: 2, skill: 'questioning', rubric: r }, { points: 1, skill: 'questioning', rubric: r }, { points: -1, skill: 'swaying', rubric: r }, { points: 0, skill: null, rubric: r }]), { questioning: 3, swaying: -1 });
  });

  test('should rate a player from points per move with at least four moves counted', () => {
    const r = RUBRIC_VERSION;
    const out = rating([{ points: 2, skill: 'questioning', rubric: r }]);
    assert.equal(out.overall, 0.5);
    assert.deepEqual(out.bySkill.questioning, { points: 2, moves: 1, perMove: 2 });
    assert.equal(rating(Array(8).fill({ points: 1, skill: 'searching', rubric: r })).overall, 1);
  });

  test('should name every skill in plain words', () => {
    for (const s of [...SKILLS, 'breaking', 'swaying']) assert.ok(SKILL_LABELS[s], s);
    assert.equal(SKILL_LABELS.swaying, 'Swaying the GM');
  });
});
