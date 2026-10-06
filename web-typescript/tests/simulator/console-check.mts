/**
 * Headless checks for the classroom console against the official AI Kit:
 * kinematics vs the official kit data, reach of every kit work point with
 * every tool, the program language, whole sorting missions into the official
 * bins, the robot-script export, and the official vision pipeline.
 *
 * Run with: npm run check:console
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain, forwardKinematics, forwardKinematicsFrames } = await import('../../src/engine/robot/kinematics');
const { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN } = await import('../../src/engine/robot/limits');
const { quintic, jointTrajectory } = await import('../../src/engine/robot/motion');
const { shiftTool, solveToolDown } = await import('../../src/engine/robot/tool');
const K = await import('../../src/engine/simulator/board');
const { ABOVE_MM, ARUCO_6X6, BINS, BIN_NAMES, BLOCK_MM, BLOCK_START, BUTTON, CAL_BOARD, COLORS, COLOR_TO_BIN, DROP_CLEARANCE_MM, HOME_DEG, MARKERS, MARKER_MM, TOP_CAMERA, randomBlockLayout } = K;
const { EFFECTORS, tcpFor } = await import('../../src/engine/simulator/effectors');
const { binFor, parse, serialize, check, starterProgram } = await import('../../src/engine/simulator/program');
const { createWorld, runProgram, mission, RunError } = await import('../../src/engine/simulator/sim');
const { toPymycobot } = await import('../../src/engine/simulator/export');
const { detectKit, rgbToHsvCv, OFFICIAL_HSV, inRangeCv } = await import('../../src/engine/vision/color');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));

/* --- 1. Motion profile ----------------------------------------------------- */
{
  assert.equal(quintic(0), 0);
  assert.equal(quintic(1), 1);
  const traj = jointTrajectory([0, 0, 0, 0, 0, 0], [90, -30, 10, 0, 0, 45], 50);
  const mid = traj.sample(traj.durationS / 2);
  const fractions = [90, -30, 10, 45].map((d, k) => mid[[0, 1, 2, 5][k]] / d);
  assert.ok(Math.max(...fractions) - Math.min(...fractions) < 1e-9, 'joints must move in sync');
  const dt = 1e-4;
  const v = (traj.sample(traj.durationS / 2 + dt)[0] - traj.sample(traj.durationS / 2 - dt)[0]) / (2 * dt);
  assert.ok(Math.abs(v - 100) < 0.5, `peak joint speed ${v.toFixed(2)} deg/s, expected 100`);
  console.log(`  ok   quintic motion (90° at speed 50: ${traj.durationS.toFixed(2)} s, peak ${v.toFixed(1)}°/s)`);
}

/* --- 2. Kinematics vs the official AI Kit data ----------------------------- */
{
  // AiKit_UI main.py: the same four bin drop points as joint angles and as coordinates.
  const official: [string, number[], number[]][] = [
    ['D', [-24.87, -2.98, -92.46, 5.88, -3.07, -8.34], [132.2, -136.9, 200.8, -178.24, -3.72, -107.17]],
    ['C', [-13.71, -52.11, -25.4, -4.57, -3.86, -7.73], [238.8, -124.1, 204.3, -169.69, -5.52, -96.52]],
    ['A', [74.0, -18.1, -64.24, -9.84, -0.79, -9.49], [115.8, 177.3, 210.6, 178.06, -0.92, -6.11]],
    ['B', [112.93, 3.16, -96.32, 0.87, 0.26, -9.75], [-6.9, 173.2, 201.5, 179.93, 0.63, 33.83]],
  ];
  let worstXy = 0;
  let worstRot = 0;
  for (const [, q, c] of official) {
    const p = forwardKinematics(chain, q);
    worstXy = Math.max(worstXy, Math.hypot(p.position.x * 1000 - c[0], p.position.y * 1000 - c[1]));
    const d = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    worstRot = Math.max(worstRot, d(p.rpyDeg.x, c[3]), d(p.rpyDeg.y, c[4]), d(p.rpyDeg.z, c[5]));
  }
  assert.ok(worstXy < 5, `official bin angles land ${worstXy.toFixed(1)} mm from the official x/y`);
  assert.ok(worstRot < 4, `official bin orientations differ by ${worstRot.toFixed(1)}°`);
  // The official drop points A-D lie inside the bins of the official AI Kit 2023 model,
  // and every drop target leaves room for a 25 mm block.
  for (const n of ['A', 'B', 'C', 'D'] as const) {
    const b = BINS[n];
    assert.ok(Math.abs(b.official.x - b.x) < b.innerX / 2 && Math.abs(b.official.y - b.y) < b.innerY / 2, `official drop ${n} outside bin ${n}`);
    assert.ok(Math.abs(b.drop.x - b.x) <= b.innerX / 2 - BLOCK_MM / 2 && Math.abs(b.drop.y - b.y) <= b.innerY / 2 - BLOCK_MM / 2, `drop ${n} too close to a wall`);
  }
  // The two markers are 220 mm apart in |dx| + |dy|, the official constant.
  assert.equal(Math.abs(MARKERS[0].x - MARKERS[1].x) + Math.abs(MARKERS[0].y - MARKERS[1].y), 220);
  const home = forwardKinematicsFrames(chain, HOME_DEG).at(-1)!.elements;
  assert.ok(home[10] < -0.99, 'the official observation pose points the tool down');
  console.log(`  ok   official kit data: bin angles -> x/y within ${worstXy.toFixed(1)} mm, orientation within ${worstRot.toFixed(1)}°; drop points A-D inside the AI Kit 2023 bins`);
}

