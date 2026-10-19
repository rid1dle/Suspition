import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tableSound, phoneAlerts } from '../src/lib/alerts.ts';

const table = (events) => ({ gameId: 'g', events });
const phone = (over = {}) => ({ gameId: 'g', me: { id: 'p1', name: 'Asha' }, thread: [], clues: [], moments: [], events: [], ...over });
const ev = (kind, text) => ({ at: 1, phase: 0, kind, text });

describe('sound check: the table', () => {
  test('should ring a meeting like a call, louder than news', () => {
    assert.equal(tableSound(table([]), table([ev('meeting', 'Meeting! Asha calls everyone together.'), ev('qa', 'x')])), 'call');
  });

  test('should mark a move with a soft sound, never silence', () => {
    assert.equal(tableSound(table([]), table([ev('move', 'Ben goes to the Shed to check something.')])), 'soft');
  });

  test('should let the round change carry the because line', () => {
    assert.equal(tableSound(table([]), table([ev('phase', 'Round 2 of 4: X'), ev('because', 'Because...')])), 'phase');
  });
});

describe('sound check: the phone', () => {
  test('should call every phone to a meeting', () => {
    const out = phoneAlerts(phone(), phone({ meeting: { by: 'Ben', reason: 'Look!', endsAt: 9 } }));
    assert.deepEqual(out[0], { sound: 'call', text: 'Meeting! Ben calls everyone together.', tab: null });
  });

  test('should ask the player to confirm a move', () => {
    const out = phoneAlerts(phone(), phone({ moveConfirm: { place: 'Shed', from: 'private' } }));
    assert.deepEqual(out[0], { sound: 'call', text: 'Go to the Shed? Answer Go or Not now.', tab: null });
  });

  test('should tell the player when the story needs an answer from them', () => {
    const out = phoneAlerts(phone(), phone({ offers: [{ id: 'o1', text: 'Where were you at 11?' }] }));
    assert.deepEqual(out[0], { sound: 'call', text: 'The story needs an answer from you.', tab: null });
  });

  test('should mark a new round on the phone too', () => {
    const out = phoneAlerts(phone({ phase: { number: 1, name: 'A' } }), phone({ phase: { number: 2, name: 'The Cellar' } }));
    assert.deepEqual(out[0], { sound: 'phase', text: 'Round 2: The Cellar.', tab: null });
  });

  test('should ask the others when someone wants to vote now, but not the one who asked', () => {
    const ask = { proposer: 'Ben', yes: 1, need: 3 };
    assert.deepEqual(phoneAlerts(phone(), phone({ voteAsk: ask }))[0], { sound: 'vote', text: 'Ben wants to vote now. Yes or Not yet?', tab: null });
    assert.deepEqual(phoneAlerts(phone({ me: { id: 'p2', name: 'Ben' } }), phone({ me: { id: 'p2', name: 'Ben' }, voteAsk: ask })), []);
  });
});
