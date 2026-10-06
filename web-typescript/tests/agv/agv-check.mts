/**
 * Headless checks for the myAGV simulator: mecanum wheel maths, driving and
 * collisions in the classroom, the lidar, driver input, and the straight-line
 * calibration (a weak motor makes it curve; the saved trim straightens it).
 *
 * Run with: npm run check:agv
 */
import assert from 'node:assert/strict';

const S = await import('../../src/engine/agv/sim');
const { AGV_MODELS, AgvSim, LANE, STRAIGHT_TEST, blockedAt, bodyFor, driveCommand, scanLidar, straightOk, straightResult, trimFromRun, trimFromSide, wheelsFor } = S;
const model = AGV_MODELS.pi;
const deg = (r: number) => (r * 180) / Math.PI;

{
  // wheel maths: forward = all four the same way; left = diagonal pairs; turning left = right side forward
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const f = wheelsFor({ vx: 0.2, vy: 0, wz: 0 });
  assert.ok(close(f.fl, 5) && close(f.fr, 5) && close(f.rl, 5) && close(f.rr, 5));
  const l = wheelsFor({ vx: 0, vy: 0.2, wz: 0 });
  assert.ok(l.fl < 0 && l.fr > 0 && l.rl > 0 && l.rr < 0);
  const t = wheelsFor({ vx: 0, vy: 0, wz: 1 });
  assert.ok(t.fl < 0 && t.rl < 0 && t.fr > 0 && t.rr > 0);
  for (const v of [{ vx: 0.3, vy: -0.1, wz: 0.7 }, { vx: -0.2, vy: 0.25, wz: -1.1 }]) {
    const b = bodyFor(wheelsFor(v));
    assert.ok(close(b.vx, v.vx) && close(b.vy, v.vy) && close(b.wz, v.wz));
  }
  console.log('  ok   mecanum wheel speeds and back (ahead, sideways, turning)');
}

{
  // driving with equal motors goes where it is told
  const sim = new AgvSim(model);
  sim.gains = { fl: 1, fr: 1, rl: 1, rr: 1 };
  sim.reset({ x: -1, y: -0.8, th: 0 });
  sim.cmd = { vx: 0.2, vy: 0, wz: 0 };
  for (let i = 0; i < 300; i++) sim.step(0.02);
  assert.ok(Math.abs(sim.pose.y + 0.8) < 1e-6 && Math.abs(sim.pose.th) < 1e-9, 'equal motors go straight');
  assert.ok(sim.pose.x > -1 + 1.1 && sim.pose.x < -1 + 1.2, `6 s at 0.2 m/s ≈ 1.2 m less the start-up (${(sim.pose.x + 1).toFixed(3)})`);
  sim.cmd = { vx: 0, vy: 0.2, wz: 0 };
  const y0 = sim.pose.y;
  for (let i = 0; i < 100; i++) sim.step(0.02);
  assert.ok(sim.pose.y - y0 > 0.3 && Math.abs(sim.pose.th) < 1e-9, 'sideways to the left');
  sim.cmd = { vx: 0, vy: 0, wz: 1 };
  for (let i = 0; i < 100; i++) sim.step(0.02);
  assert.ok(deg(sim.pose.th) > 45, 'turning left (counter-clockwise)');
  assert.ok(sim.trail.length > 100, 'trail recorded');
  console.log(`  ok   driving: straight ${(sim.pose.x + 1).toFixed(2)} m, sideways, turning; trail ${sim.trail.length} points`);
}

{
  // it stops before running into a box, and the room's walls
  const sim = new AgvSim(model);
  const box = S.BOXES[0];
  sim.reset({ x: box.x - 0.6, y: box.y, th: 0 });
  sim.cmd = { vx: 0.3, vy: 0, wz: 0 };
  let blocked = null;
  for (let i = 0; i < 400 && !blocked; i++) blocked = sim.step(0.02).blocked;
  assert.equal(blocked, 'object');
  const gap = box.x - box.w / 2 - (sim.pose.x + model.size[0] / 2);
  assert.ok(gap > -0.001 && gap < 0.03, `stopped just before the box (${(gap * 100).toFixed(1)} cm)`);
  assert.deepEqual(sim.vel, { vx: 0, vy: 0, wz: 0 });
  assert.equal(blockedAt(model, S.ROOM.x1 - 0.1, 0, 0), 'wall');
  assert.equal(blockedAt(model, 0, 0, 0), null, 'the start is free');
  assert.equal(blockedAt(model, LANE.x0, LANE.y, 0), null, 'the calibration tape is free');
  assert.equal(blockedAt(model, LANE.x0 + 1.05, LANE.y, 0), null, 'the end of the tape is free');
  // without collisions (mirroring a real robot) it goes on
  const free = new AgvSim(model);
  free.reset({ x: box.x - 0.6, y: box.y, th: 0 });
  free.cmd = { vx: 0.3, vy: 0, wz: 0 };
  for (let i = 0; i < 150; i++) free.step(0.02, false);
  assert.ok(free.pose.x > box.x);
  console.log(`  ok   collisions: stops ${(gap * 100).toFixed(1)} cm before a box, walls, the start and the tape are free`);
}