/* --- 3. Tool-down IK reaches every kit work point for every tool ----------- */
{
  const points: [string, { x: number; y: number; z: number }][] = [];
  const layouts = [BLOCK_START, ...Array.from({ length: 4 }, (_, k) => randomBlockLayout(seeded(100 + k)))];
  for (const layout of layouts) {
    for (const c of COLORS) {
      const b = layout[c.name];
      points.push([`${c.name} block`, { x: b.x, y: b.y, z: BLOCK_MM / 2 }]);
      points.push([`${c.name} block top`, { x: b.x, y: b.y, z: BLOCK_MM }]);
      points.push([`${c.name} above`, { x: b.x, y: b.y, z: BLOCK_MM + ABOVE_MM }]);
    }
  }
  for (const n of BIN_NAMES) {
    const b = BINS[n];
    for (const drop of [0, BLOCK_MM / 2, BLOCK_MM]) points.push([`bin ${n}`, { x: b.drop.x, y: b.drop.y, z: b.rimZ + DROP_CLEARANCE_MM + drop }]);
  }
  points.push(['button', { x: BUTTON.x, y: BUTTON.y, z: BUTTON.heightMm + 6 }]);
  const failures: string[] = [];
  let worst = 0;
  // Work points are where a tool picks, drops or presses; the bare flange ("도구 없음") does none of that.
  const tools = EFFECTORS.filter((e) => e.kind !== 'none');
  for (const e of tools) {
    for (const flange of [false, true]) {
      for (const [name, p] of points) {
        const r = solveToolDown(chain, p, HOME_DEG, { tcpMm: tcpFor(e.id, flange) });
        if (!r.converged) failures.push(`${e.id}${flange ? '+camera' : ''} ${name}`);
        worst = Math.max(worst, r.positionErrorM * 1000);
      }
    }
  }
  assert.equal(failures.length, 0, `unreachable: ${failures.join(', ')}`);
  console.log(`  ok   ${tools.length * 2 * points.length} kit work points reachable with every tool (worst ${worst.toFixed(2)} mm)`);
}

/* --- 4. Program language ---------------------------------------------------- */
{
  for (const e of EFFECTORS) {
    const code = starterProgram(e.id);
    const { steps, errors } = parse(code);
    assert.equal(errors.length, 0, `${e.id} starter: ${JSON.stringify(errors)}`);
    assert.equal(serialize(steps), code, `${e.id} starter must round-trip exactly`);
    assert.equal(check(steps, { effector: e.id, cameraFlange: false, poses: {} }).errors.length, 0);
  }
  assert.ok(check(parse(starterProgram('adaptive')).steps, { effector: 'pump', cameraFlange: false, poses: {} }).errors.some((p) => p.msg.includes('그리퍼 명령')));
  assert.equal(check(parse('x = hand_camera.find("빨강")').steps, { effector: 'pump', cameraFlange: false, poses: {} }).errors.length, 1);
  assert.equal(check(parse('robot.move_above(block)').steps, { effector: 'pump', cameraFlange: false, poses: {} }).errors.length, 1);
  assert.equal(parse('robot.move_above("분류함 E")\nrobot.jump()').errors.length, 2);
  assert.equal(parse('robot.move_above("분류함 d")').errors.length, 0);
  console.log('  ok   program language (round-trip, tool checks, bin names, clear errors)');
}

