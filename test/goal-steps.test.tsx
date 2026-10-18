import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM, ASK_SCHEMA, PHASE_SCHEMA, playSystem } from '../server/prompts.ts';
import { phoneAlerts } from '../src/lib/alerts';
import { GoalsPanel } from '../src/components/game/panels';
import { gameInReading, emptyAsk, emptyPhase } from './fixtures.ts';

const STEPS = ['Find out who has the letter.', 'Get the letter away from them.', 'Burn it before the final vote.'];
const playing = () => {
  const game = gameInReading(3);
  game.scenario.players[1].goal_steps = STEPS;
  G.startPlay(game, 1_000);
  return game;
};
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('working toward your own goal', () => {
  test('should ask the GM for goal steps and to tick them off', () => {
    assert.ok(SCENARIO_SCHEMA.properties.players.items.properties.goal_steps);
    assert.match(GENERATION_SYSTEM, /goal_steps: 2 or 3 concrete things to do in the story/);
    assert.deepEqual(ASK_SCHEMA.properties.goal_steps_done, { type: 'array', items: { type: 'integer' } });
    assert.ok(PHASE_SCHEMA.properties.goal_steps_done);
    assert.match(playSystem({}), /goal_steps_done: the positions \(from 0\) of the asker's own goal_steps/);
  });

  test("should tick off a step the player's move completed, on their card only", () => {
    const game = playing();
    assert.deepEqual(G.playerView(game, 'p2').card.goal_steps, STEPS.map((t) => ({ text: t, done: false })));
    G.beginAsk(game, 'p2', { kind: 'question', text: 'I ask who had the letter.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, goal_steps_done: [0, 7] }, 2_000);
    assert.deepEqual(G.playerView(game, 'p2').card.goal_steps.map((s) => s.done), [true, false, false]);
    assert.ok(!JSON.stringify([G.tableView(game), G.playerView(game, 'p3')]).includes('Find out who has the letter'));
    assert.deepEqual(G.snapshotForGM(game).goal_steps_done_so_far, { p1: [], p2: [0], p3: [] });
  });

  test('should not tick a step for a refused move', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'action', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, goal_steps_done: [0], refused: { refused: true, why: 'No.' } }, 2_000);
    assert.deepEqual(G.playerView(game, 'p2').card.goal_steps.map((s) => s.done), [false, false, false]);
  });

  test('should tick steps at a round change for any player', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, goal_steps_done: [{ player_id: 'p2', step: 1 }, { player_id: 'zz', step: 0 }] }, 2_000);
    assert.deepEqual(G.playerView(game, 'p2').card.goal_steps.map((s) => s.done), [false, true, false]);
  });

  test('should alert the player when a step is done', () => {
    const before = { gameId: 'g', me: { id: 'p2' }, thread: [], clues: [], card: { goal: 'G', goal_steps: [{ text: 'A', done: false }, { text: 'B', done: false }] } };
    const after = { ...before, card: { goal: 'G', goal_steps: [{ text: 'A', done: true }, { text: 'B', done: false }] } };
    assert.deepEqual(phoneAlerts(before, after).map((a) => a.text), ['Goal step done: A']);
  });

  test('should show the steps and how far along you are', () => {
    const out = text(<GoalsPanel caseQuestion="Q?" goal="Burn the letter." steps={[{ text: 'Find the letter.', done: true }, { text: 'Burn it.', done: false }]} />);
    assert.match(out, /Your own goal: Burn the letter\. \(1 of 2 done\)/);
    assert.match(out, /✓ Find the letter\./);
    assert.match(out, /○ Burn it\./);
  });
});

describe('goal steps reach the round change and the score', () => {
  test('should ask for goal steps at a round change and use them in the score', async () => {
    const { phasePrompt, scorePrompt } = await import('../server/prompts.ts');
    assert.match(phasePrompt({ snapshot: {}, nextPhase: { name: 'N', planned_beat: 'B' }, lastRound: null }), /goal_steps_done: any player's goal_steps/);
    assert.match(scorePrompt({ snapshot: {}, submissions: {}, verdict: {} }), /goal_steps_done_so_far shows which steps/);
  });
});
