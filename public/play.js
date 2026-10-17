import { api, esc, stream, countdown, suspicionLabel, hashParam, toast, tickers } from '/common.js';
import { mapHtml } from '/map.js';
import { novelHtml, pictureHtml, backgroundHtml, timelineHtml, newsHtml, sharedCluesHtml, roundHtml, stepHtml, caseHtml, alibiHtml, nightHtml, recapHtml, peopleHtml, playLine, totalLine, questionHtml, profileHtml, skillBars } from '/panels.js';
import { feedHtml, visibleCount } from '/feed.js';
import { phoneAlerts } from '/alerts.js';
import { Sfx } from '/sfx.js';

const app = document.getElementById('app');
const fromHash = hashParam('t');
let token = fromHash || localStorage.getItem('detective-token');
let view = null;
let skeleton = null;
let tab = 'story';
let draft = '';
let picked = new Set();
let positionsBefore = null;
let ownOpen = null;
let momentSig = '';
let seenNews = 0;
const openRounds = new Set();
const openPeople = new Set();
const seenFacts = {};
let factTotal = null;
const unseen = new Set();
const sfx = new Sfx({ volume: 0.25 });

const $ = (id) => document.getElementById(id);
const TAGS = { self: 'about you', action: 'secret' };
const STARTERS = [['Talk to…', 'I ask '], ['Look at…', 'I look at '], ['Secretly…', 'Secretly, I '], ['Remember…', 'I try to remember ']];

async function act(path, body = {}) {
  try {
    return await api(path, { token, ...body });
  } catch (err) {
    toast(err.message);
    return null;
  }
}

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

function saveToken(t) {
  token = t;
  localStorage.setItem('detective-token', t);
  history.replaceState(null, '', `#t=${t}`);
}

async function joinAs(body, { full }) {
  const res = await api('join', body).catch((err) => toast(err.message));
  if (!res?.token) return;
  store.set('detective-full', full ? '1' : '0');
  if (res.username) store.set('detective-username', res.username);
  saveToken(res.token);
  connect();
}

function joinScreen(publicView, message = '') {
  const open = !publicView || publicView.status === 'lobby';
  app.innerHTML = `<h1 style="margin-top:20px">Detective</h1>
    ${message ? `<p class="banner small">${esc(message)}</p>` : ''}
    ${open ? `<div class="panel stack" style="margin-top:14px">
      <div id="known" hidden><div class="label">Played before? Tap your name</div><div class="chips-wrap" id="known-chips"></div></div>
      <label><div class="label">Your name</div><input type="text" id="name" maxlength="24" autocomplete="given-name"></label>
      <div id="is-you" class="small" hidden></div>
      <label><div class="label">Who do you want to be? (optional)</div><input type="text" id="wish" maxlength="200" placeholder="A spy, someone funny, anything"></label>
      <details><summary class="small muted">Or type your username</summary><input type="text" id="username" maxlength="40" placeholder="nikhil" style="margin-top:6px"></details>
      <button class="primary wide" id="join">Join</button></div>`
      : '<p class="muted" style="margin-top:14px">This game already started. Ask the host for a new game.</p>'}`;
  if (!open) return;
  const remembered = store.get('detective-username');
  let linked = null;
  const link = (person) => {
    linked = person;
    $('name').value = person.name;
    document.querySelectorAll('[data-user]').forEach((b) => b.classList.toggle('on', b.dataset.user === person.username));
    $('is-you').hidden = true;
  };
  fetch('/api/people').then((r) => r.json()).then(({ people = [] }) => {
    if (!people.length) return;
    $('known').hidden = false;
    $('known-chips').innerHTML = people.map((p) => `<button class="chip" data-user="${esc(p.username)}">${esc(p.name)}</button>`).join('');
    $('known-chips').querySelectorAll('[data-user]').forEach((b) => b.addEventListener('click', () => link(people.find((p) => p.username === b.dataset.user))));
    const mine = people.find((p) => p.username === remembered);
    if (mine) link(mine);
  }).catch(() => {});
  $('name').addEventListener('input', () => {
    linked = null;
    document.querySelectorAll('[data-user]').forEach((b) => b.classList.remove('on'));
    $('is-you').hidden = true;
  });
  $('join').addEventListener('click', async () => {
    const name = $('name').value;
    const wish = $('wish').value;
    const typed = $('username').value.trim();
    if (linked) return joinAs({ name, wish, username: linked.username }, { full: linked.username === remembered });
    if (typed) return joinAs({ name, wish, username: typed }, { full: typed === remembered });
    const { match } = await api('checkname', { name }).catch(() => ({ match: null }));
    if (!match) return joinAs({ name, wish }, { full: true });
    $('is-you').hidden = false;
    $('is-you').innerHTML = `Is this you, ${esc(match.name)}? <button class="chip" id="yes-me">Yes</button> <button class="chip" id="not-me">No, I'm new</button>`;
    $('yes-me').addEventListener('click', () => joinAs({ name: match.name, wish, username: match.username }, { full: match.username === remembered }));
    $('not-me').addEventListener('click', () => joinAs({ name, wish, newPerson: true }, { full: true }));
  });
}

