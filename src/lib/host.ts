'use client';

// The table screen keeps its host token in the page address (#host=...).
export function hostToken(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.hash.slice(1)).get('host') ?? '';
}

export async function hostApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const host = hostToken();
  const res = body
    ? await fetch(`/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host, ...body }) })
    : await fetch(`/api/${path}${path.includes('?') ? '&' : '?'}host=${encodeURIComponent(host)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}
