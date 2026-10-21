/**
 * 공정 짜기: MOVE L really goes straight (and MOVE J does not), Smooth passes the points without
 * stopping while Tick stops at each, the presets run, bad points are caught before anything moves,
 * and the project file (.pal) round-trips and refuses what it cannot read.
 *
 * Run with: npm run check:process
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { linearPosePath, jointTrajectory, tcpPositionMm } = await import('../../src/engine/robot/motion');
const { createWorld, runProcess, RunError } = await import('../../src/engine/simulator/sim');
type RobotAction = import('../../src/engine/simulator/sim').RobotAction;
const P = await import('../../src/engine/simulator/process');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const TCP = 112; // adaptive gripper

const A = [-4.8, -9.7, -68.3, -12, 0, -70.8];
const B = [43.1, -15.5, -103.8, 29.4, 0, -70.9];

/** Largest distance of the TCP from the straight segment between its ends, mm. */
function offLine(sample: (t: number) => number[], T: number): number {
  const a = tcpPositionMm(chain, sample(0), TCP);
  const b = tcpPositionMm(chain, sample(T), TCP);
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(d.x, d.y, d.z);
  let worst = 0;
  for (let k = 0; k <= 100; k += 1) {
    const p = tcpPositionMm(chain, sample((T * k) / 100), TCP);
    const v = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
    const c = { x: v.y * d.z - v.z * d.y, y: v.z * d.x - v.x * d.z, z: v.x * d.y - v.y * d.x };
    worst = Math.max(worst, Math.hypot(c.x, c.y, c.z) / len);
  }
  return worst;
}

// MOVE L is a straight line ending exactly on the taught point; MOVE J between the same points is not.
{
  const plan = linearPosePath(chain, A, B, TCP, 35);
  assert.ok(plan.ok, 'linear plan ok');
  const L = offLine((t) => plan.trajectory.sample(t), plan.trajectory.durationS);
  const jt = jointTrajectory(A, B, 35);
  const J = offLine((t) => jt.sample(t), jt.durationS);
  assert.ok(L < 1, `MOVE L off the line ${L.toFixed(2)} mm`);
  assert.ok(J > 5, `MOVE J should curve, ${J.toFixed(2)} mm`);
  assert.deepEqual(plan.trajectory.end, B);
  console.log(`  ok   MOVE L stays within ${L.toFixed(2)} mm of the line; MOVE J bows out ${J.toFixed(1)} mm`);
}

const instant = async (durationS: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(durationS * 100));
  for (let k = 1; k <= n; k += 1) frame((durationS * k) / n);
};

async function play(p: import('../../src/engine/simulator/process').Process) {
  const world = createWorld('adaptive', false, undefined, 'arm');
  const actions: RobotAction[] = [];
  const lines: number[] = [];
  const speeds: number[] = [];
  let simT = 0;
  let last = world.angles.slice();
  await runProcess(P.compileProcess(p), {
    chain,
    world,
    poses: {},
    animate: async (d, frame) =>
      instant(d, (t) => {
        frame(t);
        const dt = d / Math.max(1, Math.ceil(d * 100));
        speeds.push(Math.max(...world.angles.map((v, i) => Math.abs(v - last[i]))) / dt);
        last = world.angles.slice();
        simT += dt;
      }),
    see: async () => null,
    onLine: (l) => lines.push(l),
    record: (a) => actions.push(a),
  }, p.speed);
  return { world, actions, lines, speeds, simT };
}

// Presets: no problems, they run, and the arm ends on the last taught point.
for (const preset of P.PRESETS) {
  assert.deepEqual(P.checkProcess(preset), [], preset.name);
  const r = await play(preset);
  const lastMove = [...preset.rows].reverse().find((x) => x.kind === 'move')!;
  assert.ok(lastMove.kind === 'move' && lastMove.joints!.every((v, i) => Math.abs(v - r.world.angles[i]) < 0.01), `${preset.name} ends on its last point`);
  console.log(`  ok   preset "${preset.name}" runs (${r.simT.toFixed(1)} s, ${r.actions.length} robot actions)`);
}

// Smooth vs Tick on the square: Smooth is quicker, never stops between the first and last point, and
// sends the passed points as via targets; Tick stops at each and sends none as via.
{
  const square = P.PRESETS.find((p) => p.name === '네모 그리기')!;
  const smooth = await play({ ...square, blend: 'smooth' });
  const tick = await play({ ...square, blend: 'tick' });
  assert.ok(smooth.simT < tick.simT * 0.9, `smooth ${smooth.simT.toFixed(1)} s vs tick ${tick.simT.toFixed(1)} s`);
  // The square's legs are the last four rows; their playing time is after the first J move.
  const legEndsVia = (acts: RobotAction[]) =>
    acts.filter((a) => a.type === 'angles' && a.line >= 2 && a.line <= 4).filter((a, i, all) => a.type === 'angles' && (i === all.length - 1 || all[i + 1].line !== a.line));
  assert.ok(legEndsVia(smooth.actions).every((a) => a.type === 'angles' && a.via), 'smooth: passed points are via');
  assert.ok(legEndsVia(tick.actions).every((a) => a.type === 'angles' && !a.via), 'tick: every point is a stop');
  // Tick comes to rest (speed ~0) three times inside the square; Smooth does not.
  const rests = (s: number[]) => {
    let n = 0;
    let moving = false;
    for (const v of s) {
      if (v > 5) moving = true;
      else if (moving && v < 0.5) {
        n += 1;
        moving = false;
      }
    }
    return n;
  };
  assert.ok(rests(tick.speeds) >= 5, `tick rests ${rests(tick.speeds)}`);
  assert.ok(rests(smooth.speeds) <= 2, `smooth rests ${rests(smooth.speeds)}`);
  assert.deepEqual([...new Set(smooth.lines)], [1, 2, 3, 4, 5], 'smooth still lights each row');
  console.log(`  ok   Smooth ${smooth.simT.toFixed(1)} s without stopping (via points) / Tick ${tick.simT.toFixed(1)} s, stops at every point`);
}

