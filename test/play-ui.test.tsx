import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { joinBody, emptyAnswers, reminderDue, countdown, suspicionLabel } from '../src/lib/phone.ts';
import { CardFlip } from '../src/app/play/card';

describe('phone helpers', () => {
  test('should send the linked username, a typed username, or ask for a fresh one', () => {
    assert.deepEqual(joinBody({ name: 'Nik', wish: '', linked: { username: 'nikhil', name: 'Nikhil' }, typed: '' }), { name: 'Nikhil', wish: '', username: 'nikhil' });
    assert.deepEqual(joinBody({ name: 'Nik', wish: 'spy', linked: null, typed: 'nik-k' }), { name: 'Nik', wish: 'spy', username: 'nik-k' });
    assert.deepEqual(joinBody({ name: 'Nik', wish: '', linked: null, typed: '', newPerson: true }), { name: 'Nik', wish: '', newPerson: true });
  });

  test('should warn about empty how and why with the points at stake', () => {
    assert.equal(emptyAnswers({ how: ' ', why: 'money' }), 'How is empty, that is 2 points. Send anyway?');
    assert.equal(emptyAnswers({ how: '', why: '' }), 'How and Why are empty, that is 4 points. Send anyway?');
    assert.equal(emptyAnswers({ how: 'a', why: 'b' }), null);
  });

  test('should show a reminder 15 seconds into a round, then every 3 minutes, never during a vote or moment', () => {
    const view = { status: 'playing', phase: { number: 1 }, card: { reminders: ['A', 'B'] }, round: { vote: null }, moments: [], pending: null };
    let st = { round: null, at: 0, next: 0 };
    let r = reminderDue(st, view, 1_000);
    assert.equal(r.show, null);
    st = r.state;
    r = reminderDue(st, view, 16_000);
    assert.equal(r.show, 'A');
    r = reminderDue(r.state, view, 60_000);
    assert.equal(r.show, null);
    r = reminderDue(r.state, view, 16_000 + 180_000);
    assert.equal(r.show, 'B');
    const voting = { ...view, round: { vote: { endsAt: 1 } } };
    assert.equal(reminderDue(r.state, voting, 16_000 + 400_000).show, null);
  });

  test('should count down and name the suspicion level in plain words', () => {
    assert.deepEqual(countdown(125_000, 0), { text: '2:05', low: false });
    assert.deepEqual(countdown(30_000, 0), { text: '0:30', low: true });
    assert.equal(suspicionLabel(80), 'Very high');
    assert.equal(suspicionLabel(10), 'Low');
  });
});

describe('the character card', () => {
  const card = { name: 'Nikhil Rao', role: 'Bank Manager', public_info: 'A former captain.', private_info: 'You owe money.', goal: 'Get the ledger.', win: 'WIN', side: 'culprit', side_explanation: 'You did it.', starting_knowledge: '', wants: '', fears: '', goal_why: '', reasons: [], reminders: [], night: [], alibi: [], hidden_known: [], hidden_unknown: 1 };

  test('should show who you are first and keep secrets on the back', () => {
    const out = renderToStaticMarkup(<CardFlip card={card} caseQuestion="Who?" overridesLeft={2} overridesTotal={3} />);
    assert.match(out, /data-face="front"/);
    assert.match(out, /Nikhil Rao/);
    assert.match(out, /Tap to see what you hide/);
  });
});
