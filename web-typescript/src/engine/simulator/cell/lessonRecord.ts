/**
 * 학습 기록 (입문 트랙 ① 생활 로봇 · 로봇 카페 · 캘리그라피 · 보드게임, 교실 수업형): what one student did, kept in this browser and
 * handed in as one small file; the teacher loads every file and gets one table (and a CSV for Excel).
 * Files only — no server (보고 #42), the same way as the 교육 tab's 반 결과 (education/classReport.ts).
 *
 *  - the record: name · 번호, the plan (4 · 6 · 8 차시), per quest tries · passed · minutes, per 확인 문제
 *    the choice and whether right;
 *  - the teacher's settings on this computer: the plan, the 차시 open now, every quest open;
 *  - summaryOf: per 차시 and in all, quests passed · 확인 right · 3단계 기준 (lessons.ts levelOf);
 *  - parseRecord: a file from a student is untrusted — size and strings capped, fields checked, unknown
 *    quest or question keys dropped, the record rebuilt from the checked values only;
 *  - mergeRecords (the newest file of a student wins) · classCsv (UTF-8 BOM, formula-safe cells).
 *
 * No React, no DOM: the screens pass localStorage in.
 */

import { LESSON_QUEST, PLANS_OF, PLAN_SIZES, SITES, SITE_NAME, SITE_QUESTS, checksOf, levelOf, siteOf, type Level, type PlanSize, type SiteId } from './lessons';

export const RECORD_KEY = 'life-cafe-record';
export const TEACHER_KEY = 'life-cafe-teacher';
export const RECORD_KIND = 'robot-cafe-record';

export interface QuestRec {
  /** Runs started (▶) or tries by hand. */
  tries: number;
  passed: boolean;
  /** First opened, and passed (ms since 1970). */
  openedAt?: number;
  passedAt?: number;
}

export interface CheckRec {
  chosen: number;
  ok: boolean;
}

export interface LessonRecord {
  name: string;
  no: string;
  plan: PlanSize;
  quests: Record<string, QuestRec>;
  checks: Record<string, CheckRec>;
  /** Last change (ms). */
  at: number;
}

export interface TeacherSet {
  plan: PlanSize;
  /** The place the class is at (로봇 카페 → 캘리그라피 → 보드게임: the places before it are open). */
  site: SiteId;
  /** The 차시 open now in that place (quests of 차시 1 … lesson); 0: in turn (a pass opens the next). */
  lesson: number;
  /** Every quest open (a teacher showing, or a student catching up). */
  allOpen: boolean;
}

export const emptyRecord = (plan: PlanSize = 4): LessonRecord => ({ name: '', no: '', plan, quests: {}, checks: {}, at: 0 });
export const defaultTeacher = (): TeacherSet => ({ plan: 4, site: 'cafe', lesson: 1, allOpen: false });
const isSite = (v: unknown): v is SiteId => SITES.includes(v as SiteId);
/** How many 차시 a place has at a plan. */
export const lessonCount = (site: SiteId, plan: PlanSize) => PLANS_OF[site][plan].length;

const QUEST_IDS = Object.keys(LESSON_QUEST);
const CHECK_KEYS = new Set(QUEST_IDS.flatMap((q) => [1, 2, 3].map((k) => `${q}.${k}`)));
const isPlan = (v: unknown): v is PlanSize => PLAN_SIZES.includes(v as PlanSize);
const str = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f]/g, '')
        .trim()
        .slice(0, max)
    : '';
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** A record from any JSON value: only checked fields, only known quests and questions. */
export function cleanRecord(v: unknown): LessonRecord | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const r = emptyRecord(isPlan(o.plan) ? o.plan : 4);
  r.name = str(o.name, 20);
  r.no = str(o.no, 8);
  r.at = num(o.at, 0, 4102444800000) ?? 0;
  const qs = o.quests;
  if (qs && typeof qs === 'object' && !Array.isArray(qs))
    for (const id of QUEST_IDS) {
      if (!own(qs, id)) continue;
      const q = (qs as Record<string, unknown>)[id];
      if (!q || typeof q !== 'object') continue;
      const e = q as Record<string, unknown>;
      r.quests[id] = { tries: num(e.tries, 0, 999) ?? 0, passed: e.passed === true, openedAt: num(e.openedAt, 0, 4102444800000), passedAt: num(e.passedAt, 0, 4102444800000) };
    }
  const cs = o.checks;
  if (cs && typeof cs === 'object' && !Array.isArray(cs))
    for (const k of CHECK_KEYS) {
      if (!own(cs, k)) continue;
      const c = (cs as Record<string, unknown>)[k] as Record<string, unknown> | null;
      const chosen = c && typeof c === 'object' ? num(c.chosen, 0, 5) : undefined;
      if (chosen === undefined) continue;
      // Graded again here: a file cannot claim a right answer.
      const [q, n] = k.split('.');
      r.checks[k] = { chosen, ok: LESSON_QUEST[q].checks[Number(n) - 1].answer === chosen };
    }
  return r;
}

