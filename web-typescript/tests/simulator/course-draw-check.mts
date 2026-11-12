/**
 * 입문 과정 4장 (courseDraw.ts): each 절's drawing runs on the 글씨 부스 mat and reads as it should —
 * 4-2 the joint move bows and the straight move keeps within 1 mm of A–B; 4-3 the triangle and the
 * square pass (any start, either way round) and a wrong corner does not; 4-4 eight points stray more
 * than twenty-four, which keep within the pass mark; the 4장 미션's star passes and its outline does not.
 *
 * Run with: npm run check:coursedraw
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { createPhysics } = await import('../../src/engine/physics/physics');
const { createCellWorld, runProgram } = await import('../../src/engine/simulator/sim');
const { tcpFor } = await import('../../src/engine/simulator/effectors');
const { objectSpec } = await import('../../src/engine/simulator/deskPhysics');
const G = await import('../../src/engine/simulator/program');
const { CELL_ENV, cellSolids, stepCell } = await import('../../src/engine/simulator/cell/run');
const { predictNow } = await import('../../src/engine/simulator/cell/guides');
const { CELL_BY_ID } = await import('../../src/engine/simulator/cell/cells');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = CELL_BY_ID.draw.effector!;
assert.equal(EFF, 'pen', 'G is worked with the pen holder');
const TCP = tcpFor(EFF, false);

async function cell(mission: string) {
  const w = createCellWorld('draw', mission, EFF);
  const phys = await createPhysics(chain, TCP, w.objects.map(objectSpec), cellSolids(w.cell!), w.angles, CELL_ENV);
  const DT = 1 / 60;
  // 퀘스트 모드: did the step's moment to ask the 예측 come (the scene holds there for it)?
  const asked = { at: false };
  const frame = () => {
    stepCell(w, phys, DT, chain, TCP);
    if (!asked.at && predictNow(w.cell!, w)) asked.at = true;
  };
  for (let k = 0; k < 30; k += 1) frame();
  const animate = async (d: number, f: (t: number) => void) => {
    const n = Math.max(1, Math.round(d / DT));
    for (let k = 1; k <= n; k += 1) {
      f((d * k) / n);
      frame();
    }
  };
  const log: string[] = [];
  const run = async (code: string) => {
    const { steps, errors } = G.parse(code);
    assert.deepEqual(errors, [], `parse: ${JSON.stringify(errors)}`);
    const c = G.check(steps, {
      theme: 'arm',
      cell: 'draw',
      effector: EFF,
      cameraFlange: false,
      poses: {},
    });
    assert.deepEqual(c.errors, [], `check: ${JSON.stringify(c.errors)}`);
    assert.equal(G.serialize(steps), code, 'blocks and text round-trip');
    let err: unknown = null;
    try {
      await runProgram(steps, {
        chain,
        world: w,
        poses: {},
        animate,
        see: async () => null,
        log: (_k, m) => log.push(m),
      });
    } catch (e) {
      err = e;
    }
    w.cell!.endT = w.cell!.line.t;
    for (let k = 0; k < 90; k += 1) frame();
    return err;
  };
  return { w, run, log, asked };
}

const D = await import('../../src/engine/simulator/cell/courseDraw');
const draw = async (code: string) => {
  const { w, run } = await cell('G1');
  const err = await run(code);
  assert.equal(err, null, `runs to its end: ${err ? (err as Error).message : ''}`);
  return w.trail;
};

// 4-2: the same two points, a joint move (bowed) and a straight one (within 1 mm).
const joint = D.lineReport(await draw(D.pathCode([D.LINE_A, D.LINE_B], { linear: false, close: false })));
const straight = D.lineReport(await draw(D.pathCode([D.LINE_A, D.LINE_B], { linear: true, close: false })));
assert.ok(joint.drawn && joint.ends && joint.maxDev > 5, `4-2 관절 이동은 휘어요: ${joint.maxDev} mm`);
assert.ok(straight.drawn && straight.ends && straight.maxDev <= D.TOL.line, `4-2 직선 이동은 곧아요: ${straight.maxDev} mm`);
console.log(`  ok   4-2 관절 이동 ${joint.maxDev} mm · 직선 이동 ${straight.maxDev} mm (A–B에서 가장 먼 곳)`);

// 4-3: the triangle and the square; typed from another corner, the other way round, still the same shape.
for (const [name, ring] of [
  ['세모', D.TRIANGLE],
  ['네모', D.SQUARE],
] as const) {
  const r = D.shapeReport(await draw(D.pathCode(ring, { linear: true, close: true })), ring);
  assert.ok(r.ok, `4-3 ${name}: ${JSON.stringify(r.items)}`);
  const turned = [...ring.slice(1), ring[0]].reverse();
  assert.ok(D.sameShape(turned, ring), `4-3 ${name}: another start, the other way round`);
  console.log(`  ok   4-3 ${name}: ${r.items.map((i) => i.detail ?? i.label).join(' · ')}`);
}
const off: [number, number][] = [
  [160, -50],
  [240, -50],
  [200, 30],
];
assert.ok(!D.sameShape(off, D.TRIANGLE), '4-3: a corner 10 mm off is another shape');

// 4-4: 8 points stray more than 24; 24 keep within the pass mark, closed.
const c8 = D.circleReport(await draw(D.pathCode(D.circlePoints(D.CIRCLE, 8), { linear: true, close: true })), D.CIRCLE);
const c24 = D.circleReport(await draw(D.pathCode(D.circlePoints(D.CIRCLE, 24), { linear: true, close: true })), D.CIRCLE);
assert.ok(c8.closed && c24.closed && c8.maxDev > c24.maxDev && c8.maxDev > 2, `4-4: 8개 ${c8.maxDev} mm > 24개 ${c24.maxDev} mm`);
assert.ok(c24.maxDev <= D.TOL.circle24, `4-4: 24개 ${c24.maxDev} mm ≤ ${D.TOL.circle24} mm`);
assert.ok(D.circleRight(D.CIRCLE) && !D.circleRight({ x: 200, y: -10, r: 35 }), '4-4: the centre and radius asked');
console.log(`  ok   4-4 원과 가장 많이 벗어난 거리: 점 8개 ${c8.maxDev} mm · 24개 ${c24.maxDev} mm`);

// 4장 미션: the star in one stroke (any start, either way round); the outline is not a star.
const S = D.STAR;
const star = [S[0], S[3], S[1], S[4], S[2]];
assert.ok(D.isStarOrder(star) && D.isStarOrder([...star].reverse()) && D.isStarOrder([...star.slice(2), ...star.slice(0, 2)]), '4장 미션: the star, any start, either way');
assert.ok(!D.isStarOrder(S), '4장 미션: the outline (next corner each time) is not a star');
const sr = D.shapeReport(await draw(D.pathCode(star, { linear: true, close: true })), star);
assert.ok(sr.ok, `4장 미션 별: ${JSON.stringify(sr.items)}`);
console.log(`  ok   4장 미션 별: ${sr.items.map((i) => i.detail ?? i.label).join(' · ')}`);
console.log('입문 4장 그리기: 통과');
