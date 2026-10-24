/**
 * 실습 셀 B ~ E (their 3D cells, before their ladders): every place the robot goes is within the
 * 1,250 mm working limit and reachable straight down with the gripper; the arm picks at B's end under
 * the camera gantry and drops into a bin without touching it; and 자유 실습's equipment works — the belt carries the sample parts to the end, the
 * doors, chucks, clamps, stoppers and the ejector travel and report their ends, the machine runs its
 * cycle only with the door shut and the chuck locked.
 *
 * Run with: npm run check:cellscene
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { createPhysics } = await import('../../src/engine/physics/physics');
const { createCellWorld } = await import('../../src/engine/simulator/sim');
const { tcpFor, EFFECTOR_BY_ID } = await import('../../src/engine/simulator/effectors');
const { objectSpec } = await import('../../src/engine/simulator/deskPhysics');
const { makeSolver } = await import('../../src/engine/simulator/plan');
const { B_BINS, CELLS, cellLayout, toShop } = await import('../../src/engine/simulator/cell/cells');
const { CELL_ENV, cellSolids, stepCell } = await import('../../src/engine/simulator/cell/run');
const { setOut } = await import('../../src/engine/simulator/cell/line');
const { runProgram } = await import('../../src/engine/simulator/sim');
const G = await import('../../src/engine/simulator/program');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = 'adaptive' as const;
const TCP = tcpFor(EFF, false);
const solve = makeSolver(chain, TCP);
const HOME = [0.61, 45.87, -92.37, -41.3, 2.02, 9.58];

// Every cell's places: inside the working limit, and the gripper can stand straight over each (50 mm up).
for (const c of CELLS) {
  const l = cellLayout(c.id);
  const far: string[] = [];
  for (const [name, p] of Object.entries(l.places)) {
    const d = toShop(Math.hypot(p.x, p.y));
    if (d > 1250) far.push(`${name} ${d}`);
    assert.ok(solve({ x: p.x, y: p.y, z: p.z + 50 }, HOME), `${c.letter} ${name}: no pose above it`);
  }
  for (const g of Object.values(l.grids)) {
    for (let k = 0; k < g.rows * g.cols; k += 1) {
      const x = g.origin.x + Math.floor(k / g.cols) * g.pitch;
      const y = g.origin.y + (k % g.cols) * g.pitch;
      if (toShop(Math.hypot(x, y)) > 1250) far.push(`${g.name} ${k + 1}`);
    }
  }
  assert.deepEqual(far, [], `${c.letter}: past 1,250 mm`);
  // Every input and output the program can name exists once.
  assert.equal(new Set(l.inputs).size, l.inputs.length, `${c.letter} inputs`);
  assert.equal(new Set(l.outputs).size, l.outputs.length, `${c.letter} outputs`);
  console.log(`  ok   ${c.letter} ${c.name}: ${Object.keys(l.places).length} places in reach, ${l.inputs.length} inputs, ${l.outputs.length} outputs`);
}

/** A cell in 자유 실습 with its physics, run frame by frame (60 Hz). */
async function free(id: (typeof CELLS)[number]['id']) {
  const w = createCellWorld(id, null, EFF);
  const reach = EFFECTOR_BY_ID[EFF].kind === 'grip' ? Math.max(0, TCP - 40) : TCP;
  const phys = await createPhysics(chain, reach, w.objects.map(objectSpec), cellSolids(w.cell!), w.angles, CELL_ENV);
  const run = (s: number) => {
    for (let k = 0; k < Math.round(s * 60); k += 1) stepCell(w, phys, 1 / 60, chain, TCP);
  };
  run(0.5);
  const line = w.cell!.line;
  const set = (name: string, on: boolean) => setOut(line, name, on);
  const alerts = () => w.cell!.alerts.map((a) => `[${a.level}] ${a.title}`).join(', ');
  const prog = async (code: string) => {
    const { steps, errors } = G.parse(code);
    assert.deepEqual(errors, []);
    const c = G.check(steps, { theme: 'arm', cell: id, effector: EFF, cameraFlange: false, poses: {} });
    assert.deepEqual(c.errors, [], JSON.stringify(c.errors));
    const DT = 1 / 60;
    await runProgram(steps, {
      chain,
      world: w,
      poses: {},
      animate: async (d: number, f: (t: number) => void) => {
        const n = Math.max(1, Math.round(d / DT));
        for (let k = 1; k <= n; k += 1) {
          f((d * k) / n);
          stepCell(w, phys, DT, chain, TCP);
        }
      },
      see: async () => null,
    });
  };
  return { w, run, line, set, alerts, prog };
}

