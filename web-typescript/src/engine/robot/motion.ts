/**
 * Smooth, synchronised joint trajectories for the simulator.
 *
 * Every move uses the quintic ("minimum-jerk") time scaling
 *     s(τ) = 10τ³ − 15τ⁴ + 6τ⁵,   τ = t / T ∈ [0, 1]
 * which starts and ends with zero velocity AND zero acceleration. Linear or
 * ease-in-out interpolation jumps in acceleration at both ends; on screen that
 * reads as a jerk, and on a real servo arm it is what makes the tool wobble.
 *
 * All joints share one s(τ), so they start and stop together and the motion is
 * a straight line in joint space — the same kind of move `send_angles` makes.
 * For a straight line in space (lowering onto a block), `linearPath` solves IK
 * at small steps along the line and the trajectory follows those waypoints with
 * the same time scaling.
 */

import { Euler, Quaternion, Vector3 } from 'three';

import { RAD2DEG, URDF_EULER_ORDER, forwardKinematicsFrames, solveIk, type ChainSegment } from './kinematics';
import { STRAIGHT_DOWN, solveToolPose, type PointMm, type ToolOrientation } from './tool';

/** Quintic time scaling. Position, 0..1. */
export function quintic(tau: number): number {
  const t = Math.min(1, Math.max(0, tau));
  return t * t * t * (10 + t * (-15 + 6 * t));
}

/** Its derivative, ds/dτ. Peaks at 1.875 at τ = 0.5. */
export function quinticRate(tau: number): number {
  const t = Math.min(1, Math.max(0, tau));
  return 30 * t * t * (1 - t) * (1 - t);
}

export const QUINTIC_PEAK_RATE = 1.875;

/**
 * Speed setting (1..100, as pymycobot's `speed`) -> peak joint velocity, °/s.
 * 100 maps to 200 °/s, a little under the servos' rated no-load speed, so the
 * simulated timing is never faster than the real arm could manage.
 */
export function peakJointSpeedDegS(speed: number): number {
  return Math.min(100, Math.max(1, speed)) * 2;
}

/** Peak tool speed for straight-line moves, mm/s. 50 -> 100 mm/s. */
export function peakToolSpeedMmS(speed: number): number {
  return Math.min(100, Math.max(1, speed)) * 2;
}

export const MIN_MOVE_S = 0.3;

export interface Trajectory {
  durationS: number;
  /** Joint angles, degrees, at time t seconds (clamped to [0, durationS]). */
  sample(tS: number): number[];
  /** Final joint angles. */
  end: number[];
}

/** Duration so the joint travelling furthest peaks at the speed setting. */
export function jointMoveDuration(from: readonly number[], to: readonly number[], speed: number): number {
  const largest = Math.max(0, ...to.map((v, i) => Math.abs(v - from[i])));
  return Math.max(MIN_MOVE_S, (QUINTIC_PEAK_RATE * largest) / peakJointSpeedDegS(speed));
}

/** Synchronised joint-space move. */
export function jointTrajectory(from: readonly number[], to: readonly number[], speed: number): Trajectory {
  const a = from.slice();
  const b = to.slice();
  const durationS = jointMoveDuration(a, b, speed);
  return {
    durationS,
    end: b,
    sample(tS) {
      const s = quintic(tS / durationS);
      return a.map((v, i) => v + (b[i] - v) * s);
    },
  };
}

/**
 * Trajectory through a list of joint-space waypoints (e.g. from `linearPath`).
 * The path parameter is arc length in joint space, so equal steps in space map
 * to equal steps in time, and the whole path gets one quintic profile.
 */
export function waypointTrajectory(waypoints: readonly number[][], durationS: number): Trajectory {
  const pts = waypoints.map((w) => w.slice());
  const cumulative = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(...pts[i].map((v, j) => v - pts[i - 1][j]));
    cumulative.push(cumulative[i - 1] + d);
  }
  const total = cumulative[cumulative.length - 1];
  const end = pts[pts.length - 1];
  return {
    durationS,
    end,
    sample(tS) {
      if (pts.length === 1 || total < 1e-9) return end.slice();
      const at = quintic(tS / durationS) * total;
      let k = 1;
      while (k < pts.length - 1 && cumulative[k] < at) k += 1;
      const span = cumulative[k] - cumulative[k - 1];
      const f = span < 1e-12 ? 1 : (at - cumulative[k - 1]) / span;
      return pts[k - 1].map((v, j) => v + (pts[k][j] - v) * f);
    },
  };
}

export interface LinearPlan {
  ok: boolean;
  trajectory: Trajectory;
  /** Worst TCP position error along the path, millimetres. */
  worstErrorMm: number;
  /** Largest joint jump between neighbouring waypoints, degrees (a configuration flip shows up here). */
  largestStepDeg: number;
}

/** Waypoint spacing for straight-line moves. */
const LINEAR_STEP_MM = 4;
/** A neighbouring-waypoint jump above this means the arm flipped configuration mid-line. */
const MAX_WAYPOINT_JUMP_DEG = 25;

/**
 * Straight line of the TCP from its current position to `to`, the tool held
 * in one orientation all the way. IK is seeded from the previous waypoint so the arm stays in
 * one configuration; a jump between neighbours is reported as a failure rather
 * than animated as a sudden flip.
 */
