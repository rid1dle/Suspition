import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { botPrompt } from '../scripts/playtest/bots.ts';

// From story run 5: five bots asked Lily the same thing out loud, because each saw only the last 8 news items.
describe('a bot hears what the room heard', () => {
  const screen = (view) => JSON.parse(botPrompt(view).split('\n')[1]);

  test('should show the last 20 things said or shown out loud', () => {
    const events = Array.from({ length: 25 }, (_, i) => ({ kind: 'qa', by: 'Asha', q: `Question ${i}?`, text: `Answer ${i}.` }));
    const news = screen({ status: 'playing', events }).news;
    assert.equal(news.length, 20);
    assert.match(news[0], /Question 5\?/);
  });

  test('should show what each shared clue says, as the table does', () => {
    const shared = screen({ status: 'playing', sharedClues: [{ name: 'Bar prints', shows: 'Four faces at the bar.', by: 'Kabir' }] }).shared_clues;
    assert.deepEqual(shared, [{ name: 'Bar prints', shows: 'Four faces at the bar.', from: 'Kabir' }]);
  });
});
