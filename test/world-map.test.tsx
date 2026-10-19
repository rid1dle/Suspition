import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapSpots, mapPlan, routeFrom, tripFrom, plainMapSvg, placeLabelHtml, MAP_W, MAP_H } from '../src/lib/map-layout.ts';
import { cleanSvg } from '../server/game.ts';
import { WorldMap, PlacePanel } from '../src/components/game/world-map.tsx';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// Eight places bunched in one corner, the way a GM sometimes draws a station.
const crowded = {
  gameId: 'g1',
  here: 'Bunk Room',
  cast: { players: [{ id: 'p1', name: 'Hollis Vane' }], npcs: [{ id: 'n1', name: 'Captain Mara Holt' }, { id: 'n2', name: 'Nan Birch', minor: true }] },
  map: {
    places: [
      { id: 'vestry', name: 'Vestry', x: 30, y: 20, neighbors: ['chapel', 'bunk'] },
      { id: 'chapel', name: 'Chapel of St. Selene', x: 45, y: 18, neighbors: ['vestry', 'duty'] },
      { id: 'bunk', name: 'Bunk Room', x: 32, y: 40, neighbors: ['vestry', 'duty'] },
      { id: 'duty', name: 'Duty Office', x: 48, y: 38, neighbors: ['bunk', 'archive', 'vault'] },
      { id: 'archive', name: 'Archive', x: 62, y: 40, neighbors: ['duty', 'vault'] },
      { id: 'vault', name: 'Iron Gate Vault', x: 58, y: 70, neighbors: ['duty', 'archive'] },
      { id: 'stairs', name: 'Coal Stairs', x: 46, y: 60, neighbors: [] },
      { id: 'well', name: 'Old Cistern Well', x: 20, y: 72, neighbors: [] },
    ],
    positions: { p1: 'bunk', n1: 'duty', n2: 'vestry' },
    geography: {
      terrain: 'building', across_m: 200, about: false,
      landmarks: [{ id: 'gate', name: 'Iron gate', kind: 'gate', x: 50, y: 66 }],
      paths: [
        { from: 'bunk', to: 'duty', kind: 'corridor', m: 40 }, { from: 'duty', to: 'vault', kind: 'stairs', m: 60 }, { from: 'bunk', to: 'vestry', kind: 'corridor', m: 30 },
        { from: 'stairs', to: 'gate', kind: 'trail', m: 25 }, { from: 'gate', to: 'well', kind: 'trail', m: 35 },
      ],
    },
  },
};

describe('every place has a fixed spot on the map picture', () => {
  test('should keep each place on the picture, and far enough apart for two labels', () => {
    const spots = mapSpots(crowded.map.places);
    const list = Object.values(spots) as { x: number; y: number }[];
    assert.equal(list.length, 8);
    for (const s of list) assert.ok(s.x > 0 && s.x < MAP_W && s.y > 0 && s.y < MAP_H);
    for (const a of list) for (const b of list) if (a !== b) assert.ok(Math.hypot((a.x - b.x) / 230, (a.y - b.y) / 120) >= 0.98, JSON.stringify([a, b]));
  });

  test('should keep the rough geography: west stays west, north stays north', () => {
    const s = mapSpots(crowded.map.places);
    assert.ok(s.well.x < s.archive.x);
    assert.ok(s.chapel.y < s.vault.y);
  });

  test('should give the same spots every time for the same world', () => {
    assert.deepEqual(mapSpots(crowded.map.places), mapSpots(crowded.map.places));
  });

  test('should use the spots the GM drew to, once there is a drawing', () => {
    const art = { svg: '<svg></svg>', spots: { ...mapSpots(crowded.map.places), bunk: { x: 111, y: 222 } } };
    const bunk = mapPlan({ ...crowded, map: { ...crowded.map, art } }).places.find((p: { id: string }) => p.id === 'bunk');
    assert.deepEqual([bunk.x, bunk.y], [111, 222]);
  });
});

