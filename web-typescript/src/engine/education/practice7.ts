/**
 * 로봇 실습 7: the seven acceptance checks (검수 1~7) as seven easy practices for students and
 * teachers new to robotics. Each unit is the same short path: 알아보기 (one line, one everyday
 * comparison, where real robots do it) → 따라 하기 (big buttons, in the 3D view) → 문제 (two quick
 * questions) → 실물로 (the same on the connected robot, with what was measured) → 결과.
 *
 * The motions are planned here (no React): every pose is solved with the tool held as the program
 * says and checked against the table before the 3D view or the robot gets it, so the test can prove
 * that nothing a student presses can send the arm into the kit.
 */

import { poseContact, type Box } from '../physics/collide';
import type { ChainSegment } from '../robot/kinematics';
import { solveToolPose, STRAIGHT_DOWN } from '../robot/tool';
import { ABOVE_MM, BINS, BLOCK_MM, BLOCK_START, COLOR_TO_BIN, COLORS, DROP_CLEARANCE_MM, HAND_PHOTO_DEG, HOME_DEG, type ColorName } from '../simulator/board';
import { tcpFor, type EffectorId } from '../simulator/effectors';
import { CHECKS } from '../simulator/modules';
import type { RobotAction } from '../simulator/sim';

export type UnitId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const UNIT_IDS: readonly UnitId[] = [1, 2, 3, 4, 5, 6, 7];

/** The five parts of every unit. Each has a colour for its small marker (the part tabs, the line beside its page),
 * so a student can tell them apart without the panel itself turning colourful. */
export type Part = 'look' | 'do' | 'quiz' | 'real' | 'done';
export const PARTS: readonly { id: Part; name: string; color: string }[] = [
  { id: 'look', name: '알아보기', color: '#0284c7' },
  { id: 'do', name: '따라 하기', color: '#16a34a' },
  { id: 'quiz', name: '문제', color: '#ea580c' },
  { id: 'real', name: '실물로', color: '#7c3aed' },
  { id: 'done', name: '결과', color: '#ca8a04' },
];

export interface Quiz {
  q: string;
  /** Two options for an O/X question, three for a choice. */
  options: readonly string[];
  answer: number;
  /** Shown after the answer, right or wrong: why. */
  why: string;
}

export interface Step {
  id: string;
  /** The button's words. */
  label: string;
  /** One line under it. */
  hint: string;
}

export interface Unit {
  id: UnitId;
  /** The acceptance check it shows (검수 번호), the same number. */
  check: UnitId;
  title: string;
  icon: string;
  /** 알아보기: what it is in one sentence, an everyday comparison, and where real robots do it. */
  about: string;
  like: string;
  site: string;
  steps: readonly Step[];
  quiz: readonly [Quiz, Quiz];
  /** 실물로: what the robot does, what to get ready, what is recorded. */
  real: { does: string; ready: string; records: string };
  /** For the teacher: one thing to say. */
  teacher: string;
}

