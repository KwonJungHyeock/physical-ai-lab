/**
 * The offline event queue: a student's events are kept on the PC (localStorage, or any store passed in)
 * and sent to the class server in batches. When the server or the network is down they wait, and the
 * queue retries with exponential backoff (with jitter, so 30 PCs do not all retry at the same moment).
 *
 *  - One queue per student (queueKeyFor): on a shared PC, one student's waiting events are never sent
 *    under the next student's login — the server takes the actor from the login.
 *  - Every operation re-reads the store, so two tabs of the same student do not lose each other's events;
 *    a resend after a lost reply is harmless (the server drops statement ids it has seen).
 *  - Bounded: at most maxItems wait (the oldest are dropped and counted).
 *  - A refused login (401) stops sending until resume() — the screen asks the student to log in again.
 *
 * No React, no DOM: the store, clock, timers and the send function are injected.
 */

import { statementProblem, type Statement } from './events';

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** localStorage when it can be used (private windows and blocked storage give null). */
export function browserStore(): KVStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = '__account_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

/** A store in memory (tests; or when localStorage is unavailable: events then live until the tab closes). */
export function memoryStore(init: Record<string, string> = {}): KVStore & { data: Record<string, string> } {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** What a send did. rejected: ids the server refused for good (they are dropped, not retried). */
export type SendResult = { ok: true; rejected?: string[] } | { ok: false; retry: boolean; auth?: boolean; error: string };

export interface QueueOptions {
  key: string;
  send: (batch: Statement[]) => Promise<SendResult>;
  /** null/undefined: memory only. */
  store?: KVStore | null;
  batchSize?: number;
  maxItems?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
  random?: () => number;
}

export interface QueueState {
  pending: number;
  /** Events dropped: too many waiting, or refused by the server. */
  dropped: number;
  /** Failed sends in a row. */
  failures: number;
  /** No send before this (ms since 1970; 0 = any time). */
  nextAttemptAt: number;
  lastError: string | null;
  /** The server refused the login: log in again, then resume(). */
  authNeeded: boolean;
}

export interface FlushReport {
  sent: number;
  dropped: number;
  error: string | null;
}

interface Saved {
  v: 1;
  items: Statement[];
  dropped: number;
  failures: number;
  nextAttemptAt: number;
  lastError: string | null;
  authNeeded: boolean;
}

export const QUEUE_DEFAULTS = { batchSize: 50, maxItems: 5000, baseDelayMs: 2000, maxDelayMs: 5 * 60_000 } as const;

/** The queue's storage key for a logged-in student. */
export function queueKeyFor(student: { classId: string; no: number }): string {
  return `account-queue:${student.classId}:${student.no}`;
}

const empty = (): Saved => ({ v: 1, items: [], dropped: 0, failures: 0, nextAttemptAt: 0, lastError: null, authNeeded: false });

export class EventQueue {
  private readonly o: Required<Omit<QueueOptions, 'store'>> & { store: KVStore | null };
  private mem: Saved = empty();
  private inflight: Promise<FlushReport> | null = null;

  constructor(opts: QueueOptions) {
    this.o = {
      ...QUEUE_DEFAULTS,
      now: Date.now,
      random: Math.random,
      ...opts,
      store: opts.store ?? null,
    };
  }

  private load(): Saved {
    const s = this.o.store;
    if (!s) return this.mem;
    try {
      const v = JSON.parse(s.getItem(this.o.key) ?? 'null') as Partial<Saved> | null;
      if (!v || v.v !== 1 || !Array.isArray(v.items)) return empty();
      return {
        v: 1,
        items: v.items.filter((x) => x && typeof x === 'object' && typeof x.id === 'string'),
        dropped: Number(v.dropped) || 0,
        failures: Number(v.failures) || 0,
        nextAttemptAt: Number(v.nextAttemptAt) || 0,
        lastError: typeof v.lastError === 'string' ? v.lastError : null,
        authNeeded: v.authNeeded === true,
      };
    } catch {
      return empty();
    }
  }

  private save(v: Saved): void {
    this.mem = v;
    const s = this.o.store;
    if (!s) return;
    try {
      s.setItem(this.o.key, JSON.stringify(v));
    } catch {
      // Storage full: drop the older half and try once more, so new events still fit.
      v.dropped += Math.ceil(v.items.length / 2);
      v.items = v.items.slice(Math.ceil(v.items.length / 2));
      try {
        s.setItem(this.o.key, JSON.stringify(v));
      } catch {
        /* the in-memory copy still holds them */
      }
    }
  }

  /** Queue an event; false when it is malformed (the server would refuse it). */
  push(st: Statement): boolean {
    if (statementProblem(st)) return false;
    const v = this.load();
    if (v.items.some((x) => x.id === st.id)) return true;
    v.items.push(st);
    if (v.items.length > this.o.maxItems) {
      const over = v.items.length - this.o.maxItems;
      v.items.splice(0, over);
      v.dropped += over;
    }
    this.save(v);
    return true;
  }

  state(): QueueState {
    const { items, dropped, failures, nextAttemptAt, lastError, authNeeded } = this.load();
    return { pending: items.length, dropped, failures, nextAttemptAt, lastError, authNeeded };
  }

  pending(): number {
    return this.load().items.length;
  }

  /** Is a send worth trying now? */
  due(now = this.o.now()): boolean {
    const v = this.load();
    return v.items.length > 0 && !v.authNeeded && now >= v.nextAttemptAt;
  }

  /** After a new login (or the network came back): clear the wait and the login stop. */
  resume(): void {
    const v = this.load();
    v.authNeeded = false;
    v.failures = 0;
    v.nextAttemptAt = 0;
    this.save(v);
  }

  /** The delay after `failures` failed sends in a row. */
  backoff(failures: number): number {
    const exp = Math.min(this.o.maxDelayMs, this.o.baseDelayMs * 2 ** Math.max(0, failures - 1));
    return Math.round(exp * (0.5 + 0.5 * this.o.random()));
  }

  /** Send everything waiting (batch by batch) until done or a send fails. One flush at a time. */
  flush(): Promise<FlushReport> {
    if (!this.inflight) {
      this.inflight = this.run().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async run(): Promise<FlushReport> {
    const report: FlushReport = { sent: 0, dropped: 0, error: null };
    for (let guard = 0; guard < 1000; guard++) {
      const v = this.load();
      if (v.items.length === 0 || v.authNeeded) break;
      const batch = v.items.slice(0, this.o.batchSize);
      let res: SendResult;
      try {
        res = await this.o.send(batch);
      } catch (e) {
        res = { ok: false, retry: true, error: e instanceof Error ? e.message : String(e) };
      }
      const after = this.load(); // another tab may have changed it meanwhile
      const ids = new Set(batch.map((s) => s.id));
      if (res.ok) {
        const refused = new Set(res.rejected ?? []);
        after.items = after.items.filter((s) => !ids.has(s.id));
        after.dropped += refused.size;
        report.sent += batch.length - refused.size;
        report.dropped += refused.size;
        after.failures = 0;
        after.nextAttemptAt = 0;
        after.lastError = null;
        this.save(after);
        continue;
      }
      report.error = res.error;
      after.lastError = res.error;
      if (res.auth) {
        after.authNeeded = true;
      } else if (res.retry) {
        after.failures += 1;
        after.nextAttemptAt = this.o.now() + this.backoff(after.failures);
      } else {
        // A batch the server will never take (malformed): drop it rather than block the rest.
        after.items = after.items.filter((s) => !ids.has(s.id));
        after.dropped += batch.length;
        report.dropped += batch.length;
        this.save(after);
        continue;
      }
      this.save(after);
      break;
    }
    return report;
  }

  /** Forget everything waiting (the student's data is being deleted). */
  clear(): void {
    this.save(empty());
    this.o.store?.removeItem?.(this.o.key);
  }
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

/**
 * Keep flushing in the background: every intervalMs (default 3 s, so the teacher's grid is live) when
 * something is waiting and the backoff allows it. Returns a stop function. The screen may also call
 * queue.flush() right away (after an important event, or on the browser's 'online' event).
 */
export function autoFlush(queue: EventQueue, opts: { intervalMs?: number; timers?: Timers; now?: () => number } = {}): () => void {
  const timers: Timers = opts.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
  };
  const now = opts.now ?? Date.now;
  const every = opts.intervalMs ?? 3000;
  let stopped = false;
  let handle: unknown = null;
  const tick = async () => {
    if (stopped) return;
    if (queue.due(now())) await queue.flush();
    if (!stopped) handle = timers.setTimeout(tick, every);
  };
  handle = timers.setTimeout(tick, every);
  return () => {
    stopped = true;
    if (handle !== null) timers.clearTimeout(handle);
  };
}
