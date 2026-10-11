/**
 * 산업단지 현장 실습 · 대학 과제 (Python으로 구현): one graded function per problem of the seven
 * site labs. Each task says what to compute and why (the problem's principle), gives a starter (the
 * function's name, arguments and units — never the working body), and 3 – 4 cases: the lab's own
 * situation first, then changed numbers.
 *
 * Every expected value is computed here from the lab's engine — its constants and its chain-free
 * functions (slotCentre, protectiveDistance, gripOf, parallaxFix, pickOrder, …) — so a task cannot
 * drift from what the simulator does. Inputs that come from the arm's kinematics (a reach, a
 * descent time, J1's inertia) are numbers as the screen shows them; tests/education/pytask-check.mts
 * checks them against the engine with the real arm, and runs a model solution
 * (pySolutions.ts, not shipped to the page) through Python to prove every task can be passed.
 *
 * The page runs the student's code in the Python worker (engine/python/client.ts gradePython) and
 * judges what came back with checkCall.
 */

import type { GradeCall, PyPlain } from '../../python/grade';
import { QUINTIC_PEAK_RATE } from '../../robot/motion';
import type { LabId } from '../park';
import { AI_DEFAULTS, AI_FIXES, AI_THINGS, CAMERA, DEMOS, TRIALS, officialRanges, parallaxFix, toPixel as aiPixel, toRobot as aiRobot, type HsvValues } from './ai';
import { BIO_DEFAULTS, BIO_FIXES, CENTRIFUGE, DST, J1_ERR_DEG, ROW, SRC, TUBE, type PathValues, type PoseValues } from './bio';
import { CAFE_DEFAULTS, CAFE_FIXES, BAR, CARE_J1_LIMIT, FRIDGE, HAND, J1_MAX_SPEED, PICKUP, SPILL_ACC, protectiveDistance, trapezoid, type CarryValues, type GuardValues } from './cafe';
import { BELT, BOX_B, BOX_C, CUP_R } from './cell';
import { ENERGY_DEFAULTS, ENERGY_FIXES, ENERGY_ITEMS, FULL_CAN, KINDS, SIZE, classify, fullArea, pickOrder, sideLimit, type Found, type Item, type Kind, type VisionValues } from './energy';
import { CAM, FARM_DEFAULTS, FARM_FIXES, FARM_TOMATOES, MARKER, OVERSHOOT_PER_SPEED, SAFE_SHARE, TOMATO, TRAY, gripOf, markerPixels, rgbToHsvDeg, toPixel as farmPixel, toRobot as farmRobot, type GripValues } from './farm';
import { FIRST_Z, HEAVY_G, MARK_OFF, PAL_HOME, PAL_MOVED, PBOX, REF_DEFAULT, REF_FIX, SLOT_OFF, STACK_DEFAULT, SUCTION_N, G, accLimit, placeZ, slotCentre } from './pallet';
import { P1_TARGET, P3_BOX, P3_DEFAULT, P3_PITCH_MM, P3_SENSOR_Y } from './problems';
import type { SiteProblem } from './siteText';

/** An argument as it goes to Python (JSON): a number, a string, or a list of them. */
export type PyArg = number | string | readonly PyArg[];
/** What the function should return: a number, a list of numbers (each within tol), a string, or None (null). */
export type PyExpect = number | readonly number[] | string | null;

export interface PyCase {
  /** What this case is, in a few words (the lab's situation, the fixed values, …). */
  note: string;
  args: readonly PyArg[];
  expected: PyExpect;
  /** A number within this of the expected one passes (lists: every item). */
  tol: number;
}

export interface PyTask {
  lab: LabId;
  prob: SiteProblem;
  title: string;
  /** What to compute and why, two or three short lines. */
  statement: readonly string[];
  /** The function the cases call. */
  fn: string;
  /** The editor's first code: signature, docstring with units, an empty body. */
  starter: string;
  cases: readonly PyCase[];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** A number as the screen shows it (an input copied from it), d decimals. */
const r = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/* --- 스마트 공장 ------------------------------------------------------------------------------- */

/** ①: J1 turns about the vertical axis through the base: the tip's (x, y) turns with it (Rz). */
const turnZ = (x: number, y: number, dq: number): [number, number] => [x * Math.cos(rad(dq)) - y * Math.sin(rad(dq)), x * Math.sin(rad(dq)) + y * Math.cos(rad(dq))];
/** ①: the work sheet's angles put the tip here, and the right J1 is this much less (problems.ts p1Live, p1Answer; checked with the arm). */
export const F1_SHEET_TIP = [205.3, 15.8] as const;
export const F1_J1_FIX = -12.2;
/** ②: how far the tool reaches at box C's top height (problems.ts reachAt, checked with the arm), mm. */
export const F2_REACH = 315;
/** ②: the third box's front face stops at the sensor: the farthest sensor whose box centre is still within reach. */
const maxSensorY = (reach: number, len: number) => Math.sqrt(reach * reach - BELT.x * BELT.x) - len / 2;
/** ③: the way down (s) for the fixed plan (joint move, speed 80) and for the starting one (linear, speed 30) (problems.ts p3Timing, checked with the arm). */
export const F3_DOWN = { fix: 0.31, start: 1.89 } as const;
/** ③: from the sensor seeing a box to it under the wait point, minus the way down; and the time between boxes (problems.ts p3Timing). */
const p3Plan = (belt: number, waitY: number, downS: number) => [(P3_SENSOR_Y + P3_BOX.size[1] / 2 - waitY) / belt - downS, P3_PITCH_MM / belt];

const FACTORY: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'factory',
    prob: 1,
    title: 'J1 회전으로 손끝 옮기기 (회전 행렬)',
    statement: [
      '순기구학은 관절마다 회전을 곱해 손끝을 구해요. 그 첫 단계가 J1(세로축) 회전 Rz예요.',
      '손끝 (x, y)에서 J1만 dq_deg 더 돌렸을 때 손끝의 새 (x, y)를 돌려주는 함수를 만드세요. 높이 z는 그대로예요.',
    ],
    fn: 'turn_j1',
    starter: `import math


def turn_j1(x, y, dq_deg):
    """J1만 dq_deg 더 돌렸을 때 손끝의 새 자리를 돌려줘요.

    x, y   : 지금 손끝 자리, mm (로봇 몸통 J1 축이 원점)
    dq_deg : J1을 더 돌린 각도, °  (+ 는 위에서 볼 때 시계 반대 방향)
    돌려줄 값: (새 x, 새 y), mm
    """
    # TODO: 각도를 라디안으로 바꾸고, 회전 행렬 Rz로 (x, y)를 돌려요.
    ...
`,
    cases: [
      { note: '상자 가운데에서 J1 1° (계산 칸)', args: [P1_TARGET[0], P1_TARGET[1], 1], expected: turnZ(P1_TARGET[0], P1_TARGET[1], 1), tol: 0.05 },
      { note: '지시서 손끝, J1만 정답 쪽으로', args: [...F1_SHEET_TIP, F1_J1_FIX], expected: turnZ(F1_SHEET_TIP[0], F1_SHEET_TIP[1], F1_J1_FIX), tol: 0.05 },
      { note: '앞쪽 150 mm에서 90°', args: [150, 0, 90], expected: turnZ(150, 0, 90), tol: 0.05 },
      { note: '(100, 100)에서 −45°', args: [100, 100, -45], expected: turnZ(100, 100, -45), tol: 0.05 },
    ],
  },
  2: {
    lab: 'factory',
    prob: 2,
    title: '닿는 거리로 센서 자리 정하기 (작업 공간)',
    statement: [
      `상자는 앞면이 센서에 닿아 서요. 그래서 상자 가운데 y = 센서 y + 상자 길이 ÷ 2, x는 벨트 가운데(${BELT.x} mm)예요.`,
      '몸통에서 상자 가운데까지 수평 거리 √(x² + y²)가 닿는 거리 이하가 되는, 가장 먼 센서 y를 돌려주세요.',
    ],
    fn: 'max_sensor_y',
    starter: `import math

BELT_X = ${BELT.x}   # 벨트 가운데의 x, mm


def max_sensor_y(reach_mm, box_len_mm):
    """상자 가운데가 닿는 거리 안에 들어오는 가장 먼 센서 자리 y를 돌려줘요.

    reach_mm   : 그 높이에서 팔이 닿는 거리 (J1 축에서 수평), mm
    box_len_mm : 벨트 방향 상자 길이, mm
    돌려줄 값  : 센서 y, mm
    """
    # TODO: √(BELT_X² + y²) = reach_mm 인 상자 가운데 y를 구하고, 센서 자리로 바꿔요.
    ...
`,
    cases: [
      { note: `상자 C, 닿는 거리 ${F2_REACH} mm`, args: [F2_REACH, BOX_C.size[1]], expected: maxSensorY(F2_REACH, BOX_C.size[1]), tol: 0.5 },
      { note: '상자 B (70 mm)', args: [F2_REACH, BOX_B.size[1]], expected: maxSensorY(F2_REACH, BOX_B.size[1]), tol: 0.5 },
      { note: '접근점처럼 더 높은 곳 (닿는 거리 280 mm)', args: [280, BOX_C.size[1]], expected: maxSensorY(280, BOX_C.size[1]), tol: 0.5 },
      { note: '닿는 거리 250 mm, 상자 60 mm', args: [250, 60], expected: maxSensorY(250, 60), tol: 0.5 },
    ],
  },
  3: {
    lab: 'factory',
    prob: 3,
    title: '움직이는 상자를 잡는 시간 계획',
    statement: [
      `센서(y ${P3_SENSOR_Y})가 상자를 보면, 상자 가운데는 (${P3_SENSOR_Y} + ${P3_BOX.size[1] / 2} − 대기 y) ÷ 벨트 속도 뒤에 대기 자리 아래에 와요.`,
      '팔이 그때 닿도록 출발 지연(= 상자가 오는 시간 − 내려가는 시간)과, 상자 간격 시간(상자 사이 거리 ÷ 벨트 속도)을 함께 돌려주세요.',
    ],
    fn: 'catch_plan',
    starter: `SENSOR_Y = ${P3_SENSOR_Y}    # 센서 자리 y, mm
HALF_LEN = ${P3_BOX.size[1] / 2}     # 상자 반 길이, mm
PITCH = ${P3_PITCH_MM}       # 상자 사이 거리, mm


def catch_plan(belt_mm_s, wait_y, down_s):
    """(출발 지연, 상자 간격 시간)을 돌려줘요.

    belt_mm_s : 벨트 속도, mm/s
    wait_y    : 팔이 기다리는 자리 y, mm
    down_s    : 대기 자리에서 상자 윗면까지 내려가는 시간, s
    돌려줄 값 : (출발 지연 s, 상자 간격 s)  — 지연이 음수면 팔이 늦어요
    """
    # TODO
    ...
`,
    cases: [
      { note: '고친 계획 (대기 y 40, 관절 이동 · 속도 80)', args: [120, 40, F3_DOWN.fix], expected: p3Plan(120, 40, F3_DOWN.fix), tol: 0.01 },
      { note: '처음 값 (대기 y −60, 직선 이동 · 속도 30)', args: [P3_DEFAULT.belt, P3_DEFAULT.waitY, F3_DOWN.start], expected: p3Plan(P3_DEFAULT.belt, P3_DEFAULT.waitY, F3_DOWN.start), tol: 0.01 },
      { note: '벨트 180 mm/s (대학 과제)', args: [180, 40, F3_DOWN.fix], expected: p3Plan(180, 40, F3_DOWN.fix), tol: 0.01 },
      { note: '벨트 60 mm/s, 대기 y 160', args: [60, 160, 0.5], expected: p3Plan(60, 160, 0.5), tol: 0.01 },
    ],
  },
};

