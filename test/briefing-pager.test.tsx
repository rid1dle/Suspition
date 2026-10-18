import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BriefPager } from '../src/components/game/briefing';
import { swipeTo, followTable } from '../src/lib/brief';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const steps = [
  { kind: 'scene', title: 'Cold Air', lines: ['A weather station.'] },
  { kind: 'story', title: 'What just happened', lines: ['A scream.'] },
  { kind: 'npcs', title: 'People the GM plays', lines: ['Rao, the cook.'] },
];
const view = (step = 0) => ({ briefing: { step, steps } });
const noop = () => {};

describe('briefing pager', () => {
  test('should name the next card on the Next button', () => {
    assert.match(text(<BriefPager view={view()} at={0} onGo={noop} />), /Next: What just happened/);
  });

  test('should show the card the reader is on, not the table one', () => {
    const out = text(<BriefPager view={view(0)} at={2} onGo={noop} />);
    assert.match(out, /People the GM plays/);
    assert.match(out, /3 of 3/);
    assert.ok(!out.includes('A weather station.'), 'the table card must not show');
  });

  test('should let the reader tap any card by its dot', () => {
    const html = renderToStaticMarkup(<BriefPager view={view()} at={0} onGo={noop} />);
    assert.match(html, /aria-label="Card 2: What just happened"/);
    assert.match(html, /aria-current="step"[^>]*aria-label="Card 1: Cold Air"|aria-label="Card 1: Cold Air"[^>]*aria-current="step"/);
  });

  test('should turn the last Next into the finish action when there is one', () => {
    assert.match(text(<BriefPager view={view()} at={2} onGo={noop} finish={{ label: 'Go to my card', onClick: noop }} />), /Go to my card/);
    assert.ok(!text(<BriefPager view={view()} at={2} onGo={noop} />).includes('Next:'), 'no Next on the last card');
  });

  test('should offer a way back to the table card when the reader is elsewhere', () => {
    assert.match(text(<BriefPager view={view(1)} at={2} onGo={noop} tableStep={1} />), /The table is on card 2/);
    assert.ok(!text(<BriefPager view={view(1)} at={1} onGo={noop} tableStep={1} />).includes('The table is on'), 'no note when on the same card');
  });
});

describe('moving between cards', () => {
  test('should go forward on a left swipe and back on a right swipe', () => {
    assert.equal(swipeTo(1, 3, -80), 2);
    assert.equal(swipeTo(1, 3, 80), 0);
  });

  test('should ignore a small drag and stay inside the cards', () => {
    assert.equal(swipeTo(1, 3, -20), 1);
    assert.equal(swipeTo(2, 3, -200), 2);
    assert.equal(swipeTo(0, 3, 200), 0);
  });

  test('should jump to the table card when the table moves, and stay put otherwise', () => {
    assert.equal(followTable(4, 1, 2), 2);
    assert.equal(followTable(4, 2, 2), 4);
  });
});
