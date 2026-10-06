/**
 * Collision shapes for the 교육 screens: the arm as a chain of capsules (a
 * segment between two joint centres, thickened by the servo's half-width),
 * checked against the table, the robot's own base and box obstacles.
 *
 * Used by path planning (is this pose / this move free?) and by the "닿으면
 * 멈춤" contact rule: a motion stops at the last pose that is still free, as a
 * servo stalls when the arm meets the table.
 */

import { forwardKinematicsFrames, type ChainSegment } from '../robot/kinematics';
import { JOINT_COUNT } from '../robot/limits';
import type { V3 } from './linalg';

/** Axis-aligned box, mm, robot base frame. */
export interface Box {
  min: V3;
  max: V3;
  name?: string;
}

export interface Capsule {
  a: V3;
  b: V3;
  /** mm */
  r: number;
  /** Which link (for the message): the joint that carries it, 1-based. */
  joint: number;
}

/** Half-widths of the links, mm (the servo bodies are about 48 mm across, the wrist 38). */
const RADII = [0, 0, 22, 21, 19, 18, 16];

/** The robot's base (RDK X5 box and J1 column), mm — the forearm and tool must not come back into it. */
export const BASE_BOX: Box = { min: [-88, -48, 0], max: [48, 48, 125], name: '로봇 받침' };

/** The arm's capsules for these angles; the last one is the tool (flange to tool point). */
export function armCapsules(chain: readonly ChainSegment[], anglesDeg: readonly number[], tcpMm = 0): Capsule[] {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const pts: V3[] = [];
  chain.forEach((seg, i) => {
    if (seg.movableIndex >= 0 && seg.movableIndex < JOINT_COUNT) {
      const e = frames[i].elements;
      pts[seg.movableIndex] = [e[12] * 1000, e[13] * 1000, e[14] * 1000];
    }
  });
  const f = frames[frames.length - 1].elements;
  const flange: V3 = [f[12] * 1000, f[13] * 1000, f[14] * 1000];
  const tip: V3 = [flange[0] + f[8] * tcpMm, flange[1] + f[9] * tcpMm, flange[2] + f[10] * tcpMm];
  const caps: Capsule[] = [];
  // Six joints on the 6-axis arms, four on myPalletizer / ultraArm: link by link, then to the flange.
  const n = pts.length;
  for (let j = 1; j < n - 1; j += 1) caps.push({ a: pts[j], b: pts[j + 1], r: RADII[Math.min(j + 1, 6)], joint: j + 1 });
  caps.push({ a: pts[n - 1], b: flange, r: RADII[6], joint: n });
  // The tool: its rounded end reaches exactly the tool point.
  if (tcpMm > 12) {
    const r = 10;
    caps.push({ a: flange, b: [tip[0] - f[8] * r, tip[1] - f[9] * r, tip[2] - f[10] * r], r, joint: 6 });
  }
  return caps;
}

function pointBoxDistance(p: readonly number[], b: Box): number {
  const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
  const dy = Math.max(b.min[1] - p[1], 0, p[1] - b.max[1]);
  const dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
  return Math.hypot(dx, dy, dz);
}

function* along(c: Capsule, stepMm = 6): Generator<V3> {
  const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]);
  const n = Math.max(1, Math.ceil(len / stepMm));
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    yield [c.a[0] + (c.b[0] - c.a[0]) * t, c.a[1] + (c.b[1] - c.a[1]) * t, c.a[2] + (c.b[2] - c.a[2]) * t];
  }
}

export interface Contact {
  /** What was hit. */
  what: string;
  /** The joint whose link touches (1-based), for "J2 … 닿음". */
  joint: number;
  /** Where, mm. */
  at: V3;
}

/**
 * First contact of the arm in this pose with the table (z < floorZ), the robot's
 * base or a box; null when the pose is free.
 */
export function poseContact(
  chain: readonly ChainSegment[],
  anglesDeg: readonly number[],
  boxes: readonly Box[] = [],
  tcpMm = 0,
  floorZ = 0,
): Contact | null {
  const caps = armCapsules(chain, anglesDeg, tcpMm);
  for (const c of caps) {
    for (const p of along(c)) {
      if (p[2] - c.r < floorZ) return { what: '책상', joint: c.joint, at: p };
      for (const b of boxes) if (pointBoxDistance(p, b) < c.r) return { what: b.name ?? '장애물', joint: c.joint, at: p };
    }
  }
  // Forearm and tool back into the base (the upper arm is attached to it).
  for (const c of caps.slice(1)) {
    for (const p of along(c)) if (pointBoxDistance(p, BASE_BOX) < c.r * 0.8) return { what: BASE_BOX.name!, joint: c.joint, at: p };
  }
  return null;
}

/** Is the straight joint-space move a → b free? Checked every `stepDeg` of the largest joint change. */
export function moveContact(
  chain: readonly ChainSegment[],
  a: readonly number[],
  b: readonly number[],
  boxes: readonly Box[] = [],
  tcpMm = 0,
  stepDeg = 3,
): { contact: Contact; t: number } | null {
  const span = Math.max(...a.map((v, i) => Math.abs(b[i] - v)));
  const n = Math.max(1, Math.ceil(span / stepDeg));
  for (let k = 1; k <= n; k += 1) {
    const t = k / n;
    const q = a.map((v, i) => v + (b[i] - v) * t);
    const c = poseContact(chain, q, boxes, tcpMm);
    if (c) return { contact: c, t };
  }
  return null;
}
