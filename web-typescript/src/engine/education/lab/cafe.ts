/**
 * 로봇 시티 · 스마트시티 — 카페(①②)와 돌봄(③) (myCobot 280 RDK X5 + 어댑티브 그리퍼, real size). The
 * arm takes a drink from the bar and hands it to the customer at the pickup counter. Three problems,
 * each a run the screen plays back (CafeCell) and reads its numbers from:
 *
 *  ① 커피가 넘친다 — the carry is a straight move with a trapezoid speed profile; the program's
 *    acceleration (4 m/s², from the empty-cup program) tilts the coffee's surface by a/g, past the
 *    cup's spill slope 2h ÷ d. The fix is the acceleration (3-2 궤적 프로파일).
 *  ② 손과 가까워진다 — a customer reaches for the cup while it is still coming. The counter's
 *    sensor stops the arm when a hand comes within the detection distance, but at full speed the
 *    distance closed while it reacts and brakes is larger than that. The fix is the speed near the
 *    counter and/or the detection distance: the protective distance
 *    S = (v_hand + v_robot) t_react + v_robot² ÷ (2a) + v_hand × v_robot ÷ a must be under it (5-4).
 *  ③ 물병이 무거워졌다 (돌봄) — a care-assist mobile manipulator (the same arm on a myAGV, parked)
 *    hands an elderly resident a full water bottle, three times the cup's weight. The turn from the
 *    mini fridge to the resident's low table (J1 only, 1.4 s — about as fast as J1 can go) needs
 *    τ = I α, I growing with m r² — more than the care mode's J1 torque limit (CARE_J1_LIMIT, a
 *    safety setting well under the servo's maximum) and the arm stops. The fix: turn with the bottle
 *    closer in, and/or take longer (α ∝ 1/T²) (4-2 관성과 가속 토크); a shorter time is no way out —
 *    J1 cannot turn faster than J1_MAX_SPEED. Torques from the arm's inverse dynamics (physics/
 *    dynamics.ts, its estimated masses).
 *
 * No React, no WebGL: tests/education/cafe-check.mts runs these headless.
 */

import { poseContact } from '../../physics/collide';
import { inverseDynamics, torqueLimits, GRAVITY } from '../../physics/dynamics';
import { forwardKinematicsFrames, type ChainSegment } from '../../robot/kinematics';
import { jointTrajectory, peakJointSpeedDegS, QUINTIC_PEAK_RATE } from '../../robot/motion';
import { solveToolPose } from '../../robot/tool';
import { tcpFor } from '../../simulator/effectors';
import { HOME_Q, type Mm } from './cell';

export type CafeProblem = 1 | 2 | 3;

/** The official adaptive gripper: flange to the point between the fingertips, mm. */
export const TOOL_MM = tcpFor('adaptive', false);
export const GAP = { open: 43, closed: 37 } as const;

/** The tasting cup: outer diameter (where held), inner diameter, height; coffee 5 mm below the rim; full weight, kg. */
export const CUP = { d: 40, inner: 36, h: 55, headspace: 5, kg: 0.06 } as const;
/** ③: the full water bottle: diameter, height, weight, kg. */
export const BOTTLE = { d: 40, h: 120, kg: 0.18 } as const;
/** The cup spills once its surface slope passes 2h ÷ d; the acceleration that does it, m/s². */
export const SPILL_SLOPE = (2 * CUP.headspace) / CUP.inner;
export const SPILL_ACC = SPILL_SLOPE * GRAVITY;

/** Where the cup is held (grip point height above the bench), and carried, mm. */
export const GRIP_Z = 35;
export const CARRY_Z = 110;
/** The bar (where drinks are made) and the pickup spot on the counter, mm. */
export const BAR: readonly [number, number] = [170, 120];
export const PICKUP: readonly [number, number] = [170, -150];
/** ③: the mini fridge's shelf behind on the left (the resident's low table is at PICKUP), mm. */
export const FRIDGE: readonly [number, number] = [-40, 190];
/** The counter's edge (customers stand beyond it), y, mm. */
export const COUNTER_EDGE_Y = -200;

/** ②: the customer's reach: hand speed (mm/s), where it starts, the counter sensor's reaction time (s), the arm's braking (m/s², kept under the spill acceleration). */
export const HAND = { speed: 250, startY: -380, react: 0.1, brake: 2 } as const;
/** ②: the zone near the counter where the zone speed applies, mm before the pickup spot. */
export const ZONE_MM = 120;

