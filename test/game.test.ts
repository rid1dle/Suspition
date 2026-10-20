import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { makeScenario, gameInReading, emptyAsk, emptyPhase } from './fixtures.ts';
import { applyTheory } from '../server/theory.ts';

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
    assert.throws(() => G.applySetup(game, { tone: 'tense', length: 'short', hints: 3 }), /at least 1/);
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
  test('should clear the waiting question when the GM fails', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'Search the ballroom' });
    G.failAsk(game, 'p2');
    assert.equal(game.state.pending.p2, undefined);
  });

  test('should refuse a second question while one is pending', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'one' });
    assert.throws(() => G.beginAsk(game, 'p2', { kind: 'question', text: 'two' }), /still answering/);
  });

  test('should log the new phase', () => {
    const game = playing(4, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'q' });
    G.completeAsk(game, 'p2', emptyAsk);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.equal(game.state.phaseIndex, 1);
    assert.equal(game.state.phaseEndsAt, 2_000 + 10 * 60_000);
    assert.deepEqual(game.state.events.slice(-3).map((e) => e.text), ['Round 2: Phase name 2', 'Something changed.', 'New on the timeline: 9:30, TL-ROUND2']);
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
    G.submitFinal(game, 'p4', { culprit_ids: ['n1'] });
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
    assert.equal(game.state.events.at(-1).text, 'The group picked: C.');
    applyTheory(game, null, 2_500);
    assert.match(game.state.events.at(-1).text, /Something does not fit yet. NUDGE-1/);
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
    assert.deepEqual(G.playerView(game, 'p3').sharedClues, [{ id: 'c1', name: 'Torn glove', shows: 'CLUE-1-SHOWS', by: 'Character 2' }]);
    assert.match(game.state.events.at(-1).text, /Character 2 shows a clue. Torn glove: CLUE-1-SHOWS/);
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

  test('should post the question and answer for everyone', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginPublicAsk(game, 'p1', 'How far is town?');
    assert.throws(() => G.beginPublicAsk(game, 'p1', 'again'), /Wait for the answer/);
    G.completePublicAsk(game, 'p1', 'Ten miles.', 2_000);
    const qa = G.playerView(game, 'p2').events.at(-1);
    assert.deepEqual([qa.kind, qa.by, qa.q, qa.text], ['qa', 'Character 1', 'How far is town?', 'Ten miles.']);
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

describe('who knows what', () => {
  const playing = () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    return game;
  };

  test('should record what a GM character learns in a scene, and from whom', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'I show the butler the glove' });
    G.completeAsk(game, 'p2', { ...emptyAsk, learned: [{ character_id: 'n1', fact: 'The glove was torn.', how: 'Player2 showed him' }, { character_id: 'p1', fact: 'nope', how: 'x' }, { character_id: 'n2', fact: '  ', how: 'x' }] }, 5_000);
    assert.deepEqual(game.state.knowledge, [{ character_id: 'n1', fact: 'The glove was torn.', how: 'Player2 showed him', round: 1, source: 'p2', at: 5_000 }]);
  });

  test('should record learning during a round change', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, learned: [{ character_id: 'n2', fact: 'The radio is cut.', how: 'She tried to call out' }] });
    assert.equal(game.state.knowledge[0].source, 'round change');
  });

  test('should tell the GM what each of its characters has learned', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, learned: [{ character_id: 'n1', fact: 'KNOWLEDGE-FACT', how: 'told' }] });
    assert.deepEqual(G.snapshotForGM(game).what_gm_characters_have_learned, { n1: ['Round 1: KNOWLEDGE-FACT (told)'], n2: [] });
  });

  test('should keep the record hidden until the reveal, then show it', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, learned: [{ character_id: 'n1', fact: 'KNOWLEDGE-FACT', how: 'told' }] });
    assert.ok(!JSON.stringify([G.tableView(game), G.playerView(game, 'p2'), G.playerView(game, 'p3')]).includes('KNOWLEDGE-FACT'));
    game.status = 'final';
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'] });
    G.applyScore(game, G.computeVerdict(game), { reveal_story: 'S', players: [] });
    assert.deepEqual(G.tableView(game).reveal.learned, [{ who: 'The Butler', fact: 'KNOWLEDGE-FACT', how: 'told', round: 1 }]);
  });
});

