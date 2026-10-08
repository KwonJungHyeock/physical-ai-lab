/**
 * 물류 센터 · 팔레타이징 셀 (myCobot 280 RDK X5 + 흡착 펌프, real size): a short belt conveyor
 * brings cardboard boxes one at a time to an end stop at the arm's front; the arm picks each from
 * above and stacks it on a small wooden pallet at its right, four to a layer (2 × 2), three layers.
 *
 * The stack is real rigid-body physics (physics/physics.ts, Rapier): a box set down too low pushes
 * into the layer under it and shoves those boxes out; a box let go too high drops and lands where
 * it lands. The arm follows the engine's trajectories (robot/motion.ts) and is checked against the
 * cell (physics/collide.ts). A laser check over the pallet (as real palletizers have) stops the
 * line when a placed box has moved or tipped — the numbers the screen shows all come from here.
 *
 * Robot base frame, millimetres, z up, front = +x. No React, no WebGL (tests run it headless).
 */

import { Quaternion, Vector3 } from 'three';

import { poseContact, type Box } from '../../physics/collide';
import { createPhysics, type PhysicsWorld } from '../../physics/physics';
import type { ChainSegment } from '../../robot/kinematics';
import { isWithinJointLimits } from '../../robot/limits';
import { jointTrajectory, tcpPositionMm, type Trajectory } from '../../robot/motion';
import { HOME_Q, TCP_MM, type Mm } from './cell';
import { linePlan, toolPoseAt } from './run';

/** The box: 42 × 42 mm, 40 mm high, 40 g (a small cardboard carton; the 280 lifts up to 250 g). */
export const PBOX = { sx: 42, sy: 42, h: 40, massG: 40 } as const;
/** Small wooden pallet at the arm's right: centre, deck height and size, mm. */
export const PAL = { x: 85, y: -165, top: 18, sx: 120, sy: 112 } as const;
/** Box pitch on the pallet (6 mm between boxes: room for the carried box to come down between its neighbours), mm. */
export const PITCH = 48;
export const LAYERS = 3;
export const PER_LAYER = 4;
export const N_BOXES = LAYERS * PER_LAYER;
/** Where each box of a layer goes, from the pallet centre — the one nearest the arm first: the wrist hangs outwards over the next place, so a place further out is still empty. */
export const SLOT_OFF: readonly [number, number][] = [
  [PITCH / 2, -PITCH / 2],
  [-PITCH / 2, -PITCH / 2],
  [PITCH / 2, PITCH / 2],
  [-PITCH / 2, PITCH / 2],
];

/** In-feed belt conveyor along y at x: boxes ride towards −y to an end stop. */
export const FEED = { x: 215, width: 70, top: 60, yIn: 300, yStop: -40, speed: 140 } as const;
/** Where a box stands at the stop (centre), mm. */
export const PICK: Mm = [FEED.x, FEED.yStop + PBOX.sy / 2, FEED.top + PBOX.h / 2];

/** Laser check over the pallet: a placed box that moved more than this, or tipped more than this, stops the line. */
export const CHECK = { moveMm: 8, tiltDeg: 8 } as const;
/** A placed box counts as placed right within these. */
export const OK_TOL = { xyMm: 5, zMm: 3, tiltDeg: 3 } as const;
/** Letting go higher than this above where the box rests counts as dropping it (cartons get damaged). */
export const DROP_OK_MM = 5;
/** A carton gives this much under the cup's push; pressing a box further into the one below crushes it, mm. */
export const PRESS_OK_MM = 3;

/** Where the pallet stands (its centre), mm: as the cell was set up, or moved (problem ③). */
export interface PalletPose {
  x: number;
  y: number;
}
export const PAL_HOME: PalletPose = { x: PAL.x, y: PAL.y };

/**
 * Everything a run of the line depends on: the work program's place heights (①), the speed
 * settings for moves carrying a box and empty moves (②), the box's weight, and where the program
 * thinks the pallet is against where it really is (③).
 */
export interface LineSetup {
  pitch: number;
  gap: number;
  /** Speed setting 1..100 for travel moves with a box on the cup, without, and the short straight moves up and down onto a box or its place. */
  carry: number;
  empty: number;
  vert: number;
  massG: number;
  prog: PalletPose;
  real: PalletPose;
}
export const LINE_BASE: LineSetup = { pitch: PBOX.h, gap: 2, carry: 70, empty: 70, vert: 35, massG: PBOX.massG, prog: PAL_HOME, real: PAL_HOME };

