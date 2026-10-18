import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SurpriseLine } from '../src/app/table/setup';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('the drawn setting idea on setup', () => {
  test('should show the drawn idea and a Shuffle button while the setting box is empty', () => {
    const out = text(<SurpriseLine setting="" surprise={{ id: 'night-train', text: 'A night train from Delhi to Mumbai' }} onShuffle={() => {}} />);
    assert.match(out, /If you leave this empty: A night train from Delhi to Mumbai/);
    assert.match(out, /Shuffle/);
  });

  test('should hide the idea once a setting is typed', () => {
    assert.equal(renderToStaticMarkup(<SurpriseLine setting="A college reunion" surprise={{ id: 'x', text: 'A night train' }} onShuffle={() => {}} />), '');
    assert.equal(renderToStaticMarkup(<SurpriseLine setting="" surprise={null} onShuffle={() => {}} />), '');
  });
});