describe('moments and overrides', () => {
  const playing = (overrides = 2) => {
    const game = G.createGame(1_000);
    for (const name of ['A', 'B', 'C']) G.addPlayer(game, { name });
    G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, overrides });
    G.attachScenario(game, makeScenario(3), 1_000);
    G.startPlay(game, 1_000);
    return game;
  };
  const momentFor = (game, line = 'I saw a light.') => {
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, moments: [{ player_id: 'p2', line: `"${line}"`, why: 'You remember now.' }] }, 2_000);
    return game.state.moments.at(-1);
  };

  test('should give the player a private heads-up before calling them', () => {
    const game = playing();
    const m = momentFor(game);
    assert.equal(m.status, 'getready');
    assert.equal(m.line, 'I saw a light.');
    assert.deepEqual(G.playerView(game, 'p2').moments.map((x) => x.line), ['I saw a light.']);
    assert.ok(!JSON.stringify([G.tableView(game), G.playerView(game, 'p3')]).includes('I saw a light'));
    assert.deepEqual(G.tableView(game).calling, []);
  });

  test('should call the player after a minute, or sooner when they are ready', () => {
    const game = playing();
    const m = momentFor(game);
    assert.equal(G.tickMoments(game, 2_000 + G.MOMENT_READY_MS - 1), false);
    assert.equal(G.tickMoments(game, 2_000 + G.MOMENT_READY_MS), true);
    assert.equal(m.status, 'called');
    assert.deepEqual(G.tableView(game).calling, ['B']);
    assert.equal(game.state.events.at(-1).text, 'Character 2, the story turns to you.');
    const game2 = playing();
    const m2 = momentFor(game2);
    G.readyMoment(game2, 'p2', m2.id, 2_500);
    assert.equal(m2.status, 'called');
  });

  test('should post what they said when they say it', () => {
    const game = playing();
    const m = momentFor(game);
    G.answerMoment(game, 'p2', m.id, 'said', 3_000);
    assert.equal(game.state.events.at(-1).text, 'Character 2 said: "I saw a light."');
    assert.equal(game.state.overridesLeft.p2, 2);
  });

  test('should let them stay quiet or say it their way for one override each', () => {
    const game = playing(1);
    const m = momentFor(game);
    G.answerMoment(game, 'p2', m.id, 'quiet', 3_000);
    assert.equal(game.state.events.at(-1).text, 'Character 2 chose to stay quiet.');
    assert.equal(game.state.overridesLeft.p2, 0);
    assert.ok(!JSON.stringify(G.tableView(game)).includes('I saw a light'));
  });

  test('should force the line out when no overrides are left', () => {
    const game = playing(0);
    const m = momentFor(game);
    assert.throws(() => G.answerMoment(game, 'p2', m.id, 'own', 3_000), /No overrides left/);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 4_000);
    assert.equal(m.status, 'forced');
    assert.ok(game.state.events.some((e) => e.kind === 'forced' && e.text === 'Character 2 could not keep it in: "I saw a light."'));
  });

  test('should spend an override when a moment is ignored until the round ends', () => {
    const game = playing(2);
    const m = momentFor(game);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 4_000);
    assert.deepEqual([m.status, game.state.overridesLeft.p2], ['quiet', 1]);
  });

  test('should only let the owner answer, once', () => {
    const game = playing();
    const m = momentFor(game);
    assert.throws(() => G.answerMoment(game, 'p3', m.id, 'said'), /not yours/);
    G.answerMoment(game, 'p2', m.id, 'said');
    assert.throws(() => G.answerMoment(game, 'p2', m.id, 'said'), /already done/);
  });

  test('should give each player at most one open moment and two per round change', () => {
    const game = playing();
    G.addMoments(game, [{ player_id: 'p1', line: 'a' }, { player_id: 'p1', line: 'b' }, { player_id: 'p2', line: 'c' }, { player_id: 'p3', line: 'd' }, { player_id: 'zz', line: 'e' }]);
    assert.deepEqual(game.state.moments.map((m) => m.line), ['a', 'c']);
  });

  test('should tell the GM how every moment went', () => {
    const game = playing();
    const m = momentFor(game);
    G.answerMoment(game, 'p2', m.id, 'own');
    assert.deepEqual(G.snapshotForGM(game).moments_so_far, [{ player_id: 'p2', line: 'I saw a light.', round: 2, result: 'own' }]);
  });
});

describe('never speaking for players', () => {
  test('should show names, never ids, as speakers', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, lines: [{ speaker: 'n1', text: 'Hello.' }, { speaker: 'p3', text: 'I did it.' }, { speaker: 'p2', text: 'Me?' }] });
    assert.deepEqual(game.state.threads.p2.at(-1).lines, [{ speaker: 'The Butler', text: 'Hello.' }, { speaker: '', text: 'You say: "Me?"' }]);
  });

  test("should turn the asking player's spoken line into narration and drop other players' lines", () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, lines: [
      { speaker: 'Character 2', text: 'Where were you?' },
      { speaker: 'Character 3', text: 'I did it!' },
      { speaker: 'The Butler', text: 'In the kitchen.' },
    ] });
    assert.deepEqual(game.state.threads.p2.at(-1).lines, [
      { speaker: '', text: 'You say: "Where were you?"' },
      { speaker: 'The Butler', text: 'In the kitchen.' },
    ]);
  });
});

describe('saying a moment in your own words', () => {
  const called = (overrides = 2) => {
    const game = playing(3);
    game.setup.overrides = overrides;
    game.state.overridesLeft = { p1: overrides, p2: overrides, p3: overrides };
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, moments: [{ player_id: 'p2', line: 'I saw a light.', why: 'You remember.' }] }, 2_000);
    return { game, m: game.state.moments.at(-1) };
  };

  test('should post the words the player typed and spend one override', () => {
    const { game, m } = called();
    G.answerMoment(game, 'p2', m.id, 'own', 3_000, { text: '"Something glowed out there."' });
    assert.deepEqual(game.state.events.at(-1), { at: 3_000, phase: 1, kind: 'said', text: 'Character 2, in their own words: "Something glowed out there."' });
    assert.equal(game.state.overridesLeft.p2, 1);
    assert.ok(!JSON.stringify(G.tableView(game)).includes('I saw a light'));
  });

  test('should tell the GM what the player really said', () => {
    const { game, m } = called();
    G.answerMoment(game, 'p2', m.id, 'own', 3_000, { text: 'Something glowed.' });
    assert.equal(G.snapshotForGM(game).moments_so_far[0].said_instead, 'Something glowed.');
  });

  test('should still need an override to say it your way', () => {
    const { game, m } = called(0);
    assert.throws(() => G.answerMoment(game, 'p2', m.id, 'own', 3_000, { text: 'Hi' }), /No overrides left/);
  });
});

