/**
 * One run of the conveyor cell, stepped in time: the belt carries the boxes, the stop sensors and
 * gates hold them, the arm follows real trajectories (robot/motion.ts: the quintic joint move and
 * the IK-sampled straight line, timed by the speed setting) and every 10 ms the arm is checked
 * against the cell (physics/collide.ts) and the suction cup against the boxes. The result is a list
 * of frames (every 20 ms) the screen plays back, the events (sensor, 흡착, 빗나감, 부딪힘 …) and
 * the tool tip's path — the numbers the problems show come from here, never from a table.
 *
 * No React, no WebGL: tests/education/lab-check.mts runs the same runs headless.
 */

import { poseContact, type Box } from '../../physics/collide';
import type { ChainSegment } from '../../robot/kinematics';
import { isWithinJointLimits } from '../../robot/limits';
import { jointTrajectory, linearPath, tcpPositionMm, type LinearPlan, type Trajectory } from '../../robot/motion';
import { STRAIGHT_DOWN, currentOrientation, solveToolPose, type PointMm } from '../../robot/tool';
import { BELT, BIN, CUP_R, HOME_Q, PALLET, PRESS_MM, TCP_MM, fixedBoxes, type BoxSpec, type Mm } from './cell';

/** Simulation step and the playback frame interval, s. */
const DT = 0.01;
const FRAME_DT = 0.02;

/** Where a box is: waiting to come on, on the belt, on the cup, on the pallet, falling off the end, in the bin. */
export type BoxMode = 'wait' | 'belt' | 'held' | 'placed' | 'falling' | 'binned';

export interface BoxState {
  spec: BoxSpec;
  x: number;
  y: number;
  /** Centre height, mm. */
  z: number;
  mode: BoxMode;
  /** When it comes onto the belt, s. */
  enterAt: number;
  /** A raised gate: the box's front face stops at this y (null: rides on). */
  stopAt: number | null;
  /** When its front face first crossed each sensor, by sensor index (s). */
  seen: (number | null)[];
  /** Falling speed, mm/s. */
  vz: number;
}

/** One picture of the run. */
export interface Frame {
  t: number;
  q: number[];
  pump: boolean;
  /** How far the belt has moved, mm (scrolls its texture). */
  travel: number;
  /** Box centres and modes, in the order of the run's boxes. */
  boxes: { x: number; y: number; z: number; mode: BoxMode }[];
  /** Which sensors' beams a box breaks now. */
  beams: boolean[];
}

export type EventKind = 'sensor' | 'start' | 'grip' | 'miss' | 'hit' | 'place' | 'unreachable' | 'limit' | 'passed';

export interface LabEvent {
  t: number;
  kind: EventKind;
  /** The box it is about (index into the run's boxes). */
  box?: number;
  text: string;
  /** Where, mm. */
  at?: Mm;
  /** A distance that goes with it (빗나감 mm, …). */
  mm?: number;
  /** For 흡착 and 빗나감: the box's top centre (`at` is the cup). */
  to?: Mm;
}

export interface Sensor {
  y: number;
  /** A gate stops boxes here (stop sensor), or the sensor only reports (trigger sensor). */
  gate: boolean;
}

export interface RunOptions {
  boxes: readonly { spec: BoxSpec; enterAt: number }[];
  sensors: readonly Sensor[];
  /** Belt speed, mm/s. */
  beltSpeed: number;
  /** Stop the belt while a box stands at a raised gate (problems ① ②). */
  stopBeltAtGate: boolean;
}

export interface LabRun {
  frames: Frame[];
  events: LabEvent[];
  durationS: number;
  /** The first collision or limit that stopped the run, else null. */
  failure: LabEvent | null;
  boxes: BoxState[];
  /** Tool tip every frame, mm. */
  tip: Mm[];
  sensors: readonly Sensor[];
  beltSpeed: number;
}

