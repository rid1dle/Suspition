import { forDataset } from '../../server/game.ts';
import { usernameFor } from '../../server/profiles.ts';
import { LEARNING, type Db, type GameSummary } from './index.ts';
import type { Game, Learning } from '../../server/types.ts';

export type SamePerson = Record<string, 'same' | 'different'>;
export type ImportResult = { imported: string } | { skipped: string } | { ask: { username: string; name: string }[] };

export class ImportError extends Error {}

// The host's view of every saved game: which ones teach the game, and bringing in games from elsewhere.
export class GameLibrary {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  list(): GameSummary[] {
    return this.db.listGames();
  }

  setLearning(id: string, learning: Learning, note?: string) {
    this.db.setLearning(id, learning, note);
  }

  usernamesIn(id: string): string[] {
    return (this.db.loadGame(id)?.players ?? []).map((p) => p.username).filter((u): u is string => Boolean(u));
  }

  importGame(input: unknown, answers: SamePerson = {}, now = Date.now()): ImportResult {
    const game = input as Game;
    if (!game || typeof game.id !== 'string' || !Array.isArray(game.players)) throw new ImportError('That is not a saved game.');
    if (this.db.loadGame(game.id)) return { skipped: game.id };
    const known = this.db.allUsernames();
    const clashes = game.players.filter((p) => p.username && known.has(p.username));
    const unanswered = clashes.filter((p) => !answers[p.username!]);
    if (unanswered.length) return { ask: unanswered.map((p) => ({ username: p.username!, name: p.name })) };
    const copy = forDataset(game) as Game;
    const taken = [...known];
    for (const p of copy.players) {
      if (!p.username) continue;
      if (answers[p.username] === 'different') {
        p.username = usernameFor(p.username, taken);
      }
      taken.push(p.username);
      if (!this.db.person(p.username)) this.db.savePerson({ username: p.username, name: p.name, answers: [], createdAt: now });
    }
    const learning: Learning = LEARNING.includes(copy.learning as Learning) ? (copy.learning as Learning) : 'real';
    this.db.saveGame({ ...copy, learning, note: String(copy.note ?? '') }, now);
    return { imported: copy.id };
  }
}