/** The J1 servo's torque limit (N·m) — the estimated limit the 4단원 screens use (its floor is the J4 wrist figure). Not ③'s limit: see CARE_J1_LIMIT. */
export const j1Limit = (chain: readonly ChainSegment[]) => torqueLimits(chain, TOOL_MM)[0];

/**
 * ③: 돌봄 모드 J1 토크 제한, N·m. A care robot works right beside people, so its controller holds J1
 * well under what the servo could give (j1Limit, ~0.285): if the arm swings into a resident it
 * pushes softly (5-4 힘 제한). This is the care mode's safety setting, not the servo's maximum —
 * turning faster than it allows trips the overload stop.
 */
export const CARE_J1_LIMIT = 0.12;
/** ③: J1's top speed, °/s — the simulator's joints top out here (robot/motion.ts: speed 100 → 200 °/s). */
export const J1_MAX_SPEED = peakJointSpeedDegS(100);
/** ③: the J1 turn's peak speed (°/s) for its angle (°) in T s — a quintic peaks at 1.875 × angle ÷ T. */
export const turnPeakSpeed = (dqDeg: number, T: number) => (QUINTIC_PEAK_RATE * Math.abs(dqDeg)) / T;

/* --- values ------------------------------------------------------------------------------ */

/** ①: the carry's top speed (mm/s) and acceleration (m/s²). */
export interface CarryValues {
  speed: number;
  acc: number;
}
/** ②: the speed in the counter zone (mm/s) and the sensor's detection distance (mm). */
export interface GuardValues {
  zoneSpeed: number;
  detect: number;
  /** The situation, not the student's: the counter sensor's reaction time (default HAND.react; 대단원 마무리 평가), s. */
  react?: number;
}
/** ③: how far out from J1 the bottle is carried while turning (mm), and the turn's time (s). */
export interface TurnValues {
  radius: number;
  time: number;
}
export type CafeValues = CarryValues | GuardValues | TurnValues;

export const CAFE_DEFAULTS: Record<CafeProblem, CafeValues> = {
  1: { speed: 250, acc: 4 },
  2: { zoneSpeed: 250, detect: 50 },
  3: { radius: 230, time: 1.4 },
};
export const CAFE_FIXES: Record<CafeProblem, CafeValues> = {
  1: { speed: 250, acc: 2 },
  2: { zoneSpeed: 100, detect: 90 },
  3: { radius: 180, time: 1.4 },
};

/* --- the run ------------------------------------------------------------------------------ */

export type DrinkMode = 'bar' | 'held' | 'served' | 'fridge' | 'taken';

export interface CafeFrame {
  t: number;
  q: number[];
  gap: number;
  /** The drink's bottom centre, mm. */
  drink: Mm;
  mode: DrinkMode;
  /** ①: the coffee surface's slope (x, y — it rises towards that way), and how full the cup is. */
  slope: [number, number];
  left: number;
  /** ②: the customer's fingertip (null: no hand). */
  hand: Mm | null;
  /** ③: J1's torque, N·m. */
  tau: number;
  alarm: boolean;
}

export type CafeEventKind = 'grip' | 'serve' | 'spill' | 'detect' | 'stop' | 'touch' | 'handover' | 'overload' | 'overspeed' | 'unreachable' | 'hit' | 'done';

export interface CafeEvent {
  t: number;
  kind: CafeEventKind;
  text: string;
  at?: Mm;
  value?: number;
}

export interface CafeRun {
  values: CafeValues;
  frames: CafeFrame[];
  events: CafeEvent[];
  durationS: number;
  failure: CafeEvent | null;
  tip: Mm[];
  /** ①: the largest surface slope and acceleration; the carry's time. */
  maxSlope: number;
  maxAcc: number;
  carryS: number;
  /** ②: the gap between cup and hand when the arm came to rest (null: it never stopped for the hand), and the speed at contact (0: none). */
  stopGap: number | null;
  hitSpeed: number;
  /** ③: the largest J1 torque, the turn's peak angular acceleration (rad/s²) and peak speed (°/s). */
  maxTau: number;
  peakAlpha: number;
  peakSpeed: number;
  served: boolean;
}

const DT = 0.01;
const FRAME_DT = 0.02;
const SPEED = { travel: 50, down: 30 };

