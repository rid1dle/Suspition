import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chatItems, introLines } from '../src/lib/chat.ts';

const ev = (at, kind, text, extra = {}) => ({ at, phase: 0, kind, text, ...extra });
const view = (over = {}) => ({
  events: [
    ev(1, 'opening', 'The lights went out.'),
    ev(2, 'phase', 'Round 1 of 3: The Dark'),
    ev(3, 'goal', 'This round, your job: Find the fuse.'),
    ev(4, 'qa', 'The butler says he was in the cellar.', { by: 'Ben', q: 'Butler, where were you?' }),
    ev(6, 'move', 'Ben goes to the Shed (4 min walk) to check something.'),
    ev(8, 'because', 'Because the room looked at Ben, the shed is searched.'),
    ev(9, 'round', 'The room looks at Ben. Was in the shed.'),
    ev(10, 'recap', 'Where we are now. The fuse is gone.'),
  ],
  thread: [
    { from: 'you', text: 'I search the desk.', at: 5 },
    { from: 'gm', text: 'You find a key.', at: 5 },
    { from: 'whisper', text: 'Your goal changes.', at: 7 },
  ],
  pending: null,
  publicPending: null,
  ...over,
});

describe('the chat stream', () => {
  test('should merge the room and my private thread in story order', () => {
    const items = chatItems(view());
    assert.deepEqual(items.map((i) => i.kind), ['opening', 'round-start', 'qa', 'you', 'gm', 'move', 'whisper', 'because', 'vote-result', 'recap']);
    assert.deepEqual(items.map((i) => i.side), ['room', 'room', 'room', 'me', 'me', 'room', 'me', 'room', 'room', 'room']);
  });

  test('should leave out the round job, which the round strip shows', () => {
    assert.ok(!chatItems(view()).some((i) => /your job/.test(i.text)));
  });

  test('should show my waiting private message and the GM thinking at the end', () => {
    const items = chatItems(view({ pending: { kind: 'chat', text: 'I look under the rug.' } }));
    assert.deepEqual(items.slice(-2).map((i) => [i.kind, i.text]), [['you', 'I look under the rug.'], ['thinking', 'Thinking…']]);
  });

  test('should show my question out loud while the room answers', () => {
    const items = chatItems(view({ publicPending: 'Who has the key?' }));
    assert.deepEqual(items.at(-1), { key: 'public-pending', at: Infinity, side: 'room', kind: 'asking', text: 'Who has the key?' });
  });

  test('should mark a round result right or wrong only for a quiz', () => {
    const items = chatItems(view({ events: [ev(1, 'round', 'The group picked: A. That is right!'), ev(2, 'round', 'The group picked: B. Not quite. Look again.'), ev(3, 'round', 'The room chose: Wait.')] , thread: [] }));
    assert.deepEqual(items.map((i) => i.tone), ['right', 'wrong', undefined]);
  });
});

describe('starting from your story', () => {
  test('should offer the card intro line and a plain introduction, without repeats', () => {
    const lines = introLines({ name: 'Asha Rao', role: 'Night Nurse', intro_line: 'I heard the bell at nine.', hook: '' });
    assert.deepEqual(lines, ["I'm Asha Rao, the Night Nurse.", 'I heard the bell at nine.', 'Did anyone else hear something tonight?']);
  });

  test('should still offer lines when the card has no intro line', () => {
    assert.equal(introLines({ name: 'Ben', role: '', intro_line: '' }).length, 2);
    assert.equal(introLines({ name: 'Ben', role: '', intro_line: '' })[0], "I'm Ben.");
  });
});
