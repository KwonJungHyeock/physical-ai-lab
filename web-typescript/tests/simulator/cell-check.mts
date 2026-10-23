/**
 * 실습 셀 A (공급 · 적재): every ladder step's reference program runs in the simulator with the
 * rigid-body world and the equipment (the pusher pushes, the belt carries, parts fall) and passes
 * its checks; and the faults happen when they should — picking before the sensor, stacking without
 * the height, a fast crash, a hard drop, a belt left running, a push into a part left in the way.
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
const { createCellWorld, runProgram, RunError } = await import('../../src/engine/simulator/sim');
const { tcpFor, EFFECTOR_BY_ID } = await import('../../src/engine/simulator/effectors');
const { objectSpec } = await import('../../src/engine/simulator/deskPhysics');
const G = await import('../../src/engine/simulator/program');
const { CELL_ENV, cellChecks, cellSolids, stepCell, repairCell } = await import('../../src/engine/simulator/cell/run');
const { missionsOf } = await import('../../src/engine/simulator/cell/missions');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = 'adaptive' as const;
const TCP = tcpFor(EFF, false);

type World = ReturnType<typeof createCellWorld>;

/** A cell with its physics, and an animate that runs the cell frame by frame (60 Hz). */
async function cell(mission: string | null) {
  const w = createCellWorld('feed', mission, EFF);
  const reach = EFFECTOR_BY_ID[EFF].kind === 'grip' ? Math.max(0, TCP - 40) : TCP;
  const phys = await createPhysics(chain, reach, w.objects.map(objectSpec), cellSolids(w.cell!), w.angles, CELL_ENV);
  const DT = 1 / 60;
  const frame = () => stepCell(w, phys, DT, chain, TCP);
  // Parts settle before anything moves.
  for (let k = 0; k < 30; k += 1) frame();
  const animate = async (d: number, f: (t: number) => void) => {
    const n = Math.max(1, Math.round(d / DT));
    for (let k = 1; k <= n; k += 1) {
      f((d * k) / n);
      frame();
    }
  };
  const run = async (code: string) => {
    const { steps, errors } = G.parse(code);
    assert.deepEqual(errors, [], `parse: ${JSON.stringify(errors)}`);
    const c = G.check(steps, { theme: 'arm', cell: 'feed', effector: EFF, cameraFlange: false, poses: {} });
    assert.deepEqual(c.errors, [], `check: ${JSON.stringify(c.errors)}`);
    assert.equal(G.serialize(steps), code, 'blocks and text round-trip');
    let err: unknown = null;
    try {
      await runProgram(steps, { chain, world: w, poses: {}, animate, see: async () => null });
    } catch (e) {
      err = e;
    }
    w.cell!.endT = w.cell!.line.t;
    // The last part comes to rest.
    for (let k = 0; k < 60; k += 1) frame();
    return err;
  };
  return { w, run, frame };
}

