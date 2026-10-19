import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { planCulprits, pickTwists, generationPrompt, GENERATION_SYSTEM, playSystem, auditPrompt, STORY_TYPES } from '../server/prompts.ts';
import { makeScenario, gameInReading, emptyPhase } from './fixtures.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lobby = (n) => {
  const game = G.createGame(1_000);
  for (let i = 0; i < n; i += 1) G.addPlayer(game, { name: `P${i + 1}` });
  return game;
};
const base = { tone: 'tense', length: 'short', hints: 2 };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('one or two players', () => {
  test('should set up a game for one player and for two', () => {
    assert.doesNotThrow(() => G.applySetup(lobby(1), base));
    assert.doesNotThrow(() => G.applySetup(lobby(2), base));
  });

  test('should play classic rounds under 3 players, since hot seats need others', () => {
    assert.equal(G.applySetup(lobby(2), { ...base, roundStyle: 'hotseats' }).roundStyle, 'classic');
    assert.equal(G.applySetup(lobby(3), { ...base, roundStyle: 'hotseats' }).roundStyle, 'hotseats');
  });

  test('should not offer a meeting to a player alone', () => {
    const game = gameInReading(1);
    G.startPlay(game, 1_000);
    assert.equal(G.playerView(game, 'p1', 2_000).canCallMeeting, false);
    assert.throws(() => G.callMeeting(game, 'p1', '', 2_000), /Meetings need 2 players or more/);
  });

  test('should add a plain round, not a spotlight, when a small game needs more time', () => {
    const game = gameInReading(2, 1_000, { phases: 3 });
    game.setup.replays = 0;
    G.startPlay(game, 1_000);
    game.state.continuity = { log: [{ solvable: false }] };
    G.completePhase(game, emptyPhase, 2_000);
    G.paceStory(game, 3_000);
    assert.notEqual(game.scenario.phases[2].vote_kind, 'spotlight');
  });

  test('should never draw twists that need more players or an innocent player', () => {
    for (let i = 0; i < 60; i += 1) {
      const solo = pickTwists(1, Math.random, { innocents: 0 }).map((t) => t.id);
      for (const id of ['wildcard', 'peek', 'alliance', 'framed', 'unaware-accomplice', 'culprit-team']) assert.ok(!solo.includes(id), id);
      const pair = pickTwists(2, Math.random, { innocents: 1 }).map((t) => t.id);
      for (const id of ['wildcard', 'culprit-team']) assert.ok(!pair.includes(id), id);
    }
  });
});

describe('who did it: one of us or a GM character', () => {
  test('should let the GM decide by default, and whether the culprit knows', () => {
    const setup = G.applySetup(lobby(4), base);
    assert.equal(setup.culpritWho, 'gm');
    assert.equal(setup.culpritKnows, 'gm');
  });

  test('should keep the host choice and refuse anything else', () => {
    const setup = G.applySetup(lobby(4), { ...base, culpritWho: 'npc', culpritKnows: 'later' });
    assert.equal(setup.culpritWho, 'npc');
    assert.equal(setup.culpritKnows, 'later');
    assert.throws(() => G.applySetup(lobby(4), { ...base, culpritWho: 'dog' }), /Pick who did it/);
    assert.throws(() => G.applySetup(lobby(4), { ...base, culpritKnows: 'maybe' }), /Pick whether the culprit knows/);
  });

  test('should need an important GM character for a GM character culprit', () => {
    assert.throws(() => G.applySetup(lobby(3), { ...base, culpritWho: 'npc', npcs: 0 }), /A GM character culprit needs at least 1 GM character/);
    assert.throws(() => G.applySetup(lobby(3), { ...base, culpritWho: 'npc', npcRole: 'background' }), /A GM character culprit needs GM characters who matter to the case/);
  });

  test('should allow two GM character culprits in a small group, with 2 GM characters', () => {
    assert.equal(G.applySetup(lobby(2), { ...base, culpritWho: 'npc', culprits: 2, npcs: 2 }).culprits, 2);
    assert.throws(() => G.applySetup(lobby(2), { ...base, culpritWho: 'npc', culprits: 2, npcs: 1 }), /Two GM character culprits need 2 GM characters/);
    assert.throws(() => G.applySetup(lobby(4), { ...base, culprits: 2 }), /Two culprits need 6 players or more/);
  });
});

