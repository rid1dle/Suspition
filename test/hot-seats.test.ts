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

import { seatsPrompt, SEATS_SCHEMA } from '../server/prompts.ts';

describe('the GM writes the seats', () => {
  const ready = (n = 3) => {
    const game = hotGame(n);
    G.applyAudit(game.scenario, { players: [{ player_id: game.scenario.players[0].id, hook: 'You are the one with the key.' }, ...game.scenario.players.slice(1).map((p) => ({ player_id: p.id, hook: `Hook of ${p.id}.` }))], alibis: game.scenario.players.map((p) => ({ id: p.id, alibi: [{ time: '9:40 pm', where: 'Kitchen' }] })) });
    G.startPlay(game, 1_000);
    return game;
  };

  test('should fill every seat with alibi questions and the hook line before the GM answers', () => {
    const game = ready();
    const seat = game.state.seats.list[0];
    assert.equal(seat.written, false);
    assert.ok(seat.askers.every((a) => /^Where were you at 9:40 pm\?$/.test(a.question)));
    assert.deepEqual(seat.whisper, [game.scenario.players.find((p) => p.id === seat.pid).hook]);
    assert.ok(seat.askers.every((a) => a.followup === ''));
  });

  test('should store GM-written questions and whispers, capped to their lengths', () => {
    const game = ready();
    const seat = game.state.seats.list[0];
    const long = Array(30).fill('word').join(' ');
    G.applySeatWriting(game, game.state.seats.round, { seats: [{ player_id: seat.pid, whisper: [long, 'Two.', 'Three.', 'Four.'], askers: seat.askers.map((a) => ({ player_id: a.pid, question: long, followup: `If they say the kitchen, tell them: ${long}` })) }] });
    assert.equal(seat.written, true);
    assert.equal(seat.whisper.length, 3);
    assert.equal(seat.whisper[0].split(' ').length, 12);
    assert.ok(seat.askers.every((a) => a.question.split(' ').length === 15 && a.followup.split(' ').length <= 25));
  });

  test('should drop a follow-up that is not a conditional line', () => {
    const game = ready();
    const seat = game.state.seats.list[0];
    G.applySeatWriting(game, game.state.seats.round, { seats: [{ player_id: seat.pid, whisper: ['Stay calm.'], askers: seat.askers.map((a) => ({ player_id: a.pid, question: 'Where were you?', followup: 'She is lying.' })) }] });
    assert.ok(seat.askers.every((a) => a.followup === ''));
  });

  test('should ignore seat writing that arrives after its round ended', () => {
    const game = ready();
    const old = game.state.seats.round;
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    const seat = game.state.seats.list[0];
    assert.equal(G.applySeatWriting(game, old, { seats: [{ player_id: seat.pid, whisper: ['Late.'], askers: [] }] }), false);
    assert.notDeepEqual(seat.whisper, ['Late.']);
  });

  test('should keep culprit facts out of early seats', () => {
    const game = ready();
    assert.match(seatsPrompt(game), /side secrets only/i);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.match(seatsPrompt(game), /may now point at the culprit/i);
    assert.ok(SEATS_SCHEMA.properties.seats);
  });
});

describe('point at someone', () => {
  const playingHot = (n = 4) => {
    const game = hotGame(n);
    G.startPlay(game, 1_000);
    return game;
  };

  test('should put a free point on the table with a 20 s defense', () => {
    const game = playingHot();
    G.point(game, 'p1', 'p2', 5_000);
    const pt = G.tableView(game, 5_000).point;
    assert.equal(pt.current.from, game.players[0].name);
    assert.equal(pt.current.to, game.scenario.players[1].character_name);
    assert.equal(pt.current.endsAt, 5_000 + G.POINT_DEFEND_MS);
    assert.equal(game.state.play?.p1?.length ?? 0, 0);
  });

  test('should refuse a point during a hot seat, at yourself, or inside the cooldown', () => {
    const game = playingHot();
    assert.throws(() => G.point(game, 'p1', 'p1', 5_000), /yourself/);
    G.point(game, 'p1', 'p2', 5_000);
    G.tickPoints(game, 5_000 + G.POINT_DEFEND_MS);
    assert.throws(() => G.point(game, 'p1', 'p3', 30_000), /wait/i);
    G.seatNow(game, 70_000);
    assert.throws(() => G.point(game, 'p2', 'p3', 70_500), /hot seat/);
  });

  test('should queue at most 2 points and drop extras', () => {
    const game = playingHot(5);
    G.point(game, 'p1', 'p2', 5_000);
    G.point(game, 'p2', 'p3', 5_100);
    G.point(game, 'p3', 'p4', 5_200);
    assert.throws(() => G.point(game, 'p4', 'p5', 5_300), /waiting/);
    G.tickPoints(game, 5_000 + G.POINT_DEFEND_MS);
    assert.equal(G.tableView(game, 25_001).point.current.from, game.players[1].name);
  });
});