/* --- 물류 센터 --------------------------------------------------------------------------------- */

/** ①: box k (1 – 12): its place's (x, y) on the pallet and the cup's let-go height for this pitch and gap. */
function placePoint(k: number, pitch: number, gap: number): number[] {
  const c = slotCentre(k - 1, PAL_HOME);
  return [c[0], c[1], placeZ({ pitch, gap }, Math.floor((k - 1) / SLOT_OFF.length))];
}
/** ②: the carry speed setting the box stays on at, for its weight and cup (F ∝ cup diameter²; acceleration ∝ speed²). */
function carrySpeed(massG: number, cupD: number, acc100: number): number {
  const a = cupD === 2 * CUP_R ? accLimit(massG) : (SUCTION_N * (cupD / (2 * CUP_R)) ** 2) / (massG / 1000) - G;
  return a <= 0 ? 0 : Math.min(100, 100 * Math.sqrt(a / acc100));
}
/** ②: the cup's largest acceleration carrying at speed 100 (measured on the screen's graph), m/s². */
export const L2_ACC100 = 7.3;
/** ③: a pallet place measured from the reference mark, turned by the pallet's angle. */
const fromMark = (k: number) => [SLOT_OFF[k][0] - MARK_OFF[0], SLOT_OFF[k][1] - MARK_OFF[1]];
const onPallet = (rx: number, ry: number, th: number, dx: number, dy: number) => {
  const [x, y] = turnZ(dx, dy, th);
  return [rx + x, ry + y];
};

