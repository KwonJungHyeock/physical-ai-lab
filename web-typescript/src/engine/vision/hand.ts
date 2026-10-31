/**
 * 손 따라하기 (teaching by hand): a hand seen by the PC's camera moves the tool, and a shown path
 * becomes a process to replay — the plain form of imitation learning (learning from a demonstration).
 *
 * The hand's 21 landmarks (MediaPipe Hand Landmarker, image coordinates 0..1) give three numbers and
 * one switch: where the palm is left-right and up-down in the picture, how big it looks (nearer the
 * camera = bigger = forward), and whether thumb and index finger touch (the pinch closes the
 * gripper). They map onto the tool the way the coordinate jog's keys read: 앞 X+, 오른쪽 Y−, 위 Z+,
 * moved from where the tool was when the hand was taken as the reference ([기준 잡기]).
 *
 * No React or DOM here: the console feeds landmarks in and moves the arm (Console.tsx); checked by
 * tests/simulator/hand-check.mts.
 */

import type { PointMm } from '../robot/tool';
import { DEFAULT_SPEED } from '../simulator/program';
import type { Process, ProcRow } from '../simulator/process';

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/** What the console needs from one picture of a hand. */
export interface HandPose {
  /** The palm centre, mirrored (as the user sees themself): 0 = left edge, 1 = right edge. */
  x: number;
  /** The palm centre, 0 = top, 1 = bottom. */
  y: number;
  /** How big the hand looks: wrist to middle-finger knuckle, in picture widths. */
  size: number;
  /** Thumb tip to index tip over the hand size (small = touching). */
  pinch: number;
}

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

/** The pose of one hand from its 21 landmarks, or null when they are not all there. */
export function handPose(lm: readonly Landmark[]): HandPose | null {
  if (lm.length < 21) return null;
  const size = dist(lm[WRIST], lm[MIDDLE_MCP]);
  if (size < 1e-3) return null;
  const cx = (lm[WRIST].x + lm[INDEX_MCP].x + lm[PINKY_MCP].x) / 3;
  const cy = (lm[WRIST].y + lm[INDEX_MCP].y + lm[PINKY_MCP].y) / 3;
  return { x: 1 - cx, y: cy, size, pinch: dist(lm[THUMB_TIP], lm[INDEX_TIP]) / size };
}

export interface HandGains {
  /** Tool travel for the hand crossing the whole picture left-right, mm. */
  sideMm: number;
  /** … up-down, mm. */
  upMm: number;
  /** Tool travel forward when the hand looks twice as big, mm. */
  forwardMm: number;
}

/** Moving the hand across half the picture moves the tool 15 cm. */
export const HAND_GAINS: HandGains = { sideMm: 300, upMm: 300, forwardMm: 200 };
/** How far from the reference the tool may be taken, mm (each axis). */
export const HAND_REACH_MM = 150;
/** Lowest the tool tip is taken, mm above the desk (a gripper's fingers reach 10 mm below its tip). */
export const HAND_FLOOR_MM = 15;
/** The pinch closes below this ratio and opens again above HAND_OPEN (no flicker in between). */
export const HAND_CLOSE = 0.35;
export const HAND_OPEN = 0.55;
/** Smoothing of the hand's numbers per picture (0..1: how much of the new one is taken). */
const SMOOTH = 0.35;

/**
 * Follows one hand: smoothed, mapped from the reference pose onto the tool, and the pinch with
 * hysteresis. `reference` takes the hand now as the place the tool is now.
 */
export class HandMapper {
  private ref: { pose: HandPose; tip: PointMm } | null = null;
  private s: HandPose | null = null;
  closed = false;

  constructor(private gains: HandGains = HAND_GAINS) {}

  get ready(): boolean {
    return !!this.ref;
  }

  reference(pose: HandPose, tip: PointMm): void {
    this.s = { ...pose };
    this.ref = { pose: { ...pose }, tip: { ...tip } };
    this.closed = pose.pinch < HAND_CLOSE;
  }

