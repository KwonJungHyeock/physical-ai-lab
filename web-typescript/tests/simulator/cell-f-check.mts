/**
 * 실습 셀 F (로봇 카페, 입문 트랙 ① 생활 로봇): every step's reference program runs with the
 * rigid-body world and the café's equipment (cell/cafe.ts) and passes its checks; and the mistakes
 * each step is about fail: taking the cup before 추출 끝 (the rest spills), starting a station with
 * no cup, pressing the ice twice (the cup overflows), reaching into the pickup with its door open.
 *
 * Run with: npm run check:cell
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { createPhysics } = await import('../../src/engine/physics/physics');
const { createCellWorld, runProgram } = await import('../../src/engine/simulator/sim');
const { tcpFor, EFFECTOR_BY_ID } = await import('../../src/engine/simulator/effectors');
const { objectSpec } = await import('../../src/engine/simulator/deskPhysics');
const G = await import('../../src/engine/simulator/program');
const { CELL_ENV, cellChecks, cellSolids, stepCell } = await import('../../src/engine/simulator/cell/run');
const { missionsOf, missionById } = await import('../../src/engine/simulator/cell/missions');
const { guideOf } = await import('../../src/engine/simulator/cell/guides');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = 'adaptive' as const;
const TCP = tcpFor(EFF, false);

async function cell(mission: string) {
  const w = createCellWorld('cafe', mission, EFF);
  const reach = EFFECTOR_BY_ID[EFF].kind === 'grip' ? Math.max(0, TCP - 40) : TCP;
  const phys = await createPhysics(chain, reach, w.objects.map(objectSpec), cellSolids(w.cell!), w.angles, CELL_ENV);
  const DT = 1 / 60;
  const frame = () => stepCell(w, phys, DT, chain, TCP);
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
    const c = G.check(steps, { theme: 'arm', cell: 'cafe', effector: EFF, cameraFlange: false, poses: {} });
    assert.deepEqual(c.errors, [], `check: ${JSON.stringify(c.errors)}`);
    assert.equal(G.serialize(steps), code, 'blocks and text round-trip');
    let err: unknown = null;
    try {
      await runProgram(steps, { chain, world: w, poses: {}, animate, see: async () => null, log: (_k, m) => log.push(m) });
    } catch (e) {
      err = e;
    }
    w.cell!.endT = w.cell!.line.t;
    for (let k = 0; k < 90; k += 1) frame();
    return err;
  };
  return { w, run, log };
}

type World = Awaited<ReturnType<typeof cell>>['w'];
const summary = (w: World) => (cellChecks(w)?.items ?? []).map((i) => `${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ');
const alertsOf = (w: World) => w.cell!.alerts.map((a) => `[${a.level}] ${a.title}`).join(', ');
const allOk = (w: World) => (cellChecks(w)?.items ?? []).every((i) => i.ok);

for (const m of missionsOf('cafe')) {
  const t0 = Date.now();
  const { w, run, log } = await cell(m.id);
  const err = await run(m.solution!);
  assert.ok(!err && allOk(w), `${m.id} ${m.title}: ${err ? (err as Error).message : ''} | ${summary(w)} | ${alertsOf(w)} | ${log.slice(-6).join(' / ')}`);
  // 단계 안내: the step's guide is there, its answer is one of its options, and the reference run shows every moment it points to.
  const g = guideOf(m.id);
  assert.ok(g && g.predict.answer < g.predict.options.length && g.observe.length >= 2, `${m.id}: a step guide (예측 · 관찰 2개 이상 · 개념)`);
  const unseen = g.observe.filter((o) => w.cell!.observed[o.id] === undefined).map((o) => o.id);
  assert.deepEqual(unseen, [], `${m.id}: moments to observe that the reference run never showed`);
  const el = w.cell!.startT === null ? 0 : w.cell!.endT! - w.cell!.startT;
  console.log(`  ok   ${m.id} ${m.title}: ${summary(w)}  [${el.toFixed(0)} s cell · ${((Date.now() - t0) / 1000).toFixed(1)} s]`);
}

/** A step's reference program changed by `edit`; it must not pass. */
async function fails(id: string, edit: (code: string) => string, why: string, alert?: string) {
  const { w, run } = await cell(id);
  const code = edit(missionById(id)!.solution!);
  assert.notEqual(code, missionById(id)!.solution, `${id} ${why}: the edit changed nothing`);
  const err = await run(code);
  assert.ok(err || !allOk(w), `${id} ${why}: passed anyway | ${summary(w)}`);
  if (alert) assert.ok(w.cell!.alerts.some((a) => a.title.includes(alert)), `${id} ${why}: no '${alert}' alert | ${alertsOf(w)}`);
  console.log(`  ok   ${id} ${why}: ${err ? (err as Error).message : summary(w)} | ${alertsOf(w)}`);
}

await fails('F3', (c) => c.replace('cell.wait("추출 끝")\n', 'robot.wait(5)\n'), 'cup taken before 추출 끝', '컵이 빠졌어요');
await fails('F2', (c) => c.replace('robot.home()\ncell.set', 'robot.home()\ncell.set("얼음", True)\nrobot.wait(4)\ncell.set("얼음", False)\ncell.set'), 'ice with no cup', '컵이 없어요');
await fails('F4', (c) => c.replace('cell.set("물", False)\n', 'cell.set("물", False)\nrobot.wait(0.5)\ncell.set("물", True)\ncell.wait("물 나오는 중")\ncell.wait("물 끝")\ncell.set("물", False)\n'), 'water twice', '넘쳤어요');
await fails('F5', (c) => c.replace('robot.place("픽업 1")\nrobot.home()\ncell.set("픽업 문", True)\ncell.wait("문 열림")\n', 'cell.set("픽업 문", True)\ncell.wait("문 열림")\nrobot.place("픽업 1")\nrobot.home()\n'), 'into the open pickup', '픽업 문');

// 작업 순서 카드 (입문 트랙): each step's answer cards make a program that passes; F3's start (the shot
// not waited for) fails, and its answer is the same program as the reference solution.
const { RECIPE_ANSWER, RECIPE_START, recipeCode } = await import('../../src/engine/simulator/cell/cafeRecipe');
for (const m of missionsOf('cafe')) {
  const { w, run } = await cell(m.id);
  const { code } = recipeCode(RECIPE_ANSWER[m.id]);
  const err = await run(code);
  assert.ok(!err && allOk(w), `${m.id} answer cards: ${err ? (err as Error).message : ''} | ${summary(w)}`);
  console.log(`  ok   ${m.id} answer cards: ${summary(w)}`);
}
assert.equal(recipeCode(RECIPE_ANSWER.F3).code, missionById('F3')!.solution, 'F3 cards = the reference program');
{
  const { w, run } = await cell('F3');
  const err = await run(recipeCode(RECIPE_START.F3).code);
  assert.ok(err || !allOk(w), `F3 start cards passed anyway | ${summary(w)}`);
  console.log(`  ok   F3 start cards (shot not waited for) fail: ${summary(w)}`);
}
{
  const { lines } = recipeCode({ cards: RECIPE_ANSWER.F2.cards, times: 2 });
  assert.deepEqual(lines[0], [5, 8], `card lines in a loop: ${JSON.stringify(lines)}`);
}

console.log('cell F: ok');
