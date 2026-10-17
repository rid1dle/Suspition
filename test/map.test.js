import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapHtml, shortName } from '../public/map.js';

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
    assert.equal((html.match(/<line /g) ?? []).length, 1);
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
