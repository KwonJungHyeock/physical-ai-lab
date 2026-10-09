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

console.log('③ 컵 무게가 바뀐다 — 관성 토크');
check('the turn is 143°, 22.6 rad/s² at 0.8 s; J1 needs 0.40 N·m with the bottle, 0.26 with the cup; the limit is 0.285', () => {
  const v = C.CAFE_DEFAULTS[3] as { radius: number; time: number };
  const b = C.turnTorque(chain, v);
  near(Math.abs(b.dq), 143, 0.5, 'dq');
  near(b.alpha, 22.6, 0.1, 'alpha');
  near(b.tau, 0.40, 0.005, 'bottle');
  near(C.turnTorque(chain, v, C.CUP.kg).tau, 0.26, 0.006, 'cup');
  near(C.j1Limit(chain), 0.285, 0.001, 'limit');
});
check('the program as it was overloads J1 and stops', () => {
  const r = C.runCafe(chain, 3, C.CAFE_DEFAULTS[3]);
  assert.equal(r.failure?.kind, 'overload');
  return `${r.failure!.t.toFixed(2)} s`;
});
check('180 mm in 1.0 s passes (0.15 N·m); 1.2 s alone → 0.18, 150 mm alone → 0.16; 0.9 s alone is still over (0.31)', () => {
  const r = C.runCafe(chain, 3, C.CAFE_FIXES[3]);
  assert.ok(C.scoreCafe(3, r).pass, C.scoreCafe(3, r).headline);
  near(r.maxTau, 0.148, 0.005, 'fix');
  near(C.turnTorque(chain, { radius: 230, time: 1.2 }).tau, 0.178, 0.005, '1.2 s');
  near(C.turnTorque(chain, { radius: 150, time: 0.8 }).tau, 0.163, 0.005, '150 mm');
  const t09 = C.turnTorque(chain, { radius: 230, time: 0.9 }).tau;
  assert.ok(t09 > C.j1Limit(chain), `${t09}`);
  near(t09, 0.31, 0.01, '0.9 s');
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
