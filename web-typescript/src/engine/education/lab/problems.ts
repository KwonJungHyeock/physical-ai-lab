/**
 * 문제 해결 실습 (시범) — 컨베이어 공정: three problems on the same cell (cell.ts), each run by the
 * time-stepped cell (run.ts) so every number a student sees is measured, not written down.
 *
 *  ① 옆을 집는다 — a fixed joint pose (J1 · J2 · J3; the wrist keeps the cup pointing down) lands
 *    beside the box. Forward kinematics turns the angles into the tip's x · y · z; the fix is angles
 *    that put the tip within 3 mm of the box's top centre.
 *  ② 자리가 매번 바뀐다 — three boxes stop at three sensors. One pose cannot pick them all;
 *    coordinates do, with the angles from inverse kinematics — except where the arm cannot reach
 *    (the third sensor sits too far along the belt, and the approach point above it too high).
 *  ③ 움직이는 상자를 놓친다 — the belt never stops. When the sensor sees a box the arm waits a
 *    delay and comes down; it must arrive as the box arrives, and be back before the next one.
 *
 * The screen (ui/education/lab) shows these runs; tests/education/lab-check.mts checks that the
 * starting values fail and that sensible fixes pass.
 */

import type { ChainSegment } from '../../robot/kinematics';
import { jointMax, jointMin } from '../../robot/limits';
import { jointMoveDuration, tcpPositionMm } from '../../robot/motion';
import { BELT, BOX_A, BOX_B, BOX_C, HOME_Q, PALLET, SLOTS, TCP_MM, boxTop, type BoxSpec, type Mm } from './cell';
import { CellRun, FRAME_STEP_S, linePlan, toolPoseAt, type LabEvent, type LabRun } from './run';

export type ProblemId = 1 | 2 | 3;

/** The tool held straight down from J1 · J2 · J3: J4 keeps J2 + J3 + J4 = −90°, J5 = 0, J6 turns with J1. */
export const wristDown = (j1: number, j2: number, j3: number): number[] => [j1, j2, j3, -90 - j2 - j3, 0, j1 - 90];

export const tipMm = (chain: readonly ChainSegment[], q: readonly number[]): Mm => {
  const p = tcpPositionMm(chain, q, TCP_MM);
  return [p.x, p.y, p.z];
};

const dist = (a: Mm, b: Mm) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Moves the arm makes between picks (speed 1..100, as pymycobot). */
const SPEED = { travel: 55, down: 35 };
/** The cup must be this close to the top centre of a box standing still, mm. */
export const GRIP_TOL_MM = 3;
/** On a moving box the cup may land this far off the centre, mm (the box still lifts level). */
export const CATCH_TOL_MM = 10;

/**
 * Pick a box with its top at `pickQ`'s tool tip: over it, down, pump, up, onto pallet place `slot`.
 * The short legs up and down are joint moves between IK poses (the tool may lean a little higher
 * up, where straight down is out of reach; a straight line would have to keep one orientation).
 */
function pickAndPlace(run: CellRun, k: number, pickQ: readonly number[], approachMm: number, slot: number): boolean {
  const pick = tipMm(run.chain, pickQ);
  const above: Mm = [pick[0], pick[1], pick[2] + approachMm];
  const up = toolPoseAt(run.chain, above, pickQ);
  if (!up) {
    run.log('unreachable', `접근 자리 (${above.map((v) => v.toFixed(0)).join(', ')})에 손이 닿지 않아요`, { box: k, at: above });
    return false;
  }
  if (!run.moveJ(up.q, SPEED.travel) || !run.moveJ(pickQ, SPEED.down)) return false;
  const got = run.grip({ xy: GRIP_TOL_MM, z: GRIP_TOL_MM, d3: GRIP_TOL_MM });
  if (!run.moveJ(up.q, SPEED.down)) return false;
  if (got < 0) {
    run.pumpOff();
    return false;
  }
  // Through a high point between the belt and the pallet, so the box swings over the sensors, not into them.
  const via = toolPoseAt(run.chain, TRANSFER, run.q);
  if (via && !run.moveJ(via.q, SPEED.travel)) return false;
  return place(run, got, slot);
}

/** The carried box goes through here on its way to the pallet (above the belt's near edge), mm. */
const TRANSFER: Mm = [165, -10, 205];

