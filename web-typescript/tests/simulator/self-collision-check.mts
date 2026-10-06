/**
 * The arm against itself (engine/robot/selfCollision.ts, used by every simulator move): a pose that
 * folds the wrist onto the forearm or the forearm into the base is caught with the joint to change,
 * the suggested change frees it, the ready and zero poses of every arm in the registry are free with
 * every tool that fits it, and the simulator refuses such a move (slider, jog, program) before
 * anything moves — while a move out of a pose that is already into itself is still allowed.
 *
 * Run with: npm run check:self
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { ARMS, setActiveArm } = await import('../../src/engine/robot/arms');
const { EFFECTOR_BY_ID } = await import('../../src/engine/simulator/effectors');
const { selfContact, selfFix, selfProblem, segmentDistance } = await import('../../src/engine/robot/selfCollision');
const { createWorld, jogTo, moveProblem, preflight, runProgram, SelfCollision } = await import('../../src/engine/simulator/sim');

const chainOf = (urdf: string) => buildChain(parseUrdf(readFileSync(new URL(`../../public${urdf}`, import.meta.url), 'utf8')));

/* --- geometry ------------------------------------------------------------------ */
{
  assert.equal(segmentDistance([0, 0, 0], [10, 0, 0], [0, 5, 0], [10, 5, 0]), 5);
  assert.equal(segmentDistance([0, 0, 0], [10, 0, 0], [5, -3, 4], [5, 3, 4]), 4);
  assert.equal(segmentDistance([0, 0, 0], [1, 0, 0], [4, 0, 0], [9, 0, 0]), 3);
  console.log('  ok   segment distances');
}

/* --- myCobot 280: known poses ------------------------------------------------------ */
const a280 = setActiveArm('mycobot280-rdkx5');
const c280 = chainOf(a280.urdf);
{
  // The wrist folded back onto the forearm (J4 -150°, J5 30°).
  const folded = [0, 0, 0, -150, 30, 0];
  const hit = selfContact(c280, folded, a280.family);
  assert.ok(hit && hit.kind === 'self', `folded wrist is caught: ${JSON.stringify(hit)}`);
  const fix = selfFix(c280, folded, a280);
  assert.ok(fix, 'one joint frees the folded wrist');
  const freed = folded.slice();
  freed[fix.joint] = fix.limitDeg + fix.dir;
  assert.equal(selfContact(c280, freed, a280.family), null, `J${fix.joint + 1} past ${fix.limitDeg}° frees it`);
  const msg = selfProblem(c280, folded, a280)!;
  assert.match(msg, /팔끼리 부딪혀요/);
  assert.match(msg, new RegExp(`J${fix.joint + 1} 를 -?\\d+° 보다 (크게|작게)`));

  // The forearm brought down into the base behind the robot (J2 90°, J3 135°).
  const intoBase = [0, 90, 135, -41, 2, 10];
  const b = selfContact(c280, intoBase, a280.family);
  assert.ok(b && b.kind === 'base', `forearm into the base is caught: ${JSON.stringify(b)}`);
  assert.match(selfProblem(c280, intoBase, a280)!, /로봇 받침.*J\d 를/);

  // Safe: the ready pose with the longest tool, the zero pose, and a few taught poses of the practices.
  for (const q of [a280.home, a280.zero, [30, 20, -60, -40, 0, 0], [-30, 10, -50, -50, 0, 0], [0, 30, -90, -20, 0, 0]]) {
    assert.equal(selfContact(c280, q, a280.family, EFFECTOR_BY_ID.adaptive.tcpMm), null, `${JSON.stringify(q)} is free`);
  }
  console.log(`  ok   myCobot 280: folded wrist and forearm into the base caught ("${msg}"), ready/zero/taught poses free`);
}

/* --- every arm in the registry ---------------------------------------------------- */
{
  const seen = new Set<string>();
  for (const [id, a] of Object.entries(ARMS)) {
    if (!a) continue;
    const chain = chainOf(a.urdf);
    for (const tool of a.tools) {
      const tcp = EFFECTOR_BY_ID[tool].tcpMm;
      assert.equal(selfContact(chain, a.home, a.family, tcp), null, `${id}: ready pose free with ${tool}`);
      assert.equal(selfContact(chain, a.zero, a.family, tcp), null, `${id}: zero pose free with ${tool}`);
    }
    // Each family can fold into itself or its base somewhere in its range, and the checker sees it.
    if (!seen.has(a.family)) {
      seen.add(a.family);
      let caught = 0;
      for (let j3 = a.min[2]; j3 <= a.max[2]; j3 += 5) {
        const q = a.home.slice();
        q[1] = Math.min(a.max[1], 90);
        q[2] = j3;
        if (selfContact(chain, q, a.family)) caught += 1;
      }
      assert.ok(caught > 0, `${a.family}: some folded pose is caught`);
    }
    console.log(`  ok   ${id.padEnd(20)} ready and zero poses free with ${a.tools.length} tools`);
  }
}

/* --- the simulator refuses before moving ------------------------------------------ */
{
  setActiveArm('mycobot280-rdkx5');
  const w = createWorld('none', false, undefined, 'arm');
  const before = w.angles.slice();
  const folded = [0, 0, 0, -150, 30, 0];
  const why = moveProblem(c280, w, folded);
  assert.ok(why && /부딪혀요/.test(why) && /J\d 를/.test(why), `a move into itself is refused: ${why}`);
  assert.deepEqual(w.angles, before, 'the world is not moved by the check');

  // Jog: step by step toward the fold; it stops before the arm is into itself.
  let q = w.angles.slice();
  let refused: string | null = null;
  for (let k = 0; k < 400 && !refused; k += 1) {
    const next = q.map((v, i) => v + Math.max(-1, Math.min(1, folded[i] - v)));
    refused = jogTo(c280, w, next);
    if (!refused) q = next;
  }
  assert.ok(refused, 'jogging toward the fold is stopped');
  assert.equal(selfContact(c280, w.angles, a280.family), null, 'the jog stopped short of the contact');

  // A program: refused by the check before it runs, with the line that would fold it.
  const steps = [
    { type: 'home' as const, line: 1 },
    { type: 'move' as const, joints: folded, speed: 50, line: 2 },
  ];
  const pre = await preflight((h) => runProgram(steps, h), { chain: c280, world: createWorld('none', false, undefined, 'arm'), poses: {} });
  assert.ok(pre instanceof SelfCollision, 'the program check finds the fold');
  assert.equal(pre.line, 2, 'on the line of the move');
  const fine = await preflight((h) => runProgram([{ type: 'home', line: 1 }], h), { chain: c280, world: createWorld('none', false, undefined, 'arm'), poses: {} });
  assert.equal(fine, null, 'a program that keeps clear passes the check');

  // Already folded (a real arm left that way): moving out of it is allowed, deeper is not.
  const stuck = createWorld('none', false, undefined, 'arm');
  stuck.angles = [0, 0, 0, -160, 40, 0];
  assert.equal(moveProblem(c280, stuck, a280.home.slice()), null, 'a move out of the fold is allowed');
  assert.ok(moveProblem(c280, stuck, [0, 0, 0, -165, 60, 0]), 'a move deeper into it is not');
  console.log('  ok   moves, jogs and programs into the arm itself are refused before they run');
}

console.log('self-collision: all checks passed');