export function toolAt(chain: readonly ChainSegment[], q: readonly number[]): Mm {
  const f = forwardKinematicsFrames(chain, q);
  const e = f[f.length - 1].elements;
  return [e[12] * 1000 + e[8] * TOOL_MM, e[13] * 1000 + e[9] * TOOL_MM, e[14] * 1000 + e[10] * TOOL_MM];
}

/** The tool straight down at a point (null: out of reach). */
export function poseAt(chain: readonly ChainSegment[], p: Mm, seed: readonly number[] = HOME_Q): number[] | null {
  const r = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm: TOOL_MM, orientation: { yawDeg: 0, tiltDeg: 0 } });
  return r.converged ? r.anglesDeg : null;
}

/** A trapezoid speed profile over a distance (mm) with a top speed (mm/s) and acceleration (mm/s²): s(t), v(t), a(t) and its time. */
export function trapezoid(dist: number, vmax: number, acc: number) {
  const tAcc = vmax / acc;
  const dAcc = (acc * tAcc * tAcc) / 2;
  const tri = 2 * dAcc > dist;
  const v = tri ? Math.sqrt(dist * acc) : vmax;
  const ta = v / acc;
  const tc = tri ? 0 : (dist - 2 * dAcc) / vmax;
  const T = 2 * ta + tc;
  const at = (t: number) => {
    if (t <= 0) return { s: 0, v: 0, a: acc };
    if (t < ta) return { s: (acc * t * t) / 2, v: acc * t, a: acc };
    if (t < ta + tc) return { s: (acc * ta * ta) / 2 + v * (t - ta), v, a: 0 };
    if (t < T) {
      const u = T - t;
      return { s: dist - (acc * u * u) / 2, v: acc * u, a: -acc };
    }
    return { s: dist, v: 0, a: 0 };
  };
  return { T, vTop: v, at };
}

class CafeSim {
  t = 0;
  q: number[] = HOME_Q.slice();
  gap: number = GAP.open;
  drink: Mm;
  mode: DrinkMode;
  slope: [number, number] = [0, 0];
  left = 1;
  hand: Mm | null = null;
  tau = 0;
  frames: CafeFrame[] = [];
  events: CafeEvent[] = [];
  tip: Mm[] = [];
  failure: CafeEvent | null = null;
  maxSlope = 0;
  maxAcc = 0;
  maxTau = 0;
  private nextFrame = 0;

  constructor(
    readonly chain: readonly ChainSegment[],
    start: readonly number[],
    mode: DrinkMode,
  ) {
    this.drink = [start[0], start[1], 0];
    this.mode = mode;
    this.snap();
  }

  get stopped() {
    return !!this.failure && this.failure.kind !== 'spill';
  }

  log(kind: CafeEventKind, text: string, extra: Partial<CafeEvent> = {}): CafeEvent {
    const e = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }
  fail(kind: CafeEventKind, text: string, extra: Partial<CafeEvent> = {}): false {
    const e = this.log(kind, text, extra);
    this.failure ??= e;
    return false;
  }

  snap(): void {
    const tip = toolAt(this.chain, this.q);
    if (this.mode === 'held') this.drink = [tip[0], tip[1], tip[2] - GRIP_Z];
    if (this.t + 1e-9 >= this.nextFrame) {
      this.nextFrame += FRAME_DT;
      this.frames.push({ t: this.t, q: this.q.slice(), gap: this.gap, drink: [...this.drink] as Mm, mode: this.mode, slope: [...this.slope] as [number, number], left: this.left, hand: this.hand ? ([...this.hand] as Mm) : null, tau: this.tau, alarm: this.stopped });
      this.tip.push(tip);
    }
  }

  step(dt: number): void {
    this.t += dt;
    this.snap();
  }

  moveJ(to: readonly number[], speed: number): boolean {
    if (this.stopped) return false;
    const tr = jointTrajectory(this.q, to, speed);
    const steps = Math.max(1, Math.ceil(tr.durationS / DT));
    for (let k = 1; k <= steps; k += 1) {
      this.q = tr.sample((k / steps) * tr.durationS);
      const c = poseContact(this.chain, this.q, [], TOOL_MM);
      if (c) {
        this.step(tr.durationS / steps);
        return this.fail('hit', `J${c.joint} 쪽이 ${c.what}에 닿았어요 (작업 중지)`, { at: c.at as Mm });
      }
      this.step(tr.durationS / steps);
    }
    return true;
  }

