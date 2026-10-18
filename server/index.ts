// @ts-nocheck -- legacy JS, typed file by file later
import { createServer } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import QRCode from 'qrcode';
import next from 'next';
import { App } from './app.ts';
import { GM } from './gm.ts';
import { openDb, DbError } from '../src/db/index.ts';
import { DbStore, DbArchive, DbPeople } from '../src/db/stores.ts';
import { GameLibrary } from '../src/db/library.ts';
import { importOnce } from '../src/db/importer.ts';
import { GameError } from './game.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SVG = 'image/svg+xml';

const VIRTUAL = /^(utun|feth|bridge|docker|veth|vboxnet|vmnet|tun|tap|awdl|llw|ipsec|ppp|zt|tailscale|wg)/i;
const PHYSICAL = /^(en|eth|wlan|wl|wifi)/i;

export function lanAddress(interfaces = networkInterfaces()) {
  const candidates = Object.entries(interfaces)
    .flatMap(([name, list]) => (list ?? []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })))
    .filter((c) => !VIRTUAL.test(c.name));
  const rank = (c) => (PHYSICAL.test(c.name) ? 0 : 1) + (c.address.startsWith('192.168.') ? 0 : 0.5);
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0]?.address ?? 'localhost';
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

// Most requests are small; an imported saved game can be a few megabytes.
const BODY_LIMITS = { '/api/games/import': 10_000_000 };

async function readBody(req, limit = 50_000) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new GameError('Request too large.', 413);
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new GameError('Bad JSON.');
  }
}

