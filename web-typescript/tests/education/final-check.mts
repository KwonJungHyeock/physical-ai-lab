/**
 * 대단원 마무리 평가 (engine/education/lab/final.ts): every item's program as it is (last time's fix)
 * fails in the new situation, the worked new values pass, the numbers the items quote hold, and the
 * scoring adds up.
 *
 * Run with: npm run check:final
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const F = await import('../../src/engine/education/lab/final');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));
let failed = 0;
const check = async (name: string, fn: () => Promise<string | void> | string | void) => {
  try {
    const note = await fn();
    console.log(`  ✓ ${name}${note ? ` (${note})` : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
};

/** The worked fix of each item, and a near-miss that must still fail. */
const FIX: Record<string, { fix: Record<string, unknown>; off?: Record<string, unknown> }> = {
  factory: { fix: { delayMs: 1940 }, off: { delayMs: 1690 } },
  logistics: { fix: { x: 170, y: -166 }, off: { x: 160, y: -171 } },
  bio: { fix: { zero: 0.6 }, off: { zero: 1 } },
  farm: { fix: { ratio: 0.94 }, off: { ratio: 0.83 } },
  cafe: { fix: { detect: 115 }, off: { detect: 100 } },
  ai: { fix: { height: 45 }, off: { height: 45, parallax: false } },
};

console.log('대단원 마무리 평가 — 새 숫자');
for (const item of F.FINAL_ITEMS) {
  await check(`${item.site}: 지난번 값 그대로는 실패, 새로 계산한 값은 통과`, async () => {
    const before = await F.runFinal(chain, item, item.start);
    assert.ok(!before.pass, `as it is passed: ${before.headline}`);
    const off = await F.runFinal(chain, item, { ...item.start, ...FIX[item.id].off });
    assert.ok(!off.pass, `near miss passed: ${off.headline}`);
    const after = await F.runFinal(chain, item, { ...item.start, ...FIX[item.id].fix });
    assert.ok(after.pass, `fix failed: ${after.headline}`);
    assert.equal(item.causes.filter((c) => c.ok).length, 1);
    return `${before.headline} → ${after.headline}`;
  });
}

await check('the numbers the items quote', () => {
  const n = F.FINAL_NUMBERS;
  const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
  const calc = (id: string, k: number) => F.FINAL_ITEM.get(id)!.calc.fields[k].answer;
  near(n.factoryArrivalS, calc('factory', 0), 1e-9, 'arrival');
  near(n.logisticsRef[0], calc('logistics', 0), 1e-9, 'ref x');
  near(n.logisticsRef[1], calc('logistics', 1), 1e-9, 'ref y');
  near(n.bioRad, 1.57 / 150, 0.0001, 'bio rad');
  near(n.farmRatio, calc('farm', 0), 0.006, 'ratio');
  near(n.cafeS, calc('cafe', 0), 0.5, 'S');
  near(n.aiParallax, calc('ai', 0), 0.05, 'parallax');
  near(n.aiK, calc('ai', 1), 0.001, 'k');
  return `S ${n.cafeS.toFixed(1)} mm · 시차 ${n.aiParallax.toFixed(2)} mm · 비율 ${n.farmRatio.toFixed(3)}`;
});

await check('scoring: 원인 4/2/0 · 계산 3/1/0 · 고치기 3 · 힌트 −1', () => {
  const it = F.FINAL_ITEMS[0];
  const right = it.causes.findIndex((c) => c.ok);
  const wrong = right === 0 ? 1 : 0;
  const best = F.scoreItem(it, { ...F.freshRecord(), picks: [right], calcChecks: [true], pass: true });
  assert.equal(best.total, 10);
  const mid = F.scoreItem(it, { ...F.freshRecord(), picks: [wrong, right], calcChecks: [false, true], pass: true, hints: 1 });
  assert.equal(mid.total, 2 + 1 + 3 - 1);
  const all = Object.fromEntries(F.FINAL_ITEMS.map((x) => [x.id, { ...F.freshRecord(), picks: [x.causes.findIndex((c) => c.ok)], calcChecks: [true], pass: true }]));
  const s = F.scoreFinal(all);
  assert.equal(s.score, 100);
  assert.equal(s.grade, 'A');
  return `만점 ${s.points}/${s.of} → ${s.score}`;
});

if (failed) {
  console.log(`final: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('final: all checks passed');
