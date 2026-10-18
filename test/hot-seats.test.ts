import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';

const hotGame = (n = 3, opts = {}) => {
  const game = gameInReading(n, 1_000, opts);
  game.setup.roundStyle = 'hotseats';
  return game;
};

describe('hook-first card', () => {
  const audit = (over = {}) => ({ players: [{ player_id: 'p2', hook: 'You are the cook who hides a debt.', distrusts: 'p3', distrust_why: 'She was near the shed.', reveals: ['Line one.', 'Line two.', 'Line three.', 'Line four.'], ...over }] });

  test('should keep a hook, a distrust and three reveal lines from the card check', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit());
    const p2 = game.scenario.players.find((p) => p.id === 'p2');
    assert.deepEqual([p2.hook, p2.distrusts, p2.distrust_why, p2.reveals], ['You are the cook who hides a debt.', 'p3', 'She was near the shed.', ['Line one.', 'Line two.', 'Line three.']]);
  });

  test('should drop a distrust that points at yourself or at nobody, and reveals that name the culprit', () => {
    for (const bad of ['p2', 'zz']) {
      const game = hotGame();
      G.applyAudit(game.scenario, audit({ distrusts: bad }));
      assert.equal(game.scenario.players.find((p) => p.id === 'p2').distrusts ?? '', '');
    }
    const game = hotGame();
    G.applyAudit(game.scenario, audit({ reveals: ['Character 1 did it.', 'Safe line.'] }));
    assert.deepEqual(game.scenario.players.find((p) => p.id === 'p2').reveals, ['Safe line.']);
  });

  test('should open the card on the hook and keep drives and reasons locked at first', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit({ wants: 'W', fears: 'F', reasons: ['R'] }));
    G.startPlay(game, 1_000);
    const card = G.playerView(game, 'p2').card;
    assert.equal(card.hook, 'You are the cook who hides a debt.');
    assert.equal(card.distrusts, game.scenario.players.find((p) => p.id === 'p3').character_name);
    assert.deepEqual(card.locked, ['drives', 'reasons']);
    assert.deepEqual([card.wants, card.fears, card.reasons], ['', '', []]);
  });

  test('should unlock drives after the first seat and reasons after the second', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit({ wants: 'W', fears: 'F', reasons: ['R'] }));
    G.startPlay(game, 1_000);
    G.unlockCard(game, 'p2', 'drives');
    assert.deepEqual(G.playerView(game, 'p2').card.locked, ['reasons']);
    assert.equal(G.playerView(game, 'p2').card.wants, 'W');
    G.unlockCard(game, 'p2', 'reasons');
    assert.deepEqual(G.playerView(game, 'p2').card.reasons, ['R']);
  });

  test('should never lock a classic game', () => {
    const game = gameInReading(3, 1_000);
    G.applyAudit(game.scenario, audit({ wants: 'W' }));
    G.startPlay(game, 1_000);
    assert.deepEqual(G.playerView(game, 'p2').card.locked, []);
  });

  test('should never send reveal lines to a phone', () => {
    const game = hotGame();
    G.applyAudit(game.scenario, audit());
    G.startPlay(game, 1_000);
    for (const p of game.players) assert.ok(!JSON.stringify(G.playerView(game, p.id)).includes('Line one.'));
    assert.ok(!JSON.stringify(G.tableView(game)).includes('Line one.'));
  });
});
