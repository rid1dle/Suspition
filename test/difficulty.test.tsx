import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DIFFICULTIES, difficultyRules, difficultyPrompt } from '../src/lib/difficulty.ts';
import * as G from '../server/game.ts';
import { generationPrompt } from '../server/prompts.ts';
import { Setup } from '../src/app/table/setup';

const lobby = (n = 4) => {
  const game = G.createGame(1);
  for (let i = 0; i < n; i += 1) G.addPlayer(game, { name: `P${i + 1}` });
  return game;
};

describe('difficulty', () => {
  test('should give normal by default and for an unknown level', () => {
    assert.deepEqual(DIFFICULTIES, ['easy', 'normal', 'hard']);
    assert.deepEqual(difficultyRules(undefined, 3), difficultyRules('normal', 3));
    assert.deepEqual(difficultyRules('impossible', 3), difficultyRules('normal', 3));
  });

  test('should ask for more clues, rounds and herrings as it gets harder', () => {
    const pick = (l) => {
      const r = difficultyRules(l, 3);
      return [r.culpritClues, r.culpritRounds, r.herrings, r.hintNames];
    };
    assert.deepEqual(pick('easy'), [2, 1, 2, 'middle']);
    assert.deepEqual(pick('normal'), [3, 2, 3, 'last']);
    assert.deepEqual(pick('hard'), [4, 3, 6, 'never']);
  });

  test('should never ask for more rounds than the game has', () => {
    assert.equal(difficultyRules('hard', 3, 2).culpritRounds, 2);
    assert.equal(difficultyRules('hard', 3, 5).culpritRounds, 3);
  });

  test('should keep the chosen difficulty in the setup, normal when missing', () => {
    const base = { tone: 'tense', length: 'short', hints: 3 };
    const a = lobby();
    G.applySetup(a, { ...base, difficulty: 'hard' });
    assert.equal(a.setup.difficulty, 'hard');
    const b = lobby();
    G.applySetup(b, base);
    assert.equal(b.setup.difficulty, 'normal');
    const c = lobby();
    G.applySetup(c, { ...base, difficulty: 'nightmare' });
    assert.equal(c.setup.difficulty, 'normal');
  });

  test('should state the difficulty rules in the world prompt', () => {
    assert.match(difficultyPrompt('normal', 3, 4), /at least 3 clues from at least 2 rounds/);
    assert.match(difficultyPrompt('hard', 3, 4), /no hint names a person/i);
    const game = lobby();
    G.applySetup(game, { tone: 'tense', length: 'standard', hints: 3, difficulty: 'hard' });
    const prompt = generationPrompt(game, [], ['p1']);
    assert.match(prompt, /at least 4 clues from at least 3 rounds/);
    assert.match(prompt, /6 red herrings/);
  });

  test('should offer Easy, Normal and Hard on setup with Normal explained', () => {
    const html = renderToStaticMarkup(<Setup view={{ players: [], surprise: null } as any} host act={() => {}} /> as any).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /How hard\?/);
    for (const label of ['Easy', 'Normal', 'Hard']) assert.match(html, new RegExp(`\\b${label}\\b`));
    assert.match(html, /Normal: the culprit takes 3 clues from 2 rounds to name\./);
  });
});
