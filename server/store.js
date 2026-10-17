import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forDataset } from './game.js';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, 'current-game.json');
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  save(game) {
    const body = JSON.stringify(game);
    this.writing = this.writing.catch(() => {}).then(async () => {
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}

export class MemoryStore {
  constructor(game = null) {
    this.game = game;
  }
  async load() {
    return this.game && structuredClone(this.game);
  }
  async save(game) {
    this.game = structuredClone(game);
  }
}

const slug = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function datasetName(game, label = '') {
  const day = new Date(game.createdAt ?? Date.now()).toISOString().slice(0, 10);
  return [day, slug(game.scenario?.title) || 'no-world', game.id, label].filter(Boolean).join('-') + '.json';
}

// Keeps a copy of every game, without join tokens, so the games can be studied later.
export class Archive {
  constructor(dir) {
    this.dir = join(dir, 'games');
  }

  async save(game, label = '') {
    if (!game?.players?.length) return null;
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, datasetName(game, label));
    await writeFile(file, `${JSON.stringify(forDataset(game), null, 1)}\n`);
    return file;
  }
}

const USERNAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

// One JSON file per person under <dataset>/people. A database or an online store can replace this class.
export class People {
  constructor(dir) {
    this.dir = dir;
  }

  async list() {
    const files = await readdir(this.dir).catch((err) => (err.code === 'ENOENT' ? [] : Promise.reject(err)));
    const out = [];
    for (const f of files.filter((x) => x.endsWith('.json')).sort()) {
      const p = await this.load(f.slice(0, -5));
      if (p) out.push({ username: p.username, name: p.name });
    }
    return out;
  }

  async load(username) {
    if (!USERNAME.test(String(username ?? ''))) return null;
    try {
      return JSON.parse(await readFile(join(this.dir, `${username}.json`), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(profile) {
    if (!USERNAME.test(profile.username)) throw new Error(`bad username ${profile.username}`);
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, `${profile.username}.json`);
    await writeFile(`${file}.tmp`, `${JSON.stringify(profile, null, 1)}\n`);
    await rename(`${file}.tmp`, file);
  }
}

export class MemoryPeople {
  constructor(profiles = []) {
    this.map = new Map(profiles.map((p) => [p.username, structuredClone(p)]));
  }
  async list() {
    return [...this.map.values()].map((p) => ({ username: p.username, name: p.name }));
  }
  async load(username) {
    const p = this.map.get(username);
    return p ? structuredClone(p) : null;
  }
  async save(profile) {
    this.map.set(profile.username, structuredClone(profile));
  }
}
