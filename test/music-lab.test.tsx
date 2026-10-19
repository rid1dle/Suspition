import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MusicLab, parseSoundtrack } from '../src/app/music-lab/music-lab';
import { FIXTURE } from '../src/lib/soundtrack/fixture';

describe('the music lab', () => {
  test('should offer every fixture direction, the rounds, the stingers and the controls', () => {
    const html = renderToStaticMarkup(<MusicLab />);
    assert.match(html, /Music lab/);
    for (const d of FIXTURE.directions) assert.ok(html.includes(d.name), d.name);
    for (const label of ['Round 1', 'Round 4', 'Play', 'Next piece', 'Round starts', 'Hot seat', 'Vote opens', 'Reveal', 'Hint', 'Use this JSON']) assert.ok(html.includes(`>${label}<`), label);
    assert.match(html, /aria-label="Tension"/);
    assert.doesNotMatch(html, /—/);
  });

  test('should read a pasted soundtrack, a bare list of directions, or nothing', () => {
    assert.equal(parseSoundtrack(JSON.stringify(FIXTURE))!.directions.length, 3);
    assert.equal(parseSoundtrack(JSON.stringify(FIXTURE.directions.slice(0, 1)))!.directions.length, 1);
    assert.equal(parseSoundtrack('not json'), null);
    assert.equal(parseSoundtrack('{"directions": []}'), null);
  });
});
