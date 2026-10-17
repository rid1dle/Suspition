import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.js';
import { makeScenario, gameInReading, emptyAsk, emptyPhase } from './fixtures.js';

const playing = (n = 4, now = 1_000) => {
  const game = gameInReading(n, now);
  G.startPlay(game, now);
  return game;
};

describe('lobby', () => {
  test('should give each joined player a unique id and token', () => {
    const game = G.createGame();
    const a = G.addPlayer(game, { name: 'Asha' });
    const b = G.addPlayer(game, { name: 'Ben' });
    assert.equal(a.id, 'p1');
    assert.equal(b.id, 'p2');
    assert.notEqual(a.token, b.token);
  });

  test('should reject a duplicate name regardless of case', () => {
    const game = G.createGame();
    G.addPlayer(game, { name: 'Asha' });
    assert.throws(() => G.addPlayer(game, { name: ' asha ' }), /already has that name/);
  });

  test('should reject an empty name', () => {
    assert.throws(() => G.addPlayer(G.createGame(), { name: '   ' }), /Enter a name/);
  });

  test('should refuse to join once setup has started', () => {
    const game = gameInReading(3);
    assert.throws(() => G.addPlayer(game, { name: 'Late' }), /already started/);
  });

  test('should refuse setup with fewer than the minimum players', () => {
    const game = G.createGame();
    G.addPlayer(game, { name: 'A' });
    G.addPlayer(game, { name: 'B' });
    assert.throws(() => G.applySetup(game, { tone: 'tense', length: 'short', hints: 3 }), /at least 3/);
  });

  test('should refuse hints outside 1 to 5', () => {
    const game = G.createGame();
    for (const name of ['A', 'B', 'C']) G.addPlayer(game, { name });
    assert.throws(() => G.applySetup(game, { tone: 'tense', length: 'short', hints: 9 }), /between 1 and 5/);
  });
});

describe('validateScenario', () => {
  const rules = { playerCount: 4, phases: 3, hints: 3 };

  test('should accept a well-formed scenario', () => {
    assert.deepEqual(G.validateScenario(makeScenario(4), rules), []);
  });

  test('should reject a scenario with the wrong player ids', () => {
    const s = makeScenario(3);
    assert.match(G.validateScenario(s, rules).join(), /exactly p1, p2, p3, p4/);
  });

  test('should reject a key deduction backed by fewer than two clues', () => {
    const s = makeScenario(4);
    s.key_deductions[0].clue_ids = ['c1', 'missing'];
    assert.match(G.validateScenario(s, rules).join(), /k1 needs at least 2/);
  });

  test('should reject a scenario with no player culprit', () => {
    const s = makeScenario(4);
    s.players[0].side = 'investigator';
    s.truth.culprit_ids = ['n1'];
    assert.match(G.validateScenario(s, rules).join(), /At least one player character must be a culprit/);
  });

  test('should reject a culprit side that disagrees with the truth', () => {
    const s = makeScenario(4);
    s.players[1].side = 'culprit';
    assert.match(G.validateScenario(s, rules).join(), /p2 has side culprit/);
  });

  test('should reject more than one false hint', () => {
    const s = makeScenario(4);
    s.hint_ladder.push({ text: 'x', is_false: true }, { text: 'y', is_false: true });
    assert.match(G.validateScenario(s, rules).join(), /At most one false hint/);
  });

  test('should reject a non-object', () => {
    assert.deepEqual(G.validateScenario(null, rules), ['Scenario is not an object.']);
  });
});

