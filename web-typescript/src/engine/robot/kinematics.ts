/**
 * Forward and inverse kinematics for the myCobot 280, driven entirely by the
 * URDF's own joint origins.
 *
 * No DH parameters. The URDF already states, for every joint, the fixed
 * transform from parent link to joint frame (`<origin xyz rpy>`) and the axis it
 * rotates about (`<axis xyz>`); re-deriving a DH table from that is a lossy
 * round trip that introduces a second set of numbers to keep in sync. So the
 * chain here is built directly from the parsed URDF, and any future URDF
 * revision flows through without touching this file.
 *
 * Checked on the real myCobot 280 RDK X5 (docs/reports/console/08-robot-check.md):
 * FK of this URDF lands 0.2 mm from the robot's own get_coords at the same
 * joint angles, so coordinates shown in the simulator are the robot's own.
 * (The official 280 DH table, base 131.22 mm, is 8.2 mm off on this model.)
 *
 * IK is numerical (damped least squares on the full 6-DOF Jacobian), not
 * analytic: the myCobot 280's wrist axes do not intersect at a point, so it is
 * not a spherical wrist and the usual Pieper closed-form decomposition does not
 * apply. DLS also degrades gracefully near singularities, where a pseudo-inverse
 * would blow up.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

import {
  jointMax,
  jointMin,
  JOINT_COUNT,
  clampJointAngles,
} from './limits';
import type { UrdfJoint, UrdfRobot } from './urdf';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** End-effector pose: position in metres, orientation as roll/pitch/yaw in degrees. */
export interface Pose {
  position: Vector3;
  rpyDeg: Vector3;
}

/**
 * The fixed part of a joint transform, precomputed once from the URDF.
 * URDF rpy is fixed-axis roll-pitch-yaw: R = Rz(yaw)·Ry(pitch)·Rx(roll).
 * In three.js that matrix is Euler order 'ZYX' (three's order names the
 * matrix product left to right). 'XYZ' would give Rx·Ry·Rz, which differs
 * whenever two of the three angles are non-zero — as in this URDF's J3 and J6.
 */
export const URDF_EULER_ORDER = 'ZYX';
export interface ChainSegment {
  joint: UrdfJoint;
  /** Parent-link -> joint-frame transform, from <origin xyz rpy>. */
  originMatrix: Matrix4;
  axis: Vector3;
  /** Index into the 6-vector of joint angles, or -1 for a fixed joint. */
  movableIndex: number;
  /**
   * A joint that follows another (URDF <mimic>): its angle is `multiplier` × that joint's angle +
   * offset. The 4-axis arms keep their head level this way (parallelogram linkage).
   */
  mimic?: { index: number; multiplier: number; offsetDeg: number };
}

/** The angle this segment turns by, degrees: its own joint's, a mimicked one's, or null (fixed). */
export function segmentAngleDeg(segment: ChainSegment, anglesDeg: readonly number[]): number | null {
  if (segment.movableIndex >= 0) return anglesDeg[segment.movableIndex] ?? 0;
  if (segment.mimic) return segment.mimic.multiplier * (anglesDeg[segment.mimic.index] ?? 0) + segment.mimic.offsetDeg;
  return null;
}

export function originToMatrix(joint: UrdfJoint): Matrix4 {
  const { xyz, rpy } = joint.origin;
  return new Matrix4().compose(
    new Vector3(xyz.x, xyz.y, xyz.z),
    new Quaternion().setFromEuler(new Euler(rpy.x, rpy.y, rpy.z, URDF_EULER_ORDER)),
    new Vector3(1, 1, 1),
  );
}

/**
 * Flatten the URDF into the ordered list of transforms from the root link to the
 * tip, tagging which entries are driven by a joint angle.
 */
