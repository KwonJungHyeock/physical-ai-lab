/**
 * Learning events, shaped like xAPI statements (actor · verb · object · result · context).
 *
 *  - actor: never set here. The class server writes it from the login (pseudonymous "<학급코드>-<번호>"),
 *    so a client cannot send events as someone else, and no name is ever part of an event.
 *  - verb: the ADL verbs experienced / attempted / answered / completed / passed / failed, and three of
 *    our own (hinted, ran, operated). Each has a published purpose (VERBS[k].purpose, also served by the
 *    class server at /purposes) — nothing is recorded "just in case".
 *  - object: a lesson page, a site problem (or one of its steps), a quiz item, a robot — URNs built by
 *    the *Object functions below.
 *  - result: success, score, a short answer, how long it took; context: an attempt id.
 *
 * Keep VERBS in step with desktop-go/classroom/statements.go (tests/account checks both lists match).
 * No React, no DOM.
 */

import type { XapiAgent } from './types';

export const ADL_VERB = 'http://adlnet.gov/expapi/verbs/';
export const OUR_VERB = 'urn:robocity:verb:';

export type VerbKey = 'experienced' | 'attempted' | 'answered' | 'completed' | 'passed' | 'failed' | 'hinted' | 'ran' | 'operated';

export interface VerbInfo {
  id: string;
  /** Korean, as the teacher sees it. */
  ko: string;
  /** Why it is recorded (the published purpose). */
  purpose: string;
  /** Also sent to the company cloud (pseudonymised) when the school turned sync on. */
  cloud: boolean;
}

export const VERBS: Readonly<Record<VerbKey, VerbInfo>> = {
  experienced: { id: ADL_VERB + 'experienced', ko: '봤다', purpose: "수업 페이지를 연 기록: 진도 표시, 교사 화면의 '지금 어디' 표시", cloud: true },
  attempted: { id: ADL_VERB + 'attempted', ko: '시작했다', purpose: "활동·현장 문제를 시작한 기록: 진도와 '지금 어디' 표시", cloud: true },
  answered: {
    id: ADL_VERB + 'answered',
    ko: '답했다',
    purpose: '예상·질문·평가 문항의 답: 교사 피드백, 자주 틀리는 생각 찾기 (클라우드에는 선택지 번호 같은 짧은 값만)',
    cloud: true,
  },
  completed: { id: ADL_VERB + 'completed', ko: '마쳤다', purpose: '단계·차시를 마친 기록: 진도와 학급 결과', cloud: true },
  passed: { id: ADL_VERB + 'passed', ko: '통과했다', purpose: '문제를 통과한 기록: 성취 확인, 막힘 풀림 표시', cloud: true },
  failed: { id: ADL_VERB + 'failed', ko: '통과하지 못했다', purpose: '문제를 통과하지 못한 기록: 같은 문제에서 여러 번 막힌 학생을 교사에게 알림', cloud: true },
  hinted: { id: OUR_VERB + 'hinted', ko: '힌트를 열었다', purpose: '힌트를 연 기록: 막힘 감지와 힌트 품질 개선', cloud: true },
  ran: { id: OUR_VERB + 'ran', ko: '시뮬레이터에서 실행했다', purpose: '시뮬레이터 실행 기록: 활동량 확인', cloud: true },
  operated: { id: OUR_VERB + 'operated', ko: '실물 로봇을 움직였다', purpose: '실물 로봇 실행 기록: 로봇 사용 현황과 안전 관리', cloud: true },
};

export const VERB_KEYS = Object.keys(VERBS) as VerbKey[];

const VERB_BY_ID = new Map(VERB_KEYS.map((k) => [VERBS[k].id, k]));

export function verbKeyOf(id: string): VerbKey | null {
  return VERB_BY_ID.get(id) ?? null;
}

/* --- objects ------------------------------------------------------------------------------------- */

const ACT = 'http://adlnet.gov/expapi/activities/';
export const ACTIVITY_TYPES = {
  lesson: ACT + 'lesson',
  page: ACT + 'module',
  problem: ACT + 'simulation',
  step: ACT + 'interaction',
  question: ACT + 'cmi.interaction',
  robot: ACT + 'performance',
} as const;

const SEGMENT = /^[A-Za-z0-9._-]{1,40}$/;

