import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM } from '../server/prompts.ts';
import { storyIssues } from '../server/story.ts';
import { KeyObjects } from '../src/components/game/panels';
import { gameInReading, makeScenario } from './fixtures.ts';

const objects = [
  { name: 'The brass candle', about: 'A tall candle from the chapel.', where: 'l1', where_is_public: true },
  { name: 'The ledger', about: 'The inn keeps its accounts in it.', where: 'n1', where_is_public: true },
  { name: 'The cellar key', about: 'Only one key opens the cellar.', where: 'p3', where_is_public: false },
];

describe('things that matter', () => {
  test('should ask the GM for the objects that matter, told to everyone at the start', () => {
    assert.deepEqual(Object.keys(SCENARIO_SCHEMA.properties.key_objects.items.properties), ['name', 'about', 'where', 'where_is_public']);
    assert.match(GENERATION_SYSTEM, /key_objects: 3 to 6 things that matter to the case/);
  });

  test('should show each object to everyone, and where it is only when that is public', () => {
    const game = gameInReading(3);
    game.scenario.key_objects = objects;
    const shown = G.tableView(game).keyObjects;
    assert.deepEqual(shown, [
      { name: 'The brass candle', about: 'A tall candle from the chapel.', where: 'Ballroom' },
      { name: 'The ledger', about: 'The inn keeps its accounts in it.', where: 'The Butler' },
      { name: 'The cellar key', about: 'Only one key opens the cellar.', where: null },
    ]);
    const step = G.briefingSteps(game).find((s) => s.kind === 'objects');
    assert.deepEqual(step.lines, ['The brass candle: A tall candle from the chapel. (Ballroom)', 'The ledger: The inn keeps its accounts in it. (The Butler)', 'The cellar key: Only one key opens the cellar.']);
    assert.deepEqual(G.tableView(gameInReading(3)).keyObjects, []);
  });

  test('should turn names into ids and flag an object shown with the culprit', () => {
    const s = makeScenario(4);
    s.key_objects = [{ name: 'Knife', about: 'A kitchen knife.', where: 'Character 1', where_is_public: true }];
    G.resolveStoryIds(s);
    assert.equal(s.key_objects[0].where, 'p1');
    assert.match(storyIssues(s, { players: [], difficulty: 'normal', rounds: 3 }).join('\n'), /giveaway: key_objects\[0\]/);
  });

  test('should list the objects on screen', () => {
    const html = renderToStaticMarkup(<KeyObjects objects={[{ name: 'The ledger', about: 'The accounts.', where: 'The Butler' }, { name: 'The key', about: 'Opens the cellar.', where: null }]} />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /Things that matter/);
    assert.match(html, /The ledger.*The accounts\..*Where: The Butler/);
    assert.match(html, /The key.*Opens the cellar\./);
  });
});
