import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ROOM_OPTIONS, ROOM_SCHEMA, roomTheme } from '../server/room.ts';
import { WorldRoom } from '../src/components/world/room';

const css = readFileSync('src/app/world.css', 'utf8');

describe("the story's own look", () => {
  test('should offer six new ambients and four new font pairs to the GM', () => {
    for (const a of ['petals', 'sparks', 'leaves', 'sand', 'stars', 'bubbles']) {
      assert.ok(ROOM_OPTIONS.ambient.includes(a as never), `${a} is offered`);
      assert.ok(ROOM_SCHEMA.properties.ambient.enum.includes(a), `${a} is in the schema`);
    }
    for (const f of ['handwritten-note', 'poster-bold', 'terminal', 'marquee']) {
      assert.ok(ROOM_OPTIONS.font_pair.includes(f as never), `${f} is offered`);
      assert.ok(ROOM_SCHEMA.properties.font_pair.enum.includes(f), `${f} is in the schema`);
    }
  });

  test('should give every font pair a CSS rule with Inter as the body', () => {
    for (const f of ROOM_OPTIONS.font_pair) {
      const rule = css.match(new RegExp(`\\.world\\[data-font='${f}'\\] \\{[^}]*\\}`))?.[0];
      assert.ok(rule, `${f} has a rule`);
      assert.match(rule, /--font-body: var\(--font-inter\)/, `${f} reads in Inter`);
    }
  });

  test('should give every ambient a CSS effect', () => {
    for (const a of ROOM_OPTIONS.ambient.filter((x) => x !== 'none')) assert.match(css, new RegExp(`\\.ambient\\[data-effect='${a}'\\] i \\{`), `${a} has an effect`);
  });

  test('should fall back for an unknown ambient or font from an old game', () => {
    const t = roomTheme({ seed_color: '#2a6f97', font_pair: 'papyrus' as never, ambient: 'lava' as never, texture: 'paper', intensity: 'low', sound_set: 'tense' });
    assert.equal(t.ambient, 'none');
    assert.equal(t.fontPair, 'noir-serif');
  });

  test('should show the scene picture as a backdrop on the table and not on phones or when calm', () => {
    const svg = '<svg viewBox="0 0 800 400"><rect width="800" height="400" fill="#1b2a44"/></svg>';
    assert.match(renderToStaticMarkup(<WorldRoom room={null} backdrop={svg}><p>x</p></WorldRoom>), /class="backdrop"/);
    assert.ok(!renderToStaticMarkup(<WorldRoom room={null}><p>x</p></WorldRoom>).includes('class="backdrop"'), 'no backdrop without a picture (phones pass none)');
    assert.ok(!renderToStaticMarkup(<WorldRoom room={null} calm backdrop={svg}><p>x</p></WorldRoom>).includes('class="backdrop"'), 'none when calm');
  });

  test('should escape the picture safely into the backdrop', () => {
    const svg = `<svg viewBox="0 0 800 400"><rect fill="#ff0000" stroke='#00ff00'/></svg>`;
    const html = renderToStaticMarkup(<WorldRoom room={null} backdrop={svg}><p>x</p></WorldRoom>);
    const style = html.match(/class="backdrop" style="([^"]*)"/)?.[1] ?? '';
    assert.match(style, /background-image:url\(&quot;data:image\/svg\+xml;utf8,%3Csvg/);
    assert.ok(!/#ff0000|'#00ff00/.test(style), 'hashes and quotes are encoded');
    assert.match(css, /\.backdrop \{[^}]*filter: blur\(28px\) saturate\(0\.85\)[^}]*opacity: 0\.22/);
  });
});