describe('asking the GM', () => {
  test('should spend one question and refund it when the GM fails', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'Search the ballroom' });
    assert.equal(game.state.questionsLeft.p2, 2);
    G.failAsk(game, 'p2');
    assert.equal(game.state.questionsLeft.p2, 3);
    assert.equal(game.state.pending.p2, undefined);
  });

  test('should refuse a second question while one is pending', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'one' });
    assert.throws(() => G.beginAsk(game, 'p2', { kind: 'question', text: 'two' }), /still answering/);
  });

  test('should refuse when the phase budget is used up', () => {
    const game = playing();
    for (let i = 0; i < 3; i += 1) {
      G.beginAsk(game, 'p2', { kind: 'question', text: `q${i}` });
      G.completeAsk(game, 'p2', emptyAsk);
    }
    assert.throws(() => G.beginAsk(game, 'p2', { kind: 'question', text: 'q4' }), /No questions left this round/);
  });

  test('should refuse an unknown request type', () => {
    assert.throws(() => G.beginAsk(playing(), 'p2', { kind: 'magic', text: 'x' }), /Unknown request type/);
  });

  test('should keep the answer as novel lines, one speaker per line, with quote marks stripped', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'Talk to the butler' });
    G.completeAsk(game, 'p2', { ...emptyAsk, lines: [{ speaker: '', text: 'The butler freezes.' }, { speaker: 'The Butler', text: '"I saw nothing, sir."' }, { speaker: '', text: '  ' }] });
    const msg = game.state.threads.p2.at(-1);
    assert.deepEqual(msg.lines, [{ speaker: '', text: 'The butler freezes.' }, { speaker: 'The Butler', text: 'I saw nothing, sir.' }]);
    assert.equal(msg.text, 'The butler freezes.\nThe Butler: "I saw nothing, sir."');
  });

  test('should fall back to a plain answer when there are no lines', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, answer: 'Plain.' });
    assert.equal(game.state.threads.p2.at(-1).text, 'Plain.');
    assert.equal(game.state.threads.p2.at(-1).lines, undefined);
  });

  test('should record found clues, ignoring unknown and destroyed ids', () => {
    const game = playing();
    game.state.destroyed.push('c3');
    G.beginAsk(game, 'p2', { kind: 'question', text: 'look' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1', 'c3', 'c99'] });
    assert.deepEqual(game.state.found.p2, ['c1']);
  });

  test('should only reveal a hidden fact that belongs to the asking player', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'self', text: 'who am I' });
    G.completeAsk(game, 'p2', { ...emptyAsk, hidden_fact_revealed: 'h3' });
    assert.deepEqual(game.state.revealed.p2, []);
    G.beginAsk(game, 'p2', { kind: 'self', text: 'who am I really' });
    G.completeAsk(game, 'p2', { ...emptyAsk, hidden_fact_revealed: 'h2' });
    assert.deepEqual(game.state.revealed.p2, ['h2']);
  });

  test('should destroy only clues marked destroyable', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'action', text: 'burn things' });
    G.completeAsk(game, 'p1', { ...emptyAsk, clues_destroyed: ['c1', 'c2'] });
    assert.deepEqual(game.state.destroyed, ['c1']);
  });

  test('should clamp suspicion between 0 and 100', () => {
    const game = playing();
    for (let i = 0; i < 3; i += 1) {
      G.beginAsk(game, 'p1', { kind: 'action', text: 'loud' });
      G.completeAsk(game, 'p1', { ...emptyAsk, suspicion_change: 999 });
    }
    assert.equal(game.state.suspicion, 95);
    G.beginAsk(game, 'p2', { kind: 'action', text: 'calm' });
    G.completeAsk(game, 'p2', { ...emptyAsk, suspicion_change: 25 });
    assert.equal(game.state.suspicion, 100);
  });

  test('should deliver whispers only to real players and post public events', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'action', text: 'sneak' });
    G.completeAsk(game, 'p1', { ...emptyAsk, public_event: 'A scream upstairs.', messages_to_players: [{ player_id: 'p3', text: 'You saw a shadow.' }, { player_id: 'zz', text: 'lost' }] });
    assert.equal(game.state.threads.p3.at(-1).text, 'You saw a shadow.');
    assert.equal(game.state.events.at(-1).text, 'A scream upstairs.');
  });
});

