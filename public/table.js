import { api, esc, stream, countdown, suspicionLabel, hashParam, toast, tickers } from '/common.js';
import { Score } from '/music.js';
import { intensityFor, cuesBetween } from '/music-theory.js';
import { Narrator, narrationFor } from '/narration.js';
import { mapHtml } from '/map.js';
import { pictureHtml, timelineHtml, newsHtml, sharedCluesHtml, roundHtml, resultsHtml, stepHtml, caseHtml, pointsOf, alibiHtml, whoisLines, recapHtml, peopleHtml } from '/panels.js';
import { feedHtml, visibleCount } from '/feed.js';
import { tableSound } from '/alerts.js';
import { Sfx } from '/sfx.js';

const app = document.getElementById('app');
const fromHash = hashParam('host');
if (fromHash) localStorage.setItem('detective-host', fromHash);
let host = fromHash || localStorage.getItem('detective-host');
let view = null;
let skeleton = null;
let seenEvents = 0;
let positionsBefore = null;
let editingMap = false;
let dragging = null;
let sideTab = 'map';
const openRounds = new Set();
const seenCounts = {};
const form = { setting: '', tone: 'tense', length: 'standard', hints: 3, overrides: 3, npcs: 3, npcRole: 'mixed', replays: 2, notes: '' };

const SETTINGS = ['A 1950s Bombay hotel party', 'A snowed-in ski lodge', 'A 1920s ocean liner', 'A space station', 'A college reunion', 'A village fair'];
const TONES = [['cozy', 'Cozy'], ['tense', 'Tense'], ['dark', 'Dark'], ['funny', 'Funny']];
const LENGTHS = [['short', 'Short', '3 rounds, ~30 min'], ['standard', 'Normal', '4 rounds, ~1 hour'], ['long', 'Long', '5 rounds, ~1.5 hours']];
const REPLAYS = [[0, 'Never'], [1, 'Once'], [2, 'Up to twice']];
const SIDES = { investigator: 'Detective', culprit: 'Culprit', wildcard: 'Wildcard' };

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
  return isHost() ? '' : '<p class="banner small">View only. To run the game, open the table link from the terminal.</p>';
}

function endButton() {
  if (!isHost()) return '';
  const fresh = ['lobby', 'reveal'].includes(view?.status);
  return `<button id="new-game" class="${fresh ? 'danger' : 'quiet danger-text'}" style="flex:none" data-confirm="${fresh ? 'Tap again' : 'Tap again to end it'}">${fresh ? 'New game' : 'End game'}</button>`;
}

function header(title, sub = '') {
  return `<div class="row between" style="margin-bottom:16px;flex-wrap:nowrap;align-items:flex-start">
    <div style="flex:1;min-width:0"><h1>${esc(title)}</h1>${sub ? `<div class="muted">${esc(sub)}</div>` : ''}</div>
    ${endButton()}
  </div>`;
}


function showSide() {
  document.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== sideTab));
  document.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === sideTab));
  sideCounts();
}

function sideCounts() {
  if (!view || !$('side-tabs')) return;
  const counts = { timeline: view.timeline?.length ?? 0, clues: view.sharedClues?.length ?? 0, people: (view.people ?? []).reduce((n, p) => n + p.facts.length, 0) };
  for (const [t, n] of Object.entries(counts)) {
    if (sideTab === t || seenCounts[t] === undefined) seenCounts[t] = n;
    const el = document.querySelector(`[data-count="${t}"]`);
    if (el) {
      el.textContent = n ? ` ${n}` : '';
      el.classList.toggle('new', n > seenCounts[t]);
    }
  }
}

const mapPanel = () => `<div class="row between"><div class="small muted">Who is where right now</div>${isHost() ? '<button class="quiet" id="edit-map">Edit map</button>' : ''}</div>
  <div class="small muted" id="map-help" hidden>Drag places to move them. Type where each place is in your room.</div><div id="map"></div>`;

const SIDE_TABS = [['map', 'Map'], ['timeline', 'Timeline'], ['alibis', 'Alibis'], ['clues', 'Clues'], ['people', 'People']];

