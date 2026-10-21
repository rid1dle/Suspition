import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading, emptyPhase } from './fixtures.ts';

// From story run 5: a missed clue reached Nisha in the office as "You come across something" while it lay in the
// foyer, and the judge asked how she found it. A GM character now brings it, unless she stands where it is.
function storyGame() {
  const game = gameInReading(4);
  game.scenario.false_solution = { believed: 'Character 2 did it.', points_at: 'p2', built_from: ['c2'], broken_by: 'c1' };
  game.scenario.reframes = [];
  game.scenario.setups = [];
  G.startPlay(game, 1_000);
  stand(game, ['p1', 'p2', 'p3', 'p4', 'n1'], 'l2');
  return game;
}
const stand = (game, ids, place) => {
  for (const id of ids) {
    game.state.positions[id] = place;
    if (game.state.at) delete game.state.at[id];
  }
};
const changeRound = (game, at = 2_000) => {
  G.beginPhaseChange(game);
  G.completePhase(game, emptyPhase, at);
};
const receiver = (game) => game.state.turnsSurfaced[0].to;

describe('a missed clue reaches a player in a way the story can explain', () => {
  test('should have a GM character bring it when the player is somewhere else', () => {
    const game = storyGame();
    changeRound(game);
    const thread = game.state.threads[receiver(game)];
    assert.match(thread.at(-2).text, /^The Butler comes over with something for you, picked up in the Ballroom\.$/);
    assert.match(thread.at(-1).text, /You come across something: Torn glove/);
  });

  test('should move the GM character to the player who gets it', () => {
    const game = storyGame();
    stand(game, ['n1'], 'l1');
    changeRound(game);
    assert.equal(game.state.positions.n1, 'l2');
  });

  test('should let a player who stands where the clue is find it alone', () => {
    const game = storyGame();
    stand(game, ['p1', 'p2', 'p3', 'p4'], 'l1');
    changeRound(game);
    assert.ok(!game.state.threads[receiver(game)].some((m) => /comes over with something/.test(m.text)));
  });

  test('should never send someone the clue points at', () => {
    const game = storyGame();
    game.scenario.suspects.push({ character_id: 'n1', motive_against_victim: 'M', where_at_crime_time: 'l1', alibi_witness: '', pointer_clue_ids: ['c1'], cleared_by_clue_ids: [] });
    changeRound(game);
    assert.ok(!game.state.threads[receiver(game)].some((m) => /The Butler comes over/.test(m.text)));
  });
});
