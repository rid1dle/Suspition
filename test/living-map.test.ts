import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { GM } from '../server/gm.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM } from '../server/prompts.ts';
import { editPlace, geographyOf, walkBetween, resolveStoryIds } from '../server/game.ts';
import { storyIssues } from '../server/story.ts';
import { FakeGM, makeScenario } from './fixtures.ts';

const tick = () => new Promise((r) => setTimeout(r, 5));
const move = (place) => ({ kind: 'question', target: '', place, attempt: 'looks at the desk', said_aloud: '', out_of_world: false, sways_gm: false, claims: [] });
// The fixture's Ballroom (20, 30) and Kitchen (80, 70) are 72 grid units apart: 281 m across 300 m, a 4 min walk.
const GEO = { terrain: 'village', across_m: 300, landmarks: [{ id: 'm1', name: 'Old well', kind: 'well', x: 50, y: 50 }], paths: [{ from: 'l1', to: 'l2', kind: 'trail' }] };

async function playing({ geography = GEO } = {}) {
  const gm = new FakeGM();
  const app = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
  const tokens = [];
  for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await app.join({ name }));
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic', questions: 3 });
  await app.idle();
  if (geography) app.game.scenario.geography = structuredClone(geography);
  await app.start(app.game.hostToken);
  await app.idle();
  return { app, gm, tokens, events: () => app.game.state.events.filter((e) => e.kind === 'move').map((e) => e.text) };
}

describe('moves know the walking time', () => {
  test('should add the walking time to the move announcement', async () => {
    const t = await playing();
    await t.app.go(t.tokens[1], 'l1');
    assert.deepEqual(t.events(), ['Ben goes to the Ballroom (4 min walk).']);
  });

  test('should add it before the reason for a move the player confirmed', async () => {
    const t = await playing();
    t.gm.readResult = move('Ballroom');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom' });
    await tick();
    await t.app.confirmMove(t.tokens[1], true);
    await t.app.idle();
    assert.deepEqual(t.events(), ['Ben goes to the Ballroom (4 min walk) to check something.']);
  });

  test('should time a move from where the map shows you, not a secret trip', async () => {
    const t = await playing();
    t.app.game.state.at.p2 = 'l1';
    await t.app.go(t.tokens[1], 'l2');
    assert.deepEqual(t.events(), ['Ben goes to the Kitchen.']);
  });

  test('should keep the old announcement for a world without geography', async () => {
    const t = await playing({ geography: null });
    await t.app.go(t.tokens[1], 'l1');
    assert.deepEqual(t.events(), ['Ben goes to the Ballroom.']);
    assert.equal(walkBetween(t.app.game.scenario, 'l2', 'l1'), '');
  });

  test('should tell the GM the walking time of a move', async () => {
    const t = await playing();
    t.gm.readResult = move('Ballroom');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom' });
    await tick();
    await t.app.confirmMove(t.tokens[1], true);
    await t.app.idle();
    const prompts = [];
    const workDir = await mkdtemp(join(tmpdir(), 'detective-map-'));
    const gm = new GM({ workDir, run: async ({ prompt }) => (prompts.push(prompt), {}) });
    t.app.game.state.pending.p2 = { kind: 'chat', text: 'I go to the ballroom', from: 'l2' };
    t.app.game.state.at.p2 = 'l1';
    await gm.answer(t.app.game, 'p2', { kind: 'chat', text: 'I go to the ballroom', read: move('Ballroom') });
    assert.match(prompts[0], /just went there from the Kitchen, 4 min walk/);
    delete t.app.game.state.pending.p2;
    await gm.answer(t.app.game, 'p2', { kind: 'chat', text: 'I look at the desk', read: move('') });
    assert.doesNotMatch(prompts[1], /just went there/);
  });

  test('should keep distances when the host drags a place', async () => {
    const t = await playing();
    const before = walkBetween(t.app.game.scenario, 'l1', 'l2');
    editPlace(t.app.game, { id: 'l1', x: 79, y: 69 });
    assert.equal(walkBetween(t.app.game.scenario, 'l1', 'l2'), before);
    const view = t.app.playerView(t.tokens[0]);
    assert.equal(view.map.places.find((p) => p.id === 'l1').x, 79);
    assert.equal(view.map.geography.paths[0].m, geographyOf(t.app.game.scenario).paths[0].m);
  });

  test('should show the geography on the public map, landmarks that hold a clue left out', async () => {
    const t = await playing({ geography: { ...GEO, landmarks: [...GEO.landmarks, { id: 'n1', name: 'Shed', kind: 'house', x: 10, y: 90 }] } });
    const view = t.app.playerView(t.tokens[0]);
    assert.equal(view.map.geography.terrain, 'village');
    assert.deepEqual(view.map.geography.landmarks.map((l) => l.id), ['m1']);
    assert.equal(view.map.geography.about, false);
  });
});

