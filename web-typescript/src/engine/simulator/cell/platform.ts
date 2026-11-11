/**
 * 플랫폼 연결 (피드백 v3 파트 2): the one place the simulator reads its 구성 from and sends its
 * record to. Today there is no platform link: the 구성 is the table's default (8차시) and the record
 * stays in this browser (lessonRecord.ts, as before — its stored form is unchanged). To link the
 * platform (same domain, the login's cookie: decided, applied after the platform's report), change
 * only `readPlan` (GET the class's 구성) and `report` (POST each event; the platform adds the account
 * and the class from the login — the simulator never puts them in an address or a body). 상 · 중 · 하
 * and other totals are the platform's to compute. No React, no DOM.
 */

import { DEFAULT_PLAN, planOf, type CoursePlan } from './courses';
import type { SubMode } from './course';

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