describe('the group goal and personal goals', () => {
  test('should use the case question the GM wrote, or a plain default', () => {
    const game = gameInReading(3);
    assert.equal(G.tableView(game).caseQuestion, 'Who did it, how, and why?');
    game.scenario.case_question = 'Who poisoned Mr Rao, and why?';
    assert.equal(G.tableView(game).caseQuestion, 'Who poisoned Mr Rao, and why?');
  });

  test('should end the intro with the group goal, the secret goal reminder and how points work', () => {
    const game = gameInReading(3);
    game.scenario.case_question = 'Who poisoned Mr Rao?';
    const goal = G.tableView(game).briefing.steps.at(-1);
    assert.equal(goal.title, 'Your goals and how to win');
    assert.equal(goal.lines[0], 'Who poisoned Mr Rao?');
    assert.ok(goal.lines.some((l) => /secret goal of your own/.test(l)));
    assert.ok(goal.lines.some((l) => /Points: .* 6 in all\./.test(l)));
    assert.ok(G.tableView(game).briefing.steps[1].lines.includes('The big question: Who poisoned Mr Rao?'));
  });

  test('should tell each player how their side wins, only on their own phone', () => {
    const game = gameInReading(3);
    assert.match(G.playerView(game, 'p1').card.win, /name the wrong person/);
    assert.match(G.playerView(game, 'p2').card.win, /name the right culprit/);
    assert.ok(!JSON.stringify(G.tableView(game)).includes('name the wrong person'));
  });

  test('should record who showed a clue and its name on the news item', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'look' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'] });
    G.shareClue(game, 'p2', 'c1', 2_000);
    assert.equal(game.state.events.at(-1).by, 'Character 2');
    assert.equal(game.state.events.at(-1).name, 'Torn glove');
  });
});

describe('how many people the GM plays, and which ones matter', () => {
  const setup = (input) => {
    const game = G.createGame();
    for (const name of ['A', 'B', 'C']) G.addPlayer(game, { name });
    return G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, ...input });
  };

  test('should default to three GM characters with some that matter, and accept zero to six', () => {
    assert.deepEqual([setup({}).npcs, setup({}).npcRole], [3, 'mixed']);
    assert.equal(setup({ npcs: 0 }).npcs, 0);
    assert.equal(setup({ npcs: 6, npcRole: 'background' }).npcRole, 'background');
    assert.throws(() => setup({ npcs: 7 }), /between 0 and 6/);
    assert.throws(() => setup({ npcRole: 'boss' }), /what the GM characters do/);
  });

  test('should never accept more GM characters than chosen, and at most one fewer', () => {
    const rules = { playerCount: 4, phases: 3, hints: 3 };
    assert.deepEqual(G.validateScenario(makeScenario(4), { ...rules, npcs: 2 }), []);
    assert.match(G.validateScenario(makeScenario(4), { ...rules, npcs: 1 }).join(), /Need exactly 1 GM characters; got 2/);
  });

  test('should keep background-only GM characters minor and away from every clue', () => {
    const rules = { playerCount: 4, phases: 3, hints: 3, npcRole: 'background' };
    const s = makeScenario(4);
    assert.match(G.validateScenario(s, rules).join(), /Every GM character must be minor/);
    s.npcs.forEach((n) => (n.importance = 'minor'));
    s.clues[0].where = 'In the Butler pocket';
    assert.match(G.validateScenario(s, rules).join(), /Clue c1 sits with a GM character/);
    s.clues[0].where = 'Under the rug';
    assert.match(G.validateScenario(s, rules).join(), /Clue c3 sits with a GM character/);
    s.clues[2].where = 'l2';
    assert.deepEqual(G.validateScenario(s, rules), []);
  });

  test('should ask for a redraft when the GM cast is far from the number chosen', () => {
    const rules = { playerCount: 4, phases: 3, hints: 3 };
    assert.deepEqual(G.validateScenario(makeScenario(4), { ...rules, npcs: 3 }), []);
    assert.match(G.validateScenario(makeScenario(4), { ...rules, npcs: 5 }).join(), /Need exactly 5 GM characters; got 2/);
  });

  test('should need at least one important GM character', () => {
    const s = makeScenario(4);
    s.npcs.forEach((n) => (n.importance = 'minor'));
    assert.match(G.validateScenario(s, { playerCount: 4, phases: 3, hints: 3 }).join(), /At least one GM character must be important/);
  });

  test('should list important GM people first and mark minor ones on every screen', () => {
    const game = gameInReading(3);
    game.scenario.npcs[0].importance = 'minor';
    game.scenario.npcs[1].importance = 'important';
    const cast = G.tableView(game).cast.npcs;
    assert.deepEqual(cast.map((n) => [n.name, n.minor]), [['The Widow', false], ['The Butler', true]]);
    assert.deepEqual(G.playerView(game, 'p2').cast.npcs.map((n) => n.minor), [false, true]);
  });

  test('should sum up minor people in one line in the intro', () => {
    const game = gameInReading(3);
    game.scenario.npcs[0].importance = 'minor';
    const step = G.tableView(game).briefing.steps.find((s) => s.kind === 'npcs');
    assert.deepEqual(step.lines, ['The Widow, Widow. Grieving', 'Minor people: The Butler (Butler). They are part of the place, but they hold nothing big.']);
  });
});

