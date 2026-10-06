/**
 * 색 따라가기 (src/engine/vision/track.ts) in a closed loop, headless.
 *
 * A pinhole hand camera on the RDK X5's flange (the console's mount) looks
 * down at a red block; its pictures are drawn here from the camera pose. The
 * check runs what the console does — probe x and y, then step towards the
 * centre with the arm moved by shiftTool — and asserts the block ends up in
 * the middle of the picture, for the camera turned any way on the flange
 * (the real module's turn is not known for sure) and for a block that moves.
 *
 * Run with: npm run check:track
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { Matrix4, Vector3 } from 'three';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { shiftTool, solveToolPose, STRAIGHT_DOWN } = await import('../../src/engine/robot/tool');
const { flangeMatrixMm } = await import('../../src/engine/simulator/sim');
const { HAND_CAMERA, verticalFov } = await import('../../src/engine/simulator/board');
const { HAND_CAMERA_MOUNT } = await import('../../src/engine/simulator/effectors');
const { planeToPixel } = await import('../../src/engine/vision/color');
const { Divergence, STEP_DEFAULTS, findColor, offCentre, probeJacobian, stepTowards } = await import('../../src/engine/vision/track');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));
const W = 320;
const H = 240;
const BLOCK = 30;

/** The hand camera's pose for these joint angles, the module turned `turnDeg` about its own axis. */
function pinhole(angles: readonly number[], turnDeg: number) {
  const cam = flangeMatrixMm(chain, angles)
    .multiply(new Matrix4().makeTranslation(HAND_CAMERA_MOUNT.x, HAND_CAMERA_MOUNT.y, HAND_CAMERA_MOUNT.z))
    .multiply(new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1)))
    .multiply(new Matrix4().makeRotationZ((turnDeg * Math.PI) / 180));
  return { cameraToWorld: cam, fovDeg: verticalFov(HAND_CAMERA.hfovDeg, HAND_CAMERA.width, HAND_CAMERA.height), width: W, height: H };
}

/** A grey table with one red block (its top face) at (x, y). */
function picture(angles: readonly number[], turnDeg: number, block: { x: number; y: number }) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([150, 150, 145, 255], i * 4);
  const cam = pinhole(angles, turnDeg);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => planeToPixel(cam, { x: block.x + (sx * BLOCK) / 2, y: block.y + (sy * BLOCK) / 2, z: BLOCK }));
  if (corners.every(Boolean)) {
    const pts = corners as { u: number; v: number }[];
    // Fill the quadrilateral (convex): a pixel is inside when it is on the same side of all four edges.
    for (let v = 0; v < H; v++) {
      for (let u = 0; u < W; u++) {
        let pos = 0;
        let neg = 0;
        for (let k = 0; k < 4; k++) {
          const a = pts[k];
          const b = pts[(k + 1) % 4];
          const c = (b.u - a.u) * (v - a.v) - (b.v - a.v) * (u - a.u);
          if (c > 0) pos++;
          else if (c < 0) neg++;
        }
        if (pos === 0 || neg === 0) data.set([215, 35, 30, 255], (v * W + u) * 4);
      }
    }
  }
  return { data, width: W, height: H };
}

/** Looking straight down from 200 mm above the table, over (x, y). */
function lookDown(x: number, y: number): number[] {
  const r = solveToolPose(chain, { x, y, z: 200 }, [0, 0, -90, 0, 0, 0], { tcpMm: 0, orientation: STRAIGHT_DOWN });
  assert.ok(r.converged, `observation pose over (${x}, ${y})`);
  return r.anglesDeg;
}

function move(angles: number[], d: { x: number; y: number }): number[] {
  const r = shiftTool(chain, angles, { x: d.x, y: d.y, z: 0 }, 0.1);
  assert.ok(r.converged, `tool move (${d.x.toFixed(1)}, ${d.y.toFixed(1)})`);
  return r.anglesDeg;
}

/** The console's sequence: probe x, probe y, then follow. Returns the distance from centre per step. */
function follow(turnDeg: number, blockAt: (step: number) => { x: number; y: number }, steps = 40) {
  let a = lookDown(150, -20);
  const see = (k: number) => findColor(picture(a, turnDeg, blockAt(k)), '빨강');
  const s0 = see(0);
  assert.ok(s0, 'block in view at the start');
  const PROBE = 20;
  a = move(a, { x: PROBE, y: 0 });
  const sx = see(0)!;
  a = move(a, { x: -PROBE, y: 0 });
  const s1 = see(0)!;
  a = move(a, { x: 0, y: PROBE });
  const sy = see(0)!;
  a = move(a, { x: 0, y: -PROBE });
  const s2 = see(0)!;
  const base = { ...s0, u: (s0.u + s1.u + s2.u) / 3, v: (s0.v + s1.v + s2.v) / 3 };
  const j = probeJacobian(base, sx, sy, PROBE, PROBE);
  assert.ok(j, `probe directions (camera turned ${turnDeg}°)`);
  const div = new Divergence();
  const offs: number[] = [];
  for (let k = 0; k < steps; k++) {
    const s = see(k);
    assert.ok(s, `block lost at step ${k} (camera turned ${turnDeg}°)`);
    offs.push(offCentre(s));
    const d = stepTowards(j, s);
    assert.ok(!div.feed(offCentre(s), !!d), `following diverged (camera turned ${turnDeg}°)`);
    if (d) a = move(a, d);
  }
  return offs;
}

// 1. A still block, the camera module turned every way on the flange: it ends up centred.
for (const turn of [0, 45, 90, 135, 180, 270]) {
  const offs = follow(turn, () => ({ x: 185, y: 15 }));
  const end = offs.at(-1)!;
  console.log(`  camera turned ${String(turn).padStart(3)}°: ${offs[0].toFixed(0)} px off → ${end.toFixed(1)} px after ${offs.length} steps`);
  assert.ok(offs[0] > 60, 'starts clearly off centre');
  assert.ok(end < STEP_DEFAULTS.deadbandPx + 4, `centred (camera turned ${turn}°)`);
}

// 2. A block slid slowly across the table (2 mm per step) stays near the centre.
const moving = follow(135, (k) => ({ x: 175 + Math.min(k, 30) * 2, y: 10 - Math.min(k, 30) * 1.5 }), 45);
const worst = Math.max(...moving.slice(15));
console.log(`  moving block: worst ${worst.toFixed(0)} px off after settling, last ${moving.at(-1)!.toFixed(1)} px`);
assert.ok(worst < 60, 'keeps up with a slowly moving block');

// 3. A probe that saw no motion (the colour moved with the arm, or no camera) is refused.
const still = { u: 160, v: 120, area: 900, width: W, height: H };
assert.equal(probeJacobian(still, still, still, 20, 20), null, 'no picture motion: no directions');
assert.equal(probeJacobian(still, { ...still, u: 200 }, { ...still, u: 240 }, 20, 20), null, 'both moves the same way: no directions');

// 4. Wrong directions (as if the colour moved during the probe) are caught.
const div = new Divergence();
let off = 70;
let gaveUp = false;
for (let k = 0; k < 10 && !gaveUp; k++) gaveUp = div.feed((off *= 1.3), true);
assert.ok(gaveUp, 'growing error stops the following');

console.log('track-check: all checks passed');
