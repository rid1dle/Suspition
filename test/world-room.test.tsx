import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldRoom } from '../src/components/world/room';

describe('the room follows the story', () => {
  test('should write the tension as a CSS variable on the room', () => {
    const html = renderToStaticMarkup(<WorldRoom room={null} tension={0.4}><p>Read me</p></WorldRoom>);
    assert.match(html, /--tension:0\.4/);
    assert.match(html, /class="story-edge"/);
  });

  test('should not add any effect class inside the reading column', () => {
    const html = renderToStaticMarkup(<WorldRoom room={null} tension={0.8} beat={3}><p id="read">Read me</p></WorldRoom>);
    const inner = html.slice(html.indexOf('<p id="read"'));
    assert.ok(!/story-edge|data-beat|--tension/.test(inner), 'the reading content carries no effect');
    assert.equal((html.match(/--tension/g) ?? []).length, 1, 'only the root sets the tension');
  });
});