describe('spotlight vote and round style', () => {
  const setupGame = (input = {}) => {
    const game = G.createGame(1_000);
    for (const name of ['A', 'B', 'C']) G.addPlayer(game, { name });
    G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, ...input });
    return game;
  };
  const spot = (n = 3) => {
    const game = hotGame(n, { questions: true });
    game.scenario.players.forEach((p, i) => (p.reveals = [`REVEAL ${p.id} one.`, `REVEAL ${p.id} two.`].slice(0, i === 2 ? 0 : 2)));
    G.startPlay(game, 1_000);
    G.beginRoundVote(game, 2_000);
    return game;
  };
  const idx = (game, pid) => game.scenario.players.findIndex((p) => p.id === pid);

  test('should default the setup form to hot seats and keep classic as an option', () => {
    assert.equal(setupGame({ roundStyle: 'hotseats' }).setup.roundStyle, 'hotseats');
    assert.equal(setupGame({}).setup.roundStyle, 'classic');
  });

  test('should run a spotlight vote instead of the round question in hot seats style', () => {
    const game = spot();
    const round = G.tableView(game, 2_000).round;
    assert.equal(round.question, 'Who should the room look at?');
    assert.deepEqual(round.options, game.scenario.players.map((p) => p.character_name));
  });

  test('should refuse a vote for yourself', () => {
    const game = spot();
    assert.throws(() => G.voteRound(game, 'p1', idx(game, 'p1'), 2_500), /yourself/);
  });

  test("should reveal the top player's next line", () => {
    const game = spot();
    G.voteRound(game, 'p1', idx(game, 'p2'), 2_500);
    G.voteRound(game, 'p3', idx(game, 'p2'), 2_500);
    G.voteRound(game, 'p2', idx(game, 'p1'), 2_500);
    assert.ok(game.state.events.some((e) => e.kind === 'round' && e.text.includes('REVEAL p2 one.')), 'the reveal line is posted');
    assert.ok(G.playerView(game, 'p2').card.locked.every((s) => s !== 'reasons'), 'reasons unlock for the top player');
  });

  test('should say the room is split on a tie (3 players 1-1-1)', () => {
    const game = spot();
    G.voteRound(game, 'p1', idx(game, 'p2'), 2_500);
    G.voteRound(game, 'p2', idx(game, 'p3'), 2_500);
    G.voteRound(game, 'p3', idx(game, 'p1'), 2_500);
    assert.equal(game.state.events.filter((e) => e.kind === 'round').at(-1).text, 'The room is split.');
  });

  test('should give the culprit cover when the room picks someone innocent', () => {
    const game = spot();
    const before = game.state.suspicion;
    G.voteRound(game, 'p1', idx(game, 'p2'), 2_500);
    G.voteRound(game, 'p3', idx(game, 'p2'), 2_500);
    G.voteRound(game, 'p2', idx(game, 'p3'), 2_500);
    assert.equal(game.state.suspicion, Math.max(0, before - 10));
    assert.match(game.state.threads.p1.at(-1).text, /looking at .* not you/);
  });

  test('should say nothing new when a player has no reveal lines left', () => {
    const game = spot();
    G.voteRound(game, 'p1', idx(game, 'p3'), 2_500);
    G.voteRound(game, 'p2', idx(game, 'p3'), 2_500);
    G.voteRound(game, 'p3', idx(game, 'p1'), 2_500);
    assert.match(game.state.events.filter((e) => e.kind === 'round').at(-1).text, /^Nothing new about /);
  });

  test('should never replay a round in hot seats style', () => {
    const game = spot();
    game.setup.replays = 2;
    for (const p of ['p1', 'p2']) G.voteRound(game, p, idx(game, 'p3'), 2_500);
    G.voteRound(game, 'p3', idx(game, 'p1'), 2_500);
    assert.equal(G.willReplay(game), false);
  });

  test('should keep the classic round question in a classic game', () => {
    const game = gameInReading(3, 1_000, { questions: true });
    G.startPlay(game, 1_000);
    assert.equal(G.tableView(game, 2_000).round.question, 'QUESTION-1');
  });
});

describe('round end in hot seats style', () => {
  test("should post the round's reward when a hot seats round ends", () => {
    const game = hotGame(3, { questions: true });
    G.startPlay(game, 1_000);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.ok(game.state.events.some((e) => e.kind === 'event' && e.text === 'REWARD-1'), 'the reward closes the round');
  });
});

import { askPrompt } from '../server/prompts.ts';
import { emptyAsk } from './fixtures.ts';

