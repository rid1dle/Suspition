// @ts-nocheck -- script
// Draws one sample picture per art style with the real GM, so the setup screen shows what each style
// looks like. Same scene for every style, so they compare. Run once: npm run art-samples [style ids...]
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaude } from '../server/gm.ts';
import { artPrompt, ILLUSTRATION_SCHEMA } from '../server/prompts.ts';
import { cleanSvg } from '../server/game.ts';
import { ART_STYLES } from '../src/lib/art-styles.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'art-styles');
const SCENE = 'A lamp-lit house on a hill at night, a road winding up to it and one tree beside it.';
const SYSTEM = 'You draw clean SVG illustrations in the style you are given. Output only the SVG in the svg field.';

async function draw(style) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = Date.now();
    try {
      const { svg } = await runClaude({ system: SYSTEM, prompt: artPrompt(SCENE, style.id), schema: ILLUSTRATION_SCHEMA, workDir: join(tmpdir(), 'detective-gm'), timeoutMs: 300_000 });
      const clean = cleanSvg(svg);
      if (!clean) throw new Error(`not a safe SVG (${String(svg ?? '').length} chars)`);
      await writeFile(join(OUT, `${style.id}.svg`), clean);
      console.log(`${style.id}: ok in ${Math.round((Date.now() - started) / 1000)}s, ${clean.length} chars`);
      return true;
    } catch (err) {
      console.log(`${style.id}: try ${attempt} failed: ${err.message}`);
    }
  }
  return false;
}

const only = process.argv.slice(2);
const styles = ART_STYLES.filter((s) => !only.length || only.includes(s.id));
await mkdir(OUT, { recursive: true });
await mkdir(join(tmpdir(), 'detective-gm'), { recursive: true });
const queue = [...styles];
const results = await Promise.all(Array.from({ length: 4 }, async () => {
  const done = [];
  while (queue.length) done.push(await draw(queue.shift()));
  return done;
}));
const failed = results.flat().filter((ok) => !ok).length;
console.log(failed ? `${failed} style(s) failed; run again with their ids.` : `All ${styles.length} samples written to public/art-styles.`);
