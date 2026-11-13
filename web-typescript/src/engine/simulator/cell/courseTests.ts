/**
 * 입문 과정의 장별 수행평가 (장별 가이드라인 v1): O · X 5문항 (the questions are in the 교안; the app has
 * their numbers and O · X only) and a mission. A mission whose pictures or scene are not here yet is
 * 준비 중: the O · X still count, and no 상 · 중 · 하 is given without the mission (never a 하).
 * No React.
 */

import { testText } from './courseText';

export type OX = 'O' | 'X';

/** What a scene mission watches for (2장: the arm at 0°, at the 기본 자세, the pen on, a dot made). */
export type MissionStep = 'zero' | 'home' | 'pen' | 'dot';

/** The steps done in order: those seen, first time each, against the order asked. */
export const inOrder = (want: readonly MissionStep[], seen: readonly MissionStep[]) => want.length === seen.length && want.every((w, i) => seen[i] === w);

export interface ChapterTest {
  chapter: number;
  answers: readonly [OX, OX, OX, OX, OX];
  mission: {
    /** The one line shown (no number badges, no steps, in a 수행평가). */
    text: string;
    /** Its pictures or scene are in the app (else 준비 중). */
    ready: boolean;
    /** A mission done in the scene: what has to happen, in this order. */
    steps?: readonly MissionStep[];
    /** A mission done in the scene: the pose to copy (a see-through arm shows it) and how close each joint has to be, °. */
    pose?: readonly number[];
    tol?: number;
    /** A mission done on the mat: the star drawn in one stroke from the vertex table (courseDraw.ts STAR). */
    star?: boolean;
    /** 5장: passed by what was done before — 5-5 with the teacher's check (실물), else 5-4 passed (시뮬레이션). */
    card?: boolean;
    /** Said when a try did not pass. */
    failText?: string;
  };
}

/** The chapter's O · X answers as the 문구 파일 has them (courseText.ts). */
const OX5 = (n: number) => testText(n).answers as unknown as ChapterTest['answers'];

/** The answers, the mission's sentence and its failure line are in the 문구 파일 (public/course/mycobot-280-1.text.json). */
export const CHAPTER_TESTS: Record<number, ChapterTest> = {
  1: {
    chapter: 1,
    answers: OX5(1),
    // The six photos are asset slots; the team sends which photos (until then 준비 중).
    mission: { text: testText(1).mission, ready: false },
  },
  2: {
    chapter: 2,
    answers: OX5(2),
    // In the scene: 2-2's pose, no tool, the pen 5 mm up — the four in this order (judged as in 2-2 · 2-3).
    mission: { text: testText(2).mission, ready: true, steps: ['zero', 'home', 'pen', 'dot'], failText: testText(2).fail },
  },
  3: {
    chapter: 3,
    answers: OX5(3),
    // From the 기본 자세 with the joint keys (5° steps reach it); judged on [확인].
    mission: { text: testText(3).mission, ready: true, pose: [30, 30, -60, -20, 0, 0], tol: 3, failText: testText(3).fail },
  },
  4: {
    chapter: 4,
    answers: OX5(4),
    // On the mat (the card put away), from an empty vertex table, straight moves, the pen at 0: the five corners (교안, in no order) joined skipping one.
    mission: { text: testText(4).mission, ready: true, star: true, failText: testText(4).fail },
  },
  5: {
    chapter: 5,
    answers: OX5(5),
    // One activity with 5-5: the real card checked by the teacher, or (no robot) 5-4 passed in the simulation.
    mission: { text: testText(5).mission, ready: true, card: true, failText: testText(5).fail },
  },
};

/** A scene mission may be tried twice (the second try counts as a pass too); the O · X keep their first answers. */
export const MISSION_TRIES = 2;

/** How the mission went, for the 기록 (none: not finished yet). */
export function missionWay(r: TestResult | undefined): '한 번에 통과' | '다시 해서 통과' | '통과 못 함' | null {
  if (!r || r.mission == null) return null;
  const tries = r.missionTries ?? 1;
  if (r.mission) return tries <= 1 ? '한 번에 통과' : '다시 해서 통과';
  return tries >= MISSION_TRIES ? '통과 못 함' : null;
}

/** What a student did in a chapter's 수행평가 (kept in this browser). */
export interface TestResult {
  chosen: (OX | null)[];
  /** Right of 5 (once all five are answered and 확인 pressed). */
  right: number | null;
  /** The mission passed (null: not taken, or 준비 중; false with a try left: may be tried again). */
  mission: boolean | null;
  /** Tries made at the mission (1 or 2). */
  missionTries?: number;
  /** 5장: how the card was made (실물 · 시뮬레이션). */
  missionBy?: 'real' | 'sim';
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
