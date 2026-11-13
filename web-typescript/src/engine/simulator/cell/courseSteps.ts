/**
 * 입문 과정의 새 절 (장별 가이드라인 v1): what each 절 built for the course asks, step by step — the
 * '지금 할 일' sentence (it names the button), where to press (a CSS selector on the screen, the one
 * place lit), and the values its start and its check use. The screens (Console · CourseStepPanel)
 * read these; the checks are done there, from the arm and the run. No React.
 *
 * The values marked 제안값 are the guideline's proposals: kept as given until confirmed.
 */

import { fromOldNumber } from './course';
import { stepText as T } from './courseText';

export type CourseStepId = '1-1' | '1-2' | '1-3' | '2-1' | '2-2' | '2-3' | '3-1' | '3-2' | '3-4' | '4-2' | '4-3' | '4-4' | '5-4' | '5-5';

export interface CourseStepLine {
  text: string;
  /** The place to press now (none: on the 3D arm itself). */
  sel?: string;
}

/** 1-2: the parts to find on the arm, in order (the 조작판's own words), the tool tip last. */
export const ARM_PARTS = ['베이스(J1)', '어깨(J2)', '팔꿈치(J3)', '손목 꺾기(J4)', '손목 돌리기(J5)', '손끝 돌리기(J6)', '손끝'] as const;

const RUN = '[data-step="run"]';
/** A saved pose's go key in the 자세 panel. */
const POSE_GO = '[data-pose][title$="움직여요"]';
/** 3장: the joints as the 조작판 names them, and their keys' names. */
const JOINT_NAMES = ['베이스', '어깨', '팔꿈치', '손목 꺾기', '손목 돌리기', '손끝 돌리기'] as const;
const JOINT_KEYS = ['베이스(J1)', '어깨(J2)', '팔꿈치(J3)', '손목 꺾기(J4)', '손목 돌리기(J5)', '손끝 돌리기(J6)'] as const;

