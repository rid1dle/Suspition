import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { worldMinutes } from '../src/lib/rules.ts';
import { Generating } from '../src/app/table/setup';

describe('how long a world takes to write', () => {
  test('should give the measured time for the group size', () => {
    assert.equal(worldMinutes(4), 11);
    assert.equal(worldMinutes(10), 16);
    assert.equal(worldMinutes(3), 10);
  });

  test('should tell the room the real wait while the GM writes', () => {
    const view = { players: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), progress: null, title: '' };
    const text = renderToStaticMarkup(<Generating view={view as any} host="h" act={() => {}} /> as any).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(text, /For 10 players that takes about 16 minutes\./);
  });
});