export function buildChain(robot: UrdfRobot): ChainSegment[] {
  const turns = (joint: UrdfRobot['joints'][number]) => joint.type === 'revolute' || joint.type === 'continuous' || joint.type === 'prismatic';
  // Joints of their own get the next index; a <mimic> joint follows the one it names.
  const index = new Map<string, number>();
  for (const joint of robot.joints) if (turns(joint) && !joint.mimic) index.set(joint.name, index.size);
  return robot.joints.map((joint) => {
    const followed = joint.mimic && turns(joint) ? index.get(joint.mimic.joint) : undefined;
    return {
      joint,
      originMatrix: originToMatrix(joint),
      axis: new Vector3(joint.axis.x, joint.axis.y, joint.axis.z).normalize(),
      movableIndex: index.get(joint.name) ?? -1,
      mimic: followed === undefined ? undefined : { index: followed, multiplier: joint.mimic!.multiplier, offsetDeg: joint.mimic!.offset * RAD2DEG },
    };
  });
}

/**
 * The same chain with the robot standing `mm` higher (on a base such as the
 * G base): its frames then come out in the frame of the surface the robot
 * stands over, so the table, the mat and the blocks stay where they are.
 */
export function liftChain(chain: readonly ChainSegment[], mm: number): ChainSegment[] {
  if (!mm || !chain.length) return chain.slice();
  const [first, ...rest] = chain;
  return [{ ...first, originMatrix: new Matrix4().makeTranslation(0, 0, mm / 1000).multiply(first.originMatrix) }, ...rest];
}

/**
 * Cumulative root-relative transform after each segment.
 * Returned in chain order; the last entry is the tip (flange) frame.
 */
export function forwardKinematicsFrames(
  chain: readonly ChainSegment[],
  anglesDeg: readonly number[],
): Matrix4[] {
  const frames: Matrix4[] = [];
  const current = new Matrix4().identity();
  const rotation = new Matrix4();

  for (const segment of chain) {
    current.multiply(segment.originMatrix);
    const deg = segmentAngleDeg(segment, anglesDeg);
    if (deg !== null) {
      rotation.makeRotationAxis(segment.axis, deg * DEG2RAD);
      current.multiply(rotation);
    }
    frames.push(current.clone());
  }
  return frames;
}

/** End-effector pose for a set of joint angles, in degrees. */
export function forwardKinematics(
  chain: readonly ChainSegment[],
  anglesDeg: readonly number[],
): Pose {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const tip = frames[frames.length - 1] ?? new Matrix4().identity();
  return matrixToPose(tip);
}

export function matrixToPose(matrix: Matrix4): Pose {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  const euler = new Euler().setFromQuaternion(quaternion, URDF_EULER_ORDER);
  return {
    position,
    rpyDeg: new Vector3(euler.x * RAD2DEG, euler.y * RAD2DEG, euler.z * RAD2DEG),
  };
}

/* -------------------------------------------------------------------------- */
/* Inverse kinematics — damped least squares                                  */
/* -------------------------------------------------------------------------- */

export interface IkOptions {
  /** Also match orientation, not just position. */
  matchOrientation?: boolean;
  /** Target orientation as roll/pitch/yaw in degrees. Used when matchOrientation. */
  targetRpyDeg?: readonly number[];
  maxIterations?: number;
  /** Metres. Position error at or below this counts as converged. */
  positionToleranceM?: number;
  /** Radians. Orientation error at or below this counts as converged. */
  orientationToleranceRad?: number;
  /**
   * Damping factor lambda in (JᵀJ + λ²I)⁻¹. Larger = more stable near
   * singularities, slower convergence in open space.
   */
  damping?: number;
  /** Cap on the per-iteration joint step, radians, to keep the solve stable. */
  maxStepRad?: number;
  /** Extra seeds to try when the first descent fails. */
  restarts?: number;
  /** Called after every iteration of every descent (the 교육 screen replays how the solver closes in). */
  onIteration?: (anglesDeg: readonly number[], positionErrorM: number, orientationErrorRad: number) => void;
}

export interface IkResult {
  anglesDeg: number[];
  converged: boolean;
  iterations: number;
  /** Final position error in metres. */
  positionErrorM: number;
  /** Final orientation error in radians (0 when orientation was not solved). */
  orientationErrorRad: number;
  /** True when a joint sits on its limit at the end of the solve. */
  limitedJoints: number[];
}

