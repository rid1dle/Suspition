import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DECK, drawIdea } from '../src/lib/settings-deck.ts';
import * as G from '../server/game.ts';
import { generationPrompt, GENERATION_SYSTEM } from '../server/prompts.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { openDb } from '../src/db/index.ts';
import { GameLibrary } from '../src/db/library.ts';
import { FakeGM, gameInReading } from './fixtures.ts';

// A small seeded random so draws are repeatable.
const seeded = (seed = 7) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const COLD = 'cold air at station nine: a weather post in ladakh, snowed in';

describe('settings deck', () => {
  test('should never draw an idea whose keywords appear in a recent world', () => {
    const random = seeded();
    for (let i = 0; i < 200; i += 1) {
      const drawn = drawIdea([COLD], random);
      const idea = DECK.find((d) => d.id === drawn.id);
      assert.ok(idea, 'the idea comes from the deck');
      for (const k of ['snow', 'station', 'ladakh']) assert.ok(!idea.keywords.includes(k), `${idea.id} shares "${k}" with a recent world`);
    }
  });

  test('should draw the least recently used idea when every idea matches a recent world', () => {
    const everything = DECK.map((d) => d.keywords.join(' '));
    const idea = drawIdea(everything, seeded());
    assert.ok(DECK.some((d) => d.id === idea.id), 'still returns an idea from the deck');
    assert.equal(drawIdea(everything, seeded(), DECK.slice(1).map((d) => d.id)).id, DECK[0].id, 'the one not shown yet');
  });

  test('should not repeat an idea already shown in this lobby until the deck runs out', () => {
    const random = seeded(3);
    const shown: string[] = [];
    for (let i = 0; i < DECK.length; i += 1) shown.push(drawIdea([], random, shown).id);
    assert.equal(new Set(shown).size, DECK.length, 'every idea once before any repeat');
    const again = drawIdea([], random, shown);
    assert.ok(DECK.some((d) => d.id === again.id), 'then the deck starts again');
  });

  test('should keep the deck varied', () => {
    assert.ok(DECK.length >= 36, `about 40 ideas, got ${DECK.length}`);
    assert.equal(new Set(DECK.map((d) => d.id)).size, DECK.length, 'ids are unique');
    const cold = DECK.filter((d) => d.keywords.some((k) => ['snow', 'mountain', 'station'].includes(k)));
    assert.ok(cold.length <= 3, `at most 3 cold or remote ideas, got ${cold.length}`);
    for (const d of DECK) {
      assert.ok(d.text.split(/\s+/).length < 10, `"${d.text}" is under 10 words`);
      assert.ok(!d.text.includes('—'), `"${d.text}" has no em dash`);
      assert.ok(d.keywords.length >= 2, `${d.id} has keywords`);
    }
  });
});

describe('the drawn idea in the game', () => {
  const lobby = () => {
    const game = G.createGame();
    for (const name of ['Asha', 'Ben', 'Cy']) G.addPlayer(game, { name });
    return game;
  };

  test('should show a drawn idea on the table in the lobby', () => {
    const game = lobby();
    G.shuffleSurprise(game, [COLD], seeded());
    const view = G.tableView(game);
    assert.ok(view.surprise?.text, 'the lobby shows an idea');
    assert.ok(DECK.some((d) => d.id === view.surprise.id), 'from the deck');
  });

  test('should use the drawn idea when the setting box is empty, and the typed setting otherwise', () => {
    const game = lobby();
    const idea = G.shuffleSurprise(game, [], seeded());
    G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, setting: '' });
    assert.deepEqual(game.setup.surprise, idea);
    const prompt = generationPrompt(game);
    assert.match(prompt, new RegExp(`Setting idea \\(drawn by the game\\): ${idea.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.ok(!prompt.includes('Surprise us'), 'no more "Surprise us"');

    const typed = lobby();
    G.shuffleSurprise(typed, [], seeded());
    G.applySetup(typed, { tone: 'tense', length: 'short', hints: 2, setting: 'A college reunion' });
    assert.equal(typed.setup.surprise, undefined);
    assert.match(generationPrompt(typed), /Setting: A college reunion/);
    assert.ok(!generationPrompt(typed).includes('Setting idea'), 'a typed setting wins');
  });

  test("should list this group's recent worlds in the prompt and ask for a different place, era and reason people are stuck", () => {
    const game = lobby();
    G.shuffleSurprise(game, [], seeded());
    G.applySetup(game, { tone: 'tense', length: 'short', hints: 2 });
    game.setup.recent = ['Cold Air at Station Nine: A weather post in Ladakh.'];
    const prompt = generationPrompt(game);
    assert.match(prompt, /Worlds this group played recently \(make this one clearly different in place, era and the reason people are stuck\):\n- Cold Air at Station Nine: A weather post in Ladakh\./);
  });

  test('should ask why nobody can just leave, not what is cut off by weather', () => {
    assert.ok(!GENERATION_SYSTEM.includes('what is cut off or blocked'), 'the old weather rule is gone');
    assert.match(GENERATION_SYSTEM, /why nobody can simply leave or call for help tonight/);
  });

  test('should keep the drawn idea through a failed world and a second try', () => {
    const game = lobby();
    const idea = G.shuffleSurprise(game, [], seeded());
    game.status = 'failed';
    G.applySetup(game, { tone: 'tense', length: 'short', hints: 2 });
    assert.deepEqual(game.setup.surprise, idea);
  });
});

describe('recent worlds and the shuffle', () => {
  test('should list the newest worlds with their setting line', async () => {
    const db = openDb(join(await mkdtemp(join(tmpdir(), 'deck-')), 'suspition.db'));
    const older = gameInReading(3);
    older.scenario.title = 'Old One';
    older.scenario.setting_summary = 'A dam in a flood.';
    older.createdAt = 1_000;
    db.saveGame(older);
    const newer = gameInReading(3);
    newer.scenario.title = 'New One';
    newer.scenario.setting_summary = 'A station in the snow.';
    newer.createdAt = 2_000;
    db.saveGame(newer);
    const empty = G.createGame(3_000);
    db.saveGame(empty);
    assert.deepEqual(new GameLibrary(db).recentWorlds(10), ['New One: A station in the snow.', 'Old One: A dam in a flood.']);
    db.close();
  });

  test('should shuffle only for the host, away from recent worlds', async () => {
    const library = { recentWorlds: () => ['Cold Air at Station Nine: a weather post in Ladakh, snowed in.'], list: () => [] };
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), library } as never).init();
    await assert.rejects(() => app.shuffleSurprise('nope'), /table screen/);
    const before = app.tableView().surprise.id;
    const after = await app.shuffleSurprise(app.game.hostToken);
    assert.notEqual(after.id, before, 'a new idea');
    const kw = DECK.find((d) => d.id === after.id).keywords;
    assert.ok(!kw.includes('snow') && !kw.includes('ladakh'), 'away from the recent world');
  });

  test('should hand the recent worlds to the world writer at setup', async () => {
    const library = { recentWorlds: () => ['Old One: A dam in a flood.'], list: () => [], setLearning: () => {} };
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), library } as never).init();
    for (const name of ['A', 'B', 'C']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    assert.deepEqual(app.game.setup.recent, ['Old One: A dam in a flood.']);
    await app.idle();
  });
});
