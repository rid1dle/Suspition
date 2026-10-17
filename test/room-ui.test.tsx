import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldRoom } from '../src/components/world/room';
import { roomTheme } from '../server/room.ts';

const room = (over = {}) => roomTheme({ seed_color: '#2a6f97', font_pair: 'storybook', texture: 'rain-glass', ambient: 'rain', intensity: 'low', sound_set: 'tense', ...over });

describe('the world room on screen', () => {
  test('should set the world colours as CSS variables', () => {
    const r = room();
    const html = renderToStaticMarkup(<WorldRoom room={r}><p>hi</p></WorldRoom>);
    assert.ok(html.includes(`--background:${r.colors.bg}`));
    assert.ok(html.includes(`--primary:${r.colors.accent}`));
    assert.ok(html.includes(`--foreground:${r.colors.text}`));
    assert.ok(html.includes('<p>hi</p>'));
  });

  test('should not render effects for a calm screen or ambient none', () => {
    assert.ok(renderToStaticMarkup(<WorldRoom room={room()} />).includes('data-effect="rain"'));
    assert.ok(!renderToStaticMarkup(<WorldRoom room={room()} calm />).includes('data-effect'));
    assert.ok(!renderToStaticMarkup(<WorldRoom room={room({ ambient: 'none' })} />).includes('data-effect'));
    assert.ok(!renderToStaticMarkup(<WorldRoom room={null} />).includes('data-effect'));
  });

  test('should use the font pair the world picked', () => {
    const html = renderToStaticMarkup(<WorldRoom room={room()} />);
    assert.ok(html.includes('data-font="storybook"'));
    assert.ok(html.includes('data-texture="rain-glass"'));
  });
});