function seg(v: string | number, what: string): string {
  const s = String(v);
  if (!SEGMENT.test(s)) throw new RangeError(`${what}: "${s}" (letters, digits, . _ - only, ≤ 40)`);
  return s;
}

/** A 차시 (e.g. "1-2"), or one of its pages ("intro", "concept", "act1", "summary", "quiz", or an index). */
export function lessonObject(lesson: string, page?: string | number): string {
  return `urn:robocity:lesson:${seg(lesson, 'lesson')}` + (page === undefined ? '' : `:page:${seg(page, 'page')}`);
}

/** A 현장 problem (lab id from park.ts, problem 1–3), or one of its steps. */
export function siteObject(lab: string, problem: number, step?: string | number): string {
  return `urn:robocity:site:${seg(lab, 'lab')}:problem:${seg(problem, 'problem')}` + (step === undefined ? '' : `:step:${seg(step, 'step')}`);
}

/** A quiz item (quiz "final" = 마무리 평가, or a 차시's 평가 "1-2"). */
export function quizObject(quiz: string, item: string | number): string {
  return `urn:robocity:quiz:${seg(quiz, 'quiz')}:item:${seg(item, 'item')}`;
}

/** A real robot (its model id). */
export function robotObject(robot: string): string {
  return `urn:robocity:robot:${seg(robot, 'robot')}`;
}

/** Where an object id points (for the live grid and labels). */
export type Place =
  | { kind: 'lesson'; lesson: string; page?: string }
  | { kind: 'site'; lab: string; problem: number; step?: string }
  | { kind: 'quiz'; quiz: string; item: string }
  | { kind: 'robot'; robot: string }
  | { kind: 'other'; id: string };

export function parsePlace(id: string): Place {
  const p = id.split(':');
  if (p[0] !== 'urn' || p[1] !== 'robocity') return { kind: 'other', id };
  const [, , kind, a, b, c, d, e] = p;
  if (kind === 'lesson' && a && p.length === 4) return { kind, lesson: a };
  if (kind === 'lesson' && a && b === 'page' && c && p.length === 6) return { kind, lesson: a, page: c };
  if (kind === 'site' && a && b === 'problem' && /^\d+$/.test(c ?? '')) {
    if (p.length === 6) return { kind, lab: a, problem: Number(c) };
    if (d === 'step' && e && p.length === 8) return { kind, lab: a, problem: Number(c), step: e };
  }
  if (kind === 'quiz' && a && b === 'item' && c && p.length === 6) return { kind, quiz: a, item: c };
  if (kind === 'robot' && a && p.length === 4) return { kind, robot: a };
  return { kind: 'other', id };
}

/** The activity type for an object id. */
export function activityType(id: string): string | undefined {
  const pl = parsePlace(id);
  switch (pl.kind) {
    case 'lesson':
      return pl.page === undefined ? ACTIVITY_TYPES.lesson : ACTIVITY_TYPES.page;
    case 'site':
      return pl.step === undefined ? ACTIVITY_TYPES.problem : ACTIVITY_TYPES.step;
    case 'quiz':
      return ACTIVITY_TYPES.question;
    case 'robot':
      return ACTIVITY_TYPES.robot;
    default:
      return undefined;
  }
}

/* --- statements ---------------------------------------------------------------------------------- */

export type ExtValue = string | number | boolean | null;

export interface Statement {
  id: string;
  /** Written by the class server; a client leaves it out. */
  actor?: XapiAgent;
  verb: { id: string; display?: Record<string, string> };
  object: { objectType: 'Activity'; id: string; definition?: { type?: string } };
  result?: {
    success?: boolean;
    completion?: boolean;
    score?: { scaled?: number; raw?: number; min?: number; max?: number };
    response?: string;
    duration?: string;
    extensions?: Record<string, ExtValue>;
  };
  context?: { registration?: string; extensions?: Record<string, ExtValue> };
  timestamp: string;
  /** Set by the class server: when it was received, and its number in the class's record. */
  stored?: string;
  seq?: number;
}

/** A stored statement (what the teacher's feed returns). */
export type StoredStatement = Statement & { stored: string; seq: number };

export const EXT_CLASS = 'urn:robocity:ctx:class';
export const EXT_NO = 'urn:robocity:ctx:no';
export const MAX_RESPONSE = 500;
export const MAX_EXTENSIONS = 16;

