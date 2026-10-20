import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import * as G from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { generationPrompt, storyCheckPrompt, voiceCheckPrompt, VOICE_CHECK_SYSTEM, PUBLIC_ANSWER_SCHEMA } from '../server/prompts.ts';
import { gameInReading, emptyAsk, emptyPhase, makeScenario } from './fixtures.ts';

// From the second story playtest: worlds of 22 to 29 clues where players reach 15 to 19, holes in dates
// and physical sense, a GM character in two places at once, and the same question answered the same way.
describe('a world sized to what players reach', () => {
  test('should give the world a clue budget of two per player and two more, each clue doing two jobs', () => {
    const game = gameInReading(8);
    assert.match(generationPrompt(game), /Clue budget: at most 18 clues in all/);
    assert.match(generationPrompt(game), /every clue must earn its place by doing two jobs/);
  });

  test('should check dates against tonight and physical sense before anyone plays', () => {
    const p = storyCheckPrompt(makeScenario(4));
    assert.match(p, /13\. Dates and times agree everywhere: nothing in a clue, a card or the truth is dated after tonight/);
    assert.match(p, /14\. Physical sense: how long things take/);
  });

  test('should fire a setup nobody found, as a missed turn', () => {
    const game = gameInReading(4);
    game.scenario.setups = [{ id: 's1', detail: 'The ledger.', shown_in: 'background', shown_round: 0, paid_by: 'c3', how_paid: 'x' }];
    G.startPlay(game, 1_000);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.deepEqual(game.state.turnsSurfaced.map((t) => t.clueId), ['c3']);
  });
});

describe('a GM character is where the game says', () => {
  test('should check narration that names a GM character, with where the asker is', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    assert.deepEqual(G.speakingCharacters(game, [{ speaker: '', text: 'The Butler grabs the notebook in your hand.' }], { named: true }), ['n1']);
    assert.deepEqual(G.speakingCharacters(game, [{ speaker: '', text: 'The Butler grabs the notebook in your hand.' }]), []);
    assert.match(voiceCheckPrompt({ sheets: [], everyone: {}, heard: '', lines: [], here: 'Kitchen' }), /^asker_is_at: Kitchen/);
    assert.match(VOICE_CHECK_SYSTEM, /in narration \(empty speaker\): a sentence that puts a character physically with the player/);
  });

  test('should drop a flagged narration sentence that puts a GM character beside the player', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const lines = [{ speaker: '', text: 'Rain drums on the roof. The Butler grabs the notebook in your hand.' }];
    const out = G.dropSpoken(game, lines, [{ speaker: '', sentence: 'The Butler grabs the notebook in your hand.' }]);
    assert.deepEqual(out.lines, [{ speaker: '', text: 'Rain drums on the roof.' }]);
  });
});

describe('a question asked again gets something new', () => {
  test('should find the earlier question out loud, and a private one with its answer', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    game.state.events.push({ at: 1_500, phase: 0, kind: 'qa', by: 'Character 2', pid: 'p2', q: 'Who signed out the size ten gumboots?', text: 'Nobody steps forward.' });
    assert.deepEqual(G.askedBefore(game, 'Who signed out the size ten gumboots tonight?', { out_loud: true }), { asked: 'Who signed out the size ten gumboots?', answered: 'Nobody steps forward.' });
    assert.equal(G.askedBefore(game, 'Where is the loupe?', { out_loud: true }), null);
    game.state.threads.p2.push({ from: 'you', text: 'I ask Chhotu about the thermos.', at: 1_600 }, { from: 'gm', text: 'He shrugs.', at: 1_700 }, { from: 'you', text: 'I ask Chhotu about the thermos again.', at: 1_800 });
    assert.deepEqual(G.askedBefore(game, 'I ask Chhotu about the thermos again.', { playerId: 'p2' }), { asked: 'I ask Chhotu about the thermos.', answered: 'He shrugs.' });
  });

  test('should tell the GM not to give the same answer again', async () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    game.state.events.push({ at: 1_500, phase: 0, kind: 'qa', by: 'Character 2', pid: 'p2', q: 'Who signed out the size ten gumboots?', text: 'Nobody steps forward.' });
    const prompts = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts) => (prompts.push(opts.prompt), opts.schema === PUBLIC_ANSWER_SCHEMA ? { lines: [{ speaker: '', text: 'Silence.' }], ripple: '', refused: { refused: false, why: '' }, gm_characters_moved: [], asker_read: { intent: '', persona: '', facts: [], play: { points: 0, skill: 'none', why: '' } } } : { ...emptyAsk }) });
    await gm.publicAnswer(game, 'Who signed out the size ten gumboots tonight?', null, 'p3');
    assert.match(prompts[0], /^This was already asked and answered[^]*Do not give that answer again/);
  });
});

describe('the knowledge check drops only what it is sure of', () => {
  test('should keep a sentence the check listed but marked as one they could know', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const lines = [{ speaker: 'n1', text: 'Meera holds a key. Ask her.' }];
    assert.equal(G.dropSpoken(game, lines, [{ speaker: 'n1', sentence: 'Meera holds a key.', could_know: true }]).dropped, 0);
    assert.equal(G.dropSpoken(game, lines, [{ speaker: 'n1', sentence: 'Meera holds a key.', could_know: false }]).dropped, 1);
    assert.match(VOICE_CHECK_SYSTEM, /a cook's bin, a clerk's register/);
  });
});