type Read = (k: string) => string | null;

export function loadRecord(read: Read): LessonRecord {
  try {
    return cleanRecord(JSON.parse(read(RECORD_KEY) ?? 'null')) ?? emptyRecord();
  } catch {
    return emptyRecord();
  }
}

export function loadTeacher(read: Read): TeacherSet {
  try {
    const o = JSON.parse(read(TEACHER_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') return defaultTeacher();
    const plan = isPlan(o.plan) ? o.plan : 4;
    const site = isSite(o.site) ? o.site : 'cafe';
    return { plan, site, lesson: num(o.lesson, 0, lessonCount(site, plan)) ?? 1, allOpen: o.allOpen === true };
  } catch {
    return defaultTeacher();
  }
}

/** Settings from the class link (?plan=6&site=draw&lesson=2), over this computer's. */
export function teacherFromQuery(q: string, base: TeacherSet): TeacherSet {
  const p = new URLSearchParams(q);
  const plan = Number(p.get('plan'));
  const lesson = Number(p.get('lesson'));
  const site = p.get('site');
  const out = { ...base };
  if (isPlan(plan)) out.plan = plan;
  if (isSite(site)) out.site = site;
  const most = lessonCount(out.site, out.plan);
  if (Number.isInteger(lesson) && lesson >= 1) out.lesson = Math.min(lesson, most);
  else out.lesson = Math.min(out.lesson, most);
  return out;
}

/** The class link for a plan, place and 차시 (the teacher shows it on the projector). */
export const classLink = (origin: string, t: TeacherSet) => `${origin}/track/life?plan=${t.plan}${t.site === 'cafe' ? '' : `&site=${t.site}`}&lesson=${t.lesson}`;

/**
 * A quest is open when every quest is, or it was passed, or its place comes before the class's
 * place, or it is in that place's 차시 up to the one open now. A place after the class's is shut.
 */
export function questOpen(t: TeacherSet, rec: LessonRecord, id: string): boolean {
  if (t.allOpen || rec.quests[id]?.passed) return true;
  const site = siteOf(id);
  if (!site) return false;
  const at = SITES.indexOf(site);
  const now = SITES.indexOf(t.site);
  if (at !== now) return at < now;
  const i = PLANS_OF[site][t.plan].findIndex((qs) => qs.includes(id));
  return i >= 0 && i < t.lesson;
}

/* --- events --------------------------------------------------------------------------- */

const touch = (r: LessonRecord, id: string, now: number): QuestRec => (r.quests[id] = { ...(r.quests[id] ?? { tries: 0, passed: false }), openedAt: r.quests[id]?.openedAt ?? now });

export function opened(r: LessonRecord, id: string, now: number): LessonRecord {
  if (!LESSON_QUEST[id]) return r;
  const n = { ...r, quests: { ...r.quests }, at: now };
  touch(n, id, now);
  return n;
}

export function tried(r: LessonRecord, id: string, now: number): LessonRecord {
  if (!LESSON_QUEST[id]) return r;
  const n = { ...r, quests: { ...r.quests }, at: now };
  const q = touch(n, id, now);
  q.tries += 1;
  return n;
}

export function passed(r: LessonRecord, id: string, now: number): LessonRecord {
  if (!LESSON_QUEST[id]) return r;
  const n = { ...r, quests: { ...r.quests }, at: now };
  const q = touch(n, id, now);
  if (!q.tries) q.tries = 1;
  if (!q.passed) {
    q.passed = true;
    q.passedAt = now;
  }
  return n;
}

export function answered(r: LessonRecord, key: string, chosen: number, now: number): LessonRecord {
  if (!CHECK_KEYS.has(key)) return r;
  const [q, k] = key.split('.');
  return { ...r, checks: { ...r.checks, [key]: { chosen, ok: LESSON_QUEST[q].checks[Number(k) - 1].answer === chosen } }, at: now };
}

/* --- summary ---------------------------------------------------------------------------- */

/** Minutes from first opened to passed (whole minutes, at least 1), or null. */
export function minutesOf(q: QuestRec | undefined): number | null {
  if (!q?.passed || !q.openedAt || !q.passedAt) return null;
  return Math.max(1, Math.min(240, Math.round((q.passedAt - q.openedAt) / 60000)));
}

export interface LessonSum {
  site: SiteId;
  n: number;
  quests: string[];
  passed: number;
  right: number;
  asked: number;
  /** All three 확인 문제 answered. */
  checked: boolean;
  /** A quest opened or a question answered. */
  started: boolean;
  level: Level | null;
}

/** One place's 차시 and totals (its quests · its 확인 문제 only). */
export function summaryOf(r: LessonRecord, plan: PlanSize = r.plan, site: SiteId = 'cafe'): { lessons: LessonSum[]; passed: number; right: number; asked: number; total: number; level: Level | null } {
  const lessons = PLANS_OF[site][plan].map((qs, i): LessonSum => {
    const asks = checksOf(plan, i + 1, site);
    const got = asks.filter((a) => r.checks[a.key]);
    const p = qs.filter((q) => r.quests[q]?.passed).length;
    const right = got.filter((a) => r.checks[a.key].ok).length;
    const started = qs.some((q) => r.quests[q]) || got.length > 0;
    const checked = got.length === asks.length;
    // The 기준 once the 차시 is done (its 확인 문제 all answered); before that it is 진행 중.
    return { site, n: i + 1, quests: [...qs], passed: p, right, asked: got.length, checked, started, level: checked ? levelOf(p, qs.length, right, asks.length) : null };
  });
  const mine = SITE_QUESTS[site];
  const passedN = mine.filter((q) => r.quests[q]?.passed).length;
  const answeredAll = Object.entries(r.checks)
    .filter(([k]) => mine.includes(k.split('.')[0]))
    .map(([, c]) => c);
  const right = answeredAll.filter((c) => c.ok).length;
  // In all: over the 차시 done so far (none done yet: no 기준).
  const done = lessons.filter((l) => l.checked);
  const dq = done.reduce((a, l) => a + l.quests.length, 0);
  const level = done.length
    ? levelOf(
        done.reduce((a, l) => a + l.passed, 0),
        dq,
        done.reduce((a, l) => a + l.right, 0),
        done.reduce((a, l) => a + l.asked, 0),
      )
    : null;
  return { lessons, passed: passedN, right, asked: answeredAll.length, total: mine.length, level };
}

/* --- files ------------------------------------------------------------------------------ */

export function recordFile(r: LessonRecord): { name: string; text: string } {
  const who =
    [r.no, r.name]
      .filter(Boolean)
      .join('-')
      .replace(/[\\/:*?"<>|\s]+/g, '_') || '이름없음';
  return { name: `${who}-생활로봇-학습기록.json`, text: JSON.stringify({ kind: RECORD_KIND, v: 1, ...r }) };
}

/** A student's file (untrusted): null when it is not one. */
export function parseRecord(text: string): LessonRecord | null {
  if (text.length > 64_000) return null;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (!o || o.kind !== RECORD_KIND) return null;
    return cleanRecord(o);
  } catch {
    return null;
  }
}

/** The same student (번호 + 이름) twice: the newest file wins. */
export function mergeRecords(rs: LessonRecord[]): LessonRecord[] {
  const by = new Map<string, LessonRecord>();
  for (const r of rs) {
    const k = `${r.no}|${r.name}`;
    const was = by.get(k);
    if (!was || r.at >= was.at) by.set(k, r);
  }
  return [...by.values()].sort((a, b) => a.no.localeCompare(b.no, 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko'));
}

const cell = (v: string | number) => {
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * One row per student: each place (카페 · 캘리그라피 · 보드게임) 차시 by 차시 (통과 · 확인 · 기준) and its
 * totals. Excel reads it (BOM).
 */
export function classCsv(rs: LessonRecord[], plan: PlanSize): string {
  const head = ['번호', '이름'];
  for (const site of SITES) {
    const short = SITE_NAME[site].replace(/^로봇 | 로봇$/g, '');
    PLANS_OF[site][plan].forEach((_, i) => head.push(`${short} ${i + 1}차시 통과`, `${short} ${i + 1}차시 확인`, `${short} ${i + 1}차시 기준`));
    head.push(`${short} 퀘스트 통과 (${SITE_QUESTS[site].length})`, `${short} 확인 문제 맞힘`, `${short} 기준`);
  }
  const rows = rs.map((r) => {
    const row: (string | number)[] = [r.no, r.name];
    for (const site of SITES) {
      const s = summaryOf(r, plan, site);
      for (const l of s.lessons) row.push(`${l.passed}/${l.quests.length}`, `${l.right}/${l.asked}`, l.level ?? '');
      row.push(s.passed, `${s.right}/${s.asked}`, s.level ?? '');
    }
    return row.map(cell).join(',');
  });
  return '﻿' + [head.map(cell).join(','), ...rows].join('\r\n');
}
