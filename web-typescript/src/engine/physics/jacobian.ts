/**
 * 단원 3 자코비안: how joint speeds turn into tool speed.
 *
 *   v = J(q) q̇        (v: tool velocity, q̇: joint speeds)
 *
 * Column i of J is what joint i alone does to the tool: a revolute joint with
 * world axis z_i through the point p_i moves a tool point t at z_i × (t − p_i)
 * and turns it at z_i. Built from the same URDF frames as the rest of the
 * simulator, so the numbers are the real arm's.
 *
 * Near a singularity (arm stretched out, or wrist axes lined up) one direction
 * of v needs huge joint speeds; the manipulability ellipsoid shows that: its
 * axes are the tool speeds a unit joint-speed ball can make, and it goes flat
 * in the direction the arm can no longer move.
 */

import { Vector3 } from 'three';

import { DEG2RAD, RAD2DEG, forwardKinematicsFrames, type ChainSegment } from '../robot/kinematics';
import { JOINT_COUNT, clampJointAngles } from '../robot/limits';
import { cross, det3, eigSym3, solve, sub, type V3 } from './linalg';

export interface JacobianAt {
  /** 6 x 6: rows vx vy vz (m/s per rad/s) and wx wy wz (rad/s per rad/s); one column per joint. */
  J: number[][];
  /** Tool point, metres, base frame. */
  tip: V3;
  /** Joint positions and world axes, base to wrist. */
  joints: { p: V3; z: V3 }[];
}

/** Geometric Jacobian of the point `tcpMm` along the flange axis. */
export function jacobianAt(chain: readonly ChainSegment[], anglesDeg: readonly number[], tcpMm = 0): JacobianAt {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const last = frames[frames.length - 1].elements;
  const tip: V3 = [last[12] + (last[8] * tcpMm) / 1000, last[13] + (last[9] * tcpMm) / 1000, last[14] + (last[10] * tcpMm) / 1000];
  const J = Array.from({ length: 6 }, () => new Array<number>(JOINT_COUNT).fill(0));
  const joints: JacobianAt['joints'] = [];
  chain.forEach((seg, i) => {
    // A mimic joint (4-axis arms' level head) adds to the column of the joint it follows.
    const c = seg.movableIndex >= 0 ? seg.movableIndex : (seg.mimic?.index ?? -1);
    const k = seg.movableIndex >= 0 ? 1 : (seg.mimic?.multiplier ?? 0);
    if (c < 0 || c >= JOINT_COUNT) return;
    const e = frames[i].elements;
    const zv = seg.axis.clone().transformDirection(frames[i]);
    const z: V3 = [zv.x, zv.y, zv.z];
    const p: V3 = [e[12], e[13], e[14]];
    const lin = cross(z, sub(tip, p));
    for (let r = 0; r < 3; r += 1) {
      J[r][c] += k * lin[r];
      J[r + 3][c] += k * z[r];
    }
    if (seg.movableIndex >= 0) joints[c] = { p, z };
  });
  return { J, tip, joints };
}

/** Tool velocity, mm/s and °/s, for joint speeds in °/s. */
export function toolVelocity(J: readonly (readonly number[])[], qdotDegS: readonly number[]): { linearMmS: V3; angularDegS: V3 } {
  const q = qdotDegS.map((d) => d * DEG2RAD);
  const row = (r: number) => J[r].reduce((s, v, i) => s + v * (q[i] ?? 0), 0);
  return {
    linearMmS: [row(0) * 1000, row(1) * 1000, row(2) * 1000],
    angularDegS: [row(3) * RAD2DEG, row(4) * RAD2DEG, row(5) * RAD2DEG],
  };
}

export interface Manipulability {
  /** Yoshikawa's index for the position rows, sqrt(det(Jv Jvᵀ)), in (mm/s)³ per (rad/s)³ ... shown as a 0..1 score. */
  index: number;
  /** Ellipsoid semi-axes: tool speed (mm/s) for 1 rad/s of joint speed, largest first, with directions. */
  axes: { lengthMm: number; dir: V3 }[];
  /** Smallest / largest axis: 1 = round (moves equally well every way), 0 = singular. */
  isotropy: number;
}

/** Position manipulability ellipsoid: eigen-decomposition of Jv Jvᵀ. */
export function manipulability(J: readonly (readonly number[])[]): Manipulability {
  const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => J[r].reduce((s, v, i) => s + v * J[c][i], 0)));
  const { values, vectors } = eigSym3(A);
  const axes = values.map((v, i) => ({ lengthMm: Math.sqrt(Math.max(0, v)) * 1000, dir: vectors[i] }));
  return {
    index: Math.sqrt(Math.max(0, det3(A))),
    axes,
    isotropy: axes[0].lengthMm > 0 ? axes[2].lengthMm / axes[0].lengthMm : 0,
  };
}

/** Index of a reference pose, so the screen can show the score as 0..100 %. */
export function manipulabilityScore(index: number, reference: number): number {
  return Math.max(0, Math.min(1, index / reference));
}

/**
 * Resolved-rate control, one tick: joint speeds that give the tool the linear
 * velocity `vMmS` (orientation left free), by damped least squares
 *     q̇ = Jvᵀ (Jv Jvᵀ + λ² I)⁻¹ v
 * Damping keeps q̇ finite at a singularity, at the cost of not quite reaching v.
 * Returns the joint speeds (°/s) and the new angles after `dt` seconds.
 */
export function resolvedRateStep(
  chain: readonly ChainSegment[],
  anglesDeg: readonly number[],
  vMmS: readonly number[],
  dt: number,
  tcpMm = 0,
  lambda = 0.004,
): { qdotDegS: number[]; next: number[]; achievedMmS: V3 } {
  const { J } = jacobianAt(chain, anglesDeg, tcpMm);
  const v = vMmS.map((x) => x / 1000);
  const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => J[r].reduce((s, x, i) => s + x * J[c][i], 0) + (r === c ? lambda * lambda : 0)));
  const y = solve(A, v);
  const qdot = Array.from({ length: JOINT_COUNT }, (_, i) => (J[0][i] * y[0] + J[1][i] * y[1] + J[2][i] * y[2]) * RAD2DEG);
  const next = clampJointAngles(anglesDeg.map((a, i) => a + qdot[i] * dt));
  const achieved = toolVelocity(J, qdot).linearMmS;
  return { qdotDegS: qdot, next, achievedMmS: achieved };
}

/** Tool point in mm (base frame) — the same point jacobianAt differentiates. */
export function toolPointMm(chain: readonly ChainSegment[], anglesDeg: readonly number[], tcpMm = 0): Vector3 {
  const t = jacobianAt(chain, anglesDeg, tcpMm).tip;
  return new Vector3(t[0] * 1000, t[1] * 1000, t[2] * 1000);
}