describe('players always know their own story', () => {
  const scenario = () => {
    const s = makeScenario(3);
    s.players[1].starting_knowledge = 'You heard a door.';
    s.players[1].hidden_facts = [{ id: 'h2', fact: 'You slipped on the stairs at 10:20.' }, { id: 'h9', fact: 'You were adopted.' }];
    return s;
  };

  test('should add what the check found to the player own card', () => {
    const s = scenario();
    const n = G.applyAudit(s, { players: [{ player_id: 'p2', add: ['You walked to the shed at 9.'], known_hidden_fact_ids: [] }] });
    assert.equal(n, 1);
    assert.equal(s.players[1].starting_knowledge, 'You heard a door. You walked to the shed at 9.');
  });

  test('should move a hidden fact the player would really know onto their card', () => {
    const s = scenario();
    G.applyAudit(s, { players: [{ player_id: 'p2', add: [], known_hidden_fact_ids: ['h2', 'h1'] }] });
    assert.deepEqual(s.players[1].hidden_facts.map((h) => h.id), ['h9']);
    assert.match(s.players[1].starting_knowledge, /You slipped on the stairs at 10:20\.$/);
  });

  test('should skip repeats, unknown players and a broken answer', () => {
    const s = scenario();
    assert.equal(G.applyAudit(s, { players: [{ player_id: 'p2', add: ['You heard a door.', 'X', 'X'] }, { player_id: 'zz', add: ['Y'] }] }), 1);
    assert.equal(s.players[1].starting_knowledge, 'You heard a door. X');
    assert.equal(G.applyAudit(s, { title: 'not an audit' }), 0);
    assert.equal(G.applyAudit(s, null), 0);
  });

  test('should show the new knowledge on the player card only', () => {
    const game = gameInReading(3);
    G.applyAudit(game.scenario, { players: [{ player_id: 'p2', add: ['You hid the key in the boot.'] }] });
    assert.match(G.playerView(game, 'p2').card.starting_knowledge, /You hid the key in the boot\./);
    assert.ok(!JSON.stringify([G.tableView(game), G.playerView(game, 'p3')]).includes('hid the key'));
  });
});

describe('players feel why they act', () => {
  test('should fill wants, fears and why the goal matters, and list a reason for each action', () => {
    const s = makeScenario(3);
    G.applyAudit(s, { players: [{ player_id: 'p2', add: [], known_hidden_fact_ids: [], wants: 'You want the farm back for your mother.', fears: 'You fear the loan comes out.', goal_why: 'The book proves your father was honest.', reasons: ['You went to the shed because you heard your name.'] }] });
    const p = s.players[1];
    assert.deepEqual([p.wants, p.fears, p.goal_why, p.reasons], ['You want the farm back for your mother.', 'You fear the loan comes out.', 'The book proves your father was honest.', ['You went to the shed because you heard your name.']]);
  });

  test('should keep motives the world already had and never repeat a reason', () => {
    const s = makeScenario(3);
    s.players[1].wants = 'ORIGINAL';
    const audit = { players: [{ player_id: 'p2', wants: 'NEW', reasons: ['R1'] }] };
    G.applyAudit(s, audit);
    G.applyAudit(s, audit);
    assert.equal(s.players[1].wants, 'ORIGINAL');
    assert.deepEqual(s.players[1].reasons, ['R1']);
  });

  test('should show what drives a player only on their own phone', () => {
    const game = gameInReading(3);
    G.applyAudit(game.scenario, { players: [{ player_id: 'p2', wants: 'MOTIVE-WANTS', fears: 'MOTIVE-FEARS', goal_why: 'MOTIVE-WHY', reasons: ['MOTIVE-REASON'] }] });
    const card = G.playerView(game, 'p2').card;
    assert.deepEqual([card.wants, card.fears, card.goal_why, card.reasons], ['MOTIVE-WANTS', 'MOTIVE-FEARS', 'MOTIVE-WHY', ['MOTIVE-REASON']]);
    assert.ok(!JSON.stringify([G.tableView(game), G.playerView(game, 'p3')]).includes('MOTIVE-'));
  });
});

describe('who was where, and each round job', () => {
  const audit = {
    players: [{ player_id: 'p2', night: [{ time: '9:40 pm', where: 'Kitchen', doing: 'You washed cups.' }] }],
    key_times: [{ time: '9:00 pm', what: 'Dinner ends' }, { time: '9:40 pm', what: 'Lights go out' }],
    alibis: [{ id: 'p1', alibi: [{ time: '9:00 pm', where: 'Ballroom' }, { time: '9:40 pm', where: 'Garden' }] }, { id: 'n1', alibi: [{ time: '9:40 pm', where: 'Cellar' }] }],
    rounds: [{ index: 0, objective: 'Find out who cut the lights.', try: ['Ask the butler.', 'Look at the fuse box.', 'Check the cellar.', 'Extra'] }],
  };

  test('should show everyone where each person says they were at the key times', () => {
    const game = gameInReading(3);
    G.applyAudit(game.scenario, audit);
    assert.deepEqual(G.tableView(game).alibis, {
      times: [{ time: '9:00 pm', what: 'Dinner ends' }, { time: '9:40 pm', what: 'Lights go out' }],
      rows: [
        { name: 'Character 1', kind: 'player', minor: false, cells: ['Ballroom', 'Garden'] },
        { name: 'The Butler', kind: 'npc', minor: false, cells: ['', 'Cellar'] },
      ],
    });
  });

  test('should show a player where they really were only on their own phone', () => {
    const game = gameInReading(3);
    G.applyAudit(game.scenario, audit);
    assert.deepEqual(G.playerView(game, 'p2').card.night, [{ time: '9:40 pm', where: 'Kitchen', doing: 'You washed cups.' }]);
    assert.ok(!JSON.stringify([G.tableView(game), G.playerView(game, 'p3')]).includes('washed cups'));
  });

  test('should have no alibi table before anyone has an alibi', () => {
    assert.equal(G.tableView(gameInReading(3)).alibis, null);
  });

  test('should give each round a clear job with up to three pointers, and announce it', () => {
    const game = gameInReading(3);
    G.applyAudit(game.scenario, audit);
    G.startPlay(game, 1_000);
    const round = G.tableView(game).round;
    assert.equal(round.objective, 'Find out who cut the lights.');
    assert.deepEqual(round.tips, ['Ask the butler.', 'Look at the fuse box.', 'Check the cellar.']);
    assert.ok(game.state.events.some((e) => e.text === 'This round, your job: Find out who cut the lights.'));
  });

  test('should keep a job the world already had', () => {
    const s = makeScenario(3);
    s.phases[0].objective = 'ORIGINAL JOB';
    G.applyAudit(s, audit);
    assert.equal(s.phases[0].objective, 'ORIGINAL JOB');
  });
});

