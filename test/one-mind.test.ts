import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { playSystem } from '../server/prompts.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { gameInReading, FakeGM, emptyAsk } from './fixtures.ts';

function playing() {
  const game = gameInReading(3);
  G.startPlay(game, 2_000);
  return game;
}

describe('a GM character is in one place and one conversation at a time', () => {
  test('should tell the GM who a character is talking with right now, where, and what they last said', () => {
    const game = playing();
    game.state.threads.p1.push({ from: 'gm', text: 'x', lines: [{ speaker: 'The Butler', text: 'Leave that machine alone.' }], at: 10_000 });
    const now = G.snapshotForGM(game).gm_characters_now;
    const butler = now.find((n) => n.name === 'The Butler');
    assert.equal(butler.talking_with, 'Player1, privately');
    assert.equal(butler.last_line, 'Leave that machine alone.');
    assert.equal(butler.place, 'Kitchen');
  });

  test('should say a character is free when their last talk is long past', () => {
    const game = playing();
    game.state.threads.p1.push({ from: 'gm', text: 'x', lines: [{ speaker: 'The Butler', text: 'Old words.' }], at: 10_000 });
    G.addEvent(game, 'Much later.', 'event', 10_000 + 10 * 60_000);
    const butler = G.snapshotForGM(game).gm_characters_now.find((n) => n.name === 'The Butler');
    assert.equal(butler.talking_with, '');
  });

  test('should tell the GM a character speaks only where they are, and carries on a talk already going', () => {
    const p = playSystem(gameInReading(3).scenario, 3);
    assert.match(p, /one place and one conversation at a time/);
  });
});

describe('two answers about the same GM character never run at once', () => {
  async function app(gm) {
    const a = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await a.join({ name }));
    await a.setup(a.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await a.idle();
    await a.start(a.game.hostToken);
    return { a, tokens };
  }
  const readOf = (target) => ({ kind: 'question', target, place: '', attempt: `asks ${target}`, said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: false, goes_to: '' });

  test('should wait for the first answer with the Butler before writing the second', async () => {
    const log: string[] = [];
    let release;
    const first = new Promise((r) => { release = r; });
    class GM2 extends FakeGM {
      read(game, pid) { return Promise.resolve(readOf('The Butler')); }
      async answer(game, pid) {
        log.push(`start ${pid}`);
        if (pid === 'p1') await first;
        log.push(`end ${pid}`);
        return emptyAsk;
      }
    }
    const { a, tokens } = await app(new GM2());
    await a.ask(tokens[0], { kind: 'chat', text: 'Butler, what did you see?' });
    await a.ask(tokens[1], { kind: 'chat', text: 'Butler, where were you?' });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(log, ['start p1']);
    release();
    await a.idle();
    assert.deepEqual(log, ['start p1', 'end p1', 'start p2', 'end p2']);
  });

  test('should let answers about different GM characters run side by side', async () => {
    const log: string[] = [];
    let release;
    const first = new Promise((r) => { release = r; });
    class GM3 extends FakeGM {
      read(game, pid) { return Promise.resolve(readOf(pid === 'p1' ? 'The Butler' : 'The Widow')); }
      async answer(game, pid) {
        log.push(`start ${pid}`);
        if (pid === 'p1') await first;
        return emptyAsk;
      }
    }
    const { a, tokens } = await app(new GM3());
    a.game.state.positions.p1 = 'l1';
    a.game.state.positions.p2 = 'l1';
    a.game.state.at = { p1: 'l1', p2: 'l1' };
    a.game.state.positions.n1 = 'l2';
    a.game.state.positions.n2 = 'l2';
    await a.ask(tokens[0], { kind: 'chat', text: 'Butler?' });
    await a.ask(tokens[1], { kind: 'chat', text: 'Widow?' });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(log.sort(), ['start p1', 'start p2']);
    release();
    await a.idle();
  });
});

describe('a question out loud to a GM character waits for their private talk to end', () => {
  test('should answer the room only after the Butler finished answering a player in private', async () => {
    const log: string[] = [];
    let release;
    const first = new Promise((r) => { release = r; });
    class GM4 extends FakeGM {
      read(game, pid, text, mode) { return Promise.resolve({ kind: mode === 'public' ? 'say' : 'question', target: 'The Butler', place: '', attempt: 'asks the Butler', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: false, goes_to: '' }); }
      async answer() { log.push('private start'); await first; log.push('private end'); return emptyAsk; }
      publicAnswer() { log.push('public'); return Promise.resolve({ answer: 'He shrugs.' }); }
    }
    const a = await new App({ gm: new GM4(), store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await a.join({ name }));
    await a.setup(a.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await a.idle();
    await a.start(a.game.hostToken);
    await a.ask(tokens[0], { kind: 'chat', text: 'Butler, a word?' });
    await new Promise((r) => setTimeout(r, 10));
    await a.askPublic(tokens[1], 'The Butler, where were you?');
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(log, ['private start']);
    release();
    await a.idle();
    assert.deepEqual(log, ['private start', 'private end', 'public']);
  });
});