/** The poses over pallet place `slot` and down on it for a box `h` tall (null: out of reach). */
function slotPoses(chain: readonly ChainSegment[], slot: number, h: number, seed: readonly number[]): { over: number[]; down: number[]; at: Mm } | null {
  const [sx, sy] = SLOTS[slot];
  const over = toolPoseAt(chain, [sx, sy, PALLET.top + h + 45], seed);
  const down = over && toolPoseAt(chain, [sx, sy, PALLET.top + h], over.q);
  return over && down ? { over: over.q, down: down.q, at: [sx, sy, PALLET.top + h] } : null;
}

/** Release dwell on the pallet, s. */
const RELEASE_S = 0.1;

/** Carry the held box to pallet place `slot`, put it down and come back up. */
function place(run: CellRun, k: number, slot: number, speed: number = SPEED.travel, downSpeed: number = SPEED.down): boolean {
  const s = slotPoses(run.chain, slot, run.boxes[k].spec.size[2], run.q);
  if (!s) return run.fail('unreachable', '팔레트 위에 손이 닿지 않아요', { at: [SLOTS[slot][0], SLOTS[slot][1], PALLET.top] });
  if (!run.moveJ(s.over, speed) || !run.moveJ(s.down, downSpeed)) return false;
  run.release(RELEASE_S);
  return run.moveJ(s.over, speed);
}

/* -------------------------------------------------------------------------- */
/* ① 옆을 집는다                                                              */
/* -------------------------------------------------------------------------- */

export interface P1Values {
  j1: number;
  j2: number;
  j3: number;
}

/** The stop sensor's beam (the box's front face stops here), y mm. */
export const P1_STOP_Y = -55;
export const P1_BOX = BOX_A;
/** Where the box stands: its top centre, mm. */
export const P1_TARGET: Mm = [BELT.x, P1_STOP_Y + P1_BOX.size[1] / 2, boxTop(P1_BOX)];
/** The work sheet's angles, set for where the box used to stop (the tip lands near (205, 16, 124)). */
export const P1_DEFAULT: P1Values = { j1: 22.7, j2: -14.3, j3: -67.7 };

/** Slider ranges: J1 · J2 · J3 limits, and J4 must stay within its own (it follows J2 and J3). */
export const P1_RANGE = { j1: [-60, 60], j2: [-60, 30], j3: [-110, -20] } as const;

export interface P1Live {
  q: number[];
  tip: Mm;
  target: Mm;
  /** Tip − target, mm. */
  delta: Mm;
  missMm: number;
  /** J4 inside its limit. */
  j4Ok: boolean;
}

export function p1Live(chain: readonly ChainSegment[], v: P1Values): P1Live {
  const q = wristDown(v.j1, v.j2, v.j3);
  const tip = tipMm(chain, q);
  const delta: Mm = [tip[0] - P1_TARGET[0], tip[1] - P1_TARGET[1], tip[2] - P1_TARGET[2]];
  return { q, tip, target: P1_TARGET, delta, missMm: Math.hypot(...delta), j4Ok: q[3] >= jointMin()[3] && q[3] <= jointMax()[3] };
}

export function runP1(chain: readonly ChainSegment[], v: P1Values): LabRun {
  const run = new CellRun(chain, { boxes: [{ spec: P1_BOX, enterAt: 0 }], sensors: [{ y: P1_STOP_Y, gate: true }], beltSpeed: 160, stopBeltAtGate: true });
  run.gate(0, P1_STOP_Y);
  if (run.waitUntil(() => !run.beltOn, 6)) {
    const live = p1Live(chain, v);
    if (!live.j4Ok) run.fail('limit', `J4가 ${live.q[3].toFixed(0)}°가 되어 움직일 수 있는 범위(${jointMin()[3]}° ~ ${jointMax()[3]}°)를 넘어요`);
    else if (pickAndPlace(run, 0, live.q, 60, 0)) run.moveJ(HOME_Q, SPEED.travel);
    else if (!run.stopped) run.moveJ(HOME_Q, SPEED.travel);
  }
  return run.finish();
}

/* -------------------------------------------------------------------------- */
/* ② 자리가 매번 바뀐다                                                       */
/* -------------------------------------------------------------------------- */

export type P2Mode = 'angles' | 'coords';

export interface P2Values {
  mode: P2Mode;
  /** 각도로 지정: one pose for every box (①'s). */
  pose: P1Values;
  /** 좌표로 지정: the cup's target for each box, mm (null: the sensor's reading). */
  targets: (Mm | null)[];
  /** Approach from this far above the target, mm. */
  approach: number;
  /** Where the third stop sensor's beam crosses the belt, y mm. */
  s3: number;
}