{
  // lidar: facing the far wall from 1 m, the nearest thing ahead is the wall at ~1 m less the lidar offset
  const x = S.ROOM.x1 - 1;
  const scan = scanLidar(model, { x, y: -1.8, th: 0 }, 0);
  assert.ok(scan.front !== null && Math.abs(scan.front - (1 - model.lidar[0])) < 1e-6, `front ${scan.front}`);
  assert.ok(scan.points.length > 90 && scan.near !== null && scan.near <= scan.front!);
  const hit = scan.points.find(([, py]) => Math.abs(py + 1.8) < 0.02);
  assert.ok(hit && Math.abs(hit[0] - S.ROOM.x1) < 1e-6, 'the hit ahead lies on the wall');
  // a box in front is seen first
  const box = S.BOXES[0];
  const s2 = scanLidar(model, { x: box.x - 0.5, y: box.y, th: 0 }, 0);
  assert.ok(Math.abs(s2.front! - (0.5 - box.w / 2 - model.lidar[0])) < 1e-6);
  console.log(`  ok   lidar: wall ahead at ${scan.front!.toFixed(3)} m, ${scan.points.length} points; a box ahead at ${s2.front!.toFixed(3)} m`);
}

{
  // driver input: keys and joystick together, never faster than the top speed; turn limit
  const none = { joy: [0, 0] as [number, number], turn: 0, keys: new Set<string>(), pad: [0, 0, 0] as [number, number, number] };
  const w = driveCommand({ ...none, keys: new Set(['w']) }, 0.2);
  assert.deepEqual(w, { vx: 0.2, vy: 0, wz: 0 });
  const wa = driveCommand({ ...none, keys: new Set(['w', 'a']) }, 0.2);
  assert.ok(Math.abs(Math.hypot(wa.vx, wa.vy) - 0.2) < 1e-9 && wa.vy > 0, 'diagonal keeps the top speed');
  const joy = driveCommand({ ...none, joy: [0, -1], keys: new Set(['w']) }, 0.3);
  assert.ok(Math.abs(joy.vx - 0.3) < 1e-9, 'joystick up + W = ahead at top speed');
  const right = driveCommand({ ...none, joy: [1, 0] }, 0.2);
  assert.ok(right.vy < 0, 'joystick right = to the right (−Y)');
  const q = driveCommand({ ...none, keys: new Set(['q']) }, 0.5);
  assert.ok(q.wz > 0 && q.wz <= S.MAX_W, 'Q turns left, capped');
  assert.ok(driveCommand({ ...none, keys: new Set(['w']) }, 2).vx <= S.MAX_V, 'speed capped');
  console.log('  ok   driver input: keys, joystick and pad combined, top speed and turn capped');
}

{
  // straight-line calibration on the tape: the weak rear-right motor curves it; the trim fixes it
  const sim = new AgvSim(model);
  const run = () => {
    const start = { x: LANE.x0, y: LANE.y, th: 0 };
    sim.reset(start);
    sim.runScript({ vx: STRAIGHT_TEST.speed, vy: 0, wz: 0 }, STRAIGHT_TEST.seconds);
    let done = false;
    for (let i = 0; i < 2000 && !done; i++) done = sim.step(0.01).scriptDone;
    assert.ok(done && !sim.scripted, 'the test run ends by itself');
    for (let i = 0; i < 100; i++) sim.step(0.01);
    return straightResult(start, sim.pose);
  };
  const before = run();
  assert.ok(!straightOk(before) && Math.abs(before.d - 1) < 0.03, `1 m and visibly curved (${deg(before.dth).toFixed(1)}°, ${(before.side * 100).toFixed(1)} cm)`);
  sim.trim = trimFromRun(sim.trim, before);
  const after = run();
  assert.ok(straightOk(after), `after the trim: ${deg(after.dth).toFixed(2)}°, ${(after.side * 100).toFixed(2)} cm`);
  // heading hold alone also keeps it on the tape, without a saved trim
  sim.trim = { w: 0, y: 0 };
  sim.hold = true;
  const held = run();
  assert.ok(Math.abs(held.dth) < Math.abs(before.dth) / 4, `heading hold: ${deg(held.dth).toFixed(2)}°`);
  // the real robot's way: one number read off the tape
  const t = trimFromSide({ w: 0, y: 0 }, before.side);
  sim.hold = false;
  sim.trim = t;
  const tape = run();
  assert.ok(Math.abs(tape.side) < Math.abs(before.side) / 3, `from the tape reading only: ${(tape.side * 100).toFixed(2)} cm`);
  console.log(
    `  ok   straight-line calibration: ${deg(before.dth).toFixed(1)}° / ${(before.side * 100).toFixed(1)} cm → trim ${deg(after.dth).toFixed(2)}° / ${(after.side * 100).toFixed(2)} cm; ` +
      `gyro hold ${deg(held.dth).toFixed(2)}°; tape reading ${(tape.side * 100).toFixed(2)} cm`,
  );
}

console.log('\nmyAGV simulator validated.');