describe('the GM plans the geography', () => {
  test('should ask the GM for a geography with the fixed kinds', () => {
    const geo = SCENARIO_SCHEMA.properties.geography;
    assert.ok(SCENARIO_SCHEMA.required.includes('geography'));
    assert.deepEqual(geo.properties.terrain.enum, ['forest', 'hills', 'coast', 'river', 'snow', 'desert', 'city', 'village', 'building']);
    assert.ok(geo.properties.landmarks.items.properties.kind.enum.includes('well'));
    assert.deepEqual(geo.properties.paths.items.properties.kind.enum, ['road', 'trail', 'stairs', 'corridor', 'bridge', 'water']);
  });

  test('should turn place names in paths into ids', () => {
    const s = { ...makeScenario(2), geography: { ...GEO, paths: [{ from: 'the Ballroom', to: 'Kitchen', kind: 'road' }, { from: 'm1', to: 'l2', kind: 'trail' }] } };
    resolveStoryIds(s);
    assert.deepEqual(s.geography.paths.map((p) => [p.from, p.to]), [['l1', 'l2'], ['m1', 'l2']]);
  });

  test('should tell the GM to fit the scale and the travel times to the story', () => {
    assert.match(GENERATION_SYSTEM, /across_m/);
    assert.match(GENERATION_SYSTEM, /a lodge and its boathouse are a few hundred metres apart/);
    assert.match(GENERATION_SYSTEM, /Landmarks are scenery only/);
    assert.ok(!GENERATION_SYSTEM.includes(String.fromCharCode(0x2014)));
  });
});

describe('the story respects the map', () => {
  const players = [1, 2].map((i) => ({ id: `p${i}`, name: `Player${i}` }));
  // Ballroom to Kitchen is 72 grid units: across 3000 m that is about 2.8 km, a 35 min walk.
  const world = (across_m, times, geography = true) => {
    const s = makeScenario(2);
    if (geography) s.geography = { ...GEO, across_m };
    s.truth.whereabouts = [
      { time: times[0], character_id: 'p2', location_id: 'l1', doing: 'Dancing', seen_by: [] },
      { time: times[1], character_id: 'p2', location_id: 'l2', doing: 'Cooking', seen_by: [] },
      { time: '9pm', character_id: 'p1', location_id: 'l1', doing: 'Talking', seen_by: [] },
    ];
    return s;
  };
  const far = (s) => storyIssues(s, { players, rounds: s.phases.length }).filter((l) => l.startsWith('far:'));

  test('should flag a whereabouts pair that is too far apart for the time between', () => {
    const lines = far(world(3000, ['10:00 pm', '10:10 pm']));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /truth\.whereabouts\[0\] and truth\.whereabouts\[1\]/);
    assert.match(lines[0], /35 min walk/);
    assert.match(lines[0], /only 10 minutes apart/);
  });

  test('should not flag a pair with enough time, across midnight too', () => {
    assert.deepEqual(far(world(3000, ['11:30 pm', '12:10 am'])), []);
    assert.deepEqual(far(world(300, ['10:00 pm', '10:05 pm'])), []);
    assert.equal(far(world(3000, ['11:50 pm', '12:10 am'])).length, 1);
  });

  test('should skip times it cannot read', () => {
    assert.deepEqual(far(world(3000, ['at dusk', 'later'])), []);
  });

  test('should skip the far check for a world without geography', () => {
    assert.deepEqual(far(world(3000, ['10:00 pm', '10:01 pm'], false)), []);
  });
});