function topbar() {
  const v = view;
  return `<div class="topbar">
    <div class="row between small"><span class="serif" style="color:var(--accent)" id="phase-label"></span>
      <span class="timer" id="timer"></span></div>
    <div class="row between small muted" style="margin-top:2px"><span id="qleft"></span><span id="susp"></span></div>
    <div id="vote"></div>
    <div id="moment"></div>
    <div id="round-alert"></div>
    <div id="notice"></div>
  </div>`;
}

function cardHtml() {
  const c = view.card;
  const side = { investigator: 'Detective', culprit: 'Culprit', wildcard: 'Wildcard' }[c.side];
  return `<div class="stack">
    <div><h1>${esc(c.name)}</h1><div class="muted">${esc(c.role)}</div></div>
    <div class="goals">
      ${caseHtml(view.caseQuestion, "The group's goal")}
      <div class="case mine"><div class="label">Your secret goal</div><div class="question">${esc(c.goal)}</div>${c.goal_why ? `<div class="small" style="margin-top:4px">${esc(c.goal_why)}</div>` : ''}</div>
      <div class="small"><b>You are a ${esc(side)}.</b> ${esc(c.win)}</div>
      <div class="small muted">Points: 1 for the right culprit, up to 2 for how, up to 2 for why, 1 for your own goal. Plus up to 3 play points for good moves.</div>
    </div>
    ${c.wants || c.fears || c.reasons?.length ? `<div class="layer private drives"><div class="label">What drives you</div>
      ${c.wants ? `<p>${esc(c.wants)}</p>` : ''}
      ${c.fears ? `<p>${esc(c.fears)}</p>` : ''}
      ${c.reasons?.length ? `<div class="small muted" style="margin-top:6px">Why you did what you did</div><ul class="facts">${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
    ${c.night?.length ? `<div class="layer private"><div class="label">Your night: where you really were</div>${nightHtml(c)}</div>` : ''}
    <div class="layer public"><div class="label">Everyone knows</div>${esc(c.public_info)}</div>
    <div class="layer private"><div class="label">Only you know</div>
      <p>${esc(c.private_info)}</p>
      <p class="small">${esc(c.side_explanation)}</p>
      <p class="small"><b>Overrides left:</b> ${esc(view.overridesLeft ?? 0)} of ${esc(view.overridesTotal ?? 0)}</p>
      ${c.starting_knowledge ? `<p class="small"><b>You also know:</b> ${esc(c.starting_knowledge)}</p>` : ''}
    </div>
    <div class="layer hidden"><div class="label">You don't know yet</div>
      ${c.hidden_known.map((f) => `<p>&#10022; ${esc(f)}</p>`).join('')}
      <p class="small muted">${c.hidden_unknown ? `${c.hidden_unknown} secret${c.hidden_unknown > 1 ? 's' : ''} about you. Ask the GM about your past to find out.` : 'You found out everything about yourself.'}</p>
    </div>
  </div>`;
}

const skeletons = {
  waiting: () => `<h1 style="margin-top:20px">You're in, ${esc(view.me.name)}</h1>
    <div class="panel stack" style="margin-top:12px"><p id="wait-msg"></p><div><div class="label">Players here</div><div id="players"></div></div></div>
    <div id="question" class="panel" style="margin-top:12px" hidden></div>
    <details class="panel" id="me-profile" style="margin-top:12px" hidden><summary>What the game knows about you</summary><div id="profile" style="margin-top:8px"></div></details>
    <p class="small muted" style="margin-top:12px">Keep this page open. Your card shows up here.</p>`,
  reading: () => `
    <section id="t-story" class="tab"><div id="brief" class="panel"></div>
      <div class="folds"><details><summary>Timeline so far<span class="muted small" id="n-timeline"></span></summary><div id="timeline"></div></details>
        <details><summary>Alibis <span class="muted small">where people say they were</span></summary><div id="alibis"></div></details></div>
      <div class="panel" style="margin-top:12px"><div class="label">Ask about the world (free)</div>
        <textarea id="world-text" maxlength="200" placeholder="How far is the town? Type, or use the mic on your keyboard." style="min-height:60px"></textarea>
        <button class="wide" id="world-send" style="margin-top:6px">Ask everyone</button><div id="qa" style="margin-top:8px"></div></div></section>
    <section id="t-card" class="tab"><div id="card-body">${cardHtml()}</div><div style="margin-top:16px"><button class="primary wide" id="read">Done reading</button><p class="small muted" id="read-note" style="margin-top:6px"></p></div></section>
    <nav class="tabs">${[['story', 'Story'], ['card', 'My card']].map(([t, l]) => `<button data-tab="${t}">${l}</button>`).join('')}</nav>`,
  playing: () => `${topbar()}
    <section id="t-story" class="tab">
      <div class="now" id="round"></div>
      <div class="say">
        <textarea id="world-text" maxlength="200" rows="2" placeholder="Ask anyone anything. &quot;Lata, when did the music stop?&quot;"></textarea>
        <div class="say-row"><button class="primary" id="world-send">Ask out loud</button><button id="say-private">Ask in private</button></div>
        <div class="small muted" id="say-note"></div>
      </div>
      <div id="recap"></div>
      <button class="quiet" id="hint">Ask the group for a hint</button>
      <div id="news" style="margin-top:10px"></div>
      <div class="folds">
        <details><summary>Timeline<span class="muted small" id="n-timeline"></span></summary><div id="timeline"></div></details>
        <details><summary>Alibis <span class="muted small">where people say they were</span></summary><div id="alibis"></div></details>
        <details><summary>Shared clues<span class="muted small" id="n-shared"></span></summary><div id="shared"></div></details>
        <details><summary>The place and the story so far</summary><div id="picture"></div><div id="background"></div></details>
      </div>
    </section>
    <section id="t-card" class="tab"><div class="layer private persona" id="persona"></div><div id="card-body">${cardHtml()}</div></section>
    <section id="t-ask" class="tab">
      <div class="small muted" style="margin-bottom:8px">Private chat with the GM. Write what you do, in your own words. To speak instead, tap the &#127908; mic on your keyboard.</div>
      <div class="thread" id="thread"></div>
      <div class="composer">
        <div class="chips-scroll" id="starters">${STARTERS.map(([l, t]) => `<button class="chip" data-start="${esc(t)}">${esc(l)}</button>`).join('')}</div>
        <div class="chips-scroll" id="targets"></div>
        <div class="composer-row"><textarea id="ask-text" maxlength="500" rows="2" placeholder="I ask the cook where he was at nine."></textarea><button class="primary" id="send">Send</button></div>
      </div>
    </section>
    <section id="t-people" class="tab"><div id="people"></div><h3 style="margin-top:18px">Who is where now</h3><div id="map"></div></section>
    <section id="t-clues" class="tab"><h2>Your clues</h2><div id="clues"></div>
      <h2 style="margin-top:16px">Notes</h2><p class="small muted">Only on this phone.</p><textarea id="notes" style="min-height:30vh"></textarea></section>
    <nav class="tabs">${[['story', 'Story'], ['card', 'Card'], ['ask', 'Ask'], ['people', 'People'], ['clues', 'Clues']].map(([t, l]) => `<button data-tab="${t}">${l}</button>`).join('')}</nav>`,
  final: () => `<h1 style="margin-top:12px">Who did it?</h1>
    <p class="muted">Everyone picks. Culprits too. Most votes decides who wins.</p>
    <div id="final-body"></div>`,
  reveal: () => {
    const r = view.reveal;
    const mine = r.players.find((p) => p.player_id === view.me.id) ?? {};
    const win = r.verdict.winner === 'investigators';
    return `<h1 style="margin-top:12px">${win ? 'The detectives win' : 'The culprits got away'}</h1>
      <p class="muted">The full story is on the big screen.</p>
      <div class="panel stack"><div class="label">How you did</div>
        <div class="score"><b>${esc(totalLine(mine))}</b> &middot; Culprit ${mine.culprit_correct ? '&#10003;' : '&#10007;'} &middot; How ${mine.method_score ?? 0}/2 &middot; Why ${mine.motive_score ?? 0}/2 &middot; Goal ${mine.goal_achieved ? '&#10003;' : '&#10007;'}</div>
        ${r.bestPlay?.includes(view.me.id) ? '<p class="small"><b>Best play this game.</b></p>' : ''}
        <p class="small">${esc(mine.goal_outcome)}</p><p class="small muted">${esc(mine.comment)}</p>
        ${Object.keys(mine.skills ?? {}).length ? `<div class="label">Your skills this game</div>${skillBars(Object.entries(mine.skills).map(([skill, points]) => ({ skill, points })))}` : ''}
        ${mine.coaching ? `<p class="small"><b>Tip:</b> ${esc(mine.coaching)}</p>` : ''}</div>
      <div class="layer hidden" style="margin-top:12px"><div class="label">What you never knew</div>
        ${r.cards.find((c) => c.id === view.me.id).hidden_facts.map((f) => `<p>${esc(f)}</p>`).join('')}</div>
      <div class="panel" style="margin-top:12px"><div class="label">What really happened</div><p style="white-space:pre-wrap">${esc(r.reveal_story)}</p></div>`;
  },
};

const statusSkeleton = (s) => (['lobby', 'generating', 'failed'].includes(s) ? 'waiting' : s);

function wire() {
  $('read')?.addEventListener('click', () => act('ready'));
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    showTab();
  }));
  $('world-send')?.addEventListener('click', async () => {
    const res = await act('public', { text: $('world-text').value });
    if (res) $('world-text').value = '';
  });
  $('say-private')?.addEventListener('click', async () => {
    const res = await act('ask', { kind: 'chat', text: $('world-text').value });
    if (!res) return;
    $('world-text').value = '';
    tab = 'ask';
    showTab();
    update();
  });
  $('round')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-idea]');
    if (!b || !$('world-text')) return;
    $('world-text').value = b.dataset.idea;
    $('world-text').focus();
  });
  if (document.querySelector('[data-tab]')) showTab();
  $('hint')?.addEventListener('click', () => act('hint'));
  $('people')?.addEventListener('toggle', (e) => {
    const id = e.target.dataset?.person;
    if (!id) return;
    if (e.target.open) {
      openPeople.add(id);
      seenFacts[id] = view.people?.find((p) => p.id === id)?.facts.length ?? 0;
      e.target.querySelector('.count')?.classList.remove('new');
    } else {
      openPeople.delete(id);
    }
  }, true);
  $('news')?.addEventListener('toggle', (e) => {
    const r = Number(e.target.dataset?.round);
    if (Number.isNaN(r)) return;
    if (e.target.open) openRounds.add(r);
    else openRounds.delete(r);
  }, true);
  $('news')?.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    const box = $(go.dataset.go === 'clues' ? 'shared' : 'timeline')?.closest('details');
    if (box) {
      box.open = true;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  $('moment')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-moment]');
    if (!b) return;
    const action = b.dataset.moment;
    if (action === 'open-own') ownOpen = b.dataset.id;
    else if (action === 'cancel-own') ownOpen = null;
    else {
      const text = action === 'own' ? $('own-text')?.value ?? '' : '';
      if (action === 'own' && !text.trim()) return toast('Type what you said.');
      const res = await act('moment', { id: b.dataset.id, action, text });
      if (res) ownOpen = null;
    }
    renderMoment(true);
  });
  const text = $('ask-text');
  if (text) {
    text.value = draft;
    text.addEventListener('input', () => (draft = text.value));
    const insert = (words) => {
      text.value = draft = `${text.value}${text.value && !text.value.endsWith(' ') ? ' ' : ''}${words}`;
      text.focus();
    };
    $('starters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-start]');
      if (!b) return;
      text.value = draft = '';
      insert(b.dataset.start);
    });
    $('targets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-target]');
      if (b) insert(b.dataset.target);
    });
    $('send').addEventListener('click', async () => {
      const res = await act('ask', { kind: 'chat', text: text.value });
      if (res) draft = text.value = '';
    });
  }
  const notes = $('notes');
  if (notes) {
    const key = `detective-notes-${view.gameId}`;
    notes.value = localStorage.getItem(key) ?? '';
    notes.addEventListener('input', () => localStorage.setItem(key, notes.value));
  }
}

function showTab() {
  if (!document.getElementById(`t-${tab}`)) tab = 'story';
  unseen.delete(tab);
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden-el', s.id !== `t-${tab}`));
  markTabs();
  if (tab === 'ask') scrollChat(true);
}

function markTabs() {
  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
    b.classList.toggle('new', unseen.has(b.dataset.tab) && b.dataset.tab !== tab);
  });
}

let chatKey = '';
function scrollChat(force = false) {
  const key = `${view?.thread?.length ?? 0}:${view?.pending ? 1 : 0}`;
  if (force || key !== chatKey) requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  chatKey = key;
}

function momentHtml(v) {
  const m = v.moments?.[0];
  if (!m) return '';
  const left = v.overridesLeft;
  const ready = m.status === 'getready';
  const secs = Math.max(0, Math.round((m.readyAt - Date.now()) / 1000));
  return `<div class="moment${ready ? '' : ' live'}">
    <div class="label">${ready ? `Get ready. You are up in <span class="moment-timer" data-ready="${m.readyAt}">${secs}s</span>` : 'Your moment. Everyone is listening.'}</div>
    ${m.why ? `<div class="small muted">${esc(m.why)}</div>` : ''}
    <p class="moment-line">&ldquo;${esc(m.line)}&rdquo;</p>
    ${ownOpen === m.id ? `<div class="moment-actions">
      <textarea id="own-text" maxlength="200" rows="2" placeholder="Type what you said, or use the mic on your keyboard"></textarea>
      <button class="primary" data-moment="own" data-id="${esc(m.id)}">Post it for everyone</button>
      <button class="quiet" data-moment="cancel-own" data-id="${esc(m.id)}">Back</button>
    </div>` : `<div class="moment-actions">
      ${ready ? `<button data-moment="ready" data-id="${esc(m.id)}">I'm ready, call me now</button>` : `<button class="primary" data-moment="said" data-id="${esc(m.id)}">I said it</button>`}
      <button data-moment="quiet" data-id="${esc(m.id)}" ${left < 1 ? 'disabled' : ''}>Stay quiet</button>
      <button data-moment="open-own" data-id="${esc(m.id)}" ${left < 1 ? 'disabled' : ''}>Say it my way</button>
    </div>`}
    <div class="small muted">${left < 1 ? 'No overrides left. You have to say it.' : `Staying quiet or saying it your way uses 1 override (${left} left).`}</div>
  </div>`;
}

function renderMoment(force = false) {
  if (!$('moment') || !view) return;
  const m = view.moments?.[0];
  if (ownOpen && m?.id !== ownOpen) ownOpen = null;
  const sig = JSON.stringify([m?.id, m?.status, view.overridesLeft, ownOpen]);
  if (!force && sig === momentSig) return;
  const typed = $('own-text')?.value;
  momentSig = sig;
  $('moment').innerHTML = momentHtml(view);
  if ($('own-text')) {
    $('own-text').value = typed ?? '';
    $('own-text').focus();
  }
}

let noticeTimer = null;
function showNotice(text, toTab, ms = 8000, cls = '') {
  if (!$('notice')) return;
  $('notice').innerHTML = `<button class="notice ${cls}" data-notice="${esc(toTab ?? '')}">${esc(text)}${toTab ? ' <span class="muted">Open</span>' : ''}</button>`;
  $('notice').querySelector('button').addEventListener('click', (e) => {
    const t = e.currentTarget.dataset.notice;
    $('notice').innerHTML = '';
    if (t) {
      tab = t;
      showTab();
      update();
    }
  });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice') && ($('notice').innerHTML = ''), ms);
}

function notify(alerts) {
  for (const a of alerts) {
    if (a.tab && a.tab !== tab) unseen.add(a.tab);
  }
  if (!alerts.length) return;
  sfx.play(alerts[0].sound);
  navigator.vibrate?.(alerts[0].sound === 'call' ? [80, 60, 80] : 60);
  const a = alerts.find((x) => x.tab && x.tab !== tab) ?? null;
  if (a) showNotice(a.text, a.tab);
  showTab();
}

const PELLET_MS = 3 * 60_000;
const pellet = { at: 0, round: null, next: 1 };
function pelletTick() {
  const v = view;
  const list = v?.card?.pellets ?? [];
  if (v?.status !== 'playing' || !list.length) return;
  const now = Date.now();
  const round = v.phase?.number ?? v.phase?.index;
  if (pellet.round !== round) {
    pellet.round = round;
    pellet.at = now + 15_000;
    pellet.first = true;
    try {
      pellet.next = Number(localStorage.getItem(`detective-pellet-${v.gameId}`)) || 1;
    } catch {
      pellet.next = 1;
    }
  }
  if (now < pellet.at) return;
  if (v.round?.vote || v.moments?.length || v.pending || $('notice')?.childElementCount) {
    pellet.at = now + 20_000;
    return;
  }
  let text = list[0];
  if (!pellet.first) {
    const i = pellet.next % list.length || 1;
    text = list[i];
    pellet.next = i + 1;
    try {
      localStorage.setItem(`detective-pellet-${v.gameId}`, String(pellet.next));
    } catch {
      /* private mode */
    }
  }
  pellet.first = false;
  pellet.at = now + PELLET_MS;
  sfx.play('soft');
  showNotice(`Remember: ${text}`, 'card', 14_000, 'pellet');
}
tickers.add(pelletTick);

function finalBody() {
  const v = view;
  if (v.submission) {
    return `<div class="panel"><p><b>Your answer is in.</b></p><p class="muted small">Waiting for ${v.players.length - v.submitted.length} more. ${v.scoring ? 'The GM is checking the answers...' : ''}</p></div>`;
  }
  const suspects = v.setup?.npcRole === 'background' ? [] : v.cast.npcs.filter((n) => !n.minor);
  const people = [...v.cast.players.filter((c) => c.id !== v.me.id), ...suspects, ...v.cast.players.filter((c) => c.id === v.me.id)];
  return `<div class="panel">
      <div class="label">Who did it? Pick one or more.</div>
      ${people.map((c) => `<label class="check"><input type="checkbox" data-c="${esc(c.id)}" ${picked.has(c.id) ? 'checked' : ''}><span><b>${esc(c.name)}</b> <span class="muted small">${esc(c.role)}${c.id === v.me.id ? ' (you)' : ''}</span></span></label>`).join('')}
    </div>
    <p class="small muted" style="margin-top:12px">Type, or tap the &#127908; mic on your keyboard to speak.</p>
    <label class="field"><div class="label">How? <span class="muted">(up to 2 points, one line is enough)</span></div><textarea id="how"></textarea></label>
    <label class="field"><div class="label">Why? <span class="muted">(up to 2 points, one line is enough)</span></div><textarea id="why"></textarea></label>
    <label class="field"><div class="label">Did you get your goal?</div><textarea id="goal"></textarea></label>
    <div id="empty-warn" class="banner small" hidden></div>
    <button class="primary wide" id="submit">Send my answer</button>`;
}

let shownPublicError = null;
function update() {
  const v = view;
  if (v.publicError !== shownPublicError) {
    shownPublicError = v.publicError;
    if (v.publicError) toast(v.publicError);
  }
  if ($('players')) $('players').innerHTML = v.players.map((p) => `<span class="badge" style="margin:0 6px 6px 0">${esc(p.name)}</span>`).join('');
  if ($('wait-msg')) {
    const step = v.progress?.steps.find((s) => s.id === v.progress.step)?.label;
    $('wait-msg').innerHTML = v.status === 'generating' ? `The GM is writing the mystery${step ? `: <b>${esc(step.toLowerCase())}</b>` : ''}<span class="dots"></span>`
      : v.status === 'failed' ? 'Something went wrong. The host can try again.'
      : 'Waiting for the host to start.';
  }
  if ($('read')) {
    const done = v.ready.includes(v.me.id);
    $('read').disabled = done;
    $('read').textContent = done ? 'Ready' : 'Done reading';
    $('read-note').textContent = `${v.ready.length} of ${v.players.length} ready. Keep your card secret.`;
  }
  if ($('phase-label')) $('phase-label').textContent = v.phase ? `Round ${v.phase.number ?? v.phase.index + 1} of ${v.phase.count}: ${v.phase.name}` : '';
  if ($('recap')) $('recap').innerHTML = recapHtml(v.recap);
  if ($('persona')) $('persona').innerHTML = v.persona ? `<div class="label">How you are playing it</div>${v.persona.intent ? `<p>${esc(v.persona.intent)}</p>` : ''}${v.persona.persona ? `<p class="small">${esc(v.persona.persona)}</p>` : ''}` : '';
  const card = $('card-body');
  if (card && card.dataset.sig !== JSON.stringify([v.card, v.overridesLeft])) {
    card.dataset.sig = JSON.stringify([v.card, v.overridesLeft]);
    card.innerHTML = cardHtml();
  }
  if ($('brief')) $('brief').innerHTML = stepHtml(v, { me: v.me.id });
  if ($('qa')) $('qa').innerHTML = newsHtml(v.events.filter((e) => e.kind === 'qa')).replace('No news yet.', '');
  if ($('round')) {
    $('round').innerHTML = caseHtml(v.caseQuestion) + (v.round ? roundHtml(v.round, { voting: true, myVote: v.myRoundVote, tappable: true }) : '<div class="label">This round</div><div class="question">Talk, look around and share clues.</div>');
    $('round').querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => act('roundvote', { choice: Number(b.dataset.choice) })));
  }
  renderMoment();
  if ($('round-alert')) {
    const needVote = v.round?.vote && v.myRoundVote === null && tab !== 'story';
    $('round-alert').innerHTML = needVote ? '<button class="primary wide" id="go-vote" style="margin-top:8px">Vote now</button>' : '';
    $('go-vote')?.addEventListener('click', () => {
      tab = 'story';
      showTab();
      update();
    });
  }
  if ($('background')) $('background').innerHTML = backgroundHtml(v.background);
  if ($('timeline')) $('timeline').innerHTML = timelineHtml(v.timeline);
  if ($('alibis')) $('alibis').innerHTML = alibiHtml(v.alibis, { me: v.card?.name });
  if (v.people) {
    const total = v.people.reduce((n, p) => n + p.facts.length, 0);
    if (factTotal === null) for (const p of v.people) seenFacts[p.id] ??= p.facts.length;
    else if (total > factTotal && tab !== 'people') unseen.add('people');
    factTotal = total;
    for (const id of openPeople) seenFacts[id] = v.people.find((p) => p.id === id)?.facts.length ?? 0;
    if ($('people')) $('people').innerHTML = peopleHtml(v.people, { open: openPeople, seen: seenFacts });
  }
  if ($('shared')) $('shared').innerHTML = sharedCluesHtml(v.sharedClues);
  if ($('n-timeline')) $('n-timeline').textContent = v.timeline?.length ? ` ${v.timeline.length}` : '';
  if ($('n-shared')) $('n-shared').textContent = v.sharedClues?.length ? ` ${v.sharedClues.length}` : '';
  if ($('news')) {
    const n = visibleCount(v.events);
    $('news').innerHTML = feedHtml(v.events, { fresh: n - seenNews, open: openRounds });
    if (n > seenNews && tab !== 'story') unseen.add('story');
    seenNews = n;
  }
  if ($('picture') && !$('picture').dataset.done && v.illustration) {
    $('picture').innerHTML = pictureHtml(v.illustration);
    $('picture').dataset.done = '1';
  }
  if ($('qleft')) $('qleft').textContent = `${v.questionsLeft} question${v.questionsLeft === 1 ? '' : 's'} left`;
  if ($('map')) {
    $('map').innerHTML = mapHtml(v, { me: v.me.id, before: positionsBefore });
    positionsBefore = v.map?.positions ?? null;
  }
  if ($('susp')) $('susp').textContent = `Suspicion: ${suspicionLabel(v.suspicion)}`;
  if ($('vote')) {
    $('vote').innerHTML = v.hintVote ? `<div class="banner small" style="margin-top:8px"><b>${esc(v.hintVote.proposer)}</b> wants a hint (${v.hintVote.yes} of ${v.hintVote.need} yes).
      <div class="row" style="margin-top:6px;gap:8px"><button class="primary" style="flex:1" data-vote="1" ${v.myVote === true ? 'disabled' : ''}>Yes</button><button style="flex:1" data-vote="0" ${v.myVote === false ? 'disabled' : ''}>No, keep it</button></div></div>` : '';
    $('vote').querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => act('vote', { yes: b.dataset.vote === '1' })));
  }
  if ($('send')) {
    const blocked = v.pending || v.transitioning || v.questionsLeft < 1;
    $('send').disabled = blocked || Boolean(v.round?.vote);
    $('send').innerHTML = v.pending ? 'Thinking<span class="dots"></span>' : v.round?.vote ? 'Voting' : v.transitioning ? 'Wait' : v.questionsLeft < 1 ? 'No questions left' : 'Send';
    $('hint').disabled = v.hintsLeft < 1 || Boolean(v.hintVote);
    $('hint').textContent = v.hintsLeft < 1 ? 'No group hints left' : `Ask the group for a hint · ${v.hintsLeft} left`;
  }
  if ($('say-note')) {
    const left = v.questionsLeft ?? 0;
    $('say-note').innerHTML = `Out loud: free, everyone hears. In private: only you, uses 1 question (${left} left). Tap the &#127908; on your keyboard to speak.`;
    $('say-private').disabled = left < 1 || Boolean(v.pending) || Boolean(v.round?.vote) || v.transitioning;
    $('world-send').disabled = Boolean(v.publicPending);
    $('world-send').innerHTML = v.publicPending ? 'Asking<span class="dots"></span>' : 'Ask out loud';
  }
  if ($('starters')) {
    const ideas = [...(v.thread ?? [])].reverse().find((m) => m.from === 'gm')?.ideas ?? [];
    const sig = JSON.stringify(ideas);
    if ($('starters').dataset.sig !== sig) {
      $('starters').dataset.sig = sig;
      $('starters').innerHTML = [...ideas.map((t) => [t, t, ' idea']), ...STARTERS.map(([l, t]) => [l, t, ''])]
        .map(([l, t, cls]) => `<button class="chip${cls}" data-start="${esc(t)}">${esc(l)}</button>`).join('');
    }
  }
  if ($('targets') && v.cast && !$('targets').childElementCount) {
    const chips = [...v.cast.npcs.map((n) => [n.name, n.minor ? 'minor' : '']), ...v.cast.locations.map((l) => [l.name, ''])];
    $('targets').innerHTML = chips.map(([n, cls]) => `<button class="chip ${cls}" data-target="${esc(n)}">${esc(n)}</button>`).join('');
  }
  if ($('thread')) {
    const label = { you: 'You', gm: 'GM', whisper: 'Secret note', system: 'Problem' };
    const items = v.pending ? [...v.thread, { from: 'you', text: v.pending.text }, { from: 'gm', text: 'Thinking...' }] : v.thread;
    $('thread').innerHTML = items.map((m) => {
      const tag = m.from === 'you' && TAGS[m.kind] ? `<span class="tag">${esc(TAGS[m.kind])}</span>` : '';
      const scored = m.from === 'gm' && m.play ? `<div class="play-line small">${esc(playLine(m.play))}</div>` : '';
      return `<div class="msg ${esc(m.from)}"><div class="label">${label[m.from]}${tag}</div>${m.lines ? novelHtml(m.lines) : esc(m.text)}${scored}</div>`;
    }).join('') || '<p class="small muted">Nothing yet. Try: "I ask the cook where he was at nine."</p>';
    if (tab === 'ask') scrollChat();
  }
  if ($('clues')) {
    const shared = new Set((v.sharedClues ?? []).map((c) => c.id));
    $('clues').innerHTML = v.clues.length ? v.clues.map((c) => `<div class="panel" style="margin-bottom:10px"><b>${esc(c.name)}</b>${c.destroyed ? ' <span class="badge culprit">now gone</span>' : ''}<div class="small">${esc(c.shows)}</div>
        ${shared.has(c.id) ? '<div class="small muted" style="margin-top:6px">Everyone can see this.</div>' : `<button class="chip" data-share="${esc(c.id)}" style="margin-top:6px">Show everyone</button>`}</div>`).join('')
      : '<p class="muted">Nothing yet. Use Ask to look around and talk to people.</p>';
    $('clues').querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', () => act('share', { clueId: b.dataset.share })));
  }
  if ($('final-body')) {
    $('final-body').innerHTML = finalBody();
    $('final-body').querySelectorAll('[data-c]').forEach((b) => b.addEventListener('change', () => (b.checked ? picked.add(b.dataset.c) : picked.delete(b.dataset.c))));
    const send = () => act('submit', { culprit_ids: [...picked], how: $('how').value, why: $('why').value, goal: $('goal').value });
    $('submit')?.addEventListener('click', () => {
      const empty = [['How', $('how').value], ['Why', $('why').value]].filter(([, t]) => !t.trim()).map(([n]) => n);
      if (!empty.length) return send();
      $('empty-warn').hidden = false;
      $('empty-warn').innerHTML = `${empty.join(' and ')} ${empty.length > 1 ? 'are' : 'is'} empty, that is ${empty.length * 2} points. Send anyway? <button class="chip" id="send-anyway">Send</button> <button class="chip" id="go-back">Go back</button>`;
      $('send-anyway').addEventListener('click', send);
      $('go-back').addEventListener('click', () => { $('empty-warn').hidden = true; $(empty[0].toLowerCase()).focus(); });
    });
  }
  if ($('question')) {
    const q = v.question;
    $('question').hidden = !q;
    if (q && $('question').dataset.q !== q.id) {
      $('question').dataset.q = q.id;
      $('question').innerHTML = questionHtml(q);
      $('question').querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => act('answer', { id: q.id, choice: Number(b.dataset.choice) })));
      $('q-send').addEventListener('click', () => $('q-own').value.trim() && act('answer', { id: q.id, text: $('q-own').value }));
      $('question').querySelector('[data-skip]').addEventListener('click', () => act('answer', { id: q.id }));
    }
  }
  if ($('profile') && v.profile) {
    $('me-profile').hidden = false;
    const sig = JSON.stringify(v.profile);
    if ($('profile').dataset.sig !== sig) {
      $('profile').dataset.sig = sig;
      $('profile').innerHTML = profileHtml(v.profile);
      $('forget')?.addEventListener('click', () => act('forget'));
    }
  }
  markTabs();
  tick();
}

