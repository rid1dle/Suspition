import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { GM } from '../server/gm.ts';
import { composePrompt, SOUNDTRACK_SCHEMA } from '../server/prompts.ts';
import * as G from '../server/game.ts';
import { FakeGM, gameInReading } from './fixtures.ts';

const direction = (name: string) => ({
  name,
  line: 'Slow cellos and a ticking clock.',
  tempo: 72,
  root: 'D',
  mode: 'minor',
  lead: 'cellos',
  harmony: 'violins',
  bass: 'basses',
  texture: 'harp',
  kit: ['shaker'],
  theme: [0, 1, 2, 4, 3, 2].map((degree) => ({ degree, beats: 1, rest: false })).concat([{ degree: 0, beats: 2, rest: false }]),
  rounds: [{ mood: 'quiet', chords: [0, 5, 3, 4], variation: 'plain', shift: 0, pulse: 'none', groove: 'none', low: 0.1, high: 0.4 }],
  stingers: { round: 'swell', seat: 'hit', vote: 'rise', reveal: 'chime' },
});
const RAW = { directions: [direction('Candle and Cello'), direction('Small Hours'), direction('Clockwork')] };

const SECRETS = (sc: any) => [
  sc.truth.summary, sc.truth.method, sc.truth.motive, ...sc.truth.timeline.map((t: any) => t.event),
  ...sc.players.flatMap((p: any) => [p.private_info, p.goal, p.side_explanation, p.starting_knowledge, ...p.hidden_facts.map((h: any) => h.fact)]),
  ...sc.clues.flatMap((c: any) => [c.name, c.shows]),
  ...sc.npcs.flatMap((n: any) => [n.knows, n.secrets].filter(Boolean)),
  ...sc.hint_ladder.map((h: any) => h.text), ...sc.twists.map((t: any) => t.description),
  ...sc.phases.map((p: any) => p.planned_beat), ...sc.suspects.map((s: any) => s.motive_against_victim), ...sc.red_herrings.map((r: any) => r.why_convincing),
  ...sc.truth.culprit_ids.map((id: string) => sc.players.find((p: any) => p.id === id).character_name),
];

class ComposingGM extends FakeGM {
  composeCalls = 0;
  composeGate: Promise<unknown> | null = null;
  composeResult: unknown = RAW;
  composeFail = false;
  async compose() {
    this.composeCalls += 1;
    if (this.composeGate) await this.composeGate;
    if (this.composeFail) throw new Error('fake compose failure');
    return structuredClone(this.composeResult);
  }
}

async function appWith(gm = new ComposingGM(), store = new MemoryStore()) {
  const app = await new App({ gm, store, clock: () => 1_000 }).init();
  for (const name of ['Asha', 'Bo', 'Cy']) await app.join({ name });
  return { app, gm, host: app.game.hostToken };
}

describe('the compose prompt', () => {
  test('should build the compose prompt from public facts only', () => {
    const game = gameInReading(4);
    const prompt = composePrompt(game);
    assert.ok(prompt.includes(game.scenario.title));
    assert.ok(prompt.includes(game.scenario.setting_summary));
    assert.ok(prompt.includes(game.scenario.opening_scene));
    assert.ok(prompt.includes('tense'));
    for (const p of game.scenario.phases) assert.ok(prompt.includes(p.name), p.name);
    for (const secret of SECRETS(game.scenario)) assert.ok(!prompt.includes(secret), `leaks ${secret}`);
    assert.ok(prompt.includes('You are the composer for a party mystery game.'));
    assert.ok(!/—/.test(prompt), 'no em dashes');
  });

  test('should send the GM no secrets in the system prompt either', async () => {
    const game = gameInReading(4);
    const seen: any[] = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts: any) => { seen.push(opts); return RAW; } });
    assert.deepEqual(await gm.compose(game), RAW);
    assert.equal(seen[0].schema, SOUNDTRACK_SCHEMA);
    assert.equal(seen[0].timeoutMs, 300_000);
    for (const secret of SECRETS(game.scenario)) assert.ok(!`${seen[0].system}\n${seen[0].prompt}`.includes(secret), `leaks ${secret}`);
  });

  test('should only let the GM choose instruments that can play their part', () => {
    const d = SOUNDTRACK_SCHEMA.properties.directions.items.properties;
    assert.ok(d.lead.enum.includes('piano') && !d.lead.enum.includes('basses'));
    assert.ok(d.bass.enum.includes('basses') && !d.bass.enum.includes('flute'));
    assert.ok(d.kit.items.enum.includes('kick'));
    assert.equal(d.tempo.maximum, 140);
  });
});

