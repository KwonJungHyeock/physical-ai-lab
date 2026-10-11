/**
 * The teacher's live status grid, from the class's events: per student where they are now (lesson ·
 * site · step), when they last did something, whether the PC is still heard from, and flags —
 * "stuck" (the same problem failed ≥ N times since its last pass), "idle" (online but nothing for M
 * minutes), "offline", "never" (not logged in yet). Also a student × lesson cell status for the grid.
 *
 * The dashboard polls the class server's event feed (client.events(id, after)) and feeds the new
 * statements to applyStatements; liveRows turns the state into rows. The class server's /live endpoint
 * applies the same rules (desktop-go/classroom/live.go) for a quick look without the feed.
 *
 * Times are ms since 1970; an event's time is when the server received it (`stored`) — student PCs'
 * clocks are often wrong — or its timestamp when it has none. Pure functions, no React, no DOM.
 */

import { EXT_NO, parsePlace, verbKeyOf, type Place, type Statement, type VerbKey } from './events';

export interface LiveOptions {
  /** Same object failed this many times since its last pass → stuck. */
  stuckFails: number;
  /** Online but no event for this long → idle. */
  idleMinutes: number;
  /** Not heard from (no event, no heartbeat) for this long → offline. */
  offlineMinutes: number;
}

export const LIVE_DEFAULTS: Readonly<LiveOptions> = { stuckFails: 3, idleMinutes: 5, offlineMinutes: 2 };

export type LiveFlag = 'never' | 'offline' | 'idle' | 'stuck' | 'locked';

interface Track {
  lastActivity: number;
  lastSeen: number;
  place: { object: string; verb: VerbKey; at: number } | null;
  failsSincePass: Map<string, number>;
  hints: Map<string, number>;
  started: Set<string>;
  completed: Set<string>;
  passed: Set<string>;
  /** The latest answer per object (teacher only; may be a typed sentence). */
  answers: Map<string, string>;
}

export interface LiveState {
  students: Map<number, Track>;
  /** The highest sequence number applied (poll the feed with after = lastSeq). */
  lastSeq: number;
  /** Ids applied (a statement seen twice is applied once). */
  seen: Set<string>;
}

export function createLiveState(): LiveState {
  return { students: new Map(), lastSeq: 0, seen: new Set() };
}

function track(state: LiveState, no: number): Track {
  let t = state.students.get(no);
  if (!t) {
    t = {
      lastActivity: 0,
      lastSeen: 0,
      place: null,
      failsSincePass: new Map(),
      hints: new Map(),
      started: new Set(),
      completed: new Set(),
      passed: new Set(),
      answers: new Map(),
    };
    state.students.set(no, t);
  }
  return t;
}

/** The 번호 of a stored statement (the server writes it into the context; else the actor "<code>-<no>"). */
export function studentNoOf(s: Statement): number | null {
  const v = s.context?.extensions?.[EXT_NO];
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  const m = /-(\d{1,3})$/.exec(s.actor?.account?.name ?? '');
  return m ? Number(m[1]) : null;
}

/** When an event happened, as far as the grid is concerned. */
export function eventTime(s: Statement): number {
  const t = Date.parse(s.stored ?? s.timestamp);
  return Number.isFinite(t) ? t : 0;
}

/** Apply statements (in any order; repeats ignored). Mutates and returns state. */
export function applyStatements(state: LiveState, statements: readonly Statement[]): LiveState {
  for (const s of statements) {
    if (!s || state.seen.has(s.id)) continue;
    const verb = verbKeyOf(s.verb?.id);
    const no = studentNoOf(s);
    if (!verb || no === null || typeof s.object?.id !== 'string') continue;
    state.seen.add(s.id);
    if (typeof s.seq === 'number' && s.seq > state.lastSeq) state.lastSeq = s.seq;
    const t = track(state, no);
    const at = eventTime(s);
    const obj = s.object.id;
    if (at > t.lastActivity) t.lastActivity = at;
    if (!t.place || at >= t.place.at) t.place = { object: obj, verb, at };
    switch (verb) {
      case 'failed':
        t.failsSincePass.set(obj, (t.failsSincePass.get(obj) ?? 0) + 1);
        break;
      case 'passed':
        t.failsSincePass.delete(obj);
        t.passed.add(obj);
        break;
      case 'completed':
        t.completed.add(obj);
        break;
      case 'attempted':
      case 'experienced':
        t.started.add(obj);
        break;
      case 'hinted':
        t.hints.set(obj, (t.hints.get(obj) ?? 0) + 1);
        break;
      case 'answered':
        if (typeof s.result?.response === 'string') t.answers.set(obj, s.result.response);
        break;
    }
  }
  return state;
}

/** The PC was heard from (a heartbeat, or the server's /live lastSeen). */
export function markSeen(state: LiveState, no: number, at: number): void {
  const t = track(state, no);
  if (at > t.lastSeen) t.lastSeen = at;
}