const LOGISTICS: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'logistics',
    prob: 1,
    title: '12개 상자의 목표점 표',
    statement: [
      `k번째 상자(1 ~ 12)는 ${SLOT_OFF.length}개씩 한 층이에요. 층 = (k − 1) // 4, 자리 = (k − 1) % 4.`,
      '자리 표에서 (x, y)를, z = 1층 높이 + 층 × 층 간격 + 여유로 높이를 구해 (x, y, z)를 돌려주세요.',
    ],
    fn: 'place_point',
    starter: `Z1 = ${FIRST_Z}   # 1층 놓는 높이, mm
SLOTS = [${SLOT_OFF.map((_, j) => `(${slotCentre(j)[0]}, ${slotCentre(j)[1]})`).join(', ')}]   # 한 층의 네 자리 (x, y), mm


def place_point(k, pitch_mm, gap_mm):
    """k번째 상자(1 ~ 12)를 놓을 흡착 컵 자리 (x, y, z)를 돌려줘요.

    k        : 상자 번호, 1부터
    pitch_mm : 층 간격, mm (상자 높이와 같아야 해요)
    gap_mm   : 놓을 때 띄우는 여유, mm
    돌려줄 값: (x, y, z), mm
    """
    # TODO
    ...
`,
    cases: [
      { note: '2층 첫 상자, 고친 값 (간격 40, 여유 2)', args: [5, PBOX.h, 2], expected: placePoint(5, PBOX.h, 2), tol: 0.5 },
      { note: '2층 첫 상자, 처음 값 (간격 30, 여유 0)', args: [5, STACK_DEFAULT.pitch, STACK_DEFAULT.gap], expected: placePoint(5, STACK_DEFAULT.pitch, STACK_DEFAULT.gap), tol: 0.5 },
      { note: '마지막 상자 (12번)', args: [12, PBOX.h, 2], expected: placePoint(12, PBOX.h, 2), tol: 0.5 },
      { note: '상자 높이 50 mm, 7번', args: [7, 50, 0], expected: placePoint(7, 50, 0), tol: 0.5 },
    ],
  },
  2: {
    lab: 'logistics',
    prob: 2,
    title: '흡착 컵이 버티는 들고 이동 속도',
    statement: [
      `흡착 컵의 힘은 지름 ${2 * CUP_R} mm에서 ${SUCTION_N} N이고 지름의 제곱에 비례해요. 들어 올린 상자는 F ≥ m(g + a)일 때 붙어 있어요.`,
      `버티는 가속도 a를 구하고, 가속도는 속도 설정의 제곱에 비례하니 속도 설정 = 100 × √(a ÷ 속도 100의 가속도)로 바꿔 주세요. 100을 넘으면 100, 버티지 못하면(a ≤ 0) 0.`,
    ],
    fn: 'carry_speed',
    starter: `import math

G = ${G}            # 중력 가속도, m/s²
F20 = ${SUCTION_N}           # 지름 ${2 * CUP_R} mm 컵이 붙잡는 힘, N


def carry_speed(mass_g, cup_d_mm, acc100):
    """상자가 떨어지지 않는 가장 빠른 들고 이동 속도 설정(0 ~ 100)을 돌려줘요.

    mass_g   : 상자 무게, g
    cup_d_mm : 흡착 컵 지름, mm
    acc100   : 속도 100으로 옮길 때 손끝의 최대 가속도, m/s²
    돌려줄 값: 속도 설정 (0 ~ 100)
    """
    # TODO: 1) 컵의 힘  2) 버티는 가속도  3) 속도 설정
    ...
`,
    cases: [
      { note: `${HEAVY_G} g 상자, 지름 20 mm (계산 칸)`, args: [HEAVY_G, 2 * CUP_R, L2_ACC100], expected: carrySpeed(HEAVY_G, 2 * CUP_R, L2_ACC100), tol: 0.5 },
      { note: `가벼운 상자 ${PBOX.massG} g`, args: [PBOX.massG, 2 * CUP_R, L2_ACC100], expected: carrySpeed(PBOX.massG, 2 * CUP_R, L2_ACC100), tol: 0.5 },
      { note: '400 g, 지름 30 mm 컵', args: [400, 30, L2_ACC100], expected: carrySpeed(400, 30, L2_ACC100), tol: 0.5 },
      { note: '300 g, 지름 20 mm (들지 못함)', args: [300, 2 * CUP_R, L2_ACC100], expected: carrySpeed(300, 2 * CUP_R, L2_ACC100), tol: 0.5 },
    ],
  },
  3: {
    lab: 'logistics',
    prob: 3,
    title: '기준점과 회전으로 놓을 자리 구하기 (동차 변환)',
    statement: [
      '놓을 자리는 팔레트 기준점에서 잰 상대 좌표 (dx, dy)로 적어 둬요. 팔레트가 θ만큼 돌아가 있으면 상대 좌표도 함께 돌려요.',
      '로봇 좌표 = 기준점 + R(θ) · (dx, dy)를 돌려주세요 (R은 2차원 회전 행렬).',
    ],
    fn: 'place_xy',
    starter: `import math


def place_xy(ref_x, ref_y, theta_deg, dx, dy):
    """팔레트 위 자리의 로봇 좌표 (x, y)를 돌려줘요.

    ref_x, ref_y : 팔레트 기준점(표시)의 로봇 좌표, mm
    theta_deg    : 팔레트가 돌아간 각도, °
    dx, dy       : 기준점에서 잰 자리, mm
    돌려줄 값    : (x, y), mm
    """
    # TODO
    ...
`,
    cases: [
      { note: '예전 기준점, 1번 자리', args: [REF_DEFAULT.x, REF_DEFAULT.y, 0, ...fromMark(0)], expected: slotCentre(0, PAL_HOME).slice(0, 2), tol: 0.1 },
      { note: '팔레트를 옮긴 뒤 새 기준점, 1번 자리', args: [REF_FIX.x, REF_FIX.y, 0, ...fromMark(0)], expected: slotCentre(0, PAL_MOVED).slice(0, 2), tol: 0.1 },
      { note: '팔레트가 5° 돌아감 (대학 과제)', args: [REF_FIX.x, REF_FIX.y, 5, ...fromMark(0)], expected: onPallet(REF_FIX.x, REF_FIX.y, 5, ...(fromMark(0) as [number, number])), tol: 0.1 },
      { note: '−90° 돌아감, 4번 자리', args: [REF_FIX.x, REF_FIX.y, -90, ...fromMark(3)], expected: onPallet(REF_FIX.x, REF_FIX.y, -90, ...(fromMark(3) as [number, number])), tol: 0.1 },
    ],
  },
};

/* --- 바이오 연구실 ----------------------------------------------------------------------------- */

type M3 = number[][];
const mul = (a: M3, b: M3): M3 => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const Rx = (t: number): M3 => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const Ry = (t: number): M3 => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
const Rz = (t: number): M3 => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
/** ①: the tool axis is R's third column (R = Rz · Ry · Rx); its tilt from straight down. */
function toolTilt(rx: number, ry: number, rz: number): number {
  const R = mul(Rz(rad(rz)), mul(Ry(rad(ry)), Rx(rad(rx))));
  return deg(Math.acos(Math.max(-1, Math.min(1, -R[2][2]))));
}
/** ②: the holes' distances from J1 (bio.ts ROW). */
const ROW_R = Array.from({ length: ROW.n }, (_, k) => ROW.r0 + k * ROW.pitch);
/** ②: a J1 zero error δ moves a tube at r by the chord 2 r sin(δ/2); plus a little scatter as measured. */
const misses = (errDeg: number, scatter: readonly number[], rs: readonly number[] = ROW_R) => rs.map((x, k) => r(2 * x * Math.sin(rad(errDeg) / 2) + (scatter[k] ?? 0), 2));
const SCATTER = [0.12, -0.08, 0.15, -0.18, 0.05, -0.1];
/** ②: least squares through the origin: δθ = Σ r·e ÷ Σ r², degrees. */
const fitDeg = (rs: readonly number[], es: readonly number[]) => deg(rs.reduce((s, x, k) => s + x * es[k], 0) / rs.reduce((s, x) => s + x * x, 0));
/** ③: the centrifuge's two corners towards the robot, seen from above. */
const CORNERS: [number, number][] = [
  [CENTRIFUGE.min[0], CENTRIFUGE.min[1]],
  [CENTRIFUGE.min[0], CENTRIFUGE.max[1]],
];
function segDist(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** ③: the tube's clearance to the corners on the path SRC → (vx, 0) → DST, seen from above (minus the tube's radius). */
const pathGap = (vx: number) => Math.min(...CORNERS.flatMap((c) => [segDist(c, SRC, [vx, 0]), segDist(c, [vx, 0], DST)])) - TUBE.d / 2;