describe('the game keeps the soundtrack', () => {
  test('should store a cleaned soundtrack with the first direction chosen', () => {
    const game = gameInReading(4);
    G.startSoundtrack(game);
    assert.deepEqual(game.state.soundtrack, { status: 'writing' });
    G.applySoundtrack(game, RAW);
    const s = game.state.soundtrack;
    assert.equal(s.status, 'ready');
    assert.equal(s.chosen, 0);
    assert.equal(s.directions.length, 3);
    assert.equal(s.directions[0].rounds.length, game.scenario.phases.length);
  });

  test('should hide a character or player name the GM put in a direction name', () => {
    const game = gameInReading(4);
    G.applySoundtrack(game, { directions: [direction(`${game.scenario.players[1].character_name} Waltz`), direction(`${game.players[0].name} Blues`), direction(`${game.scenario.npcs[1].name.replace('The ', '')} Theme`)] });
    assert.deepEqual(game.state.soundtrack.directions.map((d: any) => d.name), ['Music 1', 'Music 2', 'Music 3']);
  });

  test('should mark the soundtrack failed when nothing can play', () => {
    const game = gameInReading(4);
    G.applySoundtrack(game, { directions: [{ name: 'Empty', theme: [] }] });
    assert.deepEqual(game.state.soundtrack, { status: 'failed' });
    G.failSoundtrack(game);
    assert.deepEqual(game.state.soundtrack, { status: 'failed' });
  });

  test('should let the table pick a direction and refuse one off the list', () => {
    const game = gameInReading(4);
    G.startSoundtrack(game);
    assert.throws(() => G.pickSoundtrack(game, 1), (e: any) => e.status === 409);
    G.applySoundtrack(game, RAW);
    G.pickSoundtrack(game, 2);
    assert.equal(game.state.soundtrack.chosen, 2);
    assert.throws(() => G.pickSoundtrack(game, 3), (e: any) => e.status === 400 && e.message === 'That music is not on the list.');
    assert.throws(() => G.pickSoundtrack(game, -1), (e: any) => e.status === 400);
    assert.throws(() => G.pickSoundtrack(game, 'x' as never), (e: any) => e.status === 400);
  });

  test('should show the soundtrack on the table and never on a phone', () => {
    const game = gameInReading(4);
    assert.equal(G.tableView(game).soundtrack, null);
    G.applySoundtrack(game, RAW);
    const view = G.tableView(game).soundtrack;
    assert.equal(view.status, 'ready');
    assert.equal(view.directions.length, 3);
    assert.equal(view.chosen, 0);
    assert.equal('soundtrack' in G.playerView(game, game.players[0].id), false);
    G.failSoundtrack(game);
    assert.deepEqual(G.tableView(game).soundtrack, { status: 'failed' });
  });
});

describe('the app composes in the background', () => {
  test('should compose in the background after the world is written, without holding up the reading step', async () => {
    const { app, gm, host } = await appWith();
    let release!: () => void;
    gm.composeGate = new Promise<void>((r) => (release = r));
    await app.setup(host, { tone: 'tense', length: 'short', hints: 2 });
    while (app.game.status === 'generating') await new Promise((r) => setImmediate(r));
    assert.equal(app.game.status, 'reading');
    assert.equal(app.tableView().soundtrack.status, 'writing');
    release();
    await app.idle();
    assert.equal(app.tableView().soundtrack.status, 'ready');
    assert.equal(gm.composeCalls, 1);
  });

  test('should fall back to failed when the compose call throws', async () => {
    const { app, gm, host } = await appWith();
    gm.composeFail = true;
    await app.setup(host, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    assert.equal(app.game.status, 'reading');
    assert.deepEqual(app.tableView().soundtrack, { status: 'failed' });
  });

  test('should compose once for a game restored in reading or playing without a soundtrack, and not again when one exists', async () => {
    for (const status of ['reading', 'playing']) {
      const store = new MemoryStore();
      const game = gameInReading(3);
      game.status = status;
      if (status === 'playing') game.state.phaseIndex = 0;
      await store.save(game);
      const gm = new ComposingGM();
      const app = await new App({ gm, store, clock: () => 1_000 }).init();
      await app.idle();
      assert.equal(gm.composeCalls, 1, status);
      assert.equal(app.game.state.soundtrack.status, 'ready');
      const again = new ComposingGM();
      await (await new App({ gm: again, store, clock: () => 1_000 }).init()).idle();
      assert.equal(again.composeCalls, 0, `${status} again`);
    }
  });

  test('should compose again for a game restored while the music was being written', async () => {
    const store = new MemoryStore();
    const game = gameInReading(3);
    game.state.soundtrack = { status: 'writing' };
    await store.save(game);
    const gm = new ComposingGM();
    await (await new App({ gm, store, clock: () => 1_000 }).init()).idle();
    assert.equal(gm.composeCalls, 1);
  });

  test('should not compose when the GM cannot', async () => {
    const { app, host } = await appWith(new FakeGM() as ComposingGM);
    await app.setup(host, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    assert.equal(app.tableView().soundtrack, null);
  });

  test('should require the host token to pick music', async () => {
    const { app, host } = await appWith();
    await app.setup(host, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await assert.rejects(() => app.pickMusic('nope', 1), /table screen/);
    await app.pickMusic(host, 1);
    assert.equal(app.tableView().soundtrack.chosen, 1);
  });
});
