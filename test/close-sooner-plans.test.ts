import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading, emptyPhase } from './fixtures.ts';

// From story run 6: the story closed after round 3, and the Rajmata's secret, set to crack in round 4, never came out.
function closingGame() {
  const game = gameInReading(4, 1_000, { questions: true, phases: 5 });
  game.setup.replays = 0;
  G.startPlay(game, 1_000);
  G.beginPhaseChange(game);
  G.completePhase(game, emptyPhase, 1_001);
  game.state.found.p2.push('c1', 'c2', 'c3');
  const n = game.scenario.npcs[0];
  n.importance = 'important';
  n.agenda = { wants: 'W', plan: [{ round: 2, does: 'Watches.' }, { round: 4, does: 'Burns the ledger.' }], leaves: '', cracks: { round: 5, how: 'She tells of her doubt.' } };
  game.scenario.setups = [{ id: 's1', detail: 'The bell.', shown_in: 'background', shown_round: 0, paid_by: 'round 4', how_paid: 'x' }];
  return game;
}

describe('a story that closes sooner keeps what was planned for the rounds it cut', () => {
  test('should move plan steps, secrets and setups from cut rounds into the closing round', () => {
    const game = closingGame();
    assert.equal(G.paceStory(game, 5_000), 'sooner');
    const closing = game.scenario.phases.length;
    const n = game.scenario.npcs[0];
    assert.deepEqual(n.agenda.plan.map((p) => p.round), [2, closing]);
    assert.equal(n.agenda.cracks.round, closing);
    assert.equal(game.scenario.setups[0].paid_by, `round ${closing}`);
  });
});

describe('a story that grows a round keeps its plans in step', () => {
  test('should move plan steps, secrets and setups after the new round one round later', () => {
    const game = gameInReading(4, 1_000, { questions: true, phases: 3 });
    game.setup.replays = 0;
    G.startPlay(game, 1_000);
    const n = game.scenario.npcs[0];
    n.importance = 'important';
    n.agenda = { wants: 'W', plan: [{ round: 1, does: 'Watches.' }, { round: 3, does: 'Burns the ledger.' }], leaves: '', cracks: { round: 3, how: 'She tells of her doubt.' } };
    game.scenario.setups = [{ id: 's1', detail: 'The bell.', shown_in: 'background', shown_round: 0, paid_by: 'round 3', how_paid: 'x' }];
    assert.ok(G.addRound(game, { name: 'One More Round', planned_beat: 'B' }, 2_000));
    assert.equal(game.scenario.phases.length, 4);
    assert.deepEqual(n.agenda.plan.map((p) => p.round), [1, 4]);
    assert.equal(n.agenda.cracks.round, 4);
    assert.equal(game.scenario.setups[0].paid_by, 'round 4');
  });
});