export interface LiveRow {
  no: number;
  /** The object of the latest event, parsed. */
  place: Place | null;
  placeVerb: VerbKey | null;
  lastActivity: number | null;
  lastSeen: number | null;
  flags: LiveFlag[];
  /** Objects failed ≥ stuckFails times since their last pass, most failures first. */
  stuckOn: { object: string; place: Place; fails: number }[];
  /** Hints opened on the current object. */
  hintsHere: number;
  completed: number;
  passed: number;
}

/** One row per 번호 (in the given order), with the flags. locked: 번호 whose PIN is locked out. */
export function liveRows(state: LiveState, nos: readonly number[], now: number, opts: Partial<LiveOptions> = {}, locked: readonly number[] = []): LiveRow[] {
  const o = { ...LIVE_DEFAULTS, ...opts };
  return nos.map((no) => {
    const t = state.students.get(no);
    const heard = Math.max(t?.lastSeen ?? 0, t?.lastActivity ?? 0);
    const flags: LiveFlag[] = [];
    if (heard === 0) flags.push('never');
    else if (now - heard >= o.offlineMinutes * 60_000) flags.push('offline');
    else if (!t?.lastActivity || now - t.lastActivity >= o.idleMinutes * 60_000) flags.push('idle');
    const stuckOn = t
      ? [...t.failsSincePass]
          .filter(([, n]) => n >= o.stuckFails)
          .map(([object, fails]) => ({ object, place: parsePlace(object), fails }))
          .sort((a, b) => b.fails - a.fails || a.object.localeCompare(b.object))
      : [];
    if (stuckOn.length) flags.push('stuck');
    if (locked.includes(no)) flags.push('locked');
    return {
      no,
      place: t?.place ? parsePlace(t.place.object) : null,
      placeVerb: t?.place?.verb ?? null,
      lastActivity: t?.lastActivity || null,
      lastSeen: t?.lastSeen || null,
      flags,
      stuckOn,
      hintsHere: t?.place ? (t.hints.get(t.place.object) ?? 0) : 0,
      completed: t?.completed.size ?? 0,
      passed: t?.passed.size ?? 0,
    };
  });
}

/** From scratch: statements → rows. */
export function buildLiveGrid(statements: readonly Statement[], nos: readonly number[], now: number, opts?: Partial<LiveOptions>): LiveRow[] {
  return liveRows(applyStatements(createLiveState(), statements), nos, now, opts);
}

export type CellStatus = 'none' | 'started' | 'done' | 'stuck';

/**
 * One cell of the student × lesson grid: the student's status on an object and everything under it
 * (lessonObject('1-2') covers its pages; siteObject('farm', 1) its steps). done: the object itself was
 * completed or passed; stuck: something under it is stuck; started: any event under it.
 */
export function cellStatus(state: LiveState, no: number, object: string, opts: Partial<LiveOptions> = {}): CellStatus {
  const t = state.students.get(no);
  if (!t) return 'none';
  const o = { ...LIVE_DEFAULTS, ...opts };
  const under = (id: string) => id === object || id.startsWith(object + ':');
  if (t.completed.has(object) || t.passed.has(object)) return 'done';
  for (const [id, n] of t.failsSincePass) if (n >= o.stuckFails && under(id)) return 'stuck';
  for (const set of [t.started, t.completed, t.passed]) for (const id of set) if (under(id)) return 'started';
  for (const id of t.failsSincePass.keys()) if (under(id)) return 'started';
  return 'none';
}

/** The student's latest answer on an object (for the teacher; never shown to other students). */
export function latestAnswer(state: LiveState, no: number, object: string): string | null {
  return state.students.get(no)?.answers.get(object) ?? null;
}

/** How many students carry each flag (the header of the dashboard). */
export function flagCounts(rows: readonly LiveRow[]): Record<LiveFlag | 'active', number> {
  const c = { never: 0, offline: 0, idle: 0, stuck: 0, locked: 0, active: 0 };
  for (const r of rows) {
    for (const f of r.flags) c[f]++;
    if (!r.flags.some((f) => f === 'never' || f === 'offline' || f === 'idle')) c.active++;
  }
  return c;
}

const PAGE_KO: Record<string, string> = { intro: '도입', concept: '개념', act1: '활동 1', act2: '활동 2', act3: '활동 3', summary: '정리', quiz: '평가' };

/** A short Korean label for a place. names: display names for labs (park.ts THEMES) and lessons. */
export function placeLabel(place: Place | null, names: { lab?: Record<string, string>; lesson?: Record<string, string> } = {}): string {
  if (!place) return '—';
  switch (place.kind) {
    case 'lesson': {
      const l = names.lesson?.[place.lesson] ?? `차시 ${place.lesson}`;
      return place.page === undefined ? l : `${l} · ${PAGE_KO[place.page] ?? place.page}`;
    }
    case 'site': {
      const s = `${names.lab?.[place.lab] ?? place.lab} 문제 ${place.problem}`;
      return place.step === undefined ? s : `${s} · ${place.step}단계`;
    }
    case 'quiz':
      return `${place.quiz === 'final' ? '마무리 평가' : `평가 ${place.quiz}`} ${place.item}번`;
    case 'robot':
      return `실물 로봇 ${place.robot}`;
    default:
      return place.id;
  }
}
