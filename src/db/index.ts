import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';
import type { Answer, Game, Learning, Move } from '../../server/types.ts';

const MIGRATIONS = resolve(fileURLToPath(new URL('../../drizzle', import.meta.url)));
export const LEARNING: Learning[] = ['real', 'test', 'outlier', 'playtest'];

export class DbError extends Error {}

export interface GameSummary {
  id: string;
  title: string;
  day: string;
  status: string;
  players: string[];
  winner: string | null;
  learning: Learning;
  note: string;
  createdAt: number;
}

export interface Person {
  username: string;
  name: string;
  answers: Answer[];
  createdAt: number;
}

export interface StoredMove extends Move {
  gameId: string;
  playerId: string;
  username: string;
}

const parse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

export class Db {
  sqlite: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
    this.orm = drizzle(sqlite, { schema });
  }

  close() {
    this.sqlite.close();
  }

  // The saved game stays the source of truth; events and moves are rebuilt from it for fast queries.
  saveGame(game: Game, now = Date.now()) {
    const st = game.state ?? {};
    const usernames = Object.fromEntries((game.players ?? []).map((p) => [p.id, p.username ?? '']));
    const row = {
      id: game.id,
      status: game.status,
      title: String(game.scenario?.title ?? ''),
      createdAt: game.createdAt ?? now,
      updatedAt: now,
      state: JSON.stringify(game),
    };
    this.sqlite.transaction(() => {
      this.orm.insert(schema.games).values({ ...row, learning: game.learning ?? 'real', note: game.note ?? '' })
        .onConflictDoUpdate({ target: schema.games.id, set: { status: row.status, title: row.title, updatedAt: row.updatedAt, state: row.state } }).run();
      this.orm.delete(schema.events).where(eq(schema.events.gameId, game.id)).run();
      this.orm.delete(schema.moves).where(eq(schema.moves.gameId, game.id)).run();
      (st.events ?? []).forEach((e: { kind?: string }, seq: number) => {
        this.orm.insert(schema.events).values({ gameId: game.id, seq, kind: String(e.kind ?? ''), payload: JSON.stringify(e) }).run();
      });
      for (const [playerId, list] of Object.entries((st.play ?? {}) as Record<string, Move[]>)) {
        list.forEach((m, seq) => {
          this.orm.insert(schema.moves).values({
            gameId: game.id, playerId, username: usernames[playerId] ?? '', seq,
            skill: m.skill ?? null, points: m.points, rubric: m.rubric, round: m.round ?? null, why: m.why ?? '', source: m.from ?? '',
          }).run();
        });
      }
    })();
  }

  loadGame(id: string): Game | null {
    const row = this.orm.select({ state: schema.games.state, learning: schema.games.learning, note: schema.games.note })
      .from(schema.games).where(eq(schema.games.id, id)).get();
    if (!row) return null;
    const game = parse<Game | null>(row.state, null);
    return game && { ...game, learning: row.learning as Learning, note: row.note };
  }

  setCurrent(id: string) {
    this.orm.insert(schema.meta).values({ key: 'current', value: id }).onConflictDoUpdate({ target: schema.meta.key, set: { value: id } }).run();
  }

  loadCurrent(): Game | null {
    const row = this.orm.select().from(schema.meta).where(eq(schema.meta.key, 'current')).get();
    return row ? this.loadGame(row.value) : null;
  }

  hasGames(): boolean {
    return Boolean(this.orm.select({ id: schema.games.id }).from(schema.games).limit(1).get());
  }

  listGames({ learning }: { learning?: Learning } = {}): GameSummary[] {
    const rows = this.orm.select().from(schema.games)
      .where(learning ? eq(schema.games.learning, learning) : undefined)
      .orderBy(desc(schema.games.createdAt)).all();
    return rows.map((r) => {
      const g = parse<Game>(r.state, { players: [] } as unknown as Game);
      return {
        id: r.id,
        title: r.title,
        day: new Date(r.createdAt).toISOString().slice(0, 10),
        status: r.status,
        players: (g.players ?? []).map((p) => p.name),
        winner: (g.state?.result?.verdict?.winner as string | undefined) ?? null,
        learning: r.learning as Learning,
        note: r.note,
        createdAt: r.createdAt,
      };
    });
  }

  setLearning(id: string, learning: Learning, note?: string) {
    if (!LEARNING.includes(learning)) throw new DbError(`Unknown learning tag: ${learning}`);
    this.orm.update(schema.games).set({ learning, ...(note === undefined ? {} : { note: note.slice(0, 300) }) }).where(eq(schema.games.id, id)).run();
  }

  events(gameId: string) {
    return this.orm.select().from(schema.events).where(eq(schema.events.gameId, gameId)).orderBy(asc(schema.events.seq)).all()
      .map((e) => parse(e.payload, {}));
  }

  private realGameIds(): string[] {
    return this.orm.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.learning, 'real')).all().map((r) => r.id);
  }

  realMovesFor(username: string): StoredMove[] {
    const ids = this.realGameIds();
    if (!ids.length) return [];
    return this.orm.select().from(schema.moves)
      .where(and(eq(schema.moves.username, username), inArray(schema.moves.gameId, ids)))
      .orderBy(asc(schema.moves.gameId), asc(schema.moves.seq)).all()
      .map((m) => ({ gameId: m.gameId, playerId: m.playerId, username: m.username, skill: m.skill, points: m.points, rubric: m.rubric, round: m.round ?? undefined, why: m.why, from: m.source }));
  }

  realGamesFor(username: string): Game[] {
    return this.orm.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.learning, 'real')).orderBy(asc(schema.games.createdAt)).all()
      .map((r) => this.loadGame(r.id))
      .filter((g): g is Game => Boolean(g?.players?.some((p) => p.username === username)));
  }

  savePerson(p: Person) {
    const row = { username: p.username, name: p.name, answers: JSON.stringify(p.answers ?? []), createdAt: p.createdAt };
    this.orm.insert(schema.people).values(row).onConflictDoUpdate({ target: schema.people.username, set: { name: row.name, answers: row.answers } }).run();
  }

  person(username: string): Person | null {
    const r = this.orm.select().from(schema.people).where(eq(schema.people.username, username)).get();
    return r ? { username: r.username, name: r.name, answers: parse<Answer[]>(r.answers, []), createdAt: r.createdAt } : null;
  }

  peopleList(): { username: string; name: string }[] {
    return this.orm.select({ username: schema.people.username, name: schema.people.name }).from(schema.people).orderBy(asc(schema.people.username)).all();
  }

  savePlaytest(id: string, gameId: string, report: unknown, now = Date.now()) {
    const row = { id, gameId, report: JSON.stringify(report), createdAt: now };
    this.orm.insert(schema.playtests).values(row).onConflictDoUpdate({ target: schema.playtests.id, set: { report: row.report } }).run();
  }

  listPlaytests() {
    return this.orm.select().from(schema.playtests).orderBy(desc(schema.playtests.createdAt)).all()
      .map((r) => ({ id: r.id, gameId: r.gameId, report: parse(r.report, {}), createdAt: r.createdAt }));
  }
}

export function openDb(file: string): Db {
  mkdirSync(dirname(file), { recursive: true });
  let sqlite: Database.Database | null = null;
  try {
    sqlite = new Database(file);
    sqlite.pragma('journal_mode = WAL');
    const db = new Db(sqlite);
    migrate(db.orm, { migrationsFolder: MIGRATIONS });
    return db;
  } catch (err) {
    sqlite?.close();
    throw new DbError(`The game database is newer or broken: ${file} (${(err as Error).message})`);
  }
}
