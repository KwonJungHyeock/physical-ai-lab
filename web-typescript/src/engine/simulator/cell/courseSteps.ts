/**
 * 입문 과정의 새 절 (장별 가이드라인 v1): what each 절 built for the course asks, step by step — the
 * '지금 할 일' sentence (it names the button), where to press (a CSS selector on the screen, the one
 * place lit), and the values its start and its check use. The screens (Console · CourseStepPanel)
 * read these; the checks are done there, from the arm and the run. No React.
 *
 * The values marked 제안값 are the guideline's proposals: kept as given until confirmed.
 */

export type CourseStepId = '1-1' | '1-2' | '1-3';

export interface CourseStepLine {
  text: string;
  /** The place to press now (none: on the 3D arm itself). */
  sel?: string;
}

/** 1-2: the parts to find on the arm, in order (the 조작판's own words), the tool tip last. */
export const ARM_PARTS = ['베이스 (J1)', '어깨 (J2)', '팔꿈치 (J3)', '손목 꺾기 (J4)', '손목 돌리기 (J5)', '손끝 돌리기 (J6)', '도구가 달린 손끝'] as const;

const RUN = '[data-step="run"]';

export const COURSE_STEPS: Record<CourseStepId, readonly CourseStepLine[]> = {
  '1-1': [
    { text: '▶ 시뮬레이션 버튼을 눌러 로봇이 카드를 쓰게 해요', sel: RUN },
    { text: '로봇이 쓰는 동안 손 다가가기 버튼을 눌러요', sel: '[data-step="hand-in"]' },
    { text: '로봇이 멈춘 것을 보고 손 치우기 버튼을 눌러요', sel: '[data-step="hand-out"]' },
  ],
  '1-2': [
    { text: '베이스(J1) 관절을 찾아 눌러요' },
    { text: '어깨(J2) 관절을 찾아 눌러요' },
    { text: '팔꿈치(J3) 관절을 찾아 눌러요' },
    { text: '손목 꺾기(J4) 관절을 찾아 눌러요' },
    { text: '손목 돌리기(J5) 관절을 찾아 눌러요' },
    { text: '손끝 돌리기(J6) 관절을 찾아 눌러요' },
    { text: '도구가 달린 손끝을 찾아 눌러요' },
  ],
  '1-3': [
    { text: '작업 범위 보기 스위치를 켜요', sel: '[data-step="range"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러 로봇을 움직여요', sel: RUN },
    { text: '로봇이 움직이는 동안 정지 버튼을 눌러요', sel: '[data-step="stop"]' },
  ],
};

export const isCourseStep = (id: string): id is CourseStepId => id in COURSE_STEPS;

/** 1-1: the hand slows the arm to a stop over this long, s (제안값). */
export const HAND_SLOW_S = 1;
/** 1-1 장면 보기: the hand comes once the pen has written a little, and stays this long, s. */
export const HAND_SCENE = { hold: 3 } as const;
/** 1-2: a joint found turns this far each way once, °. */
export const FOUND_SWING_DEG = 10;
/** 1-3: the motion to stop — 베이스 (J1) only, to this far and back, this many times (제안값). */
export const SWING = { joint: 0, deg: 90, times: 3 } as const;

/** The course's own 절 done (this browser): { '1-2': true }. */
export const STEPS_KEY = 'life-course-steps';

/** 1-2: the view of the arm standing straight up (robot mm): the whole arm about 70 % of the scene's height. */
export const PICK_VIEW = { eye: [820, -820, 330] as const, target: [0, 0, 225] as const };
