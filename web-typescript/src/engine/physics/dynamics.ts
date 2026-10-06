/**
 * 단원 4 동역학: the joint torques that make a motion happen.
 *
 *   τ = M(q) q̈ + C(q, q̇) q̇ + G(q)
 *
 * Computed with the Newton–Euler method on the URDF chain: first the velocity
 * and acceleration of every link from the base outwards, then, joint by joint,
 * the moment about the joint axis of everything it carries
 *     τ_k = z_k · Σ_{bodies b beyond k} [ (c_b − p_k) × F_b + N_b ]
 *     F_b = m_b (a_cb − g),   N_b = I_b α_b + ω_b × I_b ω_b
 * which is exact for a serial arm.
 *
 * MASSES ARE AN ESTIMATE. The official URDF carries no <inertial> data, so:
 *  - mass: one servo plus its shell per link (≈0.56 kg moving in all; the
 *    myCobot 280 weighs about 850 g with its base)
 *  - centre of mass and inertia: the official 3D mesh of each link as a solid
 *    of uniform density (volume integrals over the mesh triangles)
 * The screen says "근사 모델": it teaches how torque changes (reach out → J2
 * torque grows), not the servo's exact current.
 *
 * TORQUE LIMITS follow from the rated payload: the arm must hold 250 g at full
 * horizontal reach, so each joint's limit is the torque that pose needs, plus
 * 20 % — the servos' real ratings are not published.
 */

import { Matrix3, Matrix4, Vector3 } from 'three';

import { DEG2RAD, forwardKinematicsFrames, type ChainSegment } from '../robot/kinematics';
import { JOINT_COUNT } from '../robot/limits';
import { add, cross, dot, scale, sub, type V3 } from './linalg';

export const GRAVITY = 9.81;

export interface LinkInertia {
  /** kg */
  mass: number;
  /** Centre of mass in the link frame, mm. */
  comMm: V3;
  /** Inertia about the centre of mass per kg (m²), link frame: xx yy zz xy yz zx. */
  gyration: [number, number, number, number, number, number];
}

/** Estimated per link (URDF child link of each joint); see the note at the top. */
export const LINK_INERTIA: Record<string, LinkInertia> = {
  joint2: { mass: 0.13, comMm: [0, -5.11, -19.21], gyration: [7.006e-4, 6.322e-4, 3.556e-4, 0, 9.98e-5, 0] },
  joint3: { mass: 0.15, comMm: [-52.94, 0, 58.02], gyration: [3.37e-4, 2.141e-3, 2.064e-3, 0, 0, 3.87e-5] },
  joint4: { mass: 0.12, comMm: [-45.99, 0, 3.16], gyration: [2.851e-4, 1.691e-3, 1.618e-3, 0, 0, -3.14e-5] },
  joint5: { mass: 0.07, comMm: [0.06, -7.24, -10.53], gyration: [4.854e-4, 3.683e-4, 3.75e-4, 0, 9.02e-5, 0] },
  joint6: { mass: 0.06, comMm: [0, 4.88, -7.52], gyration: [4.498e-4, 3.19e-4, 3.232e-4, 0, -3.63e-5, 0] },
  joint6_flange: { mass: 0.02, comMm: [0, 0, -5.19], gyration: [1.205e-4, 1.205e-4, 2.101e-4, 0, 0, 0] },
};

/** Rated payload of the myCobot 280, kg. */
export const RATED_PAYLOAD_KG = 0.25;

export interface Load {
  /** Mass held at the tool point, kg (tool + block). */
  payloadKg?: number;
  /** Tool point along the flange axis, mm. */
  tcpMm?: number;
  /** Gravity on/off (off: only the inertial part). */
  gravity?: boolean;
}

interface Body {
  joint: number;
  mass: number;
  c: V3;
  I: number[][];
}

interface ArmState {
  p: V3[];
  z: V3[];
  bodies: Body[];
}

