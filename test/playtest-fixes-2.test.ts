import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { askPrompt } from '../server/prompts.ts';
import { gameInReading, emptyAsk, emptyPhase } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(3, 1_000, { questions: true });
  game.setup.replays = 0;
  G.startPlay(game, 1_000);
  return game;
};

describe('fixes from the story playtest, game 2', () => {
  test('should end a meeting when the round changes', () => {
    const game = playing();
    G.callMeeting(game, 'p1', 'Listen', 2_000);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 3_000);
    assert.equal(game.state.meeting, null);
    assert.ok(game.state.events.some((e) => e.text === 'The meeting is over.'));
  });

  test('should end a meeting when a vote starts', () => {
    const game = playing();
    G.callMeeting(game, 'p1', 'Listen', 2_000);
    G.beginRoundVote(game, 2_500);
    assert.equal(game.state.meeting, null);
  });

  test('should never add a quiz round whose right answer names the culprit', () => {
    const game = playing();
    assert.ok(G.addRound(game, { name: 'Who was free', objective: '', planned_beat: 'B', question: 'Who was free at midnight?', options: ['Character 1', 'Character 2'], answer_index: 0, reward: '', wrong_nudge: '' }, 2_000));
    const at = game.scenario.phases.findIndex((p) => p.name === 'Who was free');
    const added = game.scenario.phases[at];
    assert.equal(G.roundQuestion(game, at).kind, 'spotlight');
    assert.equal(added.answer_index, undefined);
  });

  test('should never take points for an act the game held back', () => {
    const game = playing();
    game.state.questionsLeft.p2 = 0;
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I take the ledger.' });
    G.settleAct(game, 'p2', { kind: 'action', acts: true });
    G.completeAsk(game, 'p2', { ...emptyAsk, play: { points: -1, skill: 'breaking', why: 'Tried to act.' } }, 2_000);
    assert.ok((game.state.play.p2 ?? []).every((m) => m.points >= 0));
  });

  test('should tell the GM a held act waits, and is never the player choosing not to', () => {
    const p = askPrompt({ snapshot: {}, player: { id: 'p1', character_name: 'Ana' }, kind: 'chat', text: 'x', talk: true, noActs: true });
    assert.match(p, /Never write that the character chose not to do it/);
  });
});