/* --- 4b. Timed moves ("2초 동안 …") --------------------------------------- */
{
  const code = 'from edu import robot\n\nrobot.move_joint(1, 60, time=3)\nrobot.move_joints([0, 0, 0, 0, 0, 0], time=4)\nrobot.move_joint(2, 10, time=0.1)\n';
  const { steps, errors } = parse(code);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(serialize(steps), code, 'timed moves must round-trip');
  assert.equal(check(steps, { effector: 'pump', cameraFlange: false, poses: {} }).errors.length, 1, 'time=0.1 is below the minimum');
  // Played in the simulator, each timed move takes about its time.
  const world = createWorld('pump', false);
  const durations: number[] = [];
  const actions: { type: string; speed?: number; sec?: number }[] = [];
  await runProgram(steps.slice(0, 2), {
    chain,
    world,
    poses: {},
    animate: async (d: number, frame: (t: number) => void) => {
      durations.push(d);
      frame(d);
    },
    see: async () => null,
    record: (a) => actions.push(a as { type: string; speed?: number }),
  });
  const total = durations.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 7) < 0.35, `timed moves took ${total.toFixed(2)} s, want 7`);
  assert.ok(actions.filter((a) => a.type === 'angles').every((a) => (a.speed ?? 0) >= 1 && (a.speed ?? 0) <= 50), 'speeds stay within the limit');
  console.log(`  ok   timed moves: round-trip, limits, played in ${total.toFixed(2)} s for 3 s + 4 s`);
}

/* --- 5. Missions in the simulator ------------------------------------------ */
const instantAnimate = async (durationS: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(durationS * 60));
  for (let k = 1; k <= n; k += 1) frame((durationS * k) / n);
};

function sortProgram(grab: string, release: string): string {
  const lines = ['from edu import robot, camera', '', 'robot.home()', release];
  for (const { name } of COLORS) {
    // Like the official program: back to the observation pose before every look.
    lines.push(
      'robot.home()',
      `block = camera.find("${name}")`,
      'robot.move_above(block)',
      'robot.move_down(block)',
      grab,
      'robot.move_above(block)',
      `robot.move_above("${binFor(name)}")`,
      release,
    );
  }
  lines.push('robot.home()');
  return lines.join('\n') + '\n';
}

type Eid = (typeof EFFECTORS)[number]['id'];
async function runMission(effector: Eid, cameraFlange: boolean, code: string, layout = BLOCK_START) {
  const world = createWorld(effector, cameraFlange, layout);
  const { steps, errors } = parse(code);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(check(steps, { effector, cameraFlange, poses: {} }).errors.length, 0);
  const warnings: string[] = [];
  const actions: Parameters<typeof toPymycobot>[0][number][] = [];
  try {
    await runProgram(steps, {
      chain,
      world,
      poses: {},
      animate: instantAnimate,
      see: async (_cam, color) => {
        const b = world.blocks.find((k) => k.color === color)!;
        return { x: b.x, y: b.y };
      },
      log: (kind, msg) => {
        if (kind === 'warn') warnings.push(msg);
      },
      record: (a) => actions.push(a),
    });
  } catch (err) {
    if (err instanceof RunError) throw new Error(`${effector}${cameraFlange ? '+camera' : ''}: line ${err.line}: ${err.message} / ${err.fix ?? ''}`);
    throw err;
  }
  return { world, warnings, actions };
}