function tick() {
  document.querySelectorAll('.moment-timer').forEach((el) => {
    el.textContent = `${Math.max(0, Math.round((Number(el.dataset.ready) - Date.now()) / 1000))}s`;
  });
  if ($('timer') && view?.phase?.endsAt) {
    const c = countdown(view.phase.endsAt);
    $('timer').textContent = c.text;
    $('timer').classList.toggle('low', c.low);
  }
}
tickers.add(tick);

let finalRendered = false;
function onView(v) {
  const alerts = phoneAlerts(view, v);
  view = v;
  const key = `${v.gameId}:${statusSkeleton(v.status)}`;
  if (skeleton !== key) {
    skeleton = key;
    finalRendered = false;
    positionsBefore = null;
    momentSig = '';
    seenNews = visibleCount(v.events);
    app.innerHTML = skeletons[statusSkeleton(v.status)]();
    wire();
  }
  notify(alerts);
  if (v.status === 'final' && finalRendered && !v.submission) return tick();
  update();
  if (v.status === 'final') finalRendered = true;
}

let closeLobby = null;
function connect() {
  closeLobby?.();
  if (!token) {
    let shown = null;
    closeLobby = stream('', (v) => {
      const open = v.status === 'lobby';
      if (shown !== open) {
        shown = open;
        joinScreen(v);
      }
    });
    return;
  }
  stream(`?token=${encodeURIComponent(token)}${store.get('detective-full') === '1' ? '&full=1' : ''}`, onView, () => {
    localStorage.removeItem('detective-token');
    token = null;
    history.replaceState(null, '', location.pathname);
    connect();
    toast('A new game started. Join again.');
  });
}

connect();
