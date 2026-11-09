/**
 * 학습 기록 (입문 트랙 · 로봇 카페, 교실 수업형): what one student did, kept in this browser and
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

import { LESSON_QUEST, PLANS, PLAN_SIZES, checksOf, levelOf, type Level, type PlanSize } from './lessons';

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
  /** The 차시 open now (quests of 차시 1 … lesson). */
  lesson: number;
  /** Every quest open (a teacher showing, or a student catching up). */
  allOpen: boolean;
}

export const emptyRecord = (plan: PlanSize = 4): LessonRecord => ({ name: '', no: '', plan, quests: {}, checks: {}, at: 0 });
export const defaultTeacher = (): TeacherSet => ({ plan: 4, lesson: 1, allOpen: false });

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
    return { plan, lesson: num(o.lesson, 1, plan) ?? 1, allOpen: o.allOpen === true };
  } catch {
    return defaultTeacher();
  }
}

/** Settings from the class link (?plan=6&lesson=2), over this computer's. */
export function teacherFromQuery(q: string, base: TeacherSet): TeacherSet {
  const p = new URLSearchParams(q);
  const plan = Number(p.get('plan'));
  const lesson = Number(p.get('lesson'));
  const out = { ...base };
  if (isPlan(plan)) out.plan = plan;
  if (Number.isInteger(lesson) && lesson >= 1) out.lesson = Math.min(lesson, out.plan);
  else out.lesson = Math.min(out.lesson, out.plan);
  return out;
}

/** The class link for a plan and 차시 (the teacher shows it on the projector). */
export const classLink = (origin: string, t: TeacherSet) => `${origin}/track/life?plan=${t.plan}&lesson=${t.lesson}`;

/** A quest is open when every quest is, or it is in a 차시 up to the one open now (and a passed one stays open). */
export function questOpen(t: TeacherSet, rec: LessonRecord, id: string): boolean {
  if (t.allOpen || rec.quests[id]?.passed) return true;
  const i = PLANS[t.plan].findIndex((qs) => qs.includes(id));
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

export function summaryOf(r: LessonRecord, plan: PlanSize = r.plan): { lessons: LessonSum[]; passed: number; right: number; asked: number; level: Level | null } {
  const lessons = PLANS[plan].map((qs, i): LessonSum => {
    const asks = checksOf(plan, i + 1);
    const got = asks.filter((a) => r.checks[a.key]);
    const p = qs.filter((q) => r.quests[q]?.passed).length;
    const right = got.filter((a) => r.checks[a.key].ok).length;
    const started = qs.some((q) => r.quests[q]) || got.length > 0;
    const checked = got.length === asks.length;
    // The 기준 once the 차시 is done (its 확인 문제 all answered); before that it is 진행 중.
    return { n: i + 1, quests: [...qs], passed: p, right, asked: got.length, checked, started, level: checked ? levelOf(p, qs.length, right, asks.length) : null };
  });
  const passedN = QUEST_IDS.filter((q) => r.quests[q]?.passed).length;
  const answeredAll = Object.values(r.checks);
  const right = answeredAll.filter((c) => c.ok).length;
  // In all: over the 차시 done so far (none done yet: no 기준).
  const done = lessons.filter((l) => l.checked);
  const dq = done.reduce((a, l) => a + l.quests.length, 0);
  const level = done.length ? levelOf(done.reduce((a, l) => a + l.passed, 0), dq, done.reduce((a, l) => a + l.right, 0), done.reduce((a, l) => a + l.asked, 0)) : null;
  return { lessons, passed: passedN, right, asked: answeredAll.length, level };
}

/* --- files ------------------------------------------------------------------------------ */

export function recordFile(r: LessonRecord): { name: string; text: string } {
  const who =
    [r.no, r.name]
      .filter(Boolean)
      .join('-')
      .replace(/[\\/:*?"<>|\s]+/g, '_') || '이름없음';
  return { name: `${who}-로봇카페-학습기록.json`, text: JSON.stringify({ kind: RECORD_KIND, v: 1, ...r }) };
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

/** One row per student: 차시 by 차시 (통과 · 확인 · 기준), then in all. Excel reads it (BOM). */
export function classCsv(rs: LessonRecord[], plan: PlanSize): string {
  const head = ['번호', '이름'];
  PLANS[plan].forEach((_, i) => head.push(`${i + 1}차시 통과`, `${i + 1}차시 확인`, `${i + 1}차시 기준`));
  head.push('퀘스트 통과 (8)', '확인 문제 맞힘', '전체 기준');
  const rows = rs.map((r) => {
    const s = summaryOf(r, plan);
    const row: (string | number)[] = [r.no, r.name];
    for (const l of s.lessons) row.push(`${l.passed}/${l.quests.length}`, `${l.right}/${l.asked}`, l.level ?? '');
    row.push(s.passed, `${s.right}/${s.asked}`, s.level ?? '');
    return row.map(cell).join(',');
  });
  return '﻿' + [head.map(cell).join(','), ...rows].join('\r\n');
}
