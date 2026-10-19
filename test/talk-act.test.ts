import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { askPrompt } from '../server/prompts.ts';
import { READER_SCHEMA, cleanRead, readerSystem } from '../server/reader.ts';
import { rulesLines } from '../src/lib/rules.ts';
import { FakeGM, emptyAsk, gameInReading } from './fixtures.ts';

const read = (over = {}) => ({ kind: 'question', target: '', place: '', attempt: 'P asks the butler something', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: false, ...over });

async function playing() {
  const gm = new FakeGM();
  let now = 5_000;
  const app = await new App({ gm, store: new MemoryStore(), clock: () => now }).init();
  const tokens = [];
  for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await app.join({ name }));
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic' });
  await app.idle();
  await app.start(app.game.hostToken);
  await app.idle();
  return { app, gm, tokens, st: () => app.game.state, later: (ms) => { now += ms; } };
}

describe('talk and acts are both free', () => {
  test('should answer talk and tell the GM it is only talk', async () => {
    const t = await playing();
    t.gm.readResult = read();
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'Butler, where were you at nine?' });
    await t.app.idle();
    assert.equal(t.gm.lastAsk.talk, true);
    assert.equal(t.st().threads.p2.at(-1).from, 'gm');
  });

  test('should treat a move that changes the world as an act', async () => {
    const t = await playing();
    t.gm.readResult = read({ acts: true, attempt: 'P searches the desk' });
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I search the desk.' });
    await t.app.idle();
    assert.equal(t.gm.lastAsk.talk, false);
  });

  test('should count a secret action as an act and asking about yourself as talk', async () => {
    const t = await playing();
    t.gm.readResult = read({ kind: 'action' });
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'Secretly, I wipe the glass.' });
    await t.app.idle();
    assert.equal(t.gm.lastAsk.talk, false);
    t.gm.readResult = read({ kind: 'self', acts: true });
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'What do I remember about tonight?' });
    await t.app.idle();
    assert.equal(t.gm.lastAsk.talk, true);
  });

  test('should ignore clues, stirs, moves and destroyed things in a talk answer', async () => {
    const t = await playing();
    t.gm.readResult = read();
    t.gm.askResult = { ...emptyAsk, clues_found: ['c1'], clues_destroyed: ['c3'], public_event: 'A crash from the kitchen.', player_location: 'l2' };
    const events = t.st().events.length;
    await t.app.ask(t.tokens[0], { kind: 'chat', text: 'Butler, did you hear that?' });
    await t.app.idle();
    assert.deepEqual(t.st().found.p1, []);
    assert.deepEqual(t.st().destroyed, []);
    assert.equal(t.st().at.p1 ?? t.st().positions.p1, 'l1');
    assert.ok(!t.st().events.slice(events).some((e) => /crash/.test(e.text)));
  });

  test('should say try again when the GM cannot answer', async () => {
    const t = await playing();
    t.gm.readResult = read({ acts: true });
    t.gm.fail.answer = true;
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I search the desk.' });
    await t.app.idle();
    assert.match(t.st().threads.p2.at(-1).text, /The GM could not answer\. Try again\./);
  });

  test('should tell the GM what talk may not do', () => {
    const prompt = askPrompt({ snapshot: {}, player: { id: 'p1', character_name: 'Ana' }, kind: 'chat', text: 'hi', talk: true, held: 'meeting' });
    assert.match(prompt, /This is talk, not an act\./);
    assert.match(prompt, /clues_found empty/);
    assert.match(prompt, /the act has to wait until the meeting ends/);
    assert.doesNotMatch(askPrompt({ snapshot: {}, player: { id: 'p1', character_name: 'Ana' }, kind: 'chat', text: 'hi', talk: false }), /This is talk/);
  });

  test('should have the reader mark acts, counting an old read without the mark as an act', () => {
    assert.ok(READER_SCHEMA.properties.acts);
    assert.match(readerSystem({ character: 'Ana' }), /- acts: true if the character does something physical/);
    assert.equal(cleanRead({ kind: 'question', acts: false }, 'move').acts, false);
    assert.equal(cleanRead({ kind: 'question' }, 'move').acts, true);
  });

  test('should explain talk and acts in the rules', () => {
    const all = rulesLines({ rounds: 3, overrides: 1, hints: 2 }).join(' ');
    assert.match(all, /Talk and act as much as you like/);
    assert.doesNotMatch(all, /acts each round/);
  });
});

describe('meetings', () => {
  test('should let any player call one meeting a game and pull everyone in', async () => {
    const t = await playing();
    t.st().recap = { round: 1, lines: ['The glove was found.'], open: ['Who wore it?'] };
    const ends = t.st().phaseEndsAt;
    await t.app.callMeeting(t.tokens[1], 'Someone burned the ledger!');
    const m = t.app.playerView(t.tokens[0]).meeting;
    assert.equal(m.by, 'Character 2');
    assert.equal(m.reason, 'Someone burned the ledger!');
    assert.equal(m.endsAt, 5_000 + G.MEETING_MS);
    assert.equal(t.st().phaseEndsAt, ends + G.MEETING_MS, 'the round clock waits for the meeting');
    const texts = t.st().events.map((e) => e.text);
    assert.ok(texts.includes('Meeting! Character 2 calls everyone together: "Someone burned the ledger!"'));
    assert.ok(texts.includes('Where we are now. The glove was found. Still open: Who wore it?'));
    assert.equal(t.app.playerView(t.tokens[1]).canCallMeeting, false);
    assert.equal(t.app.playerView(t.tokens[0]).canCallMeeting, false, 'not while one is on');
    await assert.rejects(t.app.callMeeting(t.tokens[0], 'Me too'), /A meeting is already on\./);
  });

  test('should hold acts and moves during a meeting, but not talk', async () => {
    const t = await playing();
    await t.app.callMeeting(t.tokens[1], '');
    t.gm.readResult = read({ acts: true });
    await t.app.ask(t.tokens[0], { kind: 'chat', text: 'I search the desk.' });
    await t.app.idle();
    assert.equal(t.gm.lastAsk.held, 'meeting');
    assert.match(t.st().threads.p1.at(-1).text, /A meeting is on: no acts until it ends\./);
    await assert.rejects(t.app.go(t.tokens[0], 'l2'), /A meeting is on\. Stay with the room until it ends\./);
  });

  test('should end at its time, or when the caller or the host ends it', async () => {
    const t = await playing();
    await t.app.callMeeting(t.tokens[1], 'Listen');
    await assert.rejects(t.app.endMeeting({ token: t.tokens[0] }), /Only the one who called it or the host can end it\./);
    await t.app.endMeeting({ token: t.tokens[1] });
    assert.equal(t.app.playerView(t.tokens[0]).meeting, null);
    assert.equal(t.st().events.at(-1).text, 'The meeting is over.');
    await t.app.callMeeting(t.tokens[0], 'Again');
    t.later(G.MEETING_MS + 1);
    await t.app.tick();
    assert.equal(t.st().meeting, null);
    assert.equal(t.app.playerView(t.tokens[2]).canCallMeeting, true);
  });

  test('should not call a meeting during a vote or a round change', () => {
    const game = gameInReading(3, 1_000, { questions: true });
    G.startPlay(game, 1_000);
    G.beginRoundVote(game, 2_000);
    assert.throws(() => G.callMeeting(game, 'p1', '', 2_100), /Not during a vote\./);
  });
});