const BIO: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'bio',
    prob: 1,
    title: '자세 (rx, ry, rz)에서 시험관 기울기 구하기',
    statement: [
      '방향은 회전 행렬 R = Rz(rz) · Ry(ry) · Rx(rx)로 나타내요. 도구 축(시험관 방향)은 R의 셋째 열이에요.',
      '똑바로 아래를 볼 때 0°가 되도록, 기울기 = arccos(−도구 축의 z 성분)을 돌려주세요. 31°를 넘으면 시료가 쏟아져요.',
    ],
    fn: 'tilt_deg',
    starter: `import math


def tilt_deg(rx, ry, rz):
    """좌표 [x, y, z, rx, ry, rz]의 방향에서 도구 축이 수직(아래)에서 기운 각도를 돌려줘요.

    rx, ry, rz : 자세의 방향, °  (R = Rz(rz) · Ry(ry) · Rx(rx))
    돌려줄 값  : 기울기, °  (0 = 똑바로 아래)
    """
    # TODO: Rx, Ry, Rz 행렬을 만들어 곱하고, 셋째 열의 z 성분을 써요.
    ...
`,
    cases: [
      { note: `지금 놓는 자세 (ry ${-(BIO_DEFAULTS[1] as PoseValues).tilt}°)`, args: [180, -(BIO_DEFAULTS[1] as PoseValues).tilt, 0], expected: toolTilt(180, -(BIO_DEFAULTS[1] as PoseValues).tilt, 0), tol: 0.1 },
      { note: '집는 자세 (rz만 33.7°)', args: [180, 0, 33.7], expected: toolTilt(180, 0, 33.7), tol: 0.1 },
      { note: 'rx 170, ry 20', args: [170, 20, 0], expected: toolTilt(170, 20, 0), tol: 0.1 },
      { note: 'rx −175, ry 10, rz 90', args: [-175, 10, 90], expected: toolTilt(-175, 10, 90), tol: 0.1 },
    ],
  },
  2: {
    lab: 'bio',
    prob: 2,
    title: '여러 칸의 빗나감으로 영점 오차 구하기 (최소제곱)',
    statement: [
      'J1 영점이 δθ 틀리면 몸통에서 r 떨어진 칸은 약 r × δθ(라디안) 빗나가요. 칸 하나로 구하면 흩어짐(±0.2 mm)이 그대로 섞여요.',
      '여러 칸의 (r, 빗나감 e)에 e = r × δθ를 맞추는 최소제곱 해 δθ = Σ r·e ÷ Σ r²를 도(°)로 돌려주세요.',
    ],
    fn: 'fit_j1_error',
    starter: `import math


def fit_j1_error(radii, misses):
    """여러 칸의 빗나감으로 J1 영점 오차를 구해요.

    radii    : 칸마다 몸통(J1 축)에서의 거리, mm  — 리스트
    misses   : 칸마다 빗나간 거리, mm           — 리스트 (같은 순서)
    돌려줄 값: δθ, °
    """
    # TODO
    ...
`,
    cases: [
      { note: '분석 랙 6칸 (1° 틀림)', args: [ROW_R, misses(J1_ERR_DEG, SCATTER)], expected: fitDeg(ROW_R, misses(J1_ERR_DEG, SCATTER)), tol: 0.01 },
      { note: '3번 칸 하나 (계산 칸)', args: [[ROW_R[2]], misses(J1_ERR_DEG, [], [ROW_R[2]])], expected: fitDeg([ROW_R[2]], misses(J1_ERR_DEG, [], [ROW_R[2]])), tol: 0.01 },
      { note: '2° 틀림', args: [ROW_R, misses(2, SCATTER)], expected: fitDeg(ROW_R, misses(2, SCATTER)), tol: 0.01 },
      { note: '0.5° 틀림, 앞 세 칸', args: [ROW_R.slice(0, 3), misses(0.5, SCATTER, ROW_R.slice(0, 3))], expected: fitDeg(ROW_R.slice(0, 3), misses(0.5, SCATTER, ROW_R.slice(0, 3))), tol: 0.01 },
    ],
  },
  3: {
    lab: 'bio',
    prob: 3,
    title: '경유점 길의 여유 거리 (점과 선분)',
    statement: [
      `위에서 내려다보면 길은 (${SRC.join(', ')}) → 경유점 (vx, 0) → (${DST.join(', ')})의 두 선분이고, 원심분리기의 가까운 두 꼭짓점은 (${CORNERS.map((c) => c.join(', ')).join('), (')})이에요.`,
      `두 꼭짓점과 두 선분 사이의 가장 짧은 거리에서 시험관 반지름(${TUBE.d / 2} mm)을 뺀 여유를 돌려주세요. 음수면 부딪혀요.`,
    ],
    fn: 'path_gap',
    starter: `import math

SRC = (${SRC.join(', ')})       # 집는 자리, mm
DST = (${DST.join(', ')})      # 놓는 자리, mm
CORNERS = [${CORNERS.map((c) => `(${c.join(', ')})`).join(', ')}]   # 원심분리기의 가까운 꼭짓점, mm
TUBE_R = ${TUBE.d / 2}          # 시험관 반지름, mm


def path_gap(vx):
    """경유점 (vx, 0)을 지나는 길에서 원심분리기 꼭짓점까지의 여유를 돌려줘요.

    vx       : 경유점의 x, mm (원심분리기 왼쪽, ${CENTRIFUGE.min[0]} 이하)
    돌려줄 값: 가장 가까운 거리 − 시험관 반지름, mm
    """
    # TODO: 점과 선분 사이 거리를 구하는 함수를 먼저 만들면 편해요.
    ...
`,
    cases: [
      { note: `경유점 없이 곧장 (vx = ${SRC[0]})`, args: [SRC[0]], expected: pathGap(SRC[0]), tol: 0.1 },
      { note: `고친 경유점 (vx = ${(BIO_FIXES[3] as PathValues).vx})`, args: [(BIO_FIXES[3] as PathValues).vx], expected: pathGap((BIO_FIXES[3] as PathValues).vx), tol: 0.1 },
      { note: 'vx = 120', args: [120], expected: pathGap(120), tol: 0.1 },
      { note: 'vx = 70', args: [70], expected: pathGap(70), tol: 0.1 },
    ],
  },
};

/* --- 스마트 농장 ------------------------------------------------------------------------------- */

const hueOf = (rgb: readonly number[]) => rgbToHsvDeg(rgb[0], rgb[1], rgb[2])[0];
/** ②: the two markers' distance in the picture, px, from the camera's height now and before. */
const markerPx = (camZ: number) => {
  const [a, b] = markerPixels(camZ);
  return Math.hypot(b.u - a.u, b.v - a.v);
};
/** ②: a tomato's centre as the camera sees it (pixel, rounded as the screen shows it). */
const tomatoPx = (k: number) => {
  const t = FARM_TOMATOES[2][k];
  const p = farmPixel(t.x, t.y, TRAY.top + t.d / 2);
  return [r(p.u), r(p.v)];
};
const pxToMm = (u: number, v: number, px: number) => farmRobot(u, v, MARKER.span / px);
/** ③: the first tomato and the diameter the camera measured for it, mm. */
const T3 = FARM_TOMATOES[3][0];
export const FM3_SEEN = 27.8;
const peak = (d: number, seen: number, squeeze: number, speed: number) => gripOf({ ...T3, d }, seen, { squeeze, speed }).peak;
const G3 = { start: FARM_DEFAULTS[3] as GripValues, fix: FARM_FIXES[3] as GripValues };

