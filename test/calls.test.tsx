import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { phoneAlerts } from '../src/lib/alerts';
import { callFor } from '../src/lib/phone';
import { CallBanner } from '../src/components/game/call-banner';

const base = { gameId: 'g', me: { id: 'p2', name: 'Ben' }, thread: [], clues: [] };

describe("the phone always says when it's your turn", () => {
  test('should alert when a moment turns into "now"', () => {
    const prev = { ...base, moments: [{ id: 'm1', line: 'L', why: '', status: 'getready' }] };
    const next = { ...base, moments: [{ id: 'm1', line: 'L', why: '', status: 'called' }] };
    const alerts = phoneAlerts(prev, next);
    assert.deepEqual(alerts.map((a) => [a.sound, a.text]), [['call', 'Your moment. Everyone is listening. Say your line now.']]);
  });

  test('should name the call for a moment, the hot seat and an asker', () => {
    assert.equal(callFor({ ...base, moments: [{ id: 'm1', status: 'called' }] }), 'Your moment. Say your line out loud now.');
    assert.equal(callFor({ ...base, moments: [{ id: 'm1', status: 'getready' }] }), 'Get ready: your moment is coming.');
    assert.equal(callFor({ ...base, seat: { status: 'live', name: 'Ben', mine: { role: 'seated' } } }), "You're in the hot seat. Answer out loud.");
    assert.equal(callFor({ ...base, seat: { status: 'getready', name: 'Ben', mine: { role: 'seated' } } }), "Get ready: you're in the hot seat next.");
    assert.equal(callFor({ ...base, seat: { status: 'live', name: 'Asha', mine: { role: 'asker', question: 'Q' } } }), 'Ask Asha your question out loud now.');
    assert.equal(callFor({ ...base, seat: { status: 'live', name: 'Asha', mine: { role: 'listener' } } }), null);
    assert.equal(callFor(base), null);
  });

  test('should pin a bright banner to the top of every tab while it is your turn', () => {
    const html = renderToStaticMarkup(<CallBanner text="Your moment. Say your line out loud now." onShow={() => {}} />);
    assert.match(html, /role="alert"/);
    assert.match(html, /sticky/);
    assert.match(html.replace(/<[^>]+>/g, ' '), /Your moment\. Say your line out loud now\./);
    assert.equal(renderToStaticMarkup(<CallBanner text={null} onShow={() => {}} />), '');
  });
});
