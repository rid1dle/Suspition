import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup } from '../server/game.ts';
import { applyDress } from '../server/craft.ts';
import { SCENARIO_SCHEMA, CRAFT_SCHEMA, GENERATION_SYSTEM, STORY_DRESS } from '../server/prompts.ts';
import { makeScenario } from './fixtures.ts';

const dress = {
  clues: [
    { id: 'c1', form: 'object', author: '', written_at: '', text: 'A grey glove, torn at the thumb.', pairs_with: '' },
    { id: 'c2', form: 'ledger', author: 'The Butler', written_at: '9:10 pm', text: '9:10. Cellar keys out.', pairs_with: 'c3' },
    { id: 'c9', form: 'note', author: 'Nobody', written_at: '', text: 'Not a real clue.' },
    { id: 'c3', form: 'note', author: 'x', written_at: '', text: '   ' },
  ],
  setups: [{ id: 's1', detail: 'The dog sleeps by the door.', shown_in: 'opening_scene', shown_round: 0, paid_by: 'c2', how_paid: 'It did not bark.' }],
  reframes: [{ detail: 'The quiet dog.', seen_in: 'opening_scene', first_reading: 'Calm.', true_reading: 'It knew them.', flipped_by: 'c2' }],
  world_rules: [{ rule: 'The gate locks at ten.', cost: 'Nobody gets in after.', shown_by: 'background', used_in: 'k1' }],
  lies_caught: [{ npc_id: 'n1', lie: 'Never left the pantry.', caught_by: 'c2' }],
  false_solution: { believed: 'Character 2 took it.', points_at: 'p2', built_from: ['c1', 'c3'], broken_by: 'c2' },
  agendas: [
    { npc_id: 'n1', wants: 'Hide his drinking.', plan: [{ round: 1, does: 'Moves the bottles.' }, { round: 2, does: '' }], leaves: 'c2' },
    { npc_id: 'n2', wants: 'Grieve.', plan: [{ round: 1, does: 'Cries.' }], leaves: '' },
  ],
};

describe('the story layer is written on the finished world', () => {
  test('should keep the long story fields out of the first draft and put them in the dressing pass', () => {
    assert.equal('setups' in SCENARIO_SCHEMA.properties, false);
    assert.equal('text' in SCENARIO_SCHEMA.properties.clues.items.properties, false);
    assert.equal('agenda' in SCENARIO_SCHEMA.properties.npcs.items.properties, false);
    for (const k of ['clues', 'setups', 'reframes', 'world_rules', 'agendas', 'false_solution']) assert.ok(CRAFT_SCHEMA.properties[k], k);
    assert.match(GENERATION_SYSTEM, /Cause and effect/);
    assert.match(STORY_DRESS, /Never change a fact of the world/);
  });

  test('should give clues their own words, add setups, reframes and rules, and plan only for important GM characters', () => {
    const s = makeScenario(4);
    s.npcs[0].importance = 'important';
    s.npcs[1].importance = 'minor';
    applyDress(s, dress);
    assert.equal(s.clues[1].text, '9:10. Cellar keys out.');
    assert.equal(s.clues[1].author, 'The Butler');
    assert.equal('text' in s.clues[2], false, 'an empty text leaves the clue as it was');
    assert.equal(s.clues.some((c) => c.id === 'c9'), false, 'no clue is made up');
    assert.equal(s.setups.length, 1);
    assert.equal(s.world_rules[0].used_in, 'k1');
    assert.equal(s.clues[1].pairs_with, 'c3');
    assert.equal('pairs_with' in s.clues[0], false, 'no half for a whole thing');
    assert.equal(s.lies_caught[0].caught_by, 'c2');
    assert.deepEqual(s.false_solution, { believed: 'Character 2 took it.', points_at: 'p2', built_from: ['c1', 'c3'], broken_by: 'c2' });
    assert.deepEqual(s.npcs[0].agenda.plan, [{ round: 1, does: 'Moves the bottles.' }]);
    assert.equal('agenda' in s.npcs[1], false);
  });

  test('should leave the world alone when the pass gives nothing back', () => {
    const s = makeScenario(4);
    assert.equal(applyDress(s, {}), 0);
    assert.equal('setups' in s, false);
  });

  const game = () => {
    const g = createGame();
    for (const name of ['A', 'B', 'C']) addPlayer(g, { name });
    applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
    return g;
  };

  test('should dress a valid world before the story check sees it', async () => {
    const order = [];
    const gm = new GM({ workDir: tmpdir(), random: () => 0, run: async ({ prompt }) => {
      if (/^Design a mystery/.test(prompt)) return (order.push('write'), makeScenario(3, { phases: 3, hints: 2 }));
      if (/^Dress this mystery/.test(prompt)) return (order.push('dress'), dress);
      if (/^You check a mystery for holes/.test(prompt)) return (order.push('check'), { verdict: 'ok', problems: [], patches: [] });
      return (order.push('cards'), { players: [] });
    } });
    const s = await gm.generate(game());
    assert.deepEqual(order, ['write', 'dress', 'check', 'cards']);
    assert.equal(s.clues[1].form, 'ledger');
  });

  test('should still hand over the world when the dressing pass fails', async () => {
    const gm = new GM({ workDir: tmpdir(), random: () => 0, run: async ({ prompt }) => {
      if (/^Design a mystery/.test(prompt)) return makeScenario(3, { phases: 3, hints: 2 });
      if (/^Dress this mystery/.test(prompt)) throw new Error('took too long');
      return { verdict: 'ok', problems: [], patches: [] };
    } });
    const s = await gm.generate(game());
    assert.equal(s.players.length, 3);
    assert.equal('setups' in s, false);
  });
});
