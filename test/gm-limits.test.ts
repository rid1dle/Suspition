import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GM } from '../server/gm.ts';
import { gameInReading } from './fixtures.ts';

describe('GM slots', () => {
  test('should draw pictures in their own slot so answers never wait behind them', async () => {
    let releasePicture;
    const order = [];
    const run = async (opts) => {
      if (opts.system.includes('SVG')) {
        order.push('picture started');
        await new Promise((r) => (releasePicture = r));
        return { svg: '<svg></svg>' };
      }
      order.push('other call');
      return { ok: true };
    };
    const gm = new GM({ workDir: '/tmp', run, maxParallel: 1 });
    const game = gameInReading(3, 1_000);
    const picture = gm.illustrate(game, {});
    const other = await Promise.race([gm.call('answer', { system: 'x', prompt: 'y' }), new Promise((r) => setTimeout(() => r('blocked'), 200))]);
    assert.deepEqual(other, { ok: true }, 'the answer did not wait for the picture');
    releasePicture();
    await picture;
    assert.deepEqual(order, ['picture started', 'other call']);
  });
});
