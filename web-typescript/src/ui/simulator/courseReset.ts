/**
 * 입문 과정 수업 초기화 (2026-11-23 회신): the course starts again from 1-1 for the next class on this PC.
 * The learning record is not deleted (soft delete): its keys are copied, with the time, into ARCHIVE_KEY
 * (a list kept in this browser) and only then taken off the live record. Settings (빠르기 · 화질 · 저작권 안내)
 * and the other screens' records (/console, 카페 교실) are left alone. Under ?qa=1 the QA record is the one moved.
 */

import { QA_PREFIX, isQa } from './qaMode';

/** The course's own record: 절 done, 수행평가, 5-4 내 카드, 6장 후기, 맛보기 · 고리 단계, 예측, 저장한 자세, 카드 순서. */
const COURSE_KEYS = [
  'life-course-steps-2',
  'life-course-steps',
  'life-course-tests',
  'life-course-my-card',
  'life-course-review',
  'robot-console-life-tutorials',
  'robot-console-cell-passed',
  'robot-console-course-4-1-step',
  'robot-console-life-predict',
  'robot-console-poses',
];
const COURSE_PREFIXES = ['robot-console-cell-prog'];

/** Every reset's record, oldest first: [{ at, keys: { key: value } }]. Never removed by the app. */
export const ARCHIVE_KEY = 'life-course-archive';

const ofCourse = (k: string) => COURSE_KEYS.includes(k) || COURSE_PREFIXES.some((p) => k.startsWith(p));

/** The record put aside and taken off; then the page starts again (the course's first screen). */
export function resetCourse(): void {
  try {
    const ls = window.localStorage;
    const qa = isQa();
    const names: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const raw = ls.key(i);
      if (!raw) continue;
      // (QA: its keys are stored 'qa:…' and read back through the QA store without it.)
      const k = qa ? (raw.startsWith(QA_PREFIX) ? raw.slice(QA_PREFIX.length) : null) : raw.startsWith(QA_PREFIX) ? null : raw;
      if (k && ofCourse(k)) names.push(k);
    }
    const keys: Record<string, string> = {};
    for (const k of names) {
      const v = ls.getItem(k);
      if (v !== null) keys[k] = v;
    }
    let archive: unknown = [];
    try {
      archive = JSON.parse(ls.getItem(ARCHIVE_KEY) ?? '[]');
    } catch {
      archive = [];
    }
    const list = Array.isArray(archive) ? archive : [];
    list.push({ at: Date.now(), keys });
    ls.setItem(ARCHIVE_KEY, JSON.stringify(list));
    for (const k of names) ls.removeItem(k);
  } catch {
    /* storage blocked: nothing was kept, nothing changes */
    return;
  }
  // The course's address without a 절 (?course · ?qa kept): the intro, then the list from 1-1.
  const q = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const k of ['course', 'qa']) {
    const v = q.get(k);
    if (v) keep.set(k, v);
  }
  window.location.href = window.location.pathname + (keep.toString() ? `?${keep}` : '');
}
