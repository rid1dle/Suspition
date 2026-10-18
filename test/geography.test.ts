import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planGeography, pathMetres, tripLabel, tripTime, TERRAINS, LANDMARK_KINDS, PATH_KINDS } from '../src/lib/geography.ts';

const places = [
  { id: 'l1', name: 'The Lodge', x: 10, y: 50, neighbors: ['l2'] },
  { id: 'l2', name: 'Boathouse', x: 40, y: 50, neighbors: ['l1', 'l3'] },
  { id: 'l3', name: 'Chapel', x: 40, y: 90, neighbors: ['l2'] },
];
const raw = (extra = {}) => ({ terrain: 'coast', across_m: 1000, landmarks: [], paths: [], ...extra });

describe('planGeography', () => {
  test('should give every neighbor pair a path with metres and minutes', () => {
    const geo = planGeography(places, raw());
    assert.equal(geo.paths.length, 2);
    const lodge = geo.paths.find((p) => [p.from, p.to].sort().join() === 'l1,l2');
    assert.equal(Math.round(lodge.m), 390);
    assert.equal(tripLabel(lodge.m), '390 m, 5 min walk');
    assert.equal(geo.about, false);
    assert.equal(geo.terrain, 'coast');
  });

  test('should keep the GM path kind and add missing pairs with a fitting kind', () => {
    const geo = planGeography(places, raw({ terrain: 'building', paths: [{ from: 'l2', to: 'l1', kind: 'stairs' }] }));
    assert.deepEqual(geo.paths.map((p) => p.kind).sort(), ['corridor', 'stairs']);
  });

  test('should not draw a second route for neighbors joined past a landmark', () => {
    const geo = planGeography(places, raw({
      landmarks: [{ id: 'm1', name: 'Old well', kind: 'well', x: 25, y: 40 }],
      paths: [{ from: 'l1', to: 'm1', kind: 'trail' }, { from: 'm1', to: 'l2', kind: 'trail' }],
    }));
    const keys = geo.paths.map((p) => [p.from, p.to].sort().join()).sort();
    assert.deepEqual(keys, ['l1,m1', 'l2,l3', 'l2,m1']);
  });

  test('should mark an old world about, with 300 m across', () => {
    const geo = planGeography(places, undefined);
    assert.equal(geo.about, true);
    assert.equal(geo.terrain, null);
    assert.equal(geo.across_m, 300);
    assert.deepEqual(geo.landmarks, []);
    assert.equal(geo.paths.length, 2);
    assert.match(tripLabel(geo.paths[0].m, geo.about), /^about \d+ m, /);
  });

  test("should never let a landmark be a clue's place", () => {
    const geo = planGeography(places, raw({
      landmarks: [
        { id: 'm1', name: 'Old well', kind: 'well', x: 20, y: 20 },
        { id: 'm2', name: 'Hidden shelf', kind: 'rock', x: 30, y: 30 },
        { id: 'l1', name: 'Gate', kind: 'gate', x: 50, y: 50 },
        { id: 'm3', name: 'the boathouse', kind: 'house', x: 60, y: 60 },
      ],
    }), { ids: ['m2'] });
    assert.deepEqual(geo.landmarks.map((l) => l.id), ['m1']);
  });

  test('should drop bad paths and landmarks and clamp numbers', () => {
    const geo = planGeography(places, raw({
      across_m: 'wide',
      terrain: 'moon',
      landmarks: [
        { id: 'm1', name: 'Statue', kind: 'statue', x: 300, y: -5 },
        { id: 'm2', name: 'Spaceship', kind: 'rocket', x: 10, y: 10 },
        { id: 'm3', name: '', kind: 'tree', x: 10, y: 10 },
        { id: 'm1', name: 'Twin', kind: 'tree', x: 10, y: 10 },
        { id: 'm4', name: 'Pond', kind: 'water', x: 'a', y: 10 },
        ...Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, name: `Tree ${i}`, kind: 'tree', x: 50, y: 50 })),
      ],
      paths: [{ from: 'l1', to: 'nowhere', kind: 'road' }, { from: 'l1', to: 'l1', kind: 'road' }, { from: 'l1', to: 'l2', kind: 'rocket' }, { from: 'l2', to: 'l1', kind: 'road' }, { from: 'm1', to: 'l3', kind: 'trail' }],
    }));
    assert.equal(geo.across_m, 300);
    assert.equal(geo.terrain, null);
    assert.equal(geo.landmarks.length, 12);
    assert.deepEqual({ x: geo.landmarks[0].x, y: geo.landmarks[0].y }, { x: 98, y: 2 });
    assert.ok(!geo.landmarks.some((l) => ['m2', 'm3', 'm4'].includes(l.id)));
    const keys = geo.paths.map((p) => [p.from, p.to].sort().join());
    assert.deepEqual(keys.sort(), ['l1,l2', 'l2,l3', 'l3,m1']);
    assert.equal(geo.paths.find((p) => p.from === 'l1' || p.to === 'l1').kind, 'trail');
    assert.ok(geo.paths.every((p) => Number.isFinite(p.m)));
  });

  test('should clamp a tiny or huge width', () => {
    assert.equal(planGeography(places, raw({ across_m: 0 })).across_m, 300);
    assert.equal(planGeography(places, raw({ across_m: 5 })).across_m, 20);
    assert.equal(planGeography(places, raw({ across_m: 90000 })).across_m, 20000);
  });

  test('should offer the fixed kinds from the spec', () => {
    assert.deepEqual(TERRAINS, ['forest', 'hills', 'coast', 'river', 'snow', 'desert', 'city', 'village', 'building']);
    assert.equal(LANDMARK_KINDS.length, 17);
    assert.deepEqual(PATH_KINDS, ['road', 'trail', 'stairs', 'corridor', 'bridge', 'water']);
  });
});

describe('trip words', () => {
  test('should measure a straight line on the grid, times 1.3 for a winding path', () => {
    assert.equal(Math.round(pathMetres({ x: 0, y: 0 }, { x: 30, y: 40 }, 1000)), 650);
  });

  test('should show drive time only past 1.5 km', () => {
    assert.equal(tripLabel(1400), '1.4 km, 18 min walk');
    assert.equal(tripLabel(6000), '6 km, 75 min walk, 12 min by car');
    assert.equal(tripTime(6000), '75 min walk, 12 min by car');
  });

  test('should say under a minute inside one building', () => {
    assert.equal(tripLabel(20), '20 m, under a minute');
    assert.equal(tripTime(20), 'under a minute');
  });

  test('should round metres to plain numbers and mark guesses about', () => {
    assert.equal(tripLabel(347), '350 m, 4 min walk');
    assert.equal(tripLabel(996), '1 km, 12 min walk');
    assert.equal(tripLabel(23000), '23 km, 288 min walk, 46 min by car');
    assert.equal(tripTime(350, true), 'about 4 min walk');
    assert.equal(tripLabel(350, true), 'about 350 m, 4 min walk');
  });
});