const tipOf = (chain: readonly ChainSegment[], q: readonly number[]): Mm => {
  const p = tcpPositionMm(chain, q, TCP_MM);
  return [p.x, p.y, p.z];
};

/** The tool held straight down at a point, by the engine's IK (null: the arm cannot reach it so). */
export function toolPoseAt(chain: readonly ChainSegment[], p: Mm, seed: readonly number[] = HOME_Q): { q: number[]; errMm: number } | null {
  const r = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm: TCP_MM });
  return r.converged ? { q: r.anglesDeg, errMm: r.positionErrorM * 1000 } : null;
}

export const boxTopZ = (b: BoxState) => b.z + b.spec.size[2] / 2;

/** Last sound of a name read aloud (상자 A, 상자 1 …): does it end in a consonant (받침)? */
function batchim(word: string): boolean {
  const c = word.trim().slice(-1);
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 영 일 이 삼 사 오 육 칠 팔 구 · 엘 엠 엔 알 (the other letters end in a vowel).
  if (/[0-9]/.test(c)) return '013678'.includes(c);
  return /[LMNRlmnr]/.test(c);
}

/** A name with its particle: 을/를, 이/가, 은/는 (pass the form after a consonant). */
export function josa(word: string, after: '을' | '이' | '은'): string {
  const pair = { 을: ['을', '를'], 이: ['이', '가'], 은: ['은', '는'] }[after];
  return word + (batchim(word) ? pair[0] : pair[1]);
}

/** The time-stepped cell. A problem drives it with move / wait / grip / release. */
export class CellRun {
  t = 0;
  q: number[];
  pump = false;
  travel = 0;
  beltOn = true;
  boxes: BoxState[];
  frames: Frame[] = [];
  events: LabEvent[] = [];
  tip: Mm[] = [];
  failure: LabEvent | null = null;
  held: { index: number; off: Mm } | null = null;
  readonly fixed: Box[];
  private nextFrame = 0;
  /** A box index the cup may press from above without it counting as a hit (the one being picked). */
  private pressing = new Set<number>();
  /** The cup was already low beside a box last step (so a box moving in is a side hit). */
  private lastTip: Mm;

  constructor(
    readonly chain: readonly ChainSegment[],
    readonly opts: RunOptions,
    start: readonly number[] = HOME_Q,
  ) {
    this.q = start.slice();
    this.fixed = fixedBoxes(opts.sensors.map((s) => s.y));
    this.boxes = opts.boxes.map(({ spec, enterAt }) => ({
      spec,
      x: BELT.x,
      y: BELT.yIn - spec.size[1] / 2 - 4,
      z: BELT.top + spec.size[2] / 2,
      mode: 'wait',
      enterAt,
      stopAt: null,
      seen: opts.sensors.map(() => null),
      vz: 0,
    }));
    this.lastTip = tipOf(chain, this.q);
    this.record();
  }

  get stopped(): boolean {
    return !!this.failure;
  }

  tipNow(): Mm {
    return tipOf(this.chain, this.q);
  }

  log(kind: EventKind, text: string, extra: Partial<LabEvent> = {}): LabEvent {
    const e: LabEvent = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }

  fail(kind: EventKind, text: string, extra: Partial<LabEvent> = {}): false {
    this.failure ??= this.log(kind, text, extra);
    return false;
  }

  /** Raise box `i`'s gate at a sensor (its front face stops there), or lower it (null). */
  gate(i: number, y: number | null) {
    this.boxes[i].stopAt = y;
  }

  private record() {
    this.frames.push({
      t: this.t,
      q: this.q.slice(),
      pump: this.pump,
      travel: this.travel,
      boxes: this.boxes.map((b) => ({ x: b.x, y: b.y, z: b.z, mode: b.mode })),
      beams: this.opts.sensors.map((s) => this.boxes.some((b) => (b.mode === 'belt' || b.mode === 'held') && Math.abs(b.y - s.y) < b.spec.size[1] / 2 && b.z - b.spec.size[2] / 2 < BELT.top + 30)),
    });
    this.tip.push(tipOf(this.chain, this.q));
    this.nextFrame += FRAME_DT;
  }

