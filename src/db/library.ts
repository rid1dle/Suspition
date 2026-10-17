import { forDataset } from '../../server/game.ts';
import { usernameFor } from '../../server/profiles.ts';
import { totalLine } from '../lib/score.ts';
import { LEARNING, type Db, type GameSummary } from './index.ts';
import type { Game, Learning } from '../../server/types.ts';

export type SamePerson = Record<string, 'same' | 'different'>;
export type ImportResult = { imported: string } | { skipped: string } | { ask: { username: string; name: string }[] };

export class ImportError extends Error {}

const GAME_ID = /^[a-z0-9-]{1,40}$/;

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

  // One game for the host: who played, how it ended, and its playtest report. The story and scores
  // only once the game was revealed, so an unfinished game never shows the truth.
  detail(id: string) {
    const summary = this.db.listGames().find((g) => g.id === id);
    const game = summary && this.db.loadGame(id);
    if (!summary || !game) return null;
    const result = game.status === 'reveal' ? game.state?.result : null;
    const cards = game.scenario?.players ?? [];
    return {
      summary,
      setting: String(game.setup?.setting ?? ''),
      story: result ? String(result.reveal_story ?? '') : null,
      players: game.players.map((p) => {
        const r = result?.players?.find((x: { player_id: string }) => x.player_id === p.id);
        const card = cards.find((c) => c.id === p.id);
        return { name: p.name, username: p.username ?? '', character: result ? card?.character_name ?? '' : '', side: result ? card?.side ?? '' : '', total: r ? totalLine(r) : '', coaching: r?.coaching ?? '' };
      }),
      playtest: this.db.listPlaytests().find((t) => t.gameId === id)?.report ?? null,
    };
  }

  usernamesIn(id: string): string[] {
    return (this.db.loadGame(id)?.players ?? []).map((p) => p.username).filter((u): u is string => Boolean(u));
  }

  importGame(input: unknown, answers: SamePerson = {}, now = Date.now()): ImportResult {
    const game = input as Game;
    if (!game || typeof game.id !== 'string' || !GAME_ID.test(game.id) || !Array.isArray(game.players)) throw new ImportError('That is not a saved game.');
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