/** A random UUID v4, lower case (crypto.randomUUID where there is one). */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Seconds → ISO 8601 duration ("PT12.5S"). */
export function isoDuration(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return `PT${Math.round(seconds * 10) / 10}S`;
}

/** A lab's values as result extensions (urn:robocity:val:<name>), at most 16, strings capped. */
export function valueExtensions(values: Record<string, unknown>): Record<string, ExtValue> {
  const out: Record<string, ExtValue> = {};
  for (const [k, v] of Object.entries(values)) {
    if (Object.keys(out).length >= MAX_EXTENSIONS) break;
    const key = k.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40);
    if (!key) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[`urn:robocity:val:${key}`] = v;
    else if (typeof v === 'boolean') out[`urn:robocity:val:${key}`] = v;
    else if (typeof v === 'string') out[`urn:robocity:val:${key}`] = v.slice(0, 200);
  }
  return out;
}

export interface StatementInput {
  verb: VerbKey;
  /** An id from lessonObject / siteObject / quizObject / robotObject. */
  object: string;
  result?: Statement['result'];
  /** An attempt id (uuid) tying a run's events together. */
  registration?: string;
  /** Extra context (keys urn:robocity:ctx:<name>; class and 번호 are the server's). */
  context?: Record<string, ExtValue>;
  /** When (ms since 1970); default now. */
  at?: number;
}

export interface StatementDeps {
  now?: () => number;
  uuid?: () => string;
}

/** Build a statement; throws on an unknown verb or a malformed object id (programming errors). */
export function statement(input: StatementInput, deps: StatementDeps = {}): Statement {
  const v = VERBS[input.verb];
  if (!v) throw new RangeError(`unknown verb ${input.verb}`);
  if (parsePlace(input.object).kind === 'other') throw new RangeError(`object id ${input.object}`);
  const s: Statement = {
    id: (deps.uuid ?? uuid)(),
    verb: { id: v.id, display: { ko: v.ko } },
    object: { objectType: 'Activity', id: input.object, definition: { type: activityType(input.object) } },
    timestamp: new Date(input.at ?? (deps.now ?? Date.now)()).toISOString(),
  };
  if (input.result && Object.keys(input.result).length > 0) s.result = input.result;
  const ctx: NonNullable<Statement['context']> = {};
  if (input.registration) ctx.registration = input.registration;
  if (input.context && Object.keys(input.context).length > 0) ctx.extensions = { ...input.context };
  if (Object.keys(ctx).length > 0) s.context = ctx;
  return s;
}

