import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import * as G from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { addCanon } from '../server/continuity.ts';
import { ASK_SCHEMA, PUBLIC_ANSWER_SCHEMA, VOICE_CHECK_SYSTEM, playSystem } from '../server/prompts.ts';
import { gameInReading, emptyAsk, makeScenario } from './fixtures.ts';

// In all four chaos playtests GM characters said what they could not know, then took it back about six
// times a game; a passport one player pocketed turned up in a desk for the next; and a photo one
// player saw in private was described in public answers.
function playing() {
  const game = gameInReading(3);
  game.scenario.truth.whereabouts = [{ time: '9pm', character_id: 'n1', location_id: 'l2', doing: 'Polishing glasses', seen_by: [] }];
  G.startPlay(game, 1_000);
  return game;
}

describe('the check before GM characters speak', () => {
  test('should show the check only what each speaker can know, never the truth', () => {
    const game = playing();
    game.state.knowledge = [{ character_id: 'n1', fact: 'Asha showed him a torn glove.', how: 'shown', round: 1 }];
    const [sheet] = G.voiceSheets(game, ['n1']);
    assert.equal(sheet.name, 'The Butler');
    assert.deepEqual(sheet.their_own_night, ['9pm: Kitchen, Polishing glasses']);
    assert.deepEqual(sheet.has_learned, ['Asha showed him a torn glove.']);
    assert.match(sheet.holds.join(' '), /Note: CLUE-3-SHOWS/);
    assert.doesNotMatch(JSON.stringify(sheet), /TRUTH-SUMMARY|METHOD|MOTIVE/);
    assert.match(VOICE_CHECK_SYSTEM, /You do not know the truth of the case/);
  });

  test('should drop only the flagged sentences of characters, and a line left empty', () => {
    const game = playing();
    const lines = [
      { speaker: '', text: 'The note was torn off his pad. The room is cold.' },
      { speaker: 'n1', text: 'I polished glasses all night. The note was torn off his pad and sent away.' },
      { speaker: 'The Butler', text: 'There is a second note in his room.' },
    ];
    const out = G.dropSpoken(game, lines, [{ speaker: 'The Butler', sentence: 'The note was torn off his pad and sent away.' }, { speaker: 'The Butler', sentence: 'There is a second note in his room.' }]);
    assert.equal(out.dropped, 2);
    assert.deepEqual(out.lines, [lines[0], { speaker: 'n1', text: 'I polished glasses all night.' }]);
  });

  test('should name who speaks by id or name, and nobody for narration or players', () => {
    const game = playing();
    assert.deepEqual(G.speakingCharacters(game, [{ speaker: '', text: 'x' }, { speaker: 'Character 2', text: 'x' }, { speaker: 'the butler', text: 'x' }, { speaker: 'n2', text: 'x' }]).sort(), ['n1', 'n2']);
  });

  function gmWith(check) {
    const calls = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts) => {
      calls.push(opts);
      if (opts.system === VOICE_CHECK_SYSTEM) return check(opts);
      if (opts.schema === PUBLIC_ANSWER_SCHEMA) return { lines: [{ speaker: 'n1', text: 'I was in the kitchen. Asha took the key.' }], ripple: '', refused: { refused: false, why: '' }, gm_characters_moved: [], asker_read: { intent: '', persona: '', facts: [], play: { points: 0, skill: 'none', why: '' } } };
      return { ...emptyAsk, lines: [{ speaker: 'n1', text: 'I was in the kitchen. Asha took the key.' }, { speaker: '', text: 'He wipes a glass.' }] };
    } });
    return { gm, calls };
  }

  test('should drop what a character could not know from a private answer', async () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'Where were you?' });
    const { gm, calls } = gmWith(() => ({ unsupported: [{ speaker: 'The Butler', sentence: 'Asha took the key.', why: 'he did not see it' }] }));
    const out = await gm.answer(game, 'p2', { kind: 'chat', text: 'Where were you?' });
    assert.deepEqual(out.lines, [{ speaker: 'n1', text: 'I was in the kitchen.' }, { speaker: '', text: 'He wipes a glass.' }]);
    const check = calls.find((c) => c.system === VOICE_CHECK_SYSTEM);
    assert.match(check.prompt, /Polishing glasses/);
    assert.doesNotMatch(check.prompt, /TRUTH-SUMMARY/);
    assert.match(check.prompt, /Where were you\?/);
  });

  test('should check an answer out loud the same way', async () => {
    const game = playing();
    const { gm } = gmWith(() => ({ unsupported: [{ speaker: 'n1', sentence: 'Asha took the key.', why: '' }] }));
    const out = await gm.publicAnswer(game, 'Butler, who took the key?', null, 'p2');
    assert.deepEqual(out.lines, [{ speaker: 'n1', text: 'I was in the kitchen.' }]);
  });

  test('should not run the check when no GM character speaks', async () => {
    const game = playing();
    const calls = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts) => (calls.push(opts), { ...emptyAsk, lines: [{ speaker: '', text: 'The room is empty.' }] }) });
    await gm.answer(game, 'p2', { kind: 'chat', text: 'I look around.' });
    assert.equal(calls.length, 1);
  });

  test('should let the lines through when the check fails', async () => {
    const game = playing();
    const { gm } = gmWith(() => { throw new Error('slow'); });
    const out = await gm.answer(game, 'p2', { kind: 'chat', text: 'Where were you?' });
    assert.equal(out.lines.length, 2);
    assert.equal(out.lines[0].text, 'I was in the kitchen. Asha took the key.');
  });
});

