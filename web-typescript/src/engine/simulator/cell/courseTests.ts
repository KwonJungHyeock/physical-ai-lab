/**
 * 입문 과정의 장별 수행평가 (장별 가이드라인 v1): O · X 5문항 (the questions are in the 교안; the app has
 * their numbers and O · X only) and a mission. A mission whose pictures or scene are not here yet is
 * 준비 중: the O · X still count, and no 상 · 중 · 하 is given without the mission (never a 하).
 * No React.
 */

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
    /** Said when a try did not pass. */
    failText?: string;
  };
}

export const CHAPTER_TESTS: Record<number, ChapterTest> = {
  1: {
    chapter: 1,
    answers: ['O', 'X', 'O', 'X', 'O'],
    // The six photos are asset slots; the team sends which photos (until then 준비 중).
    mission: { text: '사진 6장 중 협동로봇을 모두 골라 누르고 확인을 눌러요', ready: false },
  },
  2: {
    chapter: 2,
    answers: ['X', 'O', 'O', 'X', 'O'],
    // In the scene: 2-3's pose, no tool, the pen 5 mm up — the four in this order (judged as in 2-3 · 2-4).
    mission: { text: '영점 자세 → 기본 자세 → 펜 달기 → 점 찍기를 순서대로 해요', ready: true, steps: ['zero', 'home', 'pen', 'dot'], failText: '순서가 달랐어요' },
  },
  3: {
    chapter: 3,
    answers: ['O', 'O', 'X', 'O', 'X'],
    // From the 기본 자세 with the joint keys (5° steps reach it); judged on [확인].
    mission: { text: '반투명 로봇과 똑같은 자세를 관절 버튼으로 만들어요', ready: true, pose: [30, 30, -60, -20, 0, 0], tol: 3, failText: '자세가 목표와 달라요' },
  },
  4: {
    chapter: 4,
    answers: ['O', 'X', 'O', 'X', 'O'],
    // On the mat (the card put away), from an empty vertex table, straight moves, the pen at 0: the five corners (교안, in no order) joined skipping one.
    mission: { text: '꼭짓점 5개를 잇는 순서를 정해 표에 넣고 ▶ 시뮬레이션 버튼을 눌러요', ready: true, star: true, failText: '별이 아니에요' },
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
