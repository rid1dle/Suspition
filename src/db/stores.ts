import { Archive } from '../../server/store.ts';
import { newProfile, recordGame } from '../../server/profiles.ts';
import type { Db } from './index.ts';
import type { Game, Profile } from '../../server/types.ts';

const USERNAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

// The current game, saved in the database on every change.
export class DbStore {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  async load(): Promise<Game | null> {
    return this.db.loadCurrent();
  }
  async save(game: Game) {
    this.db.saveGame(game);
    this.db.setCurrent(game.id);
  }
}

// Finished and replaced games: the database row plus the git copy in dataset/games.
export class DbArchive {
  db: Db;
  files: Archive;
  constructor(db: Db, datasetDir: string) {
    this.db = db;
    this.files = new Archive(datasetDir);
  }
  async save(game: Game, label = '') {
    if (!game?.players?.length) return null;
    this.db.saveGame(game);
    const row = this.db.listGames().find((g) => g.id === game.id);
    return this.files.save({ ...game, learning: row?.learning ?? game.learning ?? 'real', note: row?.note ?? game.note ?? '' }, label);
  }
}

// A profile is built when it is read: the person's own answers plus what real games taught.
export class DbPeople {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  async list() {
    const real = this.db.realPlayers();
    return this.db.peopleList().filter((p) => real.has(p.username));
  }
  async load(username: string): Promise<Profile | null> {
    if (!USERNAME.test(String(username ?? ''))) return null;
    const person = this.db.person(username);
    const games = this.db.realGamesFor(username);
    if (!person && !games.length) return null;
    const profile = newProfile(username, person?.name ?? username, person?.createdAt);
    profile.answers = person?.answers ?? [];
    for (const game of games) {
      const player = game.players.find((p) => p.username === username);
      if (player) recordGame(profile, game, player.id);
    }
    return profile;
  }
  async save(profile: Profile) {
    if (!USERNAME.test(profile.username)) throw new Error(`bad username ${profile.username}`);
    this.db.savePerson({ username: profile.username, name: profile.name, answers: profile.answers ?? [], createdAt: profile.createdAt ?? Date.now() });
  }
}
