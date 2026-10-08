/**
 * Checks for the 문제 해결 실습 (시범) — 컨베이어 공정 (src/engine/education/lab): the three
 * problems run headless through the same cell the screen plays back (real FK / IK, trajectory
 * timing, collision checks), and each must fail with its starting values and pass with a fix.
 *
 *  ① the work sheet's pose misses the box; the angles that put the tip on the box pass (≤ 3 mm);
 *  ② every target is reachable by IK except the third box's, which is out of reach until its
 *    sensor moves closer and the approach comes lower; one pose for all boxes does not pass;
 *  ③ the starting timing lets the boxes pass; a planned one catches 3 in a row with no collision.
 *
 * Run with: npm run check:lab
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain, forwardKinematicsFrames } = await import('../../src/engine/robot/kinematics');
const L = await import('../../src/engine/education/lab/problems');
const { josa } = await import('../../src/engine/education/lab/run');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
  }
};
const kinds = (run: { events: { kind: string }[] }) => run.events.map((e) => e.kind).filter((k) => k !== 'sensor');

console.log('① 옆을 집는다 — 순기구학');
check('the wrist keeps the cup straight down for any J1 · J2 · J3', () => {
  for (const [a, b, c] of [
    [0, -20, -60],
    [25, -40, -40],
    [-30, 0, -80],
  ]) {
    const e = forwardKinematicsFrames(chain, L.wristDown(a, b, c)).at(-1)!.elements;
    assert.ok(e[10] < -0.9999, `tool axis z = ${e[10].toFixed(4)} at (${a}, ${b}, ${c})`);
  }
});
const p1Default = L.runP1(chain, L.P1_DEFAULT);
const p1DefaultMiss = L.p1Miss(p1Default);
check('the work sheet pose misses the box by more than 20 mm, and the run says so', () => {
  const live = L.p1Live(chain, L.P1_DEFAULT);
  assert.ok(live.missMm > 20, `live miss ${live.missMm.toFixed(1)} mm`);
  assert.ok(p1DefaultMiss !== null && Math.abs(p1DefaultMiss - live.missMm) < 0.6, `run ${p1DefaultMiss} vs FK ${live.missMm.toFixed(1)}`);
  const v = L.verdict(1, p1Default);
  assert.equal(v.pass, false);
  assert.deepEqual(kinds(p1Default), ['miss']);
});
const answer = L.p1Answer(chain);
const p1Fixed = L.runP1(chain, answer);
check(`angles that put the tip on the box (${answer.j1}°, ${answer.j2}°, ${answer.j3}°) pick it within 3 mm and set it on the pallet`, () => {
  const v = L.verdict(1, p1Fixed);
  assert.ok(v.pass, v.headline);
  assert.ok(L.p1Miss(p1Fixed)! <= L.GRIP_TOL_MM);
  assert.deepEqual(kinds(p1Fixed), ['grip', 'place']);
});
check('3 mm is a hard line: 1° off on J1 is already too far', () => {
  const off = L.runP1(chain, { ...answer, j1: answer.j1 + 1 });
  assert.equal(L.verdict(1, off).pass, false);
  assert.ok(L.p1Miss(off)! > 3, `J1 + 1° misses by ${L.p1Miss(off)}`);
});
check('a pose pushed into the box is a collision, not a pick', () => {
  const live = L.p1Live(chain, answer);
  // Lower the tip ~10 mm by bending the elbow a little more (found by FK, not by a table).
  let j3 = answer.j3;
  while (L.p1Live(chain, { ...answer, j3 }).tip[2] > live.tip[2] - 10 && j3 > -110) j3 -= 0.1;
  const run = L.runP1(chain, { ...answer, j3 });
  assert.equal(run.failure?.kind, 'hit', JSON.stringify(run.events.map((e) => e.text)));
});

console.log('② 자리가 매번 바뀐다 — 역기구학 · 작업 공간');
const p2Start = L.p2DefaultValues(chain);
check('one pose for every box: only the first box is picked', () => {
  const run = L.runP2(chain, p2Start);
  const v = L.verdict(2, run);
  assert.equal(v.placed, 1, v.headline);
  assert.equal(v.pass, false);
});
const coords = { ...p2Start, mode: 'coords' as const };
check('IK reaches boxes 1 and 2 (target and approach); the third stop is out of reach', () => {
  const plan = L.p2Plan(chain, coords);
  assert.ok(plan[0].q && plan[0].approachQ && plan[1].q && plan[1].approachQ, 'boxes 1 and 2 reachable');
  assert.equal(plan[2].q, null, `box 3 at r = ${plan[2].radiusMm.toFixed(0)} mm should be out of reach`);
  const run = L.runP2(chain, coords);
  const v = L.verdict(2, run);
  assert.equal(v.placed, 2, v.headline);
  assert.equal(run.events.filter((e) => e.kind === 'unreachable').length, 1);
});
check('the IK angles really put the tip on each target (FK of the answer, < 1 mm)', () => {
  for (const p of L.p2Plan(chain, coords).slice(0, 2)) {
    const tip = L.tipMm(chain, p.q!);
    assert.ok(L.distanceMm(tip, p.target) < 1, `${tip} vs ${p.target}`);
  }
});
const s3 = 170;
check(`moving sensor 3 to y = ${s3} brings the box in reach, but approaching 80 mm above it is still too high`, () => {
  const p = L.p2Plan(chain, { ...coords, s3 })[2];
  assert.ok(p.q, 'target reachable');
  assert.equal(p.approachQ, null, 'approach should be out of reach');
  const reach = L.reachAt(chain, p.target[2] + coords.approach, p.target[1]);
  assert.ok(p.radiusMm > reach, `r ${p.radiusMm.toFixed(0)} vs reach ${reach.toFixed(0)} at the approach height`);
});
check(`sensor 3 at y = ${s3} and a 40 mm approach: all three boxes on the pallet`, () => {
  const run = L.runP2(chain, { ...coords, s3, approach: 40 });
  const v = L.verdict(2, run);
  assert.ok(v.pass, `${v.headline} · ${run.events.map((e) => e.text).join(' / ')}`);
});

console.log('③ 움직이는 상자를 놓친다 — 궤적과 시간 계획');
const p3Default = L.runP3(chain, L.P3_DEFAULT);
check('the starting timing comes down after every box has gone past', () => {
  const v = L.verdict(3, p3Default);
  assert.equal(v.pass, false);
  const offs = L.p3Offsets(p3Default);
  assert.ok(
    offs.every((o) => o !== null && o < -L.CATCH_TOL_MM),
    `offsets ${offs.join(', ')}`,
  );
  const t = L.p3Timing(chain, L.P3_DEFAULT);
  assert.ok(t.offS > 0.5, `plan says late by ${t.offS.toFixed(2)} s`);
});
const early = { belt: 120, waitY: 40, delayMs: 1400, move: 'joint' as const, speed: 80 };
check('coming down too early: the arriving box runs into the cup (a collision)', () => {
  const run = L.runP3(chain, early);
  assert.equal(run.failure?.kind, 'hit', run.events.map((e) => e.text).join(' / '));
});
const plan = (v: { belt: number; waitY: number; move: 'joint' | 'linear'; speed: number }) => {
  const t = L.p3Timing(chain, { ...v, delayMs: 0 });
  return { ...v, delayMs: Math.round((t.boxS - t.downS) * 100) * 10 };
};
const fixed = plan({ belt: 120, waitY: 40, move: 'joint', speed: 80 });
check(`a planned timing (wait at y 40, delay ${fixed.delayMs} ms = box time − way down, joint move, 80 %) catches 3 in a row`, () => {
  const run = L.runP3(chain, fixed);
  const v = L.verdict(3, run);
  assert.ok(
    v.pass,
    `${v.headline} · ${run.events
      .filter((e) => e.kind !== 'sensor')
      .map((e) => e.text)
      .join(' / ')}`,
  );
  assert.ok(L.p3Offsets(run).every((o) => o !== null && Math.abs(o) <= L.CATCH_TOL_MM));
});
check('the same plan with straight-line moves also works (slower down, so a shorter delay)', () => {
  const v = L.verdict(3, L.runP3(chain, plan({ belt: 120, waitY: 40, move: 'linear', speed: 80 })));
  assert.ok(v.pass, v.headline);
});
check('right timing but a slow arm (30 %): it is not back in time for the next box', () => {
  const v = L.verdict(3, L.runP3(chain, plan({ belt: 120, waitY: 40, move: 'joint', speed: 30 })));
  assert.equal(v.pass, false, v.headline);
  const t = L.p3Timing(chain, { ...fixed, speed: 30 });
  assert.ok(t.cycleS > t.gapS, `cycle ${t.cycleS.toFixed(2)} s vs gap ${t.gapS.toFixed(2)} s`);
});

console.log('the worked fixes the screen offers (referenceFix)');
check('each problem passes with its worked fix', () => {
  const runs = [L.runP1(chain, L.referenceFix(chain, 1) as never), L.runP2(chain, L.referenceFix(chain, 2) as never), L.runP3(chain, L.referenceFix(chain, 3) as never)];
  runs.forEach((run, i) => {
    const v = L.verdict((i + 1) as 1 | 2 | 3, run);
    assert.ok(v.pass, `${i + 1}: ${v.headline}`);
  });
});

console.log('text');
check('particles follow the name (상자 A는 · 상자 1은 · 상자 2가)', () => {
  assert.equal(josa('상자 A', '은'), '상자 A는');
  assert.equal(josa('상자 1', '은'), '상자 1은');
  assert.equal(josa('상자 2', '이'), '상자 2가');
  assert.equal(josa('상자 3', '을'), '상자 3을');
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nlab: all checks passed');