export const P2_BOXES: readonly BoxSpec[] = [BOX_A, BOX_B, BOX_C];
/** The first two sensors are bolted down; the third can be moved along the belt. */
export const P2_SENSORS_FIXED = [P1_STOP_Y, 40] as const;
export const P2_S3_RANGE = [-40, 330] as const;
export const P2_APPROACH_RANGE = [20, 140] as const;

/** ①'s answer: the angles that put the tip on box A's top centre (IK, rounded to 0.1° as a person would type them). */
export function p1Answer(chain: readonly ChainSegment[]): P1Values {
  const r = toolPoseAt(chain, P1_TARGET, wristDown(P1_DEFAULT.j1, P1_DEFAULT.j2, P1_DEFAULT.j3));
  const q = r?.q ?? wristDown(P1_DEFAULT.j1, P1_DEFAULT.j2, P1_DEFAULT.j3);
  return { j1: Math.round(q[0] * 10) / 10, j2: Math.round(q[1] * 10) / 10, j3: Math.round(q[2] * 10) / 10 };
}

export const p2DefaultValues = (chain: readonly ChainSegment[]): P2Values => ({ mode: 'angles', pose: p1Answer(chain), targets: [null, null, null], approach: 80, s3: 275 });

export const p2Sensors = (s3: number) => [...P2_SENSORS_FIXED, s3];

/** Each box's top centre where it stops (what its sensor reports), mm. */
export function p2Readings(s3: number): Mm[] {
  return p2Sensors(s3).map((y, k) => [BELT.x, y + P2_BOXES[k].size[1] / 2, boxTop(P2_BOXES[k])]);
}

export interface P2Plan {
  target: Mm;
  /** IK angles at the target (null: no solution). */
  q: number[] | null;
  /** IK angles at the approach point above it (null: no solution). */
  approachQ: number[] | null;
  /** Distance of the target from the J1 axis, mm. */
  radiusMm: number;
}

/** What inverse kinematics makes of each box's target (좌표로 지정), or of the one pose (각도로 지정). */
export function p2Plan(chain: readonly ChainSegment[], v: P2Values): P2Plan[] {
  const readings = p2Readings(v.s3);
  const pose = wristDown(v.pose.j1, v.pose.j2, v.pose.j3);
  return readings.map((reading, k) => {
    const target = v.mode === 'angles' ? tipMm(chain, pose) : (v.targets[k] ?? reading);
    const q = v.mode === 'angles' ? pose : (toolPoseAt(chain, target)?.q ?? null);
    const above: Mm = [target[0], target[1], target[2] + v.approach];
    const approachQ = q ? (toolPoseAt(chain, above, q)?.q ?? null) : null;
    return { target, q, approachQ, radiusMm: Math.hypot(target[0], target[1]) };
  });
}

export function runP2(chain: readonly ChainSegment[], v: P2Values): LabRun {
  const sensors = p2Sensors(v.s3).map((y) => ({ y, gate: true }));
  const run = new CellRun(chain, { boxes: P2_BOXES.map((spec, k) => ({ spec, enterAt: k ? Infinity : 0 })), sensors, beltSpeed: 160, stopBeltAtGate: true });
  const plan = p2Plan(chain, v);
  let slot = 0;
  for (let k = 0; k < 3 && !run.stopped; k += 1) {
    const box = run.boxes[k];
    box.enterAt = run.t;
    run.gate(k, sensors[k].y);
    run.beltOn = true;
    if (!run.waitUntil(() => !run.beltOn && box.mode === 'belt', 8)) break;
    const p = plan[k];
    let done = false;
    if (!p.q) run.log('unreachable', `${box.spec.name} 자리 (${p.target.map((x) => x.toFixed(0)).join(', ')})에 손이 닿지 않아요`, { box: k, at: p.target });
    else {
      done = pickAndPlace(run, k, p.q, v.approach, slot);
      if (done) slot += 1;
    }
    if (run.stopped) break;
    if (!done) {
      // The gate drops and the belt carries the box off to the reject bin before the next one comes.
      run.gate(k, null);
      run.beltOn = true;
      run.waitUntil(() => box.mode === 'binned', 8);
    }
  }
  if (!run.stopped) run.moveJ(HOME_Q, SPEED.travel);
  return run.finish();
}

