import { api, esc, stream, countdown, suspicionLabel, hashParam, toast, tickers } from '/common.js';

const app = document.getElementById('app');
const fromHash = hashParam('host');
if (fromHash) localStorage.setItem('detective-host', fromHash);
let host = fromHash || localStorage.getItem('detective-host');
let view = null;
let skeleton = null;
let seenEvents = 0;
const form = { setting: '', tone: 'tense', length: 'standard', hints: 3, notes: '' };

const SETTINGS = ['A monsoon gala at a 1950s Bombay hotel', 'A snowed-in ski lodge', 'A 1920s ocean liner', 'A space station on its last supply run', 'A college reunion weekend', 'A medieval village fair'];
const TONES = [['cozy', 'Cozy'], ['tense', 'Tense'], ['dark', 'Dark'], ['funny', 'Funny']];
const LENGTHS = [['short', 'Short', '3 phases, about 30 min'], ['standard', 'Standard', '4 phases, about 1 hour'], ['long', 'Long', '5 phases, about 1h 40m']];

const isHost = () => Boolean(host);
const $ = (id) => document.getElementById(id);

async function act(path, body = {}) {
  try {
    return await api(path, { host, ...body });
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function hostNote() {
  return isHost() ? '' : '<p class="banner small">This screen is view-only. Open the table link printed in the terminal to control the game.</p>';
}

function header(title, sub = '') {
  return `<div class="row between" style="margin-bottom:16px;flex-wrap:nowrap;align-items:flex-start">
    <div style="flex:1;min-width:0"><h1>${esc(title)}</h1>${sub ? `<div class="muted">${esc(sub)}</div>` : ''}</div>
    ${isHost() ? '<button id="new-game" class="danger" style="flex:none">New game</button>' : ''}
  </div>`;
}

function castHtml(cast) {
  if (!cast) return '';
  const person = (c, extra = '') => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">
      <b>${esc(c.name)}</b> <span class="muted">${esc(c.role)}${extra}</span><div class="small">${esc(c.info)}</div></div>`;
  return `<div class="panel stack">
    <div><div class="label">The players' characters</div>${cast.players.map((c) => person(c, ` &middot; played by ${esc(c.player)}`)).join('')}</div>
    <div><div class="label">Characters the GM plays</div>${cast.npcs.map((n) => person(n)).join('')}</div>
    <div><div class="label">Places</div>${cast.locations.map((l) => `<div class="small"><b>${esc(l.name)}</b>: ${esc(l.info)}</div>`).join('')}</div>
  </div>`;
}

const skeletons = {
  lobby: () => `${header('Detective', 'A mystery for everyone in the room')}${hostNote()}
    <div class="grid" style="grid-template-columns:minmax(260px,1fr) minmax(300px,1.4fr)">
      <div class="panel stack">
        <h2>Join on your phone</h2>
        <div class="qr" id="qr"></div>
        <div class="small muted">Same Wi-Fi, then open<br><b id="join-url"></b></div>
        <div><div class="label">At the table</div><div id="players"></div></div>
      </div>
      <div class="panel ${isHost() ? '' : 'hidden-el'}">
        <h2>Set up tonight's mystery</h2>
        <div class="field"><div class="label">Where does it happen?</div>
          <input type="text" id="setting" placeholder="Leave empty and the GM will surprise you" maxlength="200">
          <div class="row" style="margin-top:8px;gap:6px">${SETTINGS.map((s) => `<button class="chip" data-setting="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div>
        <div class="field"><div class="label">Tone</div><div class="row" style="gap:6px" id="tone">${TONES.map(([v, l]) => `<button class="chip" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="field"><div class="label">Length</div><div class="row" style="gap:6px" id="length">${LENGTHS.map(([v, l, d]) => `<button class="chip" data-v="${v}" title="${d}">${l} <span class="muted small">${d}</span></button>`).join('')}</div></div>
        <div class="field"><div class="label">Global hints the group can spend</div><div class="row" style="gap:6px" id="hints">${[1, 2, 3, 4, 5].map((n) => `<button class="chip" data-v="${n}">${n}</button>`).join('')}</div></div>
        <div class="field"><div class="label">Anything the GM should know about the group?</div>
          <textarea id="notes" maxlength="500" placeholder="Inside jokes, favourite films, things to avoid..."></textarea></div>
        <button class="primary wide" id="write">Write our world</button>
        <div class="small muted" id="write-note" style="margin-top:6px"></div>
      </div>
    </div>`,
  generating: () => `${header('Writing your world')}
    <div class="panel stack"><p class="opening">The GM is inventing a crime, a cast and everyone's secrets<span class="dots"></span></p>
    <p class="muted">This usually takes three to five minutes. Phones will light up when it is ready.</p>
    <div class="muted small">Elapsed: <span id="elapsed" class="timer">0:00</span></div>
    <div><div class="label">At the table</div><div id="players"></div></div></div>`,
  failed: () => `${header('Something went wrong')}<div class="banner error" id="error"></div>
    ${isHost() ? '<p style="margin-top:12px"><button class="primary" id="retry">Try again</button></p>' : ''}`,
  reading: () => `${header(view.title, view.setting)}${hostNote()}
    <div class="grid" style="grid-template-columns:minmax(300px,1.5fr) minmax(260px,1fr)">
      <div class="stack"><div class="panel"><div class="label">Read this aloud</div><p class="opening">${esc(view.opening)}</p></div>
        <div class="panel"><div class="label">Read your card on your phone, then tap "I've read it"</div><div id="ready"></div>
        ${isHost() ? '<button class="primary" id="start" style="margin-top:10px">Start the investigation</button>' : ''}</div></div>
      ${castHtml(view.cast)}
    </div>`,
  playing: () => `<div class="row between" style="margin-bottom:14px">
      <div><h1>${esc(view.title)}</h1><div class="serif" style="color:var(--accent);font-size:1.2rem" id="phase-name"></div></div>
      <div class="row"><div class="big-timer" id="timer">--:--</div>
        ${isHost() ? '<div class="stack" style="display:flex;flex-direction:column;gap:6px"><button id="extend">+5 min</button><button class="primary" id="next">Next phase</button></div>' : ''}</div>
    </div>${hostNote()}
    <div id="banner"></div>
    <div class="grid" style="grid-template-columns:minmax(320px,1.5fr) minmax(260px,1fr)">
      <div class="stack">
        <div class="row" style="align-items:stretch">
          <div class="panel" style="flex:1"><div class="label">Global hints</div><div id="pips"></div><div class="small muted">Propose one from any phone. Majority decides.</div></div>
          <div class="panel" style="flex:1.3"><div class="label">Suspicion</div><div class="meter"><div id="meter"></div></div><div class="small" id="susp" style="margin-top:6px"></div></div>
        </div>
        <div id="vote"></div>
        <div class="panel"><div class="label">What has happened</div><ul class="feed" id="feed"></ul></div>
      </div>
      ${castHtml(view.cast)}
    </div>`,
  final: () => `${header('Final reconstruction', view.title)}${hostNote()}<div id="banner"></div>
    <div class="grid"><div class="panel stack"><p class="opening">Who did it, how, and why? Everyone answers on their phone, culprits included.</p>
      <div id="submitted"></div>
      ${isHost() ? '<button class="primary" id="finish">Reveal the truth now</button><div class="small muted">Reveals automatically once everyone has answered.</div>' : ''}</div>
      <div class="panel"><div class="label">What happened</div><ul class="feed" id="feed"></ul></div></div>`,
  reveal: () => revealHtml(),
};

function revealHtml() {
  const r = view.reveal;
  const nameOf = (id) => [...view.cast.players, ...view.cast.npcs].find((c) => c.id === id)?.name ?? id;
  const win = r.verdict.winner === 'investigators';
  const scoreOf = (id) => r.players.find((p) => p.player_id === id);
  return `${header('The truth', view.title)}
    <div class="banner" style="font-size:1.25rem;margin-bottom:14px;border-color:${win ? 'var(--public)' : 'var(--danger)'}">
      <b>${win ? 'The investigators win.' : 'The culprits get away with it.'}</b>
      ${esc(r.verdict.correct_player_ids.length)} of ${view.players.length} named the right culprit${r.truth.culprit_ids.length > 1 ? 's' : ''}:
      <b>${r.truth.culprit_ids.map((id) => esc(nameOf(id))).join(' and ')}</b>.
    </div>
    <div class="grid" style="grid-template-columns:minmax(320px,1.4fr) minmax(260px,1fr)">
      <div class="panel"><div class="label">What really happened</div><p class="opening" style="white-space:pre-wrap">${esc(r.reveal_story)}</p>
        <div class="label" style="margin-top:12px">Timeline</div>${r.truth.timeline.map((t) => `<div class="small"><b>${esc(t.time)}</b> ${esc(t.event)}</div>`).join('')}</div>
      <div class="stack">
        <div class="panel"><div class="label">Twists in this game</div>${r.twists.map((t) => `<div class="small" style="margin-bottom:6px"><b>${esc(t.name)}</b>: ${esc(t.description)}</div>`).join('')}
          ${r.false_hint ? `<div class="small"><b>The false hint was:</b> ${esc(r.false_hint)}</div>` : ''}</div>
      </div>
    </div>
    <h2 style="margin-top:20px">Everyone's cards</h2>
    <div class="grid">${r.cards.map((c) => {
      const s = scoreOf(c.id) ?? {};
      return `<div class="panel stack">
        <div class="row between"><div><b>${esc(c.name)}</b> <span class="muted">(${esc(c.player)})</span><div class="small muted">${esc(c.role)}</div></div><span class="badge ${esc(c.side)}">${esc(c.side)}</span></div>
        <div class="layer private small"><div class="label">Secret</div>${esc(c.private_info)}<div style="margin-top:4px"><b>Goal:</b> ${esc(c.goal)}</div></div>
        <div class="layer hidden small"><div class="label">What they never knew</div>${c.hidden_facts.map((f) => `<div>${esc(f)}</div>`).join('')}</div>
        <div class="small"><b>Named:</b> ${c.submission ? c.submission.culprit_ids.map((id) => esc(nameOf(id))).join(', ') : '<span class="muted">no answer</span>'}</div>
        <div class="small score">Culprit ${s.culprit_correct ? '&#10003;' : '&#10007;'} &middot; Method ${s.method_score ?? 0}/2 &middot; Motive ${s.motive_score ?? 0}/2 &middot; Goal ${s.goal_achieved ? '&#10003;' : '&#10007;'}</div>
        <div class="small muted">${esc(s.goal_outcome)} ${esc(s.comment)}</div>
      </div>`;
    }).join('')}</div>`;
}

function chipGroup(id, value) {
  const box = $(id);
  if (!box) return;
  box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(b.dataset.v) === String(value)));
}

function wire() {
  $('new-game')?.addEventListener('click', async () => {
    if (!confirmTwice($('new-game'))) return;
    const res = await act('new');
    if (res?.host) {
      host = res.host;
      localStorage.setItem('detective-host', host);
      history.replaceState(null, '', `#host=${host}`);
    }
  });
  if ($('qr')) fetch('/api/qr.svg').then((r) => r.text()).then((svg) => ($('qr').innerHTML = svg));
  if ($('join-url')) fetch('/api/info').then((r) => r.json()).then((d) => ($('join-url').textContent = d.joinUrl));
  const setting = $('setting');
  if (setting) {
    setting.value = form.setting;
    setting.addEventListener('input', () => (form.setting = setting.value));
    document.querySelectorAll('[data-setting]').forEach((b) => b.addEventListener('click', () => {
      form.setting = setting.value = b.dataset.setting;
    }));
    for (const key of ['tone', 'length', 'hints']) {
      $(key).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        form[key] = key === 'hints' ? Number(b.dataset.v) : b.dataset.v;
        chipGroup(key, form[key]);
      }));
      chipGroup(key, form[key]);
    }
    $('notes').value = form.notes;
    $('notes').addEventListener('input', () => (form.notes = $('notes').value));
    $('write').addEventListener('click', () => act('setup', form));
  }
  $('retry')?.addEventListener('click', () => act('setup', view.setup ?? form));
  $('start')?.addEventListener('click', () => act('start'));
  $('extend')?.addEventListener('click', () => act('extend'));
  $('next')?.addEventListener('click', () => confirmTwice($('next')) && act('next'));
  $('finish')?.addEventListener('click', () => act('finish'));
}

