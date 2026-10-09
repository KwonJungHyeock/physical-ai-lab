/**
 * 에너지 · 자원순환 — 재활용 선별 (engine/education/lab/energy.ts): the starting programs fail the way
 * the lesson script (content-markdown/sites/energy.md) says, the worked fixes pass, and the numbers the
 * script and the screen quote hold — pixels and brightness, mm, m/s², N, s and pieces per minute.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { MARKERS, MARKER_MM, CAL_BOARD, BINS } = await import('../../src/engine/simulator/board');
const E = await import('../../src/engine/education/lab/energy');

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

console.log('셀 — 판 위의 조각');
check('every piece lies on the board, clear of the markers (with their quiet zone) and of the others but the ones it is stacked on', () => {
  for (const p of [1, 2, 3] as const) {
    const L = E.ENERGY_ITEMS[p];
    L.forEach((t, k) => {
      const d = E.dims(t);
      const [x0, x1, y0, y1] = [t.x - d.sx / 2, t.x + d.sx / 2, t.y - d.sy / 2, t.y + d.sy / 2];
      assert.ok(x0 > CAL_BOARD.x - CAL_BOARD.size / 2 + 3 && x1 < CAL_BOARD.x + CAL_BOARD.size / 2 - 3 && y0 > CAL_BOARD.y - CAL_BOARD.size / 2 + 3 && y1 < CAL_BOARD.y + CAL_BOARD.size / 2 - 3, `${p} ${t.name} off the board`);
      for (const m of MARKERS) {
        const h = MARKER_MM / 2 + 4;
        assert.ok(x1 < m.x - h || x0 > m.x + h || y1 < m.y - h || y0 > m.y + h, `${p} ${t.name} on marker ${m.id}`);
      }
      L.forEach((o, j) => {
        if (j <= k || o.on === k || t.on === j) return;
        const e = E.dims(o);
        const apart = Math.abs(t.x - o.x) > (d.sx + e.sx) / 2 + 3 || Math.abs(t.y - o.y) > (d.sy + e.sy) / 2 + 3;
        assert.ok(apart, `${p} ${t.name} touches ${o.name}`);
      });
    });
  }
});
check('a piece and its bin: 투명 PET A, 유색 PET B, 종이팩 C, 캔 D — the kit\'s four bins', () => {
  assert.deepEqual(E.BIN_OF, { clear: 'A', color: 'B', pack: 'C', can: 'D' });
  for (const b of Object.values(E.BIN_OF)) assert.ok(BINS[b]);
});

console.log('① 투명 PET가 안 보인다 — 밝기로 나누기');
const L1 = E.ENERGY_ITEMS[1];
const pic1 = E.sortPicture(L1);
const m1 = L1.map((_, k) => E.measureItem(pic1, L1, k));
const board = E.boardV();
const VISION = E.ENERGY_FIXES[1] as { canV: number; clearV: number };
check('the camera reads 캔 S 13 · V 168, 투명 PET S 9 · V 216 (212 ~ 220), 유색 PET H 62, 종이팩 H 16; the empty board V 238 ~ 246', () => {
  assert.deepEqual([m1[0].s, m1[0].v], [13, 168]);
  assert.deepEqual([m1[1].s, m1[1].v, m1[1].vMin, m1[1].vMax], [9, 216, 212, 220]);
  assert.deepEqual([m1[5].vMin, m1[5].vMax], [212, 220]);
  assert.equal(m1[2].h, 62);
  assert.ok(m1[2].s >= 43);
  assert.equal(m1[4].h, 16);
  assert.ok(m1[4].s >= 43);
  assert.ok(Math.max(m1[0].vMax, m1[3].vMax) < 200, 'cans under 200');
  assert.deepEqual(board, { min: 238, max: 246 });
  near(216 / 242, 0.89, 0.005, 'clear PET passes ≈ 0.89 of the board');
});
check('the old band (200 ~ 210) finds four: both clear PET stay on the board — 4 / 6', () => {
  const r = E.runEnergy(chain, 1, E.ENERGY_DEFAULTS[1]);
  assert.equal(r.found.length, 4);
  assert.equal(r.left, 2);
  assert.equal(r.right, 4);
  assert.deepEqual(r.events.filter((e) => e.kind === 'left').map((e) => e.thing), [1, 5]);
  assert.ok(!E.scoreEnergy(1, r).pass);
  return `${r.durationS.toFixed(1)} s`;
});
check('clear PET up to 230 sorts all six; the band\'s top works from 217 to 242 (all of the PET pixels: 221 to 238) — at 243 the board joins up into one blob', () => {
  const r = E.runEnergy(chain, 1, E.ENERGY_FIXES[1]);
  assert.ok(E.scoreEnergy(1, r).pass, E.scoreEnergy(1, r).headline);
  const ok = (clearV: number, canV = 200) => {
    const f = E.findItems(pic1, { canV, clearV }, L1).found;
    return L1.every((t, k) => f.some((x) => x.k === k && x.kind === t.kind)) && f.every((x) => x.k >= 0);
  };
  const lo = [214, 215, 216, 217, 218].find((v) => ok(v));
  const hi = [238, 239, 240, 241, 242, 243, 244].filter((v) => ok(v)).pop();
  assert.equal(lo, 217);
  assert.equal(hi, 242);
  assert.ok(E.findItems(pic1, { canV: 200, clearV: 244 }, L1).tooBig >= 1, 'the board as one blob');
  // The can boundary is not the trouble: from 170 (over half a can's pixels) to 216 (under half the PET's) it holds.
  assert.ok(ok(230, 170) && ok(230, 216) && !ok(230, 168) && !ok(230, 218));
  // Each clear PET is a blob of more than 1200 px once found.
  for (const f of E.findItems(pic1, VISION, L1).found.filter((x) => x.kind === 'clear')) assert.ok(f.area > 1200, `${f.area}`);
  return `${r.durationS.toFixed(1)} s · ${E.perMinText(r)}`;
});

console.log('② 빨리 하면 떨어진다 — 처리량과 흡착');
const L2 = E.ENERGY_ITEMS[2];
check('the side limits μ(F ÷ m − g): 젖은 종이팩 0.25 × (0.39 ÷ 0.03 − 9.81) = 0.80, 음료 남은 캔 0.45 × (1.0 ÷ 0.06 − 9.81) = 3.09 m/s²; clean pieces 25 and up', () => {
  near(E.sideLimit(L2[5]), 0.8, 0.005, 'wet pack');
  near(E.sideLimit(L2[3]), 3.09, 0.005, 'full can');
  for (const k of [0, 1, 2, 4]) assert.ok(E.sideLimit(L2[k]) > 25, L2[k].name);
  near(E.sideLimit(L2[1]), 189.1, 0.05, 'PET');
  near(E.sideLimit(L2[4]), 70.1, 0.05, 'dry pack');
  near(E.carryPreview(chain, E.ENERGY_DEFAULTS[2] as Record<'can' | 'clear' | 'color' | 'pack', number>)[4].aXY, 2.5, 0.02, 'dry pack at 100');
});
check('all at 100: the wet pack and the full can come off the cup onto the plate — 4 / 6, 8.9 per minute', () => {
  const r = E.runEnergy(chain, 2, E.ENERGY_DEFAULTS[2]);
  const drops = r.events.filter((e) => e.kind === 'drop');
  assert.deepEqual(drops.map((e) => e.thing), [5, 3]);
  // The moments: the wet pack at 1.3 m/s² needs 0.45 N > 0.39, the can at 3.5 m/s² needs 1.08 N > 1.00.
  const pk = (k: number) => r.picks.find((x) => x.k === k)!;
  assert.deepEqual([pk(5).aXY, pk(5).needN, pk(3).aXY, pk(3).needN].map((x) => x.toFixed(2)), ['1.25', '0.45', '3.47', '1.08']);
  assert.ok(drops.every((e) => /키트 판 위/.test(e.text)), drops.map((e) => e.text).join(' / '));
  assert.equal(r.right, 4);
  assert.equal(r.dropped, 2);
  near(r.perMin, 8.95, 0.05, 'per minute');
  assert.ok(!E.scoreEnergy(2, r).pass);
  return `${r.durationS.toFixed(1)} s`;
});
check('acceleration goes as speed²: the wet pack\'s carry 4.41 m/s² at 100, 1.10 at 50 (× 1/4)', () => {
  const a = (s: number) => E.carryPreview(chain, { can: s, clear: s, color: s, pack: s })[5].aXY;
  near(a(100), 4.41, 0.02, '100');
  near(a(50), 1.1, 0.02, '50');
  near(a(50) / a(100), 0.25, 0.01, 'ratio');
  near(100 * Math.sqrt(0.8 / 4.41), 42.6, 0.1, 'speed for 0.80');
});
const curve = [30, 35, 40, 45, 50, 60, 70, 100].map((s) => ({ s, r: E.oneSpeed(chain, s) }));
check('one speed for all: best at 40 (11.6 per minute, nothing drops) — under the target 12; past it the wet pack drops, past 60 the can too', () => {
  const best = curve.reduce((a, b) => (b.r.perMin > a.r.perMin ? b : a));
  assert.equal(best.s, 40);
  near(best.r.perMin, 11.57, 0.05, 'best');
  assert.ok(best.r.perMin < E.TARGET_PM);
  for (const { s, r } of curve) assert.equal(r.dropped, s <= 40 ? 0 : s <= 60 ? 1 : 2, `${s}: ${r.dropped}`);
  return curve.map(({ s, r }) => `${s} → ${r.perMin.toFixed(1)}`).join(' · ');
});
check('a speed per kind (PET 100, 캔 60, 종이팩 40): nothing drops, 12.5 per minute ≥ 12', () => {
  const r = E.runEnergy(chain, 2, E.ENERGY_FIXES[2]);
  const s = E.scoreEnergy(2, r);
  assert.ok(s.pass, s.headline);
  near(r.perMin, 12.45, 0.06, 'per minute');
  const p = E.carryPreview(chain, E.ENERGY_FIXES[2] as Record<'can' | 'clear' | 'color' | 'pack', number>);
  assert.ok(p.every((x) => x.ok));
  // The margin: the can over 60 and the pack over 40 let go.
  assert.ok(E.runSpeed(chain, { can: 65, clear: 100, color: 100, pack: 40 }).dropped === 1);
  assert.ok(E.runSpeed(chain, { can: 60, clear: 100, color: 100, pack: 45 }).dropped === 1);
  return `${r.durationS.toFixed(1)} s`;
});

console.log('③ 겹쳐 놓인 쓰레기 — 위에서부터');
const L3 = E.ENERGY_ITEMS[3];
const f3 = E.findItems(E.sortPicture(L3), E.VISION_FIX, L3).found;
check('the camera sees four blobs; seen whole: 캔 1.10 and 유색 PET 1.06, cut: 종이팩 0.74 and 투명 PET 0.52 of their table area', () => {
  const vis = (k: number) => f3.find((f) => f.k === k)!.visible;
  assert.equal(f3.length, 4);
  near(vis(1), 1.1, 0.006, 'can');
  assert.equal(vis(1).toFixed(2), '1.10');
  near(vis(3), 1.06, 0.01, 'colour');
  near(vis(0), 0.74, 0.01, 'pack');
  near(vis(2), 0.52, 0.01, 'clear');
  near(E.fullArea('can'), 804, 1, 'can mm²');
  near(E.fullArea('pack'), 2400, 1, 'pack mm²');
});
check('biggest first: the pack goes up with the can on it — the can ends in C (paper); the cup then finds the board where the can was', () => {
  const r = E.runEnergy(chain, 3, E.ENERGY_DEFAULTS[3]);
  assert.equal(r.picks[0].k, 0);
  assert.deepEqual(r.picks[0].riders, [1]);
  assert.ok(r.events.some((e) => e.kind === 'wrong' && e.thing === 1 && /분류함 C/.test(e.text)));
  assert.ok(r.events.some((e) => e.kind === 'miss' && /판을 집었어요/.test(e.text)));
  assert.equal(r.wrong, 1);
  assert.equal(r.right, 3);
  assert.ok(!E.scoreEnergy(3, r).pass);
  // The cup on the pack's visible middle clears the can (its rim 10 mm, the can's 16 mm).
  const f = f3.find((x) => x.k === 0)!;
  assert.ok(Math.hypot(f.x - L3[1].x, f.y - L3[1].y) > 26);
  // The pack's carry pushes the can at 0.4 m/s², far under what slides it.
  near(r.picks[0].aXY, 0.4, 0.05, 'carry');
  // A cut blob's middle is 8 ~ 12 mm off the piece's: the cup (Ø20) still sits wholly on it.
  const off = [0, 2].map((k) => { const x = f3.find((y) => y.k === k)!; return Math.hypot(x.x - L3[k].x, x.y - L3[k].y); });
  assert.ok(off.every((d) => d > 8 && d < 12.5), `${off}`);
});
check('nearest first is worse (both lower pieces first: 2 in the wrong bin); seen whole first sorts all four', () => {
  const n = E.runOrder(chain, { order: 'near' });
  assert.equal(n.wrong, 2);
  // Pack (129 mm from the base) with the can on it, then the can's empty place, clear PET (191) with the coloured on it, then its empty place.
  assert.deepEqual(n.picks.map((x) => x.k), [0, -1, 2, -1]);
  assert.deepEqual(n.picks.map((x) => x.riders.length), [1, 0, 1, 0]);
  const near0 = f3.find((f) => f.k === 0)!;
  near(Math.hypot(near0.x, near0.y), 129, 0.5, 'pack from base');
  const near2 = f3.find((f) => f.k === 2)!;
  near(Math.hypot(near2.x, near2.y), 191, 0.5, 'clear from base');
  const r = E.runEnergy(chain, 3, E.ENERGY_FIXES[3]);
  assert.ok(E.scoreEnergy(3, r).pass, E.scoreEnergy(3, r).headline);
  assert.deepEqual(r.picks.map((x) => x.k), [1, 3, 0, 2]);
  return `${r.durationS.toFixed(1)} s`;
});
check('a rider stays on at the travel speed (60): its push stays under μ g = 3.4 m/s²', () => {
  const r = E.runEnergy(chain, 3, E.ENERGY_DEFAULTS[3]);
  assert.ok(r.picks[0].aXY < E.MU_PIECE * E.G, `${r.picks[0].aXY}`);
  near(E.MU_PIECE * E.G, 3.43, 0.01, 'μ g');
});

if (failed) {
  console.log(`\nenergy: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nenergy: all checks passed');
