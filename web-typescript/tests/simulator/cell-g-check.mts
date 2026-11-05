/**
 * 실습 셀 G (로봇 캘리그라피, 입문 트랙 ① 생활 로봇): every step's reference program (made from its
 * answer cards) runs with the booth (cell/draw.ts) and passes its checks; and each step's start
 * cards — the mistakes the step is about — fail: the pen 3 mm up and the usual corner on a card
 * put elsewhere (no line, off the card), joint moves (bent sides), the pen down between strokes
 * (lines between letters), and reaching over the card while the customer's hand is there.
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
const { G_ANSWER, G_START, drawCode } = await import('../../src/engine/simulator/cell/drawRecipe');

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

type World = Awaited<ReturnType<typeof cell>>['w'];
const summary = (w: World) => (cellChecks(w)?.items ?? []).map((i) => `${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ');
const alertsOf = (w: World) => w.cell!.alerts.map((a) => `[${a.level}] ${a.title}`).join(', ');
const allOk = (w: World) => (cellChecks(w)?.items ?? []).every((i) => i.ok);

for (const m of missionsOf('draw')) {
  const t0 = Date.now();
  assert.equal(drawCode(G_ANSWER[m.id]).code, m.solution, `${m.id}: the answer cards are the reference program`);
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

/** A step's start cards (G2 … G4): they must not pass. */
for (const id of ['G1', 'G2', 'G3', 'G4']) {
  const { w, run, asked } = await cell(id);
  const err = await run(drawCode(G_START[id]).code);
  // The 예측 is asked on the first run, which is on the start cards: its moment must come there.
  assert.ok(asked.at, `${id}: the 예측's moment never came on the start cards`);
  if (id.endsWith('1')) continue;
  assert.ok(err || !allOk(w), `${id} start cards passed anyway | ${summary(w)}`);
  console.log(`  ok   ${id} start cards fail: ${err ? (err as Error).message : summary(w)}`);
}

// Over the card while the customer reaches in to take it: an interlock stop.
{
  const { w, run } = await cell('G1');
  const code = missionById('G1')!.solution!.replace('cell.wait("카드 있음", False)\n', 'robot.move_to(190, 0, 20)\ncell.wait("카드 있음", False)\n');
  const err = await run(code);
  assert.ok(err && w.cell!.alerts.some((a) => a.kind === 'safety'), `G1 over the card while it is taken: no stop | ${alertsOf(w)}`);
  console.log(`  ok   G1 over the card while it is taken: ${(err as Error).message}`);
}

{
  const { lines, rows } = drawCode(G_ANSWER.G1);
  assert.deepEqual(lines[0], [4, 4], `wait card line: ${JSON.stringify(lines)}`);
  assert.deepEqual(lines[1], [0, -1], 'a setting card makes no line');
  assert.deepEqual(rows[2][1], [0, -1], 'a switch row makes no line');
}

console.log('cell G: ok');