describe('the game plans the culprits in code', () => {
  const plan = (over = {}, random = seq(0.1)) => planCulprits({ players: 4, npcs: 3, npcRole: 'mixed', phases: 4, culprits: 'gm', who: 'gm', knows: 'gm', ...over }, random);

  test('should pick a GM character when the host asked for one', () => {
    const p = plan({ who: 'npc' });
    assert.deepEqual(p.ids, ['n1']);
    assert.equal(p.who, 'npc');
    assert.deepEqual(p.unaware, []);
  });

  test('should pick a player when the host asked for one of us, and let them know from the start', () => {
    const p = plan({ who: 'player', knows: 'start' });
    assert.equal(p.ids.length, 1);
    assert.match(p.ids[0], /^p\d$/);
    assert.deepEqual(p.unaware, []);
    assert.equal(p.awakenRound, null);
  });

  test('should hide it from a player culprit who finds out later, and tell them near the end', () => {
    const p = plan({ who: 'player', knows: 'later' });
    assert.deepEqual(p.unaware, p.ids);
    assert.equal(p.awakenRound, 3);
  });

  test('should never tell a player alone: they find out from the clues', () => {
    const p = plan({ players: 1, who: 'player', knows: 'start' });
    assert.deepEqual(p.ids, ['p1']);
    assert.deepEqual(p.unaware, ['p1']);
    assert.equal(p.awakenRound, null);
  });

  test('should pick a player when the GM decides and there is no GM character who can be one', () => {
    for (let i = 0; i < 20; i += 1) assert.match(plan({ npcs: 0 }, Math.random).ids[0], /^p/);
    for (let i = 0; i < 20; i += 1) assert.match(plan({ npcRole: 'background' }, Math.random).ids[0], /^p/);
  });

  test('should sometimes pick a GM character and sometimes hide it when the GM decides', () => {
    const whos = new Set();
    const hidden = new Set();
    for (let i = 0; i < 200; i += 1) {
      const p = plan({}, Math.random);
      whos.add(p.who);
      if (p.who === 'player') hidden.add(p.unaware.length > 0);
    }
    assert.deepEqual([...whos].sort(), ['npc', 'player']);
    assert.deepEqual([...hidden].sort(), [false, true]);
  });
});

describe('the world writer follows the plan', () => {
  const game = (n = 2, setup = {}) => {
    const g = lobby(n);
    G.applySetup(g, { ...base, ...setup });
    return g;
  };

  test('should ask for a GM character culprit and no player culprit', () => {
    const prompt = generationPrompt(game(2), [], ['n1'], '', { who: 'npc', unaware: [] });
    assert.match(prompt, /exactly the GM character n1/);
    assert.match(prompt, /No player character is a culprit/);
  });

  test('should ask for a culprit who does not know it', () => {
    const prompt = generationPrompt(game(1), [], ['p1'], '', { who: 'player', unaware: ['p1'] });
    assert.match(prompt, /p1 is a culprit who does not know it/);
    assert.match(prompt, /guilt_reveal/);
  });

  test('should say a story need not be a murder, and that a setting may have strange powers', () => {
    assert.match(GENERATION_SYSTEM, /A death is only one choice/);
    assert.match(GENERATION_SYSTEM, /If the setting has magic, spirits or strange powers, they follow fixed rules/);
    assert.doesNotMatch(GENERATION_SYSTEM, /the murder itself|nothing to do with the death/);
  });

  test('should offer story types that are not crimes of violence', () => {
    for (const t of ['disappearance', 'theft of something precious', 'secret society', 'ritual gone wrong']) assert.ok(STORY_TYPES.includes(t), t);
  });

  test('should accept a world with only a GM character culprit when planned', () => {
    const s = makeScenario(2);
    s.truth.culprit_ids = ['n1'];
    s.npcs[0].importance = 'important';
    for (const p of s.players) p.side = 'investigator';
    assert.deepEqual(G.validateScenario(s, { playerCount: 2, phases: 3, hints: 3, culprits: ['n1'] }).filter((e) => /culprit/i.test(e)), []);
    s.players[0].side = 'culprit';
    s.truth.culprit_ids = ['n1', 'p1'];
    assert.ok(G.validateScenario(s, { playerCount: 2, phases: 3, hints: 3, culprits: ['n1'] }).some((e) => /must be exactly the GM character n1/.test(e)));
  });

  test('should refuse a hidden culprit with no moment where it comes back', () => {
    const s = makeScenario(2);
    s.players[0].guilt_reveal = '';
    assert.ok(G.validateScenario(s, { playerCount: 2, phases: 3, hints: 3, culprits: ['p1'], unaware: ['p1'] }).some((e) => /p1 needs a guilt_reveal/.test(e)));
  });

  test('should mark the hidden culprit in code after the world is written', async () => {
    const g = lobby(1);
    G.applySetup(g, { ...base, culpritWho: 'player' });
    const world = makeScenario(1, { phases: 3, hints: 2 });
    world.players[0].guilt_reveal = 'It comes back: you did it in your sleep.';
    world.red_herrings[0].points_at = 'n1';
    const gm = new GM({ workDir: join(tmpdir(), 'small-groups-gm'), random: () => 0, run: async ({ schema }) => (schema?.properties?.verdict ? { verdict: 'ok', problems: [], patches: [] } : schema?.properties?.players && !schema?.properties?.truth ? { players: [] } : structuredClone(world)) });
    const scenario = await gm.generate(g);
    assert.equal(scenario.players[0].unaware, true);
  });
});