function armState(chain: readonly ChainSegment[], q: readonly number[], load: Load): ArmState {
  const frames = forwardKinematicsFrames(chain, q);
  const p: V3[] = [];
  const z: V3[] = [];
  const bodies: Body[] = [];
  let joint = -1;
  const m3 = new Matrix3();
  chain.forEach((seg, i) => {
    const f = frames[i];
    const e = f.elements;
    if (seg.movableIndex >= 0 && seg.movableIndex < JOINT_COUNT) {
      joint = seg.movableIndex;
      p[joint] = [e[12], e[13], e[14]];
      const zv = seg.axis.clone().transformDirection(f);
      z[joint] = [zv.x, zv.y, zv.z];
    }
    const li = LINK_INERTIA[seg.joint.child];
    if (!li || joint < 0) return;
    const c = new Vector3(li.comMm[0] / 1000, li.comMm[1] / 1000, li.comMm[2] / 1000).applyMatrix4(f);
    const [xx, yy, zz, xy, yz, zx] = li.gyration.map((g) => g * li.mass);
    const R = m3.setFromMatrix4(f).elements; // column-major
    const Rm = [
      [R[0], R[3], R[6]],
      [R[1], R[4], R[7]],
      [R[2], R[5], R[8]],
    ];
    const Il = [
      [xx, xy, zx],
      [xy, yy, yz],
      [zx, yz, zz],
    ];
    // I_world = R I Rᵀ
    const RI = Rm.map((row) => [0, 1, 2].map((c2) => row[0] * Il[0][c2] + row[1] * Il[1][c2] + row[2] * Il[2][c2]));
    const I = RI.map((row) => [0, 1, 2].map((c2) => row[0] * Rm[c2][0] + row[1] * Rm[c2][1] + row[2] * Rm[c2][2]));
    bodies.push({ joint, mass: li.mass, c: [c.x, c.y, c.z], I });
  });
  const payload = load.payloadKg ?? 0;
  if (payload > 0) {
    const last = frames[frames.length - 1];
    const t = new Vector3(0, 0, (load.tcpMm ?? 0) / 1000).applyMatrix4(last);
    bodies.push({ joint: JOINT_COUNT - 1, mass: payload, c: [t.x, t.y, t.z], I: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] });
  }
  return { p, z, bodies };
}

const mul3 = (I: number[][], v: V3): V3 => [dot(I[0], v), dot(I[1], v), dot(I[2], v)];

/**
 * Inverse dynamics: joint torques (N·m) for angles (°), speeds (°/s) and
 * accelerations (°/s²).
 */
export function inverseDynamics(
  chain: readonly ChainSegment[],
  qDeg: readonly number[],
  qdDegS: readonly number[],
  qddDegS2: readonly number[],
  load: Load = {},
): number[] {
  const s = armState(chain, qDeg, load);
  const qd = qdDegS.map((v) => v * DEG2RAD);
  const qdd = qddDegS2.map((v) => v * DEG2RAD);
  const n = JOINT_COUNT;
  // Forward: angular velocity / acceleration of each joint's body, linear acceleration of each joint origin.
  const w: V3[] = [];
  const al: V3[] = [];
  const a: V3[] = [];
  let wPrev: V3 = [0, 0, 0];
  let alPrev: V3 = [0, 0, 0];
  let aPrev: V3 = [0, 0, 0];
  let pPrev: V3 = s.p[0];
  for (let k = 0; k < n; k += 1) {
    const r = sub(s.p[k], pPrev);
    a[k] = add(add(aPrev, cross(alPrev, r)), cross(wPrev, cross(wPrev, r)));
    const spin = scale(s.z[k], qd[k] ?? 0);
    w[k] = add(wPrev, spin);
    al[k] = add(add(alPrev, scale(s.z[k], qdd[k] ?? 0)), cross(wPrev, spin));
    wPrev = w[k];
    alPrev = al[k];
    aPrev = a[k];
    pPrev = s.p[k];
  }
  const g: V3 = load.gravity === false ? [0, 0, 0] : [0, 0, -GRAVITY];
  // Each body's force and moment about its own centre of mass.
  const FN = s.bodies.map((b) => {
    const j = b.joint;
    const r = sub(b.c, s.p[j]);
    const ac = add(add(a[j], cross(al[j], r)), cross(w[j], cross(w[j], r)));
    const F = scale(sub(ac, g), b.mass);
    const N = add(mul3(b.I, al[j]), cross(w[j], mul3(b.I, w[j])));
    return { b, F, N };
  });
  return Array.from({ length: n }, (_, k) =>
    FN.reduce((tau, { b, F, N }) => (b.joint >= k ? tau + dot(s.z[k], add(cross(sub(b.c, s.p[k]), F), N)) : tau), 0),
  );
}

