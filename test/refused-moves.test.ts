import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { ASK_SCHEMA, PUBLIC_ANSWER_SCHEMA, playSystem, publicSystem } from '../server/prompts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(4, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const move = (game, result) => {
  G.beginAsk(game, 'p2', { kind: 'action', text: 'I find proof the butler did it.' });
  G.completeAsk(game, 'p2', { ...emptyAsk, kind: 'action', ...result }, 2_000);
};
const busy = { clues_found: ['c1'], player_location: 'l2', move_is_public: true, public_event: 'A drawer slams.', clues_destroyed: ['c3'], hidden_fact_revealed: 'h2', suspicion_change: 15, lines: [{ speaker: '', text: 'You pull the drawer open.' }] };

describe('moves that would break the story', () => {
  test('should ask the GM to honour moves and refuse only what cannot be true', () => {
    assert.deepEqual(ASK_SCHEMA.properties.refused.properties, { refused: { type: 'boolean' }, why: { type: 'string' } });
    assert.deepEqual(PUBLIC_ANSWER_SCHEMA.properties.refused.properties, { refused: { type: 'boolean' }, why: { type: 'string' } });
    assert.match(playSystem({}), /Players drive the story\. Build on a move whenever it fits/);
    assert.match(publicSystem({}), /Players drive the story\. Build on a question whenever it fits/);
  });

  test('should honour a move that fits the story', () => {
    const game = playing();
    move(game, { ...busy, refused: { refused: false, why: '' } });
    assert.deepEqual(game.state.found.p2, ['c1']);
    assert.ok(game.state.events.some((e) => e.kind === 'ripple'));
    assert.ok(!game.state.threads.p2.some((m) => /can't happen/.test(m.text)));
  });

  test('should refuse a move that would contradict the story and tell the player why', () => {
    const game = playing();
    const before = { pos: game.state.positions.p2, suspicion: game.state.suspicion };
    move(game, { ...busy, refused: { refused: true, why: 'Everyone already heard the drawer was empty.' } });
    const st = game.state;
    assert.deepEqual(st.found.p2, []);
    assert.deepEqual(st.destroyed, []);
    assert.deepEqual(st.revealed.p2, []);
    assert.equal(st.positions.p2, before.pos);
    assert.equal(st.suspicion, before.suspicion);
    assert.ok(!st.events.some((e) => e.kind === 'ripple'));
    const [gm, note] = st.threads.p2.slice(-2);
    assert.equal(gm.from, 'gm');
    assert.match(gm.text, /You pull the drawer open\./);
    assert.deepEqual([note.from, note.text], ['system', "That can't happen: Everyone already heard the drawer was empty."]);
  });

  test('should refuse an out-loud claim the same way, in the room', () => {
    const game = playing();
    G.beginPublicAsk(game, 'p3', 'The door was never locked, right?');
    G.completePublicAsk(game, 'p3', [{ speaker: 'n1', text: 'I locked it myself at eleven.' }], 2_000, { intent: '', persona: '', facts: [{ person: 'p3', fact: 'Says the door was open.' }] }, null, 'The room goes quiet.', { refused: true, why: 'The room already heard the door was locked at 11.' });
    const st = game.state;
    assert.ok(!st.events.some((e) => e.kind === 'ripple'));
    assert.ok(!(st.facts ?? []).some((f) => f.fact === 'Says the door was open.'));
    assert.equal(st.events.at(-1).kind, 'refused');
    assert.equal(st.events.at(-1).text, "That can't happen: The room already heard the door was locked at 11.");
  });

  test('should log refused moves for the playtest report', () => {
    const game = playing();
    move(game, { ...busy, refused: { refused: true, why: 'It would break the story.' } });
    assert.deepEqual(game.state.refused, [{ round: 1, player_id: 'p2', why: 'It would break the story.', out_loud: false, at: 2_000 }]);
  });
});