/** How far the tool reaches from the J1 axis at height z (tool down, along the belt's direction), mm, by bisection on the IK. */
export function reachAt(chain: readonly ChainSegment[], z: number, towardsY: number): number {
  const ang = Math.atan2(towardsY, BELT.x);
  let lo = 150;
  let hi = 420;
  for (let i = 0; i < 10; i += 1) {
    const r = (lo + hi) / 2;
    if (toolPoseAt(chain, [r * Math.cos(ang), r * Math.sin(ang), z])) lo = r;
    else hi = r;
  }
  return lo;
}

/* -------------------------------------------------------------------------- */
/* ③ 움직이는 상자를 놓친다                                                   */
/* -------------------------------------------------------------------------- */

export type MoveType = 'joint' | 'linear';

export interface P3Values {
  /** Belt speed, mm/s. */
  belt: number;
  /** The arm waits above this point of the belt, y mm. */
  waitY: number;
  /** After the sensor sees a box, wait this long before coming down, ms. */
  delayMs: number;
  move: MoveType;
  /** Arm speed, % (pymycobot's speed 1..100). */
  speed: number;
  /** The situation, not the student's: where the trigger sensor stands (default P3_SENSOR_Y), y mm (대단원 마무리 평가). */
  sensorY?: number;
}

export const P3_BOX = BOX_A;
/** The trigger sensor (it only reports; the belt never stops), y mm. */
export const P3_SENSOR_Y = 250;
/** Boxes come onto the belt this far apart, mm. */
export const P3_PITCH_MM = 600;
/** The arm waits this far above the box tops, mm. */
export const P3_WAIT_UP = 60;
export const P3_COUNT = 3;
/** The same box three times, numbered. */
export const P3_BOXES: readonly BoxSpec[] = Array.from({ length: P3_COUNT }, (_, k) => ({ ...P3_BOX, id: `A${k + 1}`, name: `상자 ${k + 1}`, color: ['#c9995f', '#bf8c55', '#d1a26a'][k] }));
export const P3_DEFAULT: P3Values = { belt: 120, waitY: -60, delayMs: 2000, move: 'linear', speed: 30 };
export const P3_RANGE = { belt: [60, 180], waitY: [-90, 160], delayMs: [0, 4000], speed: [10, 100] } as const;

export const p3Wait = (v: P3Values): Mm => [BELT.x, v.waitY, boxTop(P3_BOX) + P3_WAIT_UP];
/** The cup presses 1 mm into the top as it lands. */
export const p3Catch = (v: P3Values): Mm => [BELT.x, v.waitY, boxTop(P3_BOX) - 1];

export interface P3Timing {
  /** From the sensor seeing a box to the box's centre under the wait point, s. */
  boxS: number;
  /** The arm's way down (this move type and speed), s. */
  downS: number;
  /** Arrival − box: > 0 the arm is late, < 0 early, s. */
  offS: number;
  /** One catch, place and return, s. */
  cycleS: number;
  /** Time between boxes, s. */
  gapS: number;
  /** The wait and catch points are reachable. */
  ok: boolean;
}

/** The time plan, from the same trajectories the run follows (a dry run of one cycle). */
export function p3Timing(chain: readonly ChainSegment[], v: P3Values): P3Timing {
  const boxS = ((v.sensorY ?? P3_SENSOR_Y) + P3_BOX.size[1] / 2 - v.waitY) / v.belt;
  const gapS = P3_PITCH_MM / v.belt;
  const w = toolPoseAt(chain, p3Wait(v));
  const c = w && toolPoseAt(chain, p3Catch(v), w.q);
  if (!w || !c) return { boxS, downS: NaN, offS: NaN, cycleS: NaN, gapS, ok: false };
  const leg = (a: readonly number[], b: readonly number[], linear: boolean) => (linear ? linePlan(chain, a, tipMm(chain, b), v.speed).trajectory.durationS : jointMoveDuration(a, b, v.speed));
  const downS = leg(w.q, c.q, v.move === 'linear');
  // Down, up, to the pallet, down, let go, up, back: the legs runP3 makes (its first place on the pallet).
  const s = slotPoses(chain, 0, P3_BOX.size[2], w.q);
  const cycleS = s ? downS + leg(c.q, w.q, v.move === 'linear') + 2 * jointMoveDuration(w.q, s.over, v.speed) + 2 * jointMoveDuration(s.over, s.down, v.speed) + RELEASE_S : NaN;
  return { boxS, downS, offS: v.delayMs / 1000 + downS - boxS, cycleS, gapS, ok: true };
}

