import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { AUDIT_SCHEMA, auditPrompt } from '../server/prompts.ts';
import { PeopleList } from '../src/components/game/people.tsx';
import { makeScenario, gameInReading } from './fixtures.ts';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const entry = (over = {}) => ({ player_id: 'p2', add: [], known_hidden_fact_ids: [], hook: '', distrusts: '', distrust_why: '', reveals: [], wants: '', fears: '', goal_why: '', reasons: [], night: [], reminders: [], ties: [], first_lead: { lines: [], ideas: [] }, ...over });

describe('the card check writes who each person is to you, and where you start', () => {
  test('should ask for a tie to every other person and a first lead for every player', () => {
    const item = AUDIT_SCHEMA.properties.players.items.properties;
    assert.ok(item.ties);
    assert.ok(item.first_lead);
    const prompt = auditPrompt(makeScenario(3));
    assert.match(prompt, /ties: one line for every other person in the story/);
    assert.match(prompt, /first_lead: the first message this player gets/);
  });

  test('should keep ties only for real people other than the player', () => {
    const s = makeScenario(3);
    G.applyAudit(s, { players: [entry({ ties: [{ id: 'p1', line: 'Your cousin. You owe her money.' }, { id: 'p2', line: 'Yourself.' }, { id: 'zz', line: 'Nobody.' }, { id: 'n1', line: 'He pours your drinks and hears everything.' }] })] });
    assert.deepEqual(s.players[1].ties, [{ id: 'p1', line: 'Your cousin. You owe her money.' }, { id: 'n1', line: 'He pours your drinks and hears everything.' }]);
  });

  test('should keep the first lead short: a few lines and at most three ideas', () => {
    const s = makeScenario(3);
    const lines = ['You stand in the kitchen.', 'The butler is drying a glass.', 'He keeps looking at the ballroom door.', 'A fourth line.', 'A fifth line.'];
    G.applyAudit(s, { players: [entry({ first_lead: { lines, ideas: ['Ask the butler what he saw.', 'Go to the ballroom.', 'Check the door.', 'One too many.'] } })] });
    assert.equal(s.players[1].first_lead.lines.length, 4);
    assert.equal(s.players[1].first_lead.ideas.length, 3);
  });
});

describe('every person has a line saying who they are to you', () => {
  test('should cover every other player and GM character, falling back to their role', () => {
    const game = gameInReading(3);
    game.scenario.players[1].ties = [{ id: 'p1', line: 'Your cousin.' }];
    const ties = G.tiesFor(game, 'p2');
    assert.deepEqual(Object.keys(ties).sort(), ['n1', 'n2', 'p1', 'p3']);
    assert.equal(ties.p1, 'Your cousin.');
    assert.equal(ties.n1, 'Butler.');
  });

  test('should replace a tie that retells a clue with the plain role, so nothing found later leaks early', () => {
    const game = gameInReading(3);
    game.scenario.clues[0].shows = 'The torn glove matches the gardener stitching pattern exactly';
    game.scenario.players[1].ties = [{ id: 'p1', line: 'Her torn glove matches the gardener stitching pattern.' }];
    assert.equal(G.tiesFor(game, 'p2').p1, 'Role 1.');
  });

  test('should send the ties to that player only', () => {
    const game = gameInReading(3);
    game.scenario.players[1].ties = [{ id: 'p1', line: 'Your cousin.' }];
    G.startPlay(game, 2_000);
    assert.equal(G.playerView(game, 'p2', 2_000).ties.p1, 'Your cousin.');
    assert.notEqual(G.playerView(game, 'p3', 2_000).ties.p1, 'Your cousin.');
  });

  test('should show who they are to you on each person, at rest', () => {
    const people = [{ id: 'p1', name: 'Mara Holt', role: 'Captain', info: 'Runs the station.', kind: 'npc', alibi: [], facts: [] }];
    const out = text(<PeopleList people={people} ties={{ p1: 'Your captain. She trusts you.' }} />);
    assert.match(out, /Mara Holt Captain To you: Your captain\. She trusts you\./);
  });
});

describe('your card lists your people before play starts', () => {
  test('should put each other person and who they are to you on the card', async () => {
    const { CardFlip } = await import('../src/app/play/card.tsx');
    const game = gameInReading(2);
    game.scenario.players[0].ties = [{ id: 'n1', line: 'He pours your drinks and hears everything.' }];
    const card = G.playerView(game, 'p1', 2_000).card;
    assert.deepEqual(card.people.map((x: { name: string }) => x.name), ['Character 2', 'The Butler', 'The Widow']);
    const out = text(<CardFlip card={card} caseQuestion="Who did it?" overridesLeft={0} overridesTotal={0} rules={[]} />);
    assert.match(out, /Your people Character 2 Role 2\. The Butler He pours your drinks and hears everything\./);
  });
});

describe('the game starts with a lead for every player', () => {
  test('should open each player\'s chat with their first lead and its ideas, worth no points', () => {
    const game = gameInReading(3);
    game.scenario.players[1].first_lead = { lines: ['You stand in the kitchen.', 'The butler keeps looking at the door.'], ideas: ['Ask the butler what he saw.'] };
    G.startPlay(game, 2_000);
    const first = game.state.threads.p2[0];
    assert.equal(first.from, 'gm');
    assert.deepEqual(first.lines.map((l: { text: string }) => l.text), ['You stand in the kitchen.', 'The butler keeps looking at the door.']);
    assert.deepEqual(first.ideas, ['Ask the butler what he saw.']);
    assert.equal(first.play, undefined);
  });

  test('should still give a world without first leads a way in: who you are and the round\'s pointers', () => {
    const game = gameInReading(2);
    game.scenario.players[0].hook = 'You are the cook, and tonight must end quietly.';
    game.scenario.phases[0].try = ['Ask the butler.', 'Search the kitchen.'];
    G.startPlay(game, 2_000);
    const first = game.state.threads.p1[0];
    assert.equal(first.from, 'gm');
    assert.match(first.lines.map((l: { text: string }) => l.text).join(' '), /You are the cook/);
    assert.deepEqual(first.ideas, ['Ask the butler.', 'Search the kitchen.']);
  });
});
