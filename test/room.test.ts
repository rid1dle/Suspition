import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roomTheme, guessRoom, contrast, ROOM_OPTIONS, ROOM_SCHEMA, DEFAULT_COLORS } from '../server/room.ts';

const room = (over = {}) => ({ seed_color: '#2a6f97', font_pair: 'noir-serif', texture: 'rain-glass', ambient: 'rain', intensity: 'low', sound_set: 'tense', ...over });

describe('a room for each world', () => {
  test('should build a readable palette from a seed colour', () => {
    const t = roomTheme(room());
    assert.notDeepEqual(t.colors, DEFAULT_COLORS);
    assert.match(t.colors.accent, /^#[0-9a-f]{6}$/);
    assert.deepEqual([t.fontPair, t.texture, t.ambient, t.intensity, t.soundSet], ['noir-serif', 'rain-glass', 'rain', 'low', 'tense']);
  });

  test('should keep every text colour at 4.5 to 1 or more', () => {
    for (const seed of ['#2a6f97', '#ffef00', '#000000', '#ff00ff', '#7a4b2a', '#e0a85a']) {
      const c = roomTheme(room({ seed_color: seed })).colors;
      for (const [fg, bg] of [[c.text, c.bg], [c.text, c.surface], [c.muted, c.bg], [c.accentText, c.accent], [c.accent, c.bg]]) {
        assert.ok(contrast(fg, bg) >= 4.5, `${seed}: ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}`);
      }
    }
  });

  test('should keep a grey seed neutral with the house amber accent', () => {
    const c = roomTheme(room({ seed_color: '#000000' })).colors;
    assert.equal(c.accent, DEFAULT_COLORS.accent);
    assert.equal(c.bg, '#0f0f0f');
  });

  test('should fall back to the default palette when the seed is not a colour', () => {
    assert.deepEqual(roomTheme(room({ seed_color: 'blue-ish' })).colors, DEFAULT_COLORS);
  });

  test('should refuse a font pair outside the list', () => {
    assert.equal(roomTheme(room({ font_pair: 'comic sans' })).fontPair, ROOM_OPTIONS.font_pair[0]);
    assert.equal(roomTheme(null).ambient, 'none');
  });

  test('should guess rain for a monsoon wedding', () => {
    const r = guessRoom('A monsoon wedding in Goa', 'tense');
    assert.equal(r.ambient, 'rain');
    assert.equal(r.sound_set, 'tense');
    assert.equal(guessRoom('A forge in the mountains', 'funny').ambient, 'embers');
    assert.equal(guessRoom('', 'cozy').sound_set, 'soft');
  });

  test('should give the GM a room schema with the fixed lists only', () => {
    assert.deepEqual(ROOM_SCHEMA.properties.font_pair.enum, ROOM_OPTIONS.font_pair);
    assert.equal(ROOM_SCHEMA.additionalProperties, false);
    assert.equal(ROOM_SCHEMA.$schema, undefined);
  });
});

describe('room guesses read whole words', () => {
  test('should not read police as ice or friendship as ship', () => {
    assert.notEqual(guessRoom('A police station', 'tense').ambient, 'snow');
    assert.notEqual(guessRoom('A friendship dinner', 'tense').ambient, 'rain');
    assert.equal(guessRoom('An ice palace', 'tense').ambient, 'snow');
  });
});
