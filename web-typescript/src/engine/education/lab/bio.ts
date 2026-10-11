/**
 * 산업단지 · 바이오 실험실 — 시험관 옮기기 (myCobot 280 RDK X5 + 어댑티브 그리퍼, real size). Three
 * problems on one bench, each a run the screen plays back (BioCell) and the panel reads its numbers
 * from — nothing is written down that the engine did not compute:
 *
 *  ① 시험관이 기울어 쏟아진다 — the place pose was copied from a pouring program (tool tilted 35°):
 *    the arm tilts the full tube on the way and the sample spills once the tilt passes the tube's
 *    spill angle atan(2h / d). The fix is the pose's orientation (rx · ry · rz), not its position.
 *  ② 먼 칸일수록 어긋난다 — after a J1 servo was replaced its zero is 1° off. Every tube lands
 *    r × δθ to the side: the near holes take it (out of the reading standard), a far hole catches the
 *    tube on its rim. The fix is a calibration: δθ from the offsets, subtracted from J1.
 *  ③ 돌아가는 길에 부딪힌다 — a centrifuge stands between the racks; the joint move at lift height
 *    swings the held tube into its lid. Lifting over it is out of the arm's reach; a waypoint round
 *    the near side is not.
 *
 * Collisions are the simulator's (physics/collide.ts: the arm's capsules against boxes) plus the
 * held tube as a capsule of its own. No React, no WebGL: tests/education/bio-check.mts runs these
 * headless.
 */

import { poseContact, type Box } from '../../physics/collide';
import { forwardKinematicsFrames, type ChainSegment } from '../../robot/kinematics';
import { jointTrajectory } from '../../robot/motion';
import { solveToolPose, type ToolOrientation } from '../../robot/tool';
import { tcpFor } from '../../simulator/effectors';
import { HOME_Q, type Mm } from './cell';

export type BioProblem = 1 | 2 | 3;

/** The official adaptive gripper: flange face to the point between the fingertips, mm. */
export const TOOL_MM = tcpFor('adaptive', false);
/** Finger opening, mm: open, and closed on a tube. */
export const GAP = { open: 26, closed: 12 } as const;

/** A 12 × 75 mm glass tube, held 8 mm below its rim: inner diameter, and how far it reaches below the grip point, mm. */
export const TUBE = { d: 12, inner: 10, len: 75, above: 8 } as const;
export const BELOW = TUBE.len - TUBE.above;
/** A rack: top surface and the floor of its holes, mm. A tube standing in it has its grip point at SEAT_Z. */
export const RACK = { top: 45, floor: 8 } as const;
export const SEAT_Z = RACK.floor + BELOW;
/** Lift height for carrying (grip point), mm: the tube's bottom clears a rack by 13 mm. */
export const LIFT_Z = 125;

/** ①③: where the tube is taken from and put, mm (rack hole centres). */
export const SRC: readonly [number, number] = [150, 100];
export const DST: readonly [number, number] = [150, -100];

/** ①: the sample nearly full — 3 mm below the rim — so it spills at atan(2 × 3 / 10) ≈ 31°. */
export const HEADSPACE_MM = 3;
export const SPILL_DEG = (Math.atan((2 * HEADSPACE_MM) / TUBE.inner) * 180) / Math.PI;

/** ②: the J1 servo's zero after the swap, degrees (what the arm really turns more than told). */
export const J1_ERR_DEG = 1;
/** ②: the analyser rack's holes along one line out from the robot (direction, first hole, pitch, count). */
export const ROW = { dirDeg: -25, r0: 110, pitch: 20, n: 6 } as const;
/** ②: a tube more than this far off a hole's centre catches its rim (hole Ø18 for a Ø12 tube); the reader wants 1 mm. */
export const CATCH_MM = 3;
export const READ_MM = 1;
/** ②: the sample tray, tubes standing in a line along y, mm. */
export const TRAY = { x: 60, y0: 120, pitch: 18 } as const;

