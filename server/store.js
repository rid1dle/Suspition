import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
    this.writing = this.writing.then(async () => {
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
