import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reworkPrompt, castProblems, applyRework } from '../scripts/rework-cast.js';
import { gameInReading, makeScenario } from './fixtures.js';

const background = (s) => {
  s.npcs = s.npcs.slice(0, 2).map((n) => ({ ...n, importance: 'minor' }));
  s.clues = s.clues.map((c) => ({ ...c, where: 'l1' }));
  return s;
};

describe('reworking the cast of a game that has not started', () => {
  test('should ask for the chosen number of background GM characters and keep the players', () => {
    const prompt = reworkPrompt(makeScenario(3), { npcs: 2, players: 3 });
    assert.match(prompt, /centres on the 3 player characters/);
    assert.match(prompt, /exactly 2 GM characters \(ids n1 to n2\), every one with importance "minor"/);
    assert.match(reworkPrompt(makeScenario(3), { npcs: 1, players: 3 }, ['Bad thing.']), /ids n1\)[\s\S]*avoid them:\n- Bad thing\./);
  });

  test('should accept a rework that keeps players, sides and culprits', () => {
    assert.deepEqual(castProblems(makeScenario(3), background(makeScenario(3)), { npcs: 2, hints: 3 }), []);
  });

  test('should refuse a rework that renames a player, changes a side or the culprits', () => {
    const after = background(makeScenario(3));
    after.players[1].character_name = 'Someone Else';
    after.truth.culprit_ids = ['p2'];
    const problems = castProblems(makeScenario(3), after, { npcs: 2, hints: 3 });
    assert.ok(problems.includes('The players, their names or their sides changed.'));
    assert.ok(problems.includes('The culprits changed.'));
  });

  test('should refuse GM characters that still matter', () => {
    const after = makeScenario(3);
    assert.match(castProblems(makeScenario(3), after, { npcs: 2, hints: 3 }).join(), /Every GM character must be minor/);
  });

  test('should restart the intro with the new world and keep the picture and room spots', () => {
    const game = gameInReading(3);
    game.state.illustration = '<svg/>';
    game.state.mapEdits = { l1: { room: 'sofa' }, l9: { room: 'gone' } };
    game.state.ready = { p1: true };
    game.state.brief.step = 5;
    const after = background(makeScenario(3));
    after.opening_scene = 'NEW OPENING';
    applyRework(game, after, { npcs: 2 }, 5_000);
    assert.equal(game.scenario, after);
    assert.deepEqual([game.status, game.state.brief.step, game.state.ready], ['reading', 0, {}]);
    assert.equal(game.state.events[0].text, 'NEW OPENING');
    assert.equal(game.state.illustration, '<svg/>');
    assert.deepEqual(game.state.mapEdits, { l1: { room: 'sofa' } });
    assert.deepEqual([game.setup.npcs, game.setup.npcRole], [2, 'background']);
  });
});