/** Fixed furniture: the conveyor and the pallet (for the arm's collision check and the physics). */
export function palletCell(pal: PalletPose = PAL_HOME): Box[] {
  return [
    { name: '컨베이어', min: [FEED.x - FEED.width / 2 - 8, FEED.yStop - 14, 0], max: [FEED.x + FEED.width / 2 + 8, FEED.yIn + 30, FEED.top] },
    { name: '컨베이어 끝 멈춤판', min: [FEED.x - FEED.width / 2 - 8, FEED.yStop - 14, FEED.top], max: [FEED.x + FEED.width / 2 + 8, FEED.yStop - 2, FEED.top + 22] },
    { name: '팔레트', min: [pal.x - PAL.sx / 2, pal.y - PAL.sy / 2, 0], max: [pal.x + PAL.sx / 2, pal.y + PAL.sy / 2, PAL.top] },
  ];
}

/** Where box k (0 ..) should end up: centre, mm. */
export function slotCentre(k: number, pal: PalletPose = PAL_HOME): Mm {
  const layer = Math.floor(k / PER_LAYER);
  const [dx, dy] = SLOT_OFF[k % PER_LAYER];
  return [pal.x + dx, pal.y + dy, PAL.top + layer * PBOX.h + PBOX.h / 2];
}

/* --- problem ① 쌓다가 무너진다 ------------------------------------------------- */

/**
 * The work program's place height, as the line's sheet has it: the cup comes down to
 * 1층 높이 + (층 − 1) × 층 간격 + 여유. The sheet was written for the old 30 mm cartons.
 */
export interface StackValues {
  /** Layer pitch, mm. */
  pitch: number;
  /** Let go this far above where the box would rest, mm. */
  gap: number;
}
export const STACK_DEFAULT: StackValues = { pitch: 30, gap: 0 };
export const STACK_RANGE = { pitch: [20, 60], gap: [0, 30] } as const;
/** 1층 높이 on the sheet: the cup on a box standing on the pallet (right as it is). */
export const FIRST_Z = PAL.top + PBOX.h;

/** Cup height when letting go of a box of layer `layer` (0 = 1층), mm. */
export const placeZ = (v: StackValues, layer: number) => FIRST_Z + layer * v.pitch + v.gap;
/** Where it should be: the cup on a box resting on the layer below. */
export const restZ = (layer: number) => FIRST_Z + layer * PBOX.h;

/* --- problem ② 빨리 하니 미끄러진다 ------------------------------------------- */

/** Speed settings (1..100): travel with a box, travel without, the short moves up and down. */
export interface SpeedValues {
  carry: number;
  empty: number;
  vert: number;
}
/** The heavier product of ②, g. */
export const HEAVY_G = 200;
/** ②'s order: twelve boxes within this time, s. */
export const TIME_LIMIT_S = 70;
/** The foreman set every travel move to full speed (the moves up and down stayed as they were). */
export const SPEED_DEFAULT: SpeedValues = { carry: 100, empty: 100, vert: 35 };
export const SPEED_FIX: SpeedValues = { carry: 70, empty: 100, vert: 70 };

/* --- problem ③ 팔레트 자리가 바뀐다 -------------------------------------------- */

/** Where the pallet ended up after it was moved (the program still has PAL_HOME). */
export const PAL_MOVED: PalletPose = { x: PAL.x + 25, y: PAL.y + 40 };
/** The reference mark on the pallet deck (its far corner), from the pallet centre, mm. */
export const MARK_OFF = [PAL.sx / 2 - 10, -(PAL.sy / 2 - 10)] as const;
export const markAt = (p: PalletPose): [number, number] => [p.x + MARK_OFF[0], p.y + MARK_OFF[1]];
/** The taught reference point (x, y): the program's pallet is placed from it. */
export interface RefValues {
  x: number;
  y: number;
}
export const REF_DEFAULT: RefValues = { x: markAt(PAL_HOME)[0], y: markAt(PAL_HOME)[1] };
export const REF_FIX: RefValues = { x: markAt(PAL_MOVED)[0], y: markAt(PAL_MOVED)[1] };
export const progFromRef = (r: RefValues): PalletPose => ({ x: r.x - MARK_OFF[0], y: r.y - MARK_OFF[1] });