export const UNITS: readonly Unit[] = [
  {
    id: 1,
    check: 1,
    title: CHECKS[0].title,
    icon: 'joints',
    about: '로봇팔에는 관절이 6개 있어요. 하나씩 움직여서 이름과 하는 일을 알아봐요.',
    like: '내 팔에는 어깨 · 팔꿈치 · 손목이 있어요. 로봇도 관절마다 도는 방향이 달라요.',
    site: '자동차 공장의 용접 로봇도 관절이 6개예요. 토치를 원하는 곳에 원하는 방향으로 대요.',
    steps: [
      { id: 'j1', label: 'J1 베이스', hint: '로봇 전체가 좌우로 돌아요' },
      { id: 'j2', label: 'J2 어깨', hint: '팔 전체가 앞뒤로 숙여져요' },
      { id: 'j3', label: 'J3 팔꿈치', hint: '아래팔이 접히고 펴져요' },
      { id: 'j4', label: 'J4 손목 1', hint: '손목이 위아래로 꺾여요' },
      { id: 'j5', label: 'J5 손목 2', hint: '손목이 좌우로 꺾여요' },
      { id: 'j6', label: 'J6 손목 3', hint: '손끝이 제자리에서 돌아요' },
    ],
    quiz: [
      { q: 'J1(베이스)을 돌리면 로봇팔 전체가 좌우로 돈다.', options: ['O', 'X'], answer: 0, why: 'J1 은 맨 아래 관절이에요. 그래서 그 위의 팔 전체가 함께 돌아요.' },
      { q: '이 로봇팔은 관절이 6개예요. 따로 움직이는 방향은 몇 가지일까요?', options: ['3가지', '6가지', '12가지'], answer: 1, why: '관절 하나가 한 가지 움직임을 맡아요. 관절 6개 = 6가지 (자유도 6).' },
    ],
    real: {
      does: '실물 로봇이 관절 6개를 차례로 움직여요. 한쪽 30°, 반대쪽 30° 갔다가 돌아와요.',
      ready: '로봇 둘레 50 cm 를 비워 주세요. 손은 로봇에서 떼요. 정지 버튼이 보이게 해요.',
      records: '관절마다 명령한 각도와 실제로 잰 각도의 차이',
    },
    teacher: '"내 팔의 관절을 세어 볼까요?" 하고 물어요. 학생이 자기 어깨 · 팔꿈치 · 손목을 움직여 봐요. 그다음 실습을 시작해요.',
  },
  {
    id: 2,
    check: 2,
    title: CHECKS[1].title,
    icon: 'flag',
    about: '같은 곳에 다섯 번 보내요. 매번 얼마나 똑같은 곳에 도착하는지 재요.',
    like: '다트를 다섯 번 던져 한 점에 모이면 잘 던진 거예요. 로봇도 도착점이 모일수록 정밀해요.',
    site: '공장 로봇은 같은 나사 구멍에 하루 수천 번 가요. 그래서 이 값(반복 정밀도)을 꼭 확인해요.',
    steps: [
      { id: 'show', label: '목표 점 보기', hint: '로봇이 갈 곳에 빨간 점이 생겨요' },
      { id: 'run', label: '5번 다녀오기', hint: '기본 자세 ↔ 목표 점을 다섯 번' },
    ],
    quiz: [
      { q: '로봇을 같은 곳에 여러 번 보낸다. 이때 도착점이 모이는 정도가 반복 정밀도다.', options: ['O', 'X'], answer: 0, why: '빠르기나 힘이 아니에요. 도착점이 얼마나 한곳에 모이는지예요.' },
      { q: '다섯 번 도착한 점이 흩어진 폭이 작을수록 로봇은?', options: ['더 정밀하다', '더 빠르다', '더 힘이 세다'], answer: 0, why: '흩어진 폭이 작다 = 매번 같은 곳에 간다 = 정밀하다.' },
    ],
    real: {
      does: '실물 로봇이 같은 점에 다섯 번 다녀와요. 도착할 때마다 각도를 재서 도착점을 계산해요.',
      ready: '로봇 앞 책상을 비워 주세요. 흡착 펌프는 끼운 그대로 둬도 괜찮아요.',
      records: '다섯 도착점이 흩어진 폭 (mm)',
    },
    teacher: '다트 비유를 먼저 말해요. 학생들이 결과의 "흩어진 폭"을 칠판에 적어요. 그리고 서로 비교해요.',
  },
  {
    id: 3,
    check: 3,
    title: CHECKS[2].title,
    icon: 'camera',
    about: '로봇의 눈인 카메라 두 대로 사진을 찍어요. 하나는 위에서 보는 키트 카메라예요. 다른 하나는 팔 끝의 손 카메라예요.',
    like: '키트 카메라는 교실 천장의 CCTV처럼 고정돼 있어요. 손 카메라는 들고 다니는 휴대폰 카메라 같아요.',
    site: '물류센터 로봇은 천장 카메라로 전체를 봐요. 집기 직전에는 손 카메라로 다시 확인해요.',
    steps: [
      { id: 'top', label: '키트 카메라로 찍기', hint: '위에서 작업판 전체를 봐요' },
      { id: 'hand', label: '손 카메라로 찍기', hint: '팔 끝에서 바로 아래를 봐요' },
    ],
    quiz: [
      { q: '손 카메라는 팔이 움직이면 보는 곳도 함께 바뀐다.', options: ['O', 'X'], answer: 0, why: '손 카메라는 팔 끝에 달려 있어요. 그래서 팔을 따라 보는 곳이 바뀌어요.' },
      { q: '고정된 키트 카메라의 좋은 점은?', options: ['항상 같은 곳을 같은 크기로 본다', '물건에 아주 가까이 갈 수 있다', '어두운 곳에서만 잘 보인다'], answer: 0, why: '움직이지 않으니 같은 자리를 늘 같은 크기로 봐요. 그래서 위치 계산이 쉬워요.' },
    ],
    real: {
      does: '로봇에 연결된 실제 카메라는 두 대예요. 카메라마다 사진을 한 장씩 받아와요.',
      ready: '키트 카메라 · 손 카메라의 USB 를 봐요. 둘 다 로봇에 꽂혀 있어야 해요.',
      records: '찍은 카메라 수와 사진 크기',
    },
    teacher: '두 사진을 나란히 띄워요. 그리고 "같은 블록이 두 사진에서 어떻게 다르게 보이나요?" 하고 물어요.',
  },
  {
    id: 4,
    check: 4,
    title: CHECKS[3].title,
    icon: 'search',
    about: '카메라로 블록을 찾아요. 로봇이 그 자리로 가서 집어 색깔별 상자에 넣어요.',
    like: '눈으로 컵을 보고 → 어디 있는지 알고 → 손을 뻗어요. 로봇도 같은 순서예요.',
    site: '택배 분류 센터 로봇은 카메라로 상자를 찾아요. 그리고 목적지별로 나눠요.',
    steps: [
      { id: 'find', label: '블록 찾기', hint: '카메라가 블록 4개의 색과 자리를 찾아요' },
      { id: 'sort', label: '색깔별로 넣기', hint: '찾은 자리로 가서 집고, 맞는 상자에 넣어요' },
    ],
    quiz: [
      { q: '카메라 사진 속 위치(픽셀)를 그대로 로봇에게 주면 된다.', options: ['O', 'X'], answer: 1, why: '사진 속 위치를 책상 위 좌표(mm)로 바꿔야 해요. 로봇은 이 좌표를 써요. 이렇게 바꾸는 것이 보정이에요.' },
      { q: '맞는 순서는?', options: ['찾기 → 좌표 바꾸기 → 움직이기', '움직이기 → 찾기 → 좌표 바꾸기', '좌표 바꾸기 → 움직이기 → 찾기'], answer: 0, why: '먼저 봐요(찾기). 다음에 로봇 말로 바꿔요(좌표). 그다음 움직여요.' },
    ],
    real: {
      does: '손 카메라로 실제 블록을 찾아 3D 화면에 옮겨요. 시뮬레이션으로 확인한 그대로 실물 로봇이 옮겨요.',
      ready: '흡착 펌프를 끼워요. 블록은 작업판 가운데에 놓아요. 분류함 4개는 키트 자리에 둬요.',
      records: '찾은 블록의 색과 자리 (mm), 옮긴 개수',
    },
    teacher: '먼저 "사진 속 블록과 진짜 블록 사이에 무엇이 필요할까?" 하고 물어요. 보정이 왜 필요한지 먼저 느끼게 해요.',
  },
  {
    id: 5,
    check: 5,
    title: CHECKS[4].title,
    icon: 'tool',
    about: '로봇 손(도구)은 바꿔 낄 수 있어요. 집게(그리퍼)로 한 번, 흡착 펌프로 한 번 옮겨요.',
    like: '숟가락과 젓가락을 음식에 따라 바꿔 쓰는 것과 같아요.',
    site: '자동차 공장 로봇은 작업마다 도구를 자동으로 바꿔 껴요. 용접기 · 집게 · 흡착판 같은 도구예요.',
    steps: [
      { id: 'grip', label: '그리퍼로 옮기기', hint: '집게로 노랑 블록을 집어 옮겨요' },
      { id: 'swap', label: '흡착 펌프로 바꾸기', hint: '도구를 바꿔 껴요' },
      { id: 'pump', label: '펌프로 옮기기', hint: '빨아들여 파랑 블록을 옮겨요' },
    ],
    quiz: [
      { q: '흡착 펌프는 윗면이 평평하고 매끈한 물건을 잘 집는다.', options: ['O', 'X'], answer: 0, why: '컵이 윗면에 딱 붙어야 공기를 빼서 들어 올릴 수 있어요.' },
      { q: '둥근 공을 집기에 더 알맞은 도구는?', options: ['그리퍼(집게)', '흡착 펌프', '펜'], answer: 0, why: '둥근 면에는 흡착 컵이 잘 붙지 않아요. 양쪽에서 잡는 집게가 좋아요.' },
    ],
    real: {
      does: '실물 그리퍼를 열고 닫아요. 그다음 바꿔 낀 흡착 펌프를 켜고 꺼요.',
      ready: '먼저 그리퍼를 끼워요. 안내가 나오면 흡착 펌프로 바꿔 껴요. 이때 전원은 그대로 둬요.',
      records: '그리퍼 열기 · 닫기, 펌프 켜기 · 끄기 결과',
    },
    teacher: '도구는 반드시 로봇이 멈춘 뒤에 바꿔 껴요. 학생 둘이 한 조가 되어 바꿔 끼우게 해요.',
  },
  {
    id: 6,
    check: 6,
    title: CHECKS[5].title,
    icon: 'brain',
    about: '로봇 안에는 작은 컴퓨터(RDK X5)가 있어요. 이 컴퓨터가 사진 속 물건을 알아보고 이름표를 붙여요. 인터넷 없이 해요.',
    like: '휴대폰 사진첩은 사진 속 얼굴을 알아봐요. 그것과 같은 원리예요.',
    site: '재활용 선별장 로봇은 페트병 · 캔을 알아봐요. 컨베이어 위에서 골라내요.',
    steps: [
      { id: 'shot', label: '사진 찍기', hint: '위에서 작업판을 찍어요' },
      { id: 'detect', label: '물건 알아보기', hint: '찾은 물건에 상자와 이름이 붙어요' },
    ],
    quiz: [
      { q: 'AI 물체 인식은 물건의 이름과 위치(상자)를 알려 준다.', options: ['O', 'X'], answer: 0, why: '무엇인지(이름)와 어디 있는지(상자)를 함께 알려 줘요.' },
      { q: '"로컬 실행" 은 무슨 뜻일까요?', options: ['로봇 안의 컴퓨터에서 바로 계산한다', '인터넷 서버에 보내서 계산한다', '사람이 대신 계산한다'], answer: 0, why: '로컬 = 그 자리. 인터넷이 없어도 로봇 안에서 바로 처리해요.' },
    ],
    real: {
      does: '로봇(RDK X5) 안에서 AI 모델(YOLOv5s)을 돌려요. 실제 카메라 사진 속 물건을 알아봐요.',
      ready: '카메라 앞에 컵 · 병 · 공 같은 물건을 놓아요. 처음 한 번은 모델을 읽느라 몇 초 걸려요.',
      records: '찾은 물건 이름 · 확률, 처리 시간 (ms)',
    },
    teacher: '시뮬레이션은 색으로 찾는 연습이에요. 실물은 진짜 AI 예요. 두 결과를 비교하게 해요.',
  },
  {
    id: 7,
    check: 7,
    title: CHECKS[6].title,
    icon: 'code',
    about: '버튼 대신 파이썬 코드로 로봇에게 명령해요. 코드 한 줄 = 동작 하나.',
    like: '리모컨 버튼 대신 문자로 명령하는 것과 같아요. 예를 들어 "앞으로 가" 라고 보내요.',
    site: '공장에는 로봇 · 컨베이어 · 카메라가 여럿 있어요. 이들은 ROS 2 와 API 로 서로 명령을 주고받아요.',
    steps: [
      { id: 'code', label: '코드 보기', hint: '로봇 인사 동작의 파이썬 코드' },
      { id: 'line', label: '한 줄씩 실행', hint: '코드 줄이 실행될 때 로봇이 움직여요' },
    ],
    quiz: [
      { q: '코드: sync_send_angles([0, 0, 0, 0, 0, 0], 30). 이 코드는 관절 6개를 모두 0° 로 보낸다.', options: ['O', 'X'], answer: 0, why: '괄호 안 6개 숫자가 관절 J1~J6 의 목표 각도예요.' },
      { q: '위 코드의 마지막 숫자 30 은?', options: ['속도', '시간 (초)', '관절 번호'], answer: 0, why: '움직이는 빠르기예요 (1~100).' },
    ],
    real: {
      does: '같은 코드를 실물 로봇에서 실행해요. 이때 pymycobot API 를 써요. ROS 2 는 시뮬레이터의 ROS 2 탭에서 이어서 해요.',
      ready: '로봇 둘레를 비워 주세요.',
      records: '실행한 명령 수와 결과',
    },
    teacher: '학생이 코드의 숫자 하나를 바꿔 보게 해요(예: 20 → -20). 먼저 결과를 예상하고, 그다음 실행해요.',
  },
];