// Checks before anything moves.
{
  const p: import('../../src/engine/simulator/process').Process = {
    ...P.emptyProcess(),
    rows: [
      { kind: 'move', mode: 'J', joints: null },
      { kind: 'move', mode: 'L', joints: [0, 0, 200, 0, 0, 0] },
      { kind: 'wait', sec: 0 },
    ],
  };
  const msgs = P.checkProcess(p).map((x) => x.msg);
  assert.equal(msgs.length, 3, JSON.stringify(msgs));
  assert.match(msgs[0], /1번 줄 P1: 좌표가 아직 없어요/);
  assert.match(msgs[1], /2번 줄 P2: J3 200°/);
  assert.match(P.checkProcess(P.emptyProcess())[0].msg, /MOVE 줄이 없어요/);
  assert.deepEqual(P.pointNames([{ kind: 'grip', open: true }, ...p.rows]), [null, 'P1', 'P2', null]);
  console.log('  ok   untaught points, joint ranges and waits are caught before running');
}

// A straight line the arm cannot keep (through the base) stops with the row and a fix.
{
  const bad = { ...P.emptyProcess(), rows: [{ kind: 'move' as const, mode: 'J' as const, joints: [-90, -9.7, -68.3, -12, 0, -70.8] }, { kind: 'move' as const, mode: 'L' as const, joints: [90, -9.7, -68.3, -12, 0, -70.8] }] };
  await assert.rejects(play(bad), (e: unknown) => e instanceof RunError && e.line === 2 && /MOVE L/.test(e.message));
  console.log('  ok   an impossible MOVE L is refused on its row with a fix');
}

// Project file.
{
  const p = P.PRESETS[0];
  const text = P.processToFile(p);
  const back = P.processFromFile(text);
  assert.ok('process' in back);
  assert.deepEqual(back.process, p);
  assert.match(text, /"format": "physical-ai-lab\/process"/);
  for (const [bad, why] of [
    ['not json', /공정 파일/],
    ['{"format":"x"}', /공정 파일/],
    [JSON.stringify({ format: P.PROCESS_FORMAT, version: 2, rows: [] }), /새 버전/],
    [JSON.stringify({ format: P.PROCESS_FORMAT, version: 1, rows: [{ kind: 'move', mode: 'X', joints: null }] }), /1번 줄/],
    [JSON.stringify({ format: P.PROCESS_FORMAT, version: 1, rows: [{ kind: 'move', mode: 'J', joints: [1, 2] }] }), /1번 줄/],
  ] as const) {
    const r = P.processFromFile(bad);
    assert.ok('error' in r && why.test(r.error), bad);
  }
  console.log('  ok   project file round-trips and refuses malformed files');
}

// Rotation jog (RX · RY · RZ): the tool turns about a base axis by the asked angle and its tip stays put.
{
  const { turnTool } = await import('../../src/engine/robot/tool');
  const { forwardKinematicsFrames } = await import('../../src/engine/robot/kinematics');
  const { Quaternion } = await import('three');
  const quat = (j: number[]) => new Quaternion().setFromRotationMatrix(forwardKinematicsFrames(chain, j).at(-1)!);
  for (const axis of ['x', 'y', 'z'] as const) {
    const r = turnTool(chain, A, TCP, axis, 10);
    assert.ok(r.converged, `turn ${axis}`);
    const a = tcpPositionMm(chain, A, TCP);
    const b = tcpPositionMm(chain, r.anglesDeg, TCP);
    const moved = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const turned = (quat(A).angleTo(quat(r.anglesDeg)) * 180) / Math.PI;
    assert.ok(moved < 0.5, `R${axis.toUpperCase()}: tip moved ${moved.toFixed(2)} mm`);
    assert.ok(Math.abs(turned - 10) < 0.5, `R${axis.toUpperCase()}: turned ${turned.toFixed(2)}°`);
  }
  console.log('  ok   RX · RY · RZ jog turns the tool 10° about each base axis with the tip kept (< 0.5 mm)');
}

// Joint warnings shared by the 3D arm, the mini arm and its chips: amber, then red, with the reason.
{
  const { judge } = await import('../../src/engine/robot/jointAlert');
  assert.equal(judge(30, 90).level, 0);
  assert.deepEqual([judge(65, 90).level, judge(65, 90).why], [1, '부하 65%']);
  assert.deepEqual([judge(85, 90).level, judge(85, 90).why], [2, '부하 85%']);
  assert.deepEqual([judge(null, 8).level, judge(null, 8).why], [1, '한계까지 8°']);
  assert.deepEqual([judge(20, 2).level, judge(20, 2).why], [2, '한계까지 2°']);
  assert.equal(judge(null, 45).why, '');
  console.log('  ok   joint warnings: load 60 / 80 %, limit 10° / 3° → amber / red with the reason');
}

console.log('process: all checks passed');
