/**
 * 구성 (입문 트랙): the course's 절 grouped into 차시 (8차시 지시서). Two come with the 매칭 표
 * (course.ts): 8차시 (전체, the default) and 4차시 (집중, some 절 of the 8). The platform picks one
 * for a class — or its own list — and hands it over (platform.ts); with none handed over, 8차시.
 * A 절's number is the same in every course; a 절 a course leaves out is just not in its list.
 *
 * 수행평가: in a course with tests (8차시) each chapter's 수행평가 follows the chapter's last 절 in the
 * course; in 4차시 there are none, and the mission of each 차시's last 절 is what is recorded.
 * After the course's last 절: the 학습 기록.
 */

import TABLE from '../../../../public/course/mycobot-280-1.json';

import { COURSE, COURSE_SUBS, type CourseChapter, type CourseSub } from './course';

export interface CoursePlan {
  /** 'full8', 'focus4', or the platform's own ('class'). */
  id: string;
  title: string;
  /** '8차시 (전체)'. */
  short: string;
  /** The 절 of each 차시, in order. */
  lessons: readonly (readonly string[])[];
  /** Each chapter's 수행평가 follows its last 절 (8차시); none: each 차시's last 절's mission is recorded (4차시). */
  tests: boolean;
}

/** A 절 the course may list: in the table, and not 사용 안 함. */
const listable = (id: string) => COURSE_SUBS.some((s) => s.id === id && s.status !== 'unused');

/** A plan from lessons of 절 numbers (the table's or the platform's): unknown and 사용 안 함 절 dropped, empty 차시 too. */
export function planOf(p: { id: string; title?: string; short?: string; lessons: readonly (readonly string[])[]; tests?: boolean }): CoursePlan {
  const lessons = p.lessons.map((l) => l.filter(listable)).filter((l) => l.length);
  return { id: p.id, title: p.title ?? TABLE.name, short: p.short ?? `${lessons.length}차시`, lessons, tests: p.tests ?? true };
}

export const COURSES: readonly CoursePlan[] = TABLE.courses.map((c) => planOf(c));

/** With no course handed over: the table's default (8차시). */
export const DEFAULT_PLAN: CoursePlan = COURSES.find((c, i) => TABLE.courses[i].default) ?? COURSES[0];

/** The 절 of a course, in order. */
export const subsIn = (c: CoursePlan): CourseSub[] => c.lessons.flat().flatMap((id) => COURSE_SUBS.filter((s) => s.id === id));

/** A 절's 차시 in a course (0: not in it). */
export const lessonIn = (c: CoursePlan, id: string): number => c.lessons.findIndex((l) => l.includes(id)) + 1;

/** The 차시 of a course and their 절. */
export const lessonsIn = (c: CoursePlan): { n: number; subs: CourseSub[] }[] => c.lessons.map((ids, i) => ({ n: i + 1, subs: ids.flatMap((id) => COURSE_SUBS.filter((s) => s.id === id)) }));

/** The chapters as a course has them (only its 절; a chapter with none left out). */
export const chaptersIn = (c: CoursePlan): CourseChapter[] => COURSE.map((ch) => ({ ...ch, subs: ch.subs.filter((s) => lessonIn(c, s.id) > 0) })).filter((ch) => ch.subs.length);

/** One step of a course in order: a 절, or a chapter's 수행평가 after its last 절 (courses with tests). */
export type CourseStep = { kind: 'sub'; sub: CourseSub } | { kind: 'test'; chapter: CourseChapter; sub: CourseSub };

export function stepsIn(c: CoursePlan): CourseStep[] {
  const subs = subsIn(c);
  return subs.flatMap((s, k): CourseStep[] => {
    const ch = COURSE.find((x) => x.n === s.chapter);
    const last = subs[k + 1]?.chapter !== s.chapter;
    const test = c.tests && last && ch?.test ? COURSE_SUBS.find((x) => x.id === ch.test) : undefined;
    return test && ch
      ? [
          { kind: 'sub', sub: s },
          { kind: 'test', chapter: ch, sub: test },
        ]
      : [{ kind: 'sub', sub: s }];
  });
}

/** A chapter's 수행평가 is in the app (its questions came): until then it shows as 준비 중 and is skipped. */
export const testReady = (t: CourseSub) => !!t.run;

/** The 차시 of a course and their steps (a 수행평가 in the 차시 of the chapter's last 절). */
export function lessonStepsIn(c: CoursePlan): { n: number; steps: CourseStep[] }[] {
  const out = c.lessons.map((_, i) => ({ n: i + 1, steps: [] as CourseStep[] }));
  let at = 0;
  for (const x of stepsIn(c)) {
    if (x.kind === 'sub') at = lessonIn(c, x.sub.id) - 1;
    out[at]?.steps.push(x);
  }
  return out;
}

/**
 * After a 절, in a course: the next step that opens in the app (a chapter's 수행평가 once it is built,
 * else the next 절 that opens), or else the 학습 기록 ('record': nothing after it opens yet).
 */
export function nextIn(c: CoursePlan, id: string): CourseSub | 'record' | undefined {
  const all = stepsIn(c);
  const k = all.findIndex((x) => x.kind === 'sub' && x.sub.id === id);
  if (k < 0) return undefined;
  return all.slice(k + 1).find((x) => !!x.sub.run)?.sub ?? 'record';
}

/** What counts toward 완료: the course's 절 that open, but not a 선택 절 (skipping it never counts against). */
export const countedIn = (c: CoursePlan): CourseSub[] => subsIn(c).filter((s) => s.run && !s.optional);

/** 4차시 (no tests): the 절 whose mission is recorded — each 차시's last. */
export const missionSubsIn = (c: CoursePlan): CourseSub[] => (c.tests ? [] : lessonsIn(c).flatMap((l) => l.subs.slice(-1)));