export const UNIT_BY_ID: ReadonlyMap<UnitId, Unit> = new Map(UNITS.map((u) => [u.id, u]));

/* --- progress ------------------------------------------------------------------------------ */

export interface UnitProgress {
  /** Steps done (ids). */
  steps: string[];
  /** Quiz answers given (index per question). */
  quiz: (number | null)[];
  /** The last real-robot result. */
  real: { at: string; text: string } | null;
}

export const emptyProgress = (): UnitProgress => ({ steps: [], quiz: [null, null], real: null });

export function quizRight(u: Unit, p: UnitProgress): number {
  return u.quiz.filter((q, i) => p.quiz[i] === q.answer).length;
}

/** A unit is done when all its steps are done and both questions answered right; the real robot is a bonus star. */
export function unitDone(u: Unit, p: UnitProgress): boolean {
  return u.steps.every((s) => p.steps.includes(s.id)) && quizRight(u, p) === u.quiz.length;
}

/** Stars: 1 for the steps, 1 for the questions, 1 for the real robot. */
export function stars(u: Unit, p: UnitProgress): number {
  return (u.steps.every((s) => p.steps.includes(s.id)) ? 1 : 0) + (quizRight(u, p) === u.quiz.length ? 1 : 0) + (p.real ? 1 : 0);
}

