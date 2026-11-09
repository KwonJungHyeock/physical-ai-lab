/**
 * 실습 셀 F (로봇 카페, 입문 트랙 ① 생활 로봇 — 미리보기 · 해 보기 · 나만의 카페 · 미션 · 운영): every
 * step's reference program runs with the rigid-body world and the café's equipment (cell/cafe.ts)
 * and passes its checks; and the mistakes each step is about fail: a wait shorter than the pour (it
 * spills), no door (no customer takes it), a second cup before the first is taken, a second menu
 * not made, a day too slow for the customers.
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
const { asksOf } = await import('../../src/engine/simulator/cell/guides');
const { narrationLines } = await import('../../src/engine/simulator/cell/narrate');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = 'adaptive' as const;
const TCP = tcpFor(EFF, false);

async function cell(mission: string) {
  const w = createCellWorld('cafe', mission, EFF);
  const reach = EFFECTOR_BY_ID[EFF].kind === 'grip' ? Math.max(0, TCP - 40) : TCP;
  const phys = await createPhysics(chain, reach, w.objects.map(objectSpec), cellSolids(w.cell!), w.angles, CELL_ENV);
  const DT = 1 / 60;
  // 미리보기: did each question's moment come (the scene holds there for it)?
  const asks = asksOf(mission);
  const asked = asks.map(() => false);
  const frame = () => {
    stepCell(w, phys, DT, chain, TCP);
    asks.forEach((a, k) => {
      if (!asked[k] && a.at(w.cell!, w)) asked[k] = true;
    });
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
  return { w, run, log, asked };
}

type World = Awaited<ReturnType<typeof cell>>['w'];
const summary = (w: World) => (cellChecks(w)?.items ?? []).map((i) => `${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ');
const alertsOf = (w: World) => [...new Set(w.cell!.alerts.map((a) => `[${a.level}] ${a.title}`))].join(', ');
const allOk = (w: World) => (cellChecks(w)?.items ?? []).every((i) => i.ok);

const { cafeProgram, newRecipe, MENU_PRESETS } = await import('../../src/engine/simulator/cell/cafeMenu');
const { ICED_AMERICANO } = await import('../../src/engine/simulator/cell/cafe');
type Recipe = ReturnType<typeof newRecipe>;

for (const m of missionsOf('cafe')) {
  const t0 = Date.now();
  const { w, run, log, asked } = await cell(m.id);
  const err = await run(m.solution!);
  // 주문 한 잔 따라가기: the lines said over the scene, in order (narrate.ts).
  const said = narrationLines(w.cell!).map((n) => n.signal);
  if (m.id === 'F1') {
    // The order is told from the kiosk on, each machine's signals in the order they happen, the hand-over last.
    const want = ['주문 1', '컵 내리기', '컵 준비됨', '얼음', '얼음 끝', '추출 시작', '추출 중', '추출 끝', '물', '물 끝', '픽업 문', '손 감지', '문 닫힘'];
    let k = 0;
    for (const x of said) if (x === want[k]) k += 1;
    assert.ok(k === want.length && said[0] === '주문 1', `F1 narration: ${said.join(' · ')}`);
    console.log(`  ok   F1 주문 한 잔 따라가기: ${said.length} lines · ${said[0]} … ${said[said.length - 1]}`);
  }
  assert.ok(!err && allOk(w), `${m.id} ${m.title}: ${err ? (err as Error).message : ''} | ${summary(w)} | ${alertsOf(w)} | ${log.slice(-6).join(' / ')}`);
  assert.ok(asked.every(Boolean), `${m.id}: a question's moment never came: ${JSON.stringify(asked)}`);
  const el = w.cell!.startT === null ? 0 : w.cell!.endT! - w.cell!.startT;
  console.log(`  ok   ${m.id} ${m.title}: ${summary(w)}  [${el.toFixed(0)} s cell · ${((Date.now() - t0) / 1000).toFixed(1)} s]`);
}

/** A step run with other cards (the student's); it must not pass. */
async function fails(id: string, recipes: Recipe[], orders: number, why: string, alert?: string) {
  const { w, run } = await cell(id);
  const err = await run(cafeProgram(recipes, orders).code);
  assert.ok(err || !allOk(w), `${id} ${why}: passed anyway | ${summary(w)}`);
  if (alert) assert.ok(w.cell!.alerts.some((a) => a.title.includes(alert)), `${id} ${why}: no '${alert}' alert | ${alertsOf(w)}`);
  console.log(`  ok   ${id} ${why}: ${err ? (err as Error).message : summary(w)}`);
  return w;
}
const shortShot = (door: boolean, s: number, menu = ICED_AMERICANO): Recipe => ({ ...newRecipe(menu, door), waits: { ice: { k: 'signal' }, shot: { k: 'sec', s }, water: { k: 'signal' } } });
/** 나만의 카페: a menu of the student's own (one thing changed from the iced americano). */
const MINE = { ...ICED_AMERICANO, name: '내 아이스 아메리카노' };
const HOT = MENU_PRESETS[2];