  /** Advance the belt, the boxes and the checks by one step. False when the run has stopped. */
  private step(): boolean {
    this.t += DT;
    const v = this.opts.beltSpeed;
    const order = this.boxes.map((_, i) => i).sort((a, b) => this.boxes[a].y - this.boxes[b].y);
    let blocked = false;
    for (const b of this.boxes) {
      if (b.mode === 'wait' && this.t >= b.enterAt) b.mode = 'belt';
    }
    if (this.beltOn) this.travel += v * DT;
    // Boxes nearest the end first, so a box can queue behind the one in front of it.
    for (const i of order) {
      const b = this.boxes[i];
      if (b.mode === 'belt') {
        if (!this.beltOn) continue;
        let y = b.y - v * DT;
        const half = b.spec.size[1] / 2;
        if (b.stopAt !== null && y - half <= b.stopAt && b.y - half >= b.stopAt - 0.5) {
          y = b.stopAt + half;
          blocked = true;
        }
        for (const j of order) {
          const o = this.boxes[j];
          if (j === i || o.mode !== 'belt' || o.y >= b.y) continue;
          const touch = o.y + o.spec.size[1] / 2 + half + 2;
          if (y < touch) {
            y = Math.max(y, touch);
          }
        }
        b.y = y;
        this.opts.sensors.forEach((s, k) => {
          if (b.seen[k] === null && b.y - half <= s.y) {
            b.seen[k] = this.t;
            this.log('sensor', `${k + 1}번 센서가 ${josa(b.spec.name, '을')} 봤어요`, { box: i, at: [s.y, 0, 0] });
          }
        });
        if (b.y + half < BELT.yOut) {
          b.mode = 'falling';
          this.log('passed', `${josa(b.spec.name, '이')} 끝까지 가서 불량 상자함에 떨어졌어요`, { box: i });
        }
      } else if (b.mode === 'falling') {
        b.y -= v * 0.6 * DT;
        b.vz += 9810 * DT;
        b.z -= b.vz * DT;
        const floor = BIN.floor + b.spec.size[2] / 2;
        if (b.z <= floor) {
          b.z = floor;
          b.y = Math.min(BIN.y + BIN.sy / 2 - b.spec.size[1] / 2 - 4, Math.max(b.y, BIN.y - BIN.sy / 2 + b.spec.size[1] / 2 + 4));
          b.mode = 'binned';
        }
      }
    }
    if (this.opts.stopBeltAtGate && blocked) this.beltOn = false;

    // The held box rides on the cup.
    const tip = tipOf(this.chain, this.q);
    if (this.held) {
      const b = this.boxes[this.held.index];
      b.x = tip[0] + this.held.off[0];
      b.y = tip[1] + this.held.off[1];
      b.z = tip[2] + this.held.off[2];
    }

    this.check(tip);
    this.lastTip = tip;
    if (this.t + 1e-9 >= this.nextFrame) this.record();
    return !this.failure;
  }

