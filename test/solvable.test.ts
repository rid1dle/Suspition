import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { storyIssues, applyStoryPatches } from '../server/story.ts';
import { SCENARIO_SCHEMA, PHASE_SCHEMA, GENERATION_SYSTEM, phasePrompt } from '../server/prompts.ts';
import { makeScenario, gameInReading, emptyPhase } from './fixtures.ts';

const withGoals = (s) => {
  for (const p of s.players) {
    p.goal_steps = [`Find the letter of ${p.id}.`, `Burn the letter of ${p.id}.`];
    p.goal_where = 'l2';
  }
  return s;
};

const playing = (players = 4, phases = 3) => {
  const game = gameInReading(players, 1_000, { phases });
  withGoals(game.scenario);
  game.setup.replays = 0;
  G.startPlay(game, 1_000);
  return game;
};
const nextRound = (game, result = emptyPhase, now = 5_000) => G.completePhase(game, structuredClone(result), now);

describe('every player has a goal they can reach', () => {
  const issues = (s) => storyIssues(s, { players: [] }).filter((t) => t.startsWith('goal:'));

  test('should ask the world writer for the place or person each goal is reached at', () => {
    assert.ok(SCENARIO_SCHEMA.properties.players.items.properties.goal_where);
    assert.match(GENERATION_SYSTEM, /goal_where: the id of the place or GM character where this goal can be reached/);
  });

  test('should refuse a world where a player has no goal', () => {
    const s = makeScenario(4);
    s.players[2].goal = ' ';
    assert.ok(G.validateScenario(s, { playerCount: 4, phases: 3, hints: 3 }).some((e) => /p3 needs a goal/.test(e)));
  });

  test('should flag a goal with no place or person to reach it at', () => {
    const s = withGoals(makeScenario(4));
    s.players[2].goal_where = '';
    s.players[3].goal_where = 'l9';
    const found = issues(s);
    assert.equal(found.length, 2);
    assert.match(found[0], /players\[2\] \(p3\)/);
    assert.match(found[1], /players\[3\]\.goal_where \(l9\) is not a place or a person/);
  });

  test('should flag a goal with fewer than 2 steps', () => {
    const s = withGoals(makeScenario(4));
    s.players[1].goal_steps = ['Do it.'];
    assert.match(issues(s)[0], /players\[1\] \(p2\) has 1 goal step; it needs 2 or 3/);
  });

  test('should let a culprit goal of not being named have no place', () => {
    const s = withGoals(makeScenario(4));
    s.players[0].goal_where = '';
    assert.deepEqual(issues(s), []);
  });

  test('should let the story check set a goal place', () => {
    const s = withGoals(makeScenario(4));
    s.players[2].goal_where = '';
    applyStoryPatches(s, [{ path: 'players.2.goal_where', value: 'n1' }], { playerCount: 4, phases: 3, hints: 3 });
    assert.equal(s.players[2].goal_where, 'n1');
  });

  test('should tell the round GM whose goals have not moved past half the game', () => {
    const game = playing(4, 3);
    G.markGoalSteps(game, 'p2', [0]);
    const stuck = G.snapshotForGM(game).goals_stuck;
    assert.deepEqual(stuck.map((g) => g.player_id), ['p1', 'p3', 'p4']);
    assert.equal(stuck[1].where, 'Kitchen');
    assert.match(phasePrompt({ snapshot: {}, nextPhase: {}, lastRound: null }), /goals_stuck lists players whose goal has not moved/);
  });

  test('should not count goals as stuck in the first half of the game', () => {
    const game = playing(4, 6);
    assert.deepEqual(G.snapshotForGM(game).goals_stuck, []);
  });

  test('should send a stuck player a private way in when the GM sent them nothing', () => {
    const game = playing(4, 3);
    nextRound(game, { ...emptyPhase, messages_to_players: [{ player_id: 'p3', text: 'A maid mentions a letter.' }] });
    const nudge = game.state.threads.p4.at(-1);
    assert.equal(nudge.from, 'whisper');
    assert.match(nudge.text, /Your goal is still open: Find the letter of p4\. Try the Kitchen\./);
    assert.equal(game.state.threads.p3.filter((m) => /Your goal is still open/.test(m.text)).length, 0);
  });

  test('should send the way in only once', () => {
    const game = playing(4, 4);
    nextRound(game);
    nextRound(game);
    nextRound(game);
    assert.equal(game.state.threads.p4.filter((m) => /Your goal is still open/.test(m.text)).length, 1);
  });

  test('should name a GM character when the goal is reached through a person', () => {
    const game = playing(4, 3);
    game.scenario.players[3].goal_where = 'n1';
    nextRound(game);
    assert.match(game.state.threads.p4.at(-1).text, /Try The Butler\./);
  });
});

