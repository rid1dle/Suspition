import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import * as G from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { VOICE_CHECK_SCHEMA, VOICE_CHECK_SYSTEM, ASK_SCHEMA } from '../server/prompts.ts';
import { gameInReading } from './fixtures.ts';

// From story runs 4 and 5: a whisper said "Right beside you, Kabir leans over the bar" while Kabir was in the office.
function playing() {
  const game = gameInReading(4);
  G.startPlay(game, 1_000);
  game.state.at = { ...(game.state.at ?? {}), p2: 'l1', p3: 'l2' };
  return game;
}
const beside = [{ speaker: '', text: 'Right beside you, Character 3 pulls the drawer open.' }];

describe('narration never puts another player somewhere they are not', () => {
  test('should send a player named in narration to the check, with where they are now', () => {
    const game = playing();
    assert.deepEqual(G.speakingCharacters(game, beside, { named: true, players: true }), ['p3']);
    assert.deepEqual(G.speakingCharacters(game, beside, { named: true }), []);
    const [sheet] = G.voiceSheets(game, ['p3']);
    assert.deepEqual(sheet, { name: 'Character 3', player_character: true, is_now_at: 'Kitchen' });
  });

  test('should drop a flagged narration sentence that names another player', () => {
    const game = playing();
    const out = G.dropSpoken(game, [...beside, { speaker: '', text: 'The lamp hisses.' }], [{ speaker: '', sentence: 'Right beside you, Character 3 pulls the drawer open.', why: 'in the kitchen', could_know: false }]);
    assert.deepEqual(out.lines.map((l) => l.text), ['The lamp hisses.']);
  });

  test('should check a reply whose narration names only a player', async () => {
    const game = playing();
    const calls = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts) => (calls.push(opts), { unsupported: [{ speaker: '', sentence: 'Right beside you, Character 3 pulls the drawer open.', why: 'in the kitchen', could_know: false }] }) });
    const kept = await gm.checkVoices(game, beside, 'I search the bar.', 'Ballroom');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].schema, VOICE_CHECK_SCHEMA);
    assert.match(calls[0].prompt, /"player_character":true,"is_now_at":"Kitchen"/);
    assert.deepEqual(kept, []);
  });

  test('should tell the check that another player\'s character counts too', () => {
    assert.match(VOICE_CHECK_SYSTEM, /a GM character or another player's character/);
  });
});

describe('a message about one player\'s move, sent to another, fits where the other one is', () => {
  const whisperToP3 = { player_id: 'p3', text: 'Right beside you, Character 2 pulls your till drawer open. The coins rattle.' };
  const fake = (flag) => {
    const calls = [];
    const run = async (opts) => {
      calls.push(opts);
      if (opts.schema === ASK_SCHEMA) return { answer: 'You open the drawer.', lines: [{ speaker: '', text: 'You ease the drawer open.' }], messages_to_players: [whisperToP3, { player_id: 'p4', text: 'A drawer scrapes somewhere.' }], player_location: 'l1' };
      return { unsupported: flag && /Right beside you/.test(opts.prompt) ? [{ speaker: '', sentence: 'Right beside you, Character 2 pulls your till drawer open.', why: 'not with them', could_know: false }] : [] };
    };
    return { calls, gm: new GM({ workDir: tmpdir(), run }) };
  };

  test('should check a message to another player against where that player is, and where the mover went', async () => {
    const game = playing();
    game.state.at.p2 = 'l2';
    const { gm, calls } = fake(true);
    const result = await gm.answer(game, 'p2', { kind: 'action', text: 'I open the till.' });
    const check = calls.find((c) => c.schema === VOICE_CHECK_SCHEMA && /Right beside you/.test(c.prompt));
    assert.ok(check, 'the message was checked');
    assert.match(check.prompt, /^asker_is_at: Kitchen/);
    assert.match(check.prompt, /"name":"Character 2","player_character":true,"is_now_at":"Ballroom"/);
    assert.deepEqual(result.messages_to_players.map((m) => m.text), ['A drawer scrapes somewhere.'], 'the whole scene goes');
  });

  test('should keep a message the check finds fine', async () => {
    const game = playing();
    const { gm } = fake(false);
    const result = await gm.answer(game, 'p2', { kind: 'action', text: 'I open the till.' });
    assert.equal(result.messages_to_players[0].text, whisperToP3.text);
  });
});
