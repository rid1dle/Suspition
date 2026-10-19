import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ART_STYLES, ART_CHOICES, resolveStyle } from '../src/lib/art-styles.ts';
import { illustrationPrompt } from '../server/prompts.ts';
import { cleanSvg } from '../server/game.ts';
import * as G from '../server/game.ts';
import { makeScenario } from './fixtures.ts';

const IDS = ['moody-flat', 'paper-cut', 'ink-noir', 'retro-poster', 'stained-glass', 'woodblock', 'folk-art', 'storybook', 'blueprint', 'neon', 'pixel', 'occult-victorian'];

describe('art styles', () => {
  test("should keep today's style as the default and first in the list", () => {
    assert.deepEqual(ART_STYLES.map((s) => s.id), IDS);
    assert.match(ART_STYLES[0].rules, /Flat shapes and gradients, 4 to 7 colours/);
    assert.deepEqual(ART_CHOICES, [...IDS, 'random', 'mix']);
  });

  test('should offer an occult Victorian style: engraved lines, parchment, crimson and brass, arcane symbols', () => {
    const style = ART_STYLES.find((s) => s.id === 'occult-victorian');
    assert.equal(style.name, 'Occult Victorian');
    for (const part of [/engrav/, /parchment/, /crimson moon/, /brass/, /tarot/, /all-seeing eye/]) assert.match(style.rules, part);
  });

  test('should give every style a sample picture on disk', () => {
    for (const id of IDS) {
      const file = `public/art-styles/${id}.svg`;
      assert.ok(existsSync(file), `${file} exists`);
      assert.ok(cleanSvg(readFileSync(file, 'utf8')), `${file} passes cleanSvg`);
    }
  });

  test('should draw one style for the whole game on Random, the same for every picture', () => {
    const first = resolveStyle('random', 'game-abc', 0);
    assert.ok(IDS.includes(first), 'a real style');
    for (let i = 1; i < 6; i += 1) assert.equal(resolveStyle('random', 'game-abc', i), first);
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => resolveStyle('random', `game-${seed}`, 0)));
    assert.ok(seen.size > 1, 'different games can get different styles');
  });

  test('should change the style for every picture on Mix, without repeats until all are used', () => {
    const styles = IDS.map((_, i) => resolveStyle('mix', 'game-abc', i));
    assert.equal(new Set(styles).size, IDS.length, 'no repeat in the first 11 pictures');
    assert.equal(resolveStyle('mix', 'game-abc', IDS.length), styles[0], 'then it cycles');
  });

  test('should fall back to the default style for an unknown choice', () => {
    assert.equal(resolveStyle('crayon', 'g', 0), 'moody-flat');
    assert.equal(resolveStyle('paper-cut', 'g', 3), 'paper-cut');
  });

  test("should put the chosen style's rules in the drawing prompt and keep the safety rules", () => {
    const prompt = illustrationPrompt(makeScenario(3), 'pixel');
    assert.ok(prompt.includes(ART_STYLES.find((s) => s.id === 'pixel').rules), 'the style rules');
    for (const rule of ['viewBox="0 0 800 400"', 'No text', "no people's faces", 'foreignObject', 'Under 9000 characters']) assert.ok(prompt.includes(rule), `keeps "${rule}"`);
  });

  test('should keep the chosen art style in the setup and default to the moody flat style', () => {
    const lobby = () => { const g = G.createGame(); for (const name of ['A', 'B', 'C']) G.addPlayer(g, { name }); return g; };
    const a = lobby();
    G.applySetup(a, { tone: 'tense', length: 'short', hints: 2, artStyle: 'mix' });
    assert.equal(a.setup.artStyle, 'mix');
    const b = lobby();
    G.applySetup(b, { tone: 'tense', length: 'short', hints: 2, artStyle: 'crayon' });
    assert.equal(b.setup.artStyle, 'moody-flat');
  });
});
