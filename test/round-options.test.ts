import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { GM } from '../server/gm.ts';
import { createGame, addPlayer, applySetup } from '../server/game.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM } from '../server/prompts.ts';
import { placeAnswers, storyIssues, applyStoryPatches } from '../server/story.ts';
import { makeScenario } from './fixtures.ts';

const rules = { playerCount: 3, phases: 3, hints: 2 };
const lobby = () => {
  const g = createGame();
  for (const name of ['Asha', 'Bina', 'Chetan']) addPlayer(g, { name });
  applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
  return g;
};
const withOptions = (options, answer_index) => {
  const s = makeScenario(3, { phases: 3, hints: 2 });
  Object.assign(s.phases[0], { question: 'How was the door shut?', options, answer_index });
  return s;
};
const SPECIFIC = ['The lock jammed', 'Someone shut the door, then someone turned his key from outside', 'He did it himself', 'The wind'];

describe('where the right answer sits is drawn in code', () => {
  test('should move the right answer to the drawn place and keep it right', () => {
    const s = withOptions(['A', 'B', 'C', 'D'], 1);
    placeAnswers(s, () => 0.99);
    assert.equal(s.phases[0].answer_index, 3);
    assert.equal(s.phases[0].options[3], 'B');
    assert.deepEqual([...s.phases[0].options].sort(), ['A', 'B', 'C', 'D']);
  });

  test('should leave a round with no question alone', () => {
    const s = makeScenario(3, { phases: 3, hints: 2 });
    delete s.phases[0].question;
    const before = structuredClone(s.phases[0]);
    placeAnswers(s, () => 0.5);
    assert.deepEqual(s.phases[0], before);
  });

  test('should draw the places when a world is written', async () => {
    const run = async (opts) => (opts.schema === SCENARIO_SCHEMA ? makeScenario(3, { phases: 3, hints: 2, questions: true }) : { verdict: 'ok', problems: [], patches: [], players: [] });
    const world = await new GM({ workDir: tmpdir(), random: () => 0, run }).generate(lobby());
    assert.equal(world.phases[0].answer_index, 0);
    assert.equal(world.phases[0].options[0], 'B');
  });
});

describe('a right option that stands out', () => {
  test('should be flagged when it is far longer than every wrong one', () => {
    const issues = storyIssues(withOptions(SPECIFIC, 1), { players: [] });
    assert.ok(issues.some((i) => /^options: phases\[0\]/.test(i)), issues.join('\n'));
  });

  test('should not be flagged when the options are about as specific', () => {
    const s = withOptions(['The cook shut it, then the maid locked it', 'The purser shut it on himself by mistake', 'The doctor shut it and pocketed the key'], 0);
    assert.ok(!storyIssues(s, { players: [] }).some((i) => i.startsWith('options:')));
  });
});

describe('a check may rewrite the options', () => {
  test('should keep the right answer right when the options are rewritten', () => {
    const s = withOptions(SPECIFIC, 1);
    const out = applyStoryPatches(s, [{ path: 'phases.0.options', value: JSON.stringify(['The doctor shut it over his IOU', SPECIFIC[1], 'The purser shut himself in by mistake']) }], rules);
    assert.equal(out.applied, 1, JSON.stringify(out.skipped));
    assert.equal(s.phases[0].answer_index, 1);
    assert.equal(s.phases[0].options[s.phases[0].answer_index], SPECIFIC[1]);
  });

  test('should refuse new options that drop the right answer', () => {
    const s = withOptions(SPECIFIC, 1);
    const out = applyStoryPatches(s, [{ path: 'phases.0.options', value: '["A wrong one", "Another wrong one"]' }], rules);
    assert.equal(out.applied, 0);
    assert.deepEqual(s.phases[0].options, SPECIFIC);
  });
});

describe('what the world writer is told about options', () => {
  test('should ask for wrong options the room could really believe', () => {
    assert.match(GENERATION_SYSTEM, /Each wrong option is a theory the room could really hold/);
  });
});

describe('a round rewritten in play still hides where its answer is', () => {
  test('should draw the answer\'s place again when play rewrites a round\'s options', async () => {
    const { applyContinuity } = await import('../server/continuity.ts');
    const { gameInReading } = await import('./fixtures.ts');
    const G = await import('../server/game.ts');
    const empty = { problems: [], canon_add: [], corrections: [], patches: [], offers: [], extra_rounds: [], solvable: true, missing: [] };
    const places = new Set();
    for (let i = 0; i < 40; i += 1) {
      const game = gameInReading(4, 1_000, { questions: true });
      G.startPlay(game, 1_000);
      applyContinuity(game, { ...empty, patches: [{ path: 'phases.2.options', value: '["The cook","The maid","The guard","The purser shut it on himself"]' }, { path: 'phases.2.answer_index', value: '3' }] }, 2_000);
      const ph = game.scenario.phases[2];
      assert.equal(ph.options[ph.answer_index], 'The purser shut it on himself');
      places.add(ph.answer_index);
    }
    assert.ok(places.size > 1, `always at ${[...places]}`);
  });
});