describe('a culprit who does not know', () => {
  const hidden = (players = 2, phases = 4) => {
    const game = gameInReading(players, 1_000, { phases });
    game.setup.replays = 0;
    const card = game.scenario.players[0];
    card.unaware = true;
    card.side_explanation = 'You are here to find out what happened.';
    card.guilt_reveal = 'It comes back to you: you took the glove in your sleep.';
    game.scenario.awaken_round = 3;
    G.startPlay(game, 1_000);
    return game;
  };

  test('should show their card as an investigator until it comes back', () => {
    const card = G.playerView(hidden(), 'p1', 2_000).card;
    assert.equal(card.side, 'investigator');
    assert.equal(card.side_explanation, 'You are here to find out what happened.');
    assert.equal(G.knowsGuilt(hidden(), 'p1'), false);
  });

  test('should tell them privately when their round comes, and turn their card', () => {
    const game = hidden();
    G.completePhase(game, structuredClone(emptyPhase), 2_000);
    assert.equal(G.knowsGuilt(game, 'p1'), false);
    G.completePhase(game, structuredClone(emptyPhase), 3_000);
    assert.equal(G.knowsGuilt(game, 'p1'), true);
    const told = game.state.threads.p1.find((m) => /It comes back to you/.test(m.text));
    assert.match(told.text, /You are one of the culprits now\. Do not get named at the final vote\./);
    const card = G.playerView(game, 'p1', 4_000).card;
    assert.equal(card.side, 'culprit');
    assert.match(card.side_explanation, /It comes back to you/);
    assert.ok(!G.tableView(game, 4_000).events?.some?.((e) => /It comes back/.test(e.text)));
  });

  test('should tell them at the last round at the latest if the story closes sooner', () => {
    const game = hidden(2, 3);
    game.scenario.awaken_round = 9;
    G.completePhase(game, structuredClone(emptyPhase), 2_000);
    G.completePhase(game, structuredClone(emptyPhase), 3_000);
    assert.equal(G.knowsGuilt(game, 'p1'), true);
  });

  test('should keep the audit from writing their crime onto their card', () => {
    const s = makeScenario(2);
    s.players[0].unaware = true;
    const before = s.players[0].starting_knowledge;
    G.applyAudit(s, { players: [{ player_id: 'p1', add: ['You took the glove at nine.'], known_hidden_fact_ids: ['h1'] }] });
    assert.equal(s.players[0].starting_knowledge, before);
    assert.equal(s.players[0].hidden_facts.length, 1);
    assert.match(auditPrompt(s), /A culprit marked unaware does not know what they did/);
  });

  test('should tell the GM how to play a culprit who does not know', () => {
    assert.match(playSystem({ title: 'x' }), /A player card with unaware: true is a culprit who does not know it/);
  });
});

