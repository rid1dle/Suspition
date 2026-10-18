import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { feedItem } from '../src/lib/feed.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM, playSystem, publicSystem, phasePrompt, CONTINUITY_RULES } from '../server/prompts.ts';
import { GoalsPanel } from '../src/components/game/panels';
import { gameInReading } from './fixtures.ts';

const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('feedback from a real game', () => {
  test('should show no right or wrong mark when the room picks someone to look at', () => {
    assert.equal(feedItem({ kind: 'round', text: 'The room looks at Nikhil. Was seen near the shed.' }).kind, 'round');
    assert.equal(feedItem({ kind: 'round', text: 'The room is split.' }).kind, 'round');
    assert.equal(feedItem({ kind: 'round', text: 'The group picked: A. That is right! R' }).kind, 'right');
    assert.equal(feedItem({ kind: 'round', text: 'The group picked: B. Not quite. N' }).kind, 'wrong');
  });

  test("should make the next round play off the room's choice", () => {
    const prompt = phasePrompt({ snapshot: {}, nextPhase: { name: 'N', planned_beat: 'B' }, lastRound: { kind: 'spotlight', pickedText: 'Nikhil Rao' } });
    assert.match(prompt, /The room now suspects Nikhil Rao\. Make the coming round play off that choice/);
    assert.match(CONTINUITY_RULES, /When the room's vote went the wrong way, patch the rounds to come so the story follows that choice/);
  });

  test('should give every character a short backstory and show it on their card', () => {
    assert.ok(SCENARIO_SCHEMA.properties.players.items.properties.backstory);
    assert.match(GENERATION_SYSTEM, /backstory: 3 to 5 short sentences, second person/);
    const game = gameInReading(3);
    game.scenario.players[1].backstory = 'You grew up above the bakery. You owe the victim a favour.';
    assert.equal(G.playerView(game, 'p2').card.backstory, 'You grew up above the bakery. You owe the victim a favour.');
    assert.ok(!JSON.stringify(G.tableView(game)).includes('above the bakery'));
  });

  test('should keep the goals and the open questions in front of each player', () => {
    const out = text(<GoalsPanel caseQuestion="Who killed the keeper?" job="Find who had the key." goal="Get the letter back." open={['Who locked the door?']} />);
    assert.match(out, /Your goals/);
    assert.match(out, /The case: Who killed the keeper\?/);
    assert.match(out, /This round: Find who had the key\./);
    assert.match(out, /Your own goal: Get the letter back\./);
    assert.match(out, /Still open/);
    assert.match(out, /Who locked the door\?/);
  });

  test('should take a side when a player pushes a story', () => {
    for (const p of [playSystem({}), publicSystem({})]) assert.match(p, /The players are the main writers\. When a player pushes a story/);
  });
});
