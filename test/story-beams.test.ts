import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { craftIssues } from '../server/craft.ts';
import { addCanon } from '../server/continuity.ts';
import { playSystem, GENERATION_SYSTEM } from '../server/prompts.ts';
import { gameInReading, emptyAsk, emptyPhase, makeScenario } from './fixtures.ts';

// From the first story playtest: the false solution, three reframes and three setups all rested on clues
// nobody found, and the clue that should break the false solution was burned by a culprit in round 1.
function storyGame() {
  const game = gameInReading(4);
  game.scenario.false_solution = { believed: 'Character 2 did it.', points_at: 'p2', built_from: ['c1'], broken_by: 'c3' };
  game.scenario.reframes = [{ detail: 'The glove.', seen_in: 'opening_scene', first_reading: 'Lost.', true_reading: 'Dropped in the fight.', flipped_by: 'c1' }];
  game.scenario.setups = [{ id: 's1', detail: 'The ledger.', shown_in: 'background', shown_round: 0, paid_by: 'c2', how_paid: 'x' }];
  G.startPlay(game, 1_000);
  return game;
}
const changeRound = (game, at = 2_000) => {
  G.beginPhaseChange(game);
  G.completePhase(game, emptyPhase, at);
};

describe('the clues the story turns on', () => {
  test('should name the clues a false solution, a reframe or a setup rests on', () => {
    assert.deepEqual(G.storyBeams(storyGame().scenario).sort(), ['c1', 'c2', 'c3']);
  });

  test('should leave remains of a story clue someone destroys, still there to find', () => {
    const game = storyGame();
    G.destroy(game, ['c3']);
    assert.deepEqual(game.state.destroyed, []);
    assert.deepEqual(game.state.damaged, ['c3']);
    assert.deepEqual(G.snapshotForGM(game).clues_damaged, ['Note']);
    assert.match(playSystem(makeScenario(4)), /clues_damaged lists clues the story turns on/);
  });

  test('should still destroy a clue the story does not turn on', () => {
    const game = storyGame();
    game.scenario.setups = [];
    game.scenario.reframes = [];
    game.scenario.clues.push({ id: 'c4', name: 'Match', where: 'l1', shows: 'A burnt match.', does_not_prove: '', importance: 'useful', can_be_destroyed: true, reveal_round: 1 });
    G.destroy(game, ['c4']);
    assert.deepEqual(game.state.destroyed, ['c4']);
  });
});

describe('a turn that nobody found still lands', () => {
  test('should hand a missed turn to an innocent player as their own find after its round', () => {
    const game = storyGame();
    changeRound(game);
    const gotIt = Object.entries(game.state.found).filter(([, ids]) => ids.includes('c3')).map(([id]) => id);
    assert.equal(gotIt.length, 1);
    assert.notEqual(gotIt[0], 'p1', 'never the culprit');
    assert.match(game.state.threads[gotIt[0]].at(-1).text, /You come across something: Note/);
    assert.equal(game.state.shared.length, 0, 'never shown to the room');
  });

  test('should hand at most two turns a round, the false solution first', () => {
    const game = storyGame();
    game.scenario.reframes.push({ detail: 'x', seen_in: 'background', first_reading: 'a', true_reading: 'b', flipped_by: 'c2' });
    game.scenario.clues[1].reveal_round = 1;
    changeRound(game);
    assert.deepEqual(game.state.turnsSurfaced.map((t) => t.clueId), ['c3', 'c1']);
  });

  test('should leave a turn alone when the room already found it, or its round has not come', () => {
    const game = storyGame();
    game.state.found.p2.push('c3', 'c1');
    changeRound(game);
    assert.equal(game.state.turnsSurfaced ?? undefined, undefined);
  });
});

describe('a refused move does not happen', () => {
  test('should find, destroy and take nothing when the GM refuses the move', () => {
    const game = storyGame();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'I swap the coins while everyone runs to the landing.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'], clues_destroyed: ['c3'], clues_taken: ['c1'], public_event: 'Everyone runs to the landing.', refused: { refused: true, why: 'Other people choose where they go.' } }, 2_000);
    assert.deepEqual(game.state.found.p2, []);
    assert.equal(game.state.damaged ?? undefined, undefined);
    assert.ok(!game.state.events.some((e) => /runs to the landing/.test(e.text)));
  });

  test('should keep a refusal out of the settled facts', () => {
    const game = storyGame();
    addCanon(game, [{ fact: "That can't happen: other people choose where they go.", about: [], public: false }], 2_000);
    assert.equal(game.state.canon.length, 0);
  });
});

describe('every culprit can be proved', () => {
  test('should want two clues pointing at each culprit, one that survives', () => {
    const s = makeScenario(4);
    s.setups = [];
    s.truth.culprit_ids = ['p1', 'p2'];
    s.suspects[1].pointer_clue_ids = ['c3'];
    assert.ok(craftIssues(s).some((l) => l.startsWith('proof: culprit p2 has 1 clue')));
    s.suspects[1].pointer_clue_ids = ['c1', 'c3'];
    assert.ok(craftIssues(s).some((l) => l.startsWith('proof: every clue pointing at culprit p2 can be destroyed')));
    s.suspects[1].pointer_clue_ids = ['c2', 'c3'];
    assert.ok(!craftIssues(s).some((l) => l.includes('culprit p2')));
    assert.match(GENERATION_SYSTEM, /Each culprit, every one of them, has 2 or more clues pointing at them/);
  });

  test('should make a promise said in the story a setup', () => {
    assert.match(playSystem(makeScenario(4)), /A promise or threat said in the story is a setup/);
  });
});