describe('short private answers', () => {
  test('should keep a private reply to two short lines in hot seats style', () => {
    const game = hotGame(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p1', { kind: 'chat', text: 'x' });
    const long = Array(40).fill('word').join(' ');
    G.completeAsk(game, 'p1', { ...emptyAsk, lines: [{ speaker: '', text: long }, { speaker: '', text: 'Two.' }, { speaker: '', text: 'Three.' }] });
    const lines = game.state.threads.p1.at(-1).lines;
    assert.equal(lines.length, 2);
    assert.equal(lines[0].text.split(' ').length, 30);
  });

  test('should tell the GM to end each private reply with something to do in the room', () => {
    const base = { snapshot: {}, player: { id: 'p1', character_name: 'A' }, kind: 'chat', text: 'x', read: null };
    assert.match(askPrompt({ ...base, short: true }), /at most 2 short lines[\s\S]*do or say in the room/);
    assert.doesNotMatch(askPrompt(base), /at most 2 short lines/);
  });
});

import { phasePrompt } from '../server/prompts.ts';
import { phoneAlerts } from '../src/lib/alerts.ts';

describe('hot seats review fixes', () => {
  const playingHot = (n = 4, opts = {}) => {
    const game = hotGame(n, opts);
    G.startPlay(game, 0);
    return game;
  };

  test('should not send locked card text to the phone in any field', () => {
    const game = hotGame(3);
    G.applyAudit(game.scenario, { players: [{ player_id: 'p2', wants: 'SECRET WANT', fears: 'SECRET FEAR', reasons: ['SECRET REASON'] }] });
    G.startPlay(game, 1_000);
    const json = JSON.stringify(G.playerView(game, 'p2'));
    assert.ok(!json.includes('SECRET WANT') && !json.includes('SECRET FEAR') && !json.includes('SECRET REASON'), 'locked text is not in the phone view');
  });

  test('should not start a seat while the round vote is open, and should refuse Hot seat now then', () => {
    const game = playingHot(4, { questions: true });
    G.beginRoundVote(game, 1_000);
    G.tickSeats(game, game.state.seats.list[0].readyAt + 1);
    assert.equal(game.state.seats.list[0].status, 'waiting');
    assert.throws(() => G.seatNow(game, 2_000), /vote/);
  });

  test('should not start a seat once the round time is up', () => {
    const game = playingHot(4);
    G.tickSeats(game, game.state.phaseEndsAt + 1);
    assert.ok(game.state.seats.list.every((s) => s.status === 'waiting'), 'no seat starts after time is up');
  });

  test('should tell the GM how the spotlight vote went, not that the room got it wrong', () => {
    const out = phasePrompt({ snapshot: {}, nextPhase: { name: 'x', again: false }, lastRound: { kind: 'spotlight', question: 'Who should the room look at?', pickedText: 'Dev Pillai', correct: null } });
    assert.match(out, /looked at Dev Pillai/);
    assert.doesNotMatch(out, /got it wrong/);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: { name: 'x', again: false }, lastRound: { kind: 'spotlight', question: 'q', pickedText: null, correct: null } }), /was split/);
  });

  test("should keep a culprit's own reveal lines but drop lines that name another culprit", () => {
    const game = hotGame(3);
    const culprit = game.scenario.players.find((p) => p.side === 'culprit');
    const other = game.scenario.players.find((p) => p.side !== 'culprit');
    G.applyAudit(game.scenario, { players: [
      { player_id: culprit.id, reveals: [`${culprit.character_name} owes money.`] },
      { player_id: other.id, reveals: [`Saw ${culprit.character_name} at the shed.`, 'Was in the kitchen.'] },
    ] });
    assert.deepEqual(culprit.reveals, [`${culprit.character_name} owes money.`]);
    assert.deepEqual(other.reveals, ['Was in the kitchen.']);
  });

  test('should clear hot seats when the game reaches the final vote', () => {
    const game = hotGame(3);
    G.startPlay(game, 1_000);
    for (let i = 0; i < 3; i += 1) {
      G.beginPhaseChange(game);
      G.completePhase(game, emptyPhase, 2_000 + i);
    }
    assert.equal(game.status, 'final');
    assert.equal(game.state.seats, null);
  });

  test('should alert a phone when part of its card opens', () => {
    const prev = { gameId: 'g', me: { id: 'p1' }, thread: [], clues: [], card: { goal: 'g', starting_knowledge: '', hidden_known: [], locked: ['drives', 'reasons'] } };
    const next = { ...prev, card: { ...prev.card, locked: ['reasons'] } };
    assert.ok(phoneAlerts(prev, next).some((a) => /card opened/.test(a.text)), 'an unlock alert fires');
  });

  test('should hold a point under a hot seat and give it its full time after', () => {
    const game = playingHot(4);
    G.point(game, 'p1', 'p2', 1_000);
    G.seatNow(game, 2_000);
    G.tickPoints(game, 100_000);
    assert.ok(game.state.points.current, 'the point is still waiting');
    const seat = game.state.seats.list[0];
    G.tickSeats(game, seat.liveAt);
    G.tickSeats(game, seat.endsAt);
    G.tickPoints(game, seat.endsAt);
    assert.equal(game.state.points.current.endsAt, seat.endsAt + G.POINT_DEFEND_MS);
  });
});