const DEFAULTS = {
  maxIterations: 200,
  positionToleranceM: 0.001,
  orientationToleranceRad: 0.02,
  damping: 0.08,
  maxStepRad: 0.25,
  restarts: 12,
};

/**
 * Numerical Jacobian column for a revolute joint: the instantaneous end-effector
 * twist produced by rotating that joint. For a revolute joint with world axis
 * `a` at world position `p`, acting on a tip at `t`:
 *     linear  = a x (t - p)
 *     angular = a
 * Derived from the FK frames directly, so it stays exact for whatever chain the
 * URDF describes.
 */
export function computeJacobian(
  chain: readonly ChainSegment[],
  anglesDeg: readonly number[],
): { jacobian: number[][]; tip: Matrix4 } {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const tip = frames[frames.length - 1] ?? new Matrix4().identity();
  const tipPos = new Vector3().setFromMatrixPosition(tip);

  // 6 rows (vx vy vz wx wy wz) x N movable columns.
  const jacobian: number[][] = Array.from({ length: 6 }, () => new Array(JOINT_COUNT).fill(0));

  chain.forEach((segment, i) => {
    // A mimic joint moves with the joint it follows: its column, scaled by the multiplier.
    const c = segment.movableIndex >= 0 ? segment.movableIndex : (segment.mimic?.index ?? -1);
    const k = segment.movableIndex >= 0 ? 1 : (segment.mimic?.multiplier ?? 0);
    if (c < 0 || c >= JOINT_COUNT) return;
    const frame = frames[i];
    const axisWorld = segment.axis.clone().transformDirection(frame).normalize();
    const jointPos = new Vector3().setFromMatrixPosition(frame);
    const lever = new Vector3().subVectors(tipPos, jointPos);
    const linear = new Vector3().crossVectors(axisWorld, lever);

    jacobian[0][c] += k * linear.x;
    jacobian[1][c] += k * linear.y;
    jacobian[2][c] += k * linear.z;
    jacobian[3][c] += k * axisWorld.x;
    jacobian[4][c] += k * axisWorld.y;
    jacobian[5][c] += k * axisWorld.z;
  });

  return { jacobian, tip };
}

/** Solve (A + λ²I) x = b for a small symmetric system, by Gaussian elimination. */
function solveDamped(a: number[][], b: number[], lambdaSq: number): number[] {
  const n = b.length;
  const m = a.map((row, i) => {
    const copy = row.slice();
    copy[i] += lambdaSq;
    copy.push(b[i]);
    return copy;
  });

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) continue; // singular column: leave at 0
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];

    const diag = m[col][col];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) m[r][c] -= factor * m[col][c];
    }
  }

  return Array.from({ length: n }, (_, i) =>
    Math.abs(m[i][i]) < 1e-12 ? 0 : m[i][n] / m[i][i],
  );
}

/** Orientation error as a rotation vector (axis * angle) taking `from` to `to`. */
function orientationError(from: Matrix4, to: Quaternion): Vector3 {
  const current = new Quaternion().setFromRotationMatrix(from);
  // Quaternions q and -q are the same rotation; pick the near one so the error
  // is the short way round rather than the long way.
  if (current.dot(to) < 0) current.set(-current.x, -current.y, -current.z, -current.w);
  const delta = to.clone().multiply(current.invert());
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, delta.w)));
  const sin = Math.sqrt(Math.max(0, 1 - delta.w * delta.w));
  if (sin < 1e-6 || angle < 1e-6) return new Vector3(0, 0, 0);
  const scale = (angle > Math.PI ? angle - 2 * Math.PI : angle) / sin;
  return new Vector3(delta.x * scale, delta.y * scale, delta.z * scale);
}

