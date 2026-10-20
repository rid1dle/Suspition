import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { artifactCaption } from '../src/lib/artifact.ts';
import { CluesBody } from '../src/app/play/playing';
import { SharedClues } from '../src/components/game/panels';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

function withLedger() {
  const game = gameInReading(3);
  Object.assign(game.scenario.clues[1], { form: 'ledger', author: 'The Butler', written_at: '9:10 pm', text: '9:10. Cellar keys out. Returned? (no tick).' });
  G.startPlay(game, 1_000);
  game.state.found.p2.push('c2', 'c1');
  return game;
}

describe('a clue is the thing itself', () => {
  test('should say what the thing is, who wrote it and when', () => {
    assert.equal(artifactCaption({ form: 'ledger', by: 'The Butler', when: '9:10 pm', text: 'x' }), 'A ledger line, written by The Butler at 9:10 pm');
    assert.equal(artifactCaption({ form: 'letter', by: 'Lata', when: '', text: 'x' }), 'A letter, written by Lata');
    assert.equal(artifactCaption({ form: 'photo', by: 'Ravi', when: 'last May', text: 'x' }), 'A photo, taken by Ravi, last May');
    assert.equal(artifactCaption({ form: 'mark', by: '', when: '', text: 'x' }), '');
    assert.equal(artifactCaption({ form: 'note', by: '', when: '', text: 'x' }), 'A note');
  });

  test('should hand the phone the words of a clue that has them, and nothing extra for one that does not', () => {
    const game = withLedger();
    const clues = G.playerView(game, 'p2', 2_000).clues;
    assert.deepEqual(clues.find((c) => c.id === 'c2').artifact, { form: 'ledger', by: 'The Butler', when: '9:10 pm', text: '9:10. Cellar keys out. Returned? (no tick).' });
    assert.equal('artifact' in clues.find((c) => c.id === 'c1'), false);
  });

  test('should show the thing first and the plain fact under it on the phone', () => {
    const game = withLedger();
    const html = text(renderToStaticMarkup(h(CluesBody, { view: { ...G.playerView(game, 'p2', 2_000), gameId: 'g1' } })));
    assert.match(html, /A ledger line, written by The Butler at 9:10 pm 9:10\. Cellar keys out\. Returned\? \(no tick\)\. CLUE-2-SHOWS/);
  });

  test('should show a shared thing in its own words to everyone', () => {
    const game = withLedger();
    G.shareClue(game, 'p2', 'c2', 3_000);
    const shared = G.playerView(game, 'p1', 3_000).sharedClues;
    const html = text(renderToStaticMarkup(h(SharedClues, { clues: shared })));
    assert.match(html, /Cellar keys out/);
    assert.match(html, /CLUE-2-SHOWS/);
  });
});