  fingers(to: number, s = 0.3): void {
    const from = this.gap;
    const n = Math.max(1, Math.round(s / FRAME_DT));
    for (let i = 1; i <= n; i += 1) {
      this.gap = from + (to - from) * (i / n);
      this.step(s / n);
    }
  }

  wait(s: number): void {
    const end = this.t + s;
    while (this.t < end - 1e-9) this.step(Math.min(DT, end - this.t));
  }
}

const reach = (sim: CafeSim, what: string, p: Mm) => sim.fail('unreachable', `${what} (${p[0].toFixed(0)}, ${p[1].toFixed(0)}, ${p[2].toFixed(0)})에 손이 닿지 않아요 (작업 중지)`, { at: p });

/** Down to the drink, close, lift to carry height. */
function pickUp(sim: CafeSim, at: readonly number[], what: string, obj: string): boolean {
  const above: Mm = [at[0], at[1], CARRY_Z];
  const grip: Mm = [at[0], at[1], GRIP_Z];
  const a = poseAt(sim.chain, above, sim.q);
  const b = a && poseAt(sim.chain, grip, a);
  if (!a || !b) return reach(sim, what, above);
  if (!sim.moveJ(a, SPEED.travel) || !sim.moveJ(b, SPEED.down)) return false;
  sim.fingers(GAP.closed);
  sim.mode = 'held';
  sim.log('grip', `${obj} 잡았어요`, { at: grip });
  return sim.moveJ(a, SPEED.down);
}

/** Down at the pickup spot (③: the resident's low table), let go, back up and home. */
function serve(sim: CafeSim, where = '픽업 자리', said = '픽업 자리에 음료를 내려놓았어요'): void {
  const above: Mm = [PICKUP[0], PICKUP[1], CARRY_Z];
  const at: Mm = [PICKUP[0], PICKUP[1], GRIP_Z];
  const b = poseAt(sim.chain, at, sim.q);
  if (!b) return void reach(sim, where, at);
  if (!sim.moveJ(b, SPEED.down)) return;
  sim.fingers(GAP.open);
  sim.mode = 'served';
  sim.drink = [PICKUP[0], PICKUP[1], 0];
  sim.log('serve', said, { at });
  const a = poseAt(sim.chain, above, sim.q);
  if (a && sim.moveJ(a, SPEED.down)) sim.moveJ(HOME_Q, SPEED.travel);
}

/**
 * A straight carry at carry height from the bar to above the pickup spot, a trapezoid profile.
 * `guard` (②) brings in the zone speed near the counter and the customer's hand with the sensor.
 */