const FARM: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'farm',
    prob: 1,
    title: 'RGB에서 색상(H) 구하기',
    statement: [
      '카메라 픽셀은 R, G, B(0 ~ 255)예요. 색으로 토마토를 고르려면 먼저 색상 H(°)로 바꿔요. 빨강이 0°, −180° ~ 180°로 나타내요.',
      '가장 큰 값이 R이면 H = 60 × (G − B) ÷ (max − min), G이면 120 + 60 × (B − R) ÷ (max − min), B이면 240 + 60 × (R − G) ÷ (max − min). 180보다 크면 360을 빼요. 회색(max = min)은 0.',
    ],
    fn: 'hue_deg',
    starter: `def hue_deg(r, g, b):
    """RGB(0 ~ 255)를 색상 H(°, −180 ~ 180, 빨강 0)로 바꿔 돌려줘요."""
    # TODO
    ...
`,
    cases: [
      { note: '덜 익은 토마토 (지금 범위 −10 ~ 40° 안)', args: [214, 115, 47], expected: hueOf([214, 115, 47]), tol: 0.1 },
      { note: '익은 토마토', args: [205, 34, 28], expected: hueOf([205, 34, 28]), tol: 0.1 },
      { note: '자줏빛 빨강 (음수 쪽)', args: [200, 30, 55], expected: hueOf([200, 30, 55]), tol: 0.1 },
      { note: '초록 토마토', args: [70, 160, 60], expected: hueOf([70, 160, 60]), tol: 0.1 },
    ],
  },
  2: {
    lab: 'farm',
    prob: 2,
    title: '마커 두 개로 픽셀 → mm 바꾸기',
    statement: [
      `두 마커는 실제로 ${MARKER.span} mm 떨어져 있어요. 비율 = ${MARKER.span} ÷ 사진에서 두 마커 사이 픽셀 거리 (mm/px).`,
      `공식 AI 키트처럼 x = (v − ${CAM.h / 2}) × 비율 + 카메라 x, y = (u − ${CAM.w / 2}) × 비율 + 카메라 y로 토마토의 로봇 좌표를 돌려주세요.`,
    ],
    fn: 'pixel_to_mm',
    starter: `MARKER_MM = ${MARKER.span}         # 두 마커 사이 실제 거리, mm
C_U, C_V = ${CAM.w / 2}, ${CAM.h / 2}     # 사진 가운데 픽셀 (u, v)
CAM_X, CAM_Y = ${CAM.x}, ${CAM.y}   # 카메라 바로 아래의 로봇 좌표, mm


def pixel_to_mm(u, v, marker_px):
    """사진의 픽셀 (u, v)를 로봇 좌표 (x, y)로 바꿔 돌려줘요.

    u, v      : 픽셀 (u는 오른쪽, v는 아래로 커져요)
    marker_px : 사진에서 두 마커 사이 거리, px
    돌려줄 값 : (x, y), mm
    """
    # TODO
    ...
`,
    cases: [
      { note: '2번 토마토, 지금 잰 마커 거리', args: [...tomatoPx(1), r(markerPx(CAM.z))], expected: pxToMm(tomatoPx(1)[0], tomatoPx(1)[1], r(markerPx(CAM.z))), tol: 0.2 },
      { note: '2번 토마토, 예전 마커 거리 (처음 프로그램)', args: [...tomatoPx(1), r(markerPx(CAM.zOld))], expected: pxToMm(tomatoPx(1)[0], tomatoPx(1)[1], r(markerPx(CAM.zOld))), tol: 0.2 },
      { note: '6번 토마토, 지금 잰 마커 거리', args: [...tomatoPx(5), r(markerPx(CAM.z))], expected: pxToMm(tomatoPx(5)[0], tomatoPx(5)[1], r(markerPx(CAM.z))), tol: 0.2 },
      { note: '사진 가운데', args: [CAM.w / 2, CAM.h / 2, r(markerPx(CAM.z))], expected: pxToMm(CAM.w / 2, CAM.h / 2, r(markerPx(CAM.z))), tol: 0.2 },
    ],
  },
  3: {
    lab: 'farm',
    prob: 3,
    title: '그리퍼가 토마토를 누르는 최대 힘',
    statement: [
      `그리퍼는 (카메라 지름 − 누르기)까지 닫히고, 빠를수록 목표를 넘쳐 더 닫혀요(넘침 = ${OVERSHOOT_PER_SPEED} mm × 속도).`,
      `토마토가 눌린 깊이 = 실제 지름 − 목표 + 넘침, 최대 힘 = ${TOMATO.k} N/mm × 깊이(음수면 0)를 돌려주세요. 터지는 힘은 ${TOMATO.burst} N, 안전 기준은 그 ${SAFE_SHARE * 100} %예요.`,
    ],
    fn: 'peak_force',
    starter: `K = ${TOMATO.k}            # 토마토 강성, N/mm
OVER = ${OVERSHOOT_PER_SPEED}        # 속도 1당 넘침, mm


def peak_force(d_real, d_seen, squeeze, speed):
    """그리퍼가 닫힐 때 토마토에 걸리는 최대 힘을 돌려줘요.

    d_real  : 토마토의 실제 지름, mm
    d_seen  : 카메라가 잰 지름, mm
    squeeze : 카메라 지름보다 좁게 닫는 양(누르기), mm
    speed   : 그리퍼 속도 (1 ~ 100)
    돌려줄 값: 최대 힘, N
    """
    # TODO
    ...
`,
    cases: [
      { note: `1번 토마토, 처음 값 (누르기 ${G3.start.squeeze}, 속도 ${G3.start.speed})`, args: [T3.d, FM3_SEEN, G3.start.squeeze, G3.start.speed], expected: peak(T3.d, FM3_SEEN, G3.start.squeeze, G3.start.speed), tol: 0.05 },
      { note: `고친 값 (누르기 ${G3.fix.squeeze}, 속도 ${G3.fix.speed})`, args: [T3.d, FM3_SEEN, G3.fix.squeeze, G3.fix.speed], expected: peak(T3.d, FM3_SEEN, G3.fix.squeeze, G3.fix.speed), tol: 0.05 },
      { note: '작은 토마토 25 mm', args: [25, 25.4, 2, 40], expected: peak(25, 25.4, 2, 40), tol: 0.05 },
      { note: '카메라가 크게 잼 (닿지 않음)', args: [27, 31, 2, 10], expected: peak(27, 31, 2, 10), tol: 0.05 },
    ],
  },
};

/* --- 서비스 카페 · 돌봄 ------------------------------------------------------------------------ */

const C1 = { start: CAFE_DEFAULTS[1] as CarryValues, fix: CAFE_FIXES[1] as CarryValues };
/** ①: the carry from the bar to the pickup spot, mm. */
const CARRY_MM = Math.hypot(PICKUP[0] - BAR[0], PICKUP[1] - BAR[1]);
const carryT = (dist: number, vmax: number, accMs2: number) => trapezoid(dist, vmax, accMs2 * 1000).T;
/** ②: the fastest zone speed whose protective distance is within the detection distance (bisection on cafe.ts protectiveDistance). */
function maxZoneSpeed(detect: number, react: number): number {
  const S = (v: number) => protectiveDistance({ zoneSpeed: v, detect, react }).total;
  if (S(0) >= detect) return 0;
  let [lo, hi] = [0, 5000];
  for (let i = 0; i < 60; i += 1) {
    const m = (lo + hi) / 2;
    if (S(m) <= detect) lo = m;
    else hi = m;
  }
  return lo;
}
const C2 = { start: CAFE_DEFAULTS[2] as GuardValues, fix: CAFE_FIXES[2] as GuardValues };
/** ③: J1's turn from the fridge to the table (cafe.ts turnPoses), degrees. */
export const C3_DQ = r(deg(Math.atan2(PICKUP[1], PICKUP[0]) - Math.atan2(FRIDGE[1], FRIDGE[0])));
/** ③: J1's inertia with the bottle at 230 and 180 mm (cafe.ts turnTorque: τ ÷ α, checked with the arm), kg·m². */
export const C3_INERTIA = { 230: 0.0176, 180: 0.0103 } as const;
/** A quintic's peak acceleration is (10√3 ÷ 3) Δθ ÷ T² (robot/motion.ts). */
const QUINTIC_PEAK_ACC = (10 * Math.sqrt(3)) / 3;
const minTurnT = (dq: number, inertia: number, tauMax: number) => Math.max(Math.sqrt((QUINTIC_PEAK_ACC * rad(Math.abs(dq)) * inertia) / tauMax), (QUINTIC_PEAK_RATE * Math.abs(dq)) / J1_MAX_SPEED);

