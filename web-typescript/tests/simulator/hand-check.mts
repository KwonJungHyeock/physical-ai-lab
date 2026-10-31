/**
 * 손 따라하기 (src/engine/vision/hand.ts): a hand's landmarks map onto the tool the way the
 * coordinate jog's keys read (오른쪽 Y−, 위 Z+, 가까이 X+), within reach and above the desk; the pinch
 * closes and opens the gripper without flicker; a shown path is simplified to a few points; and a
 * shown pick-and-place, replayed as a process, carries the block in the simulator.
 *
 * Run with: npm run check:hand
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { tcpPositionMm } = await import('../../src/engine/robot/motion');
const { activeArm } = await import('../../src/engine/robot/arms');
const { createWorld, runProcess } = await import('../../src/engine/simulator/sim');
const { tcpFor } = await import('../../src/engine/simulator/effectors');
const { setMatNeeded } = await import('../../src/engine/simulator/desk');
const { compileProcess } = await import('../../src/engine/simulator/process');
const L = await import('../../src/engine/simulator/plan');
const H = await import('../../src/engine/vision/hand');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const HOME = activeArm().home.slice();
setMatNeeded(true);

/** 21 landmarks of an open hand: palm at (cx, cy), `size` wrist to middle knuckle, thumb-index gap `pinch` (× size). */
function hand(cx: number, cy: number, size = 0.2, pinch = 1) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  // Palm centre = mean of wrist (0), index knuckle (5), pinky knuckle (17).
  lm[0] = { x: cx, y: cy + size * 0.6 };
  lm[5] = { x: cx - size * 0.3, y: cy - size * 0.3 };
  lm[17] = { x: cx + size * 0.3, y: cy - size * 0.3 };
  lm[9] = { x: cx, y: cy + size * 0.6 - size };
  lm[4] = { x: cx - size * 0.5, y: cy - size * 0.5 };
  lm[8] = { x: cx - size * 0.5 + size * pinch, y: cy - size * 0.5 };
  return lm;
}

// The pose: mirrored x, size, pinch.
{
  const p = H.handPose(hand(0.3, 0.5))!;
  assert.ok(Math.abs(p.x - 0.7) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9 && Math.abs(p.size - 0.2) < 1e-9 && Math.abs(p.pinch - 1) < 1e-9, JSON.stringify(p));
  assert.equal(H.handPose(hand(0.5, 0.5).slice(0, 10)), null);
  console.log('  ok   a hand: palm centre (mirrored), size, pinch');
}

// The mapping: from the reference, like the jog keys; reach and floor kept.
{
  const settle = (m: InstanceType<typeof H.HandMapper>, lm: ReturnType<typeof hand>) => {
    let out = null;
    for (let k = 0; k < 40; k += 1) out = m.update(H.handPose(lm)!);
    return out!;
  };
  const tip = { x: 200, y: 0, z: 100 };
  const m = new H.HandMapper();
  assert.equal(m.update(H.handPose(hand(0.5, 0.5))!), null, 'nothing before the reference');
  m.reference(H.handPose(hand(0.5, 0.5))!, tip);
  // The user's hand to their right = the picture's left (the camera faces them): tool to its right, Y−.
  let o = settle(m, hand(0.4, 0.5));
  assert.ok(Math.abs(o.target.y - -30) < 0.5 && Math.abs(o.target.x - 200) < 0.5 && Math.abs(o.target.z - 100) < 0.5, `right: ${JSON.stringify(o.target)}`);
  o = settle(m, hand(0.5, 0.4));
  assert.ok(Math.abs(o.target.z - 130) < 0.5, `up: ${JSON.stringify(o.target)}`);
  o = settle(m, hand(0.5, 0.5, 0.25));
  assert.ok(Math.abs(o.target.x - 250) < 0.5, `nearer = forward: ${JSON.stringify(o.target)}`);
  o = settle(m, hand(0.5, 0.95));
  assert.ok(Math.abs(o.target.z - H.HAND_FLOOR_MM) < 0.5, `floor: ${JSON.stringify(o.target)}`);
  o = settle(m, hand(0.0, 0.5));
  assert.ok(Math.abs(o.target.y + H.HAND_REACH_MM) < 0.5, `reach: ${JSON.stringify(o.target)}`);
  console.log('  ok   mapping: right → Y−, up → Z+, nearer → X+, kept within 150 mm and 15 mm above the desk');
}

