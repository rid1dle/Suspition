import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { nodeOk, MESSAGE } = require('../scripts/check-node.cjs');

describe('Node version check', () => {
  test('should accept Node 24 and newer and refuse older ones', () => {
    assert.equal(nodeOk('v24.4.1'), true);
    assert.equal(nodeOk('v25.0.0'), true);
    assert.equal(nodeOk('v20.19.4'), false);
    assert.equal(nodeOk('v22.22.2'), false);
  });

  test('should tell the user how to switch', () => {
    assert.match(MESSAGE('v20.19.4'), /nvm use 24/);
    assert.equal(execFileSync(process.execPath, ['scripts/check-node.cjs']).toString(), '');
  });
});