export function linearPath(
  chain: readonly ChainSegment[],
  fromDeg: readonly number[],
  from: PointMm,
  to: PointMm,
  tcpMm: number,
  speed: number,
  orientation: ToolOrientation = STRAIGHT_DOWN,
): LinearPlan {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const steps = Math.max(1, Math.ceil(length / LINEAR_STEP_MM));
  const waypoints: number[][] = [fromDeg.slice()];
  let seed = fromDeg.slice();
  let worstErrorMm = 0;
  let largestStepDeg = 0;
  let ok = true;

  for (let k = 1; k <= steps; k += 1) {
    const f = k / steps;
    const p = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f };
    const r = solveToolPose(chain, p, seed, { tcpMm, orientation });
    if (!r.converged) ok = false;
    worstErrorMm = Math.max(worstErrorMm, r.positionErrorM * 1000);
    const jump = Math.max(...r.anglesDeg.map((v, i) => Math.abs(v - seed[i])));
    largestStepDeg = Math.max(largestStepDeg, jump);
    if (jump > MAX_WAYPOINT_JUMP_DEG) ok = false;
    waypoints.push(r.anglesDeg);
    seed = r.anglesDeg;
  }

  // Timing: whichever is slower — the tool at its speed limit along the line,
  // or the busiest joint at its speed limit.
  const toolS = (QUINTIC_PEAK_RATE * length) / peakToolSpeedMmS(speed);
  const jointS = jointMoveDuration(fromDeg, waypoints[waypoints.length - 1], speed);
  return {
    ok,
    trajectory: waypointTrajectory(waypoints, Math.max(MIN_MOVE_S, toolS, jointS)),
    worstErrorMm,
    largestStepDeg,
  };
}

/**
 * MOVE L between two saved poses (공정 짜기): the TCP goes in a straight line and the tool turns
 * evenly from the first pose's orientation to the second's (slerp), as a pendant's linear move
 * does. Same waypoint spacing, seeding and flip check as `linearPath`; the last waypoint is the
 * saved pose itself, so the arm ends exactly where it was taught.
 */
export function linearPosePath(chain: readonly ChainSegment[], fromDeg: readonly number[], toDeg: readonly number[], tcpMm: number, speed: number): LinearPlan {
  const pose = (deg: readonly number[]) => {
    const f = forwardKinematicsFrames(chain, deg).at(-1)!;
    const q = new Quaternion().setFromRotationMatrix(f);
    const tip = new Vector3(0, 0, tcpMm / 1000).applyMatrix4(f);
    return { q, tip };
  };
  const a = pose(fromDeg);
  const b = pose(toDeg);
  const length = a.tip.distanceTo(b.tip) * 1000;
  const turnDeg = a.q.angleTo(b.q) * RAD2DEG;
  // A pure turn on the spot still gets waypoints (about one per 2°), or IK could swing the arm.
  const steps = Math.max(1, Math.ceil(length / LINEAR_STEP_MM), Math.ceil(turnDeg / 2));
  const waypoints: number[][] = [fromDeg.slice()];
  let seed = fromDeg.slice();
  let worstErrorMm = 0;
  let largestStepDeg = 0;
  let ok = true;
  const q = new Quaternion();
  for (let k = 1; k <= steps; k += 1) {
    const f = k / steps;
    q.slerpQuaternions(a.q, b.q, f);
    const tip = a.tip.clone().lerp(b.tip, f);
    const axis = new Vector3(0, 0, 1).applyQuaternion(q);
    const flange = tip.addScaledVector(axis, -tcpMm / 1000);
    const e = new Euler().setFromQuaternion(q, URDF_EULER_ORDER);
    const r =
      k === steps
        ? null
        : solveIk(chain, flange, seed, {
            matchOrientation: true,
            targetRpyDeg: [e.x * RAD2DEG, e.y * RAD2DEG, e.z * RAD2DEG],
            positionToleranceM: 0.0005,
            orientationToleranceRad: 0.01,
            restarts: 0,
          });
    if (r && !r.converged) ok = false;
    if (r) worstErrorMm = Math.max(worstErrorMm, r.positionErrorM * 1000);
    const next = r ? r.anglesDeg : toDeg.slice();
    const jump = Math.max(...next.map((v, i) => Math.abs(v - seed[i])));
    largestStepDeg = Math.max(largestStepDeg, jump);
    if (jump > MAX_WAYPOINT_JUMP_DEG) ok = false;
    waypoints.push(next);
    seed = next;
  }
  const toolS = (QUINTIC_PEAK_RATE * length) / peakToolSpeedMmS(speed);
  const jointS = jointMoveDuration(fromDeg, toDeg, speed);
  return { ok, trajectory: waypointTrajectory(waypoints, Math.max(MIN_MOVE_S, toolS, jointS)), worstErrorMm, largestStepDeg };
}

/** TCP position (mm) for joint angles, tool pointing along the flange axis. */
export function tcpPositionMm(chain: readonly ChainSegment[], anglesDeg: readonly number[], tcpMm: number): PointMm {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const flange = frames[frames.length - 1];
  const p = new Vector3(0, 0, tcpMm / 1000).applyMatrix4(flange);
  return { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000 };
}
