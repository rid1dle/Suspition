export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function api(path, body = {}) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function stream(query, onView, onGone) {
  let source;
  let closed = false;
  const open = () => {
    if (closed) return;
    source = new EventSource(`/api/stream${query}`);
    source.onmessage = (e) => onView(JSON.parse(e.data));
    source.addEventListener('gone', (e) => {
      source.close();
      onGone?.(JSON.parse(e.data));
    });
    source.onerror = () => {
      source.close();
      setTimeout(open, 1500);
    };
  };
  open();
  return () => {
    closed = true;
    source?.close();
  };
}

export function countdown(endsAt, now = Date.now()) {
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, low: left <= 60 };
}

export function suspicionLabel(n) {
  if (n >= 75) return 'The culprit is cornered';
  if (n >= 50) return 'The culprit feels watched';
  if (n >= 25) return 'Uneasy';
  return 'Calm';
}

export function hashParam(name) {
  return new URLSearchParams(location.hash.slice(1)).get(name);
}

export function toast(message) {
  const el = document.createElement('div');
  el.className = 'banner error';
  el.style.cssText = 'position:fixed;left:16px;right:16px;top:12px;z-index:20;max-width:520px;margin:0 auto';
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

export const tickers = new Set();
setInterval(() => tickers.forEach((fn) => fn()), 1000);
