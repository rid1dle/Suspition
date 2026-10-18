import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { richEffects } from '../src/lib/effects.ts';
import { setSeatToken, tokenOf } from '../src/app/play/play-app';
import { Final } from '../src/app/play/endgame';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
});

function withStorage<T>(name: 'localStorage' | 'sessionStorage', items: Record<string, string>, run: () => T): T {
  const store = new Map(Object.entries(items));
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  const before = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value: fake, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (before) Object.defineProperty(globalThis, name, before);
    else delete (globalThis as Record<string, unknown>)[name];
  }
}

describe('the screens after the review', () => {
  test('should use the token of this tab, not the one every tab shares', () => {
    setSeatToken('tab-a');
    withStorage('localStorage', { 'detective-token': 'tab-b' }, () => assert.equal(tokenOf(), 'tab-a'));
  });

  test('should give the particle engine one init function for the whole app', () => {
    const src = readFileSync('src/components/world/table-effects.tsx', 'utf8');
    assert.doesNotMatch(src, /init=\{\s*(async\s*)?\(/);
    assert.match(src, /init=\{initEngine\}/);
  });

  test('should turn the table effects off when the device asks for less motion', () => {
    const room = { ambient: 'embers' } as never;
    assert.equal(richEffects({ room, calm: false, low: false, reduced: false }), true);
    assert.equal(richEffects({ room, calm: false, low: false, reduced: true }), false);
    assert.equal(richEffects({ room, calm: true, low: false, reduced: false }), false);
    assert.equal(richEffects({ room, calm: false, low: true, reduced: false }), false);
    assert.equal(richEffects({ room: { ambient: 'none' } as never, calm: false, low: false, reduced: false }), false);
    assert.equal(richEffects({ room: null, calm: false, low: false, reduced: false }), false);
  });

  test('should keep a half-written final answer when the phone reloads', () => {
    const view = {
      gameId: 'g1', me: { id: 'p1', name: 'Ana' }, players: [{ id: 'p1', name: 'Ana' }], submitted: [], submission: null,
      cast: { players: [{ id: 'p1', name: 'Ana', role: 'Cook' }], npcs: [] }, setup: {},
    } as never;
    const html = withStorage('sessionStorage', { 'draft:final-how-g1': 'With the rope from the shed' }, () => renderToStaticMarkup(<Final view={view} />));
    assert.match(html, /With the rope from the shed/);
  });

  test('should build screens from the design system parts, not raw form controls or tab bars', () => {
    const raw = [...files('src/app'), ...files('src/components/game')].flatMap((f) => readFileSync(f, 'utf8').split('\n')
      .map((line, i) => [`${f}:${i + 1}`, line])
      .filter(([, line]) => /<textarea|<select|type="range"|<nav\b/.test(line)))
      .map(([at]) => at);
    assert.deepEqual(raw, []);
  });
});
