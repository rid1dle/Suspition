import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { narrationFor, chunks, pickVoice } from '../src/lib/narration.ts';

const base = { gameId: 'g', status: 'playing', title: 'The Case', opening: 'It was dark.', events: [{ kind: 'opening', text: 'It was dark.' }] };
const withEvents = (...events) => ({ ...base, events: [...base.events, ...events] });

describe('narrationFor', () => {
  const briefing = (step) => ({ ...base, status: 'reading', briefing: { step, steps: [
    { kind: 'scene', title: 'The Case', lines: ['A dark hotel.'] },
    { kind: 'intro', title: 'Meet Ruby', lines: ['Asha, stand up and say: "I am Ruby"'] },
  ] } });

  test('should read the first intro step when the world is ready', () => {
    assert.deepEqual(narrationFor({ ...base, status: 'generating', events: [] }, briefing(0)), ['The Case.', 'A dark hotel.']);
  });

  test('should read each intro step when the host moves on, but only say who is next for a player intro', () => {
    assert.deepEqual(narrationFor(briefing(0), briefing(1)), ['Meet Ruby.']);
    assert.deepEqual(narrationFor(briefing(1), briefing(1)), []);
  });

  test('should not read public questions and answers out loud', () => {
    assert.deepEqual(narrationFor(base, withEvents({ kind: 'qa', q: 'Cold?', text: 'Yes.' })), []);
  });

  test('should read only the news that is new since last time', () => {
    const prev = withEvents({ kind: 'event', text: 'Old news.' });
    const next = withEvents({ kind: 'event', text: 'Old news.' }, { kind: 'event', text: 'A door slams.' }, { kind: 'hint', text: 'Hint: check the cups.' });
    assert.deepEqual(narrationFor(prev, next), ['A door slams.', 'Hint: check the cups.']);
  });

  test('should announce a new round', () => {
    assert.deepEqual(narrationFor(base, withEvents({ kind: 'phase', text: 'Round 2 of 4: Midnight' })), ['Round 2 of 4. Midnight']);
  });

  test('should skip the note that a hint was saved', () => {
    assert.deepEqual(narrationFor(base, withEvents({ kind: 'hint', text: 'The group kept its hint.' })), []);
  });

  test('should read the winner and the story at the reveal', () => {
    const next = { ...base, status: 'reveal', reveal: { verdict: { winner: 'culprits' }, reveal_story: 'The cook did it.' } };
    assert.deepEqual(narrationFor({ ...base, status: 'final' }, next), ['The culprits got away with it.', 'The cook did it.']);
  });

  test('should read nothing old when a screen first loads or a new game starts', () => {
    assert.deepEqual(narrationFor(null, withEvents({ kind: 'event', text: 'x' })), []);
    assert.deepEqual(narrationFor(base, { ...withEvents({ kind: 'event', text: 'x' }), gameId: 'other' }), []);
  });

  test('should never read private phone text', () => {
    const next = { ...withEvents({ kind: 'event', text: 'Public.' }), thread: [{ from: 'gm', text: 'SECRET' }], card: { private_info: 'SECRET' } };
    assert.ok(!narrationFor(base, next).join(' ').includes('SECRET'));
  });
});

describe('chunks', () => {
  test('should split long text at sentence ends', () => {
    const text = 'One short line. '.repeat(20);
    const parts = chunks(text, 60);
    assert.ok(parts.length > 1);
    assert.ok(parts.every((p) => p.length <= 60));
    assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.trim());
  });

  test('should never split after a title like Dr.', () => {
    const parts = chunks('Gopi says Dr. Mira Sen is in the pool. She is not breathing.', 30);
    assert.ok(parts.every((p) => !/Dr\.$/.test(p)), JSON.stringify(parts));
    assert.ok(parts.some((p) => p.includes('Dr. Mira Sen')));
  });

  test('should keep short text whole', () => {
    assert.deepEqual(chunks('Hello there. Bye.'), ['Hello there. Bye.']);
  });
});

describe('pickVoice', () => {
  const voices = [
    { name: 'Thomas', lang: 'fr-FR' },
    { name: 'Samantha', lang: 'en-US', default: true },
    { name: 'Rishi', lang: 'en-IN' },
  ];

  test('should use the saved voice when it exists', () => {
    assert.equal(pickVoice(voices, 'Samantha').name, 'Samantha');
  });

  test('should prefer an Indian English voice, then a good default', () => {
    assert.equal(pickVoice(voices, null).name, 'Rishi');
    assert.equal(pickVoice(voices.slice(0, 2), null).name, 'Samantha');
  });

  test('should return nothing when there is no English voice', () => {
    assert.equal(pickVoice([{ name: 'Thomas', lang: 'fr-FR' }], null), null);
  });
});
