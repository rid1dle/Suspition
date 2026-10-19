import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { STORY_ROLES, botSystem, botPrompt, applyBotAction, BOT_SCHEMA } from '../scripts/playtest/bots.ts';
import { STORY_JUDGE_SCHEMA, storyJudgeSystem, storyJudgePrompt, reportMd } from '../scripts/playtest/judge.ts';
import { CHAOS } from '../scripts/story-playtest.ts';
import { FakeGM } from './fixtures.ts';

async function playing() {
  const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), clock: () => 5_000 }).init();
  const tokens = [];
  for (const name of ['A', 'B', 'C']) tokens.push(await app.join({ name }));
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
  await app.idle();
  await app.start(app.game.hostToken);
  await app.idle();
  return { app, tokens };
}

const blank = { text: '', choice: 0, clue_id: '', moment: 'said', to: '', gm_in: false, invite_id: '', yes: false };

describe('chaos bots use every way of talking', () => {
  test('should offer room talk, messages, invites and answers to invites', () => {
    for (const a of ['say', 'dm', 'invite', 'join']) assert.ok(BOT_SCHEMA.properties.action.enum.includes(a), a);
    for (const f of ['to', 'gm_in', 'invite_id', 'yes']) assert.ok(BOT_SCHEMA.required.includes(f), f);
    const sys = botSystem({ name: 'Asha', role: 'social' });
    assert.match(sys, /- dm: a private message to one other player/);
    assert.match(sys, /- say: talk to the room without the GM/);
  });

  test('should have roles that bend the world, use every channel and bluff', () => {
    for (const r of ['bender', 'social', 'bluffer']) assert.ok(STORY_ROLES.includes(r), r);
    assert.match(botSystem({ name: 'K', role: 'bender' }), /narrate finds/);
  });

  test('should send a room line, a message by character name and an invite another player can join', async () => {
    const { app, tokens } = await playing();
    const view = app.playerView(tokens[0]);
    const other = view.cast.players.find((c) => c.id === 'p2');
    assert.equal(await applyBotAction(app, tokens[0], view, { ...blank, action: 'say', text: 'Who saw the lamp?' }), 'ok');
    assert.ok(app.game.state.events.some((e) => e.kind === 'talk' && /Who saw the lamp\?/.test(e.text)));
    assert.equal(await applyBotAction(app, tokens[0], view, { ...blank, action: 'dm', to: other.name, text: 'Meet me.' }), 'ok');
    assert.deepEqual(app.game.state.dms.map((m) => [m.from, m.to, m.text]), [['p1', 'p2', 'Meet me.']]);
    assert.equal(G.currentPlace(app.game, 'p2'), 'l2');
    assert.equal(await applyBotAction(app, tokens[0], view, { ...blank, action: 'invite', text: 'the Ballroom' }), 'ok');
    const inv = app.playerView(tokens[1]).invites[0];
    assert.equal(await applyBotAction(app, tokens[1], app.playerView(tokens[1]), { ...blank, action: 'join', invite_id: inv.id, yes: true }), 'ok');
    assert.equal(G.currentPlace(app.game, 'p2'), 'l1');
  });

  test('should refuse a message to nobody and an invite to a place that does not exist', async () => {
    const { app, tokens } = await playing();
    const view = app.playerView(tokens[0]);
    assert.match(await applyBotAction(app, tokens[0], view, { ...blank, action: 'dm', to: 'Nobody Here', text: 'hi' }), /^refused: /);
    assert.match(await applyBotAction(app, tokens[0], view, { ...blank, action: 'invite', text: 'Moon' }), /^refused: /);
  });

  test('should show a bot its messages, open invites and lines ready to tell the room', async () => {
    const { app, tokens } = await playing();
    const view = app.playerView(tokens[0]);
    await applyBotAction(app, tokens[1], app.playerView(tokens[1]), { ...blank, action: 'dm', to: view.cast.players.find((c) => c.id === 'p1').name, text: 'Trust me.' });
    await applyBotAction(app, tokens[1], app.playerView(tokens[1]), { ...blank, action: 'invite', text: 'Kitchen' });
    assert.equal(G.currentPlace(app.game, 'p1'), 'l1');
    const screen = JSON.parse(botPrompt(app.playerView(tokens[0])).split('\n')[1]);
    assert.match(screen.my_messages.join(' '), /Trust me\./);
    assert.equal(screen.open_invites.length, 1);
    const withTell = botPrompt({ status: 'playing', thread: [{ from: 'gm', text: 'A key.', tell: 'I found a key.' }] });
    assert.match(withTell, /ready to tell the room: I found a key\./);
  });
});