export function runP3(chain: readonly ChainSegment[], v: P3Values): LabRun {
  const boxes = P3_BOXES.map((spec, k) => ({ spec, enterAt: (k * P3_PITCH_MM) / v.belt }));
  const run = new CellRun(chain, { boxes, sensors: [{ y: v.sensorY ?? P3_SENSOR_Y, gate: false }], beltSpeed: v.belt, stopBeltAtGate: false });
  const wait = p3Wait(v);
  const w = toolPoseAt(chain, wait);
  const c = w && toolPoseAt(chain, p3Catch(v), w.q);
  if (!w || !c) {
    run.fail('unreachable', `대기 자리 (${wait.map((x) => x.toFixed(0)).join(', ')})에 손이 닿지 않아요`, { at: wait });
    return run.finish();
  }
  const go = (q: readonly number[], p: Mm) => (v.move === 'joint' ? run.moveJ(q, v.speed) : run.moveL(p, v.speed));
  if (run.moveJ(w.q, v.speed)) {
    let slot = 0;
    for (let k = 0; k < P3_COUNT && !run.stopped; k += 1) {
      const box = run.boxes[k];
      const fired = () => box.seen[0] !== null && run.t >= box.seen[0] + v.delayMs / 1000;
      if (!run.waitUntil(fired, 30)) break;
      const late = run.t - (box.seen[0]! + v.delayMs / 1000);
      run.log('start', late > 0.02 ? `팔이 돌아오느라 ${late.toFixed(1)} s 늦게 출발했어요` : `${box.spec.name}: 센서 후 ${(v.delayMs / 1000).toFixed(2)} s에 내려가요`, { box: k });
      if (!go(c.q, p3Catch(v))) break;
      const got = run.grip({ xy: CATCH_TOL_MM, z: 3 }, 0, k);
      if (!go(w.q, wait)) break;
      if (got < 0) {
        run.pumpOff();
        continue;
      }
      if (!place(run, got, slot, v.speed, v.speed)) break;
      slot += 1;
      if (!run.moveJ(w.q, v.speed)) break;
    }
    // The boxes still on the belt ride off the end.
    if (!run.stopped) run.waitUntil(() => run.boxes.every((b) => b.mode === 'placed' || b.mode === 'binned'), 8);
  }
  return run.finish();
}