const CAFE: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'cafe',
    prob: 1,
    title: '사다리꼴 속도로 옮기는 시간',
    statement: [
      '컵은 가속 → 일정 속도 → 감속(사다리꼴)으로 옮겨요. 가속도를 낮추면 커피는 안 넘치지만 시간이 늘어요 — 얼마나 늘까요?',
      '거리 D, 최고 속도 v, 가속도 a로 걸리는 시간을 돌려주세요. 가속 · 감속만으로 D를 다 가면(v²/a ≥ D) 최고 속도에 닿지 못하는 삼각형이에요.',
    ],
    fn: 'carry_time',
    starter: `import math


def carry_time(dist_mm, vmax_mm_s, acc_m_s2):
    """사다리꼴(또는 삼각형) 속도 프로파일로 옮기는 시간을 돌려줘요.

    dist_mm   : 옮기는 거리, mm
    vmax_mm_s : 최고 속도, mm/s
    acc_m_s2  : 가속도(= 감속도), m/s²  — mm/s²로 바꿔 써요
    돌려줄 값 : 걸리는 시간, s
    """
    # TODO
    ...
`,
    cases: [
      { note: `처음 값 (가속도 ${C1.start.acc} m/s²)`, args: [CARRY_MM, C1.start.speed, C1.start.acc], expected: carryT(CARRY_MM, C1.start.speed, C1.start.acc), tol: 0.005 },
      { note: `고친 값 (가속도 ${C1.fix.acc} m/s²)`, args: [CARRY_MM, C1.fix.speed, C1.fix.acc], expected: carryT(CARRY_MM, C1.fix.speed, C1.fix.acc), tol: 0.005 },
      { note: '넘치기 직전 가속도', args: [CARRY_MM, C1.fix.speed, r(SPILL_ACC, 2)], expected: carryT(CARRY_MM, C1.fix.speed, r(SPILL_ACC, 2)), tol: 0.005 },
      { note: '짧은 거리 · 빠른 최고 속도 (삼각형)', args: [100, 600, 2], expected: carryT(100, 600, 2), tol: 0.005 },
    ],
  },
  2: {
    lab: 'cafe',
    prob: 2,
    title: '감지 거리로 허용되는 로봇 속도 (2차 방정식)',
    statement: [
      '보호 거리 S = (v손 + v로봇) × 반응 시간 + v로봇² ÷ 2a + v손 × v로봇 ÷ a 가 감지 거리 안이어야 손 앞에서 멈춰요.',
      'S = 감지 거리가 되는 v로봇(2차 방정식의 양의 근)을 돌려주세요. 손만으로도 감지 거리를 넘으면 0.',
    ],
    fn: 'max_zone_speed',
    starter: `import math

HAND = ${HAND.speed}       # 손이 다가오는 속도, mm/s
BRAKE = ${HAND.brake * 1000}     # 로봇의 감속도, mm/s²


def max_zone_speed(detect_mm, react_s):
    """손 앞에서 멈출 수 있는 가장 빠른 로봇 속도를 돌려줘요.

    detect_mm : 센서의 감지 거리, mm
    react_s   : 감지에서 멈추기 시작까지 반응 시간, s
    돌려줄 값 : 로봇 속도, mm/s  (어떤 속도도 안 되면 0)
    """
    # TODO: S(v) = detect_mm 을 v에 대한 2차 방정식으로 정리해요.
    ...
`,
    cases: [
      { note: `처음 감지 거리 ${C2.start.detect} mm`, args: [C2.start.detect, HAND.react], expected: maxZoneSpeed(C2.start.detect, HAND.react), tol: 0.5 },
      { note: `고친 감지 거리 ${C2.fix.detect} mm`, args: [C2.fix.detect, HAND.react], expected: maxZoneSpeed(C2.fix.detect, HAND.react), tol: 0.5 },
      { note: '감지 150 mm, 반응 0.2 s', args: [150, 0.2], expected: maxZoneSpeed(150, 0.2), tol: 0.5 },
      { note: '감지 20 mm (손만으로 넘음)', args: [20, HAND.react], expected: maxZoneSpeed(20, HAND.react), tol: 0.5 },
    ],
  },
  3: {
    lab: 'cafe',
    prob: 3,
    title: '토크와 속도 제한을 함께 지키는 가장 짧은 시간',
    statement: [
      `5차 궤적은 최대 각가속도 5.77 × Δθ ÷ T², 최고 속도 1.875 × Δθ ÷ T예요. 토크 τ = I × α가 제한(돌봄 모드 ${CARE_J1_LIMIT} N·m) 안이어야 하고, 최고 속도는 ${J1_MAX_SPEED}°/s까지예요.`,
      '두 조건에서 각각 가장 짧은 T를 구해, 둘 중 긴 쪽을 돌려주세요. α는 rad/s²로 계산해요.',
    ],
    fn: 'min_turn_time',
    starter: `import math

W_MAX = ${J1_MAX_SPEED}     # J1 최고 속도, °/s


def min_turn_time(dq_deg, inertia, tau_max):
    """J1을 dq_deg 돌리는 가장 짧은 시간을 돌려줘요.

    dq_deg  : 도는 각도, °  (음수도 돼요)
    inertia : J1 축에 대한 관성 모멘트, kg·m²
    tau_max : J1 토크 제한, N·m
    돌려줄 값: 가장 짧은 시간 T, s
    """
    # TODO
    ...
`,
    cases: [
      { note: '지금 (반지름 230 mm)', args: [C3_DQ, C3_INERTIA[230], CARE_J1_LIMIT], expected: minTurnT(C3_DQ, C3_INERTIA[230], CARE_J1_LIMIT), tol: 0.005 },
      { note: '팔을 접어 반지름 180 mm', args: [C3_DQ, C3_INERTIA[180], CARE_J1_LIMIT], expected: minTurnT(C3_DQ, C3_INERTIA[180], CARE_J1_LIMIT), tol: 0.005 },
      { note: '90°만 돌기', args: [90, C3_INERTIA[230], CARE_J1_LIMIT], expected: minTurnT(90, C3_INERTIA[230], CARE_J1_LIMIT), tol: 0.005 },
      { note: '서보 한계 0.285 N·m', args: [C3_DQ, C3_INERTIA[230], 0.285], expected: minTurnT(C3_DQ, C3_INERTIA[230], 0.285), tol: 0.005 },
    ],
  },
};

/* --- AI 연구소 --------------------------------------------------------------------------------- */

/** ①: the official decision list — the first range the pixel (OpenCV H · S · V) falls in names it (ai.ts labelPicture). */
function firstRange(hsv: readonly number[], yellowHi: number, greenLo: number): string | null {
  return officialRanges(yellowHi, greenLo).find((g) => hsv.every((x, j) => x >= g.lo[j] && x <= g.hi[j]))?.name ?? null;
}
/** ①: the official list as Python, the two ends the student sets left as names. */
const RANGE_TABLE = officialRanges(-1, -2)
  .map((g) => `        ("${g.name}", (${g.lo.join(', ')}), (${g.hi.join(', ')})),`.replace('-1', 'yellow_hi').replace('-2', 'green_lo'))
  .join('\n');
const A1 = { start: AI_DEFAULTS[1] as HsvValues, fix: AI_FIXES[1] as HsvValues };
/** ②: the demonstrations' block positions mixed by 1 ÷ distanceᵖ (ai.ts policy's weights), in the work space. */
function blendXY(x: number, y: number, p: number): number[] {
  const w = DEMOS.map(([dx, dy]) => 1 / Math.max(1e-6, Math.hypot(x - dx, y - dy)) ** p);
  const sum = w.reduce((a, b) => a + b, 0);
  return [0, 1].map((j) => DEMOS.reduce((s, d, i) => s + d[j] * w[i], 0) / sum);
}
/** ③: where the program's flat-board conversion puts a part's top (ai.ts toPixel → toRobot), rounded as shown. */
const seenAt = (t: { x: number; y: number; h: number }) => {
  const p = aiPixel(t.x, t.y, t.h);
  return aiRobot(p.u, p.v).map((v) => r(v));
};
const PARTS = AI_THINGS[3];

