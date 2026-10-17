import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function newest(dir: string): number {
  let t = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    t = Math.max(t, s.isDirectory() ? newest(p) : s.mtimeMs);
  }
  return t;
}

// Builds the screens only when the source is newer than the last build, so `npm start` stays quick.
const built = join(ROOT, '.next', 'BUILD_ID');
if (!existsSync(built) || newest(join(ROOT, 'src')) > statSync(built).mtimeMs) {
  console.log('Building the screens. This takes about a minute the first time.');
  execSync('npx next build', { cwd: ROOT, stdio: 'inherit' });
}
