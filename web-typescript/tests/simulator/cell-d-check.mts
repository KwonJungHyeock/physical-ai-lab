/**
 * 실습 셀 D (머신 텐딩): every ladder step's reference program runs with the rigid-body world, the
 * door, the chuck and the machine's cycle, and passes its checks; and the mistakes each step is about
 * fail: going in by a shut door, starting with the door open (the machine says why and stays), taking
 * a part out of a locked chuck, opening the door mid-cycle (the piece spoiled), no time saved in D6.
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
  const w = createCellWorld('tend', mission, EFF);
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
    const c = G.check(steps, { theme: 'arm', cell: 'tend', effector: EFF, cameraFlange: false, poses: {} });
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

for (const m of missionsOf('tend')) {
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
  if (alert) assert.ok(w.cell!.alerts.some((a) => a.title.includes(alert)), `${id} ${why}: no '${alert}' alert | ${alertsOf(w)}`);
  console.log(`  ok   ${id} ${why}: ${err ? (err as Error).message : summary(w)} | ${alertsOf(w)}`);
}

await fails('D1', (c) => c.replace('cell.set("문", True)\ncell.wait("문 열림")\n', ''), 'in by the shut door', '충돌');
await fails('D2', (c) => c.replace('cell.set("문", False)\ncell.wait("문 닫힘")\n', '').replace('cell.wait("가공 끝")\n', 'robot.wait(8)\n'), 'started with the door open', '가공 시작 안 함');
await fails('D3', (c) => c.replace('cell.set("척", False)\ncell.wait("척 풀림")\n', ''), 'out of a locked chuck', '척 잠김');
await fails('D4', (c) => c.replace('if cell.is_on("가공 중"):\n    cell.wait("가공 끝")\n', ''), 'door opened mid-cycle', '가공 중단');

// D6 is worth doing: the D5 way (no blank brought ahead) takes longer than the target.
{
  const { w, run } = await cell('D6');
  const d5way = missionById('D5')!.solution!.replace('range(3)', 'range(4)').replace('robot.home()\n', 'robot.home()\nrobot.set_speed(50)\n');
  const err = await run(d5way);
  const el = w.cell!.endT! - w.cell!.startT!;
  assert.ok(!err && !allOk(w), `D6 the D5 way passed anyway (${el.toFixed(1)} s) | ${summary(w)}`);
  console.log(`  ok   D6 the D5 way takes ${el.toFixed(1)} s: ${summary(w)}`);
}
// Nor does one door opening per part without a blank brought ahead: quick enough, but not this step.
{
  const { w, run } = await cell('D6');
  const ind = (c: string) => c.replace(/^(?=.)/gm, '    ');
  const [O, S, L, F] = ['cell.set("문", True)\ncell.wait("문 열림")\n', 'cell.set("문", False)\ncell.wait("문 닫힘")\n', 'cell.set("척", True)\ncell.wait("척 잠김")\n', 'cell.set("척", False)\ncell.wait("척 풀림")\n'];
  const R = 'cell.set("가공 시작", True)\ncell.wait("가공 끝")\ncell.set("가공 시작", False)\n';
  const swap = `${F}${O}robot.pick("척")\nrobot.place("완성품 트레이 다음 칸")\n`;
  const code = `from edu import robot, cell\n\nrobot.home()\nrobot.set_speed(50)\n${O}robot.pick("소재 트레이 다음 칸")\nrobot.place("척")\n${S}${L}${R}for _ in range(3):\n${ind(`${swap}robot.pick("소재 트레이 다음 칸")\nrobot.place("척")\n${S}${L}${R}`)}${swap}robot.home()\n${S}`;
  const err = await run(code);
  const staged = cellChecks(w)!.items.find((i) => i.label.includes('대기 자리'))!;
  assert.ok(!err && !staged.ok, `D6 without a blank ahead passed the staging check | ${summary(w)}`);
  console.log(`  ok   D6 without a blank ahead (${(w.cell!.endT! - w.cell!.startT!).toFixed(1)} s): ${summary(w)}`);
}

console.log('cell D: ok');
