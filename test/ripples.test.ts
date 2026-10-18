import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { playSystem, publicSystem, PUBLIC_ANSWER_SCHEMA } from '../server/prompts.ts';
import { feedItem } from '../src/lib/feed.ts';
import { tableSound } from '../src/lib/alerts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const playing = (players = 4) => {
  const game = gameInReading(players, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const move = (game, pid, ripple, now) => {
  G.beginAsk(game, pid, { kind: 'action', text: 'I look around.' });
  G.completeAsk(game, pid, { ...emptyAsk, public_event: ripple }, now);
};
const ripples = (game) => game.state.events.filter((e) => e.kind === 'ripple');

describe('ripples', () => {
  test('should put a ripple from a private move on the table as its own kind', () => {
    const game = playing();
    move(game, 'p1', 'A door bangs shut somewhere upstairs.', 10_000);
    assert.deepEqual(ripples(game).map((e) => e.text), ['A door bangs shut somewhere upstairs.']);
    assert.ok(!game.state.events.some((e) => e.kind === 'event' && e.at === 10_000), 'not a loud round event');
  });

  test('should not say whose move caused a ripple', () => {
    const game = playing();
    move(game, 'p1', 'A door bangs shut upstairs.', 10_000);
    const e = ripples(game)[0];
    assert.equal(e.by, undefined);
    assert.ok(!JSON.stringify(e).includes('p1'), 'no player id in the event');
    const named = playing();
    move(named, 'p1', 'Character 1 slips into the cellar. A lamp goes out.', 10_000);
    assert.deepEqual(ripples(named).map((x) => x.text), ['A lamp goes out.'], 'the sentence naming the actor is dropped');
    const byPlayer = playing();
    move(byPlayer, 'p1', 'Player1 slips into the cellar.', 10_000);
    assert.equal(ripples(byPlayer).length, 0, 'the player name counts too');
  });

  test('should drop a second ripple from the same player within 3 minutes', () => {
    const game = playing();
    move(game, 'p1', 'A door bangs.', 10_000);
    move(game, 'p1', 'A dog barks.', 10_000 + 179_000);
    move(game, 'p1', 'A bell rings.', 10_000 + 181_000);
    assert.deepEqual(ripples(game).map((e) => e.text), ['A door bangs.', 'A bell rings.']);
  });

  test('should drop any ripple within 45 seconds of the last one on the table', () => {
    const game = playing(4);
    ['p1', 'p2', 'p3', 'p4'].forEach((pid, i) => move(game, pid, `Sound number ${i + 1}.`, 10_000 + i * 10_000));
    move(game, 'p2', 'A late sound.', 10_000 + 44_000);
    assert.deepEqual(ripples(game).map((e) => e.text), ['Sound number 1.']);
    move(game, 'p3', 'Footsteps in the hall.', 10_000 + 60_000);
    assert.deepEqual(ripples(game).map((e) => e.text), ['Sound number 1.', 'Footsteps in the hall.']);
  });

  test('should cut a ripple to 20 words', () => {
    const game = playing();
    move(game, 'p1', `${'word '.repeat(30).trim()}.`, 10_000);
    assert.ok(ripples(game)[0].text.split(/\s+/).length <= 21, 'at most 20 words plus an ellipsis');
  });

  test('should take a ripple from a question asked out loud', () => {
    const game = playing();
    G.beginPublicAsk(game, 'p2', 'Where is the key?');
    G.completePublicAsk(game, 'p2', 'Nobody has seen it.', 10_000, null, null, 'The cook stops stirring and looks at the door.');
    assert.deepEqual(ripples(game).map((e) => e.text), ['The cook stops stirring and looks at the door.']);
    assert.ok(PUBLIC_ANSWER_SCHEMA.properties.ripple, 'the answer schema carries a ripple');
  });

  test('should play a soft sound and show ripples in the table feed', () => {
    const e = { at: 1, phase: 0, kind: 'ripple', text: 'A lamp goes out.' };
    assert.deepEqual(feedItem(e), { kind: 'ripple', text: 'A lamp goes out.' });
    const prev = { gameId: 'g', events: [] };
    assert.equal(tableSound(prev, { gameId: 'g', events: [e] }), 'soft');
  });

  test('should tell the GM to aim for a ripple in every two or three moves', () => {
    const game = playing();
    const rule = /Aim for one in every two or three moves; leave it empty when nothing would show\./;
    assert.match(playSystem(game.scenario), rule);
    assert.match(publicSystem({ title: 'x' }, []), rule);
  });

  test('should name the actor when the move was clearly seen', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'action', text: 'I drag the crate out loudly.' });
    G.completeAsk(game, 'p1', { ...emptyAsk, move_is_public: true, public_event: 'Character 1 drags a crate across the yard.' }, 10_000);
    assert.deepEqual(ripples(game).map((e) => e.text), ['Character 1 drags a crate across the yard.']);
  });

  test('should let a loud move through the 45 second gap and the 3 minute gap', () => {
    const game = playing();
    move(game, 'p1', 'A dog barks.', 10_000);
    G.beginAsk(game, 'p2', { kind: 'action', text: 'I burn the letter.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_destroyed: ['c1'], public_event: 'Smoke curls out of the stove.' }, 20_000);
    G.beginAsk(game, 'p1', { kind: 'action', text: 'I smash the lamp.' });
    G.completeAsk(game, 'p1', { ...emptyAsk, suspicion_change: 12, public_event: 'Glass shatters somewhere below.' }, 30_000);
    assert.deepEqual(ripples(game).map((e) => e.text), ['A dog barks.', 'Smoke curls out of the stove.', 'Glass shatters somewhere below.']);
  });

  test('should record every dropped ripple and why', () => {
    const game = playing();
    move(game, 'p1', 'A door bangs.', 10_000);
    move(game, 'p2', 'A dog barks.', 20_000);
    move(game, 'p1', 'A bell rings.', 100_000);
    assert.deepEqual(game.state.rippleDrops.map((d) => d.why), ['table', 'player']);
  });
});

