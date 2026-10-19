import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { planWatchers, generationPrompt, playSystem, scorePrompt, SCORE_SCHEMA, SCENARIO_SCHEMA } from '../server/prompts.ts';
import { storyIssues } from '../server/story.ts';
import { pointsOf, totalLine } from '../src/lib/score.ts';
import { GoalsPanel } from '../src/components/game/panels.tsx';
import { makeScenario, gameInReading } from './fixtures.ts';

const lobby = (n: number) => {
  const game = G.createGame(1_000);
  for (let i = 0; i < n; i += 1) G.addPlayer(game, { name: `P${i + 1}` });
  return game;
};
const base = { tone: 'tense', length: 'short', hints: 2 };
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

const watched = (players = 3) => {
  const game = gameInReading(players);
  const sc = game.scenario;
  sc.watchers = [{ owner: 'p2', watcher: 'p3', told: true }, { owner: 'p3', watcher: 'p2', told: false }];
  sc.players[2].watch_threat = 'Someone wants the ledger burned before dawn.';
  sc.players[2].watch_stake = 'If it burns, your debt can never be proved paid.';
  G.startPlay(game, 1_000);
  return game;
};

describe('setup: does a goal owner know someone may stop them', () => {
  test('should let the GM decide by default', () => {
    assert.equal(G.applySetup(lobby(3), base).goalWatch, 'gm');
  });

  test('should keep tell or hide, and refuse anything else', () => {
    assert.equal(G.applySetup(lobby(3), { ...base, goalWatch: 'tell' }).goalWatch, 'tell');
    assert.equal(G.applySetup(lobby(3), { ...base, goalWatch: 'hide' }).goalWatch, 'hide');
    assert.throws(() => G.applySetup(lobby(3), { ...base, goalWatch: 'maybe' }), /Pick whether players know someone may stop their goal/);
  });
});

describe('the game picks who watches whose goal', () => {
  test('should give every goal one watcher and every player one goal to watch, never their own', () => {
    const w = planWatchers({ players: 5, culprits: ['p1'], unaware: [], npcs: 3, goalWatch: 'tell' }, Math.random);
    const owners = w.map((x) => x.owner).sort();
    assert.deepEqual(owners, ['p2', 'p3', 'p4', 'p5'], 'a culprit who knows only hides; the room already watches them');
    for (const x of w) assert.notEqual(x.owner, x.watcher);
    assert.equal(new Set(w.map((x) => x.watcher)).size, w.length, 'nobody watches two goals');
    assert.ok(w.every((x) => x.told));
  });

  test('should let two players watch each other', () => {
    const w = planWatchers({ players: 2, culprits: ['n1'], unaware: [], npcs: 2, goalWatch: 'hide' }, Math.random);
    assert.deepEqual(w.map((x) => `${x.owner}<${x.watcher}`).sort(), ['p1<p2', 'p2<p1']);
    assert.ok(w.every((x) => !x.told));
  });

  test('should give a player alone a GM character as the watcher', () => {
    const w = planWatchers({ players: 1, culprits: ['n2'], unaware: [], npcs: 2, goalWatch: 'gm' }, seq(0.2));
    assert.deepEqual(w.map((x) => [x.owner, x.watcher]), [['p1', 'n1']]);
  });

  test('should count a culprit who does not know as an owner, since their goal is an innocent one', () => {
    const w = planWatchers({ players: 3, culprits: ['p1'], unaware: ['p1'], npcs: 3, goalWatch: 'gm' }, Math.random);
    assert.ok(w.some((x) => x.owner === 'p1'));
  });

  test('should sometimes tell and sometimes not when the GM decides', () => {
    const told = new Set();
    for (let i = 0; i < 40; i += 1) for (const x of planWatchers({ players: 4, culprits: ['p1'], unaware: [], npcs: 3, goalWatch: 'gm' }, Math.random)) told.add(x.told);
    assert.deepEqual([...told].sort(), [false, true]);
  });
});

