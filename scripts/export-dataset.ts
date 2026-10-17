// @ts-nocheck -- legacy JS, typed file by file later
import { openDb } from '../src/db/index.ts';
import { exportFromDb } from '../src/db/export.ts';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Archive } from '../server/store.ts';
import { gameFile, readJson } from './offline.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const slug = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

// Copies saved games (without join tokens) and generated worlds into the dataset folder.
export async function exportDataset(files, datasetDir) {
  const archive = new Archive(datasetDir);
  const out = [];
  for (const file of files) {
    const data = await readJson(file);
    if (!data) continue;
    if (Array.isArray(data.players) && data.players.some((p) => p.token !== undefined || p.name !== undefined) && data.createdAt) {
      const label = /\.(before-[a-z-]+)\.json$/.exec(basename(file))?.[1] ?? '';
      out.push(await archive.save(data, label));
    } else if (data.truth && Array.isArray(data.players)) {
      await mkdir(join(datasetDir, 'worlds'), { recursive: true });
      const target = join(datasetDir, 'worlds', `${slug(data.title) || basename(file, '.json')}.json`);
      await writeFile(target, `${JSON.stringify(data, null, 1)}\n`);
      out.push(target);
    }
  }
  return out.filter(Boolean);
}

async function main() {
  const dataDir = dirname(gameFile());
  const datasetDir = process.env.DETECTIVE_DATASET_DIR ? resolve(process.env.DETECTIVE_DATASET_DIR) : join(ROOT, 'dataset');
  const extra = process.argv.slice(2).map((f) => resolve(f));
  if (extra.length) {
    const written = await exportDataset(extra, datasetDir);
    for (const f of written) console.log(`  ${f.replace(`${ROOT}/`, '')}`);
  }
  const db = openDb(join(dataDir, 'suspition.db'));
  const out = await exportFromDb(db, datasetDir);
  db.close();
  console.log(`${out.games} games and ${out.people} people in the dataset. Commit and push them to keep them.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