function carry(sim: CafeSim, vmax: number, accMs2: number, guard?: GuardValues): { T: number; halted: boolean } {
  const from: Mm = [BAR[0], BAR[1], CARRY_Z];
  const to: Mm = [PICKUP[0], PICKUP[1], CARRY_Z];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const dir: [number, number] = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
  const acc = accMs2 * 1000;
  const t0 = sim.t;
  // The commanded speed along the path: ① one trapezoid; ② top speed until the zone, zone speed in it.
  let s = 0;
  let v = 0;
  let stopping = false;
  let detectAt = -1;
  let a = 0;
  // ②: the customer reaches out as the arm leaves the bar.
  const handStart = guard ? sim.t : Infinity;
  const tr = guard ? null : trapezoid(len, vmax, acc);
  while (s < len - 1e-6) {
    const tLocal = sim.t - t0;
    let vNext: number;
    if (tr) {
      const p = tr.at(tLocal + DT);
      vNext = p.v;
      a = p.a / 1000;
      s = Math.min(len, p.s);
      if (tLocal + DT >= tr.T) s = len;
    } else {
      const g = guard!;
      const left = len - s;
      const zone = left <= ZONE_MM;
      const target = stopping ? 0 : zone ? Math.min(vmax, g.zoneSpeed) : vmax;
      // Brake for the end (and to the zone speed) in time, at the arm's braking rate; speed up at `acc`.
      const brake = HAND.brake * 1000;
      const endCap = Math.sqrt(Math.max(0, 2 * brake * left));
      const zoneCap = zone ? Infinity : Math.sqrt(Math.max(0, Math.min(vmax, g.zoneSpeed) ** 2 + 2 * brake * Math.max(0, left - ZONE_MM)));
      const want = Math.min(target, stopping ? 0 : endCap, zoneCap);
      vNext = want > v ? Math.min(want, v + acc * DT) : Math.max(want, v - brake * DT);
      a = (vNext - v) / DT / 1000;
      s = Math.min(len, s + ((v + vNext) / 2) * DT);
    }
    v = vNext;
    const p: Mm = [from[0] + dir[0] * s, from[1] + dir[1] * s, CARRY_Z];
    const q = poseAt(sim.chain, p, sim.q);
    if (!q) {
      reach(sim, '옮기는 길', p);
      break;
    }
    sim.q = q;
    // ①: the coffee's surface tilts against the acceleration (a/g); past 2h/d it spills.
    const aMs2 = a;
    sim.maxAcc = Math.max(sim.maxAcc, Math.abs(aMs2));
    const slope = Math.abs(aMs2) / GRAVITY;
    sim.slope = [(-aMs2 * dir[0]) / GRAVITY, (-aMs2 * dir[1]) / GRAVITY];
    sim.maxSlope = Math.max(sim.maxSlope, slope);
    if (!guard && slope > SPILL_SLOPE && sim.left === 1) {
      sim.left = 0.7;
      sim.fail('spill', `커피가 넘쳤어요. 가속도 ${Math.abs(aMs2).toFixed(1)} m/s²에 수면이 ${(slope * 100).toFixed(0)}% 기울었어요 (넘치는 기울기 ${(SPILL_SLOPE * 100).toFixed(0)}%)`, { at: [p[0], p[1], p[2] - GRIP_Z + CUP.h], value: Math.abs(aMs2) });
    }
    // ②: the customer's hand, the counter sensor and the arm's braking.
    if (guard) {
      if (sim.t >= handStart) {
        // The hand reaches for the cup itself (it keeps coming until it touches it).
        const y = Math.min(p[1] - CUP.d / 2, HAND.startY + HAND.speed * (sim.t - handStart));
        sim.hand = [PICKUP[0], y, CARRY_Z - GRIP_Z + 30];
        const gapMm = p[1] - CUP.d / 2 - y;
        if (detectAt < 0 && gapMm <= guard.detect) {
          detectAt = sim.t;
          sim.log('detect', `센서가 손을 감지했어요 (컵과 손 사이 ${gapMm.toFixed(0)} mm, 로봇 속도 ${v.toFixed(0)} mm/s)`, { at: [p[0], p[1] - CUP.d / 2, p[2]], value: gapMm });
        }
        if (detectAt >= 0 && !stopping && sim.t >= detectAt + (guard.react ?? HAND.react)) stopping = true;
        if (gapMm <= 0) {
          if (v > 1) {
            sim.step(DT);
            sim.fail('touch', `움직이는 컵이 손님 손에 ${v.toFixed(0)} mm/s로 부딪혔어요 (작업 중지)`, { at: [p[0], p[1] - CUP.d / 2, p[2]], value: v });
            return { T: sim.t - t0, halted: false };
          }
          sim.step(DT);
          return { T: sim.t - t0, halted: true };
        }
        if (stopping && v <= 1e-6) {
          sim.step(DT);
          // At rest: the hand comes on and takes the cup.
          return { T: sim.t - t0, halted: true };
        }
      }
    }
    sim.step(DT);
    if (tr && tLocal + DT >= tr.T) break;
  }
  sim.slope = [0, 0];
  return { T: sim.t - t0, halted: false };
}

/* --- ① 커피가 넘친다 ---------------------------------------------------------------------- */

export function runCarry(chain: readonly ChainSegment[], v: CarryValues): CafeRun {
  const sim = new CafeSim(chain, BAR, 'bar');
  let T = 0;
  if (pickUp(sim, BAR, '시음 컵', '시음 컵을')) {
    const start = poseAt(chain, [BAR[0], BAR[1], CARRY_Z], sim.q);
    if (start) T = carry(sim, v.speed, v.acc).T;
    if (!sim.stopped) {
      sim.wait(0.2);
      serve(sim);
    }
  }
  return finish(sim, v, { carryS: T });
}

/* --- ② 손과 가까워진다 -------------------------------------------------------------------- */

