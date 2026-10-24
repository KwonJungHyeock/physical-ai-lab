/**
 * 실습 셀 C (검사 · 불량 배출): every ladder step's reference program runs with the rigid-body world,
 * the dispenser, the belt, the stopper and the ejector, and passes its checks; and the mistakes each
 * step is about fail: no condition (every part sent on), the metal sensor ignored, the stopper left
 * up (by hand), the counter never reset, no lamp. Also the language the steps bring: if / elif /
 * else, number boxes, break, at any depth.
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

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = 'adaptive' as const;
const TCP = tcpFor(EFF, false);

async function cell(mission: string) {
  const w = createCellWorld('inspect', mission, EFF);
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
    const c = G.check(steps, { theme: 'arm', cell: 'inspect', effector: EFF, cameraFlange: false, poses: {} });
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

// The language: nested blocks round-trip, elif chains, the checks before running.
{
  const code = 'from edu import robot, cell\n\nn = 0\nfor _ in range(2):\n    if cell.is_on("금속"):\n        n += 1\n    elif n >= 2:\n        for _ in range(3):\n            break\n    else:\n        n = 0\n';
  const { steps, errors } = G.parse(code);
  assert.deepEqual(errors, []);
  assert.equal(G.serialize(steps), code, 'nested if / elif / else / for round-trip');
  const bad = G.check(G.parse('from edu import robot, cell\n\nif cell.is_on("없는 신호"):\n    break\nif m > 2:\n    m += 1\ncell.send()\n').steps, { theme: 'arm', cell: 'feed', effector: EFF, cameraFlange: false, poses: {} });
  assert.equal(bad.errors.length, 5, JSON.stringify(bad.errors));
  const indent = G.parse('from edu import robot, cell\n\nif cell.is_on("금속"):\nrobot.home()\nelse:\n    robot.home()\n').errors;
  assert.ok(indent.length >= 1, JSON.stringify(indent));
  console.log(`  ok   language: ${bad.errors.map((e) => e.msg).join(' | ')} | ${indent.map((e) => e.msg).join(' | ')}`);
}

for (const m of missionsOf('inspect')) {
  const t0 = Date.now();
  const { w, run, log } = await cell(m.id);
  const err = await run(m.solution!);
  assert.ok(!err && allOk(w), `${m.id} ${m.title}: ${err ? (err as Error).message : ''} | ${summary(w)} | ${alertsOf(w)} | ${log.slice(-6).join(' / ')}`);
  const el = w.cell!.startT === null ? 0 : w.cell!.endT! - w.cell!.startT;
  console.log(`  ok   ${m.id} ${m.title}: ${summary(w)}  [${el.toFixed(0)} s cell · ${((Date.now() - t0) / 1000).toFixed(1)} s]`);
}

/** A step's reference program changed by `edit`; it must not pass. */
async function fails(id: string, edit: (code: string) => string, why: string) {
  const { w, run } = await cell(id);
  const code = edit(missionById(id)!.solution!);
  assert.notEqual(code, missionById(id)!.solution, `${id} ${why}: the edit changed nothing`);
  const err = await run(code);
  assert.ok(err || !allOk(w), `${id} ${why}: passed anyway | ${summary(w)}`);
  console.log(`  ok   ${id} ${why}: ${err ? (err as Error).message : summary(w)}`);
}

await fails('C3', () => 'from edu import robot, cell\n\nrobot.home()\nfor _ in range(4):\n    cell.feed()\n    cell.send()\n    robot.pick("스토퍼 앞")\n    robot.place("양품 트레이 다음 칸")\nrobot.home()\n', 'without a condition');
await fails('C4', (c) => c.replace('        if cell.is_on("금속"):\n            robot.place("양품 트레이 다음 칸")\n        else:\n            robot.place("비금속 트레이 다음 칸")\n', '        robot.place("양품 트레이 다음 칸")\n'), 'metal sensor ignored');
await fails('C5', (c) => c.replace('cell.set("스토퍼", True)\n', ''), 'stopper left up');
await fails('C6', (c) => c.replace('        bad = 0\n', ''), 'counter never reset');
await fails('C6', (c) => c.replace('            cell.set("경광등", True)\n', ''), 'no lamp');

console.log('cell C: ok');
