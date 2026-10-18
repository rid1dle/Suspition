import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyAudit } from '../server/game.ts';
import { auditPrompt } from '../server/prompts.ts';
import { makeScenario as baseScenario, whereaboutsFor } from './fixtures.ts';

const makeScenario = (n) => {
  const s = baseScenario(n);
  s.truth.whereabouts = whereaboutsFor(s);
  return s;
};

const audit = (night) => ({ players: [{ player_id: 'p2', add: [], known_hidden_fact_ids: [], night }] });

describe('cards follow the whereabouts', () => {
  test("should build a player's night from the whereabouts", () => {
    const s = makeScenario(4);
    s.truth.whereabouts.push({ time: '11:15 pm', character_id: 'p2', location_id: 'l1', doing: 'Looking for the cat', seen_by: [] });
    s.truth.whereabouts.push({ time: '12:30 am', character_id: 'p2', location_id: 'l2', doing: 'Asleep by the stove', seen_by: [] });
    applyAudit(s, audit([
      { time: '9pm', where: 'Garden', doing: 'Something made up' },
      { time: '8:30 pm', where: 'Ballroom', doing: 'Dancing' },
      { time: '10 pm', where: 'Kitchen', doing: 'Washing up' },
    ]));
    assert.deepEqual(s.players[1].night, [
      { time: '8:30 pm', where: 'Ballroom', doing: 'Dancing' },
      { time: '9pm', where: 'Kitchen', doing: 'COOKING' },
      { time: '10 pm', where: 'Kitchen', doing: 'Washing up' },
      { time: '11:15 pm', where: 'Ballroom', doing: 'Looking for the cat' },
      { time: '12:30 am', where: 'Kitchen', doing: 'Asleep by the stove' },
    ]);
    assert.match(auditPrompt(s), /night: copy this character's entries from truth\.whereabouts; add only what they did between them/);
  });

  test('should give a night from the whereabouts even when the audit gives none', () => {
    const s = makeScenario(4);
    applyAudit(s, { players: [] });
    assert.deepEqual(s.players[2].night, [{ time: '9pm', where: 'Kitchen', doing: 'COOKING' }]);
  });

  test("should keep the audit's night for an old world without whereabouts", () => {
    const s = makeScenario(4);
    delete s.truth.whereabouts;
    applyAudit(s, audit([{ time: '9pm', where: 'Garden', doing: 'Smoking' }]));
    assert.deepEqual(s.players[1].night, [{ time: '9pm', where: 'Garden', doing: 'Smoking' }]);
  });
});