describe('asking a GM character out loud', () => {
  test('should hand the GM the sheet of each GM character named in the question', () => {
    const game = gameInReading(3);
    const people = G.peopleAsked(game, 'Butler, when did the music stop?');
    assert.deepEqual(people.map((p) => [p.name, p.knows]), [['The Butler', 'NPC-KNOWS']]);
    assert.deepEqual(G.peopleAsked(game, 'Who was in the library?'), []);
    assert.deepEqual(G.peopleAsked(game, 'Is the widow sad?').map((p) => p.name), ['The Widow']);
  });

  test('should remember earlier questions asked out loud so answers stay the same', () => {
    const game = gameInReading(3);
    G.beginPublicAsk(game, 'p1', 'How far is town?');
    G.completePublicAsk(game, 'p1', 'Two hours.', 2_000);
    assert.deepEqual(G.publicKnowledge(game).asked_out_loud_before, ['Character 1 asked: How far is town? Answer: Two hours.']);
  });

  test('should keep the GM ideas for what the player could try next', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I look around.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, ideas: ['Ask the Butler about the gate.', '', 'Check the cellar.', 'One', 'Two'] });
    assert.deepEqual(G.playerView(game, 'p2').thread.at(-1).ideas, ['Ask the Butler about the gate.', 'Check the cellar.', 'One']);
  });
});

describe('reminders of who you are', () => {
  test('should start with who you are, then goal, feelings, story, reasons and your night, one short line each', () => {
    const pellets = G.pelletsFor({
      character_name: 'Nikhil Rao', role_title: 'Bank Manager', public_info: 'A former college captain. Everyone liked him.',
      goal: 'Get the ledger back.', wants: 'You want your job safe.', fears: 'You fear the loan comes out.',
      private_info: 'You lent Arjun money. He never paid.', reasons: ['You went upstairs to ask for it.'],
      night: [{ time: '9:40 pm', where: 'Library', doing: 'You argued with Arjun.' }],
    });
    assert.deepEqual(pellets, [
      'You are Nikhil Rao, Bank Manager.',
      'Everyone knows: A former college captain.',
      'Everyone knows: Everyone liked him.',
      'Your secret goal: Get the ledger back.',
      'You want your job safe.',
      'You fear the loan comes out.',
      'You lent Arjun money.',
      'He never paid.',
      'You went upstairs to ask for it.',
      'At 9:40 pm you were at Library. You argued with Arjun.',
    ]);
  });

  test('should send reminders only to that player phone', () => {
    const game = gameInReading(3);
    assert.equal(G.playerView(game, 'p2').card.pellets[0], 'You are Character 2, Role 2.');
    assert.ok(!JSON.stringify(G.tableView(game)).includes('Your secret goal'));
  });
});

describe('playing a round again when the group got it wrong', () => {
  const voting = (replays = 2) => {
    const game = gameInReading(3, 1_000, { questions: true });
    game.setup.replays = replays;
    G.startPlay(game, 1_000);
    return game;
  };
  const voteAll = (game, choice) => {
    G.beginRoundVote(game, 2_000);
    for (const p of ['p1', 'p2', 'p3']) G.voteRound(game, p, choice, 2_000);
  };
  const change = (game, extra = {}) => {
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, ...extra }, 3_000);
  };

  test('should replay the same round as a second try, with one more round in all', () => {
    const game = voting();
    voteAll(game, 2);
    assert.equal(G.willReplay(game), true);
    assert.equal(G.nextPhaseInfo(game).again, true);
    change(game);
    assert.equal(game.state.phaseIndex, 0);
    assert.deepEqual([G.tableView(game).phase.number, G.tableView(game).phase.count], [2, 4]);
    assert.ok(game.state.events.some((e) => /^Round 2: .* \(second try\)$/.test(e.text)));
    assert.equal(G.needsRoundVote(game), true);
  });

  test('should move on after a right answer, when nobody voted, or when replays run out', () => {
    const right = voting();
    voteAll(right, 1);
    assert.equal(G.willReplay(right), false);
    const silent = voting();
    G.beginRoundVote(silent, 2_000);
    G.resolveRoundVote(silent, 2_000, true);
    assert.equal(G.willReplay(silent), false);
    const none = voting(0);
    voteAll(none, 2);
    assert.equal(G.willReplay(none), false);
  });

  test('should replay the last round instead of jumping to the final vote', () => {
    const game = voting();
    game.state.phaseIndex = 2;
    game.state.roundNumber = 3;
    voteAll(game, 2);
    assert.equal(G.goesToFinal(game), false);
    change(game);
    assert.deepEqual([game.status, game.state.phaseIndex], ['playing', 2]);
  });

  test('should use the job the GM wrote from what players did, and keep a recap for everyone', () => {
    const game = voting();
    game.state.events.push({ at: 1_500, phase: 0, kind: 'event', text: 'Someone says the lamp moved at ten.' });
    change(game, { job: 'Find out who moved the lamp.', job_tips: ['Ask Gopi.'], recap: ['The lamp moved at ten.'], open_questions: ['Who moved it?'] });
    const view = G.tableView(game);
    assert.equal(view.round.objective, 'Find out who moved the lamp.');
    assert.deepEqual(view.round.tips, ['Ask Gopi.']);
    assert.deepEqual(view.recap, { round: 2, lines: ['The lamp moved at ten.'], open: ['Who moved it?'] });
  });

  test('should give the GM the story stage for pacing', () => {
    const game = voting();
    assert.equal(G.storyStage(game, 0).name, 'opening');
    assert.equal(G.storyStage(game, 2).name, 'closing');
    assert.equal(G.nextPhaseInfo(game).stage.name, 'digging');
  });
});