export type LogiProblem = 1 | 2 | 3;
export type LogiValues = StackValues | SpeedValues | RefValues;

/** The line setup a problem runs with these values. */
export function setupFor(p: LogiProblem, v: LogiValues): Partial<LineSetup> {
  if (p === 1) return v as StackValues;
  if (p === 2) return { ...(v as SpeedValues), massG: HEAVY_G };
  return { real: PAL_MOVED, prog: progFromRef(v as RefValues) };
}
export const DEFAULTS: Record<LogiProblem, LogiValues> = { 1: STACK_DEFAULT, 2: SPEED_DEFAULT, 3: REF_DEFAULT };

/* --- the run ----------------------------------------------------------------------- */

const DT = 0.01;
const FRAME_DT = 0.02;
export const G = 9.81;
/** How hard the suction cup holds a box (the 280's small pump, a 20 mm cup), N. */
export const SUCTION_N = 2.8;
/** The cup acceleration a box of this weight can take before it comes off the cup, m/s²: F = m (g + a). */
export const accLimit = (massG: number) => SUCTION_N / (massG / 1000) - G;
/** Arm speed setting (1..100) for the moves. */
const SPEED = 70;
/** Clearance under the carried box above the stack, and approach height above a box, mm. */
const CLEAR = 30;
const APPROACH = 30;
/** Cup height after a pick: the carried box clears the conveyor's end stop. */
const LIFT_Z = FEED.top + 2 * PBOX.h + 20;

export type PBoxMode = 'wait' | 'belt' | 'held' | 'free';

export interface PFrame {
  t: number;
  q: number[];
  pump: boolean;
  travel: number;
  /** Box centres (mm) and orientations (x, y, z, w). */
  boxes: { at: Mm; q: [number, number, number, number]; mode: PBoxMode }[];
  /** The pallet check's light: green, or red once it has tripped. */
  alarm: boolean;
  /** How far each box is crushed (pressed down by a box set on it), mm. */
  crush: number[];
  /** The cup's acceleration, m/s², and whether it carries a box. */
  acc: number;
  carrying: boolean;
}

export type PEventKind = 'arrive' | 'grip' | 'press' | 'drop' | 'place' | 'moved' | 'slip' | 'hit' | 'unreachable' | 'limit' | 'done';

export interface PEvent {
  t: number;
  kind: PEventKind;
  box?: number;
  text: string;
  at?: Mm;
  /** The number that goes with it (pressed mm, dropped mm, moved mm …). */
  mm?: number;
}

export interface BoxResult {
  /** Final centre, mm, and how far it is from its slot (sideways, up/down), and its tilt, deg. */
  at: Mm;
  xyErr: number;
  zErr: number;
  tilt: number;
  /** Was it put down at all (the run may stop before). */
  placed: boolean;
  /** Put down right and still there. */
  ok: boolean;
  /** Off its place: fallen, pushed off the stack. */
  fallen: boolean;
  /** How far above its resting place it was let go, mm (negative: pushed into the box below). */
  releaseGap: number | null;
}

export interface PalletRun {
  values: LineSetup;
  /** The largest cup acceleration while carrying a box, m/s². */
  maxCarryAcc: number;
  frames: PFrame[];
  events: PEvent[];
  durationS: number;
  /** What stopped the line (collision, the pallet check), else null. */
  failure: PEvent | null;
  boxes: BoxResult[];
  /** Tool tip every frame, mm. */
  tip: Mm[];
}

const tipOf = (chain: readonly ChainSegment[], q: readonly number[]): Mm => {
  const p = tcpPositionMm(chain, q, TCP_MM);
  return [p.x, p.y, p.z];
};
const tiltOf = (q: Quaternion) => (new Vector3(0, 0, 1).applyQuaternion(q).angleTo(new Vector3(0, 0, 1)) * 180) / Math.PI;

/** Boxes on the belt: where box k stands while it rides in (it comes on when the box before it is picked). */
interface BeltBox {
  y: number;
  on: boolean;
}