const summary = (w: World) => (cellChecks(w)?.items ?? []).map((i) => `${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ');
const alertsOf = (w: World) => w.cell!.alerts.map((a) => `[${a.level}] ${a.title}`).join(', ');

// Every step of the ladder: the reference program passes all its checks.
for (const m of missionsOf('feed')) {
  const t0 = Date.now();
  const { w, run } = await cell(m.id);
  const err = await run(m.solution!);
  const res = cellChecks(w)!;
  const ok = res.items.every((i) => i.ok);
  assert.ok(!err && ok, `${m.id} ${m.title}: ${err ? (err as Error).message : ''} | ${summary(w)} | ${alertsOf(w)}`);
  // A reference program asks for no part that is not there.
  assert.ok(!w.cell!.alerts.some((a) => a.title === '매거진 빔'), `${m.id}: ${alertsOf(w)}`);
  console.log(`  ok   ${m.id} ${m.title}: ${summary(w)}  [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
}

// Picking before the part arrives: an empty hand, and the step is not passed.
{
  const { w, run } = await cell('A6');
  await run('from edu import robot, cell\n\nrobot.home()\nrobot.pick("끝 위치")\nrobot.place("기준 자리")\nrobot.home()\n');
  const res = cellChecks(w)!;
  assert.ok(!res.items[0].ok, summary(w));
  assert.ok(w.cell!.alerts.some((a) => a.title === '빈손'), alertsOf(w));
  console.log(`  ok   A6 without waiting for the sensor: ${summary(w)}`);
}

// Stacking without the layer height: the held part runs into the one below — 정지.
{
  const { w, run } = await cell('A3');
  const err = await run('from edu import robot, cell\n\nrobot.home()\nrobot.pick("소재 1")\nrobot.place("기준 자리")\nrobot.pick("소재 2")\nrobot.place("기준 자리")\nrobot.home()\n');
  assert.ok(err instanceof RunError, String(err));
  const hit = w.cell!.alerts.find((a) => a.kind === 'collision');
  assert.ok(hit, alertsOf(w));
  // The part left in the tool is not counted as stacked.
  assert.ok(!cellChecks(w)!.items[1].ok, summary(w));
  assert.ok(!(err as Error).message.includes('(가)'), (err as Error).message);
  console.log(`  ok   A3 without z=100: [${hit.level}] ${(err as Error).message}`);
}

// A part let go from high up breaks (a 주의 and a broken part).
{
  const { w, run } = await cell('A1');
  await run('from edu import robot, cell\n\nrobot.home()\nrobot.pick("소재 1")\nrobot.place("기준 자리", z=500)\nrobot.home()\n');
  assert.ok(w.objects.some((o) => o.damaged), alertsOf(w));
  assert.ok(w.cell!.alerts.some((a) => a.kind === 'damage'), alertsOf(w));
  console.log(`  ok   a part dropped from 500 mm breaks: ${w.cell!.alerts.find((a) => a.kind === 'damage')!.msg}`);
}

// A10 with the belt left running: it slips, then the motor guard trips (고장) — and [점검 · 복구] clears it.
{
  const { w, run } = await cell('A10');
  const err = await run(
    'from edu import robot, cell\n\nrobot.home()\ncell.set("공급 실린더", True)\ncell.wait("실린더 전진 끝")\ncell.set("공급 실린더", False)\ncell.wait("실린더 후진 끝")\ncell.set("컨베이어", True)\ncell.wait("끝 센서")\nrobot.wait(10)\nrobot.wait(5)\nrobot.pick("끝 위치")\nrobot.home()\n',
  );
  assert.ok(w.cell!.alerts.some((a) => a.title === '벨트 미끄러짐'), alertsOf(w));
  assert.ok(w.cell!.health.fault?.title === '컨베이어 과부하', alertsOf(w));
  assert.ok(err instanceof RunError, 'the program stops on the fault');
  repairCell(w.cell!);
  assert.equal(w.cell!.halt, null);
  console.log(`  ok   A10 belt left running: ${alertsOf(w)}`);
}

// Pushing while a part is still on the belt's entry: 공급 걸림 (고장).
{
  const { w, run } = await cell('A10');
  await run(
    'from edu import robot, cell\n\nrobot.home()\ncell.set("공급 실린더", True)\ncell.wait("실린더 전진 끝")\ncell.set("공급 실린더", False)\ncell.wait("실린더 후진 끝")\ncell.set("공급 실린더", True)\nrobot.wait(1)\nrobot.home()\n',
  );
  assert.ok(w.cell!.health.fault?.title === '공급 걸림', alertsOf(w));
  console.log(`  ok   a second push into a part left at the entry: ${w.cell!.health.fault!.msg}`);
}

// A fast crash into the equipment: 고장 (the gripper breaks); a slow one is a 정지.
for (const [speed, level] of [
  [50, 'fault'],
  [8, 'stop'],
] as const) {
  const { w, run } = await cell(null);
  // Low and sideways into the source plate's edge.
  const err = await run(`from edu import robot\n\nrobot.home()\nrobot.set_speed(${speed})\nrobot.move_to(130, -30, 15)\nrobot.move_to(130, -150, 15)\nrobot.home()\n`);
  assert.ok(err instanceof RunError, String(err));
  const a = w.cell!.alerts.find((x) => x.kind === 'collision');
  assert.equal(a?.level, level, `${speed}: ${alertsOf(w)} (tip ${w.cell!.health.tipSpeed.toFixed(0)} mm/s)`);
  console.log(`  ok   speed ${speed} into the plate's edge: [${a!.level}] ${a!.title}`);
}

// A heavy part held at full reach: the motors' load warns, then stops the arm.
{
  const { w, run } = await cell('A1');
  const part = w.objects[0];
  part.massG = 400;
  const err = await run('from edu import robot, cell\n\nrobot.home()\nrobot.pick("소재 1")\nrobot.move_joints([0, -80, 0, -10, 0, 0])\nrobot.home()\n');
  const load = w.cell!.alerts.filter((a) => a.kind === 'load');
  assert.ok(load.some((a) => a.level === 'stop' || a.level === 'fault'), `${alertsOf(w)} | load ${w.cell!.health.load.map((l) => l.toFixed(2)).join(' ')}`);
  console.log(`  ok   a 400 g part at full reach: ${load.map((a) => `[${a.level}] ${a.title}`).join(', ')}${err ? ' → stopped' : ''}`);
}
