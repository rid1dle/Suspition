import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { makeScenario, gameInReading } from './fixtures.ts';

const rules = { playerCount: 4, phases: 3, hints: 3 };

describe('round rewards never give the culprit away', () => {
  test('should refuse a world whose round reward names a culprit', () => {
    const s = makeScenario(4);
    s.phases[0].reward = 'The ledger shows Character 1 signed the gate pass.';
    assert.match(G.validateScenario(s, rules).join(' '), /reward .*names a culprit/);
  });

  test('should refuse a wrong-answer nudge that names a culprit', () => {
    const s = makeScenario(4);
    s.phases[1].wrong_nudge = 'Look again at where Character 1 was standing.';
    assert.match(G.validateScenario(s, rules).join(' '), /nudge .*names a culprit/);
  });

  test('should accept a reward that names an innocent suspect', () => {
    const s = makeScenario(4);
    s.phases[0].reward = 'Character 2 was seen at the gate at nine.';
    assert.deepEqual(G.validateScenario(s, rules), []);
  });

  test('should not post a culprit-naming reward from an old saved world', () => {
    const game = gameInReading(3, 1_000, { questions: true });
    game.scenario.phases[0].reward = 'The backup shows the call came from Character 1.';
    G.startPlay(game, 1_000);
    const before = game.state.timelineExtra.length;
    G.beginRoundVote(game, 2_000);
    for (const p of game.players) G.voteRound(game, p.id, 1, 3_000);
    G.resolveRoundVote(game, 4_000, true);
    const said = game.state.events.filter((e) => e.kind === 'round').at(-1).text;
    assert.equal(said, 'The group picked: B. That is right!');
    assert.equal(game.state.timelineExtra.length, before);
  });
});
