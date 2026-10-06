/**
 * Tool-pose IK for work on the kit: put the tool tip on a point with the tool
 * pointing (almost) straight down — the pose every pick, drop, press and pen
 * stroke uses.
 *
 * The student (or the vision step) gives a point in millimetres in the robot
 * base frame, the frame pymycobot's `send_coords` uses. The attached tool's
 * working point (TCP) is `tcpMm` out along the flange axis, so the flange sits
 * that far back along the tool axis.
 *
 * Orientation search, in order:
 *   1. straight down, flange x radial, then turned 90° / -90° / 180° about the
 *      vertical (blocks are cubes and the suction cup is round, so any of these
 *      picks the same way; which one works depends on the wrist near the base);
 *   2. leaning outward by 5°–20°, then inward by 5°–15°. The official AI Kit
 *      program does the same: its drop pose for bin C leans the tool ~10°
 *      (AiKit_UI: rx -169.69), its picks ~4°.
 * The first orientation that solves wins, so the simplest pose is always used.
 */

import { Euler, Matrix4, Vector3 } from 'three';

import {
  DEG2RAD,
  RAD2DEG,
  URDF_EULER_ORDER,
  forwardKinematicsFrames,
  matrixToPose,
  solveIk,
  type ChainSegment,
  type IkResult,
} from './kinematics';

/** A point on or above the board, millimetres, robot base frame. */
export interface PointMm {
  x: number;
  y: number;
  z: number;
}

/** How the tool is held: turn about the vertical, and lean away from vertical (+ = outward). */
export interface ToolOrientation {
  yawDeg: number;
  tiltDeg: number;
}

export const STRAIGHT_DOWN: ToolOrientation = { yawDeg: 0, tiltDeg: 0 };

const SEARCH: ToolOrientation[] = [
  ...[0, 90, -90, 180].map((yawDeg) => ({ yawDeg, tiltDeg: 0 })),
  ...[5, 10, 15, 20, -5, -10, -15].flatMap((tiltDeg) => [0, 90].map((yawDeg) => ({ yawDeg, tiltDeg }))),
];

/** Flange rotation for a tool held with orientation `o` above (x, y). */
export function toolRotation(xMm: number, yMm: number, o: ToolOrientation): Matrix4 {
  const heading = Math.atan2(yMm, xMm);
  const t = o.tiltDeg * DEG2RAD;
  const radial = new Vector3(Math.cos(heading), Math.sin(heading), 0);
  // Tool axis: down, leaning `t` towards +radial.
  const az = new Vector3(0, 0, -Math.cos(t)).addScaledVector(radial, Math.sin(t));
  // Flange x: radial (tilted with the tool), then turned about the tool axis by yaw.
  const x0 = new Vector3().copy(radial).multiplyScalar(Math.cos(t)).add(new Vector3(0, 0, Math.sin(t)));
  const y0 = new Vector3().crossVectors(az, x0);
  const yaw = o.yawDeg * DEG2RAD;
  const ax = x0.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(y0, Math.sin(yaw));
  const ay = new Vector3().crossVectors(az, ax);
  return new Matrix4().makeBasis(ax.normalize(), ay.normalize(), az.normalize());
}

/** URDF-style roll/pitch/yaw (degrees) for toolRotation. */
export function toolRpyDeg(xMm: number, yMm: number, o: ToolOrientation = STRAIGHT_DOWN): [number, number, number] {
  const e = new Euler().setFromRotationMatrix(toolRotation(xMm, yMm, o), URDF_EULER_ORDER);
  return [e.x * RAD2DEG, e.y * RAD2DEG, e.z * RAD2DEG];
}

/** Kept for callers that only ever want straight down. */
export function toolDownRpyDeg(xMm: number, yMm: number, extraYawDeg = 0): [number, number, number] {
  return toolRpyDeg(xMm, yMm, { yawDeg: extraYawDeg, tiltDeg: 0 });
}

/** Flange target (metres) for a TCP at `point`. */
export function flangeTargetFor(point: PointMm, tcpMm: number, o: ToolOrientation = STRAIGHT_DOWN): Vector3 {
  const r = toolRotation(point.x, point.y, o).elements;
  const axis = new Vector3(r[8], r[9], r[10]);
  return new Vector3(point.x, point.y, point.z).addScaledVector(axis, -tcpMm).multiplyScalar(0.001);
}

export interface ToolOptions {
  /** Tool length from flange face to TCP along the flange axis, millimetres. */
  tcpMm: number;
  /** Use exactly this orientation instead of searching. */
  orientation?: ToolOrientation;
  /** Position tolerance, millimetres. Default 0.5 mm (the robot's ±0.5 mm repeatability). */
  toleranceMm?: number;
}

export type ToolIkResult = IkResult & { orientation: ToolOrientation };

