import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { seatsPrompt } from '../server/prompts.ts';
import { gameInReading, whereaboutsFor } from './fixtures.ts';

// p1 is a culprit who did it asleep: the truth has them DOING-IT at 9pm, and they must not read that on their own phone.
function sleepwalker() {
  const game = gameInReading(3);
  const sc = game.scenario;
  sc.players[0].unaware = true;
  sc.truth.timeline = [{ time: '9pm', event: 'It happened', character_ids: ['p1'] }, { time: '10pm', event: 'Back to bed', character_ids: [] }];
  sc.truth.whereabouts = [...whereaboutsFor(sc), { time: '10pm', character_id: 'p1', location_id: 'l2', doing: 'ASLEEP-IN-BED', seen_by: [] }];
  G.applyAudit(sc, { players: [] });
  G.startPlay(game, 2_000);
  return game;
}

const nightText = (view) => JSON.stringify([view.card.night, view.card.pellets, view.card.reminders]);

describe('a culprit who does not know it never reads what they did', () => {
  test('should keep the acting time off their card until they wake, and keep the rest of their night', () => {
    const game = sleepwalker();
    const out = nightText(G.playerView(game, 'p1'));
    assert.doesNotMatch(out, /DOING-IT/);
    assert.match(out, /ASLEEP-IN-BED/);
  });

  test('should show the whole true night once the story wakes them', () => {
    const game = sleepwalker();
    game.state.awakened = { p1: true };
    assert.match(nightText(G.playerView(game, 'p1')), /DOING-IT/);
  });

  test('should still show an innocent player their own true night', () => {
    const game = sleepwalker();
    assert.match(nightText(G.playerView(game, 'p2')), /COOKING/);
  });

  test('should not count the acting time among what the player knows', () => {
    const game = sleepwalker();
    assert.ok(!G.playerFacts(game, 'p1').some((f) => /DOING-IT/.test(f)));
    assert.ok(!G.playerFacts(game, 'p1', { forGM: true }).some((f) => /DOING-IT/.test(f)));
  });

  test('should not give it to the hot seat writer as something they can ask from', () => {
    const game = sleepwalker();
    game.state.seats = { list: [{ pid: 'p2', askers: [{ pid: 'p1' }] }] };
    assert.doesNotMatch(seatsPrompt(game), /DOING-IT/);
  });
});
