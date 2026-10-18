import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapHtml, shortName } from '../src/lib/map.ts';

const view = {
  cast: { players: [{ id: 'p1', name: 'Ruby Vance' }, { id: 'p2', name: 'Edgar <b>Wynne</b>' }], npcs: [{ id: 'n1', name: 'Florrie Dann' }] },
  map: {
    places: [
      { id: 'l1', name: 'Ballroom', x: 20, y: 30, neighbors: ['l2'] },
      { id: 'l2', name: 'Deck', x: 80, y: 70, neighbors: ['l1'] },
    ],
    positions: { p1: 'l1', p2: 'l2', n1: 'l2' },
  },
};

describe('mapHtml', () => {
  test('should place each place at its position and draw each path once', () => {
    const html = mapHtml(view);
    assert.match(html, /left:20%;top:30%/);
    assert.equal((html.match(/data-path=/g) ?? []).length, 1);
  });

  test('should put each person in their place by first name, players and GM people told apart', () => {
    const html = mapHtml(view);
    const deck = html.slice(html.indexOf('Deck'));
    assert.match(deck, /class="who player"[^>]*>Edgar/);
    assert.match(deck, /class="who npc"[^>]*>Florrie/);
  });

  test('should mark your own token as You on your phone', () => {
    assert.match(mapHtml(view, { me: 'p1' }), /class="who player me"[^>]*>You</);
  });

  test('should highlight someone who moved since the last view', () => {
    assert.match(mapHtml(view, { before: { p1: 'l2', p2: 'l2', n1: 'l2' } }), /who player moved[^>]*>Ruby/);
  });

  test('should escape names', () => {
    assert.ok(!mapHtml(view).includes('<b>Wynne'));
  });

  test('should draw nothing without a map', () => {
    assert.equal(mapHtml({ map: null }), '');
  });
});

describe('mapHtml room spots', () => {
  const withRoom = { ...view, map: { ...view.map, places: [{ ...view.map.places[0], room: 'The <sofa>' }, view.map.places[1]] } };

  test('should show the room spot under a place', () => {
    assert.match(mapHtml(withRoom), /class="room">[^<]*The &lt;sofa&gt;/);
  });

  test('should turn spots into inputs while the host edits', () => {
    const html = mapHtml(withRoom, { editing: true });
    assert.match(html, /<input class="room-input" data-room="l1" value="The &lt;sofa&gt;"/);
    assert.match(html, /class="map editing"/);
  });
});

describe('shortName', () => {
  test('should use the first name, skipping titles', () => {
    assert.equal(shortName('Ruby Vance'), 'Ruby');
    assert.equal(shortName('Dr. Iyer'), 'Iyer');
    assert.equal(shortName('Captain Hendrik Voss'), 'Hendrik');
    assert.equal(shortName('Madonna'), 'Madonna');
  });
});

describe('mapHtml minor people', () => {
  test('should draw minor GM people faded and add them to the key', () => {
    const v = { ...view, cast: { ...view.cast, npcs: [{ id: 'n1', name: 'Florrie Dann', minor: true }] } };
    const html = mapHtml(v);
    assert.match(html, /class="who npc minor" title="Florrie Dann \(minor\)"/);
    assert.match(html, /<span class="who npc minor">Minor<\/span>/);
    assert.ok(!mapHtml(view).includes('Minor'));
  });
});

describe('the living map', () => {
  const geography = {
    terrain: 'forest', across_m: 1000, about: false,
    landmarks: [{ id: 'm1', name: 'Old well', kind: 'well', x: 50, y: 15 }],
    paths: [{ from: 'l1', to: 'l2', kind: 'trail', m: 390 }, { from: 'l2', to: 'l3', kind: 'road', m: 6000 }],
  };
  const world = (extra = {}) => ({
    gameId: 'g1',
    title: 'Night at the Lodge',
    cast: view.cast,
    map: {
      places: [
        { id: 'l1', name: 'Lodge', x: 20, y: 30, neighbors: ['l2'] },
        { id: 'l2', name: 'Boathouse', x: 50, y: 50, neighbors: ['l1', 'l3'] },
        { id: 'l3', name: 'Chapel', x: 80, y: 80, neighbors: ['l2'] },
      ],
      positions: { p1: 'l1', p2: 'l2', n1: 'l3' },
      geography,
    },
    ...extra,
  });
  const trips = (html) => [...html.matchAll(/class="trip[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);

  test('should draw the same map for the same game every time', () => {
    assert.equal(mapHtml(world()), mapHtml(world()));
    assert.notEqual(mapHtml(world()), mapHtml(world({ gameId: 'g2' })));
  });

  test('should show every path time on the table', () => {
    assert.deepEqual(trips(mapHtml(world())).sort(), ['390 m, 5 min walk', '6 km, 75 min walk, 12 min by car']);
  });

  test('should show the time on paths from your place and fade the rest on your phone', () => {
    const html = mapHtml(world({ here: 'Lodge' }), { me: 'p1' });
    assert.deepEqual(trips(html), ['390 m, 5 min walk']);
    assert.match(html, /class="path trail near" data-path="l1-l2"/);
    assert.match(html, /class="path road far" data-path="l2-l3"/);
    assert.match(html, /class="place here" data-place="l1"/);
  });

  test('should list the trips from your place under the map on your phone', () => {
    const html = mapHtml(world({ here: 'Lodge' }), { me: 'p1' });
    assert.match(html, /class="map-trips"><b>From the Lodge:<\/b> <span>Boathouse, 390 m, 5 min walk<\/span><\/div>/);
    assert.ok(!mapHtml(world()).includes('map-trips'));
  });

  test('should list only places you can go to, never a landmark', () => {
    const geo = { ...geography, paths: [...geography.paths, { from: 'l1', to: 'm1', kind: 'trail', m: 120 }] };
    const html = mapHtml(world({ here: 'Lodge', map: { ...world().map, geography: geo } }), { me: 'p1' });
    const list = html.slice(html.indexOf('class="map-trips"'));
    assert.match(list, /Boathouse, 390 m/);
    assert.doesNotMatch(list, /Old well/);
  });

  test('should draw an old world without geography, marked about', () => {
    const old = world();
    delete old.map.geography;
    const html = mapHtml(old);
    assert.equal(trips(html).length, 2);
    assert.ok(trips(html).every((t) => t.startsWith('about ')));
    assert.match(html, /class="map" data-terrain="plain"/);
  });

  test('should draw landmarks as scenery, not places', () => {
    const html = mapHtml(world());
    assert.match(html, /class="landmark"[^>]*>.*Old well/);
    assert.equal((html.match(/data-place=/g) ?? []).length, 3);
    assert.match(html, /data-terrain="forest"/);
  });

  test('should draw a compass, a scale bar and the title', () => {
    const html = mapHtml(world());
    assert.match(html, /class="compass"[^>]*>.*N</);
    assert.match(html, /class="scale"><i style="width:20%"><\/i><span>200 m<\/span>/);
    assert.match(html, /class="map-title">Night at the Lodge</);
  });

  test('should escape landmark names and titles', () => {
    const html = mapHtml(world({ title: '<i>T</i>', map: { ...world().map, geography: { ...geography, landmarks: [{ id: 'm1', name: '<b>Well</b>', kind: 'well', x: 50, y: 15 }] } } }));
    assert.ok(!html.includes('<b>Well'));
    assert.ok(!html.includes('<i>T</i>'));
  });
});
