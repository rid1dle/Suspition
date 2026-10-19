import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { playSystem, ASK_SCHEMA } from '../server/prompts.ts';
import { rulesLines } from '../src/lib/rules.ts';
import { RoundCard } from '../src/components/game/round.tsx';
import { gameInReading } from './fixtures.ts';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const playing = (n: number, opts = { questions: true }) => {
  const game = gameInReading(n, 1_000, opts);
  G.startPlay(game, 1_000);
  return game;
};

describe('no clock when one or two people play', () => {
  test('should run a round with no end time for 1 or 2 players, and keep the clock for 3', () => {
    assert.equal(playing(1).state.phaseEndsAt, null);
    assert.equal(playing(2).state.phaseEndsAt, null);
    assert.ok(playing(3).state.phaseEndsAt > 1_000);
  });

  test('should ignore +5 minutes when there is no clock', () => {
    const game = playing(1);
    G.extendPhase(game, 2_000);
    assert.equal(game.state.phaseEndsAt, null);
  });

  test('should keep the next round untimed too', () => {
    const game = playing(1);
    game.state.roundResults = [{ phase: 0 }];
    G.beginPhaseChange(game);
    G.completePhase(game, { public_event: 'Something.' }, 5_000);
    assert.equal(game.state.phaseEndsAt, null);
  });

  test('should let a player alone answer the round question whenever they want', () => {
    const game = playing(1);
    assert.equal(G.askVote(game, 'p1', 2_000), 'started');
    assert.ok(game.state.roundVote);
  });

  test('should let a player move on from a round that has no question, since no clock will end it', () => {
    const game = playing(1, { questions: false });
    assert.equal(G.askVote(game, 'p1', 2_000), 'moveon');
    assert.equal(game.state.phaseEndsAt, 2_000);
  });

  test('should still refuse to move on early in a timed game with no question', () => {
    const game = playing(3, { questions: false });
    assert.throws(() => G.askVote(game, 'p1', 2_000), /no question/);
  });

  test('should give two players the planned question when the GM asked for a spotlight', () => {
    const game = playing(2);
    game.scenario.phases[0].vote_kind = 'spotlight';
    assert.equal(G.roundQuestion(game, 0).question, 'QUESTION-1');
  });
});

describe('the GM says when you have found enough to answer', () => {
  test('should ask the GM whether this player can now answer the round question', () => {
    assert.ok(ASK_SCHEMA.properties.round_ready);
  });

  test('should tell the player in their chat, once, that they can answer now', () => {
    const game = playing(1);
    game.state.pending.p1 = { kind: 'chat', text: 'I read the plate.', at: 1_500 };
    G.completeAsk(game, 'p1', { lines: [{ speaker: '', text: 'The plate reads 11:35.' }], round_ready: true }, 2_000);
    game.state.pending.p1 = { kind: 'chat', text: 'And again.', at: 2_500 };
    G.completeAsk(game, 'p1', { lines: [{ speaker: '', text: 'Still 11:35.' }], round_ready: true }, 3_000);
    const notes = game.state.threads.p1.filter((m: { text: string }) => /You can answer this round/.test(m.text));
    assert.equal(notes.length, 1);
    assert.equal(G.playerView(game, 'p1', 3_000).round.ready, true);
  });
});

describe('words for one or two players', () => {
  test('should tell the GM a player alone is in a role-play over chat, with no room or group', () => {
    const sys = playSystem({ title: 'x' }, 1);
    assert.match(sys, /One person plays alone/);
    assert.match(sys, /never write "the room", "the group" or "everyone"/);
    assert.doesNotMatch(playSystem({ title: 'x' }, 4), /One person plays alone/);
  });

  test('should tell the GM two players are "the two of you", not a room', () => {
    assert.match(playSystem({ title: 'x' }, 2), /Two people play together/);
  });

  test('should explain rounds without a clock to small groups', () => {
    assert.match(rulesLines({ rounds: 3, overrides: 0, hints: 2, players: 1 }).join(' '), /Answer it when you think you know\. There is no clock\./);
    assert.match(rulesLines({ rounds: 3, overrides: 0, hints: 2, players: 2 }).join(' '), /Answer it together when you both think you know\. There is no clock\./);
    assert.match(rulesLines({ rounds: 3, overrides: 0, hints: 2, players: 4 }).join(' '), /one question the group answers together/);
  });

  test('should never tell anyone that asking the GM for help costs a point', () => {
    const all = rulesLines({ rounds: 3, overrides: 0, hints: 2, players: 1 }).join(' ');
    assert.doesNotMatch(all, /talking to the GM about the game/);
    assert.match(all, /Asking the GM for help or about the world is always free/);
  });

  test('should say "You picked" to a player alone', () => {
    const game = playing(1);
    G.beginRoundVote(game, 2_000);
    G.voteRound(game, 'p1', 1, 2_100);
    G.resolveRoundVote(game, 2_200);
    assert.match(game.state.events.at(-1).text, /^You picked: B\./);
  });

  test('should head the round card for a player alone with "When you know, answer"', () => {
    const out = text(<RoundCard round={{ objective: 'Find the gate time.', tips: [], question: 'When?', options: ['A', 'B'], who: 'solo' } as never} />);
    assert.match(out, /When you know, answer/);
    assert.doesNotMatch(out, /answer together/);
  });

  test('should call the case "Your case" on a solo card', () => {
    assert.equal(G.playerView(playing(1), 'p1', 2_000).card.case_label, 'Your case');
    assert.equal(G.playerView(playing(3), 'p1', 2_000).card.case_label, "The group's goal");
  });
});