describe('phases', () => {
  test('should refill budgets and log the new phase', () => {
    const game = playing(4, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'q' });
    G.completeAsk(game, 'p2', emptyAsk);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.equal(game.state.phaseIndex, 1);
    assert.equal(game.state.questionsLeft.p2, 3);
    assert.equal(game.state.phaseEndsAt, 2_000 + 10 * 60_000);
    assert.deepEqual(game.state.events.slice(-3).map((e) => e.text), ['Round 2 of 3: Phase name 2', 'Something changed.', 'New on the timeline: 9:30, TL-ROUND2']);
  });

  test('should block questions while the phase is changing', () => {
    const game = playing();
    G.beginPhaseChange(game);
    assert.throws(() => G.beginAsk(game, 'p2', { kind: 'question', text: 'q' }), /Things are changing/);
  });

  test('should move to the final reconstruction after the last phase', () => {
    const game = playing();
    for (let i = 0; i < 3; i += 1) {
      G.beginPhaseChange(game);
      G.completePhase(game, emptyPhase);
    }
    assert.equal(game.status, 'final');
  });

  test('should extend the running phase by five minutes', () => {
    const game = playing(4, 1_000);
    const before = game.state.phaseEndsAt;
    G.extendPhase(game, 1_000);
    assert.equal(game.state.phaseEndsAt, before + 5 * 60_000);
  });
});

describe('global hints', () => {
  test('should spend a hint once a majority votes yes', () => {
    const game = playing(4);
    assert.equal(G.proposeHint(game, 'p1', 1_000), 'open');
    assert.equal(G.voteHint(game, 'p2', true, 1_000), 'open');
    assert.equal(G.voteHint(game, 'p3', true, 1_000), 'spent');
    assert.equal(game.state.hintsLeft, 2);
    assert.equal(game.state.events.at(-1).text, 'Hint: HINT-1');
  });

  test('should save the hint once a majority is impossible', () => {
    const game = playing(4);
    G.proposeHint(game, 'p1', 1_000);
    G.voteHint(game, 'p2', false, 1_000);
    assert.equal(G.voteHint(game, 'p3', false, 1_000), 'saved');
    assert.equal(game.state.hintsLeft, 3);
  });

  test('should save the hint when the vote times out', () => {
    const game = playing(4);
    G.proposeHint(game, 'p1', 1_000);
    assert.equal(G.resolveHintVote(game, 1_000 + G.HINT_VOTE_MS), 'saved');
    assert.equal(game.state.hintVote, null);
  });

  test('should refuse a proposal when no hints are left', () => {
    const game = playing(3);
    game.state.hintsLeft = 0;
    assert.throws(() => G.proposeHint(game, 'p1', 1_000), /No hints left/);
  });

  test('should let a player change their vote', () => {
    const game = playing(5);
    G.proposeHint(game, 'p1', 1_000);
    G.voteHint(game, 'p2', false, 1_000);
    G.voteHint(game, 'p2', true, 1_000);
    assert.equal(G.voteHint(game, 'p3', true, 1_000), 'spent');
  });
});

describe('final reconstruction', () => {
  const finalGame = (n = 4) => {
    const game = playing(n);
    game.status = 'final';
    return game;
  };

  test('should ignore names that are not in the cast', () => {
    const game = finalGame();
    G.submitFinal(game, 'p2', { culprit_ids: ['p1', 'nobody'], how: 'h', why: 'w' });
    assert.deepEqual(game.state.submissions.p2.culprit_ids, ['p1']);
  });

  test('should refuse a submission naming nobody', () => {
    assert.throws(() => G.submitFinal(finalGame(), 'p2', { culprit_ids: [] }), /at least one person/);
  });

  test('should give the win to investigators when a majority names exactly the culprits', () => {
    const game = finalGame(4);
    for (const id of ['p1', 'p2', 'p3']) G.submitFinal(game, id, { culprit_ids: ['p1'] });
    G.submitFinal(game, 'p4', { culprit_ids: ['p1', 'n1'] });
    const v = G.computeVerdict(game);
    assert.equal(v.winner, 'investigators');
    assert.deepEqual(v.correct_player_ids, ['p1', 'p2', 'p3']);
  });

  test('should give the win to culprits on a tie', () => {
    const game = finalGame(4);
    G.submitFinal(game, 'p1', { culprit_ids: ['n1'] });
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'] });
    G.submitFinal(game, 'p3', { culprit_ids: ['p1'] });
    G.submitFinal(game, 'p4', { culprit_ids: ['n2'] });
    assert.equal(G.computeVerdict(game).winner, 'culprits');
  });

  test('should clamp GM scores and fill missing players', () => {
    const game = finalGame(3);
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'] });
    const verdict = G.computeVerdict(game);
    G.applyScore(game, verdict, { reveal_story: 'S', players: [{ player_id: 'p2', method_score: 7, motive_score: -3, goal_achieved: true, goal_outcome: '', comment: '' }] });
    assert.equal(game.status, 'reveal');
    const p2 = game.state.result.players.find((p) => p.player_id === 'p2');
    assert.equal(p2.method_score, 2);
    assert.equal(p2.motive_score, 0);
    assert.equal(game.state.result.players.length, 3);
  });
});

