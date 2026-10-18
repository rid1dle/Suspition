import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';

const hotGame = (n = 3, opts = {}) => {
  const game = gameInReading(n, 1_000, opts);
  game.setup.roundStyle = 'hotseats';
  return game;
};

describe('hook-first card', () => {
  const audit = (over = {}) => ({ players: [{ player_id: 'p2', hook: 'You are the cook who hides a debt.', distrusts: 'p3', distrust_why: 'She was near the shed.', reveals: ['Line one.', 'Line two.', 'Line three.', 'Line four.'], ...over }] });

  test('should keep a hook, a distrust and three reveal lines from the card check', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit());
    const p2 = game.scenario.players.find((p) => p.id === 'p2');
    assert.deepEqual([p2.hook, p2.distrusts, p2.distrust_why, p2.reveals], ['You are the cook who hides a debt.', 'p3', 'She was near the shed.', ['Line one.', 'Line two.', 'Line three.']]);
  });

  test('should drop a distrust that points at yourself or at nobody, and reveals that name the culprit', () => {
    for (const bad of ['p2', 'zz']) {
      const game = hotGame();
      G.applyAudit(game.scenario, audit({ distrusts: bad }));
      assert.equal(game.scenario.players.find((p) => p.id === 'p2').distrusts ?? '', '');
    }
    const game = hotGame();
    G.applyAudit(game.scenario, audit({ reveals: ['Character 1 did it.', 'Safe line.'] }));
    assert.deepEqual(game.scenario.players.find((p) => p.id === 'p2').reveals, ['Safe line.']);
  });

  test('should open the card on the hook and keep drives and reasons locked at first', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit({ wants: 'W', fears: 'F', reasons: ['R'] }));
    G.startPlay(game, 1_000);
    const card = G.playerView(game, 'p2').card;
    assert.equal(card.hook, 'You are the cook who hides a debt.');
    assert.equal(card.distrusts, game.scenario.players.find((p) => p.id === 'p3').character_name);
    assert.deepEqual(card.locked, ['drives', 'reasons']);
    assert.deepEqual([card.wants, card.fears, card.reasons], ['', '', []]);
  });

  test('should unlock drives after the first seat and reasons after the second', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit({ wants: 'W', fears: 'F', reasons: ['R'] }));
    G.startPlay(game, 1_000);
    G.unlockCard(game, 'p2', 'drives');
    assert.deepEqual(G.playerView(game, 'p2').card.locked, ['reasons']);
    assert.equal(G.playerView(game, 'p2').card.wants, 'W');
    G.unlockCard(game, 'p2', 'reasons');
    assert.deepEqual(G.playerView(game, 'p2').card.reasons, ['R']);
  });

  test('should never lock a classic game', () => {
    const game = gameInReading(3, 1_000);
    G.applyAudit(game.scenario, audit({ wants: 'W' }));
    G.startPlay(game, 1_000);
    assert.deepEqual(G.playerView(game, 'p2').card.locked, []);
  });

  test('should never send reveal lines to a phone', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit());
    G.startPlay(game, 1_000);
    for (const p of game.players) assert.ok(!JSON.stringify(G.playerView(game, p.id)).includes('Line one.'));
    assert.ok(!JSON.stringify(G.tableView(game)).includes('Line one.'));
  });
});

import { emptyPhase } from './fixtures.ts';

describe('hot seat engine', () => {
  const playingHot = (n = 3) => {
    const game = hotGame(n);
    G.startPlay(game, 1_000);
    return game;
  };
  const nextRound = (game, at) => {
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, at);
  };

  test('should seat ceil(players / rounds) players a round, between 1 and 3', () => {
    assert.deepEqual([[3, 3], [8, 3], [5, 4], [12, 3], [2, 5]].map(([p, r]) => G.seatsPerRound(p, r)), [1, 3, 2, 3, 1]);
  });

  test('should seat everyone once before anyone sits twice', () => {
    const game = playingHot(3);
    const seated = [];
    for (const at of [2_000, 3_000, 4_000]) {
      seated.push(game.state.seats.list[0].pid);
      G.seatNow(game, at);
      nextRound(game, at + 1);
    }
    assert.deepEqual([...seated].sort(), ['p1', 'p2', 'p3']);
  });

  test('should time the first seat 60 s in and space the rest across the round', () => {
    const game = hotGame(8);
    G.startPlay(game, 0);
    const roundMs = game.state.phaseEndsAt;
    const ready = game.state.seats.list.map((s) => s.readyAt);
    assert.equal(ready.length, 3);
    assert.equal(ready[0], G.SEAT_FIRST_MS);
    const slot = (roundMs - G.SEAT_FIRST_MS) / 3;
    assert.deepEqual(ready, [0, 1, 2].map((k) => Math.round(G.SEAT_FIRST_MS + k * slot)));
  });

  test('should move a seat from get-ready to live to done, and unlock the card', () => {
    const game = playingHot(3);
    const seat = game.state.seats.list[0];
    G.tickSeats(game, seat.readyAt);
    assert.equal(seat.status, 'getready');
    G.tickSeats(game, seat.readyAt + G.SEAT_READY_MS);
    assert.equal(seat.status, 'live');
    G.tickSeats(game, seat.readyAt + G.SEAT_READY_MS + G.SEAT_LIVE_MS);
    assert.equal(seat.status, 'done');
    assert.deepEqual(G.playerView(game, seat.pid).card.locked, ['reasons']);
  });

  test('should start the next seat now when the host asks', () => {
    const game = playingHot(3);
    G.seatNow(game, 5_000);
    assert.equal(game.state.seats.list[0].status, 'getready');
    assert.equal(game.state.seats.list[0].liveAt, 5_000 + G.SEAT_READY_MS);
  });

  test('should carry unrun seats to the front of the next round, with none left live', () => {
    const game = hotGame(8);
    G.startPlay(game, 0);
    const [first, second] = game.state.seats.list;
    G.seatNow(game, 1_000);
    G.tickSeats(game, 1_000 + G.SEAT_READY_MS);
    nextRound(game, 2_000);
    assert.equal(first.status, 'done');
    assert.equal(game.state.seats.list[0].pid, second.pid);
    assert.ok(game.state.seats.list.every((s) => s.status === 'waiting'));
  });

  test('should spread askers so every other player asks during the round, at most 3 a seat', () => {
    const game = hotGame(7);
    G.startPlay(game, 0);
    const seats = game.state.seats.list;
    assert.ok(seats.every((s) => s.askers.length <= 3 && !s.askers.some((a) => a.pid === s.pid)));
    const asked = new Set(seats.flatMap((s) => s.askers.map((a) => a.pid)));
    const seatedOnly = seats.map((s) => s.pid);
    assert.ok(game.players.every((p) => asked.has(p.id) || seatedOnly.includes(p.id)));
  });

  test('should not run seats in a classic game', () => {
    const game = gameInReading(3, 1_000);
    G.startPlay(game, 1_000);
    assert.equal(game.state.seats ?? null, null);
  });
});