/** ③: the centrifuge between the racks, mm. */
export const CENTRIFUGE: Box = { min: [150, -30, 0], max: [230, 30, 95], name: '원심분리기' };
/** ③: how far the tube's bottom must stay above what it passes over, mm. */
export const CLEAR_MM = 10;

/** Racks and the tray as the arm keeps off them (their holes are not modelled: tubes go in at the hole). */
const rackBox = (x: number, y: number, sx = 44, sy = 120, name = '랙'): Box => ({ min: [x - sx / 2, y - sy / 2, 0], max: [x + sx / 2, y + sy / 2, RACK.top], name });

export const rowHole = (k: number): Mm => {
  const a = (ROW.dirDeg * Math.PI) / 180;
  const r = ROW.r0 + k * ROW.pitch;
  return [r * Math.cos(a), r * Math.sin(a), SEAT_Z];
};
export const trayHole = (k: number): Mm => [TRAY.x, TRAY.y0 + k * TRAY.pitch, SEAT_Z];

/* --- values --------------------------------------------------------------------------- */

/** ①: the place pose's orientation: tilt of the tool from vertical, and its turn about the vertical, degrees. */
export interface PoseValues {
  tilt: number;
  yaw: number;
}
/** ②: the J1 zero correction subtracted from every command, degrees. */
export interface CalibValues {
  zero: number;
  /** The situation, not the student's: how much more J1 really turns (default J1_ERR_DEG; 대단원 마무리 평가). */
  err?: number;
}
/** ③: the carrying height, and a waypoint on the way (or none). */
export interface PathValues {
  lift: number;
  via: boolean;
  vx: number;
  vy: number;
  vz: number;
}
export type BioValues = PoseValues | CalibValues | PathValues;

export const BIO_DEFAULTS: Record<BioProblem, BioValues> = {
  1: { tilt: 35, yaw: 0 },
  2: { zero: 0 },
  3: { lift: LIFT_Z, via: false, vx: 100, vy: 0, vz: LIFT_Z },
};
export const BIO_FIXES: Record<BioProblem, BioValues> = {
  1: { tilt: 0, yaw: 0 },
  2: { zero: 1 },
  3: { lift: LIFT_Z, via: true, vx: 90, vy: 0, vz: LIFT_Z },
};

/* --- the run ------------------------------------------------------------------------------ */

export type TubeMode = 'rack' | 'held' | 'placed' | 'stuck';

export interface TubeState {
  /** The rim's centre and the bottom's centre, mm. */
  top: Mm;
  bottom: Mm;
  mode: TubeMode;
  /** How much of the sample is left (1 = full), and where the spill lies (table). */
  left: number;
}

export interface BioFrame {
  t: number;
  q: number[];
  gap: number;
  tubes: TubeState[];
  /** Tool tilt from vertical, degrees. */
  tilt: number;
  alarm: boolean;
}

export type BioEventKind = 'grip' | 'place' | 'spill' | 'catch' | 'hit' | 'unreachable' | 'done';

export interface BioEvent {
  t: number;
  kind: BioEventKind;
  text: string;
  at?: Mm;
  /** The number that goes with it (tilt °, offset mm …). */
  value?: number;
  tube?: number;
}

export interface BioRun {
  values: BioValues;
  frames: BioFrame[];
  events: BioEvent[];
  durationS: number;
  failure: BioEvent | null;
  /** Grip point every frame, mm. */
  tip: Mm[];
  maxTilt: number;
  /** ②: each placed tube's offset from its hole's centre, mm (null: not placed). */
  offsets: (number | null)[];
  /** ③: the closest the held tube came to the centrifuge, mm. */
  minClear: number;
}

const DT = 0.01;
const FRAME_DT = 0.02;
const SPEED = { travel: 50, down: 30 };