export function createHandler(app, { joinUrl, next = null }) {
  const streams = new Set();

  const push = (s) => {
    try {
      const view = s.token ? app.playerView(s.token, { full: s.full }) : app.tableView();
      s.res.write(`data: ${JSON.stringify(view)}\n\n`);
    } catch (err) {
      s.res.write(`event: gone\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      s.res.end();
      streams.delete(s);
    }
  };
  app.onChange(() => streams.forEach(push));
  setInterval(() => streams.forEach((s) => s.res.write(': ping\n\n')), 20_000).unref();

  const actions = {
    'POST /api/new': (b) => app.newGame(b.host).then((host) => ({ host })),
    'POST /api/join': (b) => app.join(b).then((token) => ({ token, username: app.game.players.find((p) => p.token === token)?.username })),
    'POST /api/setup': (b) => app.setup(b.host, b),
    'POST /api/ready': (b) => app.ready(b.token),
    'POST /api/start': (b) => app.start(b.host),
    'POST /api/extend': (b) => app.extend(b.host),
    'POST /api/next': (b) => app.nextPhase(b.host),
    'POST /api/finish': (b) => app.finish(b.host),
    'POST /api/ask': (b) => app.ask(b.token, b),
    'POST /api/hint': (b) => app.proposeHint(b.token),
    'POST /api/place': (b) => app.editPlace(b.host, b),
    'POST /api/brief': (b) => app.brief(b.host, b.delta),
    'POST /api/music': (b) => app.pickMusic(b.host, b.index),
    'POST /api/roundvote': (b) => app.voteRound(b.token, b.choice),
    'POST /api/share': (b) => app.shareClue(b.token, b.clueId),
    'POST /api/note': (b) => app.note(b.host, b.text),
    'POST /api/moment': (b) => app.moment(b.token, b.id, b.action, b.text),
    'POST /api/offer': (b) => app.offer(b.token, b.id, b.action, b.text),
    'POST /api/go': (b) => app.go(b.token, b.place),
    'POST /api/move': (b) => app.confirmMove(b.token, b.yes),
    'POST /api/public': (b) => app.askPublic(b.token, b.text),
    'POST /api/surprise': (b) => app.shuffleSurprise(b.host),
    'POST /api/vote': (b) => app.voteHint(b.token, b.yes),
    'POST /api/voteask': (b) => app.askVote(b.token),
    'POST /api/seatnow': (b) => app.seatNow(b.host),
    'POST /api/point': (b) => app.point(b.token, b.to),
    'POST /api/voteaskanswer': (b) => app.answerVoteAsk(b.token, b.yes),
    'POST /api/submit': (b) => app.submit(b.token, b),
    'POST /api/checkname': (b) => app.checkName(b.name),
    'POST /api/answer': (b) => app.answerQuestion(b.token, b),
    'POST /api/forget': (b) => app.forget(b.token),
    'POST /api/games/learning': (b) => app.setLearning(b.host, b.id, b.learning, b.note),
    'POST /api/games/import': (b) => app.importGame(b.host, b.game, b.people ?? {}),
  };


  return async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      const action = actions[`${req.method} ${url.pathname}`];
      if (action) return send(res, 200, (await action(await readBody(req, BODY_LIMITS[url.pathname]))) ?? { ok: true });

      if (url.pathname === '/events' || url.pathname === '/api/stream') {
        const s = { res, token: url.searchParams.get('token'), full: url.searchParams.get('full') === '1' };
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        streams.add(s);
        req.on('close', () => streams.delete(s));
        return push(s);
      }
      if (url.pathname === '/api/info') return send(res, 200, { joinUrl });
      if (url.pathname === '/api/rejoin') return send(res, 200, app.rejoin(url.searchParams.get('host'), url.searchParams.get('player'), joinUrl));
      if (url.pathname === '/api/people') return send(res, 200, { people: await app.knownPeople() });
      if (url.pathname === '/api/games') return send(res, 200, { games: await app.listGames(url.searchParams.get('host')) });
      if (url.pathname === '/api/game') return send(res, 200, await app.gameDetail(url.searchParams.get('host'), url.searchParams.get('id')));
      if (url.pathname === '/api/qr.svg') {
        return send(res, 200, await QRCode.toString(joinUrl, { type: 'svg', margin: 1 }), SVG);
      }

      if (next && !url.pathname.startsWith('/api/')) return next(req, res);
      send(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 404, { error: 'Not found' });
      if (!(err instanceof GameError)) console.error(err);
      send(res, err.status ?? 500, { error: err instanceof GameError ? err.message : 'Something went wrong.' });
    }
  };
}

async function main() {
  const port = Number(process.env.PORT) || 4321;
  const dataDir = process.env.DETECTIVE_DATA_DIR ? resolve(process.env.DETECTIVE_DATA_DIR) : join(ROOT, 'game-data');
  const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
  const gm = new GM({
    workDir: join(tmpdir(), 'detective-gm'),
    setupModel: process.env.DETECTIVE_SETUP_MODEL || undefined,
    setupEffort: process.env.DETECTIVE_SETUP_EFFORT || 'medium',
    playModel: process.env.DETECTIVE_PLAY_MODEL || undefined,
    readerModel: process.env.DETECTIVE_READER_MODEL || 'sonnet',
    log,
  });
  const datasetDir = process.env.DETECTIVE_DATASET_DIR ? resolve(process.env.DETECTIVE_DATASET_DIR) : join(ROOT, 'dataset');
  let db;
  try {
    db = openDb(join(dataDir, 'suspition.db'));
  } catch (err) {
    console.error(err instanceof DbError ? err.message : err);
    process.exit(1);
  }
  let app;
  try {
    const imported = await importOnce(db, { gameData: dataDir, dataset: datasetDir });
    if (!imported.skipped) log(`First start on the database: brought in ${imported.games} games, ${imported.people} people and ${imported.playtests} playtests. The JSON files are untouched.`);
    app = await new App({ gm, store: new DbStore(db), archive: new DbArchive(db, datasetDir), people: new DbPeople(db), library: new GameLibrary(db), log }).init();
  } catch (err) {
    console.error(`The game could not start: ${err.message}`);
    process.exit(1);
  }
  if (process.argv.includes('--new')) await app.newGame(app.game.hostToken);
  const joinUrl = `http://${process.env.DETECTIVE_HOST || lanAddress()}:${port}/play`;
  const dev = process.argv.includes('--dev');
  const nextApp = next({ dev, dir: ROOT });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  const server = createServer(createHandler(app, { joinUrl, next: (req, res) => handle(req, res) }));
  setInterval(() => app.tick().catch((err) => log(`tick failed: ${err.message}`)), 1000).unref();
  server.listen(port, '0.0.0.0', () => {
    const tableUrl = `http://localhost:${port}/table#host=${app.game.hostToken}`;
    console.log(`\nDetective is running.\n  Table screen: ${tableUrl}\n  Players join: ${joinUrl}\n`);
    if (process.env.NO_OPEN !== '1' && process.platform === 'darwin') exec(`open "${tableUrl}"`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
