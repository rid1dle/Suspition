import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtStylePicker } from '../src/components/game/art-style-picker';
import { ART_STYLES } from '../src/lib/art-styles';

describe('art style picker', () => {
  test('should show a picture and a name for every style, plus Random and Mix', () => {
    const html = renderToStaticMarkup(<ArtStylePicker value="moody-flat" onPick={() => {}} />);
    for (const s of ART_STYLES) {
      assert.ok(html.includes(`src="/art-styles/${s.id}.svg"`), `${s.id} shows its sample`);
      assert.ok(html.includes(`>${s.name}<`), `${s.id} shows its name`);
    }
    assert.match(html, />Random</);
    assert.match(html, />Mix</);
  });

  test('should mark the chosen style', () => {
    const html = renderToStaticMarkup(<ArtStylePicker value="mix" onPick={() => {}} />);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1, 'one chosen');
    assert.match(html, /aria-pressed="true"[^>]*>[\s\S]*?>Mix</);
  });
});