export const COURSE_STEPS: Record<CourseStepId, readonly CourseStepLine[]> = {
  '1-1': [
    { text: T('1-1', 0), sel: RUN },
    { text: T('1-1', 1), sel: '[data-step="hand-in"]' },
    { text: T('1-1', 2), sel: '[data-step="hand-out"]' },
  ],
  '1-2': [{ text: T('1-2', 0) }, { text: T('1-2', 1) }, { text: T('1-2', 2) }, { text: T('1-2', 3) }, { text: T('1-2', 4) }, { text: T('1-2', 5) }, { text: T('1-2', 6) }],
  '1-3': [
    { text: T('1-3', 0), sel: '[data-step="range"]' },
    { text: T('1-3', 1), sel: RUN },
    { text: T('1-3', 2), sel: '[data-step="stop"]' },
  ],
  '2-1': [
    { text: T('2-1', 0), sel: '[data-step="kit"]' },
    // (Where to put each is the student's to find: no place is lit.)
    { text: T('2-1', 1) },
  ],
  '2-2': [
    { text: T('2-2', 0), sel: '[data-step="zero"]' },
    { text: T('2-2', 1), sel: '[data-step="home"]' },
  ],
  '2-3': [
    { text: T('2-3', 0), sel: '[data-step="attach"]' },
    { text: T('2-3', 1), sel: '[data-step="pen"]' },
    { text: T('2-3', 2), sel: RUN },
  ],
  // (3-1: the joint being moved is coloured in the scene; each line names its +5° key.)
  '3-1': JOINT_NAMES.map((_, i) => ({ text: T('3-1', i), sel: `[aria-label="${JOINT_KEYS[i]} +5°"]` })),
  '3-2': [
    { text: T('3-2', 0), sel: '[aria-label="베이스(J1) +5°"]' },
    { text: T('3-2', 1), sel: '[aria-label="어깨(J2) −5°"]' },
    { text: T('3-2', 2), sel: '[aria-label="팔꿈치(J3) +5°"]' },
  ],
  '3-4': [
    { text: T('3-4', 0), sel: '[aria-label="속도 조절"]' },
    { text: T('3-4', 1), sel: POSE_GO },
    { text: T('3-4', 2), sel: '[aria-label="속도 조절"]' },
    { text: T('3-4', 3), sel: POSE_GO },
  ],
  // 4장: on the 글씨 부스 mat, the card put away (courseDraw.ts).
  '4-2': [
    { text: T('4-2', 0), sel: '[aria-label="표시 옵션"]' },
    { text: T('4-2', 1), sel: RUN },
    { text: T('4-2', 2), sel: '[data-step="linear"]' },
    { text: T('4-2', 3), sel: RUN },
  ],
  '4-3': [
    { text: T('4-3', 0), sel: '[data-step="vertices"]' },
    { text: T('4-3', 1), sel: RUN },
    { text: T('4-3', 2), sel: '[data-step="vertices"]' },
    { text: T('4-3', 3), sel: RUN },
  ],
  '4-4': [
    { text: T('4-4', 0), sel: '[data-step="circle"]' },
    { text: T('4-4', 1), sel: RUN },
    { text: T('4-4', 2), sel: '[data-step="count"]' },
    { text: T('4-4', 3), sel: RUN },
  ],
  // 5-4: the 획 그리기 판 over the scene (확정 B안); ② with the board open.
  '5-4': [
    { text: T('5-4', 0), sel: '[data-step="board"]' },
    { text: T('5-4', 1), sel: '[data-step="strokes"]' },
    { text: T('5-4', 2), sel: RUN },
  ],
  // 5-5 (선택): the real robot; [로봇 실행] is the app's own key to send the program (RunBar).
  '5-5': [
    { text: T('5-5', 0), sel: '[data-step="connect"]' },
    { text: T('5-5', 1), sel: '[aria-label="실물 속도"]' },
    { text: T('5-5', 2), sel: '[aria-label="로봇에서 실행"]' },
    { text: T('5-5', 3), sel: '[data-step="teacher"]' },
  ],
};

/** 5-2 in the course (가이드라인 v1): the 보정 card's x · y, then its pen, then ▶ — the 글씨 부스 step G2's own lines split in three. */
export const G2_COURSE: readonly { text: string; sel: string }[] = [
  { text: T('5-2', 0), sel: 'aside label:has(> [aria-label="x"])' },
  { text: T('5-2', 1), sel: 'aside label:has(> [aria-label="펜"])' },
  { text: T('5-2', 2), sel: 'button[aria-label="시뮬레이션"]' },
];
/** 5-5: the most speed a program may be sent to the robot with, %. */
export const REAL_MAX_PCT = 30;
/** 5-4's card program, kept for 5-5 and the 5장 미션 (this browser). */
export const MY_CARD_KEY = 'life-course-my-card';

/** 6장 마무리: the 후기 and whether the one sheet was saved (this browser only; never the name or the class). */
export const REVIEW_KEY = 'life-course-review';

export const isCourseStep = (id: string): id is CourseStepId => id in COURSE_STEPS;

/** 1-1: the hand slows the arm to a stop over this long, s (제안값). */
export const HAND_SLOW_S = 1;
/** 1-1 장면 보기: the hand comes once the pen has written a little, and stays this long, s. */
export const HAND_SCENE = { hold: 3 } as const;
/** 1-2: a joint found turns this far each way once, °. */
export const FOUND_SWING_DEG = 10;
/** 1-3: the motion to stop — 베이스 (J1) only, to this far and back, this many times (제안값). */
export const SWING = { joint: 0, deg: 90, times: 3 } as const;

/** The course's own 절 done (this browser): { '1-2': true }, by today's numbers (the table's numbering 2). */
export const STEPS_KEY = 'life-course-steps-2';
/** The same record under the old numbers (numbering 1): read through fromOldNumber, never removed. */
export const STEPS_KEY_OLD = 'life-course-steps';

