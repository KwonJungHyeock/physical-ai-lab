/**
 * 실습 셀 B (비전 분류): every ladder step's reference program runs with the rigid-body world, the
 * dispenser and the belt, and passes its checks; and the mistakes each step is about fail: no rule
 * table, a 지름 기준 above both sizes, no 확신도 기준 (the faded part goes into a bin), shapes never
 * taught, the belt left running.
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
  const w = createCellWorld('vision', mission, EFF);
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
    const c = G.check(steps, { theme: 'arm', cell: 'vision', effector: EFF, cameraFlange: false, poses: {} });
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

for (const m of missionsOf('vision')) {
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
  const err = await run(edit(missionById(id)!.solution!));
  assert.ok(err || !allOk(w), `${id} ${why}: passed anyway | ${summary(w)}`);
  console.log(`  ok   ${id} ${why}: ${err ? (err as Error).message : summary(w)}`);
}

await fails('B1', (c) => c.replace(/cell\.rule\([^\n]*\n/g, ''), 'without a rule table');
await fails('B4', (c) => c.replace('cell.limit("지름", 110)', 'cell.limit("지름", 130)'), 'with 지름 기준 above both sizes');
await fails('B7', (c) => c.replace('cell.limit("확신도", 80)\n', ''), 'without 확신도 기준');
await fails('B8', (c) => c.replace(/camera\.learn\("[^"]+"\)\n/g, ''), 'shapes never taught');
await fails('B6', (c) => c.replace('    cell.set("컨베이어", False)\n', ''), 'belt left running');

// The checks before running.
{
  const bad = G.check(G.parse('from edu import robot, camera, cell\n\nrobot.pick(part)\ncell.rule("보라", "함 1")\ncell.rule("빨강", "함 9")\ncell.limit("확신도", 150)\ncamera.learn("별")\n').steps, { theme: 'arm', cell: 'vision', effector: EFF, cameraFlange: false, poses: {} });
  assert.equal(bad.errors.length, 5, JSON.stringify(bad.errors));
  const inA = G.check(G.parse('from edu import robot, camera, cell\n\npart = camera.look()\n').steps, { theme: 'arm', cell: 'feed', effector: EFF, cameraFlange: false, poses: {} });
  assert.ok(inA.errors.some((e) => e.msg.includes('카메라가 없어요')), JSON.stringify(inA.errors));
  console.log(`  ok   checks: ${bad.errors.map((e) => e.msg).join(' | ')}`);
}

console.log('cell B: ok');