class PalletSim {
  t = 0;
  q: number[];
  pump = false;
  travel = 0;
  frames: PFrame[] = [];
  events: PEvent[] = [];
  tip: Mm[] = [];
  failure: PEvent | null = null;
  alarm = false;
  readonly fixed: Box[];
  readonly belt: BeltBox[] = Array.from({ length: N_BOXES }, () => ({ y: FEED.yIn - PBOX.sy / 2 - 4, on: false }));
  /** Boxes in the physics world: id `b{k}`; mode per box. */
  readonly mode: PBoxMode[] = Array.from({ length: N_BOXES }, () => 'wait');
  /** Where each placed box was when it was let go (for the pallet check). */
  readonly placedAt: (Vector3 | null)[] = Array.from({ length: N_BOXES }, () => null);
  readonly releaseGap: (number | null)[] = Array.from({ length: N_BOXES }, () => null);
  /** How far each box is crushed, mm (the deepest press of a box set on it). */
  readonly crush: number[] = Array.from({ length: N_BOXES }, () => 0);
  /** While a box is set down: the deepest it went into a box under it (that box, mm). */
  private press: { under: number; mm: number; at: Mm } | null = null;
  private held = -1;
  private nextFrame = 0;

  /** Cup acceleration now (m/s², smoothed), and the last cup positions it comes from. */
  acc = 0;
  maxCarryAcc = 0;
  private tips: Mm[] = [];

  constructor(
    readonly chain: readonly ChainSegment[],
    readonly phys: PhysicsWorld,
    readonly setup: LineSetup,
  ) {
    this.fixed = palletCell(setup.real);
    this.q = HOME_Q.slice();
    phys.setArm(this.q);
    this.belt[0].on = true;
    this.mode[0] = 'belt';
    this.record();
  }

  log(kind: PEventKind, text: string, extra: Partial<PEvent> = {}): PEvent {
    const e: PEvent = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }
  fail(kind: PEventKind, text: string, extra: Partial<PEvent> = {}): false {
    this.failure ??= this.log(kind, text, extra);
    this.alarm = true;
    return false;
  }

  private poses() {
    const byId = new Map(this.phys.blocks().map((b) => [b.id, b]));
    return this.belt.map((bb, k): PFrame['boxes'][number] => {
      const p = byId.get(`b${k}`);
      if (p) return { at: [p.at.x, p.at.y, p.at.z], q: [p.q.x, p.q.y, p.q.z, p.q.w], mode: this.mode[k] };
      return { at: [FEED.x, bb.y, FEED.top + PBOX.h / 2], q: [0, 0, 0, 1], mode: this.mode[k] };
    });
  }

  private record() {
    this.frames.push({ t: this.t, q: this.q.slice(), pump: this.pump, travel: this.travel, boxes: this.poses(), alarm: this.alarm, crush: this.crush.slice(), acc: this.acc, carrying: this.held >= 0 });
    this.tip.push(tipOf(this.chain, this.q));
    this.nextFrame += FRAME_DT;
  }

  /** The belt carries the boxes on it towards the stop (each queues behind the one in front). */
  private stepBelt() {
    let moving = false;
    let front = FEED.yStop; // the face the next box stops at
    for (let k = 0; k < N_BOXES; k += 1) {
      const b = this.belt[k];
      if (!b.on || this.mode[k] !== 'belt') continue;
      const stopAt = front + PBOX.sy / 2;
      if (b.y > stopAt + 1e-6) {
        b.y = Math.max(stopAt, b.y - FEED.speed * DT);
        moving = true;
        if (b.y === stopAt) this.log('arrive', `${k + 1}번 상자가 도착했어요`, { box: k });
      }
      front = b.y + PBOX.sy / 2 + 2;
    }
    if (moving) this.travel += FEED.speed * DT;
  }

  private step(): boolean {
    this.t += DT;
    this.stepBelt();
    this.phys.stepTo(this.q, DT);
    if (!isWithinJointLimits(this.q)) this.fail('limit', '관절이 움직일 수 있는 범위를 넘었어요', { at: tipOf(this.chain, this.q) });
    const c = this.failure ? null : poseContact(this.chain, this.q, this.fixed, TCP_MM);
    if (c) this.fail('hit', `팔이 ${c.what}에 닿았어요`, { at: c.at });
    this.trackAcc();
    if (this.held >= 0) this.checkPress();
    if (this.held >= 0) this.checkSlip();
    if (this.t + 1e-9 >= this.nextFrame) this.record();
    return !this.failure;
  }