describe('privacy', () => {
  const secretsOf = (game, exceptId) => {
    const s = game.scenario;
    return [
      s.truth.summary, s.truth.method, s.truth.motive,
      ...s.npcs.flatMap((n) => [n.knows, n.secrets]),
      ...s.clues.map((c) => c.shows),
      ...s.players.filter((p) => p.id !== exceptId).flatMap((p) => [p.private_info, p.goal, p.starting_knowledge, ...p.hidden_facts.map((h) => h.fact)]),
      ...s.players.filter((p) => p.id === exceptId).flatMap((p) => p.hidden_facts.map((h) => h.fact)),
      ...s.hint_ladder.map((h) => h.text),
      ...s.twists.map((t) => t.description),
    ].filter(Boolean);
  };

  test('should keep every secret out of the table view before the reveal', () => {
    const game = playing();
    const body = JSON.stringify(G.tableView(game));
    for (const secret of secretsOf(game, null)) assert.ok(!body.includes(secret), `table leaked ${secret}`);
    assert.ok(!body.includes('"side"'), 'table leaked a side');
  });

  test('should show a player only their own card and none of the truth', () => {
    const game = playing();
    const view = G.playerView(game, 'p2');
    const body = JSON.stringify(view);
    for (const secret of secretsOf(game, 'p2')) assert.ok(!body.includes(secret), `p2 view leaked ${secret}`);
    assert.equal(view.card.private_info, 'PRIVATE-2');
    assert.equal(view.card.hidden_unknown, 1);
  });

  test('should show a found clue and a revealed hidden fact to that player only', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'self', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'], hidden_fact_revealed: 'h2' });
    assert.ok(JSON.stringify(G.playerView(game, 'p2')).includes('CLUE-1-SHOWS'));
    assert.deepEqual(G.playerView(game, 'p2').card.hidden_known, ['HIDDEN-2']);
    assert.ok(!JSON.stringify(G.playerView(game, 'p3')).includes('CLUE-1-SHOWS'));
    assert.ok(!JSON.stringify(G.playerView(game, 'p3')).includes('HIDDEN-2'));
  });

  test('should not leak another player thread', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'MY-SECRET-QUESTION' });
    G.completeAsk(game, 'p2', emptyAsk);
    assert.ok(!JSON.stringify(G.playerView(game, 'p3')).includes('MY-SECRET-QUESTION'));
    assert.ok(!JSON.stringify(G.tableView(game)).includes('MY-SECRET-QUESTION'));
  });

  test('should keep player tokens out of every view', () => {
    const game = playing();
    const tokens = game.players.map((p) => p.token).concat(game.hostToken);
    for (const body of [JSON.stringify(G.tableView(game)), JSON.stringify(G.playerView(game, 'p2'))]) {
      for (const t of tokens) assert.ok(!body.includes(t), 'a token leaked');
    }
  });

  test('should shape the card the same way for a culprit and an investigator', () => {
    const game = playing();
    assert.deepEqual(Object.keys(G.playerView(game, 'p1').card), Object.keys(G.playerView(game, 'p2').card));
  });

  test('should reveal every card on the table only after scoring', () => {
    const game = playing();
    game.status = 'final';
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'] });
    G.applyScore(game, G.computeVerdict(game), { reveal_story: 'S', players: [] });
    const body = JSON.stringify(G.tableView(game));
    assert.ok(body.includes('PRIVATE-3') && body.includes('HIDDEN-4') && body.includes('TRUTH-SUMMARY'));
  });
});

