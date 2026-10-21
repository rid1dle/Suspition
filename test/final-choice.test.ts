import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { CRAFT_SCHEMA, STORY_DRESS, scorePrompt, phasePrompt } from '../server/prompts.ts';
import { applyDress, placeFinalChoice } from '../server/craft.ts';
import { gameInReading, makeScenario, emptyPhase } from './fixtures.ts';

// The design editor's top note for 9 in 2 of 3 live worlds: "build the final vote as a real moral choice" (name the
// man who may hang for a mercy killing, take the inspector's deal, or make the letter public). The world now plans
// one; it is the last round's vote, and the ending says what the room's choice did.
const choice = { question: 'What does the room do with Dada\'s letter?', options: [{ choice: 'Give it to the inspector', then: 'The mine is shut and the strikers are paid.' }, { choice: 'Burn it before dawn', then: 'The company wins, and the secret dies with Dada.' }] };

describe('the room faces a real choice at the end', () => {
  test('should ask the story pass for a final choice and what each option leads to', () => {
    const fc = CRAFT_SCHEMA.properties.final_choice;
    assert.ok(fc, 'final_choice in the dress schema');
    assert.ok(CRAFT_SCHEMA.required.includes('final_choice'));
    assert.match(STORY_DRESS, /final_choice: beyond who did it/);
  });

  test('should keep a final choice with 2 to 4 options', () => {
    const s = makeScenario(3, { phases: 3 });
    applyDress(s, { final_choice: choice });
    assert.deepEqual(s.final_choice, choice);
  });

  test('should drop a final choice with one option, or one that names a culprit', () => {
    const s = makeScenario(3, { phases: 3 });
    applyDress(s, { final_choice: { ...choice, options: [choice.options[0]] } });
    assert.equal(s.final_choice, undefined);
    applyDress(s, { final_choice: { ...choice, options: [...choice.options, { choice: 'Hand Character 1 to the police', then: 'x' }] } });
    assert.equal(s.final_choice, undefined, 'the vote comes before anyone is named');
  });

  test('should make the final choice the last round\'s vote', () => {
    const s = makeScenario(3, { phases: 3, questions: true });
    s.final_choice = choice;
    placeFinalChoice(s);
    const last = s.phases.at(-1);
    assert.equal(last.vote_kind, 'choice');
    assert.equal(last.choice_question, choice.question);
    assert.deepEqual(last.choice_options, ['Give it to the inspector', 'Burn it before dawn']);
    assert.equal(s.phases[0].vote_kind, undefined);
  });

  test('should tell the scorer what the room chose and what it leads to', () => {
    const game = gameInReading(3, 1_000, { phases: 2, questions: true });
    game.scenario.final_choice = choice;
    placeFinalChoice(game.scenario);
    G.startPlay(game, 1_000);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    game.state.roundResults.push({ kind: 'choice', phaseIndex: 1, round: 2, question: choice.question, picked: 1, pickedText: 'Burn it before dawn', correct: null, counts: [1, 2] });
    assert.deepEqual(G.snapshotForGM(game).final_choice_made, { question: choice.question, chose: 'Burn it before dawn', then: 'The company wins, and the secret dies with Dada.' });
    assert.match(scorePrompt({ snapshot: {}, submissions: [], verdict: {} }), /final_choice_made/);
  });
});

describe('the planned final choice holds', () => {
  test('should keep the final choice when the round change asks for another vote', () => {
    const game = gameInReading(3, 1_000, { phases: 2, questions: true });
    game.scenario.final_choice = choice;
    placeFinalChoice(game.scenario);
    G.startPlay(game, 1_000);
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, vote: { kind: 'choice', question: 'Who should guard the gate?', options: ['Kabir', 'Zoya'] } }, 2_000);
    const q = G.roundQuestion(game, 1);
    assert.equal(q.kind, 'choice');
    assert.equal(q.question, choice.question);
  });
});

describe('the last round sets the choice up', () => {
  test('should tell the GM to show what is at stake in each option', () => {
    assert.match(phasePrompt({ snapshot: {}, nextPhase: { name: 'R3', objective: 'O', planned_beat: 'B', last: true }, lastRound: null }), /The round ends on the world's final_choice: show what is at stake in each option/);
  });
});
