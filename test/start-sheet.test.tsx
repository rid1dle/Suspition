import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { Playing } from '../src/app/play/playing';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const phone = (game, pid) => text(renderToStaticMarkup(h(Playing, { view: G.playerView(game, pid, 2_000), dots: new Set(), clearDot: () => {} })));

describe('the first screen says what you can do now', () => {
  test('should show where you are and what to try first, in place of introducing yourself', () => {
    const game = gameInReading(3);
    game.scenario.players[1].first_lead = { lines: ['You sit in the guest room.', 'Your recorder is still in the shrine.'], ideas: ['Go to the shrine and get my recorder.', 'Ask Kamla what she saw.'] };
    G.startPlay(game, 1_000);
    const out = phone(game, 'p2');
    assert.match(out, /Right now You sit in the guest room\. Your recorder is still in the shrine\./);
    assert.match(out, /Try first Go to the shrine and get my recorder\. Ask Kamla what she saw\./);
    assert.doesNotMatch(out, /Introduce yourself/);
    assert.match(out, /Just look around first/);
  });

  test('should still offer first lines to the room in an old world with no first lead', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    assert.match(phone(game, 'p2'), /Introduce yourself to the room/);
  });
});
