import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { scoreMoves } from '../server/skills.ts';
import { PLAY_RUBRIC } from '../server/prompts.ts';

// From the chaos playtest: replies to one player decided what other players' characters did.
function named() {
  const game = gameInReading(3, 1_000);
  G.startPlay(game, 1_000);
  const names = [['Tanvi', 'Tanvi Iyer'], ['Zoya', 'Zoya Kapoor'], ['Nisha', 'Nisha Rao']];
  game.players.forEach((p, i) => (p.name = names[i][0]));
  game.scenario.players.forEach((c, i) => (c.character_name = names[i][1]));
  game.scenario.npcs[0].name = 'Manju Gowda';
  return game;
}
const drops = (text: string) => G.dropPuppeting(named(), 'p1', text).dropped;

describe('another player reacting in a reply to someone else', () => {
  test('should drop another player leaning in, looking up or watching', () => {
    assert.equal(drops('Beside you, Zoya leans in to look.'), 1);
    assert.equal(drops('Zoya and Nisha look up at the sound of the drawers.'), 1);
    assert.equal(drops('Nisha is under the canopy beside you, watching the screen.'), 1);
    assert.equal(drops('Zoya glances at the door.'), 1);
  });

  test('should keep a GM character reacting and the asker acting', () => {
    assert.equal(drops('Manju Gowda leans in to look.'), 0);
    assert.equal(drops('Tanvi leans in to look.'), 0);
  });

  test('should keep sentences that only mention another player', () => {
    assert.equal(drops('A note for Zoya lies on the desk.'), 0);
    assert.equal(drops('Ask Zoya what she saw.'), 0);
    assert.equal(drops('Zoya is the restorer.'), 0);
  });
});

describe('one message, one demerit', () => {
  test('should take one point for swaying and none more for a claim in the same message', () => {
    const moves = scoreMoves({ points: 2, skill: 'searching', why: 'Found the folder.' }, { sways_gm: true, claims: ['the GM cleared me'] });
    assert.deepEqual(moves.map((m) => [m.points, m.skill]), [[2, 'searching'], [-1, 'swaying']]);
    assert.doesNotMatch(moves[0].why, /claim/);
  });

  test('should still take a point for a claim when nobody tried to sway the GM', () => {
    assert.equal(scoreMoves({ points: 1, skill: 'searching', why: 'x' }, { claims: ['everyone believes me'] })[0].points, 0);
  });

  test('should tell the GM an honest repeat is never -1', () => {
    assert.match(PLAY_RUBRIC, /an honest repeat is never -1/);
  });
});
