/**
 * The class server's API (desktop-go/classroom/server.go), over fetch.
 *
 * Where the server is:
 *  - the app was opened from the class server itself (http://<교사 PC>:47290/console?from=class):
 *    the page's own origin;
 *  - the simulator program on a student's PC (http://127.0.0.1:47280) or any other copy of the app:
 *    the teacher PC's LAN address, typed once (normalizeServerAddress) or read from a join link / QR
 *    (?server=192.168.0.10:47290&class=K7M4QX) and remembered.
 * resolveServer() tries them in that order.
 *
 * Authentication is a bearer token from a login (no cookies). Errors are ClassApiError with the HTTP
 * status, the server's code ('wrong', 'locked', 'login', 'role', 'bad_input', …) and its Korean message.
 * No React, no DOM.
 */

import type { ClassInfo, IssuedStudent, Role, Session, StudentClass, StudentId, UserInfo, XapiAgent } from './types';
import type { Statement, StoredStatement } from './events';
import type { SendResult } from './queue';

export const CLASS_PORT = 47290;
export const API_PREFIX = '/class-api/v1';
export const SERVER_KIND = 'robocity-class-server';
/** Where the client remembers the teacher PC's address. */
export const SERVER_ADDRESS_KEY = 'class-server-address';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class ClassApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Seconds to wait (status 429). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ClassApiError';
  }
  /** The network or the server is down (worth retrying later). */
  get offline(): boolean {
    return this.status === 0;
  }
}

/**
 * The teacher PC's address as typed: "192.168.0.10", "192.168.0.10:47290", "http://teacher.local:47290/".
 * Returns "http://host:port" (port 47290 when none), or null when it is not an address.
 */
export function normalizeServerAddress(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
  if (!u.hostname) return null;
  // A port typed out (even the default one, which URL drops) is kept; none on http → the class server's.
  const typedPort = /^[a-z][a-z0-9+.-]*:\/\/(?:\[[^\]]+\]|[^/:]+):\d+/i.test(s);
  const port = u.port || (!typedPort && u.protocol === 'http:' ? String(CLASS_PORT) : '');
  return `${u.protocol}//${u.hostname}${port ? ':' + port : ''}`;
}

/** Read a join link's parameters (?server=…&class=…), e.g. from a QR code on the teacher's screen. */
export function joinParams(search: string): { server: string | null; classCode: string | null } {
  const q = new URLSearchParams(search);
  const server = q.get('server');
  const code = q.get('class');
  return {
    server: server ? normalizeServerAddress(server) : null,
    classCode: code && /^[A-Za-z0-9]{4,10}$/.test(code) ? code.toUpperCase() : null,
  };
}

/** The address students open (and the QR shows): the class server's own page with the class code. */
export function joinLink(baseUrl: string, classCode: string, path = '/console'): string {
  return `${baseUrl}${path}?from=class&class=${encodeURIComponent(classCode)}`;
}

