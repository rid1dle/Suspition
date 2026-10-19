import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { roomStyle } from '../src/components/world/room.tsx';
import { HOUSE_ROOM } from '../src/lib/house-room.ts';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
});
const source = files('src').filter((f) => !f.includes('/components/ui/')).map((f) => [f, readFileSync(f, 'utf8')] as const);

describe('the UI rules hold in code', () => {
  test('should use no side-stripe borders anywhere (an impeccable ban)', () => {
    for (const [f, s] of source) assert.doesNotMatch(s, /border-l-(4|2|8|\[)/, f);
  });

  test('should take meaning colours from the world, never fixed emerald, violet, sky or white', () => {
    for (const [f, s] of source) {
      if (f.includes('music-lab') || f.includes('games')) continue;
      assert.doesNotMatch(s, /\b(text|bg|border|ring)-(emerald|violet|sky)-\d|\btext-white\b/, f);
    }
  });

  test('should give every world a right-answer colour and the public and hidden card colours', () => {
    const style = roomStyle({ ...HOUSE_ROOM } as never) as Record<string, string>;
    for (const v of ['--correct', '--layer-public', '--layer-hidden']) assert.match(String(style[v]), /color-mix\(in oklab, #[0-9a-f]{6} \d+%, #[0-9a-f]{6}\)/, v);
    const css = readFileSync('src/app/globals.css', 'utf8');
    for (const v of ['--color-correct', '--color-layer-public', '--color-layer-hidden']) assert.ok(css.includes(v), v);
  });
});

describe('screens show nothing empty and use their space', () => {
  const players = [{ id: 'p1', name: 'Asha' }, { id: 'p2', name: 'Ben' }];
  const reveal = (over = {}) => ({
    status: 'reveal', title: 'The Case', players, roundResults: [], sharedClues: [], timeline: [],
    reveal: {
      verdict: { winner: 'investigators', correct_player_ids: ['p1'] }, truth: { culprit_ids: ['p2'], timeline: Array.from({ length: 30 }, (_, i) => ({ time: `${i}:00`, event: `STEP-${i}` })) },
      reveal_story: 'The story.', story_shape: '', learned: [], twists: [], false_hint: '', players: [], cards: [], bestPlay: [], ...over,
    },
  });
  const render = async (file: string, name: string, view: unknown) => {
    const mod = await import(file);
    return renderToStaticMarkup(React.createElement(mod[name], { view, host: 'h', act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));
  };

  test('should fold the step-by-step night on the reveal and hide empty panels', async () => {
    const html = await render('../src/app/table/endgame.tsx', 'Reveal', reveal());
    assert.match(html, /<details[^>]*>\s*<summary[^>]*>The night, step by step/);
    assert.doesNotMatch(html, /No round votes|learned nothing new/);
    assert.doesNotMatch(html, />Rounds</);
    assert.doesNotMatch(html, /How people found out/);
  });

  test('should hide empty rounds and shared clues while everyone picks', async () => {
    const html = await render('../src/app/table/endgame.tsx', 'FinalWait', { status: 'final', title: 'The Case', players, submitted: [], roundResults: [], sharedClues: [], timeline: [{ time: '9', event: 'x' }], culpritCount: 1 });
    assert.doesNotMatch(html, /No round votes|No clues shared yet/);
  });

  test('should keep the start button with the briefing, and fold the alibis', async () => {
    const src = readFileSync('src/app/table/reading.tsx', 'utf8');
    const left = src.split('<aside')[0];
    assert.match(left, /Start round 1/);
    assert.match(src, /<details[^>]*>\s*<summary[^>]*>[^<]*Alibis/);
  });

  test('should not say the world name twice in the table top bar', () => {
    const src = readFileSync('src/app/table/playing.tsx', 'utf8');
    assert.match(src, /view\.phase\.name !== view\.title/);
  });
});
