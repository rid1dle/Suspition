// @ts-nocheck -- legacy JS, typed file by file later
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usernameFor } from '../../server/profiles.ts';

const MAX_SAMPLES = 12;

// Writing samples for each real person, taken only from what they typed in saved games.
export async function seedBots(gamesDir, botsDir) {
  const people = new Map();
  for (const f of (await readdir(gamesDir)).filter((x) => x.endsWith('.json')).sort()) {
    const game = JSON.parse(await readFile(join(gamesDir, f), 'utf8'));
    for (const p of game.players ?? []) {
      const entry = people.get(p.name) ?? { name: p.name, samples: new Set() };
      for (const m of game.state?.threads?.[p.id] ?? []) if (m.from === 'you' && m.text) entry.samples.add(m.text);
      for (const e of game.state?.events ?? []) if (e.kind === 'qa' && e.by === p.name && e.q) entry.samples.add(e.q);
      people.set(p.name, entry);
    }
  }
  await mkdir(botsDir, { recursive: true });
  const written = [];
  for (const { name, samples } of [...people.values(), { name: 'Guest', samples: new Set() }]) {
    const username = usernameFor(name);
    await writeFile(join(botsDir, `${username}.json`), `${JSON.stringify({ username, name, samples: [...samples].slice(-MAX_SAMPLES) }, null, 1)}\n`);
    written.push({ username, count: Math.min(samples.size, MAX_SAMPLES) });
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const written = await seedBots(join(root, 'dataset', 'games'), join(root, 'dataset', 'bots'));
  for (const w of written) console.log(`${w.username}: ${w.count} samples`);
}