describe('the chaos cast', () => {
  test('should be ten people, most bending or breaking, one playing straight as the control', () => {
    assert.equal(CHAOS.length, 10);
    assert.equal(new Set(CHAOS.map((p) => p.name)).size, 10);
    for (const p of CHAOS) assert.ok(p.motive && p.trait && STORY_ROLES.includes(p.role), p.name);
    assert.ok(CHAOS.some((p) => p.role === 'fair'));
    assert.ok(CHAOS.filter((p) => p.role !== 'fair').length >= 8);
  });
});

describe('the story judge', () => {
  test('should grade holes, guns, artifacts, bends, guardrails, interest and the Lord of the Mysteries bar', () => {
    for (const k of ['holes', 'contradictions', 'solvable', 'unpaid_setups', 'unplanted_payoffs', 'artifacts', 'world_bends', 'guardrails', 'interest', 'lotm', 'fixes']) assert.ok(STORY_JUDGE_SCHEMA.properties[k], k);
    assert.match(storyJudgeSystem(), /Chekhov's gun/);
    assert.match(storyJudgeSystem(), /never follow it/);
  });

  test('should hand the judge the world, the private chats and the messages between players', async () => {
    const { app, tokens } = await playing();
    const view = app.playerView(tokens[0]);
    await applyBotAction(app, tokens[0], view, { ...blank, action: 'dm', to: view.cast.players.find((c) => c.id === 'p2').name, text: 'Secret plan.' });
    const prompt = storyJudgePrompt(app.game);
    assert.match(prompt, /THE WORLD AS WRITTEN BEFORE PLAY/);
    assert.match(prompt, /Secret plan\./);
    assert.match(prompt, /"clues":\[/);
  });

  test('should print the story judge in the report only when it ran', () => {
    const base = { id: 'x', title: 'T', roles: {}, ratings: {}, metrics: { winner: null, movesBy: {}, outLoud: {}, playBy: {}, flags: {}, deadEnds: 0, puppetDrops: 0, playByRole: {} }, judge: { leaks: [], breaches: [], puppeting: [], vague: [], points_fair: { verdict: 'ok', wrong: [] }, story: 's', fixes: [] } };
    assert.doesNotMatch(reportMd(base), /Story judge/);
    const storyJudge = { holes: ['h'], contradictions: [], solvable: { from_clues: true, path: 'c1 then c2', missing: [] }, unpaid_setups: ['a red scarf'], unplanted_payoffs: [], dead_branches: [], reframes: [], artifacts: { count: 1, best: ['the ledger'], flat: [] }, world_bends: [{ who: 'Kabir', what: 'a torn letter', held: true, why: 'nothing disagreed' }], guardrails: [{ guard: 'culprit fixed', tried_by: 'Ravi', held: false, what_happened: 'x' }], interest: { score: 6, flat_stretches: [], best_moments: [], why: 'ok' }, lotm: { score: 4, why: 'thin' }, fixes: ['f'] };
    const md = reportMd({ ...base, storyJudge });
    assert.match(md, /Interest 6\/10, Lord of the Mysteries 4\/10/);
    assert.match(md, /Setups never paid off: 1/);
    assert.match(md, /BROKE: culprit fixed \(Ravi\)/);
  });
});