  /**
   * The cup's acceleration from its positions over the last 50 ms (a second difference over a 20 ms
   * baseline, averaged): what the box on the cup feels besides its weight.
   */
  private trackAcc() {
    this.tips.push(tipOf(this.chain, this.q));
    if (this.tips.length > 7) this.tips.shift();
    const n = this.tips.length;
    if (n < 5) return;
    const h = 2 * DT;
    let sum = 0;
    let k = 0;
    for (let i = 4; i < n; i += 1) {
      const [a, b, c] = [this.tips[i - 4], this.tips[i - 2], this.tips[i]];
      sum += Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]) / (h * h) / 1000;
      k += 1;
    }
    this.acc = sum / k;
    if (this.held >= 0) this.maxCarryAcc = Math.max(this.maxCarryAcc, this.acc);
  }

  /** The cup holds the box with SUCTION_N; its weight and the force to accelerate it pull it off. */
  private checkSlip() {
    const m = this.setup.massG / 1000;
    const need = m * (G + this.acc);
    if (need <= SUCTION_N) return;
    const k = this.held;
    this.phys.release();
    this.mode[k] = 'free';
    this.held = -1;
    this.pump = true;
    this.fail('slip', `${k + 1}번 상자가 흡착 컵에서 떨어졌어요 (가속도 ${this.acc.toFixed(1)} m/s²) — 라인 정지`, { box: k, at: tipOf(this.chain, this.q), mm: this.acc });
  }

  /** The held box going below the top of a placed box under it: it presses into it (the deepest is kept). */
  private checkPress() {
    const k = this.held;
    const blocks = this.phys.blocks();
    const me = blocks.find((b) => b.id === `b${k}`);
    if (!me) return;
    const bottom = me.at.z - PBOX.h / 2;
    for (const o of blocks) {
      if (o.id === me.id || o.held) continue;
      const j = +o.id.slice(1);
      if (this.mode[j] !== 'free') continue;
      const overlapXY = Math.abs(o.at.x - me.at.x) < PBOX.sx - 6 && Math.abs(o.at.y - me.at.y) < PBOX.sy - 6;
      const depth = o.at.z + PBOX.h / 2 - bottom;
      if (overlapXY && me.at.z > o.at.z && depth > 0.5 && depth > (this.press?.mm ?? 0)) {
        this.press = { under: j, mm: depth, at: [o.at.x, o.at.y, o.at.z + PBOX.h / 2] };
        this.crush[j] = Math.max(this.crush[j], depth);
      }
    }
  }

  /** After setting box k down: pressed too far into the box under it, the carton is crushed and the line stops. */
  checkCrush(k: number): boolean {
    const p = this.press;
    this.press = null;
    if (!p || p.mm <= PRESS_OK_MM) return true;
    return this.fail('press', `${k + 1}번 상자가 아래 ${p.under + 1}번 상자를 ${p.mm.toFixed(0)} mm 눌러 찌그러뜨렸어요 — 라인 정지`, { box: k, at: p.at, mm: p.mm });
  }

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
  moveJ(to: readonly number[], speed = SPEED): boolean {
    return this.follow(jointTrajectory(this.q, to, speed));
  }
  moveL(p: Mm, speed = SPEED): boolean {
    const plan = linePlan(this.chain, this.q, p, speed);
    if (!plan.ok) return this.fail('unreachable', `(${p.map((v) => v.toFixed(0)).join(', ')})까지 곧게 갈 수 없어요`, { at: p });
    return this.follow(plan.trajectory);
  }
  /** Joint move to the pose that holds the cup straight down at `p`. */
  moveTo(p: Mm, speed = SPEED): boolean {
    const s = toolPoseAt(this.chain, p, this.q);
    if (!s) return this.fail('unreachable', `(${p.map((v) => v.toFixed(0)).join(', ')})에 손이 닿지 않아요`, { at: p });
    return this.moveJ(s.q, speed);
  }
  wait(s: number): boolean {
    const end = this.t + s;
    while (!this.failure && this.t < end - 1e-9) this.step();
    return !this.failure;
  }
  waitUntil(done: () => boolean, maxS: number): boolean {
    const end = this.t + maxS;
    while (!this.failure && !done() && this.t < end) this.step();
    return !this.failure && done();
  }

  /** Pump on over box k at the stop: it becomes a body in the world, held by the cup. */
  grip(k: number): boolean {
    this.pump = true;
    if (!this.wait(0.12)) return false;
    const b = this.belt[k];
    this.phys.add({ id: `b${k}`, color: '#c9995f', at: [FEED.x, b.y, FEED.top + PBOX.h / 2], dims: [PBOX.sx, PBOX.sy, PBOX.h], massG: this.setup.massG, friction: 0.55, ccd: false });
    this.phys.setArm(this.q);
    const id = this.phys.grab(6, { upright: true, passThrough: true });
    if (id !== `b${k}`) return this.fail('hit', `${k + 1}번 상자를 흡착하지 못했어요`, { box: k });
    this.mode[k] = 'held';
    this.held = k;
    this.log('grip', `${k + 1}번 상자를 흡착했어요`, { box: k });
    // The next box comes on.
    if (k + 1 < N_BOXES) {
      this.belt[k + 1].on = true;
      this.mode[k + 1] = 'belt';
    }
    return true;
  }

  /** Pump off: the box is let go where it is; the gap to where it would rest is noted. */
  release(k: number, layer: number): boolean {
    const me = this.phys.blocks().find((b) => b.id === `b${k}`)!;
    const bottom = me.at.z - PBOX.h / 2;
    const restBottom = PAL.top + layer * PBOX.h;
    const gap = bottom - restBottom;
    this.releaseGap[k] = gap;
    this.pump = false;
    this.phys.release();
    this.mode[k] = 'free';
    this.held = -1;
    if (gap > DROP_OK_MM) this.log('drop', `${k + 1}번 상자를 ${gap.toFixed(0)} mm 위에서 떨어뜨렸어요`, { box: k, mm: gap, at: [me.at.x, me.at.y, bottom] });
    else this.log('place', `${k + 1}번 상자를 내려놓았어요`, { box: k });
    if (!this.wait(0.35)) return false;
    const now = this.phys.blocks().find((b) => b.id === `b${k}`)!;
    this.placedAt[k] = now.at.clone();
    return true;
  }

  /** The pallet check: any placed box moved or tipped since it was let go stops the line. */
  checkStack(): boolean {
    const blocks = new Map(this.phys.blocks().map((b) => [b.id, b]));
    for (let k = 0; k < N_BOXES; k += 1) {
      const p0 = this.placedAt[k];
      if (!p0) continue;
      const b = blocks.get(`b${k}`)!;
      const moved = b.at.distanceTo(p0);
      const tilt = tiltOf(b.q);
      if (moved > CHECK.moveMm || tilt > CHECK.tiltDeg) {
        return this.fail('moved', `팔레트 감지: ${k + 1}번 상자가 ${tilt > CHECK.tiltDeg ? `${tilt.toFixed(0)}° 기울었어요` : `${moved.toFixed(0)} mm 밀렸어요`} — 라인 정지`, {
          box: k,
          at: [b.at.x, b.at.y, b.at.z],
          mm: moved,
        });
      }
    }
    return true;
  }

  finish(): PalletRun {
    // Let the stack settle, then the frames end.
    if (!this.failure) this.wait(0.6);
    else {
      const end = this.t + 1.6;
      while (this.t < end) {
        this.t += DT;
        this.phys.stepTo(this.q, DT);
        if (this.t + 1e-9 >= this.nextFrame) this.record();
      }
    }
    if (this.t + 1e-9 < this.nextFrame - FRAME_DT / 2) this.record();
    const blocks = new Map(this.phys.blocks().map((b) => [b.id, b]));
    const boxes = this.belt.map((_, k): BoxResult => {
      const b = blocks.get(`b${k}`);
      const want = slotCentre(k, this.setup.real);
      if (!b || this.mode[k] !== 'free') return { at: b ? [b.at.x, b.at.y, b.at.z] : [FEED.x, this.belt[k].y, FEED.top + PBOX.h / 2], xyErr: 0, zErr: 0, tilt: 0, placed: false, ok: false, fallen: false, releaseGap: null };
      const xyErr = Math.hypot(b.at.x - want[0], b.at.y - want[1]);
      const zErr = b.at.z - want[2];
      const tilt = tiltOf(b.q);
      const fallen = xyErr > 15 || Math.abs(zErr) > PBOX.h / 2 || tilt > 30;
      const ok = xyErr <= OK_TOL.xyMm && Math.abs(zErr) <= OK_TOL.zMm && tilt <= OK_TOL.tiltDeg;
      return { at: [b.at.x, b.at.y, b.at.z], xyErr, zErr, tilt, placed: true, ok, fallen, releaseGap: this.releaseGap[k] };
    });
    return { values: this.setup, maxCarryAcc: this.maxCarryAcc, frames: this.frames, events: this.events, durationS: this.t, failure: this.failure, boxes, tip: this.tip };
  }
}

