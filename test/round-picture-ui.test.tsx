import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { Playing as TablePlaying } from '../src/app/table/playing';

const table = (game) => renderToStaticMarkup(h(TablePlaying, { view: G.tableView(game, 2_000), host: 'h', act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));

describe("the round's picture on the table", () => {
  test('should show the round picture at the top of the round card, where everyone looks', () => {
    const game = gameInReading(3, 1_000);
    G.startPlay(game, 1_000);
    G.setRoundPicture(game, 1, '<svg viewBox="0 0 10 10"><rect id="ROUND-ART" width="10" height="10"/></svg>');
    const html = table(game);
    const art = html.search(/class="[^"]*round-picture/);
    assert.ok(art >= 0, 'the round card shows the picture');
    assert.ok(art < html.indexOf('THE BIG QUESTION') || art < html.indexOf('The big question'), 'above the big question');
  });

  test('should show nothing there until the round picture is drawn', () => {
    const game = gameInReading(3, 1_000);
    G.startPlay(game, 1_000);
    assert.ok(!/class="[^"]*round-picture/.test(table(game)), 'no empty frame');
  });
});