/** Grip point and tool axis (unit, pointing out of the fingers) for joint angles, mm. */
export function toolAt(chain: readonly ChainSegment[], q: readonly number[]): { tip: Mm; axis: Mm } {
  const f = forwardKinematicsFrames(chain, q);
  const e = f[f.length - 1].elements;
  const axis: Mm = [e[8], e[9], e[10]];
  return { tip: [e[12] * 1000 + axis[0] * TOOL_MM, e[13] * 1000 + axis[1] * TOOL_MM, e[14] * 1000 + axis[2] * TOOL_MM], axis };
}
const tiltOf = (axis: Mm) => (Math.acos(Math.max(-1, Math.min(1, -axis[2]))) * 180) / Math.PI;

/** The tool at a point with an orientation (null: out of reach). */
export function poseAt(chain: readonly ChainSegment[], p: Mm, o: ToolOrientation = { yawDeg: 0, tiltDeg: 0 }, seed: readonly number[] = HOME_Q): number[] | null {
  const r = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm: TOOL_MM, orientation: o });
  return r.converged ? r.anglesDeg : null;
}

function pointBoxDist(p: Mm, b: Box): number {
  const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
  const dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]);
  const dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
  return Math.hypot(dx, dy, dz);
}

/** Closest the held tube (its wall) comes to a box, mm (≤ 0: touching). */
function tubeClear(top: Mm, bottom: Mm, b: Box): number {
  let best = Infinity;
  for (let k = 0; k <= 8; k += 1) {
    const s = k / 8;
    const p: Mm = [top[0] + (bottom[0] - top[0]) * s, top[1] + (bottom[1] - top[1]) * s, top[2] + (bottom[2] - top[2]) * s];
    best = Math.min(best, pointBoxDist(p, b) - TUBE.d / 2);
  }
  return best;
}

class BioSim {
  t = 0;
  /** What the arm is told, and what it does (② adds the J1 zero error). */
  q: number[];
  gap: number = GAP.open;
  tubes: TubeState[];
  held = -1;
  frames: BioFrame[] = [];
  events: BioEvent[] = [];
  tip: Mm[] = [];
  failure: BioEvent | null = null;
  maxTilt = 0;
  minClear = Infinity;
  private nextFrame = 0;

  constructor(
    readonly chain: readonly ChainSegment[],
    tubes: Mm[],
    readonly boxes: Box[],
    /** Degrees the real J1 turns more than told (②). */
    readonly j1Err = 0,
    /** Boxes the held tube must keep off (③), and the tube's spill angle (①; Infinity: not full). */
    readonly tubeBoxes: Box[] = [],
    readonly spillDeg = Infinity,
  ) {
    this.q = HOME_Q.slice();
    this.tubes = tubes.map((p) => ({ top: [p[0], p[1], p[2] + TUBE.above], bottom: [p[0], p[1], p[2] - BELOW], mode: 'rack', left: 1 }));
    this.snap();
  }

  get actual(): number[] {
    return this.j1Err ? [this.q[0] + this.j1Err, ...this.q.slice(1)] : this.q;
  }

  log(kind: BioEventKind, text: string, extra: Partial<BioEvent> = {}): BioEvent {
    const e = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }
  fail(kind: BioEventKind, text: string, extra: Partial<BioEvent> = {}): false {
    this.failure ??= this.log(kind, text, extra);
    return false;
  }

  private snap(): void {
    const { tip, axis } = toolAt(this.chain, this.actual);
    if (this.held >= 0) {
      const tb = this.tubes[this.held];
      tb.top = [tip[0] - axis[0] * TUBE.above, tip[1] - axis[1] * TUBE.above, tip[2] - axis[2] * TUBE.above];
      tb.bottom = [tip[0] + axis[0] * BELOW, tip[1] + axis[1] * BELOW, tip[2] + axis[2] * BELOW];
    }
    const tilt = tiltOf(axis);
    if (this.t + 1e-9 >= this.nextFrame) {
      this.nextFrame += FRAME_DT;
      this.frames.push({ t: this.t, q: this.actual.slice(), gap: this.gap, tubes: this.tubes.map((x) => ({ ...x, top: [...x.top] as Mm, bottom: [...x.bottom] as Mm })), tilt, alarm: !!this.failure });
      this.tip.push(tip);
    }
  }

