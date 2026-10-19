import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('the Suspition favicon', () => {
  const svg = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');

  test('should be an SVG the browser can scale, in the house colours', () => {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
    assert.match(svg, /#141217/);
    assert.match(svg, /#e0a85a/);
  });

  test('should name the game and draw nothing from outside the file', () => {
    assert.match(svg, /<title>Suspition<\/title>/);
    assert.doesNotMatch(svg, /href=|<script|<image/);
  });
});