/** Run the line (LINE_BASE with these changes): twelve boxes, three layers; it stops early when something goes wrong. */
export async function runStack(chain: readonly ChainSegment[], change: Partial<LineSetup>): Promise<PalletRun> {
  const setup: LineSetup = { ...LINE_BASE, ...change };
  const phys = await createPhysics(chain, TCP_MM, [], palletCell(setup.real), HOME_Q);
  try {
    const sim = new PalletSim(chain, phys, setup);
    const pickTop: Mm = [PICK[0], PICK[1], PICK[2] + PBOX.h / 2];
    for (let k = 0; k < N_BOXES && !sim.failure; k += 1) {
      const layer = Math.floor(k / PER_LAYER);
      const slot = slotCentre(k, setup.prog);
      // Above its place: clear of the boxes already in this layer (the carried box hangs under the cup).
      const overZ = PAL.top + (layer + 1) * PBOX.h + PBOX.h + CLEAR;
      // Above the box at the stop, wait for it, down onto it, pump on, up clear of the end stop.
      if (!sim.moveTo([pickTop[0], pickTop[1], pickTop[2] + APPROACH], setup.empty)) break;
      if (!sim.waitUntil(() => sim.belt[k].y <= FEED.yStop + PBOX.sy / 2 + 1e-6, 8)) break;
      if (!sim.moveL(pickTop, setup.vert)) break;
      if (!sim.grip(k)) break;
      if (!sim.moveL([pickTop[0], pickTop[1], LIFT_Z], setup.vert)) break;
      // Over its place on the pallet, down to the program's height, let go, up.
      const z = placeZ(setup, layer);
      if (!sim.moveTo([slot[0], slot[1], Math.max(z, overZ)], setup.carry)) break;
      if (!sim.moveL([slot[0], slot[1], z], setup.vert)) break;
      if (!sim.checkCrush(k)) break;
      if (!sim.release(k, layer)) break;
      if (!sim.checkStack()) break;
      if (!sim.moveL([slot[0], slot[1], Math.max(z, overZ)], setup.vert)) break;
    }
    if (!sim.failure) {
      sim.moveJ(HOME_Q, setup.empty);
      sim.log('done', '12개를 모두 쌓았어요');
    }
    return sim.finish();
  } finally {
    phys.dispose();
  }
}

