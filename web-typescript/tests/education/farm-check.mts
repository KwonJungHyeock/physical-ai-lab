/**
 * 스마트팜 (engine/education/lab/farm.ts): the starting programs fail the way the lesson script
 * (content-markdown/sites/farm.md) says, the worked fixes pass, and the numbers the script quotes hold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const F = await import('../../src/engine/education/lab/farm');

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

console.log('① 덜 익은 것도 딴다 — 색 문턱값');
const L1 = F.FARM_TOMATOES[1];
const img1 = F.toHsv(F.cameraPicture(L1));
check('the camera reads the hues the script quotes (ripe −5 ~ 8°, turning 24 · 31°, green 82°)', () => {
  const h = L1.map((t) => Math.round(F.measuredHue(img1, t)));
  assert.deepEqual(h, [2, -5, 24, 8, 82, 31, 4]);
});
check('the paprika range (−10 ~ 40°) packs the 4 ripe and the 2 turning tomatoes', () => {
  const r = F.runFarm(chain, 1, F.FARM_DEFAULTS[1]);
  assert.equal(r.found.length, 6);
  assert.equal(r.ripePacked, 4);
  assert.equal(r.unripePacked, 2);
  assert.equal(r.failure?.kind, 'unripe');
  assert.ok(!F.scoreFarm(1, r).pass);
  return `first wrong pick ${r.failure!.t.toFixed(1)} s`;
});
check('−10 ~ 15° packs only the 4 ripe ones', () => {
  const r = F.runFarm(chain, 1, F.FARM_FIXES[1]);
  assert.ok(F.scoreFarm(1, r).pass, F.scoreFarm(1, r).headline);
  return `${r.durationS.toFixed(1)} s`;
});
check('a range of only −3 ~ 3° leaves ripe ones; the upper end works from 9° to 24°', () => {
  const r = F.runFarm(chain, 1, { lo: -3, hi: 3 });
  assert.ok(r.ripeLeft >= 2, `${r.ripeLeft}`);
  const ok = (hi: number) => {
    const ks = F.findTomatoes(img1, { lo: -10, hi }, F.RATIO_NOW, L1).map((f) => f.k);
    return L1.every((t, k) => t.ripe === ks.includes(k));
  };
  assert.ok(!ok(8) && ok(9) && ok(16) && ok(24) && !ok(25));
});

console.log('② 카메라와 손끝이 안 맞는다 — 픽셀 → mm');
check('the markers are 265 px apart now: 220 ÷ 265 = 460 ÷ 554 = 0.83 mm/px; before 0.686', () => {
  const [a, b] = F.markerPixels();
  near(Math.hypot(b.u - a.u, b.v - a.v), 265, 0.5, 'px');
  near(F.RATIO_NOW, 0.83, 0.001, 'now');
  near(F.RATIO_OLD, 0.686, 0.001, 'old');
});
check('the old ratio: the centre one is fine, the miss grows ~0.15 × distance, the 4th presses on its tomato', () => {
  const p = F.ratioPreview(F.RATIO_OLD);
  const by = (k: number) => p.find((x) => x.k === k)!;
  near(by(0).offset, 0.4, 0.1, '1번');
  near(by(1).offset, 6.8, 0.1, '2번');
  near(by(3).offset, 9.2, 0.1, '4번');
  for (const k of [1, 2, 3, 4, 5]) near(by(k).offset / by(k).r, 0.148, 0.004, `${k + 1}번 ratio`);
  const r = F.runFarm(chain, 2, F.FARM_DEFAULTS[2]);
  assert.equal(r.failure?.kind, 'press');
  assert.equal(r.failure?.tomato, 3);
  assert.equal(r.picks.filter((x) => x.packed).length, 3);
  return `${r.failure!.t.toFixed(1)} s`;
});
check('0.83 packs all six within 3 mm of the fingers’ centre (what is left is parallax); 0.75 still misses by over 6 mm', () => {
  const r = F.runFarm(chain, 2, F.FARM_FIXES[2]);
  assert.ok(F.scoreFarm(2, r).pass, F.scoreFarm(2, r).headline);
  const worst = Math.max(...r.picks.map((x) => x.offset));
  assert.ok(worst <= 3, `${worst}`);
  const p = F.ratioPreview(0.75);
  assert.ok(Math.max(...p.map((x) => x.offset)) > 6);
  return `max ${worst.toFixed(1)} mm, ${r.durationS.toFixed(1)} s`;
});

console.log('③ 물러서 터진다 — 잡는 힘');
check('the camera reads tomato 1 as 27.8 mm (it is 27); it weighs 10.3 g and needs 0.17 N to lift', () => {
  const g = F.gripPreview(F.FARM_DEFAULTS[3] as { squeeze: number; speed: number }).find((x) => x.k === 0)!;
  near(g.dSeen, 27.8, 0.05, 'seen');
  near(F.tomatoGrams(F.FARM_TOMATOES[3][0]), 10.3, 0.05, 'g');
  near(g.need, 0.165, 0.005, 'need');
});
check('squeeze 3 at speed 100: 1.2 × (2.2 + 3.0) ≈ 6.2 N bursts the first tomato', () => {
  const r = F.runFarm(chain, 3, F.FARM_DEFAULTS[3]);
  assert.equal(r.failure?.kind, 'burst');
  assert.equal(r.failure?.tomato, 0);
  near(r.failure!.value!, 6.22, 0.05, 'peak');
  return `${r.failure!.t.toFixed(1)} s`;
});
check('squeeze 2 at speed 40 packs all five, peak ≤ 4.2 N', () => {
  const r = F.runFarm(chain, 3, F.FARM_FIXES[3]);
  const s = F.scoreFarm(3, r);
  assert.ok(s.pass, s.headline);
  return `max ${Math.max(...r.picks.map((x) => x.peak)).toFixed(1)} N`;
});
check('squeeze 2 at speed 100 is 4.9 ~ 5.3 N (over the safe line); squeeze 1 lets the 29 mm tomato slip', () => {
  const g = F.gripPreview({ squeeze: 2, speed: 100 });
  const pk = g.map((x) => x.peak);
  near(Math.min(...pk), 4.9, 0.06, 'min');
  near(Math.max(...pk), 5.3, 0.06, 'max');
  assert.ok(!F.scoreFarm(3, F.runFarm(chain, 3, { squeeze: 2, speed: 100 })).pass);
  const r = F.runFarm(chain, 3, { squeeze: 1, speed: 40 });
  assert.equal(r.failure?.kind, 'slip');
  assert.equal(F.FARM_TOMATOES[3][r.failure!.tomato!].d, 29);
});
check('the same values give the same run', () => {
  const a = F.runFarm(chain, 2, F.FARM_DEFAULTS[2]);
  const b = F.runFarm(chain, 2, F.FARM_DEFAULTS[2]);
  assert.equal(a.durationS, b.durationS);
  assert.deepEqual(a.events, b.events);
});

if (failed) {
  console.log(`\nfarm: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nfarm: all checks passed');
