import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFlip } from '../src/app/play/card';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const card = { name: 'Lata', role: 'Cook', side: 'investigator', public_info: 'Cooks.', private_info: 'Owes money.', side_explanation: '', goal: 'Hide the debt.', goal_why: '', win: '', wants: '', fears: '', reasons: [], night: [], hidden_known: [], hidden_unknown: 0, starting_knowledge: '',
  hook: 'You are the cook who hides a debt.', distrusts: 'Asha', distrust_why: 'She was near the shed.', locked: ['drives', 'reasons'] } as never;

describe('hook-first card on the phone', () => {
  test('should show the hook first and a locked note for drives', () => {
    const out = text(<CardFlip card={card} caseQuestion="Who did it?" overridesLeft={1} overridesTotal={2} />);
    assert.ok(out.indexOf('You are the cook who hides a debt.') < out.indexOf('Your secret goal'));
    assert.match(out, /You don't trust Asha[\s\S]*She was near the shed/);
    assert.match(out, /Unlocks after your first hot seat/);
  });
});
