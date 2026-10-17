import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { createHandler, lanAddress } from '../server/index.ts';
import { FakeGM } from './fixtures.ts';

const nextPaths = [];
const fakeNext = (req, res) => {
  nextPaths.push(req.url);
  if (req.url.startsWith('/games')) return res.end('NEXT PAGE');
  res.writeHead(404);
  res.end();
};
let server;
let base;
let app;

before(async () => {
  app = await new App({ gm: new FakeGM(), store: new MemoryStore() }).init();
  server = createServer(createHandler(app, { joinUrl: 'http://192.168.0.2:4321/play', next: fakeNext }));
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

describe('lanAddress', () => {
  const v4 = (address) => [{ family: 'IPv4', internal: false, address }];

  test('should prefer the Wi-Fi card over VPN and container interfaces', () => {
    assert.equal(lanAddress({ feth2714: v4('172.29.222.16'), en0: v4('192.168.1.16'), utun4: v4('10.100.0.3') }), '192.168.1.16');
  });

  test('should skip loopback and IPv6', () => {
    assert.equal(lanAddress({ lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], en1: [{ family: 'IPv6', internal: false, address: 'fe80::1' }, ...v4('10.0.0.7')] }), '10.0.0.7');
  });

  test('should fall back to localhost with no usable interface', () => {
    assert.equal(lanAddress({ utun0: v4('10.1.1.1') }), 'localhost');
  });
});

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

    assert.equal((await post('place', { host: 'bad', id: 'l1', room: 'sofa' })).status, 403);
    assert.equal((await post('place', { host: app.game.hostToken, id: 'l1', room: 'sofa' })).status, 200);
    assert.equal((await firstEvent(`?token=${tokens[2]}`)).data.map.places[0].room, 'sofa');

    assert.equal((await post('brief', { host: app.game.hostToken, delta: 1 })).status, 200);
    await post('ready', { token: tokens[0] });
    assert.equal((await post('start', { host: app.game.hostToken })).status, 200);
    assert.equal((await post('ask', { token: tokens[0], kind: 'question', text: 'Search the ballroom' })).status, 200);
    await app.idle();
    assert.equal(app.game.state.threads.p1.length, 2);

    assert.equal((await post('public', { token: tokens[1], text: 'Is it cold?' })).status, 200);
    assert.equal((await post('share', { token: tokens[2], clueId: 'c1' })).status, 403);
    assert.equal((await post('roundvote', { token: tokens[0], choice: 0 })).status, 409);
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

describe('profile routes', () => {
  test('should list saved people, check a name, and answer a lobby question', async () => {
    await post('new', { host: app.game.hostToken });
    const join = await post('join', { name: 'Zed' });
    assert.equal(join.status, 200);
    assert.equal(join.body.username, 'zed');
    const people = await (await fetch(`${base}/api/people`)).json();
    assert.ok(people.people.some((p) => p.username === 'zed'));
    assert.deepEqual((await post('checkname', { name: 'zed' })).body, { match: { username: 'zed', name: 'Zed' } });
    const view = (await firstEvent(`?token=${join.body.token}`)).data;
    assert.equal((await post('answer', { token: join.body.token, id: view.question.id, choice: 0 })).status, 200);
    const full = (await firstEvent(`?token=${join.body.token}&full=1`)).data;
    assert.equal(full.profile.answers.length, 1);
    assert.equal((await post('forget', { token: join.body.token })).status, 200);
  });
});

describe('the new server shape', () => {
  test('should stream the same view on /events as on /api/stream', async () => {
    const res = await fetch(`${base}/events`);
    const reader = res.body.getReader();
    let text = '';
    while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
    reader.cancel();
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    assert.deepEqual(JSON.parse(text.match(/^data: (.*)$/m)[1]), (await firstEvent()).data);
  });

  test('should hand unknown paths to Next', async () => {
    const res = await fetch(`${base}/games`);
    assert.equal(await res.text(), 'NEXT PAGE');
    assert.ok(nextPaths.includes('/games'));
  });

  test('should still serve the old table and play pages without asking Next', async () => {
    const before = nextPaths.length;
    for (const path of ['/table', '/play', '/play.js']) assert.equal((await fetch(base + path)).status, 200, path);
    assert.equal(nextPaths.length, before);
  });
});