  /** The arm against the cell, the cup against the boxes, the carried box against everything. */
  private check(tip: Mm) {
    if (!isWithinJointLimits(this.q)) {
      this.fail('limit', '관절이 움직일 수 있는 범위를 넘었어요', { at: tip });
      return;
    }
    const c = poseContact(this.chain, this.q, this.fixed, TCP_MM);
    if (c) {
      this.fail('hit', `팔이 ${c.what}에 닿았어요`, { at: c.at });
      return;
    }
    this.boxes.forEach((b, i) => {
      if (this.failure || (b.mode !== 'belt' && b.mode !== 'placed')) return;
      const [sx, sy] = b.spec.size;
      const top = boxTopZ(b);
      const dx = Math.abs(tip[0] - b.x);
      const dy = Math.abs(tip[1] - b.y);
      const over = dx < sx / 2 + CUP_R && dy < sy / 2 + CUP_R && tip[2] < top && tip[2] > b.z - b.spec.size[2] / 2 - 20;
      if (!over) {
        this.pressing.delete(i);
        return;
      }
      const inside = dx <= sx / 2 - CUP_R && dy <= sy / 2 - CUP_R;
      // Coming down onto the top from above: the cup presses, which is how it picks.
      const fromAbove = this.pressing.has(i) || this.lastTip[2] >= top - 0.01;
      if (inside && fromAbove && tip[2] >= top - PRESS_MM) {
        this.pressing.add(i);
        return;
      }
      const text =
        inside && fromAbove
          ? `흡착 컵이 ${josa(b.spec.name, '을')} ${(top - tip[2]).toFixed(0)} mm 눌러 찌그러뜨렸어요`
          : fromAbove
            ? `흡착 컵이 ${b.spec.name} 모서리에 걸렸어요`
            : `${josa(b.spec.name, '이')} 흡착 컵에 부딪혔어요`;
      this.fail('hit', text, { box: i, at: [tip[0], tip[1], top] });
    });
    if (this.failure || !this.held) return;
    const h = this.boxes[this.held.index];
    const hb = boxOf(h, 1);
    for (const f of this.fixed) {
      if (overlap(hb, f)) {
        this.fail('hit', `들고 있는 ${josa(h.spec.name, '이')} ${f.name}에 부딪혔어요`, { at: [h.x, h.y, h.z] });
        return;
      }
    }
    this.boxes.forEach((o, j) => {
      if (this.failure || j === this.held!.index || (o.mode !== 'belt' && o.mode !== 'placed')) return;
      if (overlap(hb, boxOf(o, 1))) this.fail('hit', `들고 있는 ${josa(h.spec.name, '이')} ${o.spec.name}에 부딪혔어요`, { at: [h.x, h.y, h.z] });
    });
  }

  /** Follow a trajectory to its end (false: the run stopped on the way). */
  follow(traj: Trajectory): boolean {
    const start = this.t;
    while (!this.failure) {
      const s = Math.min(traj.durationS, this.t + DT - start);
      this.q = traj.sample(s);
      this.step();
      if (s >= traj.durationS) break;
    }
    return !this.failure;
  }

  /** Joint move (all joints start and stop together), speed 1..100. */
  moveJ(to: readonly number[], speed: number): boolean {
    return this.follow(jointTrajectory(this.q, to, speed));
  }

  /** Straight line of the tool tip to `p`, the tool held as it is (straight down or leaning as the IK set it), speed 1..100. */
  moveL(p: Mm, speed: number): boolean {
    const plan = linePlan(this.chain, this.q, p, speed);
    if (!plan.ok) return this.fail('unreachable', `(${p.map((v) => v.toFixed(0)).join(', ')})까지 곧게 갈 수 없어요`, { at: p });
    return this.follow(plan.trajectory);
  }

  wait(s: number): boolean {
    const end = this.t + s;
    while (!this.failure && this.t < end - 1e-9) this.step();
    return !this.failure;
  }

  /** Step until `done()` or `maxS` has passed; true when done. */
  waitUntil(done: () => boolean, maxS: number): boolean {
    const end = this.t + maxS;
    while (!this.failure && !done() && this.t < end) this.step();
    return !this.failure && done();
  }

