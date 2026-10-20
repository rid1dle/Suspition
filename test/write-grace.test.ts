import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runClaude } from '../server/gm.ts';

// A ten-player world thought for 17 minutes, began writing, and was killed a minute from done.
const bin = fileURLToPath(new URL('./fake-claude.js', import.meta.url));
const run = (mode: string, extra = {}) => {
  process.env.FAKE_CLAUDE_MODE = mode;
  return runClaude({ system: 'S', prompt: 'P', schema: { type: 'object' }, workDir: tmpdir(), bin, onProgress: () => {}, ...extra }).finally(() => delete process.env.FAKE_CLAUDE_MODE);
};

describe('a world that has started writing gets time to finish', () => {
  before(() => chmod(bin, 0o755));

  test('should let a draft that began writing before the limit finish within the grace', async () => {
    const out = await run('slowwrite', { timeoutMs: 250, writeGraceMs: 1_500 });
    assert.equal(out.title, 'Written slowly');
  });

  test('should still stop a draft that writes past the limit when there is no grace', async () => {
    await assert.rejects(() => run('slowwrite', { timeoutMs: 250 }), /longer than/);
  });

  test('should still stop a call that never starts writing', async () => {
    await assert.rejects(() => run('hang', { timeoutMs: 200, writeGraceMs: 1_500 }), /longer than/);
  });
});