/** Torques that just hold the arm still against gravity, N·m. */
export function gravityTorques(chain: readonly ChainSegment[], qDeg: readonly number[], load: Load = {}): number[] {
  const zero = new Array<number>(JOINT_COUNT).fill(0);
  return inverseDynamics(chain, qDeg, zero, zero, load);
}

/** Mass (inertia) matrix M(q): column j = torques for a unit q̈_j with no gravity and no speed. Units N·m per rad/s². */
export function massMatrix(chain: readonly ChainSegment[], qDeg: readonly number[], load: Load = {}): number[][] {
  const zero = new Array<number>(JOINT_COUNT).fill(0);
  const cols = Array.from({ length: JOINT_COUNT }, (_, j) => {
    const e = zero.slice();
    e[j] = 1 / DEG2RAD; // 1 rad/s² in °/s²
    return inverseDynamics(chain, qDeg, zero, e, { ...load, gravity: false });
  });
  return Array.from({ length: JOINT_COUNT }, (_, r) => cols.map((c) => c[r]));
}

/** Potential energy of the arm (and payload), J — for checks: G(q) = ∂V/∂q. */
export function potentialEnergy(chain: readonly ChainSegment[], qDeg: readonly number[], load: Load = {}): number {
  return armState(chain, qDeg, load).bodies.reduce((v, b) => v + b.mass * GRAVITY * b.c[2], 0);
}

/** Arm stretched out level in front (the hardest pose to hold), for the torque limits. */
export const REACH_OUT_DEG = [0, -90, 0, 0, 0, 0];

/**
 * Per-joint torque limits, N·m: what holding the rated payload at full reach
 * needs, +20 %. J1 (vertical axis, no gravity load) and the wrist get at least
 * the J4 figure so a quick turn is not flagged at once.
 */
export function torqueLimits(chain: readonly ChainSegment[], tcpMm = 0): number[] {
  // Worst case over the two level-reach poses (forwards and backwards) per joint.
  const poses = [REACH_OUT_DEG, [0, 90, 0, 0, 0, 0]];
  const need = new Array<number>(JOINT_COUNT).fill(0);
  for (const q of poses) {
    gravityTorques(chain, q, { payloadKg: RATED_PAYLOAD_KG, tcpMm }).forEach((t, i) => {
      need[i] = Math.max(need[i], Math.abs(t));
    });
  }
  const floor = Math.max(need[3], 0.15);
  return need.map((t, i) => Math.max(i === 1 || i === 2 ? t : Math.max(t, floor), 0.05) * 1.2);
}

/** Tool point (payload position) in metres — used to place the payload ball on screen. */
export function payloadPoint(chain: readonly ChainSegment[], qDeg: readonly number[], tcpMm = 0): Vector3 {
  const frames = forwardKinematicsFrames(chain, qDeg);
  return new Vector3(0, 0, tcpMm / 1000).applyMatrix4(frames[frames.length - 1] ?? new Matrix4());
}
