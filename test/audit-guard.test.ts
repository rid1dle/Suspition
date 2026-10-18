import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import * as G from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { auditPrompt, SCENARIO_SCHEMA, STORY_CHECK_SCHEMA, AUDIT_SCHEMA } from '../server/prompts.ts';
import { makeScenario } from './fixtures.ts';

describe('the card check cannot spoil the case', () => {
  test('should drop a culprit reveal that retells a clue about the culprit', () => {
    const s = makeScenario(3);
    s.clues[0].shows = 'A torn green glove with a burn on the left thumb.';
    G.applyAudit(s, { players: [{ player_id: 'p1', add: [], known_hidden_fact_ids: [], reveals: ['Was seen near the shed at ten.', 'Has a torn green glove with a burned left thumb.'] }] });
    assert.deepEqual(s.players[0].reveals, ['Was seen near the shed at ten.']);
  });

  test("should keep a herring target's alibi without a witness", () => {
    const s = makeScenario(3);
    G.applyAudit(s, { players: [], alibis: [{ id: 'p2', alibi: [{ time: '9pm', where: 'Kitchen with the Butler' }] }, { id: 'p3', alibi: [{ time: '9pm', where: 'Kitchen with the Butler' }] }] });
    assert.deepEqual(s.players[1].alibi, [{ time: '9pm', where: 'Kitchen' }]);
    assert.deepEqual(s.players[2].alibi, [{ time: '9pm', where: 'Kitchen with the Butler' }]);
    assert.match(auditPrompt(s), /A red herring's target gives an alibi with no witness/);
  });

  test('should log story issues found after the card check', async () => {
    const logs = [];
    const run = async (opts) => {
      if (opts.schema === SCENARIO_SCHEMA) return makeScenario(3, { phases: 3, hints: 2 });
      if (opts.schema === STORY_CHECK_SCHEMA) return { verdict: 'ok', problems: [], patches: [] };
      if (opts.schema === AUDIT_SCHEMA) return { players: [{ player_id: 'p2', add: [], known_hidden_fact_ids: [], distrusts: 'p3', distrust_why: 'Character 1 lied.' }] };
    };
    const g = G.createGame();
    for (const name of ['A', 'B', 'C']) G.addPlayer(g, { name });
    G.applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
    await new GM({ workDir: tmpdir(), random: () => 0, run, log: (l) => logs.push(l) }).generate(g);
    assert.ok(logs.some((l) => /^gm story issues after cards: /.test(l)), logs.join('\n'));
  });
});
