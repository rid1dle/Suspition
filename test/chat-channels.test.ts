import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chatItems, channelItems, channelOf, targetsFor, unreadIn, type ChatItem } from '../src/lib/chat.ts';

const view = {
  me: { id: 'p1' },
  players: [{ id: 'p1', name: 'Asha' }, { id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Cy' }],
  cast: { players: [{ id: 'p1', name: 'Kabir' }, { id: 'p2', name: 'Anirudh' }, { id: 'p3', name: 'Meera' }], npcs: [{ id: 'n1', name: 'Bhola' }] },
  events: [{ at: 1, phase: 0, kind: 'event', text: 'The rain stops.' }, { at: 4, phase: 0, kind: 'talk', text: 'Anirudh: "Hi."' }],
  thread: [{ from: 'you' as const, text: 'I look at the door.', at: 2 }, { from: 'gm' as const, text: 'A key is in the lock.', tell: 'I found a new key in the shrine lock.', at: 3 }],
  dms: [
    { id: 'd1', at: 5, from: 'Anirudh', to: 'Kabir', text: 'Meet me.', mine: false, with: 'p2' },
    { id: 'd2', at: 6, from: 'Kabir', to: 'Meera', text: 'Psst.', mine: true, with: 'p3' },
  ],
};
const texts = (items: ChatItem[]) => items.map((i) => i.text);

describe('every line knows its channel', () => {
  test('should put room lines, my GM talk and messages with players each in their own channel', () => {
    const items = chatItems(view);
    assert.deepEqual(items.map((i) => [i.text, channelOf(i), i.with ?? null]), [
      ['The rain stops.', 'room', null],
      ['I look at the door.', 'gm', null],
      ['A key is in the lock.', 'gm', null],
      ['Anirudh: "Hi."', 'room', null],
      ['Meet me.', 'dm', 'p2'],
      ['Psst.', 'dm', 'p3'],
    ]);
  });
});

describe('what each layout shows', () => {
  const items = chatItems(view);
  test('should split Room and Private, with the GM and every message under Private', () => {
    assert.deepEqual(texts(channelItems(items, { layout: 'tabs', tab: 'room' })), ['The rain stops.', 'Anirudh: "Hi."']);
    assert.deepEqual(texts(channelItems(items, { layout: 'tabs', tab: 'private' })), ['I look at the door.', 'A key is in the lock.', 'Meet me.', 'Psst.']);
  });

  test('should give the GM its own tab and each person their own thread', () => {
    assert.deepEqual(texts(channelItems(items, { layout: 'three', tab: 'gm' })), ['I look at the door.', 'A key is in the lock.']);
    assert.deepEqual(texts(channelItems(items, { layout: 'three', tab: 'people', person: 'p2' })), ['Meet me.']);
  });

  test('should keep one stream with a filter', () => {
    assert.equal(channelItems(items, { layout: 'stream', tab: 'all' }).length, 6);
    assert.deepEqual(texts(channelItems(items, { layout: 'stream', tab: 'room' })), ['The rain stops.', 'Anirudh: "Hi."']);
  });
});

describe('who you can talk to', () => {
  test('should offer everyone, each other player and each GM character out loud', () => {
    assert.deepEqual(targetsFor(view, 'room').map((t) => t.label), ['Everyone', 'Anirudh', 'Meera', 'Bhola']);
  });

  test('should offer the GM and each other player in private', () => {
    assert.deepEqual(targetsFor(view, 'private').map((t) => [t.label, t.kind]), [['GM', 'gm'], ['Anirudh', 'dm'], ['Meera', 'dm']]);
  });

  test('should offer only the GM in private when playing alone', () => {
    const solo = { ...view, players: [{ id: 'p1', name: 'Asha' }], cast: { players: [{ id: 'p1', name: 'Kabir' }], npcs: [] } };
    assert.deepEqual(targetsFor(solo, 'private').map((t) => t.label), ['GM']);
    assert.deepEqual(targetsFor(solo, 'room').map((t) => t.label), ['Everyone']);
  });
});

describe('unread lines per tab', () => {
  test('should count lines newer than the last look, never my own', () => {
    const items = chatItems(view);
    assert.equal(unreadIn(channelItems(items, { layout: 'tabs', tab: 'private' }), 2), 2);
    assert.equal(unreadIn(channelItems(items, { layout: 'tabs', tab: 'room' }), 0), 2);
  });
});
