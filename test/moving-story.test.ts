import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { phasePrompt, generationPrompt, pickStoryType, STORY_TYPES, CONTINUITY_SCHEMA, PHASE_SCHEMA } from '../server/prompts.ts';
import { applyContinuity } from '../server/continuity.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { gameInReading, emptyPhase, FakeGM } from './fixtures.ts';

// A classic game with a quiz question each round and no replays, in round `round`.
const playing = ({ phases = 3, round = 1, players = 4 } = {}) => {
  const game = gameInReading(players, 1_000, { questions: true, phases });
  game.setup.replays = 0;
  G.startPlay(game, 1_000);
  for (let i = 1; i < round; i += 1) {
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 1_000 + i);
  }
  return game;
};
const quiz = (game, correct) => game.state.roundResults.push({ phaseIndex: game.state.phaseIndex, round: G.roundNumber(game), question: 'Q', picked: 0, pickedText: 'A', correct, counts: [3, 1, 0] });
const spot = (game, top, round = G.roundNumber(game), counts = [0, 0, 0, 0]) => game.state.roundResults.push({ kind: 'spotlight', phaseIndex: round - 1, round, question: G.SPOTLIGHT_QUESTION, picked: Number(top.slice(1)) - 1, pickedText: top, top, line: null, correct: null, counts });
const findAll = (game, ids) => { game.state.found.p2.push(...ids); };
const empty = { problems: [], canon_add: [], corrections: [], patches: [], offers: [], extra_rounds: [], solvable: true, missing: [] };

describe('code decides how long the story runs', () => {
  test("should add a round when the room's last answer missed before the last round", () => {
    const game = playing({ round: 2 });
    findAll(game, ['c1', 'c2', 'c3']);
    quiz(game, false);
    assert.equal(G.paceStory(game, 5_000), 'more');
    assert.equal(game.scenario.phases.length, 4);
    assert.equal(G.isLastPhase(game), false);
    assert.ok(!game.state.events.some((e) => /needs one more round/.test(e.text)), 'the room is not told the round count');
  });

  test('should add a round when fewer than half the opened clues are found', () => {
    const game = playing({ round: 2 });
    quiz(game, true);
    assert.equal(G.paceStory(game, 5_000), 'more');
  });

  test('should add a round when the last story check said the case cannot be solved', () => {
    const game = playing({ round: 2 });
    findAll(game, ['c1', 'c2', 'c3']);
    quiz(game, true);
    game.state.continuity = { lastAt: 0, answers: 0, log: [{ reason: 'round', solvable: false }] };
    assert.equal(G.paceStory(game, 5_000), 'more');
  });

  test('should change nothing when the room is on track', () => {
    const game = playing({ round: 2 });
    findAll(game, ['c1', 'c2', 'c3']);
    quiz(game, true);
    assert.equal(G.paceStory(game, 5_000), 'on');
    assert.equal(game.scenario.phases.length, 3);
  });

  test('should only add a round when the coming round would be the last one', () => {
    const game = playing({ phases: 4, round: 1 });
    quiz(game, false);
    assert.equal(G.paceStory(game, 5_000), 'on');
  });

  test('should not add a round past the cap', () => {
    const game = playing({ round: 2 });
    game.state.addedRounds = 2;
    game.state.basePhases = 1;
    quiz(game, false);
    assert.equal(G.paceStory(game, 5_000), 'on');
    assert.equal(game.scenario.phases.length, 3);
  });

  test('should close sooner when the room found almost every clue so far', () => {
    const game = playing({ phases: 5, round: 2 });
    game.scenario.clues.push({ id: 'c4', name: 'Late letter', where: 'l1', shows: 'LATE', does_not_prove: '', importance: 'useful', can_be_destroyed: false, reveal_round: 4 });
    findAll(game, ['c1', 'c2', 'c3']);
    assert.equal(G.paceStory(game, 5_000), 'sooner');
    assert.equal(game.scenario.phases.length, 3);
    assert.equal(game.scenario.phases[2].name, 'Phase name 5');
    assert.equal(game.scenario.clues[3].reveal_round, 3);
    assert.equal(game.state.events.at(-1).text, 'The room is closing in. The next round is the last.');
    assert.equal(G.paceStory(game, 6_000), 'on', 'only once a game');
  });

  test('should never close below 3 rounds', () => {
    const game = playing({ phases: 4, round: 1 });
    findAll(game, ['c1', 'c2', 'c3']);
    spot(game, 'p1', 1);
    game.state.roundResults.unshift({ kind: 'spotlight', phaseIndex: 0, round: 0, top: 'p1', counts: [] });
    assert.equal(G.paceStory(game, 5_000), 'on');
    assert.equal(game.scenario.phases.length, 4);
  });

  test('should pace the story when the host moves the round on', async () => {
    const game = playing({ round: 2 });
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore(game), clock: () => 5_000 }).init();
    quiz(app.game, false);
    app.advance();
    await app.idle();
    assert.equal(app.game.scenario.phases.length, 4);
    assert.equal(app.game.state.phaseIndex, 2);
  });
});