describe('music in the public view', () => {
  test('should give the lobby a calm default theme for no scenario', () => {
    const game = G.createGame();
    assert.equal(G.tableView(game).music.palette, 'piano');
  });

  test('should pass the scenario theme to every screen, cleaned up', () => {
    const game = gameInReading(3);
    game.scenario.music = { root: 'E', mode: 'dorian', tempo: 999, palette: 'bells', percussion: 'tribal', motif: [0, 2, 4, 5], description: 'Bells over toms' };
    const music = G.tableView(game).music;
    assert.deepEqual([music.root, music.mode, music.tempo, music.palette], ['E', 'dorian', 140, 'bells']);
    assert.equal(G.playerView(game, 'p1').musicDescription, 'Bells over toms');
  });

  test('should fall back to the tone for a world written before music existed', () => {
    const game = gameInReading(3);
    delete game.scenario.music;
    assert.equal(G.tableView(game).music.mode, 'harmonic_minor');
  });
});

describe('the map', () => {
  const playing = (n = 4) => {
    const game = gameInReading(n);
    G.startPlay(game, 1_000);
    return game;
  };

  test('should place everyone at their start, falling back for an unknown place', () => {
    const game = playing(3);
    assert.deepEqual(game.state.positions, { p1: 'l1', p2: 'l2', p3: 'l1', n1: 'l2', n2: 'l1' });
  });

  test('should show places and positions to everyone, with unknown neighbours dropped', () => {
    const map = G.tableView(playing()).map;
    assert.deepEqual(map.places[1], { id: 'l2', name: 'Kitchen', x: 80, y: 70, room: '', icon: '', neighbors: ['l1'] });
    assert.equal(G.playerView(playing(), 'p2').map.positions.p1, 'l1');
  });

  test('should lay places out in a circle for a world written before maps existed', () => {
    const game = playing();
    for (const l of game.scenario.locations) delete l.x;
    const places = G.tableView(game).map.places;
    assert.ok(places.every((p) => p.x >= 6 && p.x <= 94 && p.y >= 8 && p.y <= 92));
    assert.notDeepEqual([places[0].x, places[0].y], [places[1].x, places[1].y]);
  });

  test('should move a player who asks about a place', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'question', text: 'I search the kitchen' });
    G.completeAsk(game, 'p1', { ...emptyAsk, player_location: 'l2', move_is_public: false });
    assert.equal(game.state.positions.p1, 'l2');
  });

  test('should keep a secret move off the map unless someone saw it', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'action', text: 'I sneak to the kitchen' });
    G.completeAsk(game, 'p1', { ...emptyAsk, player_location: 'l2', move_is_public: false });
    assert.equal(game.state.positions.p1, 'l1');
    G.beginAsk(game, 'p1', { kind: 'action', text: 'I storm into the kitchen' });
    G.completeAsk(game, 'p1', { ...emptyAsk, player_location: 'l2', move_is_public: true });
    assert.equal(game.state.positions.p1, 'l2');
  });

  test('should apply moves from a phase change and ignore unknown people or places', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, positions: [{ character_id: 'n1', location_id: 'l1' }, { character_id: 'zz', location_id: 'l1' }, { character_id: 'p2', location_id: 'mars' }] });
    assert.equal(game.state.positions.n1, 'l1');
    assert.equal(game.state.positions.p2, 'l2');
    assert.equal(game.state.positions.zz, undefined);
  });

  test('should let the host move a place and name its spot in the room, for every screen', () => {
    const game = playing();
    G.editPlace(game, { id: 'l1', x: 55, y: 140, room: '  The big sofa ' });
    const place = G.playerView(game, 'p2').map.places[0];
    assert.deepEqual([place.x, place.y, place.room], [55, 92, 'The big sofa']);
    G.editPlace(game, { id: 'l1', room: 'Kitchen table' });
    assert.deepEqual([G.tableView(game).map.places[0].x, G.tableView(game).map.places[0].room], [55, 'Kitchen table']);
  });

  test('should refuse map edits for unknown places, bad positions or no game', () => {
    const game = playing();
    assert.throws(() => G.editPlace(game, { id: 'l99', room: 'x' }), /Unknown place/);
    assert.throws(() => G.editPlace(game, { id: 'l1', x: 'left', y: 3 }), /Bad position/);
    assert.throws(() => G.editPlace(G.createGame(), { id: 'l1', room: 'x' }), /during a game/);
  });

  test('should tell the GM where everyone is', () => {
    assert.equal(G.snapshotForGM(playing()).where_everyone_is.p2, 'l2');
  });
});

