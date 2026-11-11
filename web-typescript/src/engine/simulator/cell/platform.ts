/**
 * 플랫폼 연결 (피드백 v3 파트 2): the one place the simulator reads its 구성 from, asks whether a
 * course may be opened, and sends its record to. Today there is no platform link: the 구성 is the
 * table's default (8차시), every course may be opened, the 저작권 안내 is once a day in this browser,
 * and the record stays in this browser (lessonRecord.ts, as before — its stored form is unchanged).
 * To link the platform (same domain, the login's cookie: decided, applied after the platform's
 * report), change only these:
 *  - `readPlan`: GET the class's 구성;
 *  - `mayOpen`: the login and the 이용권 (every way into a 절 — the address and the lists — asks it);
 *  - `noticeDue` / `noticeRead`: by the account instead of this browser;
 *  - `report`: POST each event (the platform adds the account and the class from the login — the
 *    simulator never puts them in an address or a body);
 *  - `levelOf`: the server's 상 · 중 · 하 (the browser's is allowed only until then, shown as 임시).
 * Storage comes in as functions (the screens pass localStorage), so: no React, no DOM.
 */

import { DEFAULT_PLAN, planOf, type CoursePlan } from './courses';
import type { SubMode } from './course';

/** May this user open this course (and this 절)? Today: always. No: the scene does not open, a notice does. */
export async function mayOpen(q: { course: string; sub?: string; mode?: SubMode }): Promise<boolean> {
  void q;
  return true;
}

/* --- 저작권 안내: once a day ------------------------------------------------------------- */

const NOTICE_KEY = 'life-copyright-day';
/** '2026-11-11' in this computer's time. */
const dayOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The 안내 is to be shown (not read yet today). */
export function noticeDue(read: (k: string) => string | null, now: number): boolean {
  try {
    return read(NOTICE_KEY) !== dayOf(now);
  } catch {
    return true;
  }
}
/** The 안내 was read ([확인하고 시작]). */
export function noticeRead(write: (k: string, v: string) => void, now: number): void {
  try {
    write(NOTICE_KEY, dayOf(now));
  } catch {
    /* blocked storage: it shows again next time */
  }
}

/* --- 상 · 중 · 하 ------------------------------------------------------------------------- */

/** One chapter's 수행평가 result (none yet: 준비 중, or not taken). */
export interface TestResult {
  chapter: number;
  /** O · X right of 5, and the mission. */
  right: number;
  of: number;
  mission: boolean;
}

/**
 * A chapter's 상 · 중 · 하 by the 수행평가 rule (보고 #48: 상 = O · X 5개 + 미션 통과, 중 = 하나 놓침,
 * 하 = 둘 이상 놓침), computed here in the browser — 임시, until the platform's own. Only 수행평가
 * actually taken are given: one 준비 중 or skipped has no result and no level, never a 하.
 */
export function levelOf(r: TestResult): { level: '상' | '중' | '하'; temporary: true } {
  const missed = Math.max(0, r.of - r.right) + (r.mission ? 0 : 1);
  return { level: missed === 0 ? '상' : missed === 1 ? '중' : '하', temporary: true };
}

/** The 구성 for this class (none handed over: the default). */
export async function readPlan(): Promise<CoursePlan> {
  return DEFAULT_PLAN;
}

/** The platform's own 구성, as it will hand it over: 차시 of 절 numbers. */
export const planFromPlatform = (p: { title?: string; short?: string; lessons: readonly (readonly string[])[]; tests?: boolean }): CoursePlan => planOf({ id: 'class', ...p });

/** One thing that happened in a 절. */
export interface CourseEvent {
  /** '3-4'. */
  sub: string;
  mode: SubMode;
  /** opened: entered · passed / failed: a 실습's run was graded · done: a tutorial finished. */
  what: 'opened' | 'passed' | 'failed' | 'done';
  at: number;
}

/** Send one event (today: nothing more to do; the browser's record is kept by lessonRecord.ts). */
export function report(e: CourseEvent): void {
  void e;
}