  /** One step: the checks a real cell would make (spill, collisions). */
  private check(): boolean {
    const { tip, axis } = toolAt(this.chain, this.actual);
    if (this.held >= 0) {
      const tilt = tiltOf(axis);
      this.maxTilt = Math.max(this.maxTilt, tilt);
      const tb = this.tubes[this.held];
      if (tilt > this.spillDeg && tb.left === 1) {
        tb.left = 0.55;
        return this.fail('spill', `시료가 쏟아졌어요 — 시험관이 ${tilt.toFixed(1)}° 기울었어요 (쏟아지는 각도 ${this.spillDeg.toFixed(1)}°) — 작업 중지`, { at: tip, value: tilt, tube: this.held });
      }
      for (const b of this.tubeBoxes) {
        const c = tubeClear(tb.top, tb.bottom, b);
        this.minClear = Math.min(this.minClear, c);
        if (c <= 0) return this.fail('hit', `들고 있던 시험관이 ${b.name}에 부딪혔어요 — 작업 중지`, { at: tb.bottom, tube: this.held });
      }
    }
    const c = poseContact(this.chain, this.actual, [...this.boxes, ...this.tubeBoxes], TOOL_MM);
    if (c) return this.fail('hit', `J${c.joint} 쪽이 ${c.what}에 부딪혔어요 — 작업 중지`, { at: c.at as Mm });
    void tip;
    return true;
  }

  moveJ(to: readonly number[], speed: number): boolean {
    if (this.failure) return false;
    const tr = jointTrajectory(this.q, to, speed);
    const steps = Math.max(1, Math.ceil(tr.durationS / DT));
    for (let k = 1; k <= steps; k += 1) {
      this.t += tr.durationS / steps;
      this.q = tr.sample((k / steps) * tr.durationS);
      const ok = this.check();
      this.snap();
      if (!ok) return false;
    }
    return true;
  }

  wait(s: number): void {
    const end = this.t + s;
    while (this.t < end - 1e-9) {
      this.t = Math.min(end, this.t + DT);
      this.snap();
    }
  }

  /** Close the fingers on the tube under them (it centres itself in the fingers). */
  grip(k: number): void {
    for (let i = 1; i <= 20; i += 1) {
      this.gap = GAP.open + (GAP.closed - GAP.open) * (i / 20);
      this.t += 0.02;
      this.snap();
    }
    this.held = k;
    this.tubes[k].mode = 'held';
    this.log('grip', `${k + 1}번 시험관을 잡았어요`, { tube: k, at: toolAt(this.chain, this.actual).tip });
    this.snap();
  }

  release(mode: TubeMode = 'placed'): void {
    const k = this.held;
    for (let i = 1; i <= 15; i += 1) {
      this.gap = GAP.closed + (GAP.open - GAP.closed) * (i / 15);
      this.t += 0.02;
      this.snap();
    }
    if (k >= 0) this.tubes[k].mode = mode;
    this.held = -1;
  }

  finish(values: BioValues, offsets: (number | null)[]): BioRun {
    if (!this.failure) this.log('done', '작업을 마쳤어요');
    this.wait(0.4);
    return { values, frames: this.frames, events: this.events, durationS: this.t, failure: this.failure, tip: this.tip, maxTilt: this.maxTilt, offsets, minClear: this.minClear };
  }
}

const up = (p: readonly number[], z = LIFT_Z): Mm => [p[0], p[1], z];
const seat = (p: readonly number[]): Mm => [p[0], p[1], SEAT_Z];

/** Down into a hole, grip, back up (the tool vertical). */
function pick(sim: BioSim, k: number, at: readonly number[], lift = LIFT_Z): boolean {
  const a = poseAt(sim.chain, up(at, lift), undefined, sim.q);
  const b = a && poseAt(sim.chain, seat(at), undefined, a);
  if (!a || !b) return sim.fail('unreachable', `시험관 자리 (${at[0].toFixed(0)}, ${at[1].toFixed(0)}) 위에 손이 닿지 않아요`, { at: up(at, lift) });
  if (!sim.moveJ(a, SPEED.travel) || !sim.moveJ(b, SPEED.down)) return false;
  sim.grip(k);
  return sim.moveJ(a, SPEED.down);
}