/* --- motions ------------------------------------------------------------------------------- */

export type Mm = [number, number, number];

/** Arm upright with the forearm level: every joint can swing ±30° from here clear of the table. */
export const READY_DEG = [0, 0, -45, -45, 0, 0];
export const SWING_DEG = 30;

/** The poses of one joint's swing (unit 1): ready → +30° → −30° → ready. */
export function swingPoses(joint: number): number[][] {
  const at = (d: number) => READY_DEG.map((v, i) => (i === joint ? v + d : v));
  return [READY_DEG.slice(), at(SWING_DEG), at(-SWING_DEG), READY_DEG.slice()];
}

/** Unit 2's target: in front of the robot over the empty board, the pump pointing down. */
export const REPEAT_POINT: Mm = [180, -60, 90];
export const REPEAT_TIMES = 5;

/** The table, the kit's bins and a base for contact checks (mm). */
export function kitBoxes(): Box[] {
  return Object.values(BINS).map((b) => ({
    min: [b.outer.x - b.outer.sx / 2, b.outer.y - b.outer.sy / 2, 0] as [number, number, number],
    max: [b.outer.x + b.outer.sx / 2, b.outer.y + b.outer.sy / 2, b.rimZ] as [number, number, number],
    name: `분류함 ${b.name}`,
  }));
}