  /** Where the tool should be for this picture of the hand, and whether the gripper is closed. */
  update(pose: HandPose): { target: PointMm; closed: boolean } | null {
    if (!this.ref) return null;
    const p = this.s;
    this.s = p ? { x: p.x + (pose.x - p.x) * SMOOTH, y: p.y + (pose.y - p.y) * SMOOTH, size: p.size + (pose.size - p.size) * SMOOTH, pinch: pose.pinch } : { ...pose };
    if (this.closed && pose.pinch > HAND_OPEN) this.closed = false;
    else if (!this.closed && pose.pinch < HAND_CLOSE) this.closed = true;
    const r = this.ref;
    const clamp = (v: number) => Math.max(-HAND_REACH_MM, Math.min(HAND_REACH_MM, v));
    const dx = clamp((this.s.size / r.pose.size - 1) * this.gains.forwardMm);
    const dy = clamp(-(this.s.x - r.pose.x) * this.gains.sideMm);
    const dz = clamp(-(this.s.y - r.pose.y) * this.gains.upMm);
    return { target: { x: r.tip.x + dx, y: r.tip.y + dy, z: Math.max(HAND_FLOOR_MM, r.tip.z + dz) }, closed: this.closed };
  }
}

/* --- the demonstration ------------------------------------------------------------ */

/** One moment of a demonstration: where the tool was (mm), its joints, the gripper. */
export interface DemoSample {
  t: number;
  tip: PointMm;
  joints: number[];
  closed: boolean;
}

/** A point of the path kept when the demonstration is simplified. */
export interface DemoPoint {
  tip: PointMm;
  joints: number[];
  closed: boolean;
}

const gap = (p: PointMm, a: PointMm, b: PointMm) => {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const u = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2));
  return Math.hypot(p.x - a.x - u * ab.x, p.y - a.y - u * ab.y, p.z - a.z - u * ab.z);
};

/** Douglas–Peucker on the tool path: the indices kept so no sample is farther than `tolMm` from the lines. */
function keep(pts: readonly PointMm[], tolMm: number, from: number, to: number, out: Set<number>): void {
  let worst = -1;
  let far = 0;
  for (let i = from + 1; i < to; i += 1) {
    const d = gap(pts[i], pts[from], pts[to]);
    if (d > far) {
      far = d;
      worst = i;
    }
  }
  if (worst >= 0 && far > tolMm) {
    out.add(worst);
    keep(pts, tolMm, from, worst, out);
    keep(pts, tolMm, worst, to, out);
  }
}

/**
 * The demonstration as a few points: the path straightened to within `tolMm`, a point wherever the
 * gripper closed or opened (the hand stopped there to pinch), and the ends.
 */
export function simplifyDemo(samples: readonly DemoSample[], tolMm = 5): DemoPoint[] {
  if (!samples.length) return [];
  const cuts = [0];
  for (let i = 1; i < samples.length; i += 1) if (samples[i].closed !== samples[i - 1].closed) cuts.push(i);
  cuts.push(samples.length - 1);
  const kept = new Set<number>(cuts);
  const tips = samples.map((s) => s.tip);
  for (let k = 1; k < cuts.length; k += 1) keep(tips, tolMm, cuts[k - 1], cuts[k], kept);
  return [...kept].sort((a, b) => a - b).map((i) => ({ tip: { ...samples[i].tip }, joints: samples[i].joints.slice(), closed: samples[i].closed }));
}

/**
 * The simplified demonstration as a process (공정 직접 짜기): a MOVE J to its first point, then
 * MOVE L along the shown path, the gripper opened first and closed or opened where the hand pinched
 * or let go — replayed, edited and saved like any process.
 */
export function demoProcess(points: readonly DemoPoint[], grip: boolean, name = '손 시연'): Process {
  const rows: ProcRow[] = [];
  if (grip) rows.push({ kind: 'grip', open: true, note: '그리퍼 열기' });
  let closed = false;
  points.forEach((p, k) => {
    rows.push({ kind: 'move', mode: k ? 'L' : 'J', joints: p.joints.slice(), note: k ? `시연 ${k + 1}` : '시연 시작' });
    if (grip && p.closed !== closed) {
      rows.push({ kind: 'grip', open: !p.closed, note: p.closed ? '잡기' : '놓기' });
      closed = p.closed;
    }
  });
  return { name, blend: 'tick', speed: DEFAULT_SPEED, rows };
}
