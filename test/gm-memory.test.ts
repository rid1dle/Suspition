import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { playSystem, publicSystem } from '../server/prompts.ts';
import { gameInReading, emptyAsk, emptyPhase } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(3, 1_000, { questions: true });
  game.setup.replays = 0;
  G.startPlay(game, 1_000);
  return game;
};

describe('GM characters remember what they said', () => {
  const said = (game) => {
    game.state.events.push({ at: 2_000, phase: 0, kind: 'qa', by: 'Player2', q: 'Butler, who stood at the door?', text: 'x', lines: [{ speaker: 'The Butler', text: 'I did not see who stood at the door.' }] });
    G.beginAsk(game, 'p3', { kind: 'question', text: 'Butler, was it me at the door?' });
    G.completeAsk(game, 'p3', { ...emptyAsk, lines: [{ speaker: 'n1', text: 'Yes, I believe you stood there after one.' }] }, 3_000);
  };

  test('should keep every line a GM character said, to the room or privately, in order', () => {
    const game = playing();
    said(game);
    assert.deepEqual(G.gmCharacterSaid(game)['The Butler'], [
      { round: 1, to: 'the room', text: 'I did not see who stood at the door.' },
      { round: 1, to: 'Player3, privately', text: 'Yes, I believe you stood there after one.' },
    ]);
  });

  test('should show the out-loud GM what the person asked has said before', () => {
    const game = playing();
    said(game);
    const sheet = G.peopleAsked(game, 'Butler, tell us again')[0];
    assert.equal(sheet.has_said.length, 2);
    assert.match(publicSystem(G.publicKnowledge(game), [sheet]), /has_said is what they already said/);
  });

  test('should show the private GM what every GM character has said', () => {
    const game = playing();
    said(game);
    assert.equal(G.snapshotForGM(game).what_gm_characters_have_said['The Butler'].length, 2);
    assert.match(playSystem(game.scenario), /A GM character never contradicts their own earlier words/);
  });

  test('should keep only the last lines so the prompt stays short', () => {
    const game = playing();
    for (let i = 0; i < 30; i += 1) game.state.events.push({ at: 2_000 + i, phase: 0, kind: 'qa', by: 'Player2', q: 'q', text: 'x', lines: [{ speaker: 'The Butler', text: `Line ${i}.` }] });
    const lines = G.gmCharacterSaid(game)['The Butler'];
    assert.equal(lines.length, 15);
    assert.equal(lines.at(-1).text, 'Line 29.');
  });
});

describe('round lines never carry a private card', () => {
  const secretWorld = () => {
    const game = playing();
    game.scenario.players[1].private_info = 'Your father Gopal Nath was freed from jail in 1980 and now lives in Srinagar.';
    return game;
  };

  test('should drop a reward that retells a fact only a private card holds', () => {
    const game = secretWorld();
    game.scenario.phases[0].reward = 'Gopal Nath did not die in jail. He was freed in 1980 and lives in Srinagar.';
    G.beginRoundVote(game, 2_000);
    for (const p of game.players) G.voteRound(game, p.id, 1, 2_100);
    const line = game.state.events.find((e) => e.kind === 'round').text;
    assert.match(line, /That is right!/);
    assert.doesNotMatch(line, /Srinagar/);
    assert.equal(game.state.timelineExtra.length, 0);
  });

  test('should keep a reward once the room has heard that fact out loud', () => {
    const game = secretWorld();
    G.addFacts(game, [{ person: 'p2', fact: 'Said out loud: "My father Gopal Nath was freed from jail in 1980 and lives in Srinagar."' }], 'said', 1_500);
    game.state.events.push({ at: 1_500, phase: 0, kind: 'said', text: 'Player2 said: "My father Gopal Nath was freed from jail in 1980 and lives in Srinagar."' });
    game.scenario.phases[0].reward = 'Gopal Nath was freed in 1980 and lives in Srinagar.';
    G.beginRoundVote(game, 2_000);
    for (const p of game.players) G.voteRound(game, p.id, 1, 2_100);
    assert.match(game.state.events.find((e) => e.kind === 'round').text, /Srinagar/);
  });

  test('should cut the sentence of a round event that carries a private card, and keep the rest', () => {
    const game = secretWorld();
    G.beginPhaseChange(game);
    G.completePhase(game, { ...emptyPhase, public_event: 'A storm hits the train. Gopal Nath was freed in 1980 and lives in Srinagar.' }, 3_000);
    const texts = game.state.events.map((e) => e.text);
    assert.ok(texts.includes('A storm hits the train.'));
    assert.ok(!texts.some((t) => /Srinagar/.test(t)));
  });
});