/**
 * One damped-least-squares descent from a single seed.
 *
 * Two details make the difference between ~66% and ~100% convergence on
 * reachable targets, both learned from measuring (see tests/robot/kinematics-check.mts):
 *
 *  1. ACTIVE-SET LOCKING. Plain clamping lets the solver keep pushing a joint
 *     into its limit: the step still asks for outward motion, clamping cancels
 *     it, and the remaining joints never get asked to compensate. Instead, a
 *     joint that sits on a limit while the step pushes further out is locked —
 *     its Jacobian column is zeroed and the step recomputed — so the redundancy
 *     in the other joints is actually used.
 *
 *  2. RESTARTS (in `solveIk`). DLS is a local method; on a 6R arm a bad seed
 *     lands in a local minimum that no amount of iterating escapes.
 */
function solveIkFromSeed(
  chain: readonly ChainSegment[],
  targetPosition: Vector3,
  seedAnglesDeg: readonly number[],
  targetQuat: Quaternion | null,
  opts: Required<Pick<IkOptions, 'maxIterations' | 'positionToleranceM' | 'orientationToleranceRad' | 'damping' | 'maxStepRad'>>,
  trace?: IkOptions['onIteration'],
): IkResult {
  const rows = targetQuat ? 6 : 3;
  const lambdaSq = opts.damping * opts.damping;

  let angles = clampJointAngles(seedAnglesDeg);
  let positionErrorM = Infinity;
  let orientationErrorRad = 0;
  let iterations = 0;

  for (; iterations < opts.maxIterations; iterations += 1) {
    const { jacobian, tip } = computeJacobian(chain, angles);
    const tipPos = new Vector3().setFromMatrixPosition(tip);

    const dp = new Vector3().subVectors(targetPosition, tipPos);
    positionErrorM = dp.length();

    let dr = new Vector3(0, 0, 0);
    if (targetQuat) {
      dr = orientationError(tip, targetQuat);
      orientationErrorRad = dr.length();
    }

    if (
      positionErrorM <= opts.positionToleranceM &&
      (!targetQuat || orientationErrorRad <= opts.orientationToleranceRad)
    ) {
      break;
    }

    const error = targetQuat ? [dp.x, dp.y, dp.z, dr.x, dr.y, dr.z] : [dp.x, dp.y, dp.z];

    const locked = new Array<boolean>(JOINT_COUNT).fill(false);
    let step = dampedStep(jacobian, error, rows, locked, lambdaSq);

    // Lock joints the step drives further past a limit, then re-solve so the
    // remaining joints take over. Converges in a couple of passes at most.
    for (let pass = 0; pass < JOINT_COUNT; pass += 1) {
      let changed = false;
      for (let j = 0; j < JOINT_COUNT; j += 1) {
        if (locked[j]) continue;
        const atUpper = angles[j] >= jointMax()[j] - 1e-9 && step[j] > 0;
        const atLower = angles[j] <= jointMin()[j] + 1e-9 && step[j] < 0;
        if (atUpper || atLower) {
          locked[j] = true;
          changed = true;
        }
      }
      if (!changed) break;
      if (locked.every(Boolean)) break;
      step = dampedStep(jacobian, error, rows, locked, lambdaSq);
    }

    // Cap the largest component so the step keeps its direction and only its
    // magnitude is limited.
    const largest = step.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    if (largest < 1e-12) {
      iterations += 1;
      break;
    }
    const scale = largest > opts.maxStepRad ? opts.maxStepRad / largest : 1;

    const next = clampJointAngles(angles.map((deg, i) => deg + step[i] * scale * RAD2DEG));
    const moved = next.some((v, i) => Math.abs(v - angles[i]) > 1e-9);
    angles = next;
    trace?.(angles, positionErrorM, orientationErrorRad);
    if (!moved) {
      iterations += 1;
      break;
    }
  }

  const limitedJoints: number[] = [];
  angles.forEach((deg, i) => {
    if (deg <= jointMin()[i] + 1e-6 || deg >= jointMax()[i] - 1e-6) limitedJoints.push(i);
  });

  return {
    anglesDeg: angles,
    converged:
      positionErrorM <= opts.positionToleranceM &&
      (!targetQuat || orientationErrorRad <= opts.orientationToleranceRad),
    iterations,
    positionErrorM,
    orientationErrorRad,
    limitedJoints,
  };
}