describe('keeping the GM in step with the players and the room', () => {
  test('should keep a private read of each player from private and out-loud questions', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I watch Ramesh.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, player_read: { intent: 'You are watching Ramesh.', persona: 'You are calm.' } });
    assert.equal(G.playerView(game, 'p2').persona.intent, 'You are watching Ramesh.');
    G.beginPublicAsk(game, 'p2', 'Ramesh, where were you?');
    G.completePublicAsk(game, 'p2', 'He says the gate.', 2_000, { intent: '', persona: 'You come across as sharp.' });
    assert.deepEqual([G.playerView(game, 'p2').persona.intent, G.playerView(game, 'p2').persona.persona], ['You are watching Ramesh.', 'You come across as sharp.']);
    assert.equal(G.playerView(game, 'p3').persona, null);
    assert.ok(!JSON.stringify(G.tableView(game)).includes('watching Ramesh'));
    assert.equal(G.snapshotForGM(game).players_now.p2.intent, 'You are watching Ramesh.');
  });

  test('should let the host tell the GM what the room thinks', () => {
    const game = gameInReading(3);
    G.addNote(game, ' We think the butler lied. ', 2_000);
    assert.equal(game.state.events.at(-1).text, 'The room thinks: We think the butler lied.');
    assert.throws(() => G.addNote(game, ''), /Write what the room thinks/);
  });

  test('should show the GM questions asked out loud with who asked them', () => {
    const game = gameInReading(3);
    G.beginPublicAsk(game, 'p1', 'Cold?');
    G.completePublicAsk(game, 'p1', 'Yes.', 2_000);
    assert.ok(G.snapshotForGM(game).public_events.includes('Character 1 asked out loud: Cold? Answer: Yes.'));
  });
});

describe('who decides the culprits', () => {
  test('should refuse a world whose player culprits are not the ones the game picked, or a background culprit', () => {
    const rules = { playerCount: 4, phases: 3, hints: 3 };
    assert.match(G.validateScenario(makeScenario(4), { ...rules, culprits: ['p2'] }).join(), /must be exactly p2/);
    assert.deepEqual(G.validateScenario(makeScenario(4), { ...rules, culprits: ['p1'] }), []);
    const s = makeScenario(4);
    s.truth.culprit_ids = ['p1', 'n1'];
    s.npcs[0].importance = 'minor';
    assert.match(G.validateScenario(s, rules).join(), /n1 is a background GM character and cannot be a culprit/);
  });
});

describe('public facts about each person', () => {
  const playing3 = () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    return game;
  };
  const factsOf = (game, id) => G.tableView(game).people.find((p) => p.id === id).facts.map((f) => f.fact);

  test('should find people named in a text by character name or player name', () => {
    const game = playing3();
    assert.deepEqual(G.mentions(game, 'Player2 saw the Butler near Character 3.').sort(), ['n1', 'p2', 'p3']);
    assert.deepEqual(G.mentions(game, 'Nobody here.'), []);
  });

  test('should add what a player says out loud to their facts', () => {
    const game = playing3();
    G.addMoments(game, [{ player_id: 'p2', line: 'I saw a light.' }], 1_000);
    G.answerMoment(game, 'p2', game.state.moments[0].id, 'said', 2_000);
    assert.deepEqual(factsOf(game, 'p2'), ['Said out loud: "I saw a light."']);
  });

  test('should add facts from round changes and from answers given out loud, by id or name, once', () => {
    const game = playing3();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, public_facts: [{ person_id: 'n1', fact: 'He was at the gate.' }, { person_id: 'zz', fact: 'Nobody.' }] }, 2_000);
    G.beginPublicAsk(game, 'p1', 'Butler?');
    G.completePublicAsk(game, 'p1', 'He shrugs.', 3_000, { intent: '', persona: '', facts: [{ person: 'The Butler', fact: 'He was at the gate.' }, { person: 'Widow', fact: 'She hates rain.' }] });
    assert.deepEqual(factsOf(game, 'n1'), ['He was at the gate.']);
    assert.deepEqual(factsOf(game, 'n2'), ['She hates rain.']);
  });

  test('should file a shared clue under every person it names', () => {
    const game = playing3();
    game.scenario.clues[0].shows = 'A glove with Character 3 initials.';
    G.beginAsk(game, 'p2', { kind: 'question', text: 'look' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'] });
    G.shareClue(game, 'p2', 'c1', 2_000);
    assert.deepEqual(factsOf(game, 'p3'), ['Clue, Torn glove: A glove with Character 3 initials.']);
  });

  test('should list players first, then important and minor GM people, with only public things', () => {
    const game = playing3();
    game.scenario.npcs[0].importance = 'minor';
    const people = G.tableView(game).people;
    assert.deepEqual(people.map((p) => [p.id, p.kind, p.minor]), [['p1', 'player', false], ['p2', 'player', false], ['p3', 'player', false], ['n2', 'npc', false], ['n1', 'npc', true]]);
    const body = JSON.stringify(people);
    for (const secret of ['PRIVATE-', 'NPC-KNOWS', 'NPC-SECRET', 'GOAL-', 'HIDDEN-']) assert.ok(!body.includes(secret), secret);
  });
});

describe('people facts for a game saved before facts existed', () => {
  test('should rebuild what players said out loud from the news', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    game.state.events.push({ at: 2_000, phase: 0, kind: 'said', text: 'Player2 said: "I fell."' }, { at: 3_000, phase: 0, kind: 'said', text: 'Player3, in their own words: "Not me."' });
    G.backfillFacts(game);
    const facts = (id) => G.tableView(game).people.find((p) => p.id === id).facts.map((f) => f.fact);
    assert.deepEqual([facts('p2'), facts('p3')], [['Said out loud: "I fell."'], ['Said out loud: "Not me."']]);
    G.backfillFacts(game);
    assert.equal(game.state.facts.length, 2);
  });
});

