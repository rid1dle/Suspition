import { api, esc, stream, countdown, suspicionLabel, hashParam, toast, tickers } from '/common.js';
import { mapHtml } from '/map.js';
import { pictureHtml, backgroundHtml, timelineHtml, newsHtml, sharedCluesHtml, roundHtml, stepHtml } from '/panels.js';

const app = document.getElementById('app');
const fromHash = hashParam('t');
let token = fromHash || localStorage.getItem('detective-token');
let view = null;
let skeleton = null;
let tab = 'story';
let kind = 'question';
let draft = '';
let picked = new Set();
let positionsBefore = null;

const $ = (id) => document.getElementById(id);
const KINDS = [
  ['question', 'Ask or look', 'Talk to someone, or look at a place or thing.'],
  ['self', 'About me', 'What do you try to remember about yourself?'],
  ['action', 'Secret move', 'What do you do when no one is looking?'],
  ['world', 'Ask everyone', 'A question about the world. Free. Everyone sees the answer.'],
];

async function act(path, body = {}) {
  try {
    return await api(path, { token, ...body });
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function saveToken(t) {
  token = t;
  localStorage.setItem('detective-token', t);
  history.replaceState(null, '', `#t=${t}`);
}

function joinScreen(publicView, message = '') {
  const open = !publicView || publicView.status === 'lobby';
  app.innerHTML = `<h1 style="margin-top:20px">Detective</h1>
    ${message ? `<p class="banner small">${esc(message)}</p>` : ''}
    ${open ? `<div class="panel stack" style="margin-top:14px">
      <label><div class="label">Your name</div><input type="text" id="name" maxlength="24" autocomplete="given-name"></label>
      <label><div class="label">Who do you want to be? (optional)</div><input type="text" id="wish" maxlength="200" placeholder="A spy, someone funny, anything"></label>
      <button class="primary wide" id="join">Join</button></div>`
      : '<p class="muted" style="margin-top:14px">This game already started. Ask the host for a new game.</p>'}`;
  $('join')?.addEventListener('click', async () => {
    const res = await api('join', { name: $('name').value, wish: $('wish').value }).catch((err) => toast(err.message));
    if (res?.token) {
      saveToken(res.token);
      connect();
    }
  });
}

function topbar() {
  const v = view;
  return `<div class="topbar">
    <div class="row between small"><span class="serif" style="color:var(--accent)" id="phase-label"></span>
      <span class="timer" id="timer"></span></div>
    <div class="row between small muted" style="margin-top:2px"><span id="qleft"></span><span id="susp"></span></div>
    <div id="vote"></div>
    <div id="round-alert"></div>
  </div>`;
}

function cardHtml() {
  const c = view.card;
  const side = { investigator: 'Detective', culprit: 'Culprit', wildcard: 'Wildcard' }[c.side];
  return `<div class="stack">
    <div><h1>${esc(c.name)}</h1><div class="muted">${esc(c.role)}</div></div>
    <div class="layer public"><div class="label">Everyone knows</div>${esc(c.public_info)}</div>
    <div class="layer private"><div class="label">Only you know</div>
      <p>${esc(c.private_info)}</p>
      <p><b>Your goal:</b> ${esc(c.goal)}</p>
      <p><b>You are a ${esc(side)}.</b> ${esc(c.side_explanation)}</p>
      ${c.starting_knowledge ? `<p class="small"><b>You also know:</b> ${esc(c.starting_knowledge)}</p>` : ''}
    </div>
    <div class="layer hidden"><div class="label">You don't know yet</div>
      ${c.hidden_known.map((f) => `<p>&#10022; ${esc(f)}</p>`).join('')}
      <p class="small muted">${c.hidden_unknown ? `${c.hidden_unknown} secret${c.hidden_unknown > 1 ? 's' : ''} about you. Use "About me" to find out.` : 'You found out everything about yourself.'}</p>
    </div>
  </div>`;
}

const skeletons = {
  waiting: () => `<h1 style="margin-top:20px">You're in, ${esc(view.me.name)}</h1>
    <div class="panel stack" style="margin-top:12px"><p id="wait-msg"></p><div><div class="label">Players here</div><div id="players"></div></div></div>
    <p class="small muted" style="margin-top:12px">Keep this page open. Your card shows up here.</p>`,
  reading: () => `
    <section id="t-story" class="tab"><div id="brief" class="panel"></div>
      <div class="panel" style="margin-top:12px"><div class="label">Ask about the world (free)</div>
        <textarea id="world-text" maxlength="200" placeholder="How far is the town? Who owns the hotel?" style="min-height:60px"></textarea>
        <button class="wide" id="world-send" style="margin-top:6px">Ask everyone</button><div id="qa" style="margin-top:8px"></div></div></section>
    <section id="t-card" class="tab"><div id="card-body">${cardHtml()}</div><div style="margin-top:16px"><button class="primary wide" id="read">Done reading</button><p class="small muted" id="read-note" style="margin-top:6px"></p></div></section>
    <nav class="tabs">${[['story', 'Story'], ['card', 'My card']].map(([t, l]) => `<button data-tab="${t}">${l}</button>`).join('')}</nav>`,
  playing: () => `${topbar()}
    <section id="t-story" class="tab">
      <div class="panel" id="round"></div>
      <div id="picture" style="margin-top:12px"></div>
      <div class="panel" style="margin-top:12px"><div class="label">Background</div><div id="background"></div></div>
      <div class="panel" style="margin-top:12px"><div class="label">Timeline</div><div id="timeline"></div></div>
      <div class="panel" style="margin-top:12px"><div class="label">Shared clues</div><div id="shared"></div></div>
      <div class="panel" style="margin-top:12px"><div class="label">News</div><div id="news"></div></div>
    </section>
    <section id="t-card" class="tab"><div id="card-body">${cardHtml()}</div></section>
    <section id="t-ask" class="tab">
      <div class="row" style="gap:6px;margin-bottom:8px" id="kinds">${KINDS.map(([k, l]) => `<button class="chip" data-k="${k}">${l}</button>`).join('')}</div>
      <textarea id="ask-text" maxlength="500"></textarea>
      <div class="row" style="gap:6px;margin:8px 0" id="targets"></div>
      <button class="primary wide" id="send">Send</button>
      <button class="wide" id="hint" style="margin-top:8px">Ask the group for a hint</button>
      <div class="thread" id="thread" style="margin-top:16px"></div>
    </section>
    <section id="t-map" class="tab"><h2>Who is where</h2><div id="map"></div></section>
    <section id="t-clues" class="tab"><h2>Your clues</h2><div id="clues"></div>
      <h2 style="margin-top:16px">Notes</h2><p class="small muted">Only on this phone.</p><textarea id="notes" style="min-height:30vh"></textarea></section>
    <nav class="tabs">${[['story', 'Story'], ['card', 'Card'], ['ask', 'Ask'], ['map', 'Map'], ['clues', 'Clues']].map(([t, l]) => `<button data-tab="${t}">${l}</button>`).join('')}</nav>`,
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
        <div class="score">Culprit ${mine.culprit_correct ? '&#10003;' : '&#10007;'} &middot; How ${mine.method_score ?? 0}/2 &middot; Why ${mine.motive_score ?? 0}/2 &middot; Goal ${mine.goal_achieved ? '&#10003;' : '&#10007;'}</div>
        <p class="small">${esc(mine.goal_outcome)}</p><p class="small muted">${esc(mine.comment)}</p></div>
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
  document.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.k;
    showKind();
  }));
  $('world-send')?.addEventListener('click', async () => {
    const res = await act('public', { text: $('world-text').value });
    if (res) $('world-text').value = '';
  });
  if (document.querySelector('[data-tab]') && !$('ask-text')) showTab();
  const text = $('ask-text');
  if (text) {
    text.value = draft;
    text.addEventListener('input', () => (draft = text.value));
    $('send').addEventListener('click', async () => {
      const res = kind === 'world' ? await act('public', { text: text.value }) : await act('ask', { kind, text: text.value });
      if (res) {
        draft = text.value = '';
      }
    });
    $('hint').addEventListener('click', () => act('hint'));
    showKind();
    showTab();
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
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hidden-el', s.id !== `t-${tab}`));
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
}

function showKind() {
  document.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
  const k = KINDS.find(([x]) => x === kind);
  if ($('ask-text')) $('ask-text').placeholder = k[2];
}

function finalBody() {
  const v = view;
  if (v.submission) {
    return `<div class="panel"><p><b>Your answer is in.</b></p><p class="muted small">Waiting for ${v.players.length - v.submitted.length} more. ${v.scoring ? 'The GM is checking the answers...' : ''}</p></div>`;
  }
  const people = [...v.cast.players.filter((c) => c.id !== v.me.id), ...v.cast.npcs, ...v.cast.players.filter((c) => c.id === v.me.id)];
  return `<div class="panel">
      <div class="label">Who did it? Pick one or more.</div>
      ${people.map((c) => `<label class="check"><input type="checkbox" data-c="${esc(c.id)}" ${picked.has(c.id) ? 'checked' : ''}><span><b>${esc(c.name)}</b> <span class="muted small">${esc(c.role)}${c.id === v.me.id ? ' (you)' : ''}</span></span></label>`).join('')}
    </div>
    <label class="field" style="margin-top:12px"><div class="label">How?</div><textarea id="how"></textarea></label>
    <label class="field"><div class="label">Why?</div><textarea id="why"></textarea></label>
    <label class="field"><div class="label">Did you get your goal?</div><textarea id="goal"></textarea></label>
    <button class="primary wide" id="submit">Send my answer</button>`;
}

function update() {
  const v = view;
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
  if ($('phase-label')) $('phase-label').textContent = v.phase ? `Round ${v.phase.index + 1} of ${v.phase.count}: ${v.phase.name}` : '';
  const card = $('card-body');
  if (card && card.dataset.sig !== JSON.stringify(v.card)) {
    card.dataset.sig = JSON.stringify(v.card);
    card.innerHTML = cardHtml();
  }
  if ($('brief')) $('brief').innerHTML = stepHtml(v, { me: v.me.id });
  if ($('qa')) $('qa').innerHTML = newsHtml(v.events.filter((e) => e.kind === 'qa')).replace('No news yet.', '');
  if ($('round')) {
    $('round').innerHTML = v.round ? roundHtml(v.round, { voting: true, myVote: v.myRoundVote }) : '<div class="label">This round</div><p class="muted small">Talk, look around and share clues.</p>';
    $('round').querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => act('roundvote', { choice: Number(b.dataset.choice) })));
  }
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
  if ($('shared')) $('shared').innerHTML = sharedCluesHtml(v.sharedClues);
  if ($('news')) $('news').innerHTML = newsHtml(v.events);
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
    const world = kind === 'world';
    $('send').disabled = world ? Boolean(v.publicPending) : blocked || Boolean(v.round?.vote);
    $('send').innerHTML = world ? (v.publicPending ? 'Waiting for the answer<span class="dots"></span>' : 'Ask everyone')
      : v.pending ? 'The GM is thinking<span class="dots"></span>' : v.round?.vote ? 'Voting now' : v.transitioning ? 'Things are changing<span class="dots"></span>' : v.questionsLeft < 1 ? 'No questions left this round' : 'Send';
    $('hint').disabled = v.hintsLeft < 1 || Boolean(v.hintVote);
    $('hint').textContent = v.hintsLeft < 1 ? 'No hints left' : `Ask the group for a hint (${v.hintsLeft} left)`;
  }
  if ($('targets') && v.cast) {
    const names = [...v.cast.npcs.map((n) => n.name), ...v.cast.locations.map((l) => l.name)];
    $('targets').innerHTML = names.map((n) => `<button class="chip" data-target="${esc(n)}">${esc(n)}</button>`).join('');
    $('targets').querySelectorAll('[data-target]').forEach((b) => b.addEventListener('click', () => {
      const t = $('ask-text');
      t.value = draft = `${t.value}${t.value && !t.value.endsWith(' ') ? ' ' : ''}${b.dataset.target}`;
      t.focus();
    }));
  }
  if ($('thread')) {
    const label = { you: 'You', gm: 'GM', whisper: 'Secret note', system: 'Problem' };
    const groups = [];
    for (const m of v.thread) {
      if (m.from === 'gm' && groups.at(-1)?.[0].from === 'you') groups.at(-1).push(m);
      else groups.push([m]);
    }
    if (v.pending) groups.push([{ from: 'you', kind: v.pending.kind, text: v.pending.text }, { from: 'gm', text: 'Thinking...' }]);
    $('thread').innerHTML = groups.reverse().flat().map((m) => `<div class="msg ${esc(m.from)}"><div class="label">${label[m.from]}${m.kind ? ` &middot; ${esc(KINDS.find(([k]) => k === m.kind)?.[1] ?? m.kind)}` : ''}</div>${esc(m.text)}</div>`).join('')
      || '<p class="small muted">Your private chat with the GM shows here.</p>';
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
    $('submit')?.addEventListener('click', () => act('submit', { culprit_ids: [...picked], how: $('how').value, why: $('why').value, goal: $('goal').value }));
  }
  tick();
}

function tick() {
  if ($('timer') && view?.phase?.endsAt) {
    const c = countdown(view.phase.endsAt);
    $('timer').textContent = c.text;
    $('timer').classList.toggle('low', c.low);
  }
}
tickers.add(tick);

let finalRendered = false;
function onView(v) {
  view = v;
  const key = `${v.gameId}:${statusSkeleton(v.status)}`;
  if (skeleton !== key) {
    skeleton = key;
    finalRendered = false;
    positionsBefore = null;
    app.innerHTML = skeletons[statusSkeleton(v.status)]();
    wire();
  }
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
  stream(`?token=${encodeURIComponent(token)}`, onView, () => {
    localStorage.removeItem('detective-token');
    token = null;
    history.replaceState(null, '', location.pathname);
    connect();
    toast('A new game started. Join again.');
  });
}

connect();
