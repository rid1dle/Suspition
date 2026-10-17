import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QUESTIONS, QUESTION_KINDS, pickQuestions } from '../server/questions.js';
import { usernameFor, newProfile, addAnswer, aboutForGM, recordGame, profileView } from '../server/profiles.js';
import { People } from '../server/store.js';
import * as G from '../server/game.js';
import { gameInReading } from './fixtures.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('question bank', () => {
  test('should have 24 short questions with four choices each', () => {
    assert.equal(QUESTIONS.length, 24);
    for (const q of QUESTIONS) {
      assert.equal(q.choices.length, 4, q.id);
      assert.ok(QUESTION_KINDS.includes(q.kind), q.id);
      assert.ok(!/—/.test(q.question + q.choices.join('')), q.id);
    }
    assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 24);
  });

  test('should pick three unanswered questions across kinds', () => {
    const answered = QUESTIONS.filter((q) => q.kind === 'group').slice(0, 5).map((q) => q.id);
    const picked = pickQuestions(answered, 3, seq(0.1, 0.5, 0.9, 0.3));
    assert.equal(picked.length, 3);
    assert.equal(new Set(picked.map((q) => q.kind)).size, 3);
    assert.ok(picked.every((q) => !answered.includes(q.id)));
  });

  test('should pick none once every question is answered', () => {
    assert.deepEqual(pickQuestions(QUESTIONS.map((q) => q.id)), []);
  });
});

describe('profiles', () => {
  test('should make nikhil-2 when nikhil is taken', () => {
    assert.equal(usernameFor('Nikhil'), 'nikhil');
    assert.equal(usernameFor(' Nikhil Rao! ', ['nikhil-rao']), 'nikhil-rao-2');
    assert.equal(usernameFor('Nikhil', ['nikhil', 'nikhil-2']), 'nikhil-3');
    assert.equal(usernameFor('!!!'), 'player');
  });

  test("should keep each person's latest answer to a question", () => {
    const p = newProfile('asha', 'Asha', 1);
    addAnswer(p, { id: 'party', answer: 'The quiet watcher' }, 2);
    addAnswer(p, { id: 'party', answer: 'First to leave' }, 3);
    assert.deepEqual(p.answers, [{ id: 'party', question: 'At a party you are usually...', answer: 'First to leave', at: 3 }]);
    assert.deepEqual(aboutForGM(p).about, [{ question: 'At a party you are usually...', answer: 'First to leave' }]);
  });

  const finished = () => {
    const game = gameInReading(3);
    game.status = 'reveal';
    game.state.persona = { p2: { intent: 'You are clearing Ben.', persona: 'You are bold.' } };
    game.state.play = { p2: [{ points: 2, skill: 'questioning', rubric: 1 }, { points: 1, skill: 'searching', rubric: 1 }] };
    game.state.result = { players: [{ player_id: 'p2', culprit_correct: true, method_score: 1, motive_score: 0, goal_achieved: true, play: 3, skills: { questioning: 2, searching: 1 }, coaching: 'Share sooner.' }] };
    return game;
  };

  test('should record a game with its skill split, coaching and an updated rating', () => {
    const p = newProfile('ben', 'Ben', 1);
    const game = finished();
    recordGame(p, game, 'p2');
    recordGame(p, game, 'p2');
    assert.equal(p.games.length, 1);
    const g = p.games[0];
    assert.deepEqual([g.title, g.character, g.side, g.points, g.play, g.coaching], ['The Test Case', 'Character 2', 'investigator', 3, 3, 'Share sooner.']);
    assert.deepEqual(g.skills, { questioning: 2, searching: 1 });
    assert.equal(g.persona, 'You are bold.');
    assert.deepEqual(p.skills.questioning, { points: 2, moves: 1 });
    assert.equal(p.rating.overall, 0.75);
    assert.deepEqual(aboutForGM(p).played_before, [{ side: 'investigator', persona: 'You are bold.', points: 3, play: 3 }]);
  });

  test('should hide answers unless the full view is asked for', () => {
    const p = newProfile('ben', 'Ben', 1);
    addAnswer(p, { id: 'party', answer: 'First to leave' }, 2);
    assert.equal(profileView(p).answers, undefined);
    assert.equal(profileView(p, { full: true }).answers.length, 1);
  });

  test('should describe how the skill split changed from the game before', () => {
    const p = newProfile('ben', 'Ben', 1);
    p.games = [{ gameId: 'a', skills: { questioning: 1, searching: 2 } }, { gameId: 'b', skills: { questioning: 3, searching: 0 }, coaching: 'Keep asking.' }];
    p.skills = { questioning: { points: 4, moves: 3 }, searching: { points: 2, moves: 2 }, swaying: { points: -1, moves: 1 } };
    const v = profileView(p);
    assert.equal(v.change, 'Questioning up, Searching down');
    assert.equal(v.coaching, 'Keep asking.');
    assert.deepEqual(v.skills.map((s) => s.skill), ['questioning', 'searching', 'swaying']);
    assert.equal(v.skills[2].label, 'Swaying the GM');
  });

  test('should save and list profiles on disk', async () => {
    const people = new People(await mkdtemp(join(tmpdir(), 'people-')));
    assert.deepEqual(await people.list(), []);
    await people.save(newProfile('asha', 'Asha', 1));
    assert.deepEqual(await people.list(), [{ username: 'asha', name: 'Asha' }]);
    assert.equal((await people.load('asha')).name, 'Asha');
    assert.equal(await people.load('nobody'), null);
    assert.equal(await people.load('../etc'), null);
  });
});
