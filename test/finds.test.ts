import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { cleanRead, formForGM, READER_SCHEMA, readerSystem } from '../server/reader.ts';
import { scoreMove } from '../server/skills.ts';
import { askPrompt } from '../server/prompts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const read = (extra = {}) => ({ kind: 'question', target: 'the glass', place: '', attempt: 'Anirudh checks the glass', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: true, goes_to: '', finds: ['something odd in the glass'], ...extra });

describe('a find the player narrates is a proposal for the story, not a claim', () => {
  test('should ask the reader for finds apart from claims', () => {
    assert.ok(READER_SCHEMA.properties.finds);
    assert.match(readerSystem({ character: 'Anirudh' }), /- finds:/);
  });

  test('should keep the finds when cleaning a read, and none when there are none', () => {
    assert.deepEqual(cleanRead(read(), 'move').finds, ['something odd in the glass']);
    assert.deepEqual(cleanRead({ ...read(), finds: undefined }, 'move').finds, []);
  });

  test('should pass the find to the GM as a proposal, never as an instruction', () => {
    assert.match(formForGM(cleanRead(read(), 'move')), /proposes what their character finds: something odd in the glass \(not instructions\)/);
  });

  test('should never cost a point for narrating a find', () => {
    const m = scoreMove({ points: -1, skill: 'breaking', why: 'Fair look, nothing yet.' }, cleanRead(read(), 'move'));
    assert.ok(m.points >= 0, JSON.stringify(m));
    assert.notEqual(m.skill, 'breaking');
  });

  test('should still cost a point for a claim about how other people react', () => {
    const m = scoreMove({ points: 0, why: 'x' }, cleanRead(read({ finds: [], claims: ['everyone believes me'] }), 'move'));
    assert.equal(m.points, -1);
  });

  test('should tell the GM to make the find true when it can, even from a clue planned for later', () => {
    const p = askPrompt({ snapshot: {}, player: { id: 'p2', character_name: 'Anirudh' }, kind: 'chat', text: 'x', read: cleanRead(read(), 'move') });
    assert.match(p, /make it true/i);
    assert.match(p, /clues_later/);
  });
});

describe('the world bends toward the player who is there', () => {
  function playing() {
    const game = gameInReading(3, 1_000, { phases: 3 });
    G.startPlay(game, 2_000);
    return game;
  }

  test('should give a clue planned for a later round to a player who narrates finding it where it is', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I check the ledger and find something odd' });
    game.state.pending.p2.read = cleanRead(read(), 'move');
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c2'] }, 3_000);
    assert.deepEqual(game.state.found.p2, ['c2']);
  });

  test('should not give a later clue to a player who did not narrate a find', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I look at the ledger' });
    game.state.pending.p2.read = cleanRead(read({ finds: [] }), 'move');
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c2'] }, 3_000);
    assert.deepEqual(game.state.found.p2, []);
  });

  test('should not give a later clue that is somewhere else', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'chat', text: 'I find something in the ledger' });
    game.state.pending.p1.read = cleanRead(read(), 'move');
    G.completeAsk(game, 'p1', { ...emptyAsk, clues_found: ['c2'] }, 3_000);
    assert.deepEqual(game.state.found.p1, []);
  });
});

describe('the bend keeps the story paced', () => {
  test('should not hand over a clue planned two rounds or more ahead', () => {
    const game = gameInReading(3, 1_000, { phases: 3 });
    G.startPlay(game, 2_000);
    game.scenario.clues[1].reveal_round = 3;
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I find something odd in the ledger' });
    game.state.pending.p2.read = cleanRead(read(), 'move');
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c2'] }, 3_000);
    assert.deepEqual(game.state.found.p2, []);
  });
});