describe('the final vote in a small game', () => {
  const finalGame = (players, culprits) => {
    const game = gameInReading(players);
    game.scenario.truth.culprit_ids = culprits;
    for (const p of game.scenario.players) p.side = culprits.includes(p.id) ? 'culprit' : 'investigator';
    G.startPlay(game, 1_000);
    game.status = 'final';
    return game;
  };

  test('should let the one innocent player of two decide, not the culprit who knows', () => {
    const game = finalGame(2, ['p1']);
    G.submitFinal(game, 'p1', { culprit_ids: ['n1'] });
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'] });
    assert.equal(G.computeVerdict(game).winner, 'investigators');
  });

  test('should let a player alone win by naming a GM character culprit', () => {
    const game = finalGame(1, ['n1']);
    G.submitFinal(game, 'p1', { culprit_ids: ['n1'] });
    assert.equal(G.computeVerdict(game).winner, 'investigators');
  });

  test('should let a player alone win by naming themselves when the clues led there', () => {
    const game = finalGame(1, ['p1']);
    game.scenario.players[0].unaware = true;
    G.submitFinal(game, 'p1', { culprit_ids: ['p1'] });
    assert.equal(G.computeVerdict(game).winner, 'investigators');
  });
});

describe('the setup screen for small groups and who did it', () => {
  const html = async (players, over = {}) => {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { Setup } = await import('../src/app/table/setup.tsx');
    const view = { status: 'lobby', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })), surprise: null, ...over };
    return renderToStaticMarkup(React.createElement(Setup, { view, host: true, act: async () => null, onNewGame: () => {} }));
  };

  test('should let one player start a game', async () => {
    const out = await html(1);
    assert.match(out, /1 player\. You get a character\./);
    assert.doesNotMatch(out, /Need \d players or more/);
  });

  test('should ask who did it and whether the culprit knows, with the GM deciding by default', async () => {
    const out = await html(4);
    assert.match(out, /Who did it\?/);
    for (const t of ['One of us', 'A GM character', 'Does the culprit know?', 'From the start', 'They find out later']) assert.ok(out.includes(t), t);
  });

  test('should say a player alone finds out from the clues, and hide hot seats under 3 players', async () => {
    const out = await html(1);
    assert.match(out, /Playing alone, a culprit among you never knows at the start: the clues lead you there\./);
    assert.doesNotMatch(out, /Does the culprit know\?/);
    assert.doesNotMatch(out, /Hot seats/);
  });
});

