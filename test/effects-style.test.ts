import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
});

describe('React effects', () => {
  test('should never return a value from an effect except a clean-up function', () => {
    // scrollIntoView() returns a Promise in new browsers; React then calls it as a clean-up and the page crashes.
    const bad = files('src').flatMap((f) => readFileSync(f, 'utf8').split('\n')
      .map((line, i) => [f, i + 1, line])
      .filter(([, , line]) => /useEffect\(\(\) => (?![{(]|\(\) =>)/.test(line)));
    assert.deepEqual(bad.map(([f, n]) => `${f}:${n}`), []);
  });
});