describe('the world writer writes the warnings', () => {
  test('should ask for a vague threat and a stake on each watcher card, never naming the owner', () => {
    assert.ok(SCENARIO_SCHEMA.properties.players.items.properties.watch_threat);
    assert.ok(SCENARIO_SCHEMA.properties.players.items.properties.watch_stake);
    const g = lobby(3);
    G.applySetup(g, base);
    const prompt = generationPrompt(g, [], ['p1'], '', { who: 'player', unaware: [] }, [{ owner: 'p2', watcher: 'p3', told: true }]);
    assert.match(prompt, /p3 watches p2's goal/);
    assert.match(prompt, /watch_threat: what someone wants to make happen, and roughly where, never who/);
    assert.match(prompt, /watch_stake: why it would hurt the watcher/);
  });

  test('should tell the writer a GM character works against a player alone', () => {
    const g = lobby(1);
    G.applySetup(g, base);
    assert.match(generationPrompt(g, [], ['n2'], '', { who: 'npc', unaware: [] }, [{ owner: 'p1', watcher: 'n1', told: true }]), /The GM character n1 works against p1's goal/);
  });

  test('should flag a missing warning, and a warning that names the owner', () => {
    const s = makeScenario(3);
    s.watchers = [{ owner: 'p2', watcher: 'p3', told: true }, { owner: 'p3', watcher: 'p2', told: true }];
    s.players[2].watch_threat = 'Character 2 wants the ledger burned.';
    s.players[2].watch_stake = 'It hurts you.';
    const found = storyIssues(s, { players: [] }).filter((t) => t.startsWith('watch:'));
    assert.equal(found.length, 2);
    assert.match(found.join(' '), /players\[2\]\.watch_threat names the owner/);
    assert.match(found.join(' '), /players\[1\] \(p2\) watches p3's goal but has no watch_threat/);
  });
});

describe('the cards show the threat to watchers and the warning to owners who are told', () => {
  test('should give the watcher the threat and the stake, never the owner', () => {
    const card = G.playerView(watched(), 'p3', 2_000).card;
    assert.deepEqual(card.watch, { threat: 'Someone wants the ledger burned before dawn.', stake: 'If it burns, your debt can never be proved paid.' });
    assert.equal(G.playerView(watched(), 'p1', 2_000).card.watch, null);
  });

  test('should tell an owner someone may stop them only when told', () => {
    assert.equal(G.playerView(watched(), 'p2', 2_000).card.watched, true);
    assert.equal(G.playerView(watched(), 'p3', 2_000).card.watched, false);
  });

  test('should show the threat in the Goals drawer, and the warning line to a told owner', () => {
    const html = renderToStaticMarkup(React.createElement(GoalsPanel, { goal: 'Burn the ledger.', watch: { threat: 'Someone wants the will torn up.', stake: 'Your share goes with it.' }, watched: true } as never)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /Stop it: Someone wants the will torn up\. Your share goes with it\./);
    assert.match(html, /Someone may try to stop you\./);
  });

  test('should hand the GM who works against whose goal, with how a watcher blocks it', () => {
    assert.deepEqual(G.snapshotForGM(watched()).goal_watchers, [{ owner: 'p2', watcher: 'p3', told: true }, { owner: 'p3', watcher: 'p2', told: false }]);
    assert.match(playSystem({ title: 'x' }), /goal_watchers: who works against whose goal/);
  });
});

describe('the end: guessing who, and a point for stopping it', () => {
  test('should take the watcher guess with the final answer', () => {
    const game = watched();
    game.status = 'final';
    G.submitFinal(game, 'p3', { culprit_ids: ['p1'], watch_guess: 'p2' });
    assert.equal(game.state.submissions.p3.watch_guess, 'p2');
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'], watch_guess: 'nobody' });
    assert.equal(game.state.submissions.p2.watch_guess, '');
  });

  test('should ask the scorer whether each watcher stopped the goal', () => {
    assert.ok(SCORE_SCHEMA.properties.players.items.properties.stopped);
    assert.match(scorePrompt({ snapshot: {}, submissions: {}, verdict: {} }), /stopped: true only when the goal they watched did not happen and the record shows they acted against it/);
  });

  test('should add a point for stopping it, and count it in the total', () => {
    const game = watched();
    game.status = 'final';
    for (const p of game.players) G.submitFinal(game, p.id, { culprit_ids: ['p1'], watch_guess: p.id === 'p3' ? 'p2' : '' });
    G.applyScore(game, G.computeVerdict(game), { reveal_story: 'x', players: [{ player_id: 'p3', method_score: 0, motive_score: 0, goal_achieved: false, goal_outcome: '', comment: '', coaching: '', stopped: true }] });
    const p3 = game.state.result.players.find((p: { player_id: string }) => p.player_id === 'p3');
    assert.equal(p3.stopped, true);
    assert.equal(p3.watch_guess_right, true);
    assert.equal(p3.max, 7);
    assert.equal(pointsOf(p3), 2);
    assert.match(totalLine(p3), /Case 2\/7/);
    const p1 = game.state.result.players.find((p: { player_id: string }) => p.player_id === 'p1');
    assert.equal(p1.max, 6);
    assert.match(totalLine(p1), /\/6/);
  });
});

describe('the screens for watchers', () => {
  const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  test('should ask the watcher on the final form who was behind the threat', async () => {
    const { Final } = await import('../src/app/play/endgame.tsx');
    const game = watched();
    game.status = 'final';
    const out = text(React.createElement(Final, { view: G.playerView(game, 'p3', 2_000) } as never));
    assert.match(out, /Who was behind it\? Someone wants the ledger burned before dawn\./);
    assert.doesNotMatch(text(React.createElement(Final, { view: G.playerView(game, 'p1', 2_000) } as never)), /Who was behind it/);
  });

  test('should show Stopped on the phone reveal for a watcher', async () => {
    const { Reveal } = await import('../src/app/play/endgame.tsx');
    const game = watched();
    game.status = 'final';
    for (const p of game.players) G.submitFinal(game, p.id, { culprit_ids: ['p1'] });
    G.applyScore(game, G.computeVerdict(game), { reveal_story: 'x', players: [{ player_id: 'p3', stopped: true }] });
    assert.match(text(React.createElement(Reveal, { view: G.playerView(game, 'p3', 2_000) } as never)), /Stopped ✓/);
    assert.doesNotMatch(text(React.createElement(Reveal, { view: G.playerView(game, 'p1', 2_000) } as never)), /Stopped/);
  });

  test('should offer the setting under More options, with the GM deciding by default', async () => {
    const { Setup } = await import('../src/app/table/setup.tsx');
    const view = { status: 'lobby', players: Array.from({ length: 3 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })), surprise: null };
    const html = renderToStaticMarkup(React.createElement(Setup, { view, host: true, act: async () => null, onNewGame: () => {} } as never));
    const more = html.split('data-more-options')[1];
    assert.match(more, /Do players know someone may stop their goal\?/);
    for (const t of ['Let the GM decide', 'Tell them', 'Keep it secret']) assert.ok(more.includes(t), t);
  });

  test('should explain the stopping point in the rules', async () => {
    const { rulesLines } = await import('../src/lib/rules.ts');
    assert.match(rulesLines({ rounds: 3, overrides: 2, hints: 2, players: 3 }).join(' '), /1 for stopping the threat you watch/);
  });
});
