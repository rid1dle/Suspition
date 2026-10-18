import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM } from '../server/prompts.ts';
import { storyIssues } from '../server/story.ts';
import { makeScenario, whereaboutsFor } from './fixtures.ts';

const players = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `Player${i}` }));
const world = () => {
  const s = makeScenario(4);
  s.truth.whereabouts = whereaboutsFor(s);
  s.truth.timeline = [
    { time: '9pm', event: 'It happened', location_id: 'l1', character_ids: ['p1'] },
    { time: '10pm', event: 'The knife is hidden', location_id: 'l2', character_ids: ['p1'] },
    { time: '10:30pm', event: 'The storm hits', location_id: '', character_ids: [] },
  ];
  return s;
};
const path = (s) => storyIssues(s, { players, difficulty: 'normal', rounds: 3 }).filter((l) => l.startsWith('presence:'));

describe("the culprit's whole path", () => {
  test('should ask where and who for every step of the truth, and whereabouts at each of those times', () => {
    assert.deepEqual(Object.keys(SCENARIO_SCHEMA.properties.truth.properties.timeline.items.properties), ['time', 'event', 'location_id', 'character_ids']);
    assert.match(GENERATION_SYSTEM, /say where every character was at each time in truth\.timeline/);
  });

  test('should flag anyone awake where the culprit acts, at that time', () => {
    const s = world();
    s.truth.whereabouts.push({ time: '10pm', character_id: 'p3', location_id: 'l2', doing: 'Reading by the fire', seen_by: [] });
    const found = path(s);
    assert.equal(found.length, 1);
    assert.match(found[0], /truth\.whereabouts\[4\].*p3.*truth\.timeline\[1\]/);
    s.truth.whereabouts[4].doing = 'Asleep in the chair';
    assert.deepEqual(path(s), []);
  });

  test('should skip truth steps with no place or people', () => {
    const s = world();
    s.truth.whereabouts.push({ time: '10:30pm', character_id: 'p3', location_id: 'l2', doing: 'Reading', seen_by: [] });
    delete s.truth.timeline[1].location_id;
    delete s.truth.timeline[1].character_ids;
    assert.deepEqual(path(s), []);
  });

  test('should turn names into ids in truth steps and fail an unknown place', () => {
    const s = world();
    s.truth.timeline[1].location_id = 'The Kitchen';
    s.truth.timeline[1].character_ids = ['Character 1'];
    G.resolveStoryIds(s);
    assert.equal(s.truth.timeline[1].location_id, 'l2');
    assert.deepEqual(s.truth.timeline[1].character_ids, ['p1']);
    s.truth.timeline[0].location_id = 'nowhere';
    assert.match(G.validateScenario(s, { playerCount: 4, phases: 3, hints: 3 }).join(), /truth\.timeline\[0\] names unknown place nowhere/);
  });
});