  /**
   * Pump on: the box whose top centre is nearest the cup (or box `only`) is held when the cup is
   * within `xy` (sideways) and `z` (up or down) of it, or within `d3` in space when given.
   * Returns the box, or logs 빗나감 with the distance and returns -1.
   */
  grip(tol: { xy: number; z: number; d3?: number }, dwellS = 0.15, only?: number): number {
    this.pump = true;
    if (dwellS > 0 && !this.wait(dwellS)) return -1;
    const tip = this.tipNow();
    let best = -1;
    let bestD = Infinity;
    this.boxes.forEach((b, i) => {
      if (only !== undefined ? i !== only : b.mode !== 'belt') return;
      const d = Math.hypot(tip[0] - b.x, tip[1] - b.y, tip[2] - boxTopZ(b));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const b = best >= 0 ? this.boxes[best] : null;
    if (!b || b.mode !== 'belt') {
      this.log('miss', b ? `${josa(b.spec.name, '은')} 벌써 지나갔어요` : '흡착할 상자가 없어요', { box: best >= 0 ? best : undefined, at: tip });
      return -1;
    }
    const top = boxTopZ(b);
    const xy = Math.hypot(tip[0] - b.x, tip[1] - b.y);
    const ok = tol.d3 !== undefined ? bestD <= tol.d3 : xy <= tol.xy && Math.abs(tip[2] - top) <= tol.z;
    if (!ok) {
      this.log('miss', `${b.spec.name} 가운데에서 ${bestD.toFixed(1)} mm 빗나갔어요`, { box: best, at: tip, to: [b.x, b.y, top], mm: bestD });
      return -1;
    }
    this.held = { index: best, off: [b.x - tip[0], b.y - tip[1], b.z - tip[2]] };
    b.mode = 'held';
    this.pressing.delete(best);
    this.log('grip', `${josa(b.spec.name, '을')} 흡착했어요 (가운데에서 ${bestD.toFixed(1)} mm)`, { box: best, at: tip, to: [b.x, b.y, top], mm: bestD });
    return best;
  }

  /** Pump off: the held box rests where it is (on the pallet). */
  release(dwellS = 0.1): void {
    this.pump = false;
    if (!this.held) return;
    const b = this.boxes[this.held.index];
    b.mode = 'placed';
    b.z = PALLET.top + b.spec.size[2] / 2;
    this.held = null;
    this.log('place', `${josa(b.spec.name, '을')} 팔레트에 내려놓았어요`, { box: this.boxes.indexOf(b), at: [b.x, b.y, b.z] });
    this.wait(dwellS);
  }

  /** Pump off with nothing on it. */
  pumpOff(): void {
    this.pump = false;
  }

  finish(): LabRun {
    if (this.t + 1e-9 < this.nextFrame - FRAME_DT / 2) this.record();
    return { frames: this.frames, events: this.events, durationS: this.t, failure: this.failure, boxes: this.boxes, tip: this.tip, sensors: this.opts.sensors, beltSpeed: this.opts.beltSpeed };
  }
}

const toPoint = (p: Mm): PointMm => ({ x: p[0], y: p[1], z: p[2] });

/** The straight-line move from pose `q` to point `p`, keeping the tool's present orientation (robot/motion.ts linearPath). */
export function linePlan(chain: readonly ChainSegment[], q: readonly number[], p: Mm, speed: number): LinearPlan {
  const o = currentOrientation(chain, q, TCP_MM) ?? STRAIGHT_DOWN;
  return linearPath(chain, q, toPoint(tipOf(chain, q)), toPoint(p), TCP_MM, speed, o);
}

/** A box state as an axis-aligned box, shrunk by `shrink` mm. */
function boxOf(b: BoxState, shrink = 0): Box {
  const [sx, sy, sz] = b.spec.size;
  return { min: [b.x - sx / 2 + shrink, b.y - sy / 2 + shrink, b.z - sz / 2 + shrink], max: [b.x + sx / 2 - shrink, b.y + sy / 2 - shrink, b.z + sz / 2 - shrink] };
}

function overlap(a: Box, b: Box): boolean {
  return a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1] && a.min[2] < b.max[2] && a.max[2] > b.min[2];
}

/** The frame at time t (the one at or just before it; the screen blends nothing, frames are 20 ms apart). */
export function frameAt(run: LabRun, t: number): Frame {
  const i = Math.min(run.frames.length - 1, Math.max(0, Math.round(t / FRAME_DT)));
  return run.frames[i];
}

export const FRAME_STEP_S = FRAME_DT;
