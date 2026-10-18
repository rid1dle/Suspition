import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MusicPicker, musicLine } from '../src/components/game/music-picker';
import { cleanSoundtrack } from '../src/lib/soundtrack/clean';
import type { TableSoundtrack } from '../src/lib/soundtrack/types';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { Reading } from '../src/app/table/reading';

const raw = (name: string, line: string) => ({ name, line, tempo: 80, root: 'C', mode: 'minor', lead: 'piano', harmony: 'violins', bass: 'cellos', texture: 'harp', kit: [], theme: [0, 1, 2, 3].map((degree) => ({ degree, beats: 2 })), rounds: [{}], stingers: {} });
const DIRECTIONS = cleanSoundtrack({ directions: [raw("Clock's Tick", 'Slow cellos and a ticking clock.'), raw('Small Hours', "A lone piano at night, it's quiet."), raw('Drum Circle', 'Low drums and plucked bass.')] }, { rounds: 3, names: [] })!.directions;
const ready = (chosen = 0): TableSoundtrack => ({ status: 'ready', directions: DIRECTIONS, chosen });
const esc = (s: string) => s.replace(/'/g, '&#x27;');

const render = (soundtrack: TableSoundtrack | null, { host = true, previewing = null as number | null } = {}) =>
  renderToStaticMarkup(<MusicPicker soundtrack={soundtrack} host={host} previewing={previewing} onListen={() => {}} onPick={() => {}} />);

describe('music picker', () => {
  test('should say the GM is writing while the soundtrack is not ready', () => {
    const html = render({ status: 'writing' });
    assert.match(html, /Music for this game/);
    assert.ok(html.includes('The GM is writing the music. Simple music plays until it is ready.'));
    assert.doesNotMatch(html, />Listen</);
  });

  test('should list three directions with Listen on each and Use this only for the host', () => {
    const html = render(ready());
    for (const d of DIRECTIONS) {
      assert.ok(html.includes(esc(d.name)), d.name);
      assert.ok(html.includes(esc(d.line)), d.line);
    }
    assert.equal((html.match(/>Listen</g) ?? []).length, 3);
    assert.equal((html.match(/>Use this</g) ?? []).length, 2, 'every row but the chosen one');
    const guest = render(ready(), { host: false });
    assert.equal((guest.match(/>Listen</g) ?? []).length, 3);
    assert.doesNotMatch(guest, />Use this</);
  });

  test('should mark the chosen direction', () => {
    const html = render(ready(1));
    assert.equal((html.match(/>Chosen</g) ?? []).length, 1);
    assert.match(html, new RegExp(`Small Hours[\\s\\S]*?>Chosen<`));
    assert.doesNotMatch(html, new RegExp(`${esc("Clock's Tick")}[\\s\\S]*?>Chosen<[\\s\\S]*?Small Hours`));
  });

  test('should say simple music plays when composing failed', () => {
    const html = render({ status: 'failed' });
    assert.ok(html.includes('Simple music this game. The GM could not write a soundtrack.'));
  });

  test('should show a countdown on the direction being previewed', () => {
    const html = render(ready(), { previewing: 2 });
    assert.equal((html.match(/Playing… 10s/g) ?? []).length, 1);
    assert.equal((html.match(/>Listen</g) ?? []).length, 2);
    assert.match(html, /Drum Circle[\s\S]*Playing… 10s/);
  });

  test('should render nothing before the world exists', () => {
    assert.equal(render(null), '');
  });

  test('should keep the text on a solid card and never use a long dash', () => {
    const html = render(ready());
    assert.match(html, /bg-card/);
    assert.doesNotMatch(html, /—/);
  });
});

describe('the reading screen', () => {
  const props = (view: unknown, host: string | null, picks: number[] = [], listens: number[] = []) => ({
    view: view as never, host, act: async (path: string, body: Record<string, unknown> = {}) => { if (path === 'music') picks.push(body.index as number); return null; },
    readNow: () => {}, onNewGame: () => {}, music: { previewing: null, listen: (i: number) => listens.push(i) },
  });

  test('should show the music picker above the ready list', () => {
    const game = gameInReading(3);
    G.applySoundtrack(game, { directions: DIRECTIONS });
    const html = renderToStaticMarkup(<Reading {...props(G.tableView(game), 'h')} />);
    assert.match(html, /Music for this game[\s\S]*Read your card on your phone/);
    assert.equal((html.match(/>Use this</g) ?? []).length, 2);
  });

  test('should show nothing about music for a game from before the soundtrack', () => {
    const html = renderToStaticMarkup(<Reading {...props(G.tableView(gameInReading(3)), 'h')} />);
    assert.doesNotMatch(html, /Music for this game/);
  });
});

describe('the music bar line', () => {
  test('should read the chosen line when the composed music plays', () => {
    assert.equal(musicLine('composed', ready(2), null), 'Low drums and plucked bass.');
  });

  test('should say the instruments are loading, then simple music', () => {
    assert.equal(musicLine('loading', ready(), null), 'Loading the instruments…');
    assert.equal(musicLine('simple', { status: 'failed' }, 'Old theme'), 'Simple music');
    assert.equal(musicLine('simple', { status: 'writing' }, null), 'Simple music');
  });

  test('should keep the old theme line for games without a soundtrack', () => {
    assert.equal(musicLine('simple', null, 'Strings in the rain'), 'Strings in the rain');
    assert.equal(musicLine('simple', null, null), '');
  });
});
