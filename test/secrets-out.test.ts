import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CRAFT_SCHEMA, STORY_DRESS, phasePrompt } from '../server/prompts.ts';
import { applyDress } from '../server/craft.ts';
import { nextPhaseInfo, startPlay } from '../server/game.ts';
import { makeScenario, gameInReading } from './fixtures.ts';

const important = (s) => {
  s.npcs[0].importance = 'important';
  return s;
};
const agenda = (cracks) => ({ npc_id: 'n1', wants: 'Keep his post.', plan: [{ round: 1, does: 'Hides the bottle.' }, { round: 2, does: 'Watches the stairs.' }], leaves: '', cracks });

describe('a GM character\'s own secret comes out by a planned round', () => {
  test('should ask the story pass for the round and the way each secret cracks', () => {
    const item = CRAFT_SCHEMA.properties.agendas.items;
    assert.ok(item.properties.cracks, 'agendas have cracks');
    assert.ok(item.required.includes('cracks'));
    assert.match(STORY_DRESS, /cracks is the round/);
    assert.match(STORY_DRESS, /For a culprit, what cracks is a lesser secret/);
  });

  test('should keep a crack that falls in a later round', () => {
    const s = important(makeScenario(3, { phases: 3, hints: 2 }));
    applyDress(s, { agendas: [agenda({ round: 3, how: 'The cook says she saw him pour it away.' })] });
    assert.deepEqual(s.npcs[0].agenda.cracks, { round: 3, how: 'The cook says she saw him pour it away.' });
  });

  test('should drop a crack in the first round or past the last', () => {
    for (const round of [1, 4]) {
      const s = important(makeScenario(3, { phases: 3, hints: 2 }));
      applyDress(s, { agendas: [agenda({ round, how: 'He confesses.' })] });
      assert.equal(s.npcs[0].agenda.cracks, undefined, `round ${round}`);
    }
  });

  test('should line the secret up for the round it cracks in', () => {
    const game = gameInReading(3, 1_000, { phases: 3 });
    applyDress(important(game.scenario), { agendas: [agenda({ round: 2, how: 'The cook says she saw him pour it away.' })] });
    startPlay(game, 1_000);
    const next = nextPhaseInfo(game);
    assert.deepEqual(next.secrets_out, ['The Butler: The cook says she saw him pour it away.']);
  });

  test('should tell the GM at the round change to bring the secret out unless players already did', () => {
    const p = phasePrompt({ snapshot: {}, nextPhase: { name: 'R2', objective: 'O', planned_beat: 'B', secrets_out: ['The Butler: The cook says she saw him pour it away.'] }, lastRound: null });
    assert.match(p, /Secrets that come out this round[\s\S]*The Butler: The cook says she saw him pour it away\./);
  });
});