/** The events the screens send, by what happened. */
export const events = {
  /** A lesson page was opened. */
  pageOpened: (lesson: string, page: string | number, d?: StatementDeps) => statement({ verb: 'experienced', object: lessonObject(lesson, page) }, d),
  /** A lesson, or a site problem, was started. */
  lessonStarted: (lesson: string, d?: StatementDeps) => statement({ verb: 'attempted', object: lessonObject(lesson) }, d),
  problemStarted: (lab: string, problem: number, registration?: string, d?: StatementDeps) =>
    statement({ verb: 'attempted', object: siteObject(lab, problem), registration }, d),
  /** A prediction, question or quiz answer. response: the choice or a short typed answer (≤ 500). */
  answered: (object: string, response: string, success?: boolean, d?: StatementDeps) =>
    statement({ verb: 'answered', object, result: { response: response.slice(0, MAX_RESPONSE), ...(success === undefined ? {} : { success }) } }, d),
  /** A step, page or lesson finished. */
  completed: (object: string, d?: StatementDeps) => statement({ verb: 'completed', object, result: { completion: true } }, d),
  /** A site problem run: passed or failed, with how long the robot's job took and the values set. */
  problemResult: (
    lab: string,
    problem: number,
    pass: boolean,
    opts: { durationS?: number; values?: Record<string, unknown>; scaled?: number; registration?: string } = {},
    d?: StatementDeps,
  ) =>
    statement(
      {
        verb: pass ? 'passed' : 'failed',
        object: siteObject(lab, problem),
        registration: opts.registration,
        result: {
          success: pass,
          ...(opts.scaled === undefined ? {} : { score: { scaled: Math.max(-1, Math.min(1, opts.scaled)) } }),
          ...(opts.durationS === undefined || isoDuration(opts.durationS) === undefined ? {} : { duration: isoDuration(opts.durationS) }),
          ...(opts.values ? { extensions: valueExtensions(opts.values) } : {}),
        },
      },
      d,
    ),
  /** A quiz graded: score out of max. */
  scored: (object: string, raw: number, max: number, pass: boolean, d?: StatementDeps) =>
    statement({ verb: pass ? 'passed' : 'failed', object, result: { success: pass, score: { raw, min: 0, max, scaled: max > 0 ? raw / max : 0 } } }, d),
  hint: (object: string, n?: number, d?: StatementDeps) =>
    statement({ verb: 'hinted', object, result: n === undefined ? undefined : { extensions: { 'urn:robocity:res:hint': n } } }, d),
  /** A program run in the simulator. */
  ran: (object: string, d?: StatementDeps) => statement({ verb: 'ran', object }, d),
  /** A program run on the real robot. */
  operated: (object: string, robot?: string, d?: StatementDeps) =>
    statement({ verb: 'operated', object, context: robot ? { 'urn:robocity:ctx:robot': robot.slice(0, 40) } : undefined }, d),
  /**
   * A check done on the real robot with what it measured (로봇 실습 7): response = the sentence the
   * student saw, values = the numbers (urn:robocity:val:<name>). demo: a demo robot server (practice).
   */
  robotResult: (object: string, robot: string, out: { response: string; values?: Record<string, unknown>; demo?: boolean }, d?: StatementDeps) =>
    statement(
      {
        verb: 'operated',
        object,
        result: { success: true, response: out.response.slice(0, MAX_RESPONSE), ...(out.values ? { extensions: valueExtensions(out.values) } : {}) },
        context: { 'urn:robocity:ctx:robot': robot.slice(0, 40), ...(out.demo ? { 'urn:robocity:ctx:demo': true } : {}) },
      },
      d,
    ),
};

/* --- checks (the same rules as the server, to drop a bad statement before it is queued) ------------ */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RE_OBJECT = /^urn:robocity:(lesson|site|quiz|robot)(:[A-Za-z0-9._-]{1,40}){1,6}$/;
const RE_EXT_KEY = /^urn:robocity:[a-z]+:[A-Za-z0-9._-]{1,40}$/;
const RE_DURATION = /^P(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

function extProblem(m: Record<string, ExtValue> | undefined): string | null {
  if (!m) return null;
  const keys = Object.keys(m);
  if (keys.length > MAX_EXTENSIONS) return 'extensions: 너무 많음';
  for (const k of keys) {
    if (!RE_EXT_KEY.test(k)) return 'extensions: 키 형식';
    const v = m[k];
    if (typeof v === 'string' && [...v].length > 200) return 'extensions: 값이 너무 김';
    if (typeof v === 'number' && !Number.isFinite(v)) return 'extensions: 숫자가 아님';
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) return 'extensions: 값 종류';
  }
  return null;
}

/** Why the server would refuse the statement, or null. */
export function statementProblem(s: Statement): string | null {
  if (!RE_UUID.test(s.id)) return 'id';
  if (!verbKeyOf(s.verb?.id)) return 'verb';
  if (!RE_OBJECT.test(s.object?.id ?? '') || s.object.id.length > 160) return 'object.id';
  if (Number.isNaN(Date.parse(s.timestamp))) return 'timestamp';
  const r = s.result;
  if (r) {
    if (r.response !== undefined && [...r.response].length > MAX_RESPONSE) return 'result.response';
    if (r.duration !== undefined && !RE_DURATION.test(r.duration)) return 'result.duration';
    if (r.score?.scaled !== undefined && (r.score.scaled < -1 || r.score.scaled > 1)) return 'result.score.scaled';
    const e = extProblem(r.extensions);
    if (e) return 'result.' + e;
  }
  if (s.context) {
    if (s.context.registration !== undefined && !RE_UUID.test(s.context.registration)) return 'context.registration';
    const e = extProblem(s.context.extensions);
    if (e) return 'context.' + e;
  }
  if (new TextEncoder().encode(JSON.stringify(s)).length > 4096) return 'size'; // bytes, as the server counts
  return null;
}