/** What a run comes to, for the screen's board and the check. */
export interface StackScore {
  placed: number;
  ok: number;
  fallen: number;
  maxDrop: number;
  /** The deepest a box was pressed into the one under it, mm. */
  pressed: number;
  timeS: number;
  stopped: string | null;
  slipped: boolean;
  pass: boolean;
}

export function scoreStack(run: PalletRun, timeLimitS: number | null = null): StackScore {
  const placed = run.boxes.filter((b) => b.placed).length;
  const ok = run.boxes.filter((b) => b.ok).length;
  const fallen = run.boxes.filter((b) => b.fallen).length;
  const gaps = run.boxes.map((b) => b.releaseGap).filter((g): g is number => g !== null);
  const maxDrop = gaps.length ? Math.max(0, ...gaps) : 0;
  const pressed = Math.max(0, ...run.frames[run.frames.length - 1].crush);
  return {
    placed,
    ok,
    fallen,
    maxDrop,
    pressed,
    timeS: run.durationS,
    stopped: run.failure?.text ?? null,
    slipped: run.events.some((e) => e.kind === 'slip'),
    pass: !run.failure && ok === N_BOXES && maxDrop <= DROP_OK_MM && pressed <= PRESS_OK_MM && (timeLimitS === null || run.durationS <= timeLimitS),
  };
}

/** A worked fix (tools/check, the guide): the pitch is the box height, let go 2 mm above. */
export const STACK_FIX: StackValues = { pitch: PBOX.h, gap: 2 };
export const FIXES: Record<LogiProblem, LogiValues> = { 1: STACK_FIX, 2: SPEED_FIX, 3: REF_FIX };
/** ②'s time limit applies to ② only. */
export const limitFor = (p: LogiProblem) => (p === 2 ? TIME_LIMIT_S : null);