const AI: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'ai',
    prob: 1,
    title: '색 범위를 순서대로 검사하기 (결정 목록)',
    statement: [
      '공식 프로그램은 노랑 → 빨강 → 초록 → 파랑 → 청록 순서로 범위를 검사하고, 처음 맞는 범위의 이름을 붙여요. 범위가 겹치면 순서가 곧 규칙이에요.',
      '픽셀 (H, S, V)가 들어가는 첫 범위의 이름을 돌려주세요. 어디에도 없으면 None.',
    ],
    fn: 'color_name',
    starter: `def color_name(h, s, v, yellow_hi, green_lo):
    """OpenCV 단위 픽셀 (H 0 ~ 180, S · V 0 ~ 255)의 색 이름을 돌려줘요.

    yellow_hi : 노랑 범위의 위 끝 H
    green_lo  : 초록 범위의 아래 끝 H
    돌려줄 값 : "yellow", "red", "green", "blue", "cyan" 중 하나, 없으면 None
    """
    ranges = [   # (이름, (H, S, V) 아래 끝, (H, S, V) 위 끝) — 이 순서로 검사해요
${RANGE_TABLE}
    ]
    # TODO
    ...
`,
    cases: [
      { note: `연두 블록, 처음 범위 (노랑 위 끝 ${A1.start.yellowHi})`, args: [50, 178, 184, A1.start.yellowHi, A1.start.greenLo], expected: firstRange([50, 178, 184], A1.start.yellowHi, A1.start.greenLo), tol: 0 },
      { note: `연두 블록, 고친 범위 (노랑 위 끝 ${A1.fix.yellowHi})`, args: [50, 178, 184, A1.fix.yellowHi, A1.fix.greenLo], expected: firstRange([50, 178, 184], A1.fix.yellowHi, A1.fix.greenLo), tol: 0 },
      { note: '빨강 블록', args: [4, 199, 209, A1.fix.yellowHi, A1.fix.greenLo], expected: firstRange([4, 199, 209], A1.fix.yellowHi, A1.fix.greenLo), tol: 0 },
      { note: '초록과 청록이 겹치는 H 85', args: [85, 199, 209, A1.fix.yellowHi, A1.fix.greenLo], expected: firstRange([85, 199, 209], A1.fix.yellowHi, A1.fix.greenLo), tol: 0 },
    ],
  },
  2: {
    lab: 'ai',
    prob: 2,
    title: '가까운 시연일수록 크게 섞기',
    statement: [
      '시연 10개를 섞을 때 블록 자리 (x, y)에서 각 시연까지 거리 d로 가중치 w = 1 ÷ dᵖ를 주고, 합이 1이 되게 나눠요.',
      '시연 자리들을 이 가중치로 섞은 (x, y)를 돌려주세요 — 손끝 좌표(작업 공간)에서 섞기. 화면의 [섞기]는 관절 각도를 섞어 결과가 조금 달라요.',
    ],
    fn: 'blend_xy',
    starter: `import math

DEMOS = [${DEMOS.map(([x, y]) => `(${x}, ${y})`).join(', ')}]   # 시연한 블록 자리, mm


def blend_xy(x, y, p):
    """시연 자리들을 1 ÷ 거리ᵖ 가중치로 섞은 (x, y)를 돌려줘요.

    x, y     : 오늘 블록 자리, mm
    p        : 거리의 거듭제곱 (클수록 가까운 시연만 따라요)
    돌려줄 값: (x, y), mm
    """
    # TODO: 거리가 0이면 나눌 수 없으니 아주 작은 수(1e-6)보다 작아지지 않게 해요.
    ...
`,
    cases: [
      { note: `오늘 1회째 (${TRIALS[0].join(', ')}), p = 2`, args: [...TRIALS[0], 2], expected: blendXY(TRIALS[0][0], TRIALS[0][1], 2), tol: 0.1 },
      { note: `2회째 (${TRIALS[1].join(', ')}), p = 2`, args: [...TRIALS[1], 2], expected: blendXY(TRIALS[1][0], TRIALS[1][1], 2), tol: 0.1 },
      { note: '1회째, p = 6', args: [...TRIALS[0], 6], expected: blendXY(TRIALS[0][0], TRIALS[0][1], 6), tol: 0.1 },
      { note: `3회째 (${TRIALS[2].join(', ')}), p = 1`, args: [...TRIALS[2], 1], expected: blendXY(TRIALS[2][0], TRIALS[2][1], 1), tol: 0.1 },
    ],
  },
  3: {
    lab: 'ai',
    prob: 3,
    title: '높이가 있는 물체의 시차 보정',
    statement: [
      '보정판(높이 0)에 맞춘 변환은 높이 h인 윗면을 카메라 축에서 바깥으로 밀려난 자리로 읽어요(시차).',
      '읽은 (x, y)를 카메라 축 쪽으로 (Z − h) ÷ Z배 당겨 돌려주세요: x′ = 카메라 x + (x − 카메라 x) × (Z − h) ÷ Z.',
    ],
    fn: 'parallax_fix',
    starter: `CAM_X, CAM_Y = ${CAMERA.x}, ${CAMERA.y}   # 카메라 바로 아래의 로봇 좌표, mm
CAM_Z = ${CAMERA.z}                # 카메라 높이 (판에서), mm


def parallax_fix(x, y, h):
    """높이 h인 윗면의 읽은 자리 (x, y)를 고쳐 돌려줘요.

    x, y     : 보정판 기준으로 바꾼 자리, mm
    h        : 물체 윗면 높이, mm
    돌려줄 값: 고친 (x, y), mm
    """
    # TODO
    ...
`,
    cases: [
      { note: `빨강 부품 (높이 ${PARTS[0].h} mm)`, args: [...seenAt(PARTS[0]), PARTS[0].h], expected: parallaxFix(...(seenAt(PARTS[0]) as [number, number]), PARTS[0].h), tol: 0.1 },
      { note: '초록 부품', args: [...seenAt(PARTS[2]), PARTS[2].h], expected: parallaxFix(...(seenAt(PARTS[2]) as [number, number]), PARTS[2].h), tol: 0.1 },
      { note: `블록 (높이 ${AI_THINGS[1][3].h} mm)`, args: [...seenAt(AI_THINGS[1][3]), AI_THINGS[1][3].h], expected: parallaxFix(...(seenAt(AI_THINGS[1][3]) as [number, number]), AI_THINGS[1][3].h), tol: 0.1 },
      { note: '높이 0 (그대로)', args: [200, -60, 0], expected: parallaxFix(200, -60, 0), tol: 0.1 },
    ],
  },
};

/* --- 에너지 · 자원순환 ------------------------------------------------------------------------- */

const E1 = { start: ENERGY_DEFAULTS[1] as VisionValues, fix: ENERGY_FIXES[1] as VisionValues };
/** ①: the program's rule (energy.ts classify); a grey pixel too bright for any band is the white board ("board"). */
const kindOf = (h: number, s: number, v: number, clearV: number) => classify([h, s, v], { canV: E1.start.canV, clearV }) ?? (s < 43 ? 'board' : null);
/** ②: the carry speed setting a piece stays on the cup at: side acceleration ≤ μ(F ÷ m − g) (energy.ts sideLimit), a ∝ speed². */
function pieceSpeed(massG: number, holdN: number, mu: number, acc100: number): number {
  const a = sideLimit({ massG, holdN, mu } as Item);
  return a <= 0 ? 0 : Math.min(100, 100 * Math.sqrt(a / acc100));
}
/** ②: the largest side acceleration at speed 100, per piece (energy.ts carryPreview, checked with the arm), m/s². */
export const E2_ACC100 = { wetPack: 4.41, fullCan: 6.45, dryPack: 2.5 } as const;
const P2 = ENERGY_ITEMS[2];
const WET = P2[5];
const CAN = P2[FULL_CAN];
const DRY = P2[4];
/** ③: the program's order (energy.ts pickOrder 'visible'): the share seen of each blob's whole top, biggest first. */
function visibleOrder(kinds: readonly Kind[], areas: readonly number[]): number[] {
  const found = kinds.map((kind, k) => ({ kind, area: areas[k], areaMm: areas[k], visible: areas[k] / fullArea(kind), k }) as Found);
  return pickOrder(found, 'visible').map((f) => f.k);
}
const SIZE_TABLE = KINDS.map((k) => `    "${k}": ${SIZE[k].shape === 'disc' ? `(${SIZE[k].sx},)` : `(${SIZE[k].sx}, ${SIZE[k].sy})`},`).join('\n');
/** ③: the blobs of the two stacks as the screen measures them, mm² (energy.ts findItems, checked). */
export const E3_SEEN = { kinds: ['pack', 'can', 'clear', 'color'] as Kind[], areas: [1774, 889, 886, 1246] };

