import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createLive, readDraft, writeDraft } from '../src/lib/live.ts';

class FakeES {
  static all = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    FakeES.all.push(this);
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  close() { this.closed = true; }
  emit(type, data) {
    if (type === 'message') this.onmessage?.({ data: JSON.stringify(data) });
    else if (type === 'error') this.onerror?.({});
    else if (type === 'open') this.onopen?.({});
    else this.listeners[type]?.({ data: JSON.stringify(data) });
  }
}

const setup = () => {
  FakeES.all = [];
  const delays = [];
  const timers = [];
  const live = createLive('/events?token=t', { EventSourceImpl: FakeES, setTimer: (fn, ms) => { delays.push(ms); timers.push(fn); } });
  return { live, delays, timers, es: () => FakeES.all.at(-1) };
};

describe('live store', () => {
  test('should keep the last view while reconnecting', () => {
    const { live, timers, es } = setup();
    const seen = [];
    live.subscribe(() => seen.push(live.get()?.status));
    es().emit('message', { status: 'playing' });
    es().emit('error');
    assert.equal(live.get().status, 'playing');
    assert.equal(live.status(), 'connecting');
    timers.shift()();
    es().emit('message', { status: 'final' });
    assert.deepEqual(seen.filter(Boolean), ['playing', 'playing', 'final']);
    assert.equal(live.status(), 'open');
  });

  test('should stop and say gone when the seat is gone', () => {
    const { live, timers, es } = setup();
    es().emit('gone', { message: 'Unknown player.' });
    assert.equal(live.status(), 'gone');
    assert.ok(es().closed);
    assert.equal(timers.length, 0);
  });

  test('should back off between reconnects up to 10 seconds', () => {
    const { delays, timers, es } = setup();
    for (let i = 0; i < 6; i += 1) {
      es().emit('error');
      timers.shift()();
    }
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 10000, 10000]);
    es().emit('message', { status: 'lobby' });
    es().emit('error');
    assert.equal(delays.at(-1), 1000);
  });

  test('should keep a draft across a reload', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    writeDraft('ask', 'I search the', storage);
    assert.equal(readDraft('ask', storage), 'I search the');
    writeDraft('ask', '', storage);
    assert.equal(readDraft('ask', storage), '');
    assert.equal(readDraft('ask', { getItem: () => { throw new Error('blocked'); } }), '');
  });
});