describe('each round is written as it starts', () => {
  test("should rename the round from the GM's round_name", () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, round_name: 'The Strongroom' }, 2_000);
    assert.equal(game.scenario.phases[1].name, 'The Strongroom');
    assert.ok(game.state.events.some((e) => e.kind === 'phase' && /The Strongroom/.test(e.text)));
  });

  test('should keep the planned name when the round name gives the culprit away', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, round_name: 'Character 1 Runs' }, 2_000);
    assert.equal(game.scenario.phases[1].name, 'Phase name 2');
  });

  test('should show the because line first in the new round', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, because: 'Because the room looked at the butler, the cellar is opened.' }, 2_000);
    const at = game.state.events.findIndex((e) => e.text === 'Because the room looked at the butler, the cellar is opened.');
    const loud = game.state.events.findIndex((e) => e.text === 'Something changed.');
    assert.ok(at > 0 && at < loud);
    assert.equal(game.state.events[at].kind, 'because');
  });

  test('should run a choice vote and tell the next round what the room chose', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, vote: { kind: 'choice', question: 'Break the door now, or wait for the key?', options: ['Break it now', 'Wait for the key'] } }, 2_000);
    const q = G.roundQuestion(game, 1);
    assert.equal(q.kind, 'choice');
    G.beginRoundVote(game, 3_000);
    for (const p of game.players) G.voteRound(game, p.id, 0, 3_100);
    const r = game.state.roundResults.at(-1);
    assert.equal(r.kind, 'choice');
    assert.equal(r.correct, null);
    assert.equal(game.state.events.at(-1).text, 'The room chose: Break it now.');
    assert.equal(G.willReplay(game), false);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: { name: 'N', planned_beat: 'B' }, lastRound: r }), /The room chose "Break it now"/);
  });

  test('should turn a second choice round in a row into a spotlight', () => {
    const game = playing();
    game.state.roundResults.push({ kind: 'choice', phaseIndex: 0, round: 1, question: 'Q', picked: 0, pickedText: 'X', correct: null, counts: [4, 0] });
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, vote: { kind: 'choice', question: 'Again?', options: ['Yes', 'No'] } }, 2_000);
    assert.equal(G.roundQuestion(game, 1).kind, 'spotlight');
  });

  test('should keep the planned quiz when the GM gives no valid vote', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, vote: { kind: 'choice', question: 'Only one?', options: ['Yes'] } }, 2_000);
    assert.equal(G.roundQuestion(game, 1).question, 'QUESTION-2');
  });

  test('should ask the GM for the round name, the because line and the vote', () => {
    for (const k of ['round_name', 'because', 'vote']) assert.ok(PHASE_SCHEMA.properties[k], k);
    const prompt = phasePrompt({ snapshot: {}, nextPhase: { name: 'N', planned_beat: 'B' }, lastRound: null });
    assert.match(prompt, /round_name/);
    assert.match(prompt, /because/);
    assert.match(prompt, /a story decision for the room/);
  });
});

describe('everyone knows where things stand before a vote', () => {
  test('should show the recap, the open questions and a line about each person before a spotlight vote', () => {
    const game = playing();
    game.scenario.phases[0] = { ...game.scenario.phases[0], vote_kind: 'spotlight' };
    game.state.recap = { round: 1, lines: ['The glove was found.'], open: ['Who wore it?'] };
    G.addFacts(game, [{ person: 'p2', fact: 'Was in the kitchen at nine.' }], 'round', 1_500);
    G.beginRoundVote(game, 2_000);
    const brief = G.playerView(game, 'p1').voteBrief;
    assert.deepEqual(brief.lines, ['The glove was found.']);
    assert.deepEqual(brief.open, ['Who wore it?']);
    assert.deepEqual(brief.people.find((p) => p.name === 'Character 2'), { name: 'Character 2', line: 'Was in the kitchen at nine.' });
    assert.ok(G.tableView(game).voteBrief);
  });

  test('should show no brief when no vote is open', () => {
    const game = playing();
    assert.equal(G.playerView(game, 'p1').voteBrief, null);
  });
});

