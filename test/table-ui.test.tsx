import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';
import { Setup, Generating } from '../src/app/table/setup';
import { Reading } from '../src/app/table/reading';
import { Playing } from '../src/app/table/playing';
import { FinalWait, Reveal } from '../src/app/table/endgame';

const SECRETS = ['PRIVATE-', 'TRUTH-SUMMARY', 'HIDDEN-', 'GOAL-', 'NPC-SECRET', 'NPC-KNOWS', 'METHOD', 'MOTIVE'];
const noop = async () => null;
const props = (view, host = 'h') => ({ view, host, act: noop, readNow: () => {}, onNewGame: () => {} });

function stages() {
  const g = gameInReading(3, Date.now(), { questions: true });
  const reading = G.tableView(g);
  G.startPlay(g);
  G.beginAsk(g, 'p1', { kind: 'chat', text: 'I hide the glove' });
  G.completeAsk(g, 'p1', { ...emptyAsk, lines: [{ speaker: '', text: 'You hide it.' }], clues_found: ['c1'] });
  const playing = G.tableView(g);
  G.beginRoundVote(g, Date.now());
  const voting = G.tableView(g);
  g.status = 'final';
  const final = G.tableView(g);
  return { reading, playing, voting, final, game: g };
}

describe('the table screen', () => {
  test('should never show a secret before the reveal', () => {
    const s = stages();
    const screens = [
      ['reading', <Reading {...props(s.reading)} />],
      ['playing', <Playing {...props(s.playing)} />],
      ['voting', <Playing {...props(s.voting)} />],
      ['final', <FinalWait {...props(s.final)} />],
    ];
    for (const [name, el] of screens) {
      const html = renderToStaticMarkup(el);
      for (const secret of SECRETS) assert.ok(!html.includes(secret), `${name} shows ${secret}`);
    }
  });

  test('should hide host controls without the host link', () => {
    const s = stages();
    const html = renderToStaticMarkup(<Playing {...props(s.playing, null)} />);
    assert.ok(!html.includes('Next round') && !html.includes('Start the vote'));
    assert.ok(!html.includes('End game'));
    assert.match(html, /View only/);
    assert.match(renderToStaticMarkup(<Playing {...props(s.playing, 'h')} />), /Start the vote|Next round/);
  });

  test('should only show the truth once the answer is revealed', () => {
    const s = stages();
    for (const p of s.game.players) G.submitFinal(s.game, p.id, { culprit_ids: ['p1'] });
    G.applyScore(s.game, G.computeVerdict(s.game), { reveal_story: 'TRUTH-STORY', players: [] });
    assert.match(renderToStaticMarkup(<Reveal {...props(G.tableView(s.game))} />), /TRUTH-STORY/);
  });

  test('should need three players before the mystery can be made', () => {
    const g = G.createGame();
    G.addPlayer(g, { name: 'A' });
    assert.match(renderToStaticMarkup(<Setup {...props(G.tableView(g))} />), /Need 3 players or more \(1 now\)/);
    assert.ok(renderToStaticMarkup(<Generating {...props({ ...G.tableView(g), status: 'generating', progress: { attempt: 1, draft: 1, startedAt: Date.now(), plan: null, thinking: true, redraft: false } })} />).includes('Thinking'));
  });
});
