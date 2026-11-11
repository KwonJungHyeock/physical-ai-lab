/**
 * 입문 과정의 장별 수행평가 (장별 가이드라인 v1): O · X 5문항 (the questions are in the 교안; the app has
 * their numbers and O · X only) and a mission. A mission whose pictures or scene are not here yet is
 * 준비 중: the O · X still count, and no 상 · 중 · 하 is given without the mission (never a 하).
 * No React.
 */

export type OX = 'O' | 'X';

export interface ChapterTest {
  chapter: number;
  answers: readonly [OX, OX, OX, OX, OX];
  mission: {
    /** The one line shown (no number badges, no steps, in a 수행평가). */
    text: string;
    /** Its pictures or scene are in the app (else 준비 중). */
    ready: boolean;
  };
}

export const CHAPTER_TESTS: Record<number, ChapterTest> = {
  1: {
    chapter: 1,
    answers: ['O', 'X', 'O', 'X', 'O'],
    // The six photos are asset slots; the team sends which photos (until then 준비 중).
    mission: { text: '사진 6장 중 협동로봇을 모두 골라 누르고 확인을 눌러요', ready: false },
  },
};

/** What a student did in a chapter's 수행평가 (kept in this browser). */
export interface TestResult {
  chosen: (OX | null)[];
  /** Right of 5 (once all five are answered and 확인 pressed). */
  right: number | null;
  /** The mission passed (null: not taken, or 준비 중). */
  mission: boolean | null;
  at: number;
}

export const TESTS_KEY = 'life-course-tests';

export function loadTests(read: (k: string) => string | null): Record<string, TestResult> {
  try {
    const o = JSON.parse(read(TESTS_KEY) ?? '{}') as Record<string, TestResult>;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export const gradeOX = (t: ChapterTest, chosen: readonly (OX | null)[]) => chosen.reduce((n, c, i) => n + (c === t.answers[i] ? 1 : 0), 0);