describe('the case can always be solved', () => {
  test('should see a culprit nothing found points at, and each key deduction nobody has a clue for', () => {
    const game = playing();
    const gaps = G.caseGaps(game);
    assert.deepEqual(gaps.map((g) => g.needs), ['culprit', 'culprit', 'method', 'motive']);
  });

  test('should see no gap once the clues are found or shared', () => {
    const game = playing();
    game.state.found.p2.push('c1');
    game.state.shared.push({ clueId: 'c3', by: 'p3', at: 2_000 });
    assert.deepEqual(G.caseGaps(game), []);
  });

  test('should show every gap at the start of the last round, so the final vote can be solved', () => {
    const game = playing();
    nextRound(game, emptyPhase, 5_000);
    assert.equal(game.state.shared.length, 0);
    nextRound(game, emptyPhase, 6_000);
    assert.equal(game.state.phaseIndex, 2);
    assert.deepEqual(game.state.shared.map((x) => x.clueId).sort(), ['c1', 'c3']);
    assert.deepEqual(G.caseGaps(game), []);
    const shown = game.state.events.filter((e) => e.kind === 'clue');
    assert.match(shown[0].text, /Someone finally checks\. (Torn glove|Note): CLUE-/);
  });

  test('should open a clue the plan kept for a later round when the last round needs it', () => {
    const game = playing(4, 3);
    game.scenario.clues.find((c) => c.id === 'c1').reveal_round = 9;
    nextRound(game);
    nextRound(game);
    assert.ok(game.state.shared.some((x) => x.clueId === 'c1'));
    assert.ok(G.openClues(game).includes('c1'));
  });

  test('should let a GM character check a lead the room kept raising, in any round', () => {
    const game = playing(4, 4);
    nextRound(game, { ...emptyPhase, checks: [{ clue_id: 'c3', line: 'The Butler finally counts the candles.' }] });
    assert.deepEqual(game.state.shared.map((x) => x.clueId), ['c3']);
    assert.match(game.state.events.filter((e) => e.kind === 'clue').at(-1).text, /^The Butler finally counts the candles\. Note: CLUE-3-SHOWS$/);
  });

  test('should refuse a check of a clue not open yet, destroyed, or already shared, and take at most 2', () => {
    const game = playing(4, 4);
    game.state.shared.push({ clueId: 'c1', by: 'p2', at: 2_000 });
    game.scenario.clues.find((c) => c.id === 'c2').reveal_round = 3;
    nextRound(game, { ...emptyPhase, checks: [{ clue_id: 'c2', line: 'x' }, { clue_id: 'c1', line: 'x' }, { clue_id: 'c9', line: 'x' }] });
    assert.deepEqual(game.state.shared.map((x) => x.clueId), ['c1']);
    const many = playing(4, 4);
    for (const c of many.scenario.clues) c.reveal_round = 1;
    nextRound(many, { ...emptyPhase, checks: ['c1', 'c2', 'c3'].map((id) => ({ clue_id: id, line: 'The Butler looks.' })) });
    assert.equal(many.state.shared.length, 2);
  });

  test('should use a plain line when the check line names the culprit', () => {
    const game = playing(4, 4);
    nextRound(game, { ...emptyPhase, checks: [{ clue_id: 'c3', line: 'Character 1 is caught with the note.' }] });
    assert.match(game.state.events.filter((e) => e.kind === 'clue').at(-1).text, /^Someone finally checks\. Note:/);
  });

  test('should show a check as found by a check, not by a player', () => {
    const game = playing(4, 4);
    nextRound(game, { ...emptyPhase, checks: [{ clue_id: 'c3', line: 'The Butler looks.' }] });
    assert.equal(G.tableView(game, 6_000).sharedClues[0].by, 'a check');
  });

  test('should ask the round GM to bring the gaps into reach near the end', () => {
    const game = playing(4, 3);
    assert.ok(G.snapshotForGM(game).case_gaps.length > 0);
    assert.ok(PHASE_SCHEMA.properties.checks);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: {}, lastRound: null }), /checks: when the room raised a fair lead more than once and nobody checked it/);
  });

  test('should keep the gaps from the round GM early in a long game', () => {
    const game = playing(4, 6);
    assert.deepEqual(G.snapshotForGM(game).case_gaps, []);
  });

  test('should never destroy the last clue left that points at a culprit or settles a deduction', () => {
    const game = playing();
    game.scenario.clues.find((c) => c.id === 'c3').can_be_destroyed = true;
    G.destroy(game, ['c1', 'c3']);
    assert.ok(!game.state.destroyed.includes('c1'));
    assert.ok(game.state.destroyed.includes('c3'));
  });
});