/** Where each box was when the cup came down on its turn: box centre − cup, along the belt, mm (+: the box had not arrived, −: it had gone past). */
export function p3Offsets(run: LabRun): (number | null)[] {
  return run.boxes.map((_, k) => {
    const e = run.events.find((x) => (x.kind === 'grip' || x.kind === 'miss') && x.box === k);
    if (!e) return null;
    const i = Math.min(run.frames.length - 1, Math.round(e.t / FRAME_STEP_S));
    return run.frames[i].boxes[k].y - run.tip[i][1];
  });
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

export interface Check {
  label: string;
  ok: boolean;
  /** The measured value, as shown. */
  value: string;
}

export interface Verdict {
  pass: boolean;
  checks: Check[];
  /** One line: what happened. */
  headline: string;
  placed: number;
}

const placedCount = (run: LabRun) => run.boxes.filter((b) => b.mode === 'placed').length;
const firstOf = (run: LabRun, kind: LabEvent['kind']) => run.events.find((e) => e.kind === kind) ?? null;

export function verdict(p: ProblemId, run: LabRun): Verdict {
  const hit = run.failure;
  const noHit: Check = { label: '부딪히거나 관절 한계를 넘지 않음', ok: !hit, value: hit ? hit.text : '없음' };
  const placed = placedCount(run);
  if (p === 1) {
    const grip = firstOf(run, 'grip');
    const miss = firstOf(run, 'miss');
    const d = grip?.mm ?? miss?.mm ?? null;
    const checks: Check[] = [
      { label: `손끝이 상자 가운데에서 ${GRIP_TOL_MM} mm 안`, ok: !!grip, value: d === null ? '내려가지 못함' : `${d.toFixed(1)} mm` },
      noHit,
      { label: '팔레트에 내려놓음', ok: placed === 1, value: placed === 1 ? '했어요' : '못 했어요' },
    ];
    const headline = hit
      ? hit.text
      : grip
        ? `상자를 집어 팔레트에 놓았어요 (가운데에서 ${d!.toFixed(1)} mm)`
        : miss
          ? `흡착 컵이 상자 옆 허공에 내려왔어요 (${d!.toFixed(1)} mm 빗나감)`
          : '상자에 내려가지 못했어요';
    return { pass: checks.every((c) => c.ok), checks, headline, placed };
  }
  if (p === 2) {
    const unreachable = run.events.filter((e) => e.kind === 'unreachable');
    const checks: Check[] = [
      { label: '상자 3개를 모두 집어 팔레트에 놓음', ok: placed === 3, value: `${placed} / 3개` },
      { label: '손이 닿지 않는 자리가 없음', ok: unreachable.length === 0, value: unreachable.length ? `${unreachable.length}곳` : '없음' },
      noHit,
    ];
    const misses = run.events.filter((e) => e.kind === 'miss').length;
    const headline = hit
      ? hit.text
      : placed === 3
        ? '상자 3개를 모두 옮겼어요'
        : `${placed}개만 옮겼어요${misses ? ` · 빗나감 ${misses}번` : ''}${unreachable.length ? ` · 닿지 않는 자리 ${unreachable.length}곳` : ''}`;
    return { pass: checks.every((c) => c.ok), checks, headline, placed };
  }
  const caught = run.events.filter((e) => e.kind === 'grip').length;
  const checks: Check[] = [
    { label: `상자 ${P3_COUNT}개를 연달아 잡음`, ok: caught === P3_COUNT, value: `${caught} / ${P3_COUNT}개` },
    noHit,
    { label: '잡은 상자를 팔레트에 놓음', ok: placed === P3_COUNT, value: `${placed} / ${P3_COUNT}개` },
  ];
  const headline = hit ? hit.text : caught === P3_COUNT ? `상자 ${P3_COUNT}개를 모두 잡았어요` : `${P3_COUNT}개 중 ${caught}개만 잡았어요. ${P3_COUNT - caught}개는 지나갔어요`;
  return { pass: checks.every((c) => c.ok), checks, headline, placed };
}

/** The distance from the tip to the box centre for a run of ① (grip or miss), mm. */
export const p1Miss = (run: LabRun): number | null => (firstOf(run, 'grip') ?? firstOf(run, 'miss'))?.mm ?? null;

export { dist as distanceMm };

/* -------------------------------------------------------------------------- */
/* A worked fix (the check and the screen's guide pictures use it)            */
/* -------------------------------------------------------------------------- */

/** Values that solve each problem: ①'s IK answer, ② coordinates with sensor 3 moved in and a lower approach, ③ a planned timing. */
export function referenceFix(chain: readonly ChainSegment[], p: ProblemId): P1Values | P2Values | P3Values {
  if (p === 1) return p1Answer(chain);
  if (p === 2) return { ...p2DefaultValues(chain), mode: 'coords', s3: 170, approach: 40 };
  const base = { belt: 120, waitY: 40, move: 'joint' as const, speed: 80 };
  const t = p3Timing(chain, { ...base, delayMs: 0 });
  return { ...base, delayMs: Math.round((t.boxS - t.downS) * 100) * 10 };
}

/* -------------------------------------------------------------------------- */
/* What happened to each box                                                  */
/* -------------------------------------------------------------------------- */

export interface BoxOutcome {
  name: string;
  ok: boolean;
  /** Short, as shown: "놓음 · 0.5 mm", "빗나감 100.5 mm", "닿을 수 없음", "지나감", "부딪힘". */
  text: string;
  /** The distance that goes with it (cup to the box's top centre), mm. */
  mm: number | null;
}

export function outcomes(run: LabRun): BoxOutcome[] {
  return run.boxes.map((b, k) => {
    const of = (kind: LabEvent['kind']) => run.events.find((e) => e.box === k && e.kind === kind);
    const name = b.spec.name;
    const grip = of('grip');
    const miss = of('miss');
    if (of('hit')) return { name, ok: false, text: '부딪힘', mm: null };
    if (grip) return { name, ok: b.mode === 'placed', text: b.mode === 'placed' ? `놓음 · ${grip.mm!.toFixed(1)} mm` : '집음', mm: grip.mm ?? null };
    if (of('unreachable')) return { name, ok: false, text: '닿을 수 없음', mm: null };
    if (miss) return { name, ok: false, text: miss.mm !== undefined ? `빗나감 ${miss.mm.toFixed(1)} mm` : '지나감', mm: miss.mm ?? null };
    return { name, ok: false, text: b.mode === 'binned' || b.mode === 'falling' ? '지나감' : '못 함', mm: null };
  });
}
