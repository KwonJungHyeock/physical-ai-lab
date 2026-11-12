/**
 * 입문 과정의 새 절 (장별 가이드라인 v1): what each 절 built for the course asks, step by step — the
 * '지금 할 일' sentence (it names the button), where to press (a CSS selector on the screen, the one
 * place lit), and the values its start and its check use. The screens (Console · CourseStepPanel)
 * read these; the checks are done there, from the arm and the run. No React.
 *
 * The values marked 제안값 are the guideline's proposals: kept as given until confirmed.
 */

export type CourseStepId = '1-1' | '1-2' | '1-3' | '2-1' | '2-3' | '2-4' | '3-1' | '3-2' | '3-5' | '4-2' | '4-3' | '4-4' | '5-4' | '5-5';

export interface CourseStepLine {
  text: string;
  /** The place to press now (none: on the 3D arm itself). */
  sel?: string;
}

/** 1-2: the parts to find on the arm, in order (the 조작판's own words), the tool tip last. */
export const ARM_PARTS = ['베이스 (J1)', '어깨 (J2)', '팔꿈치 (J3)', '손목 꺾기 (J4)', '손목 돌리기 (J5)', '손끝 돌리기 (J6)', '도구가 달린 손끝'] as const;

const RUN = '[data-step="run"]';
/** A saved pose's go key in the 자세 panel. */
const POSE_GO = '[data-pose][title$="움직여요"]';
/** 3장: the joints as the 조작판 names them, and their keys' names. */
const JOINT_NAMES = ['베이스', '어깨', '팔꿈치', '손목 꺾기', '손목 돌리기', '손끝 돌리기'] as const;
const JOINT_KEYS = ['베이스 (J1)', '어깨 (J2)', '팔꿈치 (J3)', '손목 꺾기 (J4)', '손목 돌리기 (J5)', '손끝 돌리기 (J6)'] as const;

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
  '2-1': [
    { text: '상자 속 구성품 5개를 하나씩 눌러 이름을 봐요', sel: '[data-step="kit"]' },
    // (Where to put each is the student's to find: no place is lit.)
    { text: '책상 위 빈 자리를 로봇 → 매트 → 카드 순서로 눌러 놓아요' },
  ],
  '2-3': [
    { text: '일자로 펴기 버튼을 눌러 영점 자세로 보내요', sel: '[data-step="zero"]' },
    { text: '기본 자세 버튼을 눌러 기본 자세로 보내요', sel: '[data-step="home"]' },
  ],
  '2-4': [
    { text: '도구의 달기 버튼을 눌러 펜을 달아요', sel: '[data-step="attach"]' },
    { text: '보정 카드의 펜 칸을 고쳐요', sel: '[data-step="pen"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러 점을 하나 찍어요', sel: RUN },
  ],
  // (3-1: the joint being moved is coloured in the scene; each line names its +5° key.)
  '3-1': JOINT_NAMES.map((n, i) => ({ text: `${n}의 +5° 버튼을 눌러 10° 움직여요`, sel: `[aria-label="${JOINT_KEYS[i]} +5°"]` })),
  '3-2': [
    { text: '베이스의 +5° 버튼을 눌러 +45°로 맞춰요', sel: '[aria-label="베이스 (J1) +5°"]' },
    { text: '어깨의 −5° 버튼을 눌러 −30°로 맞춰요', sel: '[aria-label="어깨 (J2) −5°"]' },
    { text: '팔꿈치의 +5° 버튼을 한계 경고가 나올 때까지 눌러요', sel: '[aria-label="팔꿈치 (J3) +5°"]' },
  ],
  '3-5': [
    { text: '속도 슬라이더를 30%로 맞춰요', sel: '[aria-label="속도 조절"]' },
    { text: '저장한 자세 버튼을 눌러 그 자세로 보내요', sel: POSE_GO },
    { text: '속도 슬라이더를 100%로 올리고 기본 자세 버튼을 눌러요', sel: '[aria-label="속도 조절"]' },
    { text: '저장한 자세 버튼을 다시 누르고, 움직이는 동안 정지 버튼을 눌러요', sel: POSE_GO },
  ],
  // 4장: on the 글씨 부스 mat, the card put away (courseDraw.ts).
  '4-2': [
    { text: "표시 옵션의 '도구 궤적'을 켜요", sel: '[aria-label="표시 옵션"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러 관절 이동으로 두 점 사이를 가요', sel: RUN },
    { text: "'직선 이동으로 쓰기' 스위치를 켜요", sel: '[data-step="linear"]' },
    { text: '▶ 시뮬레이션 버튼을 다시 눌러요', sel: RUN },
  ],
  '4-3': [
    { text: '꼭짓점 표에 세모의 세 점을 넣어요', sel: '[data-step="vertices"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러요', sel: RUN },
    { text: '꼭짓점 표에 네모의 네 점을 넣어요', sel: '[data-step="vertices"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러요', sel: RUN },
  ],
  '4-4': [
    { text: '원 칸에 중심 x 200 · y −10, 반지름 30을 넣어요', sel: '[data-step="circle"]' },
    { text: '점 개수를 8로 두고 ▶ 시뮬레이션 버튼을 눌러요', sel: RUN },
    { text: '점 개수를 24로 바꿔요', sel: '[data-step="count"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러요', sel: RUN },
  ],
  // 5-4: the 획 그리기 판 over the scene (확정 B안); ② with the board open.
  '5-4': [
    { text: '획 그리기 판에 내 글자를 한 획씩 그려요 (2~3자)', sel: '[data-step="board"]' },
    { text: '획마다 붙은 순서 번호를 보고, 틀린 획은 지우고 다시 그려요', sel: '[data-step="strokes"]' },
    { text: '▶ 시뮬레이션 버튼을 눌러요', sel: RUN },
  ],
  // 5-5 (선택): the real robot; [로봇 실행] is the app's own key to send the program (RunBar).
  '5-5': [
    { text: '연결 창에서 로봇을 연결해요', sel: '[data-step="connect"]' },
    { text: '실물 속도를 30% 이하로 맞춰요', sel: '[aria-label="실물 속도"]' },
    { text: '▶ 시뮬레이션으로 확인하고 로봇 실행 버튼으로 실물에 보내요', sel: '[aria-label="로봇에서 실행"]' },
    { text: '다 쓴 카드를 선생님께 보여 주고 확인을 받아요', sel: '[data-step="teacher"]' },
  ],
};