function confirmTwice(btn) {
  if (btn.dataset.armed) return true;
  const label = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = 'Tap again to confirm';
  setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = label;
  }, 3000);
  return false;
}

function update() {
  const v = view;
  if ($('players')) {
    $('players').innerHTML = v.players.length ? v.players.map((p) => `<span class="badge" style="margin:0 6px 6px 0">${esc(p.name)}</span>`).join('') : '<span class="muted small">Nobody yet</span>';
  }
  if ($('write')) {
    const enough = v.players.length >= 3;
    $('write').disabled = !enough;
    $('write-note').textContent = enough ? `${v.players.length} players. The GM will write one character for each.` : `Need at least 3 players (${v.players.length} so far).`;
  }
  if ($('error')) $('error').textContent = v.error ?? '';
  if ($('ready')) {
    $('ready').innerHTML = v.players.map((p) => `<span class="badge ${v.ready.includes(p.id) ? 'investigator' : ''}" style="margin:0 6px 6px 0">${v.ready.includes(p.id) ? '&#10003; ' : ''}${esc(p.name)}</span>`).join('');
  }
  if ($('submitted')) {
    $('submitted').innerHTML = v.players.map((p) => `<div>${v.submitted.includes(p.id) ? '&#10003;' : '&#8230;'} ${esc(p.name)}</div>`).join('');
  }
  if ($('phase-name') && v.phase) $('phase-name').textContent = `Phase ${v.phase.index + 1} of ${v.phase.count}: ${v.phase.name}`;
  if ($('pips')) $('pips').innerHTML = `<span class="pips">${'&#9679;'.repeat(v.hintsLeft)}${'&#9675;'.repeat(Math.max(0, v.hintsTotal - v.hintsLeft))}</span> <span class="small muted">${v.hintsLeft} of ${v.hintsTotal} left</span>`;
  if ($('meter')) {
    $('meter').style.width = `${v.suspicion}%`;
    $('susp').textContent = suspicionLabel(v.suspicion);
  }
  if ($('vote')) {
    $('vote').innerHTML = v.hintVote ? `<div class="banner"><b>${esc(v.hintVote.proposer)}</b> wants to spend a hint. Vote on your phones: ${v.hintVote.yes} yes, ${v.hintVote.no} no, ${v.hintVote.need} needed.</div>` : '';
  }
  const banner = $('banner');
  if (banner) {
    banner.innerHTML = v.error ? `<div class="banner error" style="margin-bottom:12px">${esc(v.error)}</div>`
      : v.transitioning ? '<div class="banner" style="margin-bottom:12px">The world is changing<span class="dots"></span></div>'
      : v.scoring ? '<div class="banner" style="margin-bottom:12px">The GM is weighing your answers<span class="dots"></span></div>' : '';
  }
  if ($('feed')) {
    const events = v.events.filter((e) => e.kind !== 'opening');
    $('feed').innerHTML = events.slice().reverse().map((e, i) => `<li class="${esc(e.kind)}${i < events.length - seenEvents ? ' fresh' : ''}">${esc(e.text)}</li>`).join('');
    seenEvents = events.length;
  }
  if ($('next') && v.phase) $('next').textContent = v.phase.index + 1 >= v.phase.count ? 'End the game' : 'Next phase';
  tick();
}

function tick() {
  if (!view) return;
  if ($('timer') && view.phase?.endsAt) {
    const c = countdown(view.phase.endsAt);
    $('timer').textContent = c.text;
    $('timer').classList.toggle('low', c.low);
  }
  if ($('elapsed')) {
    const s = Math.round((Date.now() - (skeleton?.since ?? Date.now())) / 1000);
    $('elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
tickers.add(tick);

stream('', (v) => {
  const key = `${v.gameId}:${v.status}`;
  view = v;
  if (skeleton?.key !== key) {
    skeleton = { key, since: Date.now() };
    seenEvents = v.events.filter((e) => e.kind !== 'opening').length;
    app.innerHTML = (skeletons[v.status] ?? skeletons.lobby)();
    wire();
  }
  update();
});
