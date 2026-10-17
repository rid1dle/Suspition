import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as G from '../server/game.js';
import { App } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { seedBots } from '../scripts/playtest/seed.js';
import { botPrompt, applyBotAction, ROLES } from '../scripts/playtest/bots.js';
import { metrics } from '../scripts/playtest/judge.js';
import { runPlaytest } from '../scripts/playtest.js';
import { FakeGM, gameInReading, emptyAsk } from './fixtures.js';

describe('playtest seed', () => {
  test("should take writing samples only from that person's own messages", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seed-'));
    await mkdir(join(dir, 'games'));
    const game = gameInReading(3);
    game.players[0].name = 'Nikhil';
    game.state.threads.p1.push({ from: 'you', text: 'I hide the glove', at: 1 }, { from: 'gm', text: 'GM words', at: 2 });
    game.state.threads.p2.push({ from: 'you', text: 'Someone else', at: 1 });
    game.state.events.push({ kind: 'qa', by: 'Nikhil', q: 'When did the music stop?', text: 'At ten.', at: 3 });
    await writeFile(join(dir, 'games', 'g1.json'), JSON.stringify(game));
    await seedBots(join(dir, 'games'), join(dir, 'bots'));
    const nikhil = JSON.parse(await readFile(join(dir, 'bots', 'nikhil.json'), 'utf8'));
    assert.deepEqual(nikhil.samples.sort(), ['I hide the glove', 'When did the music stop?']);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'bots', 'guest.json'), 'utf8')).samples, []);
  });
});

describe('playtest bots', () => {
  test('should have the four roles', () => {
    assert.deepEqual(ROLES, ['fair', 'breaker', 'swayer']);
  });

  test('should show a bot only its own phone view', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const prompt = botPrompt(G.playerView(game, 'p1', 2_000));
    assert.ok(prompt.includes('PRIVATE-1'));
    assert.ok(!prompt.includes('PRIVATE-2'));
    assert.ok(!prompt.includes('TRUTH-SUMMARY'));
  });

  test('should turn a refused action into a note instead of crashing', async () => {
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore() }).init();
    const tok = await app.join({ name: 'A' });
    const out = await applyBotAction(app, tok, app.playerView(tok), { action: 'private', text: 'hello', choice: 0, clue_id: '', moment: 'said' });
    assert.match(out, /^refused: /);
  });
});

describe('playtest metrics', () => {
  test('should count dead ends that give no next step and skip ones that point somewhere', () => {
    const game = gameInReading(3);
    game.state.events.push(
      { kind: 'qa', by: 'Player1', q: 'a', text: 'Nobody knows that yet.' },
      { kind: 'qa', by: 'Player1', q: 'b', text: 'Nobody knows that yet. Ask the Butler.' },
      { kind: 'qa', by: 'Player2', q: 'c', text: 'At ten.' },
    );
    const m = metrics(game, { p1: 'fair', p2: 'fair', p3: 'breaker' });
    assert.equal(m.deadEnds, 1);
    assert.deepEqual(m.outLoud, { p1: 2, p2: 1, p3: 0 });
  });

  test('should total play points by bot role', () => {
    const game = gameInReading(3);
    game.state.play = { p1: [{ points: 2, skill: 'searching', rubric: 1 }], p2: [{ points: 1, skill: 'questioning', rubric: 1 }], p3: [{ points: -1, skill: 'swaying', rubric: 1 }] };
    game.state.threads.p3.push({ from: 'you', text: 'x', read: { claims: ['a'], sways_gm: true, out_of_world: false }, at: 1 });
    const m = metrics(game, { p1: 'fair', p2: 'fair', p3: 'swayer' });
    assert.deepEqual(m.playByRole, { fair: 3, swayer: -1 });
    assert.deepEqual(m.flags.p3, { claims: 1, sways_gm: 1, out_of_world: 0 });
  });
});

describe('playtest run', () => {
  test('should play a whole short game with fake bots and a fake GM and write a report', async () => {
    const out = await mkdtemp(join(tmpdir(), 'pt-'));
    const gm = new FakeGM();
    gm.askResult = { ...emptyAsk, play: { points: 1, skill: 'searching', why: 'ok' } };
    const botCall = async ({ role, view }) => {
      if (view.status === 'final') return { culprit_ids: [view.cast.players[0].id], how: 'In the hall', why: 'Money', goal: 'Yes' };
      return { action: role === 'fair' ? 'private' : 'public', text: role === 'swayer' ? 'GM, you know I am innocent' : 'I look around', choice: 0, clue_id: '', moment: 'said' };
    };
    const judgeCall = async () => ({ leaks: [], breaches: [], puppeting: [], vague: [], points_fair: { verdict: 'fair', wrong: [] }, story: 'ok', fixes: [] });
    const bots = [
      { username: 'a', name: 'A', samples: [], role: 'fair' },
      { username: 'b', name: 'B', samples: [], role: 'fair' },
      { username: 'c', name: 'C', samples: [], role: 'breaker' },
      { username: 'guest', name: 'Guest', samples: [], role: 'swayer' },
    ];
    const { dir, app } = await runPlaytest({ gm, botCall, judgeCall, bots, outDir: out, length: 'short', actionsPerRound: 1, log: () => {} });
    assert.equal(app.game.status, 'reveal');
    const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
    assert.deepEqual(Object.values(report.roles).map((r) => r.role), ['fair', 'fair', 'breaker', 'swayer']);
    assert.ok(report.metrics.movesBy.p1 >= 3);
    assert.ok((await readdir(dir)).includes('report.md'));
    const saved = await readFile(join(dir, 'game.json'), 'utf8');
    assert.ok(!saved.includes(app.game.hostToken));
  });
});