function solveOne(
  chain: readonly ChainSegment[],
  point: PointMm,
  seedDeg: readonly number[],
  tcpMm: number,
  o: ToolOrientation,
  tolMm: number,
  restarts: number,
): IkResult {
  return solveIk(chain, flangeTargetFor(point, tcpMm, o), seedDeg, {
    matchOrientation: true,
    targetRpyDeg: toolRpyDeg(point.x, point.y, o),
    positionToleranceM: tolMm / 1000,
    orientationToleranceRad: 0.5 * DEG2RAD,
    maxIterations: 200,
    restarts,
  });
}

/**
 * The arm configurations the official AI Kit program uses (AiKit_UI main.py:
 * observation, grab and the four bin drops for the 280). Seeding from these
 * keeps solutions in the same natural "elbow up, wrist down" family as the
 * real kit, instead of a random restart finding the arm folded back over itself.
 */
export const NATURAL_SEEDS: readonly number[][] = [
  [18.8, -7.91, -54.49, -23.02, -0.79, -14.76],
  [0.61, 45.87, -92.37, -41.3, 2.02, 9.58],
  [-24.87, -2.98, -92.46, 5.88, -3.07, -8.34],
  [-13.71, -52.11, -25.4, -4.57, -3.86, -7.73],
  [74.0, -18.1, -64.24, -9.84, -0.79, -9.49],
  [112.93, 3.16, -96.32, 0.87, 0.26, -9.75],
];

/**
 * Joint angles that put the TCP at `point`, tool (almost) vertical — see the
 * orientation order above. Seeds, in order: the current pose (so a small move
 * stays a small move), the official kit poses, and only then random restarts.
 */
export function solveToolPose(chain: readonly ChainSegment[], point: PointMm, seedDeg: readonly number[], options: ToolOptions): ToolIkResult {
  const tol = options.toleranceMm ?? 0.5;
  const tries = options.orientation ? [options.orientation] : SEARCH;
  let first: ToolIkResult | null = null;
  for (const seeds of [[seedDeg], NATURAL_SEEDS]) {
    for (const o of tries) {
      for (const seed of seeds) {
        const r = solveOne(chain, point, seed, options.tcpMm, o, tol, 0);
        if (r.converged) return { ...r, orientation: o };
        first ??= { ...r, orientation: o };
      }
    }
  }
  for (const o of tries) {
    const r = solveOne(chain, point, seedDeg, options.tcpMm, o, tol, 8);
    if (r.converged) return { ...r, orientation: o };
  }
  return first as ToolIkResult;
}

/** Compatibility name: same search. */
export const solveToolDown = solveToolPose;

/** The orientation the tool currently has, if it is one of the search orientations (within 2°). */
export function currentOrientation(chain: readonly ChainSegment[], anglesDeg: readonly number[], tcpMm: number): ToolOrientation | null {
  const f = forwardKinematicsFrames(chain, anglesDeg).at(-1)!;
  const p = new Vector3(0, 0, tcpMm / 1000).applyMatrix4(f).multiplyScalar(1000);
  const e = f.elements;
  for (const o of SEARCH) {
    const r = toolRotation(p.x, p.y, o).elements;
    const dot = e[0] * r[0] + e[1] * r[1] + e[2] * r[2] + e[4] * r[4] + e[5] * r[5] + e[6] * r[6] + e[8] * r[8] + e[9] * r[9] + e[10] * r[10];
    const angle = Math.acos(Math.min(1, Math.max(-1, (dot - 1) / 2)));
    if (angle < 2 * DEG2RAD) return o;
  }
  return null;
}

/**
 * Joint angles that move the tool tip `deltaMm` in a straight line with the tool
 * held exactly as it is now, whatever way it points — what the robot's own
 * coordinate jog does. The orientation does not change, so the flange moves by
 * the same vector as the tip and the tool length does not matter. The line is
 * walked in steps of at most 5 mm, each seeded from the one before, so the solve
 * follows the arm along the line instead of jumping to another arm shape.
 * The tolerance must stay well under the step: a jog frame moves ~0.5 mm, and a
 * looser solve would call the start pose "close enough" and never move.
 */
export function shiftTool(chain: readonly ChainSegment[], anglesDeg: readonly number[], deltaMm: PointMm, toleranceMm = 0.05): IkResult {
  const pose = matrixToPose(forwardKinematicsFrames(chain, anglesDeg).at(-1)!);
  const delta = new Vector3(deltaMm.x, deltaMm.y, deltaMm.z).multiplyScalar(0.001);
  const steps = Math.max(1, Math.ceil(delta.length() / 0.005));
  let seed: readonly number[] = anglesDeg;
  let r: IkResult | null = null;
  for (let k = 1; k <= steps; k++) {
    r = solveIk(chain, pose.position.clone().addScaledVector(delta, k / steps), seed, {
      matchOrientation: true,
      targetRpyDeg: [pose.rpyDeg.x, pose.rpyDeg.y, pose.rpyDeg.z],
      positionToleranceM: toleranceMm / 1000,
      orientationToleranceRad: 0.5 * DEG2RAD,
      // Light damping: the target is a few millimetres away, so fast convergence matters more than robustness far off.
      damping: 0.01,
      maxIterations: 100,
      restarts: 0,
    });
    if (!r.converged) return r;
    seed = r.anglesDeg;
  }
  return r!;
}