await fails('F4', [shortShot(false, 10)], 1, 'shot waited 10 s (28 s pour)', '컵이 빠졌어요');
{
  // Waiting long enough by the clock is fine (slower than the signal).
  const { w, run } = await cell('F4');
  const err = await run(cafeProgram([shortShot(false, 30, MINE)], 1).code);
  assert.ok(!err && allOk(w), `F4 shot waited 30 s should pass | ${summary(w)}`);
  console.log(`  ok   F4 shot waited 30 s passes: ${summary(w)}`);
}
await fails('F4', [newRecipe(ICED_AMERICANO, false)], 1, 'the iced americano as it is: not a menu of my own');
// 블록 순서: the cup after a pour (nothing to pour into) or the hand-over before the coffee fail; the pours among themselves may go in any order.
await fails('F4', [{ ...newRecipe(MINE, false), order: ['ice', 'cup', 'shot', 'water', 'serve'] }], 1, 'block order: ice before the cup');
await fails('F4', [{ ...newRecipe(MINE, false), order: ['cup', 'ice', 'serve', 'shot', 'water'] }], 1, 'block order: served before the coffee');
{
  const { w, run } = await cell('F4');
  const err = await run(cafeProgram([{ ...newRecipe(MINE, false), order: ['cup', 'water', 'shot', 'ice', 'serve'] }], 1).code);
  assert.ok(!err && allOk(w), `F4 water · shot · ice still makes the drink | ${summary(w)}`);
  console.log('  ok   F4 block order: water · shot · ice (cup first, serve last) passes');
}
await fails('F5', [newRecipe(ICED_AMERICANO, false)], 1, 'no door: nobody takes it');
await fails('F6', [newRecipe(ICED_AMERICANO, true)], 1, 'repeat once for two orders: one customer goes without');
await fails('F6', [newRecipe(ICED_AMERICANO, false)], 2, 'two cups, no door');
await fails('F7', [newRecipe(ICED_AMERICANO, true)], 2, 'menu 2 never made');
await fails('F8', [shortShot(true, 60)], 10, 'a day too slow (60 s at the shot)', '손님이 기다리다 갔어요');

// The program: menus registered, one branch per menu, the loop's break at the day's end.
{
  const { code, lines } = cafeProgram([newRecipe(ICED_AMERICANO, true), newRecipe(HOT, true)], 3);
  assert.ok(code.includes('cell.menu(2, "따뜻한 아메리카노", 0, 2, 200, True)') && code.includes('if cell.is_on("주문 2"):') && code.includes('cell.amount("온수", 200)'), 'menus and branches');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].length, 4, 'hot americano: cup · shot · water · serve');
  const steps = G.parse(code).steps;
  assert.equal(G.serialize(steps), code, 'round-trip');
}

console.log('cell F: ok');

{
  // 신호 관제판: every signal of the café is on its board once, under its machine.
  const { CAFE_BOARD } = await import('../../src/engine/simulator/cell/narrate');
  const { cellLayout } = await import('../../src/engine/simulator/cell/cells');
  const l = cellLayout('cafe');
  const ins = CAFE_BOARD.flatMap((b) => b.ins);
  const outs = CAFE_BOARD.flatMap((b) => b.outs);
  assert.deepEqual([...ins].sort(), [...l.inputs].sort(), 'board inputs = the café inputs');
  assert.deepEqual([...outs].sort(), [...l.outputs].sort(), 'board outputs = the café outputs');
  console.log(`  ok   신호 관제판: ${CAFE_BOARD.length} machines · ${ins.length} inputs · ${outs.length} outputs`);
}