describe('turning the room is rewarded', () => {
  const said = (game, pid, text) => G.addFacts(game, [{ person: pid, fact: `Said out loud: "${text}"` }], 'said', 2_000);
  const vote = (game, picks) => {
    game.scenario.phases[game.state.phaseIndex] = { ...game.scenario.phases[game.state.phaseIndex], vote_kind: 'spotlight' };
    G.beginRoundVote(game, 3_000);
    for (const [pid, pick] of Object.entries(picks)) G.voteRound(game, pid, pick, 3_100);
  };
  const points = (game, pid) => (game.state.play?.[pid] ?? []).filter((m) => m.why === 'Turned the room away from you.' || m.why === 'The room followed your lead.');

  test('should award a point to a player the room turned away from', () => {
    const game = playing({ round: 2 });
    spot(game, 'p2', 1, [0, 3, 0, 0]);
    said(game, 'p2', 'I was in the kitchen all night.');
    vote(game, { p1: 2, p2: 2, p3: 3, p4: 2 });
    const won = points(game, 'p2');
    assert.equal(won.length, 1);
    assert.equal(won[0].skill, 'persuading');
    assert.equal(won[0].points, 1);
  });

  test('should call it bluffing for a culprit', () => {
    const game = playing({ round: 2 });
    spot(game, 'p1', 1, [3, 0, 0, 0]);
    said(game, 'p1', 'Ask the butler where I was.');
    vote(game, { p1: 2, p2: 2, p3: 3, p4: 2 });
    assert.equal(points(game, 'p1')[0]?.skill, 'bluffing');
  });

  test('should not reward a player who stayed quiet', () => {
    const game = playing({ round: 2 });
    spot(game, 'p2', 1, [0, 3, 0, 0]);
    vote(game, { p1: 2, p2: 2, p3: 3, p4: 2 });
    assert.equal(points(game, 'p2').length, 0);
  });

  test("should award a point when the room follows a player's lead", () => {
    const game = playing({ round: 2 });
    said(game, 'p4', 'Character 3 was by the stairs at nine.');
    vote(game, { p1: 2, p2: 2, p3: 1, p4: 2 });
    const won = points(game, 'p4');
    assert.equal(won.length, 1);
    assert.equal(won[0].why, 'The room followed your lead.');
  });

  test('should not award a lead point for naming yourself', () => {
    const game = playing({ round: 2 });
    said(game, 'p3', 'I, Character 3, have nothing to hide.');
    vote(game, { p1: 2, p2: 2, p3: 1, p4: 2 });
    assert.equal(points(game, 'p3').length, 0);
  });
});

describe('a story with a shape', () => {
  test('should pick a story type at random from the list', () => {
    assert.ok(STORY_TYPES.length >= 10);
    assert.equal(pickStoryType(() => 0), STORY_TYPES[0]);
    assert.equal(pickStoryType(() => 0.999), STORY_TYPES.at(-1));
  });

  test('should build the world in that shape and keep it secret until the reveal', () => {
    const game = gameInReading(4);
    assert.match(generationPrompt(game, undefined, undefined, 'blackmail spiral'), /Story type: blackmail spiral\./);
    game.scenario.story_type = 'blackmail spiral';
    G.startPlay(game, 1_000);
    assert.doesNotMatch(JSON.stringify(G.playerView(game, 'p1')), /blackmail spiral/);
    assert.doesNotMatch(JSON.stringify(G.tableView(game)), /blackmail spiral/);
  });

  test('should keep what the story is becoming from each check', () => {
    assert.ok(CONTINUITY_SCHEMA.properties.story_now);
    const game = playing();
    applyContinuity(game, { ...empty, story_now: 'A frame-up that is falling apart.' }, 2_000);
    assert.deepEqual(game.state.storyArc, [{ round: 1, text: 'A frame-up that is falling apart.' }]);
  });

  test('should say what the story began as and became at the reveal', () => {
    const game = playing();
    game.scenario.story_type = 'blackmail spiral';
    game.state.storyArc = [{ round: 2, text: 'A frame-up that fell apart.' }];
    G.applyScore(game, G.computeVerdict(game), { reveal_story: 'R', players: [] });
    assert.equal(game.state.result.story_shape, 'This story began as a blackmail spiral. It became a frame-up that fell apart.');
  });

  test('should say only what it began as when nothing changed it', () => {
    const game = playing();
    game.scenario.story_type = 'family secret';
    G.applyScore(game, G.computeVerdict(game), { reveal_story: 'R', players: [] });
    assert.equal(game.state.result.story_shape, 'This story was a family secret.');
  });
});