/**
 * Joint angles that put `tool`'s point at `p`, pointing down (straight down first, else turned or
 * tilted a little, as the console's programs do near the robot), clear of the table and bins; null if not.
 */
export function poseFor(chain: readonly ChainSegment[], tool: EffectorId, p: Mm, seed: readonly number[] = HOME_DEG, boxes: readonly Box[] = kitBoxes()): number[] | null {
  const tcpMm = tcpFor(tool, false);
  const straight = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm, orientation: STRAIGHT_DOWN, toleranceMm: 1 });
  const r = straight.converged ? straight : solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm, toleranceMm: 1 });
  if (!r.converged) return null;
  // The tool may touch the block it picks (that is the point); the arm itself must stay clear.
  return poseContact(chain, r.anglesDeg, boxes, 0) ? null : r.anglesDeg;
}

/** Unit 2: the home pose and the target pose. */
export function repeatPoses(chain: readonly ChainSegment[]): { home: number[]; at: number[] } | null {
  const at = poseFor(chain, 'pump', REPEAT_POINT);
  return at ? { home: HOME_DEG.slice(), at } : null;
}

export interface Move {
  /** Where the arm goes (degrees), and what the tool does once there. */
  angles: number[];
  tool?: 'on' | 'off';
  /** The block it carries from this pose on (null: none), for the 3D view. */
  carry?: ColorName | null;
  /** What to show while getting there. */
  say: string;
}