/**
 * The 절 done, read from this browser: today's record, or — none yet — the old one with each number
 * turned into today's (수정 지시서 v3 파트 8-8; `keep` writes it under STEPS_KEY, the old record stays).
 */
export function loadSteps(get: (k: string) => string | null, keep?: (k: string, v: string) => void): Record<string, boolean> {
  const read = (k: string): Record<string, boolean> | null => {
    try {
      const v: unknown = JSON.parse(get(k) ?? 'null');
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, boolean>) : null;
    } catch {
      return null;
    }
  };
  const now = read(STEPS_KEY);
  if (now) return now;
  const old = read(STEPS_KEY_OLD);
  if (!old) return {};
  const next: Record<string, boolean> = {};
  for (const [id, done] of Object.entries(old)) if (done === true) next[fromOldNumber(id)] = true;
  keep?.(STEPS_KEY, JSON.stringify(next));
  return next;
}

/**
 * 1-2: the view of the arm standing straight up (robot mm): the whole arm about 74 % of the scene's
 * height, from the customer's side and high enough that the desk fills the bottom (courseStage.ts).
 */
export const PICK_VIEW = { eye: [228, -553, 803] as const, target: [100, 0, 250] as const };

/* --- 2장 로봇 준비하기 ------------------------------------------------------------------- */

/** 2-1: what is in the box, in the order shown, and each one's picture (an asset slot, /course/assets/<id>.png). */
export const KIT_PARTS = [
  { name: '로봇', id: 'part-robot' },
  { name: '매트', id: 'part-mat' },
  { name: '펜', id: 'part-pen' },
  { name: '카드', id: 'part-card' },
  { name: '케이블', id: 'part-cable' },
] as const;

/** 2-1: the places on the desk, in the order they are put down (robot mm; fixed: the robot's base on its plate at (0, 0), the mat, the card's usual corner (150, −40)). */
export const DESK_PLACES = [
  { name: '로봇', x0: -85, x1: 85, y0: -85, y1: 85 },
  { name: '매트', x0: 110, x1: 300, y0: -90, y1: 70 },
  { name: '카드', x0: 150, x1: 270, y0: -40, y1: 40 },
] as const;

/** 2-2: neither 영점 nor 기본 자세 (제안값), °. */
export const PREP_POSE = [30, 20, -40, -20, 0, 0] as const;
/** 2-2: how close each joint has to come to 0° or the 기본 자세, °. */
export const POSE_TOL_DEG = 2;

/** 2-3: the pen's height as it starts (above the paper: no dot), mm; the dot at the card's middle (robot mm). */
export const PEN_START_MM = 5;
export const DOT_AT = { x: 210, y: 0 } as const;
/** 2-3: the pen moves to its height from this far above the paper, and back, mm. */
export const DOT_ABOVE_MM = 20;
/** 2-3: a dot is ink within this far of DOT_AT, mm (the pen draws at tip z ≤ 0.8 mm: sim.ts). */
export const DOT_NEAR_MM = 3;

/* --- 3장 관절 제어 --------------------------------------------------------------------- */

/** 3-1: how far each joint has to turn from where its step started, ° (either way). */
export const TURN_DEG = 10;
/** 3-2: the targets (① 베이스, ② 어깨), the tolerance, and the pose the arm takes itself to for ③ (팔꿈치 +120°: six presses from its +150° limit). */
export const AIM = { base: 45, shoulder: -30, tol: 2 } as const;
export const LIMIT_POSE = [45, -30, 120, 0, 0, 0] as const;
/** 3-4: the slow and the fast speeds (%), and the pose put in when none is saved (제안값). */
export const SLOW_PCT = 30;
export const FAST_PCT = 90;
export const PRACTICE_POSE = { name: '연습 자세', angles: [60, 20, -60, -30, 0, 0] } as const;
