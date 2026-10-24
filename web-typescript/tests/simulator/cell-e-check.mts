/**
 * 실습 셀 E (조립 · 삽입): every ladder step's reference program runs with the rigid-body world, the
 * feeder, the clamp and the belt, and passes its checks; and the mistakes each step is about fail:
 * picking before a pin is there, pressing into an unclamped housing, a fast press into the 0.5 mm
 * holes (and a slow program over the time), going on after a caught pin, a stopper left up in E6.
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
  const w = createCellWorld('assembly', mission, EFF);
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
    const c = G.check(steps, { theme: 'arm', cell: 'assembly', effector: EFF, cameraFlange: false, poses: {} });
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

for (const m of missionsOf('assembly')) {
  const t0 = Date.now();
  const { w, run, log } = await cell(m.id);
  const err = await run(m.solution!);
  assert.ok(!err && allOk(w), `${m.id} ${m.title}: ${err ? (err as Error).message : ''} | ${summary(w)} | ${alertsOf(w)} | ${log.slice(-6).join(' / ')}`);
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
  if (alert) assert.ok(w.cell!.alerts.some((a) => a.title.includes(alert)) || (err as Error | null)?.message.includes(alert), `${id} ${why}: no '${alert}' | ${alertsOf(w)} | ${(err as Error | null)?.message}`);
  const el = w.cell!.startT === null ? 0 : w.cell!.endT! - w.cell!.startT;
  console.log(`  ok   ${id} ${why}: ${err ? (err as Error).message : summary(w)} | ${alertsOf(w)} [${el.toFixed(1)} s]`);
}

await fails('E1', (c) => c.replace('cell.wait("핀 있음")\n', ''), 'picked before a pin came', '빈손');
await fails('E2', (c) => c.replace('cell.set("클램프", True)\ncell.wait("클램프 닫힘")\n', ''), 'pressed into an unclamped housing', '핀 걸림');
await fails('E4', (c) => c.replace('    robot.set_speed(10)\n', ''), 'pressed in fast', '핀 걸림');
await fails('E4', (c) => c.replace(/robot\.set_speed\(50\)/g, 'robot.set_speed(10)'), 'slow all the way');
await fails('E5', (c) => c.replace('    if cell.is_on("걸림"):\n        robot.place("구멍 다음 칸")\n', ''), 'went on after a caught pin', '이미 부품을 들고 있어요');
await fails('E6', (c) => c.replace('    cell.set("스토퍼", True)\n', ''), 'left the stopper up');

console.log('cell E: ok');
