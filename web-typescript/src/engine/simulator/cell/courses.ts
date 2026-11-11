/**
 * 과정 (입문 트랙): the same 장 · 절 (course.ts) grouped into 차시 three ways — 정규 12차시, 집중
 * 4차시, 체험 2차시 (피드백 v2 파트 2). The one place to change a course: its title, its 차시 and
 * the 절 in each, its own 교안 pages (none: the 정규 교안's). Screens read courses through the
 * helpers below, so a new course needs no screen code. A 절's number (3-4) is the same in every
 * course. 집중 · 체험 have no 수행평가 절: their record is the last 절's mission.
 *
 * The course is picked as the content starts (Console · Intro), each time it opens: nothing is stored.
 */

import { COURSE, COURSE_SUBS, type CourseChapter, type CourseSub } from './course';

export type CourseId = 'full12' | 'focus4' | 'taste2';

export interface CoursePlan {
  id: CourseId;
  title: string;
  /** For the choice: '정규 12차시'. */
  short: string;
  /** One line for the choice. */
  note: string;
  /** The 절 of each 차시, in order. */
  lessons: readonly (readonly string[])[];
  /** This course's own 교안 pages by 절 (missing: the 정규 교안's). */
  pages?: Readonly<Record<string, readonly [number, number]>>;
}

/** 정규 12차시: every 절, in the 차시 of 보고 #48 · #49. */
const FULL: readonly (readonly string[])[] = Array.from({ length: 12 }, (_, i) => COURSE_SUBS.filter((s) => s.lesson === i + 1).map((s) => s.id));

export const COURSES: readonly CoursePlan[] = [
  { id: 'full12', title: 'myCobot 280 협동로봇 1단계: 기초 조작과 로봇 글씨 쓰기', short: '정규 12차시', note: '이론 · 준비 · 관절 · 좌표 · 글씨 쓰기 · 마무리', lessons: FULL },
  {
    id: 'focus4',
    title: 'myCobot 280 협동로봇 집중 과정: 관절 · 좌표 조작과 로봇 글씨 쓰기',
    short: '집중 4차시',
    note: '관절 · 좌표 조작에서 로봇 글씨 쓰기까지',
    lessons: [
      ['1-1', '1-3'],
      ['3-1', '3-2', '3-4'],
      ['4-1', '4-3'],
      ['5-1', '5-2', '5-3'],
    ],
  },
  {
    id: 'taste2',
    title: 'myCobot 280 협동로봇 체험 과정: 로봇팔 움직이기와 로봇 글씨 쓰기',
    short: '체험 2차시',
    note: '로봇팔을 움직여 보고 글씨를 써 봐요',
    lessons: [
      ['1-1', '3-2', '3-4'],
      ['5-1', '5-2'],
    ],
  },
];

export const DEFAULT_COURSE: CourseId = 'full12';
export const isCourseId = (v: unknown): v is CourseId => COURSES.some((c) => c.id === v);
export const courseById = (id: CourseId): CoursePlan => COURSES.find((c) => c.id === id) ?? COURSES[0];

/** The 절 of a course, in order. */
export const subsIn = (c: CoursePlan): CourseSub[] => c.lessons.flat().flatMap((id) => COURSE_SUBS.filter((s) => s.id === id));

/** A 절's 차시 in a course (0: not in it). */
export const lessonIn = (c: CoursePlan, id: string): number => c.lessons.findIndex((l) => l.includes(id)) + 1;

/** A 절's 교안 pages in a course (its own, or the 정규 교안's). */
export const pagesIn = (c: CoursePlan, s: CourseSub): readonly [number, number] => c.pages?.[s.id] ?? s.pages;

/** The 차시 of a course and their 절. */
export const lessonsIn = (c: CoursePlan): { n: number; subs: CourseSub[] }[] => c.lessons.map((ids, i) => ({ n: i + 1, subs: ids.flatMap((id) => COURSE_SUBS.filter((s) => s.id === id)) }));

/** The chapters as a course has them (only its 절; a chapter with none left out). */
export const chaptersIn = (c: CoursePlan): CourseChapter[] => COURSE.map((ch) => ({ ...ch, subs: ch.subs.filter((s) => lessonIn(c, s.id) > 0) })).filter((ch) => ch.subs.length);

/** The next 절 in a course that opens in the app (none: the course's end, or none built yet). */
export function nextIn(c: CoursePlan, id: string): CourseSub | undefined {
  const all = subsIn(c);
  const k = all.findIndex((s) => s.id === id);
  return k < 0 ? undefined : all.slice(k + 1).find((s) => s.run);
}

/** The 절 whose mission is the course's 평가 (집중 · 체험: the last; 정규: its 수행평가 절). */
export const finalSub = (c: CoursePlan): CourseSub | undefined => subsIn(c).at(-1);