describe('review fixes: a culprit who does not know never learns it by accident', () => {
  const hiddenGame = (players = 2, phases = 4) => {
    const game = gameInReading(players, 1_000, { phases });
    game.setup.replays = 0;
    const card = game.scenario.players[0];
    card.unaware = true;
    card.guilt_reveal = 'It comes back to you: you took the glove in your sleep.';
    game.scenario.awaken_round = 3;
    G.startPlay(game, 1_000);
    return game;
  };

  test('should never let the story check patch their own card', async () => {
    const { applyStoryPatches } = await import('../server/story.ts');
    const s = makeScenario(3);
    s.players[0].unaware = true;
    const before = s.players[0].private_info;
    applyStoryPatches(s, [{ path: 'players.0.private_info', value: 'You took the glove at nine.' }, { path: 'players.1.private_info', value: 'NEW' }], { playerCount: 3, phases: 3, hints: 3 });
    assert.equal(s.players[0].private_info, before);
    assert.equal(s.players[1].private_info, 'NEW');
    const { storyCheckPrompt } = await import('../server/prompts.ts');
    assert.match(storyCheckPrompt(s, []), /The one exception is a culprit marked unaware/);
  });

  test('should drop the night entries of the moments they acted, and tell the writer their nights are what they believe', () => {
    const s = makeScenario(2);
    s.players[0].unaware = true;
    s.truth.timeline = [{ time: '9pm', event: 'It happened', character_ids: ['p1'], location_id: 'l1' }];
    G.applyAudit(s, { players: [{ player_id: 'p1', night: [{ time: '9pm', where: 'Ballroom', doing: 'Takes the glove' }, { time: '8pm', where: 'Kitchen', doing: 'Eats' }] }] });
    assert.deepEqual(s.players[0].night.map((n) => n.time), ['8pm']);
    const g = lobby(2);
    G.applySetup(g, base);
    assert.match(generationPrompt(g, [], ['p1'], '', { who: 'player', unaware: ['p1'] }), /Their side stays culprit/);
    assert.match(generationPrompt(g, [], ['p1'], '', { who: 'player', unaware: ['p1'] }), /their nights are what they remember/);
  });

  test('should wake them when the GM reveals one of their hidden facts early', () => {
    const game = hiddenGame();
    G.beginAsk(game, 'p1', { kind: 'self', text: 'Why can I not remember nine?' });
    G.completeAsk(game, 'p1', { answer: 'You remember.', clues_found: [], suspicion_change: 0, public_event: '', hidden_fact_revealed: 'h1', clues_destroyed: [], messages_to_players: [] }, 2_000);
    assert.equal(G.knowsGuilt(game, 'p1'), true);
    assert.equal(G.playerView(game, 'p1', 2_500).card.side, 'culprit');
  });

  test('should tell a player alone that they now know, without telling them to hide', () => {
    const game = hiddenGame(1, 4);
    game.scenario.awaken_round = null;
    G.beginAsk(game, 'p1', { kind: 'self', text: 'Why can I not remember nine?' });
    G.completeAsk(game, 'p1', { answer: 'You remember.', clues_found: [], suspicion_change: 0, public_event: '', hidden_fact_revealed: 'h1', clues_destroyed: [], messages_to_players: [] }, 2_000);
    const told = game.state.threads.p1.find((m) => /It comes back to you/.test(m.text));
    assert.match(told.text, /Now you know what happened\. At the end, name who did it\./);
    assert.doesNotMatch(told.text, /Do not get named/);
  });

  test('should tell the hot seat writer which seated culprit does not know', async () => {
    const { seatsPrompt } = await import('../server/prompts.ts');
    const game = hiddenGame(4, 4);
    game.state.seats = { list: [{ pid: 'p1', askers: [] }] };
    const prompt = seatsPrompt(game);
    assert.match(prompt, /"knows_guilt":false/);
    assert.match(prompt, /A seat with knows_guilt false is whispered as an innocent/);
  });

  test('should count a culprit who does not know as part of the room, so the last round can still help them', () => {
    const game = hiddenGame(1, 3);
    game.scenario.awaken_round = null;
    game.state.found.p1.push('c1');
    assert.ok(!G.caseGaps(game).some((g) => g.id === 'p1'));
    G.completePhase(game, structuredClone(emptyPhase), 2_000);
    G.completePhase(game, structuredClone(emptyPhase), 3_000);
    assert.deepEqual(G.caseGaps(game), []);
  });

  test('should keep their crime out of round lines after it comes back to them', () => {
    const game = hiddenGame(2, 4);
    game.scenario.players[0].hidden_facts = [{ id: 'h1', fact: 'You carried the glass bell out of the vault at midnight.' }];
    G.completePhase(game, structuredClone(emptyPhase), 2_000);
    G.completePhase(game, structuredClone(emptyPhase), 3_000);
    assert.equal(G.knowsGuilt(game, 'p1'), true);
    G.completePhase(game, { ...structuredClone(emptyPhase), public_event: 'Thunder. You carried the glass bell out of the vault at midnight.' }, 4_000);
    assert.doesNotMatch(game.state.events.filter((e) => e.kind === 'event').at(-1).text, /glass bell/);
  });

  test('should tell the continuity check who has woken', async () => {
    const { continuityPrompt } = await import('../server/continuity.ts');
    const game = hiddenGame();
    game.state.awakened = { p1: 3 };
    assert.match(continuityPrompt(game), /"awakened_players":\["p1"\]/);
  });
});

describe('review fixes: rules for small games', () => {
  test('should not offer meetings or say culprits vote, playing alone', async () => {
    const { rulesLines } = await import('../src/lib/rules.ts');
    const solo = rulesLines({ rounds: 3, overrides: 2, hints: 2, players: 1 }).join(' ');
    assert.doesNotMatch(solo, /meeting/);
    assert.doesNotMatch(solo, /Culprits vote too/);
    assert.match(solo, /At the end, you name who did it, how and why\./);
    const pair = rulesLines({ rounds: 3, overrides: 2, hints: 2, players: 2 }).join(' ');
    assert.match(pair, /A culprit who knows does not count/);
    const group = rulesLines({ rounds: 3, overrides: 2, hints: 2, players: 4 }).join(' ');
    assert.match(group, /Culprits vote too/);
  });

  test('should not say culprits vote on the phone when playing alone', async () => {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { Final } = await import('../src/app/play/endgame.tsx');
    const game = gameInReading(1);
    G.startPlay(game, 1_000);
    game.status = 'final';
    const html = renderToStaticMarkup(React.createElement(Final, { view: G.playerView(game, 'p1', 2_000) }));
    assert.doesNotMatch(html, /Culprits too/);
    assert.match(html, /Name who did it\./);
  });
});