describe('what the map shows on its picture', () => {
  test('should put each person in their place, you first and marked You', () => {
    const plan = mapPlan(crowded, { me: 'p1' });
    const bunk = plan.places.find((p: { id: string }) => p.id === 'bunk');
    assert.deepEqual(bunk.people.map((c: { label: string; me: boolean }) => [c.label, c.me]), [['You', true]]);
    assert.equal(bunk.here, true);
    assert.deepEqual(plan.places.find((p: { id: string }) => p.id === 'duty').people.map((c: { label: string }) => c.label), ['Mara']);
  });

  test('should draw each path once with its distance, and a path past a landmark through it, its two halves added', () => {
    const plan = mapPlan(crowded);
    const keys = plan.paths.map((p: { from: string; to: string }) => [p.from, p.to].sort().join('-'));
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(plan.paths.find((p: { from: string; to: string }) => [p.from, p.to].sort().join() === 'bunk,duty').label, '40 m · <1 min');
    const past = plan.paths.find((p: { from: string; to: string }) => [p.from, p.to].sort().join() === 'stairs,well');
    assert.equal(past.points.length, 3);
    assert.equal(past.m, 60);
  });

  test('should never put a distance on a place label or on another distance', () => {
    const plan = mapPlan(crowded);
    const shown = plan.paths.filter((p: { label: string }) => p.label);
    const half = (p: { label: string }) => p.label.length * 3.4 + 8;
    for (const p of shown) for (const c of plan.places) assert.ok(!(Math.abs(p.lx - c.x) < c.w / 2 + half(p) && Math.abs(p.ly - c.y) < c.h / 2 + 10), `${p.from}-${p.to} on ${c.name}`);
    for (const a of shown) for (const b of shown) if (a !== b) assert.ok(!(Math.abs(a.lx - b.lx) < half(a) + half(b) && Math.abs(a.ly - b.ly) < 18));
    assert.equal(shown.length, plan.paths.length, 'every path keeps its distance');
  });

  test('should mark the paths from your place on a phone', () => {
    const near = mapPlan(crowded, { me: 'p1' }).paths.filter((p: { near: boolean }) => p.near).map((p: { from: string; to: string }) => [p.from, p.to].sort().join());
    assert.deepEqual(near.sort(), ['bunk,duty', 'bunk,vestry']);
  });

  test('should mark who moved since the last view', () => {
    const mara = mapPlan(crowded, { before: { n1: 'archive' } }).places.flatMap((p: { people: { id: string; moved: boolean }[] }) => p.people).find((c: { id: string }) => c.id === 'n1');
    assert.equal(mara.moved, true);
  });

  test('should return nothing for a world with no places', () => {
    assert.equal(mapPlan({ map: { places: [] } }), null);
  });

  test('should write a place label with its name, its spot in the room and its people, escaped', () => {
    const html = placeLabelHtml({ id: 'x', name: 'The <b>Vault</b>', icon: '🔒', room: 'by the sofa', here: true, people: [{ id: 'p1', name: 'Hollis', label: 'You', kind: 'player', minor: false, me: true, moved: false }] });
    assert.ok(!html.includes('<b>Vault'));
    assert.match(html, /class="map-place here"/);
    assert.match(html, /by the sofa/);
    assert.match(html, /class="who player me"[^>]*>You</);
  });

  test('should draw a plain map from the same spots when the GM drew none, safe to show', () => {
    const svg = plainMapSvg(mapPlan(crowded));
    assert.ok(cleanSvg(svg, 40_000));
    assert.equal((svg.match(/<rect x=/g) ?? []).length, 8);
  });
});

describe('the way from your place', () => {
  test('should find the shortest way along the paths', () => {
    assert.deepEqual(routeFrom(crowded, 'vestry', 'vault').steps, ['vestry', 'bunk', 'duty', 'vault']);
  });

  test('should give the walk along it, or nothing when there is no way or you are there', () => {
    assert.equal(tripFrom(crowded, 'bunk', 'duty'), 'under a minute');
    assert.equal(tripFrom(crowded, 'vestry', 'vault'), '2 min walk');
    assert.equal(tripFrom(crowded, 'bunk', 'well'), null);
    assert.equal(tripFrom(crowded, 'bunk', 'bunk'), null);
  });
});

describe('the map on screen', () => {
  test('should hold a place for the map while it unfolds, with the key under it', () => {
    const out = text(<WorldMap view={crowded} me="p1" />);
    assert.match(out, /Unfolding the map/);
    assert.match(out, /You Player Played by the GM Minor/);
  });

  test('should only show the Minor key when someone minor is on the map', () => {
    assert.doesNotMatch(text(<WorldMap view={{ ...crowded, cast: { players: [], npcs: [] } }} />), /Minor/);
  });

  test('should tell a player who is at a place, how far it is, and let them go', () => {
    const out = text(<PlacePanel name="Duty Office" info="Where the log is kept." people={['Captain Mara Holt']} trip="under a minute" here={false} canGo onGo={() => {}} />);
    assert.match(out, /Duty Office Where the log is kept\. Here: Captain Mara Holt Under a minute from you\. Go there/);
  });

  test('should say you are here and offer no Go button for your own place', () => {
    const out = text(<PlacePanel name="Bunk Room" people={[]} trip={null} here canGo onGo={() => {}} />);
    assert.match(out, /Nobody is here\. You are here\./);
    assert.doesNotMatch(out, /Go there/);
  });
});
