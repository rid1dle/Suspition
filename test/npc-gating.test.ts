import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { storyIssues, applyStoryPatches } from '../server/story.ts';
import { gameInReading, makeScenario } from './fixtures.ts';

const LATER = 'The ledger shows a payment of nine hundred rupees on Friday night.';
const playing = () => {
  const game = gameInReading(4, 1_000);
  game.scenario.clues[1].shows = LATER;
  game.scenario.npcs[0].reveals_freely = 'He serves drinks all night. He saw a payment of nine hundred rupees in the ledger on Friday night.';
  G.startPlay(game, 1_000);
  return game;
};

describe('GM characters keep later clues until their round', () => {
  test('should hide a sheet sentence that retells a later clue from the out-loud answerer', () => {
    const game = playing();
    const sheet = G.peopleAsked(game, 'Butler, what did you see?')[0];
    assert.equal(sheet.reveals_freely, 'He serves drinks all night.');
    G.beginPhaseChange(game);
    G.completePhase(game, { public_event: 'x' }, 2_000);
    assert.match(G.peopleAsked(game, 'Butler?')[0].reveals_freely, /nine hundred rupees/);
  });

  test('should keep sheet sentences that share only a few words', () => {
    const game = playing();
    game.scenario.npcs[0].reveals_freely = 'He keeps the ledger on Friday.';
    assert.equal(G.peopleAsked(game, 'Butler?')[0].reveals_freely, 'He keeps the ledger on Friday.');
  });

  test('should list a GM character who gives away a later clue', () => {
    const s = makeScenario(4);
    s.clues[1].shows = LATER;
    s.npcs[0].reveals_freely = 'He saw a payment of nine hundred rupees in the ledger on Friday night.';
    const found = storyIssues(s, { players: [], difficulty: 'normal', rounds: 3 }).filter((l) => l.startsWith('leak:'));
    assert.equal(found.length, 1);
    assert.match(found[0], /npcs\[0\]\.reveals_freely.*c2.*round 2/);
  });

  test('should let the check patch reveals_freely', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    const out = applyStoryPatches(s, [{ path: 'npcs.0.reveals_freely', value: 'He serves drinks.' }, { path: 'npcs.0.reveals_under_pressure', value: 'He saw the ledger.' }], { playerCount: 3, phases: 3, hints: 2 });
    assert.equal(out.applied, 2);
    assert.equal(s.npcs[0].reveals_freely, 'He serves drinks.');
  });
});