describe('round goals and votes', () => {
  const voting = (n = 3) => {
    const game = gameInReading(n, 1_000, { questions: true });
    G.startPlay(game, 1_000);
    return game;
  };

  test('should announce the round goal and the timeline entries for that round', () => {
    const game = voting();
    const texts = game.state.events.map((e) => e.text);
    assert.ok(texts.includes("This round's goal: QUESTION-1"));
    assert.ok(!texts.some((t) => t.includes('TL-ROUND2')));
  });

  test('should show the question and choices but never the answer, reward or nudge', () => {
    const game = voting();
    const body = JSON.stringify([G.tableView(game), G.playerView(game, 'p2')]);
    assert.deepEqual(G.tableView(game).round.options, ['A', 'B', 'C']);
    for (const secret of ['REWARD-1', 'NUDGE-1', 'answer_index', '"answer"']) assert.ok(!body.includes(secret), secret);
  });

  test('should unlock the reward on the timeline when most people pick the right answer', () => {
    const game = voting();
    G.beginRoundVote(game, 2_000);
    G.voteRound(game, 'p1', 1, 2_000);
    G.voteRound(game, 'p2', 1, 2_000);
    const result = G.voteRound(game, 'p3', 0, 2_000);
    assert.equal(result.correct, true);
    assert.ok(G.tableView(game).timeline.some((t) => t.event === 'REWARD-1' && t.time === '9:15'));
    assert.match(game.state.events.at(-1).text, /The group picked: B. That is right! REWARD-1/);
    assert.equal(game.state.roundVote, null);
  });

  test('should give a nudge and the culprit some cover when the group is wrong', () => {
    const game = voting();
    const before = game.state.suspicion;
    G.beginRoundVote(game, 2_000);
    for (const p of ['p1', 'p2', 'p3']) G.voteRound(game, p, 2, 2_000);
    assert.match(game.state.events.at(-1).text, /Not quite. NUDGE-1/);
    assert.equal(game.state.suspicion, before - 10);
    assert.ok(!G.tableView(game).timeline.some((t) => t.event === 'REWARD-1'));
  });

  test('should count a tie or no votes as not agreeing', () => {
    const game = voting(4);
    G.beginRoundVote(game, 2_000);
    G.voteRound(game, 'p1', 0, 2_000);
    G.voteRound(game, 'p2', 1, 2_000);
    const result = G.resolveRoundVote(game, 2_000, true);
    assert.deepEqual([result.picked, result.correct], [null, false]);
    assert.match(game.state.events.at(-1).text, /could not agree/);
  });

  test('should wait for everyone or the timer before closing the vote', () => {
    const game = voting();
    G.beginRoundVote(game, 2_000);
    assert.equal(G.voteRound(game, 'p1', 1, 2_000), null);
    assert.equal(G.resolveRoundVote(game, 2_000 + G.ROUND_VOTE_MS).correct, true);
  });

  test('should block questions while voting and refuse a bad choice', () => {
    const game = voting();
    G.beginRoundVote(game, 2_000);
    assert.throws(() => G.beginAsk(game, 'p1', { kind: 'question', text: 'x' }), /Voting now/);
    assert.throws(() => G.voteRound(game, 'p1', 7, 2_000), /Pick one/);
  });

  test('should vote only once per round', () => {
    const game = voting();
    G.beginRoundVote(game, 2_000);
    G.resolveRoundVote(game, 2_000, true);
    assert.equal(G.needsRoundVote(game), false);
    assert.throws(() => G.beginRoundVote(game, 2_000), /no question/);
  });

  test('should skip votes for a round whose question is broken', () => {
    const game = voting();
    game.scenario.phases[0].answer_index = 9;
    assert.equal(G.roundQuestion(game, 0), null);
    assert.equal(G.needsRoundVote(game), false);
  });
});

describe('timeline', () => {
  test('should show only the times known so far, in story order', () => {
    const game = gameInReading(3, 1_000, { questions: true });
    assert.deepEqual(G.tableView(game).timeline.map((t) => t.event), ['TL-START']);
    G.startPlay(game, 1_000);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.deepEqual(G.tableView(game).timeline.map((t) => t.event), ['TL-START', 'TL-ROUND2']);
    assert.ok(game.state.events.some((e) => e.text === 'New on the timeline: 9:30, TL-ROUND2'));
  });
});

