import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { botPrompt, botSystem, applyBotAction, BOT_SCHEMA } from '../scripts/playtest/bots.ts';
import { FakeGM } from './fixtures.ts';

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

// From story run 6: 26 private moves, 8 out-loud questions and 0 lines of table talk in a whole game. A real room
// talks all the time, beside whatever each person does.
describe('a bot talks at the table as it plays', () => {
  async function playing() {
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['A', 'B', 'C']) tokens.push(await app.join({ name }));
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await app.start(app.game.hostToken);
    await app.idle();
    return { app, tokens };
  }
  const blank = { text: '', choice: 0, clue_id: '', moment: 'said', to: '', gm_in: false, invite_id: '', yes: false, table_talk: '' };

  test('should give every turn a line said out loud beside the action', () => {
    assert.ok(BOT_SCHEMA.required.includes('table_talk'));
    assert.match(botSystem({ name: 'Asha', role: 'fair' }), /table_talk: one line you say out loud/);
  });

  test('should say the line to the room and still do the action', async () => {
    const { app, tokens } = await playing();
    const view = app.playerView(tokens[0]);
    await applyBotAction(app, tokens[0], view, { ...blank, action: 'go', text: 'Kitchen', table_talk: 'The cook was lying about the bell.' });
    assert.ok(app.game.state.events.some((e) => /The cook was lying about the bell\./.test(e.text)), 'said out loud');
    assert.equal(G.currentPlace(app.game, 'p1'), 'l2');
  });

  test('should say nothing extra when the line is empty or the action is already talk', async () => {
    const { app, tokens } = await playing();
    const before = app.game.state.events.length;
    await applyBotAction(app, tokens[0], app.playerView(tokens[0]), { ...blank, action: 'say', text: 'Hello all.', table_talk: 'Hello all.' });
    assert.equal(app.game.state.events.filter((e) => /Hello all\./.test(e.text)).length, 1);
    assert.ok(app.game.state.events.length >= before);
  });
});