/** Is a class server answering at baseUrl? */
export async function probeServer(baseUrl: string, fetchFn: Fetch = globalThis.fetch.bind(globalThis), timeoutMs = 2500): Promise<boolean> {
  const ctl = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(baseUrl + API_PREFIX + '/status', { signal: ctl?.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const j = (await res.json()) as { kind?: string };
    return j.kind === SERVER_KIND;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Where the class server is: the page's own origin when served by it, else a remembered address. */
export async function resolveServer(opts: { pageOrigin?: string | null; saved?: string | null; fetch?: Fetch }): Promise<string | null> {
  const tries = [opts.pageOrigin ?? null, opts.saved ? normalizeServerAddress(opts.saved) : null].filter((x): x is string => !!x);
  for (const base of [...new Set(tries)]) {
    if (await probeServer(base, opts.fetch)) return base;
  }
  return null;
}

/* --- responses ----------------------------------------------------------------------------------- */

export interface ServerStatus {
  kind: string;
  version: number;
  needsSetup: boolean;
  /** This browser is on the server PC itself (first-run setup is only allowed there). */
  setupHere: boolean;
  server: string;
  time: number;
  /** The addresses students open (http://<LAN IP>:47290), when the server knows them (older servers: absent). */
  addresses?: string[];
}

export interface PurposeList {
  verbs: { id: string; key: string; ko: string; purpose: string; cloud: boolean }[];
  stored: string;
  retention: string;
  cloud: string;
}

export interface IngestResult {
  accepted: number;
  duplicate: number;
  rejected: { i: number; id?: string; reason: string }[];
}

export interface LiveRowServer {
  no: number;
  lastSeen: number;
  lastActivity: number;
  place: { object: string; verb: string; at: number } | null;
  flags: ('never' | 'offline' | 'idle' | 'stuck' | 'locked')[];
  stuckOn: { object: string; fails: number }[];
  completed: number;
}

export interface SyncView {
  config: { enabled: boolean; url: string; intervalSec: number; apiKey: string };
  status: { lastOkAt: number; lastError?: string; lastErrorAt?: number; sent: number; pendingEvents: number; pendingDeletes: number };
}

interface LoginUser {
  token: string;
  expiresAt: number;
  role: 'teacher' | 'operator';
  user: UserInfo;
}

interface LoginStudent {
  token: string;
  expiresAt: number;
  role: 'student';
  student: StudentId & { actor: XapiAgent };
  class: StudentClass;
}

/* --- the client ---------------------------------------------------------------------------------- */

export class ClassServerClient {
  private token: string | null;
  private readonly fetchFn: Fetch;

  constructor(
    readonly baseUrl: string,
    opts: { token?: string | null; fetch?: Fetch } = {},
  ) {
    this.token = opts.token ?? null;
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** A client for a saved session. */
  static forSession(s: Session, fetchFn?: Fetch): ClassServerClient {
    return new ClassServerClient(s.baseUrl, { token: s.token, fetch: fetchFn });
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private async call<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + API_PREFIX + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (e) {
      throw new ClassApiError(0, 'offline', '학급 서버에 연결할 수 없어요. 선생님 PC 와 같은 네트워크인지 확인해 주세요.' + (e instanceof Error ? ` (${e.message})` : ''));
    }
    if (!res.ok) {
      let j: { error?: string; message?: string; retryAfter?: number } = {};
      try {
        j = await res.json();
      } catch {
        /* not JSON */
      }
      const retry = j.retryAfter ?? (Number(res.headers.get('Retry-After')) || undefined);
      throw new ClassApiError(res.status, j.error ?? 'http', j.message ?? `학급 서버 응답 ${res.status}`, retry);
    }
    return (raw ? await res.text() : await res.json()) as T;
  }

  /* public */
  status(): Promise<ServerStatus> {
    return this.call('GET', '/status');
  }
  purposes(): Promise<PurposeList> {
    return this.call('GET', '/purposes');
  }

  /** First run, on the server PC only: create the operator account (and log in). */
  async setup(username: string, password: string): Promise<Session> {
    return this.userSession(await this.call<LoginUser>('POST', '/setup', { username, password }));
  }

  async loginTeacher(username: string, password: string): Promise<Session> {
    return this.userSession(await this.call<LoginUser>('POST', '/login/teacher', { username, password }));
  }

  /** 학급 코드 + 번호 + PIN. Wrong: ClassApiError 'wrong' (401); too many tries: 'locked' (429, retryAfter). */
  async loginStudent(classCode: string, no: number, pin: string): Promise<Session> {
    const r = await this.call<LoginStudent>('POST', '/login/student', { classCode: classCode.trim().toUpperCase(), no, pin });
    this.token = r.token;
    return { role: 'student', token: r.token, expiresAt: r.expiresAt, baseUrl: this.baseUrl, student: r.student, class: r.class };
  }

  private userSession(r: LoginUser): Session {
    this.token = r.token;
    return { role: r.role, token: r.token, expiresAt: r.expiresAt, baseUrl: this.baseUrl, user: r.user };
  }

  async logout(): Promise<void> {
    try {
      await this.call('POST', '/logout');
    } finally {
      this.token = null;
    }
  }

  /** Who am I (also a heartbeat: the teacher's grid shows the student online). */
  me(): Promise<{ role: Role; expiresAt: number; user?: UserInfo; student?: StudentId & { actor: XapiAgent }; class?: StudentClass }> {
    return this.call('GET', '/me');
  }

  /* student */
  myClass(): Promise<StudentClass> {
    return this.call('GET', '/class');
  }
  postEvents(statements: Statement[]): Promise<IngestResult> {
    return this.call('POST', '/events', { statements });
  }

  /** The queue's send function: maps answers to keep / retry / log in again. */
  sender(): (batch: Statement[]) => Promise<SendResult> {
    return async (batch) => {
      try {
        const r = await this.postEvents(batch);
        return { ok: true, rejected: (r.rejected ?? []).map((x) => x.id ?? batch[x.i]?.id).filter((x): x is string => !!x) };
      } catch (e) {
        if (!(e instanceof ClassApiError)) return { ok: false, retry: true, error: String(e) };
        if (e.status === 401) return { ok: false, retry: false, auth: true, error: e.message };
        if (e.status === 0 || e.status === 429 || e.status >= 500) return { ok: false, retry: true, error: e.message };
        if (e.status === 409) return { ok: false, retry: false, auth: true, error: e.message }; // class archived
        return { ok: false, retry: false, error: e.message };
      }
    };
  }

  /* operator */
  users(): Promise<{ users: UserInfo[] }> {
    return this.call('GET', '/teachers');
  }
  createTeacher(username: string, password: string, role: 'teacher' | 'operator' = 'teacher'): Promise<UserInfo> {
    return this.call('POST', '/teachers', { username, password, role });
  }
  updateTeacher(id: string, change: { password?: string; disabled?: boolean }): Promise<UserInfo> {
    return this.call('POST', `/teachers/${encodeURIComponent(id)}`, change);
  }
  sync(): Promise<SyncView> {
    return this.call('GET', '/sync');
  }
  /** apiKey omitted: keep the saved one. */
  setSync(cfg: { enabled: boolean; url: string; apiKey?: string; intervalSec?: number }): Promise<SyncView> {
    return this.call('PUT', '/sync', cfg);
  }
  syncNow(): Promise<SyncView> {
    return this.call('POST', '/sync/now');
  }

  /* teacher (own classes; operator all) */
  classes(): Promise<{ classes: ClassInfo[] }> {
    return this.call('GET', '/classes');
  }
  /** name: a label like "2학년 3반" — no student or teacher names. */
  createClass(name: string): Promise<ClassInfo> {
    return this.call('POST', '/classes', { name });
  }
  classInfo(id: string): Promise<ClassInfo> {
    return this.call('GET', `/classes/${encodeURIComponent(id)}`);
  }
  /** New students numbered from `from` (default: after the highest). The PINs are shown only now. */
  issueStudents(id: string, count: number, from?: number): Promise<{ issued: IssuedStudent[] }> {
    return this.call('POST', `/classes/${encodeURIComponent(id)}/students`, { count, from: from ?? 0 });
  }
  /** A new PIN for a student who forgot it (also unlocks after too many wrong tries). */
  resetPin(id: string, no: number): Promise<IssuedStudent> {
    return this.call('POST', `/classes/${encodeURIComponent(id)}/students/${no}/pin`);
  }
  /** Remove a student with all the student's records (here and, when sync is on, in the cloud). */
  removeStudent(id: string, no: number): Promise<{ ok: true }> {
    return this.call('DELETE', `/classes/${encodeURIComponent(id)}/students/${no}`);
  }
  /** Lessons students may open; ['*'] = all, [] = none. */
  setOpenLessons(id: string, open: string[]): Promise<ClassInfo> {
    return this.call('PUT', `/classes/${encodeURIComponent(id)}/lessons`, { open });
  }
  setArchived(id: string, archived: boolean): Promise<ClassInfo> {
    return this.call('POST', `/classes/${encodeURIComponent(id)}/archive`, { archived });
  }
  /** Year-end: delete an archived class; confirm = the class code typed back. */
  deleteClass(id: string, confirm: string): Promise<{ ok: true }> {
    return this.call('DELETE', `/classes/${encodeURIComponent(id)}?confirm=${encodeURIComponent(confirm)}`);
  }
  /** Log every student of the class out (end of a lesson on shared PCs). */
  logoutAll(id: string): Promise<{ ended: number }> {
    return this.call('POST', `/classes/${encodeURIComponent(id)}/logout-all`);
  }
  /** The class's events after sequence number `after` (poll with the last `last`). */
  events(id: string, after = 0, limit?: number): Promise<{ statements: StoredStatement[]; last: number }> {
    return this.call('GET', `/classes/${encodeURIComponent(id)}/events?after=${after}${limit ? `&limit=${limit}` : ''}`);
  }
  /** The server's live grid (same rules as live.ts). */
  live(id: string, opts: { stuck?: number; idleMinutes?: number } = {}): Promise<{ now: number; students: LiveRowServer[] }> {
    const q = new URLSearchParams();
    if (opts.stuck) q.set('stuck', String(opts.stuck));
    if (opts.idleMinutes) q.set('idle', String(opts.idleMinutes));
    const qs = q.toString();
    return this.call('GET', `/classes/${encodeURIComponent(id)}/live${qs ? '?' + qs : ''}`);
  }
  /**
   * The class's records as a file's text (CSV for Excel, or JSON). Reading a response as text drops the
   * UTF-8 BOM, which Excel needs to read Korean: it is put back on the CSV.
   */
  async exportClass(id: string, format: 'csv' | 'json'): Promise<string> {
    const text = await this.call<string>('GET', `/classes/${encodeURIComponent(id)}/export?format=${format}`, undefined, true);
    return format === 'csv' && !text.startsWith('\uFEFF') ? '\uFEFF' + text : text;
  }
}