/** ②: the protective distance for values: what the gap closes by from detection to rest, mm. */
export function protectiveDistance(v: GuardValues): { react: number; brake: number; handWhileBraking: number; total: number } {
  const vr = v.zoneSpeed;
  const tb = vr / (HAND.brake * 1000);
  const react = (HAND.speed + vr) * (v.react ?? HAND.react);
  const brake = (vr * vr) / (2 * HAND.brake * 1000);
  const handWhileBraking = HAND.speed * tb;
  return { react, brake, handWhileBraking, total: react + brake + handWhileBraking };
}

export function runGuard(chain: readonly ChainSegment[], v: GuardValues): CafeRun {
  const sim = new CafeSim(chain, BAR, 'bar');
  let stopGap: number | null = null;
  let hitSpeed = 0;
  let served = false;
  if (pickUp(sim, BAR, '시음 컵', '시음 컵을')) {
    // ①'s fixed carry (2 m/s²), with the counter guard.
    const { halted } = carry(sim, (CAFE_FIXES[1] as CarryValues).speed, (CAFE_FIXES[1] as CarryValues).acc, v);
    const f = sim.failure;
    if (f?.kind === 'touch') hitSpeed = f.value ?? 0;
    else if (halted && sim.hand) {
      const tip = toolAt(chain, sim.q);
      stopGap = tip[1] - CUP.d / 2 - sim.hand[1];
      sim.log('stop', `손 앞에서 멈췄어요 (컵과 손 사이 ${stopGap.toFixed(0)} mm)`, { at: [tip[0], tip[1] - CUP.d / 2, tip[2]], value: stopGap });
      // The customer takes the cup from the gripper.
      const hand = sim.hand;
      const target = tip[1] - CUP.d / 2;
      while (sim.hand![1] < target - 1e-6) {
        sim.hand = [hand[0], Math.min(target, sim.hand![1] + HAND.speed * DT), hand[2]];
        sim.step(DT);
      }
      sim.wait(0.3);
      sim.fingers(GAP.open);
      sim.mode = 'served';
      sim.drink = [tip[0], tip[1], tip[2] - GRIP_Z];
      sim.log('handover', '손님이 컵을 잡아 그리퍼를 열었어요 (건넴)', { at: tip });
      served = true;
      for (let k = 0; k < 40; k += 1) {
        sim.hand = [hand[0], sim.hand![1] - HAND.speed * DT * 1.5, hand[2]];
        sim.drink = [sim.drink[0], sim.hand[1] + CUP.d / 2, sim.drink[2]];
        sim.step(DT);
      }
      sim.hand = null;
      sim.mode = 'taken';
      const up = poseAt(chain, [tip[0], tip[1], CARRY_Z + 30], sim.q);
      if (up && sim.moveJ(up, SPEED.down)) sim.moveJ(HOME_Q, SPEED.travel);
    } else if (!sim.stopped) {
      serve(sim);
      served = true;
    }
  }
  const run = finish(sim, v, {});
  return { ...run, stopGap, hitSpeed, served: served && !run.failure };
}

/* --- ③ 물병이 무거워졌다 -------------------------------------------------------------------- */

/** ③: the turn from the fridge side to the counter side at a radius: J1 from, to (°), and the other joints. */
export function turnPoses(chain: readonly ChainSegment[], radius: number): { a: number[]; b: number[] } | null {
  const angA = Math.atan2(FRIDGE[1], FRIDGE[0]);
  const angB = Math.atan2(PICKUP[1], PICKUP[0]);
  const a = poseAt(chain, [radius * Math.cos(angA), radius * Math.sin(angA), CARRY_Z]);
  if (!a) return null;
  // Same arm shape, only J1 turns.
  const dJ1 = ((angB - angA) * 180) / Math.PI;
  const b = [a[0] + dJ1, ...a.slice(1)];
  return { a, b };
}

/** ③: the J1 turn as a quintic in time T: angle, speed, acceleration (°, °/s, °/s²) at t. */
function quintic(q0: number, dq: number, T: number, t: number) {
  const s = Math.max(0, Math.min(1, t / T));
  return {
    q: q0 + dq * (10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5),
    qd: (dq / T) * (30 * s ** 2 - 60 * s ** 3 + 30 * s ** 4),
    qdd: (dq / (T * T)) * (60 * s - 180 * s ** 2 + 120 * s ** 3),
  };
}

