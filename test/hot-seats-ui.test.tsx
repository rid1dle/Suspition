import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFlip } from '../src/app/play/card';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const card = { name: 'Lata', role: 'Cook', side: 'investigator', public_info: 'Cooks.', private_info: 'Owes money.', side_explanation: '', goal: 'Hide the debt.', goal_why: '', win: '', wants: '', fears: '', reasons: [], night: [], hidden_known: [], hidden_unknown: 0, starting_knowledge: '',
  hook: 'You are the cook who hides a debt.', distrusts: 'Asha', distrust_why: 'She was near the shed.', locked: ['drives', 'reasons'] } as never;

describe('hook-first card on the phone', () => {
  test('should show the hook first and a locked note for drives', () => {
    const out = text(<CardFlip card={card} caseQuestion="Who did it?" overridesLeft={1} overridesTotal={2} />);
    assert.ok(out.indexOf('You are the cook who hides a debt.') < out.indexOf('Your secret goal'));
    assert.match(out, /You don't trust Asha[\s\S]*She was near the shed/);
    assert.match(out, /Unlocks after your first hot seat/);
  });
});

import { createElement as h } from 'react';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { Playing as PhonePlaying } from '../src/app/play/playing';
import { Playing as TablePlaying } from '../src/app/table/playing';

describe('hot seats on screen', () => {
  const live = () => {
    const game = gameInReading(4, 1_000);
    game.setup.roundStyle = 'hotseats';
    G.startPlay(game, 1_000);
    const seat = game.state.seats.list[0];
    G.applySeatWriting(game, game.state.seats.round, { seats: [{ player_id: seat.pid, whisper: ['SECRET WHISPER LINE'], askers: seat.askers.map((a, i) => ({ player_id: a.pid, question: `QUESTION NUMBER ${i}`, followup: '' })) }] });
    G.seatNow(game, 2_000);
    return { game, seat };
  };
  const phone = (game, pid) => renderToStaticMarkup(h(PhonePlaying, { view: G.playerView(game, pid, 2_500), dots: new Set(), clearDot: () => {} }));
  const table = (game) => renderToStaticMarkup(h(TablePlaying, { view: G.tableView(game, 2_500), host: 'h', act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));

  test('should show the table who is up with a timer, and no question or whisper', () => {
    const { game, seat } = live();
    const html = table(game);
    assert.match(html, new RegExp(`Hot seat[\\s\\S]*${game.players.find((p) => p.id === seat.pid).name}`));
    assert.ok(!html.includes('QUESTION NUMBER') && !html.includes('SECRET WHISPER LINE'));
  });

  test('should show the seated phone its whisper during get-ready', () => {
    const { game, seat } = live();
    assert.match(phone(game, seat.pid), /You(?:'|&#x27;)re up[\s\S]*SECRET WHISPER LINE/);
  });

  test('should show each asker only their own question', () => {
    const { game, seat } = live();
    seat.askers.forEach((a, i) => {
      const html = phone(game, a.pid);
      assert.ok(html.includes(`QUESTION NUMBER ${i}`));
      assert.ok(seat.askers.every((b, j) => j === i || !html.includes(`QUESTION NUMBER ${j}`)));
      assert.ok(!html.includes('SECRET WHISPER LINE'));
    });
  });

  test('should never put a whisper or question in a listener view', () => {
    const { game, seat } = live();
    const listener = game.players.find((p) => p.id !== seat.pid && !seat.askers.some((a) => a.pid === p.id));
    if (!listener) return;
    const json = JSON.stringify(G.playerView(game, listener.id, 2_500));
    assert.ok(!json.includes('SECRET WHISPER LINE') && !json.includes('QUESTION NUMBER'));
  });

  test('should give the host a button to start the next hot seat', () => {
    const game = gameInReading(4, 1_000);
    game.setup.roundStyle = 'hotseats';
    G.startPlay(game, 1_000);
    assert.match(table(game), /Hot seat now/);
  });
});

describe('point on screen', () => {
  test('should show "A suspects B!" on the table', () => {
    const game = gameInReading(4, 1_000);
    game.setup.roundStyle = 'hotseats';
    G.startPlay(game, 1_000);
    G.point(game, 'p1', 'p2', 5_000);
    const html = renderToStaticMarkup(h(TablePlaying, { view: G.tableView(game, 5_000), host: null, act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));
    assert.match(html, new RegExp(`${game.players[0].name} suspects ${game.scenario.players[1].character_name}!`));
  });

  test('should let a phone point at someone from the People tab', () => {
    const game = gameInReading(4, 1_000);
    game.setup.roundStyle = 'hotseats';
    G.startPlay(game, 1_000);
    const html = renderToStaticMarkup(h(PointButtons, { people: G.playerView(game, 'p1').cast.players, me: 'p1', onPoint: () => {} }));
    assert.match(html, /Point at/);
    assert.ok(!html.includes(`Point at ${game.scenario.players[0].character_name}`));
  });
});

import { PointButtons } from '../src/components/game/people';

import { Setup } from '../src/app/table/setup';

describe('round style on the setup screen', () => {
  test('should offer hot seats and classic, with hot seats picked', () => {
    const game = G.createGame(1_000);
    for (const name of ['A', 'B', 'C']) G.addPlayer(game, { name });
    const html = renderToStaticMarkup(h(Setup, { view: G.tableView(game), host: 'h', act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));
    assert.match(html, /Round style/);
    assert.match(html, /aria-checked="true"[^>]*>Hot seats/);
    assert.match(html, /Classic quiz/);
  });
});
