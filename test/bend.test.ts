import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { applyBend, bendPrompt, culpritCanChange } from '../server/bend.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { gameInReading, FakeGM, emptyAsk } from './fixtures.ts';

function playing() {
  const game = gameInReading(3);
  G.startPlay(game, 2_000);
  return game;
}
const agree = [{ fact: 'The butler serves drinks.', agrees: true }, { fact: 'A glove was torn.', agrees: true }];
const find = { finds: ['a wet cuff on the butler'] };

describe('the world bends so a narrated find can be true', () => {
  test('should rewrite a GM character secret nobody has heard, and keep the new fact as canon', () => {
    const game = playing();
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [{ path: 'npcs.0.secrets', value: 'He went out to the well at nine and got his cuffs wet.' }], canon_add: [{ fact: 'The butler went to the well at nine.', about: ['n1'], public: false }], new_clue: null }, 3_000);
    assert.equal(out, 'bent');
    assert.match(game.scenario.npcs[0].secrets, /well at nine/);
    assert.ok(game.state.canon.some((c) => /well at nine/.test(c.fact)));
  });

  test('should refuse when any known fact would stop being true', () => {
    const game = playing();
    const before = game.scenario.npcs[0].secrets;
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: [agree[0], { fact: 'The butler never left the hall.', agrees: false }], patches: [{ path: 'npcs.0.secrets', value: 'NEW' }], canon_add: [], new_clue: null }, 3_000);
    assert.equal(out, 'kept');
    assert.equal(game.scenario.npcs[0].secrets, before);
  });

  test('should never drop a sentence of a GM character the room has already heard', () => {
    const game = playing();
    game.scenario.npcs[0].knows = 'He locked the cellar at eight. He saw a light in the garden.';
    G.addEvent(game, 'The Butler says he locked the cellar at eight.', 'qa', 2_500);
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [{ path: 'npcs.0.knows', value: 'He saw nothing all night.' }], canon_add: [], new_clue: null }, 3_000);
    assert.equal(out, 'kept');
    assert.match(game.scenario.npcs[0].knows, /locked the cellar at eight/);
  });

  test('should place a new find where the player stands, open now', () => {
    const game = playing();
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [], canon_add: [], new_clue: { name: 'Wet cuff', shows: 'The butler\'s left cuff is wet with well water.' } }, 3_000);
    assert.equal(out, 'bent');
    const clue = game.scenario.clues.at(-1);
    assert.equal(clue.name, 'Wet cuff');
    assert.equal(clue.where, G.currentPlace(game, 'p2'));
    assert.ok(G.openClues(game).includes(clue.id));
  });

  test('should never write a new find that names the culprit', () => {
    const game = playing();
    const count = game.scenario.clues.length;
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [], canon_add: [], new_clue: { name: 'Note', shows: 'Character 1 did it.' } }, 3_000);
    assert.equal(out, 'kept');
    assert.equal(game.scenario.clues.length, count);
  });

  test('should keep the world as it was for keep or no', () => {
    const game = playing();
    const copy = structuredClone(game.scenario);
    assert.equal(applyBend(game, 'p2', find, { mode: 'keep', known_facts: [], patches: [{ path: 'npcs.0.secrets', value: 'X' }], canon_add: [], new_clue: null }, 3_000), 'kept');
    assert.deepEqual(game.scenario, copy);
  });
});

describe('who did it may change only while nobody knows', () => {
  test('should not let it change while a culprit player knows what they did', () => {
    const game = playing();
    assert.equal(culpritCanChange(game), false);
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [{ path: 'truth.motive', value: 'A new motive.' }], canon_add: [], new_clue: null }, 3_000);
    assert.equal(out, 'kept');
    assert.equal(game.scenario.truth.motive, 'MOTIVE');
  });

  test('should let it change while the only culprit player does not know, if nothing breaks', () => {
    const game = playing();
    game.scenario.players[0].unaware = true;
    assert.equal(culpritCanChange(game), true);
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [{ path: 'truth.motive', value: 'A new motive.' }], canon_add: [], new_clue: null }, 3_000);
    assert.equal(out, 'bent');
    assert.equal(game.scenario.truth.motive, 'A new motive.');
  });

  test('should undo a change of culprit that leaves loose ends', () => {
    const game = playing();
    game.scenario.players[0].unaware = true;
    const out = applyBend(game, 'p2', find, { mode: 'bend', known_facts: agree, patches: [{ path: 'truth.culprit_ids', value: '["n1"]' }], canon_add: [], new_clue: null }, 3_000);
    assert.equal(out, 'kept');
    assert.deepEqual(game.scenario.truth.culprit_ids, ['p1']);
  });

  test('should not let it change once the culprit player has woken', () => {
    const game = playing();
    game.scenario.players[0].unaware = true;
    game.state.awakened = { p1: true };
    assert.equal(culpritCanChange(game), false);
  });

  test('should tell the GM whether who did it may change', () => {
    const game = playing();
    assert.match(bendPrompt(game, 'p2', find), /CULPRIT CAN CHANGE: no/);
    game.scenario.players[0].unaware = true;
    assert.match(bendPrompt(game, 'p2', find), /CULPRIT CAN CHANGE: yes/);
  });
});

describe('the app bends the world before it answers', () => {
  test('should ask for the bend first, then answer the move in the bent world', async () => {
    const order: string[] = [];
    class GM2 extends FakeGM {
      read() { return Promise.resolve({ kind: 'question', target: 'the cuff', place: '', attempt: 'looks', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], finds: ['a wet cuff'], acts: true, goes_to: '' }); }
      bend() { order.push('bend'); return Promise.resolve({ mode: 'bend', known_facts: agree, patches: [{ path: 'npcs.0.secrets', value: 'He went to the well.' }], canon_add: [], new_clue: null }); }
      answer(game) { order.push(`answer:${game.scenario.npcs[0].secrets}`); return Promise.resolve(emptyAsk); }
    }
    const app = await new App({ gm: new GM2(), store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await app.join({ name }));
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await app.start(app.game.hostToken);
    await app.ask(tokens[1], { kind: 'chat', text: 'I look at his cuff and find it wet' });
    await app.idle();
    assert.deepEqual(order, ['bend', 'answer:He went to the well.']);
  });

  test('should still answer when the bend fails', async () => {
    let answered = false;
    class GM3 extends FakeGM {
      read() { return Promise.resolve({ kind: 'question', target: '', place: '', attempt: 'looks', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], finds: ['a wet cuff'], acts: true, goes_to: '' }); }
      bend() { return Promise.reject(new Error('no')); }
      answer() { answered = true; return Promise.resolve(emptyAsk); }
    }
    const app = await new App({ gm: new GM3(), store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await app.join({ name }));
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await app.start(app.game.hostToken);
    await app.ask(tokens[1], { kind: 'chat', text: 'I find a wet cuff' });
    await app.idle();
    assert.equal(answered, true);
  });
});