const skeletons = {
  lobby: () => `${header('Detective', 'A mystery game for this room')}${hostNote()}
    <div class="grid" style="grid-template-columns:minmax(260px,1fr) minmax(300px,1.4fr)">
      <div class="panel stack">
        <h2>Join on your phone</h2>
        <div class="qr" id="qr"></div>
        <div class="small muted">Same Wi-Fi. Then open:<br><b id="join-url"></b></div>
        <div><div class="label">Players here</div><div id="players"></div></div>
      </div>
      <div class="panel ${isHost() ? '' : 'hidden-el'}">
        <h2>Set up the game</h2>
        <div class="field"><div class="label">Where is it?</div>
          <input type="text" id="setting" placeholder="Leave empty for a surprise" maxlength="200">
          <div class="row" style="margin-top:8px;gap:6px">${SETTINGS.map((s) => `<button class="chip" data-setting="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div>
        <div class="field"><div class="label">Mood</div><div class="row" style="gap:6px" id="tone">${TONES.map(([v, l]) => `<button class="chip" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="field"><div class="label">How long?</div><div class="row" style="gap:6px" id="length">${LENGTHS.map(([v, l, d]) => `<button class="chip" data-v="${v}">${l} <span class="muted small">${d}</span></button>`).join('')}</div></div>
        <div class="field"><div class="label">Got a round wrong? Play it again</div><div class="row" style="gap:6px" id="replays">${REPLAYS.map(([v, l]) => `<button class="chip" data-v="${v}">${l}</button>`).join('')}</div>
          <div class="small muted" style="margin-top:4px">A round you vote wrong is played again, with a clearer job.</div></div>
        <div class="field"><div class="label">Group hints</div><div class="row" style="gap:6px" id="hints">${[1, 2, 3, 4, 5].map((n) => `<button class="chip" data-v="${n}">${n}</button>`).join('')}</div></div>
        <div class="field"><div class="label">Overrides per player</div><div class="row" style="gap:6px" id="overrides">${[0, 1, 2, 3, 4, 5].map((n) => `<button class="chip" data-v="${n}">${n}</button>`).join('')}</div>
          <div class="small muted" style="margin-top:4px">Sometimes the story makes your character speak. An override lets you stay quiet or say it your way.</div></div>
        <div class="field"><div class="label">People the GM plays</div><div class="row" style="gap:6px" id="npcs">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<button class="chip" data-v="${n}">${n}</button>`).join('')}</div>
          <div class="row" style="gap:6px;margin-top:8px" id="npcRole"><button class="chip" data-v="mixed">Some matter to the case</button><button class="chip" data-v="background">Background only</button></div>
          <div class="small muted" style="margin-top:4px">Fewer is easier to follow. Background only means the story is all about the players.</div></div>
        <div class="field"><div class="label">Anything the GM should know?</div>
          <textarea id="notes" maxlength="500" placeholder="Jokes, things you like, things to avoid"></textarea></div>
        <button class="primary wide" id="write">Make our mystery</button>
        <div class="small muted" id="write-note" style="margin-top:6px"></div>
      </div>
    </div>`,
  generating: () => `${header('Making your mystery')}
    <div class="panel stack"><p class="opening">The GM is writing it now.</p>
    <p class="muted">It takes about 4 to 7 minutes. Nothing secret shows here.</p>
    <ol class="steps" id="steps"></ol>
    <div class="muted small">Time so far: <span id="elapsed" class="timer">0:00</span></div>
    <div><div class="label">Players here</div><div id="players"></div></div></div>`,
  failed: () => `${header('Something went wrong')}<div class="banner error" id="error"></div>
    ${isHost() ? '<p style="margin-top:12px"><button class="primary" id="retry">Try again</button></p>' : ''}`,
  reading: () => `${header(view.title, view.setting)}${hostNote()}
    <div class="grid" style="grid-template-columns:minmax(320px,1.7fr) minmax(260px,1fr)">
      <div class="stack">
        <div class="panel" id="brief"></div>
        ${isHost() ? `<div class="row"><button id="brief-back">Back</button><button class="primary" id="brief-next">Next</button><button class="chip" id="read-step">Read it again</button></div>` : ''}
      </div>
      <div class="stack">
        <div class="panel"><div class="label">Read your card on your phone. Then tap "Done".</div><div id="ready"></div>
        ${isHost() ? '<button class="primary" id="start" style="margin-top:10px">Start round 1</button>' : ''}</div>
        <div class="panel"><div class="label">Timeline so far</div><div id="timeline"></div><div class="small muted" style="margin-top:6px">More times show up as the rounds go on.</div></div>
        <div class="panel"><div class="label">Alibis: where people say they were</div><div id="alibis"></div></div>
        <div class="panel"><div class="label">Questions about the world</div><div id="qa"></div></div>
      </div>
    </div>`,
  playing: () => `<header class="bar">
      <div class="bar-title"><div class="small muted">${esc(view.title)}</div><div class="round-name" id="phase-name"></div></div>
      <div class="bar-stats small"><span id="pips"></span><span id="susp"></span></div>
      <div class="big-timer" id="timer">--:--</div>
      ${isHost() ? '<button class="quiet" id="extend">+5 min</button><button class="primary" id="next">Next round</button>' : ''}${endButton()}
    </header>${hostNote()}
    <div id="banner"></div>
    <div class="layout">
      <div class="stack">
        <div id="calling"></div>
        <div id="vote"></div>
        <div class="now" id="round"></div>
        <div id="recap"></div>
        <div class="whois small" id="whois"></div>
        ${isHost() ? '<div class="note-box"><input type="text" id="note-text" maxlength="200" placeholder="Tell the GM what the room thinks. &quot;We think Ramesh lied about the gate.&quot;"><button class="quiet" id="note-send">Tell the GM</button></div>' : ''}
        <section><div id="feed"></div></section>
      </div>
      <aside class="side">
        <nav class="utabs" id="side-tabs">${SIDE_TABS.map(([t, l]) => `<button data-side="${t}">${l}<span class="count" data-count="${t}"></span></button>`).join('')}</nav>
        <div data-pane="map">${mapPanel()}</div>
        <div data-pane="timeline" hidden><div id="timeline"></div></div>
        <div data-pane="alibis" hidden><div class="small muted" style="margin-bottom:8px">Where each person says they were</div><div id="alibis"></div></div>
        <div data-pane="clues" hidden><div id="shared"></div></div>
        <div data-pane="people" hidden><div id="picture"></div><div id="people"></div></div>
      </aside>
    </div>`,
  final: () => `${header('Who did it?', view.title)}${hostNote()}<div id="banner"></div>
    <div class="grid"><div class="panel stack"><p class="opening">Everyone picks on their phone. Culprits too.</p>
      <div id="submitted"></div>
      ${isHost() ? '<button class="primary" id="finish">Show the answer</button><div class="small muted">It shows by itself when everyone has picked.</div>' : ''}</div>
      <div class="stack"><div class="panel"><div class="label">Timeline</div><div id="timeline"></div></div>
      <div class="panel"><div class="label">Rounds</div><div id="results"></div></div>
      <div class="panel"><div class="label">Shared clues</div><div id="shared"></div></div></div></div>`,
  reveal: () => revealHtml(),
};

function revealHtml() {
  const r = view.reveal;
  const nameOf = (id) => [...view.cast.players, ...view.cast.npcs].find((c) => c.id === id)?.name ?? id;
  const win = r.verdict.winner === 'investigators';
  const scoreOf = (id) => r.players.find((p) => p.player_id === id);
  return `${header('The answer', view.title)}
    <div class="banner" style="font-size:1.25rem;margin-bottom:14px;border-color:${win ? 'var(--public)' : 'var(--danger)'}">
      <b>${win ? 'The detectives win.' : 'The culprits got away.'}</b>
      ${esc(r.verdict.correct_player_ids.length)} of ${view.players.length} picked
      <b>${r.truth.culprit_ids.map((id) => esc(nameOf(id))).join(' and ')}</b>.
    </div>
    <div class="grid" style="grid-template-columns:minmax(320px,1.4fr) minmax(260px,1fr)">
      <div class="panel"><div class="row between"><div class="label">What really happened</div><button class="chip" id="read-story">Read it out</button></div><p class="opening" style="white-space:pre-wrap">${esc(r.reveal_story)}</p>
        <div class="label" style="margin-top:12px">Timeline</div>${r.truth.timeline.map((t) => `<div class="small"><b>${esc(t.time)}</b> ${esc(t.event)}</div>`).join('')}</div>
      <div class="stack">
        <div class="panel"><div class="label">Rounds</div>${resultsHtml(view.roundResults) || '<p class="small muted">No round votes.</p>'}</div>
        <div class="panel"><div class="label">How people found out</div>${r.learned?.length ? r.learned.map((k) => `<div class="small" style="margin-bottom:6px"><b>${esc(k.who)}</b> learned: ${esc(k.fact)} <span class="muted">(round ${k.round}, ${esc(k.how)})</span></div>`).join('') : '<p class="small muted">The GM people learned nothing new.</p>'}</div>
        <div class="panel"><div class="label">Twists</div>${r.twists.map((t) => `<div class="small" style="margin-bottom:6px"><b>${esc(t.name)}</b>: ${esc(t.description)}</div>`).join('')}
          ${r.false_hint ? `<div class="small"><b>The fake hint:</b> ${esc(r.false_hint)}</div>` : ''}</div>
      </div>
    </div>
    <h2 style="margin-top:20px">Everyone's cards</h2>
    <div class="grid">${r.cards.map((c) => {
      const s = scoreOf(c.id) ?? {};
      return `<div class="panel stack">
        <div class="row between"><div><b>${esc(c.name)}</b> <span class="muted">(${esc(c.player)})</span><div class="small muted">${esc(c.role)}</div></div><span class="badge ${esc(c.side)}">${esc(SIDES[c.side] ?? c.side)}</span></div>
        <div class="layer private small"><div class="label">Secret</div>${esc(c.private_info)}<div style="margin-top:4px"><b>Goal:</b> ${esc(c.goal)}</div></div>
        <div class="layer hidden small"><div class="label">They never knew</div>${c.hidden_facts.map((f) => `<div>${esc(f)}</div>`).join('')}</div>
        <div class="small"><b>Picked:</b> ${c.submission ? c.submission.culprit_ids.map((id) => esc(nameOf(id))).join(', ') : '<span class="muted">nobody</span>'}</div>
        <div class="small score"><b>${pointsOf(s)} of 6 points</b> &middot; Culprit ${s.culprit_correct ? '&#10003;' : '&#10007;'} &middot; How ${s.method_score ?? 0}/2 &middot; Why ${s.motive_score ?? 0}/2 &middot; Goal ${s.goal_achieved ? '&#10003;' : '&#10007;'}</div>
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
    for (const key of ['tone', 'length', 'hints', 'overrides', 'npcs', 'npcRole', 'replays']) {
      $(key).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        form[key] = ['hints', 'overrides', 'npcs', 'replays'].includes(key) ? Number(b.dataset.v) : b.dataset.v;
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
  $('brief-back')?.addEventListener('click', () => act('brief', { delta: -1 }));
  $('brief-next')?.addEventListener('click', () => act('brief', { delta: 1 }));
  $('read-step')?.addEventListener('click', () => {
    const step = view.briefing?.steps?.[view.briefing.step];
    if (step) readNow([`${step.title}.`, ...step.lines]);
  });
  $('edit-map')?.addEventListener('click', () => {
    editingMap = !editingMap;
    $('edit-map').textContent = editingMap ? 'Done' : 'Edit map';
    $('edit-map').classList.toggle('on', editingMap);
    $('map-help').hidden = !editingMap;
    renderMap(true);
  });
  $('read-story')?.addEventListener('click', () => readNow([view.reveal.reveal_story]));
  const sendNote = async () => {
    if (await act('note', { text: $('note-text').value })) $('note-text').value = '';
  };
  $('note-send')?.addEventListener('click', sendNote);
  $('note-text')?.addEventListener('keydown', (e) => e.key === 'Enter' && sendNote());
  document.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
    sideTab = b.dataset.side;
    showSide();
  }));
  if ($('side-tabs')) showSide();
  $('feed')?.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      sideTab = go.dataset.go;
      showSide();
    }
  });
  $('feed')?.addEventListener('toggle', (e) => {
    const r = Number(e.target.dataset?.round);
    if (Number.isNaN(r)) return;
    if (e.target.open) openRounds.add(r);
    else openRounds.delete(r);
  }, true);
}

function confirmTwice(btn) {
  if (btn.dataset.armed) return true;
  const label = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = btn.dataset.confirm || 'Tap again';
  setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = label;
  }, 3000);
  return false;
}

function stepsHtml(v) {
  const p = v.progress;
  const extra = { players: () => `${p.counts.players ?? 0} of ${v.players.length}`, clues: () => (p.counts.clues ? `${p.counts.clues} so far` : '') };
  const redo = p.attempt > 1 ? 'The GM broke a game rule, so it is starting again.'
    : p.draft > 1 ? `The GM is fixing a mistake and writing it again (try ${p.draft}). This adds a minute or two.` : '';
  return (redo ? `<li class="banner small" style="list-style:none;margin-bottom:8px">${esc(redo)}</li>` : '')
    + p.steps.map((s) => {
      const state = s.id === p.step ? 'now' : p.seen.includes(s.id) ? 'done' : 'todo';
      const note = state !== 'todo' && extra[s.id] ? extra[s.id]() : '';
      return `<li class="step ${state}"><span class="mark">${state === 'done' ? '&#10003;' : state === 'now' ? '&#9679;' : '&#9675;'}</span>${esc(s.label)}${note ? ` <span class="muted small">${esc(note)}</span>` : ''}${state === 'now' ? '<span class="dots"></span>' : ''}</li>`;
    }).join('');
}

function update() {
  const v = view;
  if ($('players')) {
    $('players').innerHTML = v.players.length ? v.players.map((p) => `<span class="badge" style="margin:0 6px 6px 0">${esc(p.name)}</span>`).join('') : '<span class="muted small">Nobody yet</span>';
  }
  if ($('write')) {
    const enough = v.players.length >= 3;
    $('write').disabled = !enough;
    $('write-note').textContent = enough ? `${v.players.length} players. Each one gets a character.` : `Need 3 players or more (${v.players.length} now).`;
  }
  if ($('error')) $('error').textContent = v.error ?? '';
  if ($('steps') && v.progress) $('steps').innerHTML = stepsHtml(v);
  if ($('ready')) {
    $('ready').innerHTML = v.players.map((p) => `<span class="badge ${v.ready.includes(p.id) ? 'investigator' : ''}" style="margin:0 6px 6px 0">${v.ready.includes(p.id) ? '&#10003; ' : ''}${esc(p.name)}</span>`).join('');
  }
  if ($('submitted')) {
    $('submitted').innerHTML = v.players.map((p) => `<div>${v.submitted.includes(p.id) ? '&#10003;' : '&#8230;'} ${esc(p.name)}</div>`).join('');
  }
  if ($('phase-name') && v.phase) $('phase-name').textContent = `Round ${v.phase.number ?? v.phase.index + 1} of ${v.phase.count} · ${v.phase.name}`;
  if ($('recap')) $('recap').innerHTML = recapHtml(v.recap);
  if ($('pips')) $('pips').innerHTML = `<span class="muted" title="Group hints left. Ask for one on your phone.">Hints</span> <span class="pips">${'&#9679;'.repeat(v.hintsLeft)}${'&#9675;'.repeat(Math.max(0, v.hintsTotal - v.hintsLeft))}</span>`;
  if ($('susp') && v.suspicion !== null) $('susp').innerHTML = `<span class="muted" title="How close the group is to the culprit">Suspicion</span> ${esc(suspicionLabel(v.suspicion))}`;
  if ($('vote')) {
    $('vote').innerHTML = v.hintVote ? `<div class="banner"><b>${esc(v.hintVote.proposer)}</b> wants a hint. Vote on your phone: ${v.hintVote.yes} yes, ${v.hintVote.no} no. Needs ${v.hintVote.need}.</div>` : '';
  }
  renderMap();
  const banner = $('banner');
  if (banner) {
    banner.innerHTML = v.error ? `<div class="banner error" style="margin-bottom:12px">${esc(v.error)}</div>`
      : v.transitioning ? '<div class="banner" style="margin-bottom:12px">Things are changing<span class="dots"></span></div>'
      : v.scoring ? '<div class="banner" style="margin-bottom:12px">The GM is checking your answers<span class="dots"></span></div>' : '';
  }
  if ($('feed')) {
    const n = visibleCount(v.events);
    $('feed').innerHTML = feedHtml(v.events, { fresh: n - seenEvents, open: openRounds });
    seenEvents = n;
  }
  sideCounts();
  if ($('brief')) {
    $('brief').innerHTML = stepHtml(v);
    if ($('brief-back')) $('brief-back').disabled = v.briefing.step === 0;
    if ($('brief-next')) $('brief-next').disabled = v.briefing.step >= v.briefing.steps.length - 1;
  }
  if ($('qa')) $('qa').innerHTML = newsHtml(v.events.filter((e) => e.kind === 'qa')).replace('No news yet.', 'Ask on your phone. Everyone sees the answer.');
  if ($('round')) {
    $('round').innerHTML = caseHtml(v.caseQuestion) + (v.round ? roundHtml(v.round) : '<div class="label">This round</div><div class="question">Talk, look around and share clues.</div>');
    $('round').hidden = false;
  }
  if ($('calling')) $('calling').innerHTML = v.calling?.length ? `<div class="calling">${v.calling.map((n) => `<b>${esc(n)}</b>`).join(' and ')}, the story turns to you. Everyone, listen.</div>` : '';
  if ($('timeline')) $('timeline').innerHTML = timelineHtml(v.timeline);
  if ($('alibis')) $('alibis').innerHTML = alibiHtml(v.alibis);
  if ($('people')) $('people').innerHTML = peopleHtml(v.people, { openAll: true });
  if ($('shared')) $('shared').innerHTML = sharedCluesHtml(v.sharedClues);
  if ($('results')) $('results').innerHTML = resultsHtml(v.roundResults) || '<p class="small muted">No round votes.</p>';
  if ($('picture') && !$('picture').dataset.done && v.illustration) {
    $('picture').innerHTML = pictureHtml(v.illustration);
    $('picture').dataset.done = '1';
  }
  if ($('next') && v.phase) {
    const last = (v.phase.number ?? v.phase.index + 1) >= v.phase.count;
    $('next').textContent = v.round?.vote ? 'Close the vote' : v.round && !v.round.done ? 'Start the vote' : last ? 'Go to the final vote' : 'Next round';
  }
  tick();
}

function renderMap(force = false) {
  const box = $('map');
  if (!box || !view) return;
  const typing = document.activeElement?.classList?.contains('room-input');
  if (!force && (dragging || typing)) return;
  box.innerHTML = mapHtml(view, { before: positionsBefore, editing: editingMap });
  positionsBefore = view.map?.positions ?? null;
  if (editingMap) wireMapEditing(box);
}

function wireMapEditing(box) {
  const area = box.querySelector('.map');
  for (const el of box.querySelectorAll('.place.editing')) {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input')) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or finished pointer */
      }
      el.classList.add('dragging');
      dragging = { el, id: el.dataset.place };
    });
    el.addEventListener('pointermove', (e) => {
      if (dragging?.el !== el) return;
      const r = area.getBoundingClientRect();
      const x = Math.max(6, Math.min(94, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(8, Math.min(92, ((e.clientY - r.top) / r.height) * 100));
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      dragging.x = x;
      dragging.y = y;
    });
    const drop = async () => {
      if (dragging?.el !== el) return;
      const { id, x, y } = dragging;
      dragging = null;
      el.classList.remove('dragging');
      if (x !== undefined) await act('place', { id, x, y });
      renderMap(true);
    };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
  }
  for (const input of box.querySelectorAll('.room-input')) {
    input.addEventListener('change', () => act('place', { id: input.dataset.room, room: input.value }));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  }
}

function tick() {
  if (!view) return;
  if ($('round') && view.round?.vote) {
    const c = countdown(view.round.vote.endsAt);
    const t = $('round').querySelector('.timer');
    if (t) t.textContent = c.text;
    else $('round').innerHTML = caseHtml(view.caseQuestion) + roundHtml(view.round, { countdown: c.text });
  }
  if ($('timer') && view.phase?.endsAt) {
    const c = countdown(view.phase.endsAt);
    $('timer').textContent = c.text;
    $('timer').classList.toggle('low', c.low);
  }
  if ($('whois') && view.cast) {
    const lines = whoisLines(view.cast);
    const line = lines[Math.floor(Date.now() / 20_000) % lines.length];
    if (line && $('whois').dataset.line !== line) {
      $('whois').dataset.line = line;
      $('whois').innerHTML = `<span class="muted">Who's who</span> ${esc(line)}`;
    }
  }
  if ($('elapsed')) {
    const s = Math.round((Date.now() - (view.progress?.startedAt ?? skeleton?.since ?? Date.now())) / 1000);
    $('elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
tickers.add(tick);

const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    return null;
  }
  return null;
};

const score = new Score();
window.detectiveMusic = score;
score.volume = Number(store('detective-music-volume') ?? 0.6);
$('music-volume').value = score.volume;
$('music-volume').addEventListener('input', (e) => {
  score.setVolume(Number(e.target.value));
  store('detective-music-volume', e.target.value);
});
function musicLabel() {
  const on = score.playing;
  $('music-toggle').classList.toggle('on', on);
  $('music-toggle').setAttribute('aria-pressed', String(on));
  $('music-label').textContent = on ? 'Music on' : 'Music off';
}
$('music-toggle').addEventListener('click', async () => {
  if (score.playing) {
    score.stop();
    store('detective-music', 'off');
  } else {
    await score.start();
    store('detective-music', 'on');
  }
  musicLabel();
});
musicLabel();
tickers.add(() => {
  if (view) score.setIntensity(intensityFor(view));
});
setInterval(() => {
  if (!score.playing) return;
  const { rms } = score.level();
  $('music-meter').style.transform = `scale(${1 + Math.min(1.2, rms * 6)})`;
}, 80);

const narrator = new Narrator({ onStart: () => score.duck(true), onEnd: () => score.duck(false) });
window.detectiveNarrator = narrator;
narrator.voiceName = store('detective-voice');
function voiceLabel() {
  $('voice-toggle').classList.toggle('on', narrator.enabled);
  $('voice-toggle').setAttribute('aria-pressed', String(narrator.enabled));
  $('voice-label').textContent = narrator.enabled ? 'Voice on' : 'Voice off';
  $('voice-pick').hidden = !narrator.enabled || narrator.voices().length < 2;
}
function fillVoices() {
  const voices = narrator.voices();
  $('voice-pick').innerHTML = voices.map((v) => `<option value="${esc(v.name)}"${v.name === narrator.voiceName ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
  voiceLabel();
}
if (narrator.available) {
  globalThis.speechSynthesis.addEventListener?.('voiceschanged', fillVoices);
  fillVoices();
  $('voice-toggle').addEventListener('click', () => {
    narrator.enabled = !narrator.enabled;
    if (!narrator.enabled) narrator.stop();
    else narrator.say(['Voice on.']);
    store('detective-voice-on', narrator.enabled ? 'on' : 'off');
    voiceLabel();
  });
  $('voice-pick').addEventListener('change', (e) => {
    narrator.voiceName = e.target.value;
    store('detective-voice', e.target.value);
    narrator.stop();
    narrator.say(['This is my voice.']);
  });
} else {
  $('voice-toggle').hidden = true;
}

function readNow(lines) {
  if (!narrator.available) return toast('This browser cannot read out loud.');
  const was = narrator.enabled;
  narrator.enabled = true;
  narrator.stop();
  narrator.say(lines);
  narrator.enabled = was;
}

const sfx = new Sfx();
window.detectiveSfx = sfx;
sfx.enabled = store('detective-sfx') !== 'off';
function sfxLabel() {
  const locked = sfx.enabled && sfx.ctx?.state !== 'running';
  $('sfx-toggle').classList.toggle('on', sfx.enabled && !locked);
  $('sfx-toggle').setAttribute('aria-pressed', String(sfx.enabled));
  $('sfx-label').textContent = !sfx.enabled ? 'Sounds off' : locked ? 'Tap anywhere for sounds' : 'Sounds on';
}
tickers.add(sfxLabel);
$('sfx-toggle').addEventListener('click', () => {
  if (sfx.enabled && sfx.ctx?.state !== 'running') {
    sfx.unlock();
    setTimeout(() => sfx.play('news'), 60);
    return sfxLabel();
  }
  sfx.enabled = !sfx.enabled;
  store('detective-sfx', sfx.enabled ? 'on' : 'off');
  sfx.unlock();
  if (sfx.enabled) setTimeout(() => sfx.play('news'), 60);
  sfxLabel();
});
sfxLabel();

let lastView = null;
function onSound(v) {
  score.setTheme(v.music, v.setup?.tone);
  score.setIntensity(intensityFor(v));
  const cues = cuesBetween(lastView, v);
  for (const cue of cues) score.cue(cue);
  const sound = tableSound(lastView, v);
  if (sound && !(score.playing && ((sound === 'phase' && cues.includes('phase')) || (sound === 'hint' && cues.includes('hint'))))) sfx.play(sound);
  narrator.say(narrationFor(lastView, v));
  lastView = v;
  $('music-desc').textContent = v.musicDescription ?? '';
}

stream('', (v) => {
  onSound(v);
  const key = `${v.gameId}:${v.status}`;
  view = v;
  if (skeleton?.key !== key) {
    skeleton = { key, since: Date.now() };
    seenEvents = visibleCount(v.events);
    positionsBefore = null;
    editingMap = false;
    dragging = null;
    app.innerHTML = (skeletons[v.status] ?? skeletons.lobby)();
    wire();
  }
  update();
});