/** (JᵀJ + λ²I) dq = Jᵀ e, with locked joints removed from the system. */
function dampedStep(
  jacobian: readonly number[][],
  error: readonly number[],
  rows: number,
  locked: readonly boolean[],
  lambdaSq: number,
): number[] {
  const jtj: number[][] = Array.from({ length: JOINT_COUNT }, () => new Array(JOINT_COUNT).fill(0));
  const jte: number[] = new Array(JOINT_COUNT).fill(0);

  for (let c1 = 0; c1 < JOINT_COUNT; c1 += 1) {
    if (locked[c1]) continue;
    for (let r = 0; r < rows; r += 1) {
      jte[c1] += jacobian[r][c1] * error[r];
      for (let c2 = 0; c2 < JOINT_COUNT; c2 += 1) {
        if (locked[c2]) continue;
        jtj[c1][c2] += jacobian[r][c1] * jacobian[r][c2];
      }
    }
  }

  const step = solveDamped(jtj, jte, lambdaSq);
  return step.map((v, i) => (locked[i] ? 0 : v));
}

/**
 * Damped-least-squares IK with restarts.
 *
 * Joint angles are clamped to the adopted limits on every iteration, so the
 * returned pose is always commandable — a target only reachable outside a limit
 * reports `converged: false` rather than silently returning an illegal pose.
 *
 * The seed is tried first (so a small drag of the target keeps the current arm
 * configuration and the motion looks continuous), and only on failure does the
 * solver restart from other configurations. Restart seeds come from a PRNG keyed
 * on the target coordinates, so the same target always yields the same answer —
 * an IK that flickers between solutions frame to frame is unusable to look at.
 */
export function solveIk(
  chain: readonly ChainSegment[],
  targetPosition: Vector3,
  seedAnglesDeg: readonly number[],
  options: IkOptions = {},
): IkResult {
  const opts = {
    maxIterations: options.maxIterations ?? DEFAULTS.maxIterations,
    positionToleranceM: options.positionToleranceM ?? DEFAULTS.positionToleranceM,
    orientationToleranceRad: options.orientationToleranceRad ?? DEFAULTS.orientationToleranceRad,
    damping: options.damping ?? DEFAULTS.damping,
    maxStepRad: options.maxStepRad ?? DEFAULTS.maxStepRad,
  };
  const restarts = options.restarts ?? DEFAULTS.restarts;

  const targetQuat =
    options.matchOrientation && options.targetRpyDeg
      ? new Quaternion().setFromEuler(
          new Euler(
            options.targetRpyDeg[0] * DEG2RAD,
            options.targetRpyDeg[1] * DEG2RAD,
            options.targetRpyDeg[2] * DEG2RAD,
            URDF_EULER_ORDER,
          ),
        )
      : null;

  const trace = options.onIteration;
  let best = solveIkFromSeed(chain, targetPosition, seedAnglesDeg, targetQuat, opts, trace);
  let totalIterations = best.iterations;
  if (best.converged) return best;

  const rng = seededRng(targetPosition);
  for (let attempt = 0; attempt < restarts; attempt += 1) {
    const seed = Array.from(
      { length: JOINT_COUNT },
      (_, i) => jointMin()[i] + rng() * (jointMax()[i] - jointMin()[i]),
    );
    const candidate = solveIkFromSeed(chain, targetPosition, seed, targetQuat, opts, trace);
    totalIterations += candidate.iterations;
    if (candidate.converged) return { ...candidate, iterations: totalIterations };
    if (candidate.positionErrorM < best.positionErrorM) best = candidate;
  }

  return { ...best, iterations: totalIterations };
}

/** Deterministic PRNG keyed on a position, so one target always gives one answer. */
function seededRng(p: Vector3): () => number {
  let a =
    (Math.imul(Math.round(p.x * 1e5), 0x9e3779b1) ^
      Math.imul(Math.round(p.y * 1e5), 0x85ebca6b) ^
      Math.imul(Math.round(p.z * 1e5), 0xc2b2ae35)) >>>
    0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