describe('a thing someone takes goes with them', () => {
  const answerWith = (game, pid, result) => {
    G.beginAsk(game, pid, { kind: 'question', text: 'I search.' });
    G.completeAsk(game, pid, { ...emptyAsk, ...result }, 2_000);
  };

  test('should ask the GM what the asker took, and tell it who carries what', () => {
    assert.ok(ASK_SCHEMA.properties.clues_taken);
    assert.match(playSystem(makeScenario(4)), /a carried thing is with its carrier/);
  });

  test('should keep a taken thing with its carrier, so nobody else finds it where it was', () => {
    const game = playing();
    answerWith(game, 'p2', { clues_found: ['c1'], clues_taken: ['c1'] });
    assert.equal(game.state.carried.c1, 'p2');
    answerWith(game, 'p3', { clues_found: ['c1'] });
    assert.equal(game.state.found.p3.includes('c1'), false);
    assert.deepEqual(G.snapshotForGM(game).things_carried, [{ thing: 'Torn glove', clue_id: 'c1', carried_by: 'Character 2' }]);
  });

  test('should only let a player take what they have found and nobody else carries', () => {
    const game = playing();
    assert.equal(G.takeClues(game, 'p2', ['c1']), 0, 'not found yet');
    game.state.found.p2.push('c1');
    game.state.found.p3.push('c1');
    assert.equal(G.takeClues(game, 'p2', ['c1']), 1);
    assert.equal(G.takeClues(game, 'p3', ['c1']), 0, 'already in someone else\'s hands');
  });
});

describe('a fact is public only if the room saw it', () => {
  test('should keep a private scene private even when the check marks it public', () => {
    const game = playing();
    addCanon(game, [{ fact: 'The butler showed Asha a polaroid of the drummers behind the throne.', about: [], public: true }], 2_000);
    assert.equal(game.state.canon.at(-1).public, false);
  });

  test('should keep a fact public when the room already heard it', () => {
    const game = playing();
    game.state.events.push({ at: 1_500, phase: 0, kind: 'event', text: 'The lights went out across the ballroom at nine.' });
    addCanon(game, [{ fact: 'The ballroom lights went out at nine.', about: [], public: true }], 2_000);
    assert.equal(game.state.canon.at(-1).public, true);
  });
});
