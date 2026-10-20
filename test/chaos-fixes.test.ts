import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { craftIssues } from '../server/craft.ts';
import { playSystem, publicSystem, auditPrompt, GENERATION_SYSTEM } from '../server/prompts.ts';
import { gameInReading, makeScenario } from './fixtures.ts';

// Fixes from the 10-player chaos playtest (2026-10-20).
describe('the spotlight never hands the room a clue nobody found', () => {
  function spotlightOn(reveals: string[]) {
    const game = gameInReading(3, 1_000, { questions: true });
    game.setup.roundStyle = 'hotseats';
    game.scenario.clues[1].shows = 'Brass key L4 hangs on the culprit lanyard by the vault gate.';
    game.scenario.players[1].reveals = reveals;
    G.startPlay(game, 1_000);
    G.beginRoundVote(game, 2_000);
    return game;
  }
  // Everyone looks at p2.
  const look = (game) => {
    G.voteRound(game, 'p1', 1, 2_500);
    G.voteRound(game, 'p3', 1, 2_500);
    G.voteRound(game, 'p2', 0, 2_500);
    return game.state.roundResults.at(-1);
  };

  test('should skip a line that retells a clue nobody has found and give the next one', () => {
    const game = spotlightOn(['Carries brass key L4 on a lanyard by the vault gate.', 'Grew up by the river.']);
    assert.equal(look(game).line, 'Grew up by the river.');
  });

  test('should give the line once that clue has been found', () => {
    const game = spotlightOn(['Carries brass key L4 on a lanyard by the vault gate.', 'Grew up by the river.']);
    game.state.found.p3.push('c2');
    assert.equal(look(game).line, 'Carries brass key L4 on a lanyard by the vault gate.');
  });
});

describe('fair proof in a written world', () => {
  test('should flag a culprit or motive deduction resting only on what the culprit carries', () => {
    const s = makeScenario(4);
    s.setups = [];
    s.clues[0].where = 'p1';
    s.clues[1].where = 'p1';
    assert.ok(craftIssues(s).some((l) => l.startsWith('proof: key_deductions[0] (k1)')));
    s.clues[1].where = 'l2';
    assert.ok(!craftIssues(s).some((l) => l.startsWith('proof: key_deductions[0]')));
  });

  test('should ask the writer for proof found without searching the culprit and traces only they could leave', () => {
    assert.match(GENERATION_SYSTEM, /a shared surname alone proves nothing/);
    assert.match(GENERATION_SYSTEM, /says what makes it the culprit's/);
  });
});

describe('GM rules from the chaos playtest', () => {
  test('should forbid invented people and leads, copied refusals and moving players unasked', () => {
    const sys = playSystem(makeScenario(4));
    assert.match(sys, /Never invent a new person/);
    assert.match(sys, /Never answer the same thing twice the same way/);
    assert.match(sys, /Never move the asker or anyone else to another place unless they asked to go/);
  });

  test('should correct a made-up quote out loud and answer what a shared clue does not show', () => {
    const sys = publicSystem({});
    assert.match(sys, /Never let a made-up quote stand/);
    assert.match(sys, /does not show that/);
  });

  test('should keep a culprit spotlight line the same kind as everyone else', () => {
    assert.match(auditPrompt(makeScenario(4)), /A culprit's lines are the same kind as everyone's/);
  });

  test('should give the out-loud GM a shared clue in its own words', () => {
    const game = gameInReading(4);
    game.scenario.clues[0].text = 'Torn at the thumb, a bead of glass inside.';
    G.startPlay(game, 1_000);
    game.state.found.p1.push('c1');
    G.shareClue(game, 'p1', 'c1', 2_000);
    assert.match(JSON.stringify(G.publicKnowledge(game)), /Its own words: \\"Torn at the thumb/);
  });
});