const grab = { grip: 'robot.gripper.close()', suction: 'robot.pump.on()' };
const release = { grip: 'robot.gripper.open()', suction: 'robot.pump.off()' };
{
  for (const e of EFFECTORS.filter((x) => (x.kind === 'grip' && x.id !== 'parallel') || x.kind === 'suction')) {
    for (const flange of [false, true]) {
      const kind = e.kind as 'grip' | 'suction';
      const { world, warnings } = await runMission(e.id, flange, sortProgram(grab[kind], release[kind]));
      assert.equal(mission(world).done, 4, `${e.id}${flange ? '+camera' : ''}: ${mission(world).done}/4 sorted`);
      assert.equal(warnings.length, 0, `${e.id}: ${warnings.join(' / ')}`);
      for (const b of world.blocks) {
        const bin = BINS[COLOR_TO_BIN[b.color]];
        assert.ok(Math.abs(b.z - (bin.floorZ + BLOCK_MM / 2)) < 0.5 || b.z > bin.floorZ, `${b.color} rests in bin ${bin.name}`);
      }
    }
  }
  console.log('  ok   colour sorting into the official bins (red D, green C, blue A, yellow B): adaptive, flexible, pump, with and without camera flange');

  for (let k = 0; k < 6; k += 1) {
    const layout = randomBlockLayout(seeded(7 + k));
    const { world } = await runMission('pump', false, sortProgram(grab.suction, release.suction), layout);
    assert.equal(mission(world).done, 4, `shuffled layout ${k}: ${JSON.stringify(layout)}`);
  }
  console.log('  ok   sorting from 6 shuffled layouts on the calibration board');

  // The parallel gripper opens to 20 mm: it must refuse a 25 mm block, with the reason.
  await assert.rejects(runMission('parallel', false, sortProgram(grab.grip, release.grip)), /최대 20mm/);
  console.log('  ok   parallel gripper (max 20 mm, datasheet) refuses the 25 mm kit blocks with the reason');

  {
    const code = sortProgram(grab.suction, release.suction);
    const { actions } = await runMission('pump', false, code);
    const script = toPymycobot(actions, 'pump', code);
    for (const line of script.split('\n').filter((l) => l.startsWith('move('))) {
      const angles = JSON.parse(line.slice(5, line.lastIndexOf(']') + 1)) as number[];
      angles.forEach((a, i) => assert.ok(a >= JOINT_ANGLE_MIN[i] && a <= JOINT_ANGLE_MAX[i], line));
    }
    const py = spawnSync('python3', ['-c', 'import sys; compile(sys.stdin.read(), "robot.py", "exec")'], { input: script });
    if (!py.error) assert.equal(py.status, 0, `exported script is not valid Python: ${py.stderr}`);
    console.log(`  ok   robot script export (${script.split('\n').filter((l) => l.startsWith('move(')).length} joint moves, valid Python, all in limits)`);
  }
  {
    const { world } = await runMission('pen', false, starterProgram('pen'));
    assert.equal(mission(world).done, mission(world).total);
    const { world: w2 } = await runMission('cylinder', false, starterProgram('cylinder'));
    assert.equal(w2.buttonPresses, 3);
    await runMission('phone', true, starterProgram('phone'));
    console.log('  ok   pen drawing, cylinder button, phone holder');
  }
  // Collisions.
  await assert.rejects(runMission('adaptive', false, 'from edu import robot, camera\nrobot.gripper.close()\nblock = camera.find("빨강")\nrobot.move_down(block)\n'), /부딪혀요|닿아요/);
  await assert.rejects(runMission('adaptive', false, 'from edu import robot\nrobot.move_to(160, 0, 5)\n'), /판에 닿아요/);
  // Carrying a block low across to a bin hits its wall.
  await assert.rejects(
    runMission('pump', false, 'from edu import robot, camera\nblock = camera.find("빨강")\nrobot.move_above(block)\nrobot.move_down(block)\nrobot.pump.on()\nrobot.move_to(132, -110, 60)\n'),
    /벽에 부딪혀요/,
  );
  console.log('  ok   collisions stop the program (block, plate, bin wall)');
}

