/**
 * 공정 짜기 (practice-led): every practice built from its own places runs in the simulator and does
 * its job (the blocks end where they should, the pen draws), places the tool cannot reach are
 * refused before anything moves, and the rows follow the movement rules (J fast above, L slow down).
 *
 * Run with: npm run check:plan
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { tcpPositionMm } = await import('../../src/engine/robot/motion');
const { activeArm } = await import('../../src/engine/robot/arms');
const { createWorld, runProcess } = await import('../../src/engine/simulator/sim');
const { tcpFor } = await import('../../src/engine/simulator/effectors');
const { setMatNeeded } = await import('../../src/engine/simulator/desk');
const P = await import('../../src/engine/simulator/process');
const L = await import('../../src/engine/simulator/plan');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const HOME = activeArm().home.slice();
setMatNeeded(true);

const instant = async (durationS: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(durationS * 50));
  for (let k = 1; k <= n; k += 1) frame((durationS * k) / n);
};

async function run(plan: import('../../src/engine/simulator/plan').Plan) {
  const prac = L.practiceOf(plan.kind);
  const tool = prac.tool === 'grip' ? 'adaptive' : 'pen';
  const built = L.buildPlan(plan, L.DEFAULT_RULES, L.makeSolver(chain, tcpFor(tool, false)), HOME);
  const world = createWorld(tool, false, L.blockLayout(plan), 'arm');
  const proc: import('../../src/engine/simulator/process').Process = { name: prac.name, blend: built.blend, speed: 35, rows: built.rows };
  let simT = 0;
  const warns: string[] = [];
  if (!built.problems.length) {
    assert.deepEqual(P.checkProcess(proc, prac.tool === 'grip'), [], `${prac.name}: rows check`);
    await runProcess(
      P.compileProcess(proc),
      {
        chain,
        world,
        poses: {},
        animate: async (d, frame) => {
          simT += d;
          await instant(d, frame);
        },
        see: async () => null,
        log: (kind, msg) => kind === 'warn' && warns.push(msg),
      },
      proc.speed,
    );
  }
  return { built, world, simT, warns };
}

// Every practice from its own places: no problems, runs, does its job.
for (const prac of L.PLAN_PRACTICES) {
  const plan = L.freshPlan(prac.kind);
  const { built, world, simT, warns } = await run(plan);
  assert.deepEqual(built.problems, [], `${prac.name}: ${JSON.stringify(built.problems)}`);
  assert.deepEqual(warns, [], `${prac.name}: ${warns.join(' / ')}`);
  // Rules: every J row fast, every L row slow; starts and ends at the start pose.
  for (const r of built.rows) if (r.kind === 'move') assert.equal(r.speed, r.mode === 'J' ? L.DEFAULT_RULES.fast : L.DEFAULT_RULES.slow, `${prac.name}: ${r.note}`);
  const moves = built.rows.filter((r) => r.kind === 'move');
  assert.deepEqual(moves[0].kind === 'move' && moves[0].joints, HOME);
  assert.ok(world.angles.every((v, i) => Math.abs(v - HOME[i]) < 0.05), `${prac.name}: back at the start`);
  if (prac.group === 'carry') {
    const targets = L.carryTargets(plan);
    for (const t of targets) {
      const b = world.blocks.find((k) => Math.hypot(k.x - t.x, k.y - t.y) < 6 && Math.abs(k.z - (t.z - 1.5)) < 3);
      assert.ok(b, `${prac.name}: a block at ${JSON.stringify(t)} — ${JSON.stringify(world.blocks.map((k) => [k.color, Math.round(k.x), Math.round(k.y), Math.round(k.z)]))}`);
    }
    // Carrying stays at the travel height between places.
    const ups = built.rows.filter((r) => r.kind === 'move' && /위로/.test(r.note ?? ''));
    for (const r of ups) assert.ok(r.kind === 'move' && tcpPositionMm(chain, r.joints!, tcpFor('adaptive', false)).z > L.DEFAULT_RULES.travelZ - 1, `${prac.name}: ${r.note} high`);
    console.log(`  ok   ${prac.name}: ${built.rows.length} rows, ${targets.length} block(s) placed (${simT.toFixed(1)} s)`);
  } else {
    const drawn = world.trail.reduce((n, s) => n + s.length, 0);
    assert.ok(drawn > 20, `${prac.name}: drew ${drawn} points`);
    console.log(`  ok   ${prac.name}: ${built.rows.length} rows, drew ${world.trail.filter((s) => s.length).length} stroke(s) (${simT.toFixed(1)} s)`);
  }
}

// Every shape draws, the circle in Smooth.
for (const shape of ['circle', 'triangle', 'star'] as const) {
  const plan = { ...L.freshPlan('shape'), shape };
  const { built, world } = await run(plan);
  assert.deepEqual(built.problems, [], shape);
  assert.equal(built.blend, shape === 'circle' ? 'smooth' : 'tick');
  assert.ok(world.trail.reduce((n, s) => n + s.length, 0) > 20, `${shape} drawn`);
}
console.log('  ok   원 · 삼각형 · 별 draw too (원 in Smooth)');

// The stack: three stay under the travel height; four raise it over the top block (a note, not a problem).
{
  assert.equal(L.buildPlan(L.freshPlan('stack'), L.DEFAULT_RULES, L.makeSolver(chain, tcpFor('adaptive', false)), HOME).notes.length, 0, 'three 25 mm blocks stay under 80 mm');
  const plan = { ...L.freshPlan('stack'), count: 4 };
  const { built, world } = await run(plan);
  assert.deepEqual(built.problems, []);
  assert.match(built.notes[0] ?? '', /옮길 때 높이를 80 mm 대신 105 mm/);
  assert.equal(world.blocks.filter((b) => Math.hypot(b.x - plan.spots[1]!.x, b.y - plan.spots[1]!.y) < 6).length, 4, 'four in the stack');
  console.log('  ok   4 blocks stack; a stack above the travel height raises it with a note');
}

// Refused before anything moves: untaught, out of reach, under the desk, by the body.
{
  const solve = L.makeSolver(chain, tcpFor('adaptive', false));
  const msgs = (spots: (import('../../src/engine/simulator/plan').Spot | null)[]) =>
    L.buildPlan({ ...L.freshPlan('move1'), spots }, L.DEFAULT_RULES, solve, HOME).problems.map((q) => q.msg).join(' | ');
  assert.match(msgs([{ x: 185, y: -25, z: 14 }, null]), /놓을 곳: 아직 저장하지 않았어요/);
  assert.match(msgs([{ x: 185, y: -25, z: 14 }, { x: 420, y: 0, z: 14 }]), /닿을 수 없어요/);
  assert.match(msgs([{ x: 185, y: -25, z: -10 }, { x: 190, y: -100, z: 14 }]), /책상 아래/);
  assert.match(msgs([{ x: 40, y: 20, z: 14 }, { x: 190, y: -100, z: 14 }]), /몸통에 너무 가까워요/);
  console.log('  ok   untaught, unreachable, under-desk and by-the-body places are refused with a fix');
}

// Teach list follows the values: 점 잇기 asks for as many points as 점 몇 개.
{
  const p = L.fitSpots({ ...L.freshPlan('points'), count: 6 });
  assert.equal(L.teachOf(p).length, 7);
  assert.equal(p.spots.length, 7);
  const q = L.fitSpots({ ...p, count: 3 });
  assert.equal(q.spots.length, 4);
  console.log('  ok   the places to teach follow 점 몇 개');
}

// Rows keep their names and speeds through the project file.
{
  const b = L.buildPlan(L.freshPlan('move1'), L.DEFAULT_RULES, L.makeSolver(chain, tcpFor('adaptive', false)), HOME);
  const proc = { name: 'x', blend: 'tick' as const, speed: 35, rows: b.rows };
  const back = P.processFromFile(P.processToFile(proc));
  assert.ok('process' in back);
  assert.deepEqual(
    back.process.rows.map((r) => [r.kind, r.note, r.kind === 'move' ? r.speed : null]),
    proc.rows.map((r) => [r.kind, r.note, r.kind === 'move' ? r.speed : null]),
  );
  console.log('  ok   row names and speeds survive the project file');
}
