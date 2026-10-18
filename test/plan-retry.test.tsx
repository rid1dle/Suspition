import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM } from './fixtures.ts';
import { PlanSteps } from '../src/components/game/plan';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const plan = [{ title: 'Setting the stage', covers: ['title'] }, { title: 'Writing what happened', covers: ['truth'] }, { title: 'Hiding the clues', covers: ['clues'] }];
const steps = [{ title: 'Setting the stage', state: 'active' }, { title: 'Writing what happened', state: 'todo' }, { title: 'Hiding the clues', state: 'todo' }];
const progress = (over = {}) => ({ attempt: 2, draft: 1, startedAt: 0, plan: steps, thinking: false, redraft: true, retry: null, ...over });

async function generating(events: unknown[]) {
  const gm = new FakeGM();
  gm.gate = new Promise(() => {});
  gm.progressEvents = events;
  const app = await new App({ gm, store: new MemoryStore(), clock: () => 1_000 }).init();
  for (const name of ['P1', 'P2', 'P3']) await app.join({ name });
  await app.setup(app.game.hostToken, { tone: 'cozy', length: 'short', hints: 2 });
  return app.tableView().progress;
}

describe('a second try at the world', () => {
  test('should tell the screens how many rules the first draft broke, and no more', async () => {
    const p = await generating([{ kind: 'attempt', attempt: 1 }, { kind: 'plan', steps: plan }, { kind: 'key', key: 'clues' }, { kind: 'attempt', attempt: 2, broke: 2 }]);
    assert.deepEqual({ reason: p.retry.reason, broke: p.retry.broke }, { reason: 'rules', broke: 2 });
    assert.equal(typeof p.retry.tookMs, 'number');
    assert.ok(!JSON.stringify(p.retry).includes('culprit'));
  });

  test('should say when the first draft came out garbled', async () => {
    const p = await generating([{ kind: 'attempt', attempt: 1 }, { kind: 'plan', steps: plan }, { kind: 'draft' }, { kind: 'draft' }]);
    assert.equal(p.retry.reason, 'garbled');
  });

  test('should have no retry on a first draft', async () => {
    const p = await generating([{ kind: 'attempt', attempt: 1 }, { kind: 'plan', steps: plan }]);
    assert.equal(p.retry, null);
  });

  test('should fold the first draft into one done line with how long it took', () => {
    const out = text(<PlanSteps progress={progress({ retry: { reason: 'rules', broke: 2, tookMs: 252_000, at: 300_000 } })} now={351_000} />);
    assert.match(out, /First draft written 4:12/);
    assert.match(out, /It broke 2 rules, so the GM is writing it again/);
  });

  test('should give an honest wait based on how long the first draft took', () => {
    const retry = { reason: 'rules', broke: 1, tookMs: 252_000, at: 300_000 };
    assert.match(text(<PlanSteps progress={progress({ retry })} now={360_000} />), /It broke 1 rule, .* About 3 more minutes\./);
    assert.match(text(<PlanSteps progress={progress({ retry })} now={530_000} />), /About a minute more\./);
    assert.match(text(<PlanSteps progress={progress({ retry })} now={600_000} />), /Taking a little longer than the first one\./);
  });

  test('should explain a garbled first draft in plain words', () => {
    const out = text(<PlanSteps progress={progress({ retry: { reason: 'garbled', broke: 0, tookMs: 60_000, at: 60_000 } })} now={61_000} />);
    assert.match(out, /It came out garbled, so the GM is writing it again/);
  });

  test('should never say fixing something', () => {
    const out = text(<PlanSteps progress={progress({ retry: { reason: 'rules', broke: 3, tookMs: 200_000, at: 200_000 } })} now={210_000} />);
    assert.ok(!/Fixing something/.test(out));
  });

  test('should label the timer as time so far', () => {
    assert.match(text(<PlanSteps progress={progress({ attempt: 1, redraft: false })} now={351_000} />), /5:51 so far/);
    assert.match(text(<PlanSteps progress={progress({ plan: null, thinking: true, attempt: 1, redraft: false })} now={65_000} />), /1:05 so far/);
  });
});
