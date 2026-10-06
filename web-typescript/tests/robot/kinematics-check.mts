/**
 * Numerical validation of the URDF parser, forward kinematics and IK solver.
 *
 * Runs headlessly against the exact URDF that ships in public/, using jsdom for
 * DOMParser. Checks the analytic Jacobian against finite differences (the single
 * most likely place for a sign or frame error to hide), then measures IK
 * convergence over 100 pseudo-random targets.
 *
 * Run with: npm run check:kinematics
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { Matrix4, Vector3 } from 'three';

const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;

const { parseUrdf, meshNodeName } = await import('../../src/engine/robot/urdf');
const {
  buildChain,
  forwardKinematics,
  forwardKinematicsFrames,
  originToMatrix,
  solveIk,
  DEG2RAD,
} = await import('../../src/engine/robot/kinematics');
const { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN, JOINT_COUNT, REACH_MM, FLANGE_REACH_MM, SHOULDER_HEIGHT_M } =
  await import('../../src/engine/robot/limits');

const urdfText = readFileSync('public/robot/mycobot280/mycobot_280_m5.urdf', 'utf8');
const robot = parseUrdf(urdfText);
const chain = buildChain(robot);

/* --- 1. Structure ---------------------------------------------------------- */
console.log(`  robot "${robot.name}", root link "${robot.rootLink}"`);
console.log(`  links ${robot.links.size}, joints ${robot.joints.length}, movable ${robot.movableJoints.length}`);
assert.equal(robot.movableJoints.length, JOINT_COUNT, 'expected exactly 6 movable joints');
assert.equal(robot.rootLink, 'g_base', 'root link should be g_base');

const meshes = Array.from(robot.links.values())
  .filter((l) => l.visual)
  .map((l) => meshNodeName(l.visual!.meshFilename));
console.log(`  mesh nodes: ${meshes.join(', ')}`);
assert.ok(meshes.includes('G_base') && meshes.includes('joint6'), 'expected the merged GLB node names');
console.log('  ok   URDF structure');

/* --- 2. URDF joint limits vs the adopted limits ---------------------------- */
console.log('\n  joint            URDF limit (deg)      adopted (deg)');
robot.movableJoints.forEach((j, i) => {
  const lo = j.limit ? (j.limit.lower * 180) / Math.PI : NaN;
  const hi = j.limit ? (j.limit.upper * 180) / Math.PI : NaN;
  const flag = lo < JOINT_ANGLE_MIN[i] - 0.5 || hi > JOINT_ANGLE_MAX[i] + 0.5 ? ' (adopted is tighter)' : '';
  console.log(
    `  J${i + 1} ${j.name.padEnd(22)} ${lo.toFixed(1).padStart(7)}..${hi.toFixed(1).padStart(6)}   ` +
      `${String(JOINT_ANGLE_MIN[i]).padStart(5)}..${String(JOINT_ANGLE_MAX[i]).padStart(4)}${flag}`,
  );
});

/* --- 3. FK sanity ---------------------------------------------------------- */
const home = forwardKinematics(chain, [0, 0, 0, 0, 0, 0]);
const homeMm = home.position.clone().multiplyScalar(1000);
console.log(
  `\n  FK at zero pose: x=${homeMm.x.toFixed(1)} y=${homeMm.y.toFixed(1)} z=${homeMm.z.toFixed(1)} mm` +
    `  rpy=${home.rpyDeg.toArray().map((v) => v.toFixed(1)).join(', ')}`,
);
const homeReach = homeMm.length();
assert.ok(homeReach > 50 && homeReach < 500, `zero-pose reach ${homeReach.toFixed(1)}mm is implausible`);
// At all-zero angles the real myCobot 280 stands straight up. Composing the URDF
// rpy in the wrong order (Rx·Ry·Rz instead of Rz·Ry·Rx) lays the arm flat
// instead (flange ~140 mm high) while every other check here still passes.
assert.ok(homeMm.z > 400, `zero pose should stand upright, flange is only ${homeMm.z.toFixed(1)}mm high`);
{
  const rpy = { x: 0.3, y: 0.5, z: 0.7 };
  const m = originToMatrix({ ...robot.joints[0], origin: { xyz: { x: 0, y: 0, z: 0 }, rpy } });
  const expected = new Matrix4()
    .makeRotationZ(rpy.z)
    .multiply(new Matrix4().makeRotationY(rpy.y))
    .multiply(new Matrix4().makeRotationX(rpy.x));
  const diff = Math.max(...m.elements.map((v, i) => Math.abs(v - expected.elements[i])));
  assert.ok(diff < 1e-9, 'URDF rpy must compose as Rz(yaw)·Ry(pitch)·Rx(roll)');
}

// Reach is quoted from the shoulder (the J1 axis origin), not the base plate.
const shoulder = new Vector3(0, 0, SHOULDER_HEIGHT_M);
let maxFlangeMm = 0;
const rng = mulberry32(0xc0ffee);
for (let i = 0; i < 20000; i += 1) {
  const p = forwardKinematics(chain, randomPose(rng)).position.distanceTo(shoulder) * 1000;
  if (p > maxFlangeMm) maxFlangeMm = p;
}
console.log(
  `  max flange reach from shoulder over 20000 random poses: ${maxFlangeMm.toFixed(1)} mm ` +
    `(constant says ${FLANGE_REACH_MM}, datasheet quotes ${REACH_MM} to the wrist centre)`,
);
assert.ok(
  Math.abs(maxFlangeMm - FLANGE_REACH_MM) < 2,
  `measured flange reach ${maxFlangeMm.toFixed(1)}mm disagrees with FLANGE_REACH_MM`,
);
console.log('  ok   forward kinematics');

