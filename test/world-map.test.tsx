import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layoutMap, tripFrom, CARD_W, CELL_W, CELL_H } from '../src/lib/map-layout.ts';
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
      { id: 'stairs', name: 'Coal Stairs', x: 46, y: 60, neighbors: ['vault'] },
      { id: 'well', name: 'Old Cistern Well', x: 20, y: 72, neighbors: ['stairs'] },
    ],
    positions: { p1: 'bunk', n1: 'duty', n2: 'vestry' },
    geography: { terrain: 'building', across_m: 200, about: false, landmarks: [], paths: [{ from: 'bunk', to: 'duty', kind: 'corridor', m: 40 }, { from: 'duty', to: 'vault', kind: 'stairs', m: 60 }, { from: 'bunk', to: 'vestry', kind: 'corridor', m: 30 }] },
  },
};

describe('the map lays places out so none ever overlap', () => {
  test('should give every place its own spot, at least a card apart', () => {
    const plan = layoutMap(crowded);
    const spots = plan.places.map((p: { x: number; y: number }) => `${p.x},${p.y}`);
    assert.equal(new Set(spots).size, 8);
    for (const a of plan.places) for (const b of plan.places) {
      if (a === b) continue;
      assert.ok(Math.abs(a.x - b.x) >= CELL_W || Math.abs(a.y - b.y) >= CELL_H, `${a.name} and ${b.name} overlap`);
    }
    assert.ok(CELL_W > CARD_W);
  });

  test('should keep the rough geography: west stays west, north stays north', () => {
    const at = Object.fromEntries(layoutMap(crowded).places.map((p: { id: string; x: number; y: number }) => [p.id, p]));
    assert.ok(at.well.x < at.archive.x);
    assert.ok(at.chapel.y < at.vault.y);
    assert.ok(at.vestry.y < at.well.y);
  });

  test('should put each person in their place, you first and marked You', () => {
    const plan = layoutMap(crowded, { me: 'p1' });
    const bunk = plan.places.find((p: { id: string }) => p.id === 'bunk');
    assert.deepEqual(bunk.people.map((c: { label: string; me: boolean }) => [c.label, c.me]), [['You', true]]);
    assert.equal(bunk.here, true);
    const duty = plan.places.find((p: { id: string }) => p.id === 'duty');
    assert.deepEqual(duty.people.map((c: { label: string; kind: string }) => [c.label, c.kind]), [['Mara', 'npc']]);
  });

  test('should draw each path once, from card centre to card centre, lighting the ones from your place', () => {
    const plan = layoutMap(crowded, { me: 'p1' });
    const keys = plan.paths.map((p: { from: string; to: string }) => [p.from, p.to].sort().join('-'));
    assert.equal(new Set(keys).size, keys.length);
    const fromBunk = plan.paths.filter((p: { near: boolean }) => p.near);
    assert.ok(fromBunk.length >= 2);
  });

  test('should mark who moved since the last view', () => {
    const plan = layoutMap(crowded, { before: { n1: 'archive' } });
    const mara = plan.places.flatMap((p: { people: { id: string; moved: boolean }[] }) => p.people).find((c: { id: string }) => c.id === 'n1');
    assert.equal(mara.moved, true);
  });

  test('should return nothing for a world with no places', () => {
    assert.equal(layoutMap({ map: { places: [] } }), null);
  });
});

describe('how far a place is, along the paths', () => {
  test('should give the walk along a direct path', () => {
    assert.equal(tripFrom(crowded, 'bunk', 'duty'), 'under a minute');
  });

  test('should add up a walk through other places', () => {
    assert.equal(tripFrom(crowded, 'vestry', 'vault'), '2 min walk');
  });

  test('should say nothing when there is no way there, or you are already there', () => {
    assert.equal(tripFrom(crowded, 'bunk', 'well'), null);
    assert.equal(tripFrom(crowded, 'bunk', 'bunk'), null);
  });
});

describe('the map on screen', () => {
  test('should show every place by name with its people, and no walking times', () => {
    const out = text(<WorldMap view={crowded} me="p1" />);
    for (const name of ['Vestry', 'Chapel of St. Selene', 'Iron Gate Vault', 'Old Cistern Well']) assert.ok(out.includes(name), name);
    assert.match(out, /You/);
    assert.doesNotMatch(out, /min walk|under a minute/);
  });

  test('should offer zoom out, fit and zoom in', () => {
    const html = renderToStaticMarkup(<WorldMap view={crowded} />);
    for (const label of ['Zoom out', 'Fit the map', 'Zoom in']) assert.ok(html.includes(`aria-label="${label}"`), label);
  });

  test('should only show the Minor key when someone minor is on the map', () => {
    assert.match(text(<WorldMap view={crowded} />), /Minor/);
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
