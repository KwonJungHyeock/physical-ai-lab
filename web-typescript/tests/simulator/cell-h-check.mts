/**
 * 실습 셀 H (보드게임 로봇, 입문 트랙 ① 생활 로봇): every step's reference program (made from its
 * answer cards) runs with the board (cell/board.ts) and passes its checks; and each step's start
 * cards — the mistakes the step is about — fail: 15 mm between the lines on a 16 mm board (the stone
 * off its point), not waiting for the turn (the arm over the board while the person's hand is
 * there), and a rule that does not block ('빈 칸', '잇기만': the person makes five first).
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
const { tcpFor } = await import('../../src/engine/simulator/effectors');
const { objectSpec } = await import('../../src/engine/simulator/deskPhysics');
const G = await import('../../src/engine/simulator/program');
const { CELL_ENV, cellChecks, cellSolids, stepCell } = await import('../../src/engine/simulator/cell/run');
const { missionsOf, missionById } = await import('../../src/engine/simulator/cell/missions');
const { guideOf, predictNow } = await import('../../src/engine/simulator/cell/guides');
const { CELL_BY_ID } = await import('../../src/engine/simulator/cell/cells');
const { H_ANSWER, H_START, boardCode } = await import('../../src/engine/simulator/cell/boardRecipe');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = CELL_BY_ID.board.effector!;
assert.equal(EFF, 'pump', 'H is worked with the suction pump');
const TCP = tcpFor(EFF, false);

async function cell(mission: string) {
  const w = createCellWorld('board', mission, EFF);
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
      cell: 'board',
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

type World = Awaited<ReturnType<typeof cell>>['w'];
const summary = (w: World) => (cellChecks(w)?.items ?? []).map((i) => `${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ');
const alertsOf = (w: World) => w.cell!.alerts.map((a) => `[${a.level}] ${a.title}`).join(', ');
const allOk = (w: World) => (cellChecks(w)?.items ?? []).every((i) => i.ok);
const moves = (w: World) => w.cell!.board!.stones.map((s) => `${s.who === 1 ? 'B' : 'W'}${s.p.c},${s.p.r}`).join(' ');

for (const m of missionsOf('board')) {
  const t0 = Date.now();
  assert.equal(boardCode(H_ANSWER[m.id]).code, m.solution, `${m.id}: the answer cards are the reference program`);
  const { w, run, log } = await cell(m.id);
  const err = await run(m.solution!);
  assert.ok(!err && allOk(w), `${m.id} ${m.title}: ${err ? (err as Error).message : ''} | ${summary(w)} | ${alertsOf(w)} | ${moves(w)} | ${log.slice(-6).join(' / ')}`);
  const g = guideOf(m.id);
  assert.ok(g && g.predict && g.predict.answer < g.predict.options.length && g.observe.length >= 2, `${m.id}: a step guide (예측 · 관찰 2개 이상 · 개념)`);
  const unseen = g.observe.filter((o) => w.cell!.observed[o.id] === undefined).map((o) => o.id);
  assert.deepEqual(unseen, [], `${m.id}: moments to observe that the reference run never showed`);
  const el = w.cell!.startT === null ? 0 : w.cell!.endT! - w.cell!.startT;
  console.log(`  ok   ${m.id} ${m.title}: ${summary(w)}  [${moves(w)}] [${el.toFixed(0)} s cell · ${((Date.now() - t0) / 1000).toFixed(1)} s]`);
}

/** A step's start cards (H2 … H4): they must not pass. */
for (const id of ['H1', 'H2', 'H3', 'H4']) {
  const { w, run, asked } = await cell(id);
  const err = await run(boardCode(H_START[id]).code);
  // The 예측 is asked on the first run, which is on the start cards: its moment must come there.
  assert.ok(asked.at, `${id}: the 예측's moment never came on the start cards`);
  if (id.endsWith('1')) continue;
  assert.ok(err || !allOk(w), `${id} start cards passed anyway | ${summary(w)}`);
  console.log(`  ok   ${id} start cards fail: ${err ? (err as Error).message : summary(w)}  [${moves(w)}]`);
}

// H4's blocks in other orders: 잇기 above 막기 loses; 막기 above 이기기 has not won in 9 moves. The order is the lesson.
for (const order of [
  ['이기기', '잇기', '막기'],
  ['막기', '이기기', '잇기'],
] as const) {
  const { w, run } = await cell('H4');
  const code = boardCode({ ...H_ANSWER.H4, cards: H_ANSWER.H4.cards.map((c) => (c.k === 'move' ? { ...c, order: [...order] } : c)) }).code;
  const err = await run(code);
  assert.ok(!allOk(w), `H4 ${order.join(' → ')} should not pass | ${err ? (err as Error).message : ''} | ${moves(w)}`);
  console.log(`  ok   H4 ${order.join(' → ')}: ${w.cell!.board!.winner === 1 ? '사람 승' : '9수 안에 못 이김'}  [${moves(w)}]`);
}

{
  const { lines, rows } = boardCode(H_ANSWER.H1);
  assert.deepEqual(lines[0], [0, -1], 'a setting card makes no line');
  assert.deepEqual(rows[1][0], [4, 4], `the wait row's line: ${JSON.stringify(rows)}`);
  // The wait switched off makes no line (H3's start).
  assert.deepEqual(boardCode(H_START.H3).rows[1][0], [0, -1], 'the wait off spans nothing');
}

console.log('cell H: ok');
