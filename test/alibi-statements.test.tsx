import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { AUDIT_SCHEMA, auditPrompt } from '../server/prompts.ts';
import { Alibis } from '../src/components/game/panels.tsx';
import { makeScenario } from './fixtures.ts';

const withTimes = () => {
  const s = makeScenario(3);
  s.key_times = [{ time: '9:00 pm', what: 'The lights go out' }];
  return s;
};

describe('alibis as real statements', () => {
  test('should ask the card check for each statement in the person own voice', () => {
    assert.ok(AUDIT_SCHEMA.properties.alibis.items.properties.statement);
    assert.match(auditPrompt(makeScenario(3)), /statement: what they say, in their own voice, first person/);
  });

  test('should keep each statement with the alibi', () => {
    const s = withTimes();
    G.applyAudit(s, { alibis: [{ id: 'p2', alibi: [{ time: '9:00 pm', where: 'Kitchen' }], statement: 'I was in the kitchen when the lights went. Ask the Butler, he was shouting for candles.' }] });
    assert.match(s.players[1].alibi_statement, /^I was in the kitchen/);
  });

  test('should drop a statement where an innocent names the culprit', () => {
    const s = withTimes();
    G.applyAudit(s, { alibis: [{ id: 'p2', alibi: [{ time: '9:00 pm', where: 'Kitchen' }], statement: 'I saw Character 1 by the ballroom at nine.' }] });
    assert.equal(s.players[1].alibi_statement ?? '', '');
  });

  test('should keep a culprit own statement, lie and all', () => {
    const s = withTimes();
    G.applyAudit(s, { alibis: [{ id: 'p1', alibi: [{ time: '9:00 pm', where: 'Library' }], statement: 'I was reading in the library. I heard nothing.' }] });
    assert.match(s.players[0].alibi_statement, /reading in the library/);
  });

  test('should send the statement with each row', () => {
    const s = withTimes();
    G.applyAudit(s, { alibis: [{ id: 'p2', alibi: [{ time: '9:00 pm', where: 'Kitchen' }], statement: 'I was in the kitchen.' }] });
    const row = G.alibiTable(s).rows.find((r: { name: string }) => r.name === 'Character 2');
    assert.equal(row.statement, 'I was in the kitchen.');
  });

  test('should show the statements as quotes first, then the short summary', () => {
    const table = { times: [{ time: '9:00 pm', what: 'Lights out' }], rows: [{ name: 'Asha', kind: 'player', minor: false, cells: ['Kitchen'], statement: 'I was in the kitchen. Ask Ben.' }] };
    const html = renderToStaticMarkup(React.createElement(Alibis, { alibis: table } as never));
    assert.ok(html.indexOf('I was in the kitchen. Ask Ben.') < html.indexOf('In short'));
    assert.match(html, /“I was in the kitchen\. Ask Ben\.”/);
  });

  test('should show only the summary for an old world with no statements', () => {
    const table = { times: [{ time: '9:00 pm', what: 'Lights out' }], rows: [{ name: 'Asha', kind: 'player', minor: false, cells: ['Kitchen'] }] };
    const html = renderToStaticMarkup(React.createElement(Alibis, { alibis: table } as never));
    assert.doesNotMatch(html, /In short/);
    assert.match(html, /Kitchen/);
  });
});
