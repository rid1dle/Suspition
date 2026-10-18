import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM } from './fixtures.ts';

describe('the round-change check reads the new round', () => {
  test("should start the round check after the new round's event is written", async () => {
    const gm = new FakeGM();
    gm.phaseResult = { public_event: 'THE-NEW-ROUND-EVENT', messages_to_players: [], clues_destroyed: [], suspicion_change: 0 };
    const seen = [];
    const base = gm.continuity.bind(gm);
    gm.continuity = (game, reason) => {
      seen.push({ reason, phaseIndex: game.state.phaseIndex, event: game.state.events.some((e) => e.text === 'THE-NEW-ROUND-EVENT') });
      return base(game, reason);
    };
    const app = await new App({ gm, store: new MemoryStore(), clock: () => 1_000 }).init();
    for (const name of ['A', 'B', 'C']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    await app.start(app.game.hostToken);
    app.advance();
    await app.idle();
    assert.deepEqual(seen, [{ reason: 'round', phaseIndex: 1, event: true }]);
  });
});
