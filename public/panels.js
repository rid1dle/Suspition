import { esc } from './text.js';
import { mapHtml } from './map.js';

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

export function roundHtml(round, { voting = false, myVote = null, countdown = '' } = {}) {
  if (!round) return '';
  const vote = round.vote;
  const head = vote ? `Vote now${countdown ? ` <span class="timer">${esc(countdown)}</span>` : ''}` : round.done ? 'Done' : "This round's goal";
  const options = round.options.map((o, i) => (voting && vote
    ? `<button class="option${myVote === i ? ' on' : ''}" data-choice="${i}">${esc(o)}</button>`
    : `<li>${esc(o)}</li>`)).join('');
  return `<div class="round${vote ? ' voting' : ''}">
    <div class="label">${head}</div>
    <div class="question">${esc(round.question)}</div>
    ${voting && vote ? `<div class="options">${options}</div>` : `<ul class="choices">${options}</ul>`}
    ${vote ? `<div class="small muted">${vote.voted} of ${vote.of} voted</div>` : ''}
  </div>`;
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
    body = step.lines.map((l) => `<p class="opening">${esc(l)}</p>`).join('');
  } else {
    body = `<ul class="facts">${step.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }
  return `<div class="brief-step"><div class="row between"><div class="label">Round 0: Meet everyone &middot; ${b.step + 1} of ${b.steps.length}</div><div class="dots-row">${dots}</div></div>
    <h2>${esc(step.title)}</h2>${body}</div>`;
}
