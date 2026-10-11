/**
 * 서비스 카페 (engine/education/lab/cafe.ts): the starting programs fail the way the lesson script
 * (content-markdown/sites/cafe.md) says, the worked fixes pass, and the numbers the script quotes hold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const C = await import('../../src/engine/education/lab/cafe');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));
let failed = 0;
const check = (name: string, fn: () => string | void) => {
  try {
    const note = fn();
    console.log(`  ✓ ${name}${note ? ` (${note})` : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
};
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

console.log('① 커피가 넘친다 — 가속도');
check('the cup spills past slope 2h ÷ d = 0.278, i.e. 2.72 m/s²', () => {
  near(C.SPILL_SLOPE, 0.278, 0.001, 'slope');
  near(C.SPILL_ACC, 2.72, 0.01, 'acc');
});
check('4 m/s² tilts the surface 41 % and spills as it leaves the bar', () => {
  const r = C.runCafe(chain, 1, C.CAFE_DEFAULTS[1]);
  assert.equal(r.failure?.kind, 'spill');
  near(r.maxSlope, 0.408, 0.002, 'slope');
  assert.ok(!C.scoreCafe(1, r).pass);
  return `${r.failure!.t.toFixed(2)} s`;
});
check('2 m/s² does not spill (20 %), the carry takes 1.21 s; 0.3 m/s² takes 1.92 s', () => {
  const r = C.runCafe(chain, 1, C.CAFE_FIXES[1]);
  assert.ok(C.scoreCafe(1, r).pass, C.scoreCafe(1, r).headline);
  near(r.carryS, 1.21, 0.02, 'T');
  near(C.trapezoid(270, 250, 300).T, 1.92, 0.01, 'slow T');
});

console.log('② 손과 가까워진다 — 보호 거리');
check('the protective distance: 96.9 mm at 250 mm/s, 50 mm at 100 mm/s', () => {
  near(C.protectiveDistance({ zoneSpeed: 250, detect: 0 }).total, 96.9, 0.1, '250');
  near(C.protectiveDistance({ zoneSpeed: 100, detect: 0 }).total, 50, 0.1, '100');
});
check('250 mm/s with 50 mm detection: the sensor sees the hand (~48 mm) but the moving cup hits it at 250 mm/s', () => {
  const r = C.runCafe(chain, 2, C.CAFE_DEFAULTS[2]);
  const det = r.events.find((e) => e.kind === 'detect');
  near(det!.value!, 48, 2, 'detect');
  assert.equal(r.failure?.kind, 'touch');
  near(r.hitSpeed, 250, 1, 'hit');
});
check('100 mm/s with 90 mm detection stops ~35 mm before the hand and hands the cup over', () => {
  const r = C.runCafe(chain, 2, C.CAFE_FIXES[2]);
  assert.ok(C.scoreCafe(2, r).pass, C.scoreCafe(2, r).headline);
  near(r.stopGap!, 35, 3, 'gap');
  return `${r.stopGap!.toFixed(1)} mm`;
});
check('only detection 120 mm at 250 mm/s leaves 15 mm (not enough); only 100 mm/s with 50 mm still touches', () => {
  const a = C.runCafe(chain, 2, { zoneSpeed: 250, detect: 120 });
  near(a.stopGap!, 15, 3, 'gap');
  assert.ok(!C.scoreCafe(2, a).pass);
  const b = C.runCafe(chain, 2, { zoneSpeed: 100, detect: 50 });
  assert.equal(b.failure?.kind, 'touch');
});

console.log('③ 물병이 무거워졌다 (돌봄) — 관성 토크');
// The care mode's J1 torque limit is a safety setting (0.12 N·m), well under the servo's own
// estimate (j1Limit, 0.285 — the 4단원 figure). J1 tops out at 200 °/s (robot/motion.ts), so a
// 143° quintic turn cannot take less than 1.875 × 143 ÷ 200 ≈ 1.34 s: every time the lesson uses
// is one the real servo can follow.
check('the turn is 143°; at 230 mm, 1.4 s: 7.37 rad/s², peak 192 °/s; J1 needs 0.130 N·m with the bottle, 0.083 with the cup; the care limit is 0.12 (servo 0.285)', () => {
  const v = C.CAFE_DEFAULTS[3] as { radius: number; time: number };
  assert.deepEqual(v, { radius: 230, time: 1.4 });
  const b = C.turnTorque(chain, v);
  near(Math.abs(b.dq), 143, 0.5, 'dq');
  near(b.alpha, 7.37, 0.01, 'alpha');
  near(b.speed, 192, 0.5, 'speed');
  assert.ok(b.speed <= C.J1_MAX_SPEED, 'the default must be a speed the servo can follow');
  near(b.tau, 0.130, 0.001, 'bottle');
  assert.ok(b.tau > C.CARE_J1_LIMIT, 'the bottle overloads the care limit');
  const cup = C.turnTorque(chain, v, C.CUP.kg).tau;
  near(cup, 0.083, 0.001, 'cup');
  assert.ok(cup < C.CARE_J1_LIMIT, 'the morning cup was fine');
  assert.equal(C.CARE_J1_LIMIT, 0.12);
  assert.equal(C.J1_MAX_SPEED, 200);
  near(C.j1Limit(chain), 0.285, 0.001, 'servo limit');
  near((1.875 * Math.abs(b.dq)) / C.J1_MAX_SPEED, 1.34, 0.005, 'min time');
});
check('the program as it was overloads J1 and stops', () => {
  const r = C.runCafe(chain, 3, C.CAFE_DEFAULTS[3]);
  assert.equal(r.failure?.kind, 'overload');
  assert.ok(!C.scoreCafe(3, r).pass);
  return `${r.failure!.t.toFixed(2)} s`;
});
check('180 mm in 1.4 s passes (0.076 N·m); 230 mm in 1.6 s passes too (0.099); 1.45 s alone is still over (0.121)', () => {
  const fix = C.CAFE_FIXES[3] as { radius: number; time: number };
  assert.deepEqual(fix, { radius: 180, time: 1.4 });
  const r = C.runCafe(chain, 3, fix);
  assert.ok(C.scoreCafe(3, r).pass, C.scoreCafe(3, r).headline);
  near(r.maxTau, 0.076, 0.001, 'fix');
  // Slower, the bottle held out as before: τ ∝ 1 ÷ T² (0.130 × (1.4 ÷ 1.6)² = 0.099).
  const slow = C.runCafe(chain, 3, { radius: 230, time: 1.6 });
  assert.ok(C.scoreCafe(3, slow).pass, C.scoreCafe(3, slow).headline);
  near(slow.maxTau, 0.099, 0.001, '1.6 s');
  // The script's hint range: 150 ~ 200 mm at 1.4 s, or 1.5 s and longer at 230 mm.
  for (const v of [{ radius: 150, time: 1.4 }, { radius: 200, time: 1.4 }, { radius: 230, time: 1.5 }, { radius: 230, time: 2.5 }]) {
    const x = C.runCafe(chain, 3, v);
    assert.ok(C.scoreCafe(3, x).pass, `${JSON.stringify(v)}: ${C.scoreCafe(3, x).headline}`);
  }
  const t145 = C.turnTorque(chain, { radius: 230, time: 1.45 }).tau;
  near(t145, 0.121, 0.001, '1.45 s');
  assert.equal(C.runCafe(chain, 3, { radius: 230, time: 1.45 }).failure?.kind, 'overload');
  // (180 ÷ 230)² = 0.61, the calc step's second answer.
  near((180 / 230) ** 2, 0.61, 0.005, 'r²');
});
check('too fast: 1.2 s needs 224 °/s — J1 cannot follow, the run stops on speed (not torque) before turning, even folded in', () => {
  for (const radius of [230, 150]) {
    const r = C.runCafe(chain, 3, { radius, time: 1.2 });
    assert.equal(r.failure?.kind, 'overspeed', `${radius} mm`);
    near(r.peakSpeed, 224, 0.5, 'speed');
    assert.equal(r.maxTau, 0);
    const sc = C.scoreCafe(3, r);
    assert.ok(!sc.pass);
    assert.ok(!sc.checks[0].ok, 'the speed check fails');
  }
  // The knob's lower end (1.0 s) is too fast too; 1.35 s is just slow enough (199 °/s) but overloads.
  assert.equal(C.runCafe(chain, 3, { radius: 180, time: 1.0 }).failure?.kind, 'overspeed');
  const edge = C.runCafe(chain, 3, { radius: 230, time: 1.35 });
  assert.equal(edge.failure?.kind, 'overload');
  return C.runCafe(chain, 3, { radius: 230, time: 1.2 }).failure!.text;
});
check('the same values give the same run', () => {
  const a = C.runCafe(chain, 2, C.CAFE_DEFAULTS[2]);
  const b = C.runCafe(chain, 2, C.CAFE_DEFAULTS[2]);
  assert.equal(a.durationS, b.durationS);
  assert.deepEqual(a.events, b.events);
});

if (failed) {
  console.log(`\ncafe: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\ncafe: all checks passed');
