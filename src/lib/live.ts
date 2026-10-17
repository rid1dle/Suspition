'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

export type LiveStatus = 'connecting' | 'open' | 'gone';

interface ESLike {
  onmessage: ((e: { data: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onopen: ((e: unknown) => void) | null;
  addEventListener(type: string, fn: (e: { data: string }) => void): void;
  close(): void;
}

interface LiveOptions {
  EventSourceImpl?: new (url: string) => ESLike;
  setTimer?: (fn: () => void, ms: number) => void;
}

export interface Live<T> {
  subscribe(fn: () => void): () => void;
  get(): T | null;
  status(): LiveStatus;
  gone(): string;
  close(): void;
}

// One stream per screen. Keeps the last view while it reconnects (1 s, 2 s, 4 s ... up to 10 s),
// and stops for good when the server says the seat is gone.
export function createLive<T>(url: string, { EventSourceImpl, setTimer = (fn, ms) => { setTimeout(fn, ms); } }: LiveOptions = {}): Live<T> {
  const Impl = EventSourceImpl ?? (globalThis as unknown as { EventSource: new (u: string) => ESLike }).EventSource;
  const listeners = new Set<() => void>();
  let view: T | null = null;
  let state: LiveStatus = 'connecting';
  let goneMessage = '';
  let tries = 0;
  let es: ESLike | null = null;
  let closed = false;
  const tell = () => listeners.forEach((fn) => fn());

  const open = () => {
    if (closed) return;
    es = new Impl(url);
    es.onopen = () => {
      tries = 0;
      state = 'open';
      tell();
    };
    es.onmessage = (e) => {
      tries = 0;
      state = 'open';
      view = JSON.parse(e.data) as T;
      tell();
    };
    es.addEventListener('gone', (e) => {
      closed = true;
      state = 'gone';
      try {
        goneMessage = String(JSON.parse(e.data)?.message ?? '');
      } catch {
        goneMessage = '';
      }
      es?.close();
      tell();
    });
    es.onerror = () => {
      if (closed) return;
      es?.close();
      state = 'connecting';
      tell();
      const wait = Math.min(10_000, 1000 * 2 ** tries);
      tries += 1;
      setTimer(open, wait);
    };
  };
  open();

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get: () => view,
    status: () => state,
    gone: () => goneMessage,
    close() {
      closed = true;
      es?.close();
    },
  };
}

const stores = new Map<string, Live<unknown>>();

export function useLive<T>(url: string | null): { view: T | null; status: LiveStatus; gone: string } {
  const live = url ? ((stores.get(url) ?? stores.set(url, createLive<T>(url)).get(url)) as Live<T>) : null;
  const subscribe = useCallback((fn: () => void) => (live ? live.subscribe(fn) : () => {}), [live]);
  const view = useSyncExternalStore(subscribe, () => live?.get() ?? null, () => null);
  const status = useSyncExternalStore(subscribe, () => live?.status() ?? 'connecting', () => 'connecting' as LiveStatus);
  return { view, status, gone: live?.gone() ?? '' };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const session = (): StorageLike | null => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

export function readDraft(key: string, storage: StorageLike | null = session()): string {
  try {
    return storage?.getItem(`draft:${key}`) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(key: string, text: string, storage: StorageLike | null = session()) {
  try {
    if (text) storage?.setItem(`draft:${key}`, text);
    else storage?.removeItem(`draft:${key}`);
  } catch {
    // private window or blocked storage: the draft just is not kept
  }
}

// A text box value that survives a reconnect or a reload of the page.
export function useDraft(key: string): [string, (text: string) => void] {
  const [text, setText] = useState(() => readDraft(key));
  const set = useCallback((value: string) => {
    setText(value);
    writeDraft(key, value);
  }, [key]);
  return [text, set];
}
