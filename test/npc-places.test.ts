import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { ASK_SCHEMA, PUBLIC_ANSWER_SCHEMA, playSystem } from '../server/prompts.ts';
import { gameInReading, makeScenario, FakeGM, emptyAsk } from './fixtures.ts';

// In all three chaos playtests a GM character walked off in one answer and was back where they
// started in the next, then had to say "I spoke wrong". Where they go is now kept.
describe('a GM character who walks off is somewhere else afterwards', () => {
  test('should ask every answer which GM characters moved, and where to', () => {
    assert.ok(ASK_SCHEMA.properties.gm_characters_moved);
    assert.ok(PUBLIC_ANSWER_SCHEMA.properties.gm_characters_moved);
    assert.match(playSystem(makeScenario(4)), /gm_characters_moved: every GM character who goes somewhere else/);
  });

  test('should keep where a GM character went in a private answer, and ignore unknown people and places', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.beginAsk(game, 'p2', { kind: 'question', text: 'Butler, come with me to the ballroom.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, gm_characters_moved: [{ character_id: 'n1', location_id: 'l1' }, { character_id: 'p3', location_id: 'l1' }, { character_id: 'n2', location_id: 'l9' }] }, 2_000);
    assert.equal(game.state.positions.n1, 'l1');
    assert.equal(game.state.positions.p3, game.scenario.players[2].start_location);
    assert.notEqual(game.state.positions.n2, 'l9');
    assert.equal(G.gmCharactersNow(game).find((x) => x.name === 'The Butler').place, 'Ballroom');
  });

  test('should keep where a GM character went in an answer out loud', async () => {
    const gm = new FakeGM();
    gm.publicAnswer = async () => ({ lines: [{ speaker: 'n1', text: 'I will wait in the ballroom.' }], gm_characters_moved: [{ character_id: 'n1', location_id: 'l1' }] });
    const app = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['A', 'B', 'C']) tokens.push(await app.join({ name }));
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await app.start(app.game.hostToken);
    await app.idle();
    await app.askPublic(tokens[0], 'Butler, where will you be?');
    await app.idle();
    assert.equal(app.game.state.positions.n1, 'l1');
  });
});
