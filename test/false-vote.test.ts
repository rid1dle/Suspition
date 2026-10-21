import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { craftIssues } from '../server/craft.ts';
import { makeScenario } from './fixtures.ts';

// From story run 6: every vote was 8 to 0. The false solution was written after the rounds, so no vote ever offered
// it: the room could never be wrong together and then see it break.
function world() {
  const s = makeScenario(4, { phases: 3, questions: true });
  s.setups = [];
  s.false_solution = { believed: 'Character 2 took the will for the money.', points_at: 'p2', built_from: ['c1', 'c3'], broken_by: 'c2' };
  for (const c of s.clues) c.reveal_round = c.id === 'c2' ? 3 : 1;
  return s;
}
const flagged = (s) => craftIssues(s).filter((i) => /^false: no round vote/.test(i));

describe('a vote can fall for the false solution', () => {
  test('should flag a world where no vote while it is believed offers the false solution', () => {
    const issues = flagged(world());
    assert.equal(issues.length, 1, issues.join('\n'));
    assert.match(issues[0], /rounds 1 to 2/);
    assert.match(issues[0], /Character 2/);
  });

  test('should pass when a wrong option in that window names the person it points at', () => {
    const s = world();
    Object.assign(s.phases[1], { options: ['Character 2 took it to pay his debts', 'The cook burned it', 'It was never signed'], answer_index: 1 });
    assert.deepEqual(flagged(s), []);
  });

  test('should not count the right answer as offering it', () => {
    const s = world();
    Object.assign(s.phases[1], { options: ['The cook burned it', 'Character 2 kept it safe for the widow', 'It was never signed'], answer_index: 1 });
    assert.equal(flagged(s).length, 1);
  });

  test('should leave a world without round questions alone', () => {
    const s = world();
    for (const ph of s.phases) delete ph.question;
    assert.deepEqual(flagged(s), []);
  });
});