describe('meet everyone', () => {
  test('should walk through the scene, background, map, each player, the GM people, the timeline and the rules', () => {
    const game = gameInReading(3);
    const steps = G.tableView(game).briefing.steps;
    assert.deepEqual(steps.map((s) => s.kind), ['scene', 'story', 'background', 'map', 'intro', 'intro', 'intro', 'npcs', 'timeline', 'goal']);
    assert.match(steps[4].lines[0], /Player1, stand up and say: "I am Character 1, Role 1. PUBLIC-1"/);
  });

  test('should use the first-person intro line when the GM wrote one', () => {
    const game = gameInReading(3);
    game.scenario.players[0].intro_line = 'I am the cook. I found the body.';
    assert.match(G.tableView(game).briefing.steps[4].lines[0], /Player1, stand up and say: "I am the cook. I found the body."/);
  });

  test('should keep secrets out of the intro', () => {
    const body = JSON.stringify(G.tableView(gameInReading(3)).briefing);
    assert.ok(!body.includes('PRIVATE') && !body.includes('TRUTH') && !body.includes('HIDDEN'));
  });

  test('should step forward and back within the intro only', () => {
    const game = gameInReading(3);
    assert.equal(G.moveBrief(game, -1), 0);
    assert.equal(G.moveBrief(game, 99), 9);
    G.startPlay(game, 1_000);
    assert.throws(() => G.moveBrief(game, 1), /intro is over/);
  });
});

describe('sharing clues', () => {
  const found = () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'look' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'] });
    return game;
  };

  test('should put a found clue on every screen and in the news', () => {
    const game = found();
    G.shareClue(game, 'p2', 'c1', 2_000);
    assert.deepEqual(G.playerView(game, 'p3').sharedClues, [{ id: 'c1', name: 'Torn glove', shows: 'CLUE-1-SHOWS', by: 'Player2' }]);
    assert.match(game.state.events.at(-1).text, /Player2 shows a clue. Torn glove: CLUE-1-SHOWS/);
  });

  test('should refuse a clue you never found, or one already shared', () => {
    const game = found();
    assert.throws(() => G.shareClue(game, 'p3', 'c1'), /not found that clue/);
    G.shareClue(game, 'p2', 'c1');
    assert.throws(() => G.shareClue(game, 'p2', 'c1'), /already see/);
  });
});

describe('public questions about the world', () => {
  test('should give the GM only public knowledge, never a secret', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const body = JSON.stringify(G.publicKnowledge(game));
    for (const secret of ['PRIVATE', 'TRUTH-SUMMARY', 'HIDDEN', 'CLUE-1-SHOWS', 'NPC-SECRET', 'NPC-KNOWS', 'GOAL-', 'METHOD', 'MOTIVE']) assert.ok(!body.includes(secret), secret);
    assert.ok(body.includes('BG-1 public line'));
  });

  test('should post the question and answer for everyone, without using a question', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginPublicAsk(game, 'p1', 'How far is town?');
    assert.throws(() => G.beginPublicAsk(game, 'p1', 'again'), /Wait for the answer/);
    G.completePublicAsk(game, 'p1', 'Ten miles.', 2_000);
    const qa = G.playerView(game, 'p2').events.at(-1);
    assert.deepEqual([qa.kind, qa.by, qa.q, qa.text], ['qa', 'Player1', 'How far is town?', 'Ten miles.']);
    assert.equal(game.state.questionsLeft.p1, 3);
  });
});

describe('cleanSvg', () => {
  test('should accept a plain drawing', () => {
    assert.ok(G.cleanSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(#g)"/></svg>'));
  });

  test('should refuse scripts, event handlers, outside links and non-SVG', () => {
    for (const bad of ['<svg><script>x</script></svg>', '<svg onload="x()"></svg>', '<svg><a href="http://evil"/></svg>', '<svg><image href="x.png"/></svg>', '<div></div>', '<svg>']) {
      assert.equal(G.cleanSvg(bad), null, bad);
    }
  });
});
