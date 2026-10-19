import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM, emptyAsk, gameInReading } from './fixtures.ts';
import { mapHtml } from '../src/lib/map.ts';
import { askLine, introLines } from '../src/lib/chat.ts';
import { Novel } from '../src/components/game/novel';
import { Results } from '../src/components/game/panels';
import { Playing as PhonePlaying } from '../src/app/play/playing';
import { Playing as TablePlaying } from '../src/app/table/playing';

const tick = () => new Promise((r) => setTimeout(r, 5));
const playing = () => {
  const game = gameInReading(3, 1_000, { questions: true });
  G.startPlay(game, 1_000);
  return game;
};

describe('ui audit: the map', () => {
  test('should leave walk times off the map of an old world, which only guesses them', () => {
    const game = playing();
    const html = mapHtml(G.playerView(game, 'p1'), { me: 'p1' });
    assert.ok(!html.includes('class="trip'));
  });

  test('should spread places that would sit on top of each other', () => {
    const game = playing();
    game.scenario.locations = [
      { id: 'l1', name: 'Ballroom', public_info: '', x: 50, y: 50, neighbors: ['l2'] },
      { id: 'l2', name: 'Kitchen', public_info: '', x: 53, y: 51, neighbors: ['l1'] },
    ];
    const html = mapHtml(G.tableView(game), {});
    const tops = [...html.matchAll(/data-place="l\d" style="left:([\d.]+)%;top:([\d.]+)%"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.equal(tops.length, 2);
    assert.ok(Math.abs(tops[0][1] - tops[1][1]) >= 10 || Math.abs(tops[0][0] - tops[1][0]) >= 16, JSON.stringify(tops));
  });
});

describe('ui audit: words', () => {
  test('should say asked only for a question', () => {
    assert.equal(askLine('Asha', 'Who has the key?'), 'Asha asked the room: Who has the key?');
    assert.equal(askLine('Asha', 'I am a photographer.'), 'Asha to the room: I am a photographer.');
  });

  test('should write a job title in lower case inside a sentence, keeping place names', () => {
    assert.equal(introLines({ name: 'Asha', role: 'Photographer' })[0], "I'm Asha, the photographer.");
    assert.equal(introLines({ name: 'Ben', role: 'Tea Broker from Calcutta' })[0], "I'm Ben, the tea broker from Calcutta.");
  });

  test('should keep narration readable, not faded', () => {
    assert.doesNotMatch(renderToStaticMarkup(h(Novel, { lines: [{ speaker: '', text: 'She looks away.' }] })), /text-muted-foreground/);
  });
});

describe('ui audit: a declined move', () => {
  test('should keep the player where they are even if the GM answer names a new place', async () => {
    const gm = new FakeGM();
    const app = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await app.join({ name }));
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic', questions: 3 });
    await app.idle();
    await app.start(app.game.hostToken);
    await app.idle();
    gm.readResult = { kind: 'question', target: '', place: '', goes_to: 'Ballroom', attempt: 'P walks to the ballroom', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: true };
    gm.askResult = { ...emptyAsk, player_location: 'l1' };
    await app.ask(tokens[1], { kind: 'chat', text: 'I walk to the ballroom.' });
    for (let i = 0; i < 20 && !app.game.state.moveConfirm?.p2; i += 1) await tick();
    await app.confirmMove(tokens[1], false);
    await app.idle();
    assert.equal(G.currentPlace(app.game, 'p2'), 'l2');
    assert.equal(app.game.state.positions.p2, 'l2');
    assert.equal(app.game.state.questionsLeft.p2, 3, 'staying is talk: no act used');
  });
});

describe('ui audit: layout', () => {
  const phone = (game, pid) => renderToStaticMarkup(h(PhonePlaying, { view: G.playerView(game, pid, 2_000), dots: new Set(), clearDot: () => {} }));
  test('should keep what needs you in a tray by the composer, so it shows wherever you are in the chat', () => {
    const game = playing();
    G.beginRoundVote(game, 1_500);
    const html = phone(game, 'p2');
    const tray = html.slice(html.indexOf('data-tray'));
    assert.ok(tray.includes('QUESTION-1'));
    assert.ok(tray.indexOf('QUESTION-1') < tray.indexOf('To the room'));
  });

  test('should put the drawers in the top bar', () => {
    const html = phone(playing(), 'p2');
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    for (const t of ['Me', 'Goals', 'Clues', 'Map', 'People', 'Case file']) assert.ok(header.includes(`>${t}<`), t);
  });

  test('should show the room on the table beside the map, not at the bottom', () => {
    const game = playing();
    const html = renderToStaticMarkup(h(TablePlaying, { view: G.tableView(game, 2_000), host: 'h', act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));
    assert.ok(html.indexOf('data-room-feed') > html.indexOf('Edit map'));
  });

describe('ui audit: the rounds list', () => {
  test('should number rounds as played and mark only a quiz right or wrong', () => {
    const html = renderToStaticMarkup(h(Results, { results: [
      { phaseIndex: 0, round: 1, question: 'Q1', correct: false, pickedText: 'A' },
      { phaseIndex: 0, round: 2, question: 'Q1', correct: true, pickedText: 'B' },
      { kind: 'choice', phaseIndex: 1, round: 3, question: 'Break the door?', correct: null, pickedText: 'Wait' },
      { kind: 'spotlight', phaseIndex: 2, round: 4, question: 'Who?', correct: null, pickedText: null },
    ] }));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(text, /Round 1: Q1 ✗ A Round 2: Q1 ✓ B Round 3: Break the door\? Wait Round 4: Who\? the room was split/);
  });
});
});
