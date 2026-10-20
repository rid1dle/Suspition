import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup } from '../server/game.ts';
import { applyFixPatches } from '../server/story.ts';
import { worldFixPrompt } from '../server/prompts.ts';
import { makeScenario } from './fixtures.ts';

const workDir = tmpdir();
const game = () => {
  const g = createGame();
  for (const name of ['A', 'B', 'C']) addPlayer(g, { name });
  applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
  return g;
};
const rules = { playerCount: 3, phases: 3, hints: 2 };
const oneBadDeduction = () => {
  const s = makeScenario(3, { phases: 3, hints: 2 });
  s.key_deductions[0].clue_ids = ['c1'];
  return s;
};

describe('a draft with a few small problems is patched, not written again', () => {
  test('should patch the problems and go on, writing the world only once', async () => {
    const kinds = [];
    const gm = new GM({ workDir, random: () => 0, run: async ({ prompt }) => {
      if (/^A draft of this mystery breaks/.test(prompt)) return (kinds.push('fix'), { verdict: 'patch', problems: [], patches: [{ path: 'key_deductions.0.clue_ids', value: '["c1","c2"]' }] });
      if (/^Design a mystery/.test(prompt)) return (kinds.push('write'), oneBadDeduction());
      if (/^You check a mystery for holes/.test(prompt)) return (kinds.push('check'), { verdict: 'ok', problems: [], patches: [] });
      return (kinds.push('other'), {});
    } });
    const s = await gm.generate(game());
    assert.deepEqual(s.key_deductions[0].clue_ids, ['c1', 'c2']);
    assert.equal(kinds.filter((k) => k === 'write').length, 1);
    assert.equal(kinds.filter((k) => k === 'fix').length, 1);
  });

  test('should write the world again when the patches do not fix it', async () => {
    const kinds = [];
    const gm = new GM({ workDir, random: () => 0, run: async ({ prompt }) => {
      if (/^A draft of this mystery breaks/.test(prompt)) return (kinds.push('fix'), { verdict: 'patch', problems: [], patches: [] });
      if (/^Design a mystery/.test(prompt)) return (kinds.push('write'), kinds.filter((k) => k === 'write').length === 1 ? oneBadDeduction() : makeScenario(3, { phases: 3, hints: 2 }));
      return { verdict: 'ok', problems: [], patches: [] };
    } });
    await gm.generate(game());
    assert.deepEqual(kinds.filter((k) => k !== 'other'), ['write', 'fix', 'write']);
  });

  test('should not try to patch a draft with the wrong players or culprits', async () => {
    const kinds = [];
    const gm = new GM({ workDir, random: () => 0, run: async ({ prompt }) => {
      if (/^A draft of this mystery breaks/.test(prompt)) return (kinds.push('fix'), { verdict: 'patch', problems: [], patches: [] });
      if (/^Design a mystery/.test(prompt)) return (kinds.push('write'), kinds.length === 1 ? makeScenario(2, { phases: 3, hints: 2 }) : makeScenario(3, { phases: 3, hints: 2 }));
      return { verdict: 'ok', problems: [], patches: [] };
    } });
    await gm.generate(game());
    assert.deepEqual(kinds, ['write', 'write']);
  });
});

describe('fix patches', () => {
  test('should type each value like the field it replaces and add list items at the end', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyFixPatches(s, [
      { path: 'key_deductions.0.clue_ids', value: '["c2","c3"]' },
      { path: 'clues.0.reveal_round', value: '2' },
      { path: 'clues.0.can_be_destroyed', value: 'false' },
      { path: 'hint_ladder.3', value: '{"text":"A new hint.","is_false":false}' },
      { path: 'players.0.goal', value: 'Get the letter back.' },
    ], rules);
    assert.equal(out.applied, 5, JSON.stringify(out.skipped));
    assert.deepEqual(s.key_deductions[0].clue_ids, ['c2', 'c3']);
    assert.equal(s.clues[0].reveal_round, 2);
    assert.equal(s.clues[0].can_be_destroyed, false);
    assert.equal(s.hint_ladder[3].text, 'A new hint.');
    assert.equal(s.players[0].goal, 'Get the letter back.');
  });

  test('should undo a patch that leaves the world more broken', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyFixPatches(s, [{ path: 'key_deductions.1.clue_ids', value: '["c1"]' }], rules);
    assert.equal(out.applied, 0);
    assert.deepEqual(s.key_deductions[1].clue_ids, ['c2', 'c3']);
  });

  test('should refuse a value that is not the shape of the field', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyFixPatches(s, [{ path: 'key_deductions.0.clue_ids', value: 'c1 and c2' }], rules);
    assert.equal(out.applied, 0);
  });

  test('should name the problems and forbid changing the culprits', () => {
    const p = worldFixPrompt(makeScenario(3), ['Deduction k1 needs at least 2 existing clues.']);
    assert.match(p, /^A draft of this mystery breaks these rules/);
    assert.match(p, /- Deduction k1 needs at least 2 existing clues\./);
    assert.match(p, /Never change who the culprits are/);
  });
});

describe('a draft that runs out of time', () => {
  test('should try once more, thinking less, instead of failing the game', async () => {
    const efforts = [];
    const gm = new GM({ workDir, random: () => 0, setupEffort: 'medium', run: async ({ prompt, effort }) => {
      if (/^Design a mystery/.test(prompt)) {
        efforts.push(effort);
        if (efforts.length === 1) throw new Error('GM took longer than 1200s.');
        return makeScenario(3, { phases: 3, hints: 2 });
      }
      return { verdict: 'ok', problems: [], patches: [] };
    } });
    const s = await gm.generate(game());
    assert.equal(s.players.length, 3);
    assert.deepEqual(efforts, ['medium', 'low']);
  });

  test('should still fail on an error that is not about time', async () => {
    const gm = new GM({ workDir, random: () => 0, run: async () => { throw new Error('Usage limit reached'); } });
    await assert.rejects(() => gm.generate(game()), /Usage limit/);
  });
});