const ENERGY: Record<SiteProblem, PyTask> = {
  1: {
    lab: 'energy',
    prob: 1,
    title: '채도 → 색상, 아니면 밝기로 나누기',
    statement: [
      '색이 있는 픽셀(S ≥ 43)은 색상 H로: 11 ~ 34면 종이팩 "pack", 35 ~ 90이면 유색 PET "color", 나머지는 None.',
      `색이 없는 픽셀은 밝기 V로: ${E1.start.canV} 미만은 캔 "can", 그 위로 clear_v 미만은 투명 PET "clear", 그 이상은 흰 판 "board". 이 규칙으로 종류를 돌려주세요.`,
    ],
    fn: 'kind_of',
    starter: `CAN_V = ${E1.start.canV}    # 이 밝기 미만의 회색은 캔


def kind_of(h, s, v, clear_v):
    """OpenCV 단위 픽셀 (H 0 ~ 180, S · V 0 ~ 255)의 쓰레기 종류를 돌려줘요.

    clear_v  : 투명 PET 밝기 띠의 위 끝 (이 값 이상은 흰 판)
    돌려줄 값: "pack", "color", "can", "clear", 흰 판이면 "board", 모르는 색이면 None
    """
    # TODO
    ...
`,
    cases: [
      { note: `투명 PET, 처음 띠 (위 끝 ${E1.start.clearV})`, args: [100, 10, 216, E1.start.clearV], expected: kindOf(100, 10, 216, E1.start.clearV), tol: 0 },
      { note: `투명 PET, 고친 띠 (위 끝 ${E1.fix.clearV})`, args: [100, 10, 216, E1.fix.clearV], expected: kindOf(100, 10, 216, E1.fix.clearV), tol: 0 },
      { note: '캔', args: [105, 13, 168, E1.fix.clearV], expected: kindOf(105, 13, 168, E1.fix.clearV), tol: 0 },
      { note: '종이팩', args: [16, 184, 224, E1.fix.clearV], expected: kindOf(16, 184, 224, E1.fix.clearV), tol: 0 },
    ],
  },
  2: {
    lab: 'energy',
    prob: 2,
    title: '조각마다 들고 옮기는 속도 정하기',
    statement: [
      '흡착 컵이 조각을 옆으로 옮길 때 버티는 가속도는 a ≤ μ × (F ÷ m − g)예요. 젖거나 무거운 조각일수록 작아요.',
      '가속도는 속도 설정의 제곱에 비례하니 속도 설정 = 100 × √(a ÷ 속도 100의 가속도)를 돌려주세요. 100을 넘으면 100, 버티지 못하면(a ≤ 0) 0.',
    ],
    fn: 'piece_speed',
    starter: `import math

G = ${G}   # 중력 가속도, m/s²


def piece_speed(mass_g, hold_n, mu, acc100):
    """조각이 컵에서 미끄러지지 않는 가장 빠른 속도 설정(0 ~ 100)을 돌려줘요.

    mass_g   : 조각 무게, g
    hold_n   : 흡착 유지력, N
    mu       : 컵과 조각 사이 마찰 계수
    acc100   : 속도 100으로 옮길 때 옆 방향 최대 가속도, m/s²
    돌려줄 값: 속도 설정 (0 ~ 100)
    """
    # TODO
    ...
`,
    cases: [
      { note: '젖은 종이팩 (계산 칸)', args: [WET.massG, WET.holdN, WET.mu, E2_ACC100.wetPack], expected: pieceSpeed(WET.massG, WET.holdN, WET.mu, E2_ACC100.wetPack), tol: 0.5 },
      { note: '음료가 남은 캔', args: [CAN.massG, CAN.holdN, CAN.mu, E2_ACC100.fullCan], expected: pieceSpeed(CAN.massG, CAN.holdN, CAN.mu, E2_ACC100.fullCan), tol: 0.5 },
      { note: '마른 종이팩', args: [DRY.massG, DRY.holdN, DRY.mu, E2_ACC100.dryPack], expected: pieceSpeed(DRY.massG, DRY.holdN, DRY.mu, E2_ACC100.dryPack), tol: 0.5 },
      { note: '물을 더 머금은 종이팩 45 g', args: [45, WET.holdN, WET.mu, E2_ACC100.wetPack], expected: pieceSpeed(45, WET.holdN, WET.mu, E2_ACC100.wetPack), tol: 0.5 },
    ],
  },
  3: {
    lab: 'energy',
    prob: 3,
    title: '다 보이는 것부터 집는 순서',
    statement: [
      `겹친 더미에서는 위에 있는 조각이 다 보여요. 보이는 비율 = 사진에서 보이는 넓이 ÷ 종류 표의 넓이(캔은 원 Ø${SIZE.can.sx}, 나머지는 가로 × 세로).`,
      '비율이 큰 것부터, 같으면 넓이가 큰 것부터 집는 순서를 조각 번호(0부터) 리스트로 돌려주세요.',
    ],
    fn: 'pick_order',
    starter: `import math

SIZE = {   # 종류 표: 캔은 지름, 나머지는 가로 × 세로, mm
${SIZE_TABLE}
}


def pick_order(kinds, areas):
    """집는 순서를 조각 번호 리스트로 돌려줘요.

    kinds    : 조각마다 종류 ("can", "clear", "color", "pack") — 리스트
    areas    : 조각마다 사진에서 보이는 넓이, mm² — 리스트 (같은 순서)
    돌려줄 값: 조각 번호(0부터)를 집는 순서대로 담은 리스트
    """
    # TODO: sorted(..., key=...) 를 쓰면 편해요.
    ...
`,
    cases: [
      { note: '두 더미 (화면의 사진)', args: [E3_SEEN.kinds, E3_SEEN.areas], expected: visibleOrder(E3_SEEN.kinds, E3_SEEN.areas), tol: 0 },
      { note: '둘 다 다 보임 → 넓이 큰 것부터', args: [['pack', 'color'], [2400, 1176]], expected: visibleOrder(['pack', 'color'], [2400, 1176]), tol: 0 },
      { note: '세 조각', args: [['clear', 'pack', 'can'], [1700, 1200, 400]], expected: visibleOrder(['clear', 'pack', 'can'], [1700, 1200, 400]), tol: 0 },
      { note: '네 조각', args: [['color', 'can', 'pack', 'clear'], [600, 800, 2300, 1500]], expected: visibleOrder(['color', 'can', 'pack', 'clear'], [600, 800, 2300, 1500]), tol: 0 },
    ],
  },
};

export const PY_TASKS: Record<LabId, Record<SiteProblem, PyTask>> = { factory: FACTORY, logistics: LOGISTICS, bio: BIO, farm: FARM, cafe: CAFE, ai: AI, energy: ENERGY };

export const pyTask = (lab: LabId, prob: SiteProblem): PyTask => PY_TASKS[lab][prob];

/* --- 채점 ------------------------------------------------------------------------------------- */

export interface CaseVerdict {
  ok: boolean;
  /** What the function returned, as the table shows it. */
  got: string;
  /** Why it did not pass (wrong type, None, …), when not a plain wrong number. */
  why?: string;
}

/** A number for the table: up to 3 decimals (3 significant digits below 1), no trailing zeros. */
export const fmtNum = (x: number) => String(Number(Math.abs(x) < 1 ? x.toPrecision(3) : x.toFixed(3)));

export function fmtValue(v: PyPlain | PyExpect | PyArg | undefined): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => fmtValue(x as PyPlain)).join(', ')}]`;
  return (v as { repr: string }).repr;
}

/** Judge one call's result against its case. */
export function checkCall(c: PyCase, call: GradeCall): CaseVerdict {
  if (call.error) return { ok: false, got: `${call.error.type}`, why: `${call.error.line ? `${call.error.line}번째 줄 ` : ''}${call.error.last}` };
  const v = call.value ?? null;
  const got = fmtValue(v);
  const e = c.expected;
  if (v === null && e !== null) return { ok: false, got, why: '값을 돌려주지 않았어요 — return 을 빠뜨렸나요?' };
  if (e === null) return { ok: v === null, got, why: v === null ? undefined : '해당하는 것이 없으면 None 을 돌려줘요.' };
  if (typeof e === 'string') return { ok: v === e, got, why: typeof v === 'string' ? undefined : '글자(문자열)를 돌려줘요.' };
  if (typeof e === 'number') {
    if (typeof v !== 'number') return { ok: false, got, why: Array.isArray(v) ? '값 하나(숫자)를 돌려줘요.' : '숫자를 돌려줘요.' };
    return { ok: Math.abs(v - e) <= c.tol + 1e-9, got };
  }
  if (!Array.isArray(v)) return { ok: false, got, why: `값 ${e.length}개를 (a, b) 처럼 묶어 돌려줘요.` };
  if (v.length !== e.length) return { ok: false, got, why: `값이 ${e.length}개여야 해요 (지금 ${v.length}개).` };
  return { ok: v.every((x, i) => typeof x === 'number' && Math.abs(x - e[i]) <= c.tol + 1e-9), got };
}