/**
 * One pick and place: above the block → down to it → tool on → up → above the place → down → tool
 * off → up. `to`: a bin (sorting, dropped from above its rim) or a spot on the board (set down).
 */
export function pickPlace(chain: readonly ChainSegment[], tool: 'pump' | 'adaptive', color: ColorName, from: { x: number; y: number }, to: { bin: true; x: number; y: number } | { bin: false; x: number; y: number }): Move[] | null {
  // The pump takes the block by its top, the gripper round its middle.
  const grabZ = tool === 'pump' ? BLOCK_MM : BLOCK_MM / 2;
  const aboveZ = BLOCK_MM + ABOVE_MM;
  const placeZ = to.bin ? Math.max(...Object.values(BINS).map((b) => b.rimZ)) + DROP_CLEARANCE_MM + BLOCK_MM : grabZ;
  const carryZ = Math.max(aboveZ, placeZ + 20);
  const seq: { p: Mm; tool?: 'on' | 'off'; carry: ColorName | null; say: string; touch: boolean }[] = [
    { p: [from.x, from.y, aboveZ], carry: null, say: `${color} 블록 위로`, touch: false },
    { p: [from.x, from.y, grabZ], carry: null, say: '내려가서', touch: true },
    { p: [from.x, from.y, grabZ], tool: 'on', carry: color, say: tool === 'pump' ? '흡착!' : '집기!', touch: true },
    { p: [from.x, from.y, carryZ], carry: color, say: '들어 올리고', touch: false },
    { p: [to.x, to.y, carryZ], carry: color, say: to.bin ? '상자 위로' : '놓을 자리 위로', touch: false },
    { p: [to.x, to.y, placeZ], carry: color, say: '내려서', touch: !to.bin },
    { p: [to.x, to.y, placeZ], tool: 'off', carry: null, say: '놓기!', touch: !to.bin },
    { p: [to.x, to.y, carryZ], carry: null, say: '올라오기', touch: false },
  ];
  const out: Move[] = [];
  let seed: readonly number[] = HOME_DEG;
  const boxes = kitBoxes();
  for (const s of seq) {
    const q = poseFor(chain, tool, s.p, seed, boxes);
    if (!q) return null;
    out.push({ angles: q, tool: s.tool, carry: s.carry, say: s.say });
    seed = q;
  }
  return out;
}

/** Unit 4: the blocks found (all four by default) to their bins (the kit's official colour → bin), from where they are. */
export function sortPlan(chain: readonly ChainSegment[], where: Partial<Record<ColorName, { x: number; y: number }>> = BLOCK_START): Move[] | null {
  const out: Move[] = [];
  for (const c of COLORS) {
    if (!where[c.name]) continue;
    const b = BINS[COLOR_TO_BIN[c.name]];
    const m = pickPlace(chain, 'pump', c.name, where[c.name]!, { bin: true, x: b.drop.x, y: b.drop.y });
    if (!m) return null;
    out.push(...m);
  }
  if (!out.length) return null;
  out.push({ angles: HOME_DEG.slice(), carry: null, say: '기본 자세로' });
  return out;
}