/* --- ① 시험관이 기울어 쏟아진다 -------------------------------------------------------------------- */

export function runPose(chain: readonly ChainSegment[], v: PoseValues): BioRun {
  const sim = new BioSim(chain, [seat(SRC)], [rackBox(SRC[0], SRC[1]), rackBox(DST[0], DST[1])], 0, [], SPILL_DEG);
  const o: ToolOrientation = { yawDeg: v.yaw, tiltDeg: v.tilt };
  if (pick(sim, 0, SRC)) {
    const a = poseAt(chain, up(DST), o, sim.q);
    const b = a && poseAt(chain, seat(DST), o, a);
    if (!a || !b) sim.fail('unreachable', `이 자세(기울기 ${v.tilt}°)로는 놓을 자리에 손이 닿지 않아요`, { at: up(DST) });
    else if (sim.moveJ(a, SPEED.travel) && sim.moveJ(b, SPEED.down)) {
      // A tilted tube does not go into a straight hole.
      if (v.tilt > 3) sim.fail('catch', `시험관이 ${v.tilt}° 기울어 랙 구멍에 들어가지 않아요`, { at: seat(DST), value: v.tilt });
      else {
        sim.release();
        sim.log('place', '1번 시험관을 분석 랙에 꽂았어요', { tube: 0, at: seat(DST) });
        if (sim.moveJ(a, SPEED.down)) sim.moveJ(HOME_Q, SPEED.travel);
      }
    }
  }
  return sim.finish(v, []);
}

/* --- ② 먼 칸일수록 어긋난다 ------------------------------------------------------------------------ */

/** The reader's small scatter of a placed tube, ±0.2 mm per axis (this arm's spread; the datasheet's repeatability allows up to ±0.5 mm, but that much would
 * blur the r × δθ pattern the problem is about), mm, the same for the same hole. */
const scatter = (k: number): [number, number] => {
  const s = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
  const u = s - Math.floor(s);
  const w = Math.cos(k * 78.233 + 1.7) * 24634.6345;
  const v = w - Math.floor(w);
  return [(u - 0.5) * 0.4, (v - 0.5) * 0.4];
};

/** ②: where each hole's tube would land for a correction (no run): offset from the centre, mm. */
export function calibPreview(chain: readonly ChainSegment[], v: CalibValues): { r: number; offset: number }[] {
  return Array.from({ length: ROW.n }, (_, k) => {
    const h = rowHole(k);
    const q = poseAt(chain, h);
    if (!q) return { r: Math.hypot(h[0], h[1]), offset: NaN };
    const cmd = [q[0] - v.zero, ...q.slice(1)];
    const real = toolAt(chain, [cmd[0] + (v.err ?? J1_ERR_DEG), ...cmd.slice(1)]).tip;
    const [sx, sy] = scatter(k);
    return { r: Math.hypot(h[0], h[1]), offset: Math.hypot(real[0] + sx - h[0], real[1] + sy - h[1]) };
  });
}