/* --- 6. Official vision pipeline -------------------------------------------- */
{
  // Official HSV ranges accept the kit block colours (and only their own).
  for (const c of COLORS) {
    const hex = c.hex;
    const hsv = rgbToHsvCv(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    const first = OFFICIAL_HSV.find((r) => inRangeCv(hsv, r));
    assert.equal(first?.color, c.name, `${c.name} ${hex} HSV ${hsv} classified as ${first?.official}`);
  }

  // Synthetic straight-down frames, image up = -x, right = +y: 2 px/mm (the old kit
  // photo's scale) and 0.93 px/mm (the AI Kit 2023 camera: 86.1° across 640 px, 368 mm up).
  const scales = [2, 640 / (2 * TOP_CAMERA.z * Math.tan((TOP_CAMERA.hfovDeg * Math.PI) / 360))];
  for (const pxPerMm of scales) {
    const width = 640;
    const height = 480;
    const c0 = { u: 320, v: 240 }; // board centre in the image
    const toPx = (x: number, y: number) => ({ u: c0.u + (y - CAL_BOARD.y) * pxPerMm, v: c0.v + (x - CAL_BOARD.x) * pxPerMm });
    const data = new Uint8ClampedArray(width * height * 4);
    const fill = (u0: number, v0: number, w: number, h: number, rgb: number[]) => {
      for (let v = Math.round(v0); v < Math.round(v0 + h); v += 1)
        for (let u = Math.round(u0); u < Math.round(u0 + w); u += 1) if (u >= 0 && v >= 0 && u < width && v < height) data.set([...rgb, 255], (v * width + u) * 4);
    };
    fill(0, 0, width, height, [22, 24, 27]); // black plate
    const tl = toPx(CAL_BOARD.x - 75, CAL_BOARD.y - 75);
    fill(tl.u, tl.v, 150 * pxPerMm, 150 * pxPerMm, [246, 247, 247]); // white board
    for (const m of MARKERS) {
      const p = toPx(m.x, m.y);
      const s = MARKER_MM * pxPerMm;
      fill(p.u - s / 2, p.v - s / 2, s, s, [14, 15, 16]);
      const bits = ARUCO_6X6[m.id];
      for (let r = 0; r < 6; r += 1) for (let k = 0; k < 6; k += 1) if (bits[r * 6 + k] === '1') fill(p.u - s / 2 + ((k + 1) * s) / 8, p.v - s / 2 + ((r + 1) * s) / 8, s / 8, s / 8, [246, 247, 247]);
    }
    const truth = { 빨강: { x: 130, y: -30 }, 초록: { x: 190, y: 25 } } as const;
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    for (const [name, p] of Object.entries(truth)) {
      const q = toPx(p.x, p.y);
      const half = (BLOCK_MM / 2) * pxPerMm;
      fill(q.u - half, q.v - half, 2 * half, 2 * half, hex(K.COLOR_HEX[name as keyof typeof K.COLOR_HEX]));
    }
    const k = detectKit({ data, width, height });
    const tag = `${pxPerMm.toFixed(2)} px/mm`;
    assert.deepEqual(k.markers.map((m) => m.id), [1, 2], `${tag}: markers ${k.markers.map((m) => m.id)}`);
    assert.ok(k.calibration && Math.abs(k.calibration.ratio - 1 / pxPerMm) < 0.02 / pxPerMm, `${tag}: ratio ${k.calibration?.ratio}`);
    const tol = 1.5 / Math.min(1, pxPerMm) + 1; // a pixel or so
    for (const [name, p] of Object.entries(truth)) {
      const b = k.blobs.find((x) => x.color === name)!;
      assert.ok(b?.robot && Math.hypot(b.robot.x - p.x, b.robot.y - p.y) < tol, `${tag}: ${name} at ${JSON.stringify(b?.robot)} not ${JSON.stringify(p)}`);
    }
    assert.equal(k.blobs.length, 2, `${tag}: markers and the board must not be taken for blocks`);
  }
  console.log(`  ok   official vision at 2 and ${scales[1].toFixed(2)} px/mm (AI Kit 2023 camera): ArUco ids 1·2 decoded, blocks located to about a pixel`);
}


{
  // Coordinate jog: the tip moves in a straight line with the tool held as it is, even when it is not pointing down.
  for (const start of [HOME_DEG, [0, 20, -60, 0, 0, 0], [30, 30, -80, -20, 20, 0], [-40, 20, -70, 10, -30, 0]]) {
    const before = forwardKinematicsFrames(chain, start).at(-1)!;
    for (const [axis, d] of [['x', 20], ['y', -20], ['z', 20], ['z', -20]] as const) {
      const r = shiftTool(chain, start, { x: 0, y: 0, z: 0, [axis]: d });
      assert.ok(r.converged, `shift ${axis}${d} from [${start}] did not solve`);
      const after = forwardKinematicsFrames(chain, r.anglesDeg).at(-1)!;
      const moved = { x: (after.elements[12] - before.elements[12]) * 1000, y: (after.elements[13] - before.elements[13]) * 1000, z: (after.elements[14] - before.elements[14]) * 1000 };
      for (const k of ['x', 'y', 'z'] as const) assert.ok(Math.abs(moved[k] - (k === axis ? d : 0)) < 1, `shift ${axis}${d}: ${k} moved ${moved[k].toFixed(2)} mm`);
      const turn = Math.max(...r.anglesDeg.map((a, i) => Math.abs(a - start[i])));
      assert.ok(turn < 30, `shift ${axis}${d} from [${start}] turned a joint ${turn.toFixed(1)}°`);
    }
  }
  // One jog frame (half a millimetre) must move the arm, not be taken as already there.
  const small = shiftTool(chain, HOME_DEG, { x: 0, y: 0, z: 0.5 });
  const lift = (forwardKinematicsFrames(chain, small.anglesDeg).at(-1)!.elements[14] - forwardKinematicsFrames(chain, HOME_DEG).at(-1)!.elements[14]) * 1000;
  assert.ok(small.converged && Math.abs(lift - 0.5) < 0.1, `a 0.5 mm jog frame moved ${lift.toFixed(3)} mm`);
  console.log('  ok   coordinate jog keeps the tool as held (home, upright and two tilted poses; x, y, z ±20 mm)');
}

console.log('\nConsole validated against the AI Kit.');

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
}
