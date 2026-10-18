import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeopleList } from '../src/components/game/people';
import { Feed } from '../src/components/game/feed';
import { News } from '../src/components/game/panels';
import * as G from '../server/game.ts';
import { PUBLIC_ANSWER_SCHEMA, publicSystem } from '../server/prompts.ts';
import { gameInReading } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(3, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const asked = (game, lines) => {
  G.beginPublicAsk(game, 'p1', 'Where was everyone at nine?');
  G.completePublicAsk(game, 'p1', lines, 2_000);
  return game.state.events.at(-1);
};

const person = { id: 'p1', icon: '', name: 'Himanshu Lath', role: 'Teacher', player: 'Himanshu', info: 'Teaches.', kind: 'player', minor: false, facts: [],
  alibi: [{ time: '9:05 pm', where: 'Walking the stall row' }, { time: '9:15 pm', where: 'In the group photo' }, { time: '10:00 pm', where: 'Record tent, alone' }] };

describe('easy to scan', () => {
  test('should list what a person says about their night as a timeline, one time per row', () => {
    const html = renderToStaticMarkup(<PeopleList people={[person] as never} open={new Set(['p1'])} seen={{}} />);
    const rows = html.match(/<li[^>]*>[\s\S]*?<\/li>/g)?.filter((li) => /pm/.test(li)) ?? [];
    assert.equal(rows.length, 3);
    assert.match(rows[0], /9:05 pm[\s\S]*Walking the stall row/);
    assert.ok(!html.split('Says they were')[1].includes(' · '), 'no run-on line of times');
  });

  test('should ask the GM for out-loud answers as novel lines', () => {
    assert.ok(PUBLIC_ANSWER_SCHEMA.properties.lines);
    assert.match(publicSystem({}, []), /like a page of a novel/);
  });

  test('should keep an out-loud answer as narration and speech, not one paragraph', () => {
    const game = playing();
    const npc = game.scenario.npcs[0];
    const e = asked(game, [{ speaker: '', text: 'The cook wipes her hands.' }, { speaker: npc.id, text: '"I was in the kitchen all night."' }]);
    assert.deepEqual(e.lines, [{ speaker: '', text: 'The cook wipes her hands.' }, { speaker: npc.name, text: 'I was in the kitchen all night.' }]);
    assert.match(e.text, /I was in the kitchen all night/);
  });

  test('should never let the GM speak for a player in an out-loud answer', () => {
    const game = playing();
    const other = game.scenario.players[1];
    const e = asked(game, [{ speaker: other.character_name, text: 'I was by the stove.' }, { speaker: '', text: 'Nobody answers.' }]);
    assert.deepEqual(e.lines, [{ speaker: '', text: 'Nobody answers.' }]);
  });

  test('should still take a plain text answer', () => {
    const game = playing();
    const e = asked(game, 'The road is closed.');
    assert.equal(e.text, 'The road is closed.');
    assert.equal(e.lines, undefined);
  });

  test('should show out-loud answers as novel lines in the feed and the news', () => {
    const lines = [{ speaker: '', text: 'The cook wipes her hands.' }, { speaker: 'Lata', text: 'I was in the kitchen.' }];
    const events = [{ at: 1, phase: 0, kind: 'qa', by: 'Asha', q: 'Where were you?', text: 'x', lines }] as never;
    for (const html of [renderToStaticMarkup(<Feed events={events} />), renderToStaticMarkup(<News events={events} />)]) {
      assert.match(html, /data-line="act"[^>]*>The cook wipes her hands/);
      assert.match(html, /data-speaker[^>]*>Lata<\/span>/);
    }
  });
});
