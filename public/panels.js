import { esc } from './text.js';
import { mapHtml } from './map.js';

export function novelHtml(lines) {
  return `<div class="novel">${lines.map((l, i) => {
    if (!l.speaker) return `<p class="act">${esc(l.text)}</p>`;
    const same = lines[i - 1]?.speaker === l.speaker;
    return `<p class="say">${same ? '' : `<span class="who-says">${esc(l.speaker)}</span>`}&ldquo;${esc(l.text)}&rdquo;</p>`;
  }).join('')}</div>`;
}

export function pictureHtml(svg, cls = 'scene') {
  if (!svg) return '';
  return `<img class="${cls}" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
}

export function backgroundHtml(lines) {
  if (!lines?.length) return '';
  return `<ul class="facts">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

export function timelineHtml(timeline) {
  if (!timeline?.length) return '<p class="small muted">Nothing yet.</p>';
  return `<ol class="timeline">${timeline.map((t) => `<li><span class="when">${esc(t.time || '?')}</span><span>${esc(t.event)}</span></li>`).join('')}</ol>`;
}

export function newsHtml(events, { fresh = 0 } = {}) {
  const items = (events ?? []).filter((e) => e.kind !== 'opening').slice().reverse();
  if (!items.length) return '<p class="small muted">No news yet.</p>';
  return `<ul class="feed">${items.map((e, i) => {
    const cls = `${esc(e.kind)}${i < fresh ? ' fresh' : ''}`;
    if (e.kind === 'qa') return `<li class="${cls}"><div class="small muted">${esc(e.by)} asked: ${esc(e.q)}</div>${esc(e.text)}</li>`;
    return `<li class="${cls}">${esc(e.text)}</li>`;
  }).join('')}</ul>`;
}

export function sharedCluesHtml(clues) {
  if (!clues?.length) return '<p class="small muted">No clues shared yet. Find one, then tap "Show everyone".</p>';
  return clues.map((c) => `<div class="clue"><b>${esc(c.name)}</b> <span class="small muted">from ${esc(c.by)}</span><div class="small">${esc(c.shows)}</div></div>`).join('');
}

export function roundHtml(round, { voting = false, myVote = null, countdown = '', tappable = false } = {}) {
  if (!round) return '';
  const vote = round.vote;
  const tips = !round.tips?.length ? ''
    : tappable ? `<div class="tips-tap"><span class="small muted">Try:</span> ${round.tips.map((t) => `<button class="chip tip" data-idea="${esc(t)}">${esc(t)}</button>`).join('')}</div>`
    : `<ul class="tips">${round.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const job = round.objective && !vote
    ? `<div class="label">This round, your job</div><div class="question">${esc(round.objective)}</div>${tips}`
    : '';
  if (!round.question) return `<div class="round">${job}</div>`;
  const head = vote ? `Vote now${countdown ? ` <span class="timer">${esc(countdown)}</span>` : ''}` : round.done ? 'Done' : job ? 'At the end, answer together' : "This round's goal";
  const options = round.options.map((o, i) => (voting && vote
    ? `<button class="option${myVote === i ? ' on' : ''}" data-choice="${i}">${esc(o)}</button>`
    : `<li>${esc(o)}</li>`)).join('');
  return `<div class="round${vote ? ' voting' : ''}">${job}
    <div class="label${job ? ' then' : ''}">${head}</div>
    <div class="${job ? 'ask' : 'question'}">${esc(round.question)}</div>
    ${voting && vote ? `<div class="options">${options}</div>` : `<ul class="choices">${options}</ul>`}
    ${vote ? `<div class="small muted">${vote.voted} of ${vote.of} voted</div>` : ''}
  </div>`;
}

export function alibiHtml(alibis, { me = null } = {}) {
  if (!alibis?.rows?.length) return '<p class="small muted">Nobody has said where they were yet.</p>';
  const head = alibis.times.map((t) => `<th><span class="when">${esc(t.time)}</span><span class="what">${esc(t.what)}</span></th>`).join('');
  const rows = alibis.rows.map((r) => `<tr class="${r.kind}${r.minor ? ' minor' : ''}${me && r.name === me ? ' me' : ''}"><th>${esc(r.name)}</th>${r.cells.map((c) => `<td>${c ? esc(c) : '<span class="muted">?</span>'}</td>`).join('')}</tr>`).join('');
  return `<div class="alibis"><table><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted">What each person says. Someone may be lying.</p>`;
}

export function nightHtml(card) {
  if (!card?.night?.length) return '';
  const told = (time) => card.alibi?.find((a) => a.time === time)?.where;
  return `<ol class="timeline night">${card.night.map((n) => {
    const said = told(n.time);
    const differs = said && said.toLowerCase() !== String(n.where).toLowerCase();
    return `<li><span class="when">${esc(n.time)}</span><span><b>${esc(n.where)}</b>. ${esc(n.doing)}${differs ? `<span class="small told"> You told people: ${esc(said)}.</span>` : ''}</span></li>`;
  }).join('')}</ol>`;
}

export function resultsHtml(results) {
  if (!results?.length) return '';
  return results.map((r) => `<div class="small"><b>Round ${r.phaseIndex + 1}:</b> ${esc(r.question)} ${r.correct ? '&#10003;' : '&#10007;'} ${esc(r.pickedText ?? 'no agreement')}</div>`).join('');
}

export function stepHtml(view, { me = null } = {}) {
  const b = view.briefing;
  const step = b?.steps?.[b.step];
  if (!step) return '';
  const dots = b.steps.map((_, i) => `<span class="dot${i === b.step ? ' on' : ''}${i < b.step ? ' done' : ''}"></span>`).join('');
  let body;
  if (step.kind === 'intro') {
    const mine = step.playerId === me;
    body = `<div class="intro${mine ? ' mine' : ''}">${step.icon ? `<div class="big-icon">${esc(step.icon)}</div>` : ''}
      ${mine ? '<div class="your-turn">Your turn! Stand up and say:</div>' : ''}
      <p class="opening">${esc(mine ? step.lines[0].replace(/^[^"]*"/, '"') : step.lines[0])}</p></div>`;
  } else if (step.kind === 'map') {
    body = `${step.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${mapHtml(view, { me })}`;
  } else if (step.kind === 'scene') {
    body = `${pictureHtml(view.illustration)}${step.lines.map((l) => `<p class="opening">${esc(l)}</p>`).join('')}`;
  } else if (step.kind === 'story') {
    body = step.lines.map((l) => (l.startsWith('The big question: ')
      ? caseHtml(l.slice('The big question: '.length))
      : `<p class="opening">${esc(l)}</p>`)).join('');
  } else if (step.kind === 'goal') {
    const [group, ...rest] = step.lines;
    const card = me && view.card;
    body = `${caseHtml(group, "The group's goal")}
      ${card ? `<div class="case mine"><div class="label">Your secret goal</div><div class="question">${esc(card.goal)}</div>${card.goal_why ? `<div class="small">${esc(card.goal_why)}</div>` : ''}<div class="small">${esc(card.win)}</div></div>` : ''}
      <ul class="facts">${rest.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  } else {
    body = `<ul class="facts">${step.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }
  return `<div class="brief-step"><div class="row between"><div class="label">Round 0: Meet everyone &middot; ${b.step + 1} of ${b.steps.length}</div><div class="dots-row">${dots}</div></div>
    <h2>${esc(step.title)}</h2>${body}</div>`;
}

export function caseHtml(question, label = 'The big question') {
  if (!question) return '';
  return `<div class="case"><div class="label">${esc(label)}</div><div class="question">${esc(question)}</div></div>`;
}

const KINDS = [['player', 'Players'], ['npc', 'Played by the GM'], ['minor', 'Minor, just part of the place']];

// Everything public about each person, one line each at rest, facts on tap.
export function peopleHtml(people, { openAll = false, open = new Set(), seen = {} } = {}) {
  if (!people?.length) return '';
  const kindOf = (p) => (p.minor ? 'minor' : p.kind);
  const row = (p) => {
    const n = p.facts.length;
    const fresh = !openAll && n > (seen[p.id] ?? 0);
    const alibi = p.alibi.length ? `<div class="says"><span class="muted">Says they were:</span> ${p.alibi.map((a) => `<span class="when">${esc(a.time)}</span> ${esc(a.where)}`).join(' &middot; ')}</div>` : '';
    const facts = n ? `<ul class="facts">${p.facts.map((f, i) => `<li${i < n - (seen[p.id] ?? 0) && !openAll ? ' class="new"' : ''}>${esc(f.fact)} <span class="muted small">round ${esc(f.round)}</span></li>`).join('')}</ul>` : '<p class="small muted">Nothing new about them yet.</p>';
    return `<details class="person-row${p.minor ? ' minor' : ''}" data-person="${esc(p.id)}"${openAll || open.has(p.id) ? ' open' : ''}>
      <summary>${p.icon ? `<span class="pic">${esc(p.icon)}</span>` : ''}<span class="who-name"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.role)}${p.player ? ` &middot; ${esc(p.player)}` : ''}</span></span>
        <span class="count${fresh ? ' new' : ''}">${n ? `${n} fact${n === 1 ? '' : 's'}` : ''}</span></summary>
      <div class="person-body"><p class="small">${esc(p.info)}</p>${facts}${alibi}</div>
    </details>`;
  };
  return KINDS.map(([kind, title]) => {
    const list = people.filter((p) => kindOf(p) === kind);
    return list.length ? `<div class="people-group"><div class="label">${title}</div>${list.map(row).join('')}</div>` : '';
  }).join('');
}

export function recapHtml(recap) {
  if (!recap?.lines?.length) return '';
  return `<div class="recap"><div class="label">Where we are now</div><ul class="facts">${recap.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    ${recap.open?.length ? `<div class="small muted" style="margin-top:6px">Still open</div><ul class="facts open">${recap.open.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div>`;
}

export function whoisLines(cast) {
  if (!cast) return [];
  return [
    ...cast.players.map((c) => `${c.player} plays ${c.name}, ${c.role}. ${c.info}`),
    ...cast.npcs.filter((n) => !n.minor).map((n) => `${n.name}, ${n.role}, is played by the GM. ${n.info}`),
  ];
}

export function pointsOf(s) {
  return (s?.culprit_correct ? 1 : 0) + (s?.method_score ?? 0) + (s?.motive_score ?? 0) + (s?.goal_achieved ? 1 : 0);
}
