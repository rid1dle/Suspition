import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM } from './fixtures.ts';
import { GoConfirm } from '../src/components/game/go-confirm';

const tick = () => new Promise((r) => setTimeout(r, 5));
const move = (place) => ({ kind: 'question', target: '', place, attempt: 'looks at the desk', said_aloud: '', out_of_world: false, sways_gm: false, claims: [] });

// Players: p1 starts in the Ballroom (l1), p2 in the Kitchen (l2).
async function playing() {
  const gm = new FakeGM();
  const app = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
  const tokens = [];
  for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await app.join({ name }));
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic', questions: 3 });
  await app.idle();
  await app.start(app.game.hostToken);
  await app.idle();
  return { app, gm, tokens, view: (i) => app.playerView(tokens[i]), events: () => app.game.state.events.filter((e) => e.kind === 'move').map((e) => e.text) };
}

describe('going places', () => {
  test('should move a character tapped onto a place and tell everyone', async () => {
    const t = await playing();
    await t.app.go(t.tokens[1], 'l1');
    assert.equal(t.app.game.state.at.p2, 'l1');
    assert.equal(t.app.game.state.positions.p2, 'l1');
    assert.deepEqual(t.events(), ['Character 2 goes to the Ballroom.']);
    await assert.rejects(() => t.app.go(t.tokens[1], 'l1'), /already in the Ballroom/);
  });

  test('should ask first when a private move would take the character somewhere else', async () => {
    const t = await playing();
    t.gm.readResult = move('the Ballroom');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go and look at the desk in the ballroom' });
    await tick();
    assert.deepEqual(t.view(1).moveConfirm, { place: 'Ballroom', from: 'private' });
    assert.ok(!t.gm.calls.includes('answer'));
    await t.app.confirmMove(t.tokens[1], true);
    await t.app.idle();
    assert.deepEqual(t.events(), ['Character 2 goes to the Ballroom to check something.']);
    assert.equal(t.view(1).moveConfirm, null);
    assert.ok(t.gm.calls.includes('answer'));
  });

  test('should answer where the player stands when they say Not now', async () => {
    const t = await playing();
    t.gm.readResult = move('Ballroom');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom' });
    await tick();
    await t.app.confirmMove(t.tokens[1], false);
    await t.app.idle();
    assert.equal(t.app.game.state.at.p2, 'l2');
    assert.deepEqual(t.events(), []);
    assert.ok(t.gm.calls.includes('answer'));
    assert.match(t.gm.lastAsk.read.attempt, /chose not to go anywhere/);
  });

  test('should ask first for a question out loud too', async () => {
    const t = await playing();
    t.gm.readResult = move('Ballroom');
    await t.app.askPublic(t.tokens[1], 'I walk to the ballroom and ask who left the glove');
    await tick();
    assert.deepEqual(t.view(1).moveConfirm, { place: 'Ballroom', from: 'out loud' });
    await t.app.confirmMove(t.tokens[1], true);
    await t.app.idle();
    assert.deepEqual(t.events(), ['Character 2 goes to the Ballroom to check something.']);
    assert.ok(t.gm.calls.includes('public'));
  });

  test('should not ask when the move stays in the same place or names no known place', async () => {
    const t = await playing();
    t.gm.readResult = move('kitchen');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I search the kitchen' });
    await t.app.idle();
    t.gm.readResult = move('the moon');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I fly to the moon' });
    await t.app.idle();
    assert.equal(t.gm.calls.filter((c) => c === 'answer').length, 2);
    assert.deepEqual(t.events(), []);
  });

  test('should show the go card with Go and Not now', () => {
    const html = renderToStaticMarkup(<GoConfirm place="Ballroom" onAnswer={() => {}} />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /Go to the Ballroom\?/);
    assert.match(html, /Everyone will see you go\./);
    assert.match(html, /\bGo\b/);
    assert.match(html, /Not now/);
  });
});

describe('the briefing explains moving', () => {
  test('should tell everyone how to go somewhere', async () => {
    const t = await playing();
    const { briefingSteps } = await import('../server/game.ts');
    assert.ok(briefingSteps(t.app.game).at(-1).lines.includes('To look somewhere, go there: tap a place on your map. Everyone sees where you go, not why.'));
  });
  test('should keep the character where they went after a confirmed move when the GM names no new place', async () => {
    const t = await playing();
    t.gm.readResult = move('Ballroom');
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom and look at the desk.' });
    for (let i = 0; i < 20 && !t.app.game.state.moveConfirm?.p2; i += 1) await tick();
    await t.app.confirmMove(t.tokens[1], true);
    await t.app.idle();
    assert.equal(t.app.game.state.at.p2, 'l1');
    assert.equal(t.view(1).here, 'Ballroom');
  });
});
