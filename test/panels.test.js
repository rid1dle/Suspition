import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { novelHtml, pictureHtml, timelineHtml, newsHtml, roundHtml, stepHtml, sharedCluesHtml } from '../public/panels.js';

describe('panels', () => {
  test('should show speech with the speaker name and narration as plain lines', () => {
    const html = novelHtml([{ speaker: '', text: 'She looks away.' }, { speaker: 'Leela', text: 'Money, <b>Miss</b> Nair.' }]);
    assert.match(html, /<p class="act">She looks away.<\/p>/);
    assert.match(html, /<span class="who-says">Leela<\/span>&ldquo;Money, &lt;b&gt;Miss&lt;\/b&gt; Nair.&rdquo;/);
  });

  test('should name a speaker only once for lines in a row', () => {
    const html = novelHtml([{ speaker: 'Gopi', text: 'One.' }, { speaker: 'Gopi', text: 'Two.' }, { speaker: '', text: 'He sighs.' }, { speaker: 'Gopi', text: 'Three.' }]);
    assert.equal((html.match(/who-says/g) ?? []).length, 2);
  });

  test('should embed the picture as an image, never as live SVG', () => {
    const html = pictureHtml('<svg><rect/></svg>');
    assert.match(html, /^<img class="scene" alt="" src="data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    assert.ok(!html.includes('<svg'));
    assert.equal(pictureHtml(null), '');
  });

  test('should list the timeline with a time for each entry', () => {
    assert.match(timelineHtml([{ time: '9:15', event: 'Lights out <now>' }]), /<span class="when">9:15<\/span><span>Lights out &lt;now&gt;<\/span>/);
    assert.match(timelineHtml([]), /Nothing yet/);
  });

  test('should show a public question with who asked it, newest news first', () => {
    const html = newsHtml([{ kind: 'event', text: 'First' }, { kind: 'qa', by: 'Asha', q: 'Cold?', text: 'Yes.' }]);
    assert.ok(html.indexOf('Asha asked: Cold?') < html.indexOf('First'));
  });

  test('should show choices as vote buttons only while voting, with my pick marked', () => {
    const round = { question: 'How?', options: ['Fuse', 'Hand'], done: false, vote: { endsAt: 1, voted: 1, of: 3 } };
    const voting = roundHtml(round, { voting: true, myVote: 1 });
    assert.match(voting, /<button class="option on" data-choice="1">Hand<\/button>/);
    assert.match(voting, /1 of 3 voted/);
    assert.ok(!roundHtml({ ...round, vote: null }).includes('<button'));
  });

  test('should tell the right player it is their turn to introduce themselves', () => {
    const view = { briefing: { step: 0, steps: [{ kind: 'intro', playerId: 'p2', title: 'Meet Ruby', lines: ['Asha, stand up and say: "I am Ruby, a singer."'] }] } };
    assert.match(stepHtml(view, { me: 'p2' }), /Your turn! Stand up and say:[\s\S]*&quot;I am Ruby, a singer.&quot;/);
    assert.ok(!stepHtml(view, { me: 'p1' }).includes('Your turn'));
  });

  test('should say how to share a clue when none are shared', () => {
    assert.match(sharedCluesHtml([]), /Show everyone/);
  });
});