export function runCalib(chain: readonly ChainSegment[], v: CalibValues): BioRun {
  const holes = Array.from({ length: ROW.n }, (_, k) => rowHole(k));
  const sim = new BioSim(chain, holes.map((_, k) => trayHole(k)), [rackBox(TRAY.x, TRAY.y0 + 45, 30, 120, '시료 트레이'), rackBox(holes[2][0] + 8, holes[2][1] - 4, 150, 34, '분석 랙')], v.err ?? J1_ERR_DEG);
  const offsets: (number | null)[] = holes.map(() => null);
  // The commands carry the correction: J1 is told (wanted − zero).
  const cmd = (q: number[] | null) => (q ? [q[0] - v.zero, ...q.slice(1)] : null);
  for (let k = 0; k < ROW.n && !sim.failure; k += 1) {
    // Picking is forgiving (the fingers open 26 mm round a 12 mm tube and centre it).
    const t = trayHole(k);
    const a = cmd(poseAt(chain, up(t), undefined, sim.q));
    const b = a && cmd(poseAt(chain, seat(t), undefined, a));
    if (!a || !b) {
      sim.fail('unreachable', `트레이 ${k + 1}번 자리에 손이 닿지 않아요`, { at: up(t) });
      break;
    }
    if (!sim.moveJ(a, SPEED.travel) || !sim.moveJ(b, SPEED.down)) break;
    sim.grip(k);
    if (!sim.moveJ(a, SPEED.down)) break;
    const h = holes[k];
    const c = cmd(poseAt(chain, up(h), undefined, sim.q));
    const d = c && cmd(poseAt(chain, [h[0], h[1], SEAT_Z + 6], undefined, c));
    if (!c || !d) {
      sim.fail('unreachable', `분석 랙 ${k + 1}번 칸 위에 손이 닿지 않아요`, { at: up(h) });
      break;
    }
    if (!sim.moveJ(c, SPEED.travel) || !sim.moveJ(d, SPEED.down)) break;
    const real = toolAt(chain, sim.actual).tip;
    const [sx, sy] = scatter(k);
    const off = Math.hypot(real[0] + sx - h[0], real[1] + sy - h[1]);
    const r = Math.hypot(h[0], h[1]);
    if (off > CATCH_MM) {
      sim.fail('catch', `${k + 1}번 칸: 시험관이 구멍 가장자리에 걸렸어요 (가운데에서 ${off.toFixed(1)} mm) — 작업 중지`, { at: [h[0], h[1], RACK.top], value: off, tube: k });
      sim.tubes[k].bottom = [real[0], real[1], RACK.top - 2];
      break;
    }
    // Down the last 6 mm into the hole and let go: the hole's funnel takes it, off by `off`.
    const e = cmd(poseAt(chain, seat(h), undefined, d));
    if (e && !sim.moveJ(e, SPEED.down)) break;
    sim.release();
    offsets[k] = off;
    sim.log('place', `${k + 1}번 칸 (몸통에서 ${r.toFixed(0)} mm): 가운데에서 ${off.toFixed(1)} mm${off > READ_MM ? ' — 기준(1 mm) 밖' : ''}`, { tube: k, value: off, at: [h[0], h[1], RACK.top] });
    if (!sim.moveJ(c, SPEED.down)) break;
  }
  if (!sim.failure) sim.moveJ(HOME_Q, SPEED.travel);
  return sim.finish(v, offsets);
}

/* --- ③ 돌아가는 길에 부딪힌다 ---------------------------------------------------------------------- */