/** ③: the largest J1 torque of the turn for a load (no run), N·m, its peak angular acceleration (rad/s²) and peak speed (°/s). */
export function turnTorque(chain: readonly ChainSegment[], v: TurnValues, kg: number = BOTTLE.kg): { tau: number; alpha: number; dq: number; speed: number } {
  const P = turnPoses(chain, v.radius);
  if (!P) return { tau: NaN, alpha: NaN, dq: NaN, speed: NaN };
  const dq = P.b[0] - P.a[0];
  let tau = 0;
  for (let k = 0; k <= 60; k += 1) {
    const m = quintic(P.a[0], dq, v.time, (k / 60) * v.time);
    const q = [m.q, ...P.a.slice(1)];
    const qd = [m.qd, 0, 0, 0, 0, 0];
    const qdd = [m.qdd, 0, 0, 0, 0, 0];
    tau = Math.max(tau, Math.abs(inverseDynamics(chain, q, qd, qdd, { payloadKg: kg, tcpMm: TOOL_MM })[0]));
  }
  return { tau, alpha: ((5.7735 * Math.abs(dq)) / (v.time * v.time)) * (Math.PI / 180), dq, speed: turnPeakSpeed(dq, v.time) };
}

export function runTurn(chain: readonly ChainSegment[], v: TurnValues): CafeRun {
  const sim = new CafeSim(chain, FRIDGE, 'fridge');
  const limit = CARE_J1_LIMIT;
  let peakAlpha = 0;
  let peakSpeed = 0;
  if (pickUp(sim, FRIDGE, '물병', '물병을')) {
    const P = turnPoses(chain, v.radius);
    if (!P) reach(sim, '도는 자리', [v.radius, 0, CARRY_Z]);
    else if (sim.moveJ(P.a, SPEED.down)) {
      const dq = P.b[0] - P.a[0];
      const need = turnTorque(chain, v);
      peakAlpha = need.alpha;
      peakSpeed = need.speed;
      // The controller checks the turn before it starts: faster than J1 can go, it does not turn.
      const steps = need.speed > J1_MAX_SPEED + 1e-9 ? 0 : Math.ceil(v.time / DT);
      if (!steps) sim.fail('overspeed', `J1이 따라갈 수 없는 빠르기: 이 돌기는 최고 ${need.speed.toFixed(0)}°/s가 필요한데 서보는 ${J1_MAX_SPEED}°/s까지예요 (작업 중지)`, { at: toolAt(chain, sim.q), value: need.speed });
      for (let k = 1; k <= steps; k += 1) {
        const t = (k / steps) * v.time;
        const m = quintic(P.a[0], dq, v.time, t);
        sim.q = [m.q, ...P.a.slice(1)];
        sim.tau = Math.abs(inverseDynamics(chain, sim.q, [m.qd, 0, 0, 0, 0, 0], [m.qdd, 0, 0, 0, 0, 0], { payloadKg: BOTTLE.kg, tcpMm: TOOL_MM })[0]);
        sim.maxTau = Math.max(sim.maxTau, sim.tau);
        if (sim.tau > limit) {
          sim.step(v.time / steps);
          sim.fail('overload', `J1 과부하: 이 돌기에는 최대 ${need.tau.toFixed(3)} N·m가 필요한데 돌봄 모드 제한은 ${limit.toFixed(2)} N·m예요. 제한을 넘어 멈췄어요 (작업 중지)`, { at: toolAt(chain, sim.q), value: need.tau });
          break;
        }
        sim.step(v.time / steps);
      }
      sim.tau = 0;
      if (!sim.stopped) {
        const above = poseAt(chain, [PICKUP[0], PICKUP[1], CARRY_Z], sim.q);
        if (above && sim.moveJ(above, SPEED.down)) serve(sim, '어르신 탁자', '어르신 탁자에 물병을 내려놓았어요');
      }
    }
  }
  return { ...finish(sim, v, {}), peakAlpha, peakSpeed };
}

/* --- shared -------------------------------------------------------------------------------- */

function finish(sim: CafeSim, values: CafeValues, extra: Partial<CafeRun>): CafeRun {
  if (!sim.stopped && !sim.failure) sim.log('done', '작업을 마쳤어요');
  sim.wait(0.4);
  const served = sim.events.some((e) => e.kind === 'serve' || e.kind === 'handover');
  return {
    values,
    frames: sim.frames,
    events: sim.events,
    durationS: sim.t,
    failure: sim.failure,
    tip: sim.tip,
    maxSlope: sim.maxSlope,
    maxAcc: sim.maxAcc,
    carryS: 0,
    stopGap: null,
    hitSpeed: 0,
    maxTau: sim.maxTau,
    peakAlpha: 0,
    peakSpeed: 0,
    served,
    ...extra,
  };
}

