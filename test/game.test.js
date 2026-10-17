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
    assert.throws(() => G.beginAsk(game, 'p2', { kind: 'question', text: 'q4' }), /No questions left/);
  });

  test('should refuse an unknown request type', () => {
    assert.throws(() => G.beginAsk(playing(), 'p2', { kind: 'magic', text: 'x' }), /Unknown request type/);
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
    assert.deepEqual(game.state.events.slice(-2).map((e) => e.text), ['Phase 2 of 3: Phase name 2', 'Something changed.']);
  });

  test('should block questions while the phase is changing', () => {
    const game = playing();
    G.beginPhaseChange(game);
    assert.throws(() => G.beginAsk(game, 'p2', { kind: 'question', text: 'q' }), /world is changing/);
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
    assert.throws(() => G.submitFinal(finalGame(), 'p2', { culprit_ids: [] }), /at least one culprit/);
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
