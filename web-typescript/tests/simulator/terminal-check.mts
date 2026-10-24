/**
 * 실습 셀 터미널 실습: the shell does what its lessons say (cd · ls · cat · nano · cp · python3, the
 * mistakes answered), every lab's file passes its step as it is, and with the one value changed it
 * ends the way the lab's prediction says (still passing, missing the step's checks, or stopping).
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
const { LABS, HOME, labPath, labSource, labChanged, lineOf } = await import('../../src/engine/simulator/terminal/labs');
const S = await import('../../src/engine/simulator/terminal/shell');

/* --- the shell ---------------------------------------------------------------------- */
{
  const s = S.newShell();
  const run = (l: string) => S.runCommand(s, l);
  assert.equal(S.prompt(s), 'student@rdk-x5:~$');
  assert.match(run('ls').lines[0].text, /cell\//);
  assert.equal(run('cd ~/cell/e3').lines.length, 0);
  assert.equal(S.prompt(s), 'student@rdk-x5:~/cell/e3$');
  assert.equal(run('pwd').lines[0].text, `${HOME}/cell/e3`);
  assert.match(run('ls').lines[0].text, /four_pins\.py/);
  assert.match(run('ls -l').lines.map((l) => l.text).join('\n'), /-rw-r--r-- .* four_pins\.py/);
  assert.ok(run('cat four_pins.py').lines.some((l) => l.text.includes('robot.place("구멍 다음 칸")')));
  assert.equal(run('nano four_pins.py').action?.kind, 'nano');
  const py = run('python3 four_pins.py').action;
  assert.ok(py?.kind === 'python' && py.path === `${HOME}/cell/e3/four_pins.py`);
  assert.match(run('python3 nope.py').lines[0].text, /can't open file .*No such file/);
  assert.match(run('python four_pins.py').lines[0].text, /Command 'python' not found/);
  assert.match(run('cd nowhere').lines[0].text, /No such file or directory/);
  assert.match(run('lss').lines[0].text, /command not found/);
  run('cp four_pins.py backup.py');
  assert.match(run('ls').lines[0].text, /backup\.py/);
  run('cd ..');
  assert.equal(s.cwd, `${HOME}/cell`);
  run('cd');
  assert.equal(s.cwd, HOME);
  assert.equal(S.complete(s, 'cd ce'), 'cd cell/');
  assert.equal(S.complete(s, 'pyt'), 'python3 ');
  assert.equal(S.complete(s, 'cd cell/e'), 'cd cell/e');
  assert.equal(S.complete(s, 'cd cell/e4'), 'cd cell/e4/');
  assert.equal(run('history').lines.length, s.history.length);
  console.log('  ok   shell: cd · ls · pwd · cat · nano · cp · python3 · history · Tab, and the mistakes answered');
}

/* --- the labs ------------------------------------------------------------------------- */
const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const EFF = 'adaptive' as const;
const TCP = tcpFor(EFF, false);

async function runIn(cell: Parameters<typeof createCellWorld>[0], mission: string, code: string) {
  const w = createCellWorld(cell, mission, EFF);
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
  const { steps, errors } = G.parse(code);
  assert.deepEqual(errors, [], `${mission} parse: ${JSON.stringify(errors)}`);
  const c = G.check(steps, { theme: 'arm', cell, effector: EFF, cameraFlange: false, poses: {} });
  assert.deepEqual(c.errors, [], `${mission} check: ${JSON.stringify(c.errors)}`);
  let err: Error | null = null;
  try {
    await runProgram(steps, { chain, world: w, poses: {}, animate, see: async () => null, log: () => {} });
  } catch (e) {
    err = e as Error;
  }
  w.cell!.endT = w.cell!.line.t;
  for (let k = 0; k < 90; k += 1) frame();
  const items = cellChecks(w)?.items ?? [];
  return { err, ok: !err && items.every((i) => i.ok), summary: items.map((i) => `${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join(' · ') };
}

for (const l of LABS.filter((x) => !process.env.LAB || x.id === process.env.LAB)) {
  const src = labSource(l);
  for (const r of l.read) assert.ok(lineOf(src, r.find) > 0, `${l.id}: '${r.find}' is not in the file`);
  assert.ok(src.includes(l.change.from) && labChanged(l) !== src, `${l.id}: the value to change is not in the file`);
  assert.ok(l.predict.answer >= 0 && l.predict.answer < l.predict.options.length);
  assert.ok(labPath(l).startsWith(`${HOME}/cell/${l.id}/`));
  const t0 = Date.now();
  const a = await runIn(l.cell, l.mission, src);
  assert.ok(a.ok, `${l.id} as it is: ${a.err?.message ?? ''} | ${a.summary}`);
  const b = await runIn(l.cell, l.mission, labChanged(l));
  const got = b.err ? 'error' : b.ok ? 'pass' : 'fail';
  assert.equal(got, l.expect, `${l.id} changed (${l.change.from} → ${l.change.to}): ${b.err?.message ?? ''} | ${b.summary}`);
  console.log(`  ok   ${l.id} ${l.file}: as it is passes · ${l.change.to} → ${got}: ${b.err ? b.err.message : b.summary}  [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
}

console.log('terminal: ok');
