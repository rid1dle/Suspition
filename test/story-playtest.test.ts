import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { STORY_ROLES, botSystem, botPrompt, applyBotAction, BOT_SCHEMA } from '../scripts/playtest/bots.ts';
import { JUDGE_SCHEMA, judgeSystem, reportMd } from '../scripts/playtest/judge.ts';
import { runPlaytest } from '../scripts/playtest.ts';
import { PERSONAS } from '../scripts/story-playtest.ts';
import { FakeGM, gameInReading, emptyAsk } from './fixtures.ts';

describe('story playtest bots', () => {
  test('should have players who drive the story and players who contradict it', () => {
    for (const r of ['driver', 'contradictor', 'fair']) assert.ok(STORY_ROLES.includes(r), r);
  });

  test('should give each bot a motive and a human side, and the moves of the new phone', () => {
    const sys = botSystem({ name: 'Meera', role: 'driver', motive: 'Wants the room to believe the cook is guilty.', trait: 'stubborn' });
    assert.match(sys, /Your motive in this game: Wants the room to believe the cook is guilty\./);
    assert.match(sys, /Your human side: stubborn/);
    assert.match(sys, /push the story your own way/);
    assert.match(sys, /- go: walk to a place/);
    assert.match(sys, /- meeting: call everyone together/);
    assert.match(sys, /Talking in private is free/);
    for (const a of ['go', 'meeting']) assert.ok(BOT_SCHEMA.properties.action.enum.includes(a));
  });

  test('should show a bot its acts, where it is and the places it can go', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const prompt = botPrompt(G.playerView(game, 'p1', 2_000));
    assert.match(prompt, /"acts_left":3/);
    assert.match(prompt, /"places":\["Ballroom","Kitchen"\]/);
    assert.match(prompt, /"you_are_in":"Ballroom"/);
  });

  test('should walk a bot to a place and let it call a meeting', async () => {
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), clock: () => 5_000 }).init();
    const tokens = [];
    for (const name of ['A', 'B', 'C']) tokens.push(await app.join({ name }));
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await app.start(app.game.hostToken);
    await app.idle();
    const view = app.playerView(tokens[0]);
    assert.equal(await applyBotAction(app, tokens[0], view, { action: 'go', text: 'Kitchen' }), 'ok');
    assert.equal(G.currentPlace(app.game, 'p1'), 'l2');
    assert.equal(await applyBotAction(app, tokens[1], view, { action: 'meeting', text: 'Listen up' }), 'ok');
    assert.equal(app.game.state.meeting.reason, 'Listen up');
    assert.match(await applyBotAction(app, tokens[0], view, { action: 'go', text: 'Moon' }), /^refused: /);
  });

  test('should have twenty people with their own motive and human side', () => {
    assert.ok(PERSONAS.length >= 20);
    assert.equal(new Set(PERSONAS.map((p) => p.name)).size, PERSONAS.length);
    for (const p of PERSONAS) assert.ok(p.motive && p.trait && STORY_ROLES.includes(p.role), p.name);
    assert.ok(PERSONAS.filter((p) => ['driver', 'contradictor'].includes(p.role)).length >= PERSONAS.length / 2, 'most drive the story');
  });
});

describe('story playtest judge', () => {
  test('should ask the judge what the GM honoured, let in, refused and explained', () => {
    for (const k of ['honoured', 'contradictions_let_in', 'rightly_refused', 'wrongly_refused', 'refused_without_reason', 'case_complete']) assert.ok(JUDGE_SCHEMA.properties[k], k);
    const sys = judgeSystem();
    assert.match(sys, /honoured: moves where a player pushed the story/);
    assert.match(sys, /contradictions_let_in/);
  });

  test('should print the story numbers in the report', () => {
    const md = reportMd({ id: 'x', title: 'T', roles: {}, ratings: {}, metrics: { winner: null, movesBy: {}, outLoud: {}, playBy: {}, flags: {}, deadEnds: 0, puppetDrops: 0, playByRole: {} }, judge: { leaks: [], breaches: [], puppeting: [], vague: [], points_fair: { verdict: 'ok', wrong: [] }, story: 's', fixes: [], honoured: ['a'], contradictions_let_in: [], rightly_refused: ['b', 'c'], wrongly_refused: [], refused_without_reason: [], case_complete: { complete: true, why: 'All clues reachable.' } } });
    assert.match(md, /Moves honoured: 1/);
    assert.match(md, /Rightly refused: 2/);
    assert.match(md, /Case still complete: yes\. All clues reachable\./);
  });
});

describe('story playtest run', () => {
  test('should answer every move confirm so a bot walking somewhere never stalls the game', async () => {
    const out = await mkdtemp(join(tmpdir(), 'spt-'));
    const gm = new FakeGM();
    gm.readResult = { kind: 'question', target: '', place: '', goes_to: 'Kitchen', attempt: 'P walks to the kitchen', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: true };
    gm.askResult = { ...emptyAsk };
    const botCall = async ({ view }) => (view.status === 'final'
      ? { culprit_ids: [view.cast.players[0].id], how: 'x', why: 'y', goal: 'z' }
      : { action: 'private', text: 'I walk to the kitchen.', choice: 0, clue_id: '', moment: 'said' });
    const judgeCall = async () => ({ leaks: [], breaches: [], puppeting: [], vague: [], points_fair: { verdict: 'ok', wrong: [] }, story: 'ok', fixes: [], honoured: [], contradictions_let_in: [], rightly_refused: [], wrongly_refused: [], refused_without_reason: [], case_complete: { complete: true, why: '' } });
    const bots = ['A', 'B', 'C'].map((n) => ({ username: n.toLowerCase(), name: n, samples: [], role: 'driver', motive: 'm', trait: 't' }));
    const started = Date.now();
    const { app } = await runPlaytest({ gm, botCall, judgeCall, bots, outDir: out, length: 'short', actionsPerRound: 1, log: () => {} });
    assert.equal(app.game.status, 'reveal');
    assert.ok(Date.now() - started < 20_000, 'no 90 s wait on a move confirm');
    assert.ok(app.game.state.events.some((e) => e.kind === 'move'));
  });
});
