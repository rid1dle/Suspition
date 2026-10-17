import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tableSound, phoneAlerts } from '../public/alerts.js';
import { SOUND_NAMES } from '../public/sfx.js';

const table = (events, extra = {}) => ({ gameId: 'g', events, ...extra });

describe('table sounds', () => {
  test('should play nothing on the first view, for another game, or with no new news', () => {
    assert.equal(tableSound(null, table([])), null);
    assert.equal(tableSound(table([]), { ...table([{ kind: 'event', text: 'x' }]), gameId: 'other' }), null);
    const same = table([{ kind: 'event', text: 'x' }]);
    assert.equal(tableSound(same, same), null);
  });

  test('should pick a sound for each kind of public news', () => {
    const one = (e) => tableSound(table([]), table([e]));
    assert.equal(one({ kind: 'event', text: 'A door slams.' }), 'news');
    assert.equal(one({ kind: 'said', text: 'B said: "Hi"' }), 'said');
    assert.equal(one({ kind: 'clue', text: 'B shows a clue. Glove: torn.' }), 'clue');
    assert.equal(one({ kind: 'round', text: 'That is right! More.' }), 'good');
    assert.equal(one({ kind: 'round', text: 'Not quite. Look again.' }), 'bad');
    assert.equal(one({ kind: 'moment', text: 'B, the story turns to you.' }), 'call');
  });

  test('should play only the most important sound when many news arrive together', () => {
    assert.equal(tableSound(table([]), table([{ kind: 'event', text: 'x' }, { kind: 'phase', text: 'Round 2 of 3: B' }, { kind: 'timeline', text: 't' }])), 'phase');
  });

  test('should only name sounds that exist', () => {
    const kinds = ['event', 'said', 'clue', 'timeline', 'hint', 'qa', 'override', 'phase', 'moment', 'vote'];
    for (const kind of kinds) {
      const s = tableSound(table([]), table([{ kind, text: 'x', by: 'a', q: 'b' }]));
      assert.ok(SOUND_NAMES.includes(s), `${kind} -> ${s}`);
    }
  });
});

describe('phone alerts', () => {
  const me = (extra = {}) => ({ gameId: 'g', me: { id: 'p1', name: 'Asha' }, thread: [], clues: [], card: { goal: 'G', hidden_known: [] }, moments: [], round: null, hintVote: null, ...extra });

  test('should stay quiet on the first view and when nothing private changed', () => {
    assert.deepEqual(phoneAlerts(null, me()), []);
    assert.deepEqual(phoneAlerts(me(), me()), []);
  });

  test('should tell the player about a GM answer or a secret note, but not their own message', () => {
    assert.deepEqual(phoneAlerts(me(), me({ thread: [{ from: 'you', text: 'hi' }] })), []);
    assert.deepEqual(phoneAlerts(me(), me({ thread: [{ from: 'you' }, { from: 'gm' }] })), [{ sound: 'private', text: 'The GM answered you.', tab: 'ask' }]);
    assert.equal(phoneAlerts(me(), me({ thread: [{ from: 'gm' }, { from: 'whisper' }] }))[0].text, 'A secret note for you.');
  });

  test('should name a newly found clue and point to the Clues tab', () => {
    const [a] = phoneAlerts(me({ clues: [{ id: 'c1', name: 'Glove' }] }), me({ clues: [{ id: 'c1', name: 'Glove' }, { id: 'c2', name: 'Key' }] }));
    assert.deepEqual(a, { sound: 'clue', text: 'You found a clue: Key.', tab: 'clues' });
  });

  test('should tell the player about a new fact about themselves and a changed goal', () => {
    const alerts = phoneAlerts(me(), me({ card: { goal: 'New goal', hidden_known: ['You were adopted.'] } }));
    assert.deepEqual(alerts.map((a) => a.text), ['You found out something about yourself.', 'Your goal changed.']);
  });

  test('should warn about a coming moment, a round vote and someone else asking for a hint', () => {
    const alerts = phoneAlerts(me(), me({ moments: [{ id: 'm1' }], round: { vote: { endsAt: 1 } }, hintVote: { proposer: 'Ben' } }));
    assert.deepEqual(alerts.map((a) => a.sound), ['call', 'vote', 'vote']);
    assert.deepEqual(phoneAlerts(me(), me({ hintVote: { proposer: 'Asha' } })), []);
  });
});

describe('phone alerts for a fixed card', () => {
  test('should tell the player when their card gains things they remember', () => {
    const v = (k) => ({ gameId: 'g', me: { id: 'p1' }, card: { goal: 'G', hidden_known: [], starting_knowledge: k } });
    assert.deepEqual(phoneAlerts(v('A.'), v('A. B.')), [{ sound: 'secret', text: 'Your card has new things you remember.', tab: 'card' }]);
  });
});
