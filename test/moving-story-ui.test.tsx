import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoundCard, VoteBrief } from '../src/components/game/round';
import { StoryShape } from '../src/components/game/panels';
import { feedItem } from '../src/lib/feed.ts';

const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const round = { objective: '', tips: [], question: 'Who should the room look at?', options: ['Asha', 'Ben'], done: false, vote: { endsAt: 9_000, voted: 1, of: 4 } };
const brief = { lines: ['The glove was found in the shed.'], open: ['Who wore the glove?'], people: [{ name: 'Asha', line: 'Was in the kitchen at nine.' }, { name: 'Ben', line: '' }] };

describe('before you vote', () => {
  test('should show where things stand, what is open and a line per person above the options', () => {
    const out = text(<RoundCard round={round} voting brief={brief} />);
    assert.match(out, /Before you vote/);
    assert.match(out, /The glove was found in the shed\./);
    assert.match(out, /Still open: Who wore the glove\?/);
    assert.match(out, /Asha: Was in the kitchen at nine\./);
    assert.doesNotMatch(out, /Ben:/, 'a person with nothing public gets no empty line');
    assert.ok(out.indexOf('Before you vote') < out.indexOf('Who should the room look at?'));
  });

  test('should show nothing when there is no brief', () => {
    assert.equal(renderToStaticMarkup(<VoteBrief brief={null} />), '');
    assert.doesNotMatch(text(<RoundCard round={{ ...round, vote: null }} brief={brief} />), /Before you vote/);
  });
});

describe('the story at the end', () => {
  test('should say what the story began as and became', () => {
    assert.match(text(<StoryShape line="This story began as a frame-up. It became a love triangle." />), /This story began as a frame-up\. It became a love triangle\./);
    assert.equal(renderToStaticMarkup(<StoryShape line="" />), '');
  });
});

describe('the round opens with the room choice', () => {
  test('should show the because line in the feed as part of the round', () => {
    assert.deepEqual(feedItem({ kind: 'because', text: 'Because the room looked at Ben, the shed is searched.' }), { kind: 'because', text: 'Because the room looked at Ben, the shed is searched.' });
  });
});