/* --- 4. Analytic Jacobian vs finite differences ---------------------------- */
// This is the load-bearing check: a wrong axis frame or a transposed rotation
// still yields plausible-looking FK, but breaks the Jacobian immediately.
{
  const q = [15, -30, 40, -20, 25, 60];
  const h = 1e-6;
  const base = tipOf(q);

  let worst = 0;
  for (let j = 0; j < JOINT_COUNT; j += 1) {
    const qp = q.slice();
    qp[j] += (h * 180) / Math.PI; // perturb by h radians, expressed in degrees
    const moved = tipOf(qp).sub(base).divideScalar(h);
    const analytic = jacobianColumn(q, j);
    const err = moved.distanceTo(analytic) / Math.max(1e-6, analytic.length());
    worst = Math.max(worst, err);
  }
  console.log(`  worst relative Jacobian error vs finite differences: ${(worst * 100).toFixed(4)}%`);
  assert.ok(worst < 1e-3, `analytic Jacobian disagrees with finite differences (${worst})`);
  console.log('  ok   Jacobian');
}

/* --- 5. IK convergence over 100 targets ------------------------------------ */
{
  const trials = 100;
  const rngIk = mulberry32(0x5eed);
  let converged = 0;
  let iterationsTotal = 0;
  let worstErrorMm = 0;
  let limitHits = 0;
  const startedAt = process.hrtime.bigint();

  for (let t = 0; t < trials; t += 1) {
    // Targets are drawn as FK of a random legal pose, so every one is provably
    // reachable within the adopted joint limits — this measures the solver, not
    // the workspace.
    const truth = randomPose(rngIk);
    const target = forwardKinematics(chain, truth).position;
    const seed = randomPose(rngIk);

    const result = solveIk(chain, target, seed);
    iterationsTotal += result.iterations;
    if (result.converged) converged += 1;
    else worstErrorMm = Math.max(worstErrorMm, result.positionErrorM * 1000);
    if (result.limitedJoints.length > 0) limitHits += 1;
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  console.log(`\n  IK over ${trials} reachable targets (position only, 1 mm tolerance):`);
  console.log(`    converged            ${converged}/${trials}  (${((converged / trials) * 100).toFixed(0)}%)`);
  console.log(`    mean iterations      ${(iterationsTotal / trials).toFixed(1)}`);
  console.log(`    mean solve time      ${(elapsedMs / trials).toFixed(2)} ms`);
  console.log(`    ended on a limit     ${limitHits}/${trials}`);
  if (converged < trials) console.log(`    worst miss           ${worstErrorMm.toFixed(2)} mm`);
  assert.ok(converged / trials >= 0.9, `IK convergence ${converged}/${trials} is below 90%`);
  console.log('  ok   inverse kinematics');
}

/* --- 6. Unreachable targets must be reported, not faked -------------------- */
{
  const far = new Vector3(1.5, 0, 0.5); // 1.5 m out; the arm reaches 0.28 m
  const result = solveIk(chain, far, [0, 0, 0, 0, 0, 0]);
  assert.equal(result.converged, false, 'an out-of-reach target must not report convergence');
  assert.ok(
    result.anglesDeg.every((a, i) => a >= JOINT_ANGLE_MIN[i] - 1e-6 && a <= JOINT_ANGLE_MAX[i] + 1e-6),
    'a failed solve must still return joint angles inside the limits',
  );
  console.log(`\n  ok   unreachable target reported as not converged (miss ${(result.positionErrorM * 1000).toFixed(0)} mm)`);
}

console.log('\nKinematics validated against the shipped URDF.');

/* --- helpers --------------------------------------------------------------- */

function tipOf(anglesDeg: number[]): Vector3 {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  return new Vector3().setFromMatrixPosition(frames[frames.length - 1] as Matrix4);
}

/** Linear velocity column of the Jacobian, recomputed here independently. */
function jacobianColumn(anglesDeg: number[], movableIndex: number): Vector3 {
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const tip = new Vector3().setFromMatrixPosition(frames[frames.length - 1] as Matrix4);
  const idx = chain.findIndex((s) => s.movableIndex === movableIndex);
  const frame = frames[idx];
  const axis = chain[idx].axis.clone().transformDirection(frame).normalize();
  const pos = new Vector3().setFromMatrixPosition(frame);
  return new Vector3().crossVectors(axis, new Vector3().subVectors(tip, pos));
}

function randomPose(rng: () => number): number[] {
  return Array.from({ length: JOINT_COUNT }, (_, i) =>
    JOINT_ANGLE_MIN[i] + rng() * (JOINT_ANGLE_MAX[i] - JOINT_ANGLE_MIN[i]),
  );
}

/** Deterministic PRNG so the reported numbers are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

void DEG2RAD;