export function runCafe(chain: readonly ChainSegment[], p: CafeProblem, v: CafeValues): CafeRun {
  return p === 1 ? runCarry(chain, v as CarryValues) : p === 2 ? runGuard(chain, v as GuardValues) : runTurn(chain, v as TurnValues);
}

/* --- 판정 ------------------------------------------------------------------------------------ */

export interface CafeCheck {
  label: string;
  ok: boolean;
  value: string;
}
export interface CafeScore {
  pass: boolean;
  checks: CafeCheck[];
  headline: string;
}

/** ①: the carry must not take longer than this, s (the customer is waiting). */
export const CARRY_MAX_S = 2.5;
/** ②: the cup must stop at least this far from the hand, mm. */
export const STOP_MARGIN_MM = 20;

const strip = (s: string) => s.replace(/ \(작업 중지\)$/, '');

export function scoreCafe(p: CafeProblem, run: CafeRun): CafeScore {
  const f = run.failure;
  const stop: CafeCheck = { label: '작업 중지 없음', ok: !f || f.kind === 'spill', value: f && f.kind !== 'spill' ? strip(f.text) : '없음' };
  if (p === 1) {
    const checks: CafeCheck[] = [
      { label: `넘치지 않음 (수면 기울기 ${(SPILL_SLOPE * 100).toFixed(0)}% 아래)`, ok: run.maxSlope <= SPILL_SLOPE, value: `최대 ${(run.maxSlope * 100).toFixed(0)}% (${run.maxAcc.toFixed(1)} m/s²)` },
      { label: `옮기는 시간 ${CARRY_MAX_S} s 안`, ok: run.carryS > 0 && run.carryS <= CARRY_MAX_S, value: `${run.carryS.toFixed(2)} s` },
      { label: '픽업 자리에 놓음', ok: run.served, value: run.served ? '했어요' : '못 했어요' },
    ];
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: pass ? '넘치지 않게 건넸어요' : f ? strip(f.text) : run.carryS > CARRY_MAX_S ? `넘치지는 않았지만 ${run.carryS.toFixed(1)} s나 걸렸어요` : '아직 기준을 못 넘었어요' };
  }
  if (p === 2) {
    const checks: CafeCheck[] = [
      { label: '움직이는 컵이 손에 닿지 않음', ok: run.hitSpeed === 0 && f?.kind !== 'touch', value: run.hitSpeed ? `${run.hitSpeed.toFixed(0)} mm/s로 닿음` : '닿지 않음' },
      { label: `손 앞 ${STOP_MARGIN_MM} mm 넘게 남기고 멈춤`, ok: run.stopGap !== null && run.stopGap >= STOP_MARGIN_MM, value: run.stopGap === null ? '—' : `${run.stopGap.toFixed(0)} mm` },
      { label: '손님에게 건넴', ok: run.served, value: run.served ? '했어요' : '못 했어요' },
    ];
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: pass ? '손 앞에서 멈춰 안전하게 건넸어요' : f ? strip(f.text) : run.stopGap !== null ? `멈췄지만 손과 ${run.stopGap.toFixed(0)} mm밖에 안 남았어요` : '아직 기준을 못 넘었어요' };
  }
  const fast = f?.kind === 'overspeed';
  const checks: CafeCheck[] = [
    { label: `J1 최고 속도 ${J1_MAX_SPEED}°/s 안`, ok: !fast, value: `최고 ${run.peakSpeed.toFixed(0)}°/s` },
    { label: `J1 토크가 돌봄 모드 제한 ${CARE_J1_LIMIT} N·m 안`, ok: f?.kind !== 'overload' && !fast, value: f?.kind === 'overload' ? `${(f.value ?? 0).toFixed(3)} N·m 필요` : fast ? '돌지 못함' : `최대 ${run.maxTau.toFixed(3)} N·m` },
    { label: '어르신 탁자에 놓음', ok: run.served, value: run.served ? '했어요' : '못 했어요' },
    stop,
  ];
  const pass = checks.every((c) => c.ok);
  return { pass, checks, headline: pass ? '무거운 물병도 과부하 없이 탁자에 놓았어요' : f ? strip(f.text) : '아직 기준을 못 넘었어요' };
}