export function runPath(chain: readonly ChainSegment[], v: PathValues): BioRun {
  const sim = new BioSim(chain, [seat(SRC)], [rackBox(SRC[0], SRC[1]), rackBox(DST[0], DST[1])], 0, [CENTRIFUGE]);
  if (pick(sim, 0, SRC, v.lift)) {
    const route: { p: Mm; name: string }[] = [...(v.via ? [{ p: [v.vx, v.vy, v.vz] as Mm, name: '경유점' }] : []), { p: up(DST, v.lift), name: '놓을 자리 위' }];
    let ok = true;
    for (const leg of route) {
      const q = poseAt(chain, leg.p, undefined, sim.q);
      if (!q) {
        ok = sim.fail('unreachable', `${leg.name} (${leg.p.map((x) => x.toFixed(0)).join(', ')})에 손이 닿지 않아요`, { at: leg.p });
        break;
      }
      if (!sim.moveJ(q, SPEED.travel)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const b = poseAt(chain, seat(DST), undefined, sim.q);
      if (b && sim.moveJ(b, SPEED.down)) {
        sim.release();
        sim.log('place', '시험관을 분석 랙에 꽂았어요', { tube: 0, at: seat(DST) });
        const a = poseAt(chain, up(DST, v.lift), undefined, sim.q);
        if (a && sim.moveJ(a, SPEED.down)) sim.moveJ(HOME_Q, SPEED.travel);
      }
    }
  }
  return sim.finish(v, []);
}

export function runBio(chain: readonly ChainSegment[], p: BioProblem, v: BioValues): BioRun {
  return p === 1 ? runPose(chain, v as PoseValues) : p === 2 ? runCalib(chain, v as CalibValues) : runPath(chain, v as PathValues);
}

/* --- 판정 ------------------------------------------------------------------------------------ */

export interface BioCheck {
  label: string;
  ok: boolean;
  value: string;
}
export interface BioScore {
  pass: boolean;
  checks: BioCheck[];
  headline: string;
  placed: number;
}

export function scoreBio(p: BioProblem, run: BioRun): BioScore {
  const placed = run.events.filter((e) => e.kind === 'place').length;
  const f = run.failure;
  const stop: BioCheck = { label: '작업 중지 없음', ok: !f, value: f ? f.text.replace(/ — 작업 중지$/, '') : '없음' };
  if (p === 1) {
    const checks: BioCheck[] = [
      { label: `옮기는 내내 기울기 ${SPILL_DEG.toFixed(0)}° 아래 (쏟지 않음)`, ok: run.maxTilt < SPILL_DEG, value: `최대 ${run.maxTilt.toFixed(1)}°` },
      { label: '분석 랙에 꽂음', ok: placed === 1, value: placed ? '했어요' : '못 했어요' },
      stop,
    ];
    return { pass: checks.every((c) => c.ok), checks, headline: f ? f.text.replace(/ — 작업 중지$/, '') : '시료를 쏟지 않고 옮겼어요', placed };
  }
  if (p === 2) {
    const offs = run.offsets.filter((x): x is number => x !== null);
    const worst = offs.length ? Math.max(...offs) : NaN;
    const checks: BioCheck[] = [
      { label: `${ROW.n}개 모두 꽂음`, ok: placed === ROW.n, value: `${placed} / ${ROW.n}` },
      { label: `모두 칸 가운데에서 ${READ_MM} mm 안 (분석기가 읽음)`, ok: placed === ROW.n && worst <= READ_MM, value: offs.length ? `최대 ${worst.toFixed(1)} mm` : '—' },
      stop,
    ];
    return { pass: checks.every((c) => c.ok), checks, headline: f ? f.text.replace(/ — 작업 중지$/, '') : worst > READ_MM ? `${ROW.n}개를 꽂았지만 ${worst.toFixed(1)} mm 어긋난 칸이 있어요` : `${ROW.n}개 모두 1 mm 안에 꽂았어요`, placed };
  }
  const checks: BioCheck[] = [
    { label: '원심분리기 · 랙에 부딪히지 않음', ok: !f || f.kind !== 'hit', value: f?.kind === 'hit' ? '부딪힘' : `가장 가까이 ${Number.isFinite(run.minClear) ? run.minClear.toFixed(0) : '—'} mm` },
    { label: '분석 랙에 꽂음', ok: placed === 1, value: placed ? '했어요' : '못 했어요' },
    stop,
  ];
  return { pass: checks.every((c) => c.ok), checks, headline: f ? f.text.replace(/ — 작업 중지$/, '') : '부딪히지 않고 옮겼어요', placed };
}

/** ③: how far the arm reaches out at a grip-point height (tool vertical, towards a direction), mm. */
export function bioReach(chain: readonly ChainSegment[], z: number, dirDeg = 34): number {
  const a = (dirDeg * Math.PI) / 180;
  let lo = 110;
  let hi = 320;
  if (!poseAt(chain, [lo * Math.cos(a), lo * Math.sin(a), z])) return 0;
  for (let i = 0; i < 10; i += 1) {
    const r = (lo + hi) / 2;
    if (poseAt(chain, [r * Math.cos(a), r * Math.sin(a), z])) lo = r;
    else hi = r;
  }
  return lo;
}
