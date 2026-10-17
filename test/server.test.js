import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { App } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { createHandler } from '../server/index.js';
import { FakeGM } from './fixtures.js';

let server;
let base;
let app;

before(async () => {
  app = await new App({ gm: new FakeGM(), store: new MemoryStore() }).init();
  server = createServer(createHandler(app, { joinUrl: 'http://192.168.0.2:4321/play' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const post = async (path, body) => {
  const res = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

async function firstEvent(query = '') {
  const res = await fetch(`${base}/api/stream${query}`);
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  reader.cancel();
  const event = text.match(/^event: (\w+)/m)?.[1] ?? 'message';
  return { event, data: JSON.parse(text.match(/^data: (.*)$/m)[1]) };
}

describe('HTTP API', () => {
  test('should serve the table and phone pages', async () => {
    for (const path of ['/table', '/play', '/style.css', '/play.js']) {
      assert.equal((await fetch(base + path)).status, 200, path);
    }
  });

  test('should refuse path traversal and unknown files', async () => {
    assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/nope.js`)).status, 404);
  });

  test('should return the join link and a QR code', async () => {
    assert.equal((await (await fetch(`${base}/api/info`)).json()).joinUrl, 'http://192.168.0.2:4321/play');
    assert.match(await (await fetch(`${base}/api/qr.svg`)).text(), /<svg/);
  });

  test('should play from join to reveal over HTTP, with each stream private', async () => {
    const tokens = [];
    for (const name of ['Asha', 'Ben', 'Chitra']) tokens.push((await post('join', { name })).body.token);
    assert.equal((await post('join', { name: 'asha' })).status, 409);

    assert.equal((await post('setup', { host: 'bad', tone: 'tense', length: 'short', hints: 2 })).status, 403);
    assert.equal((await post('setup', { host: app.game.hostToken, tone: 'tense', length: 'short', hints: 2 })).status, 200);
    await app.idle();

    const ben = await firstEvent(`?token=${tokens[1]}`);
    assert.equal(ben.data.card.private_info, 'PRIVATE-2');
    assert.ok(!JSON.stringify(ben.data).includes('PRIVATE-1'));
    const table = await firstEvent();
    assert.equal(table.data.status, 'reading');
    assert.ok(!JSON.stringify(table.data).includes('PRIVATE'));

    await post('ready', { token: tokens[0] });
    assert.equal((await post('start', { host: app.game.hostToken })).status, 200);
    assert.equal((await post('ask', { token: tokens[0], kind: 'question', text: 'Search the ballroom' })).status, 200);
    await app.idle();
    assert.equal(app.game.state.threads.p1.length, 2);

    assert.equal((await post('hint', { token: tokens[0] })).status, 200);
    assert.equal((await post('vote', { token: tokens[1], yes: true })).status, 200);
    assert.equal(app.game.state.hintsLeft, 1);

    app.game.status = 'final';
    for (const t of tokens) assert.equal((await post('submit', { token: t, culprit_ids: ['p1'], how: 'x', why: 'y' })).status, 200);
    await app.idle();
    const reveal = await firstEvent();
    assert.equal(reveal.data.status, 'reveal');
    assert.equal(reveal.data.reveal.verdict.winner, 'investigators');
  });

  test('should tell a phone with an unknown token that its seat is gone', async () => {
    const res = await firstEvent('?token=not-a-real-token');
    assert.equal(res.event, 'gone');
  });

  test('should answer bad JSON with a 400', async () => {
    const res = await fetch(`${base}/api/join`, { method: 'POST', body: '{nope' });
    assert.equal(res.status, 400);
  });
});
