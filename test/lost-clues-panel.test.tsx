import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { SharedClues } from '../src/components/game/panels';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the shared clues panel says when a clue is gone', () => {
  test('should mark a destroyed clue as told from memory', () => {
    const html = renderToStaticMarkup(h(SharedClues, { clues: [{ id: 'c1', name: 'Bar prints', by: 'Kabir', shows: 'Four faces at the bar.', lost: 'destroyed' }] }));
    assert.match(text(html), /from Kabir, destroyed, told from memory/);
  });

  test('should mark a damaged clue as only what is left, and a whole one with nothing', () => {
    const html = renderToStaticMarkup(h(SharedClues, { clues: [{ id: 'c1', name: 'Prints', by: 'Kabir', shows: 'x', lost: 'damaged' }, { id: 'c2', name: 'Glove', by: 'Dev', shows: 'y' }] }));
    assert.match(text(html), /from Kabir, only what is left/);
    assert.doesNotMatch(text(html), /from Dev,/);
  });
});