describe('fair play: players control only their own character', () => {
  const named = () => {
    const game = playing(3);
    const names = [['Nikhil', 'Nikhil Rao'], ['Rishabh', 'Rishabh Sen'], ['Himanshu', 'Himanshu Lal']];
    game.players.forEach((p, i) => (p.name = names[i][0]));
    game.scenario.players.forEach((c, i) => (c.character_name = names[i][1]));
    game.scenario.npcs[0].name = 'Ramesh Yadav';
    return game;
  };

  test("should drop a public event sentence that puts words in another player's mouth", () => {
    const out = G.dropPuppeting(named(), 'p1', 'Rishabh argued the keys matter. Ramesh nods.');
    assert.deepEqual(out, { text: 'Ramesh nods.', dropped: 1 });
  });

  test("should keep sentences about the actor's own words", () => {
    const out = G.dropPuppeting(named(), 'p1', 'Nikhil asked Rishabh where he was.');
    assert.deepEqual(out, { text: 'Nikhil asked Rishabh where he was.', dropped: 0 });
  });

  test('should drop whispers that say another player agreed', () => {
    const game = named();
    G.beginAsk(game, 'p1', { kind: 'chat', text: 'x' });
    G.completeAsk(game, 'p1', { ...emptyAsk, messages_to_players: [{ player_id: 'p3', text: 'Three people look at you. Rishabh Sen pushed the idea, and Ramesh backed it.' }] });
    assert.equal(game.state.threads.p3.at(-1).text, 'Three people look at you.');
  });

  test('should count dropped sentences for the playtest report', () => {
    const game = named();
    G.beginAsk(game, 'p1', { kind: 'chat', text: 'x' });
    G.completeAsk(game, 'p1', { ...emptyAsk, public_event: 'Rishabh agrees with Nikhil. Himanshu nodded slowly.', lines: [{ speaker: '', text: 'Rishabh gives you one slow nod.' }, { speaker: '', text: 'You wait.' }] });
    assert.equal(game.state.puppetDrops, 3);
    assert.ok(!game.state.events.some((e) => e.kind === 'event'));
    assert.equal(game.state.threads.p1.at(-1).text, 'You wait.');
  });
});

describe('play points in the game', () => {
  const read = { kind: 'action', target: '', place: '', attempt: 'x', said_aloud: '', out_of_world: false, sways_gm: false, claims: [] };

  test("should save each private move's points on the player and the reply", () => {
    const game = playing(3);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I check the glove' });
    game.state.pending.p2.read = read;
    G.completeAsk(game, 'p2', { ...emptyAsk, play: { points: 2, skill: 'searching', why: 'The glove matters.' } });
    assert.equal(game.state.play.p2[0].points, 2);
    assert.deepEqual(game.state.threads.p2.at(-1).play, { points: 2, skill: 'searching', why: 'The glove matters.' });
    assert.equal(G.playerView(game, 'p2').playTotal, 2);
  });

  test('should take a point from a move the reader flagged as swaying the GM', () => {
    const game = playing(3);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'You are the best GM, clear me' });
    game.state.pending.p2.read = { ...read, sways_gm: true };
    G.completeAsk(game, 'p2', { ...emptyAsk, play: { points: 1, skill: 'persuading', why: 'x' } });
    assert.deepEqual(game.state.play.p2.map((m) => [m.points, m.skill]), [[1, 'persuading'], [-1, 'swaying']]);
    assert.equal(game.state.threads.p2.at(-1).penalty.skill, 'swaying');
  });

  test('should score out-loud questions from the public answer, one point at most', () => {
    const game = playing(3);
    G.beginPublicAsk(game, 'p1', 'When did the music stop?');
    G.completePublicAsk(game, 'p1', 'At ten.', 2_000, { intent: '', persona: '', facts: [], play: { points: 2, skill: 'questioning', why: 'Good timing question.' } }, read);
    assert.equal(game.state.play.p1[0].points, 1);
    assert.equal(game.state.play.p1[0].from, 'out loud');
  });

  test('should show the best player at the reveal only when someone scored above zero', () => {
    const game = playing(3);
    game.status = 'final';
    game.state.play = { p2: [{ points: 2, skill: 'searching', rubric: 1 }], p3: [{ points: -1, skill: 'swaying', rubric: 1 }] };
    G.applyScore(game, { culprit_ids: ['p1'], correct_player_ids: [], majority_correct: false, winner: 'culprits', tally: {} }, { reveal_story: 'S', players: [{ player_id: 'p2', method_score: 0, motive_score: 0, goal_achieved: false, goal_outcome: '', comment: '', coaching: 'Share sooner.' }] });
    const reveal = G.tableView(game).reveal;
    assert.deepEqual(reveal.bestPlay, ['p2']);
    const p2 = reveal.players.find((p) => p.player_id === 'p2');
    assert.deepEqual([p2.play, p2.skills, p2.coaching], [2, { searching: 2 }, 'Share sooner.']);
    game.state.play = {};
    G.applyScore(game, { culprit_ids: ['p1'], correct_player_ids: [], majority_correct: false, winner: 'culprits', tally: {} }, { reveal_story: 'S', players: [] });
    assert.deepEqual(G.tableView(game).reveal.bestPlay, []);
  });

  test('should add the play points line to the goals step without changing the 6 in all line', () => {
    const lines = G.tableView(gameInReading(3)).briefing.steps.at(-1).lines;
    const i = lines.findIndex((l) => /6 in all\./.test(l));
    assert.equal(lines[i + 1], 'Plus up to 3 play points each round for good moves.');
  });
});

