import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { FAIR_PLAY, CONTINUITY_SCHEMA, storyCheckPrompt } from '../server/prompts.ts';
import { applyContinuity, continuityPrompt } from '../server/continuity.ts';
import { OfferCard } from '../src/components/game/offer';
import { gameInReading, emptyAsk, makeScenario } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(4, 1_000);
  game.scenario.locations.push({ id: 'l3', name: 'Shed', public_info: 'Old', x: 50, y: 50, neighbors: [] });
  G.startPlay(game, 1_000);
  return game;
};
const clean = (game, text, actor = null) => G.dropPuppeting(game, actor, text, { others: true }).text;
const empty = { problems: [], canon_add: [], corrections: [], patches: [], offers: [], solvable: true, missing: [] };

describe('players drive their own characters', () => {
  test('should say where a player character comes from in the fair play rules', () => {
    assert.ok(FAIR_PLAY.includes("A player character's actions, words and whereabouts come only from their own card or from what that player did or said in play. Never tell anyone a player went somewhere, did, said or felt something unless it is on that player's card or in their record. If the story needs something new from a player's character, ask that player privately first; never assert it."));
  });

  test('should drop a sentence that has a player do something they never did', () => {
    const game = playing();
    assert.equal(clean(game, 'The lamp flickers. Character 2 went to the shed at eleven.'), 'The lamp flickers.');
    assert.equal(clean(game, 'Player2 was in the shed before the bell.'), '');
    assert.equal(G.dropPuppeting(game, null, 'I saw Character 2 by the shed.', { others: true, reportOnly: true }).text, '');
  });

  test("should keep it when the player's card or record backs it", () => {
    const game = playing();
    game.scenario.players[1].private_info = 'You waited in the shed for the letter.';
    assert.equal(clean(game, 'Character 2 went to the shed at eleven.'), 'Character 2 went to the shed at eleven.');
    const other = playing();
    other.state.threads.p2.push({ from: 'you', kind: 'question', text: 'I sneak over to the shed.', at: 1_500 });
    assert.equal(clean(other, 'I saw Character 2 by the shed.'), 'I saw Character 2 by the shed.');
  });

  test('should drop gestures of other players in ripples and answers', () => {
    const game = playing();
    assert.equal(clean(game, 'Ben drops a cup. Player3 flinches.'), 'Ben drops a cup.');
    G.beginAsk(game, 'p1', { kind: 'question', text: 'I bang the table.' });
    G.completeAsk(game, 'p1', { ...emptyAsk, lines: [{ speaker: '', text: 'You bang the table.' }, { speaker: '', text: 'Character 3 flinches at the noise.' }], public_event: 'Player2 jumps back from the table.' }, 2_000);
    assert.deepEqual(game.state.threads.p1.at(-1).lines.map((l) => l.text), ['You bang the table.']);
    assert.ok(!game.state.events.some((e) => e.kind === 'ripple'));
  });

  test('should send a story need to the player as a private offer, and only let others mention it after the player answers', () => {
    const game = playing();
    applyContinuity(game, { ...empty, offers: [{ player_id: 'p2', text: 'The story needs to know where you were at 11.', choice: 'By the shed' }, { player_id: 'zz', text: 'x', choice: 'y' }] }, 2_000);
    const offers = G.playerView(game, 'p2', 2_000).offers;
    assert.deepEqual(offers.map((o) => [o.text, o.choice]), [['The story needs to know where you were at 11.', 'By the shed']]);
    assert.deepEqual(G.playerView(game, 'p3', 2_000).offers, []);
    assert.ok(!JSON.stringify(G.tableView(game, 2_000)).includes('where you were at 11'));
    assert.equal(G.snapshotForGM(game).offers_waiting.length, 1);
    assert.equal(clean(game, 'Character 2 was by the shed at 11.'), '');
    G.answerOffer(game, 'p2', offers[0].id, { take: true }, 3_000);
    assert.equal(clean(game, 'Character 2 was by the shed at 11.'), 'Character 2 was by the shed at 11.');
    assert.deepEqual(G.playerView(game, 'p2', 3_000).offers, []);
    assert.throws(() => G.answerOffer(game, 'p2', offers[0].id, { take: true }, 3_000), /already answered/);
    const own = playing();
    applyContinuity(own, { ...empty, offers: [{ player_id: 'p2', text: 'Where were you at 11?', choice: 'By the shed' }] }, 2_000);
    G.answerOffer(own, 'p2', G.playerView(own, 'p2').offers[0].id, { take: false, text: 'In the kitchen, washing cups.' }, 3_000);
    assert.equal(own.state.threads.p2.at(-1).text, 'In the kitchen, washing cups.');
    assert.equal(clean(own, 'Character 2 was by the shed at 11.'), '');
  });

  test('should list unbacked player facts as continuity problems', () => {
    assert.ok(CONTINUITY_SCHEMA.properties.problems.items.properties.kind.enum.includes('agency'));
    assert.deepEqual(Object.keys(CONTINUITY_SCHEMA.properties.offers.items.properties), ['player_id', 'text', 'choice']);
    const game = playing();
    game.state.threads.p2.push({ from: 'you', kind: 'question', text: 'MY-OWN-MOVE', at: 1_500 });
    const prompt = continuityPrompt(game);
    assert.match(prompt, /List any text that has a player doing something they never did/);
    assert.match(prompt, /PLAYER FACTS/);
    assert.ok(prompt.includes('MY-OWN-MOVE'));
    assert.match(storyCheckPrompt(makeScenario(3)), /8\. Every fact about what a player character did, said or where they were is on that player's own card\./);
  });

  test('should show an offer on the phone with the suggested answer and a way to say it differently', () => {
    const html = renderToStaticMarkup(<OfferCard offer={{ id: 'o1', text: 'The story needs to know where you were at 11.', choice: 'By the shed' }} onAnswer={() => {}} />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /Only you see this/);
    assert.match(html, /The story needs to know where you were at 11\./);
    assert.match(html, /By the shed/);
    assert.match(html, /Say it my way/);
  });
});
