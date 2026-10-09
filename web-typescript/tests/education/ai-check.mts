/**
 * AI 연구소 (engine/education/lab/ai.ts): the starting programs fail the way the lesson script
 * (content-markdown/sites/ai.md) says, the worked fixes pass, and the numbers the script quotes hold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const A = await import('../../src/engine/education/lab/ai');

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

console.log('① 색이 섞여 있다 — 겹치는 범위');
const L1 = A.AI_THINGS[1];
const pic1 = A.kitPicture(L1);
check('the camera reads H 4 · 25 · 50 · 112; the markers give the official scale (Z ÷ f)', () => {
  assert.deepEqual(L1.map((t) => A.measuredHue(pic1, t)), [4, 25, 50, 112]);
  near(A.markerCalibration().ratio, A.CAMERA.z / A.CAMERA.f, 1e-6, 'ratio');
});
check('the official ranges take the yellowish green for yellow: it goes to bin B, the other three to their own', () => {
  const r = A.runAi(chain, 1, A.AI_DEFAULTS[1]);
  assert.equal(r.found.find((f) => f.k === 2)?.color, '노랑');
  assert.equal(r.right, 3);
  assert.ok(r.events.some((e) => e.kind === 'wrong' && e.thing === 2));
  assert.ok(!A.scoreAi(1, r).pass);
});
check('yellow up to 34 sorts all four; the top works from 25 to 49, and raising green alone does not help', () => {
  const r = A.runAi(chain, 1, A.AI_FIXES[1]);
  assert.ok(A.scoreAi(1, r).pass, A.scoreAi(1, r).headline);
  const ok = (yh: number, gl = 35) => {
    const f = A.findThings(pic1, A.officialRanges(yh, gl), L1);
    return L1.every((t, k) => f.some((x) => x.k === k && A.BIN_OF[x.color] === t.bin));
  };
  assert.ok(!ok(24) && ok(25) && ok(49) && !ok(50), `${[24, 25, 49, 50].map((h) => ok(h))}`);
  assert.ok(!ok(59, 25));
  return `${r.durationS.toFixed(1)} s`;
});

console.log('② 시연을 보고 따라 하기 — 정책');
check('replaying demo 1 misses by the distance to it each time: 84.9 · 55.9 · 52.2 mm (air)', () => {
  const r = A.runAi(chain, 2, A.AI_DEFAULTS[2]);
  const off = r.picks.map((x) => x.offset);
  near(off[0], 84.9, 0.1, '1');
  near(off[1], 55.9, 0.1, '2');
  near(off[2], 52.2, 0.1, '3');
  assert.ok(!A.scoreAi(2, r).pass);
});
check('mixing the ten demonstrations: p 2 → 8 ~ 16 mm, p 3 → 3 ~ 6 mm, p 4 → 2 ~ 12 mm; off the board (250, 0) > 50 mm', () => {
  const m = (p: number) => A.TRIALS.map((t) => A.demoMiss(chain, { mode: 'blend', power: p }, t));
  const r2 = m(2);
  assert.ok(Math.min(...r2) > 8 && Math.max(...r2) < 16.5, `${r2}`);
  const r3 = m(3);
  assert.ok(Math.min(...r3) > 3 && Math.max(...r3) < 6.05, `${r3}`);
  const r4 = m(4);
  assert.ok(Math.min(...r4) > 2 && Math.max(...r4) < 12.5, `${r4}`);
  assert.ok(A.demoMiss(chain, { mode: 'blend', power: 2 }, [250, 0]) > 50);
  return `p3 max ${Math.max(...r3).toFixed(2)} mm`;
});
check('relative to the block (where the camera sees it) picks all three within 1 mm', () => {
  const r = A.runAi(chain, 2, A.AI_FIXES[2]);
  assert.ok(A.scoreAi(2, r).pass, A.scoreAi(2, r).headline);
  assert.ok(Math.max(...r.picks.map((x) => x.offset)) < 1);
});

console.log('③ 처음 보는 물건 — 높이와 시차');
check('as for blocks (25 mm): the cup presses 38 mm into the first part', () => {
  const r = A.runAi(chain, 3, A.AI_DEFAULTS[3]);
  assert.equal(r.failure?.kind, 'press');
  near(r.failure!.value! + 3, 38, 0.01, 'press');
});
check('height 60 alone: no pressing, but every part is missed by parallax, 12 ~ 14 mm (red: r 68 → 13.5, formula 13.2)', () => {
  const r = A.runAi(chain, 3, { height: 60, parallax: false });
  assert.ok(!r.events.some((e) => e.kind === 'press'));
  const prev = A.partPreview({ height: 60, parallax: false });
  for (const g of prev) assert.ok(g.miss > 12 && g.miss < 14, `${g.miss}`);
  const red = prev.find((g) => g.k === 0)!;
  near(red.r, 68, 0.5, 'r');
  near(red.miss, 13.5, 0.2, 'miss');
  near((68 * 60) / (368 - 60), 13.2, 0.05, 'formula');
  assert.equal(r.right, 0);
});
check('height 60 with the parallax fix (× 0.837) puts all four in their bins', () => {
  const r = A.runAi(chain, 3, A.AI_FIXES[3]);
  assert.ok(A.scoreAi(3, r).pass, A.scoreAi(3, r).headline);
  near((368 - 60) / 368, 0.837, 0.001, 'k');
  return `${r.durationS.toFixed(1)} s`;
});
check('the 25 mm blocks of ① are within 3 mm without a fix (why the official program works for them)', () => {
  const r = A.runAi(chain, 1, A.AI_FIXES[1]);
  assert.ok(Math.max(...r.picks.map((x) => x.offset)) < 3);
});

if (failed) {
  console.log(`\nai: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nai: all checks passed');