// B: the belt brings the first part to the end sensor; nothing breaks on the way.
{
  const { w, run, line, set, alerts, prog } = await free('vision');
  assert.equal(w.objects.length, 6);
  set('컨베이어', true);
  for (let t = 0; t < 14 && !line.in['끝 센서']; t += 0.5) run(0.5);
  assert.ok(line.in['끝 센서'], `B: no part at the end (${alerts()})`);
  run(0.4);
  set('컨베이어', false);
  // Picked under the camera gantry and put in the far bin: no knock on the gantry, the part in the bin.
  await prog('from edu import robot, cell\n\nrobot.home()\nrobot.pick("끝 위치")\nrobot.place("함 3")\nrobot.home()\n');
  run(1);
  assert.ok(!w.cell!.alerts.some((a) => a.level !== 'info'), alerts());
  const bin = w.cell!.layout.places['함 3'];
  // Inside the tote's walls (the first drop goes to a corner) and below its rim.
  const inBin = (o: { x: number; y: number; z: number }) => Math.abs(o.x - bin.x) < B_BINS.inner / 2 && Math.abs(o.y - bin.y) < B_BINS.inner / 2 && o.z < B_BINS.floor + B_BINS.wall;
  assert.ok(w.objects.some(inBin), `B: the part is in 함 3 (${w.objects.map((o) => `${o.x.toFixed(0)},${o.y.toFixed(0)},${o.z.toFixed(0)}`).join(' ')})`);
  console.log(`  ok   B belt carries a part to the end sensor; picked under the camera, put in 함 3`);
}

// C: the stopper holds a part at the pick place; the ejector reaches its end and comes back.
{
  const { w, run, line, set, alerts } = await free('inspect');
  // By hand: the stopper down, one part dropped from the hopper, the belt on.
  line.auto = false;
  set('스토퍼', true);
  set('투입', true);
  run(0.2);
  set('투입', false);
  run(0.5);
  set('컨베이어', true);
  for (let t = 0; t < 14 && !line.in['부품 도착']; t += 0.5) run(0.5);
  assert.ok(line.in['부품 도착'], `C: nothing at the stopper (${alerts()})`);
  set('컨베이어', false);
  const p = w.cell!.layout.places['스토퍼 앞'];
  assert.ok(w.objects.some((o) => Math.abs(o.y - p.y) < 6 && Math.abs(o.x - p.x) < 8), 'C: the part stands at 스토퍼 앞');
  set('배출 실린더', true);
  run(0.6);
  assert.ok(line.in['배출 끝'], 'C: the ejector reaches its end');
  set('배출 실린더', false);
  run(0.6);
  assert.ok(!line.in['배출 끝']);
  console.log(`  ok   C stopper holds a part at the pick place, the ejector goes out and back`);
}

// D: the door and the chuck; the machine runs only shut and locked, then reports done.
{
  const { w, run, line, set } = await free('tend');
  assert.ok(line.in['문 닫힘'] && line.in['척 풀림']);
  set('가공 시작', true);
  run(1);
  assert.ok(!line.in['가공 중'], 'D: no cycle with the chuck open');
  set('가공 시작', false);
  set('문', true);
  run(2);
  assert.ok(line.in['문 열림'] && !line.in['문 닫힘'], 'D: the door opens');
  set('척', true);
  set('문', false);
  run(2);
  assert.ok(line.in['척 잠김'] && line.in['문 닫힘']);
  set('가공 시작', true);
  run(1);
  assert.ok(line.in['가공 중'], 'D: machining');
  set('가공 시작', false);
  run(0.5);
  assert.ok(line.in['가공 중'], 'D: a started cycle runs on with the start signal off');
  set('가공 시작', true);
  run(w.cell!.layout.line.cycle!.timeS);
  assert.ok(line.in['가공 끝'] && !line.in['가공 중'], 'D: done');
  set('가공 시작', false);
  run(0.1);
  assert.ok(!line.in['가공 끝']);
  console.log(`  ok   D door · chuck · machining cycle`);
}

// E: a housing arrives at the stopped jig, the clamp closes on it; the pin is in the nest.
{
  const { w, run, line, set, alerts } = await free('assembly');
  assert.ok(line.in['핀 있음'], 'E: a pin in the nest');
  set('스토퍼', true);
  run(0.5);
  set('컨베이어', true);
  for (let t = 0; t < 14 && !line.in['하우징 도착']; t += 0.5) run(0.5);
  assert.ok(line.in['하우징 도착'], `E: no housing at the jig (${alerts()})`);
  run(0.5);
  set('컨베이어', false);
  set('클램프', true);
  run(0.6);
  assert.ok(line.in['클램프 닫힘'] && !line.in['클램프 열림']);
  const j = w.cell!.layout.places['하우징'];
  assert.ok(w.objects.some((o) => o.kind === 'box' && Math.hypot(o.x - j.x, o.y - j.y) < 6), `E: the housing sits in the jig: ${w.objects.filter((o) => o.kind === 'box').map((o) => `${o.x.toFixed(0)},${o.y.toFixed(0)}`).join(' ')}`);
  console.log(`  ok   E housing stopped at the jig, clamp closed`);
}

console.log('cell scenes B ~ E: ok');