// The pinch: closes below 0.35, opens above 0.55, holds in between.
{
  const m = new H.HandMapper();
  m.reference(H.handPose(hand(0.5, 0.5))!, { x: 200, y: 0, z: 100 });
  const at = (pinch: number) => m.update(H.handPose(hand(0.5, 0.5, 0.2, pinch))!)!.closed;
  assert.deepEqual([at(1), at(0.45), at(0.3), at(0.45), at(0.5), at(0.6), at(0.4)], [false, false, true, true, true, false, false]);
  console.log('  ok   pinch: closes below 0.35, opens above 0.55, no flicker between');
}

// A shown pick-and-place: sampled from the arm, simplified, replayed as a process, carries the block.
{
  const tool = 'adaptive' as const;
  const tcp = tcpFor(tool, false);
  const solve = L.makeSolver(chain, tcp);
  const plan = L.freshPlan('move1');
  const [A, B] = plan.spots as { x: number; y: number; z: number }[];
  const legs: [{ x: number; y: number; z: number }, boolean][] = [];
  const line = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, closed: boolean, n: number) => {
    for (let k = 1; k <= n; k += 1) legs.push([{ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, z: a.z + ((b.z - a.z) * k) / n }, closed]);
  };
  const up = (p: typeof A) => ({ ...p, z: 80 });
  // Shaky like a hand: ±1.5 mm.
  let seed = HOME.slice();
  line(up(A), up(A), false, 1);
  line(up(A), A, false, 20);
  line(A, A, true, 5);
  line(A, up(A), true, 20);
  line(up(A), up(B), true, 30);
  line(up(B), { ...B, z: B.z + 1 }, true, 20);
  line({ ...B, z: B.z + 1 }, { ...B, z: B.z + 1 }, false, 5);
  line({ ...B, z: B.z + 1 }, up(B), false, 20);
  let k = 0;
  const samples = legs.map(([p, closed]) => {
    const jitter = { x: p.x + Math.sin(k * 1.7) * 1.5, y: p.y + Math.cos(k * 2.3) * 1.5, z: p.z };
    const r = solve(jitter, seed)!;
    assert.ok(r, `solved ${JSON.stringify(jitter)}`);
    seed = r.joints;
    return { t: (k += 1) * 0.1, tip: tcpPositionMm(chain, r.joints, tcp), joints: r.joints, closed };
  });
  const points = H.simplifyDemo(samples, 5);
  assert.ok(points.length >= 6 && points.length <= 14, `${samples.length} samples → ${points.length} points`);
  const p = H.demoProcess(points, true);
  const grips = p.rows.filter((r) => r.kind === 'grip').map((r) => (r.kind === 'grip' ? r.open : null));
  assert.deepEqual(grips, [true, false, true], 'open first, close at A, open at B');
  const world = createWorld(tool, false, L.blockLayout(plan), 'arm');
  world.angles = HOME.slice();
  const instant = async (d: number, f: (t: number) => void) => {
    const n = Math.max(1, Math.ceil(d * 40));
    for (let i = 1; i <= n; i += 1) f((d * i) / n);
  };
  await runProcess(compileProcess(p), { chain, world, poses: {}, animate: instant, see: async () => null }, p.speed);
  const red = world.blocks.find((b) => Math.hypot(b.x - B.x, b.y - B.y) < 8);
  assert.ok(red && Math.abs(red.z - 12.5) < 3, `a block at B: ${JSON.stringify(world.blocks.map((b) => [b.color, Math.round(b.x), Math.round(b.y), Math.round(b.z)]))}`);
  console.log(`  ok   a shown pick-and-place (${samples.length} samples → ${points.length} points, ${p.rows.length} rows) replays and carries the block`);
}

console.log('hand: all checks passed');