/** 5-2 in the course (가이드라인 v1): the 보정 card's x · y, then its pen, then ▶ — the 글씨 부스 step G2's own lines split in three. */
export const G2_COURSE: readonly { text: string; sel: string }[] = [
  { text: '매트 눈금을 읽어 보정 카드의 x · y 칸을 고쳐요', sel: 'aside [aria-label="x"]' },
  { text: '보정 카드의 펜 칸을 고쳐요', sel: 'aside [aria-label="펜"]' },
  { text: '▶ 시뮬레이션 버튼을 눌러요', sel: 'button[aria-label="시뮬레이션"]' },
];
/** 5-5: the most speed a program may be sent to the robot with, %. */
export const REAL_MAX_PCT = 30;
/** 5-4's card program, kept for 5-5 and the 5장 미션 (this browser). */
export const MY_CARD_KEY = 'life-course-my-card';

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

/** 2-3: neither 영점 nor 기본 자세 (제안값), °. */
export const PREP_POSE = [30, 20, -40, -20, 0, 0] as const;
/** 2-3: how close each joint has to come to 0° or the 기본 자세, °. */
export const POSE_TOL_DEG = 2;

/** 2-4: the pen's height as it starts (above the paper: no dot), mm; the dot at the card's middle (robot mm). */
export const PEN_START_MM = 5;
export const DOT_AT = { x: 210, y: 0 } as const;
/** 2-4: the pen moves to its height from this far above the paper, and back, mm. */
export const DOT_ABOVE_MM = 20;
/** 2-4: a dot is ink within this far of DOT_AT, mm (the pen draws at tip z ≤ 0.8 mm: sim.ts). */
export const DOT_NEAR_MM = 3;

/* --- 3장 관절 제어 --------------------------------------------------------------------- */

/** 3-1: how far each joint has to turn from where its step started, ° (either way). */
export const TURN_DEG = 10;
/** 3-2: the targets (① 베이스, ② 어깨), the tolerance, and the pose the arm takes itself to for ③ (팔꿈치 +120°: six presses from its +150° limit). */
export const AIM = { base: 45, shoulder: -30, tol: 2 } as const;
export const LIMIT_POSE = [45, -30, 120, 0, 0, 0] as const;
/** 3-5: the slow and the fast speeds (%), and the pose put in when none is saved (제안값). */
export const SLOW_PCT = 30;
export const FAST_PCT = 90;
export const PRACTICE_POSE = { name: '연습 자세', angles: [60, 20, -60, -30, 0, 0] } as const;