/** Unit 5's two moves: the gripper takes yellow across the board, then the pump takes blue. */
export const TOOL_MOVES: readonly { tool: 'adaptive' | 'pump'; color: ColorName; to: { x: number; y: number } }[] = [
  { tool: 'adaptive', color: '노랑', to: { x: 135, y: 75 } },
  { tool: 'pump', color: '파랑', to: { x: 185, y: 75 } },
];

/** Moves → the robot's program (the same list the simulator played). */
export function toActions(moves: readonly Move[], tool: 'pump' | 'adaptive', speed = 25): RobotAction[] {
  const out: RobotAction[] = [];
  moves.forEach((m, i) => {
    out.push({ type: 'angles', angles: m.angles.slice(), speed, line: i + 1 });
    if (m.tool) out.push(tool === 'pump' ? { type: 'pump', on: m.tool === 'on', line: i + 1 } : { type: 'gripper', open: m.tool === 'off', line: i + 1 });
    if (m.tool) out.push({ type: 'wait', sec: 0.5, line: i + 1 });
  });
  return out;
}

/** Unit 3/4/6: the hand camera's photo pose (the official vision kit's), and the observation pose. */
export const PHOTO_DEG = HAND_PHOTO_DEG;
export { HOME_DEG };

/** Unit 7: a greeting — home, wave J1 twice, home — as code lines and the poses each line goes to. */
export const WAVE: readonly { line: string; angles: number[] }[] = [
  { line: 'mc.sync_send_angles([0, 0, 0, 0, 0, 0], 30)', angles: [0, 0, 0, 0, 0, 0] },
  { line: 'mc.sync_send_angles([20, 0, 0, 0, 0, 0], 30)', angles: [20, 0, 0, 0, 0, 0] },
  { line: 'mc.sync_send_angles([-20, 0, 0, 0, 0, 0], 30)', angles: [-20, 0, 0, 0, 0, 0] },
  { line: 'mc.sync_send_angles([0, 0, 0, 0, 0, 0], 30)', angles: [0, 0, 0, 0, 0, 0] },
];

/** Spread of arrival points (mm): the largest distance of any point from their mean. */
export function spreadMm(points: readonly Mm[]): number {
  if (!points.length) return 0;
  const m = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  return Math.max(...points.map((p) => Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2])));
}

/* --- unit 6 in the simulator: finding the coloured blocks in a picture ------------------------ */

/** A found blob: its colour name, its box in pixels, and how sure (the share of the box that is that colour). */
export interface Found {
  color: ColorName;
  box: { x0: number; y0: number; x1: number; y1: number };
  score: number;
}

/** Hue ranges (degrees) of the kit's four block colours, saturated and bright enough not to be the table or the bins. */
const HUES: readonly { color: ColorName; lo: number; hi: number }[] = [
  { color: '빨강', lo: 340, hi: 15 },
  { color: '노랑', lo: 40, hi: 70 },
  { color: '초록', lo: 85, hi: 165 },
  { color: '파랑', lo: 195, hi: 255 },
];

function hueOf(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx / 255 };
}

const inHue = (h: number, lo: number, hi: number) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);

/**
 * The simulator's stand-in for the AI sample: each block colour's pixels (RGBA, row by row), their
 * bounding box, and the share of the box they fill. The robot runs a real AI model (YOLOv5s) instead.
 */
export function findColours(data: ArrayLike<number>, width: number, height: number, minPixels = 12): Found[] {
  const acc = HUES.map(() => ({ n: 0, x0: width, y0: height, x1: -1, y1: -1 }));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const { h, s, v } = hueOf(data[i], data[i + 1], data[i + 2]);
      if (s < 0.45 || v < 0.25) continue;
      HUES.forEach((c, k) => {
        if (!inHue(h, c.lo, c.hi)) return;
        const a = acc[k];
        a.n += 1;
        a.x0 = Math.min(a.x0, x);
        a.y0 = Math.min(a.y0, y);
        a.x1 = Math.max(a.x1, x);
        a.y1 = Math.max(a.y1, y);
      });
    }
  return HUES.flatMap((c, k) => {
    const a = acc[k];
    if (a.n < minPixels) return [];
    const area = (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1);
    return [{ color: c.color, box: { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 }, score: Math.min(0.99, a.n / area) }];
  });
}