describe('quiet players', () => {
  test('should list players who made no private move this round', () => {
    const game = playing(3, 1_000);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'x' });
    G.completeAsk(game, 'p2', emptyAsk, 2_000);
    assert.deepEqual(G.quietPlayers(game), ['p1', 'p3']);
    assert.deepEqual(G.snapshotForGM(game).quiet_players, ['p1', 'p3']);
  });

  test('should give the scorer each player\'s play by skill', () => {
    const game = playing(3);
    game.state.play = { p2: [{ points: 2, skill: 'questioning', rubric: 1 }] };
    assert.deepEqual(G.snapshotForGM(game).play_by_player.p2, { questioning: 2 });
  });
});

describe('fair play filter with shared titles', () => {
  const cast = (players, npcs) => {
    const game = playing(players.length);
    players.forEach(([name, character], i) => {
      game.players[i].name = name;
      game.scenario.players[i].character_name = character;
    });
    npcs.forEach((n, i) => (game.scenario.npcs[i].name = n));
    return game;
  };

  test('should keep a GM character line when a player shares their title', () => {
    const game = cast([['Asha', 'Lady Ashford'], ['Ben', 'Captain Rishabh Mehta'], ['Cy', 'Cy Rao']], ['Lady Grey', 'Captain Singh']);
    assert.equal(G.dropPuppeting(game, 'p3', 'Lady Grey said the door was locked.').dropped, 0);
    assert.equal(G.dropPuppeting(game, 'p3', 'Captain Singh says the gate was shut.').dropped, 0);
    assert.equal(G.dropPuppeting(game, 'p3', 'Lady Ashford agreed with you.').dropped, 1);
  });

  test('should keep a whisper that starts by naming the player it is sent to', () => {
    const game = cast([['Nikhil', 'Nikhil Rao'], ['Rishabh', 'Rishabh Sen'], ['Cy', 'Cy Rao']], []);
    assert.equal(G.dropPuppeting(game, 'p1', 'Rishabh, the cook says Nikhil was in the library.', { to: 'p2' }).dropped, 0);
    assert.equal(G.dropPuppeting(game, 'p1', 'Rishabh agrees with Nikhil.', { to: 'p3' }).dropped, 1);
  });
});

describe('the plan the GM writes', () => {
  test('should keep 3 to 7 short steps with known sections only', () => {
    const plan = G.cleanPlan([
      { title: 'Booking a monsoon wedding in Goa tonight with music', covers: ['title', 'nonsense'] },
      { title: 'Giving each of you a secret', covers: ['players'] },
      { title: 'Hiding the clues', covers: ['clues', 'key_deductions'] },
      { title: '', covers: ['phases'] },
    ]);
    assert.deepEqual(plan, [
      { title: 'Booking a monsoon wedding in Goa tonight', covers: ['title'] },
      { title: 'Giving each of you a secret', covers: ['players'] },
      { title: 'Hiding the clues', covers: ['clues', 'key_deductions'] },
    ]);
  });

  test('should refuse a plan with fewer than 3 usable steps', () => {
    assert.equal(G.cleanPlan([{ title: 'One', covers: ['title'] }, { title: 'Two', covers: ['nope'] }]), null);
    assert.equal(G.cleanPlan('nope'), null);
  });
});

describe('the room on the screens', () => {
  test("should show the world's room, and guess one for an old world", () => {
    const game = gameInReading(3);
    assert.equal(G.tableView(game).room.ambient, 'fog');
    game.scenario.room = { seed_color: '#2a6f97', font_pair: 'storybook', texture: 'paper', ambient: 'snow', intensity: 'medium', sound_set: 'soft' };
    const room = G.playerView(game, 'p1').room;
    assert.deepEqual([room.fontPair, room.ambient, room.intensity], ['storybook', 'snow', 'medium']);
  });
});

describe('third-person reminders', () => {
  const card = (over = {}) => ({
    character_name: 'Nikhil Rao', role_title: 'Bank Manager', public_info: 'A former college captain. You are loud.',
    night: [{ time: '9:40 pm', where: 'Library', doing: 'You argued with Arjun.' }], ...over,
  });

  test("should use the GM's third-person reminders when the card has them", () => {
    assert.deepEqual(G.remindersFor(card({ reminders: ['Nikhil Rao runs the bank on MG Road.', '  ', 'You hid the ledger.'] })), ['Nikhil Rao runs the bank on MG Road.']);
  });

  test('should build third-person reminders from the card when it has none', () => {
    assert.deepEqual(G.remindersFor(card()), ['Nikhil Rao is the Bank Manager.', 'A former college captain.', 'At 9:40 pm, Nikhil Rao was in the Library.']);
  });

  test('should never start a reminder with "You"', () => {
    for (const line of [...G.remindersFor(card()), ...G.remindersFor(card({ reminders: ['You are scared.', 'Your hands shake.'] }))]) assert.ok(!/^you\b|^your\b/i.test(line), line);
  });

  test('should put reminders on the phone card', () => {
    const game = gameInReading(3);
    assert.equal(G.playerView(game, 'p1').card.reminders[0], 'Character 1 is the Role 1.');
  });

  test('should fill missing reminders from the card check', () => {
    const sc = makeScenario(3);
    G.applyAudit(sc, { players: [{ player_id: 'p1', add: [], known_hidden_fact_ids: [], wants: '', fears: '', goal_why: '', reasons: [], night: [], reminders: ['Character 1 keeps the keys.'] }] });
    assert.deepEqual(sc.players[0].reminders, ['Character 1 keeps the keys.']);
    G.applyAudit(sc, { players: [{ player_id: 'p1', reminders: ['Something else.'] }] });
    assert.deepEqual(sc.players[0].reminders, ['Character 1 keeps the keys.']);
  });
});
