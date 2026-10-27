/**
 * The Python levels (중급 pymycobot, 고급 ROS 2) against the simulator:
 * the simulated pymycobot behaves like the real library (non-blocking moves,
 * readings mid-motion, its own parameter errors), send_coords is solved by
 * IK and lands where get_coords says, the pump follows the RDK X5 GPIO pins,
 * a pick-and-place program sorts a block on the AI Kit through the 3D
 * playback, a collision points at the right line, and a ROS 2 node drives
 * the arm through the official driver's /joint_states subscription.
 *
 * Run with: npm run check:python
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { loadPyodide } = await import('pyodide');
const { runScript } = await import('../../src/engine/python/engine');
const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain, liftChain } = await import('../../src/engine/robot/kinematics');
const { createWorld, playTimeline, RunError, blocksSorted } = await import('../../src/engine/simulator/sim');
const { HOME_DEG, BLOCK_START, KIT_RISE_MM } = await import('../../src/engine/simulator/board');

const robot = parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8'));
const chain = buildChain(robot);
// On the AI kit the robot stands KIT_RISE_MM above the plate (as the console lifts it); Python speaks the robot's own frame.
const kitChain = liftChain(chain, KIT_RISE_MM);
const py = (await loadPyodide()) as unknown as Parameters<typeof runScript>[0];
const run = (code: string, mode: 'python' | 'ros' = 'python') => runScript(py, code, { robot, startAngles: HOME_DEG.slice(), mode });
const instant = async (d: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(d * 60));
  for (let k = 1; k <= n; k += 1) frame((d * k) / n);
};

/* --- pymycobot behaviour ---------------------------------------------------- */
{
  const r = run(`from pymycobot import MyCobot280RDKX5
import time
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
print(mc.get_angles())
mc.send_angles([0, 0, 0, 0, 0, 0], 30)
time.sleep(0.5)
print(mc.is_moving(), mc.get_angles()[1])
mc.sync_send_angles([10, 20, -30, 0, 0, 0], 40)
print(mc.is_moving(), mc.get_angles())
`);
  assert.ok(r.ok, JSON.stringify(r.error));
  const out = r.output.map((o) => o.text);
  assert.deepEqual(JSON.parse(out[0]), [0.61, 45.87, -92.37, -41.3, 2.02, 9.58]);
  const [moving, j2] = out[1].split(' ');
  assert.equal(moving, '1', 'send_angles does not wait');
  assert.ok(Number(j2) > 0 && Number(j2) < 45.87, `J2 mid-motion ${j2}`);
  assert.match(out[2], /^0 \[10(\.0)?, 20(\.0)?, -30(\.0)?/, 'sync_send_angles waits for arrival');
  assert.equal(r.events.filter((e) => e.kind === 'move').length, 2);
  console.log('  ok   pymycobot: send_angles returns at once, get_angles mid-motion, sync_send_angles waits');
}
{
  const r = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.sync_send_angles([0, 20, -60, -40, 0, 0], 50)
c = mc.get_coords()
c[0] += 20
c[2] -= 30
mc.sync_send_coords(c, 40)
d = mc.get_coords()
print(max(abs(a - b) for a, b in zip(c[:3], d[:3])))
`);
  assert.ok(r.ok, JSON.stringify(r.error));
  assert.ok(Number(r.output[0].text) < 1.5, `send_coords lands ${r.output[0].text} mm off`);
  console.log(`  ok   send_coords solved by IK, get_coords agrees (${Number(r.output[0].text).toFixed(2)} mm)`);
}
{
  const r = run(`import Hobot.GPIO as GPIO
import time
GPIO.setmode(GPIO.BOARD)
GPIO.setup(37, GPIO.OUT)
GPIO.output(37, GPIO.HIGH)
GPIO.setup(31, GPIO.OUT)
GPIO.output(31, GPIO.HIGH)
GPIO.output(31, GPIO.HIGH)
time.sleep(0.05)
GPIO.output(37, GPIO.LOW)
time.sleep(1)
GPIO.output(31, GPIO.LOW)
time.sleep(0.05)
GPIO.output(37, GPIO.HIGH)
`);
  const pumps = r.events.filter((e) => e.kind === 'pump');
  assert.deepEqual(pumps.map((e) => (e.kind === 'pump' ? [e.on, e.line] : null)), [[true, 10], [false, 14]]);
  console.log('  ok   pump on/off from Hobot.GPIO BOARD 31/37, the RDK X5 vision kit sequence');
}
{
  const bad = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.send_angles([0, 0, 0, 0, 170, 0], 50)
`);
  assert.equal(bad.error?.line, 3);
  assert.match(bad.error!.message, /should be in -155 ~ 160, but received 170/);
  const typo = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.send_angle(1, 30, speed)
`);
  assert.equal(typo.error?.type, 'NameError');
  assert.equal(typo.error?.line, 3);
  assert.match(typo.error!.hint!, /'speed'/);
  const syntax = run('for i in range(3)\n    print(i)\n');
  assert.equal(syntax.error?.type, 'SyntaxError');
  assert.equal(syntax.error?.line, 1);
  const endless = run('import time\nwhile True:\n    time.sleep(1)\n');
  assert.match(endless.error!.message, /300초/);
  console.log('  ok   errors: pymycobot range message with its line, NameError/SyntaxError explained, endless loop stopped');
}

/* --- 3D playback on the AI Kit ---------------------------------------------- */
{
  // A block 165 mm out: close to the base (x 135) a straight-down tool needs J3 past its limit.
  const layout = { ...BLOCK_START, 빨강: { x: 165, y: -60 } };
  const red = layout['빨강'];
  const code = `from pymycobot import MyCobot280RDKX5
import Hobot.GPIO as GPIO
import time

mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
GPIO.setmode(GPIO.BOARD)
GPIO.setup(37, GPIO.OUT)
GPIO.setup(31, GPIO.OUT)

def pump(on):
    GPIO.output(31, GPIO.HIGH if on else GPIO.LOW)
    time.sleep(0.05)
    GPIO.output(37, GPIO.LOW if on else GPIO.HIGH)
    time.sleep(0.5)

pump(False)
mc.sync_send_coords([${red.x}, ${red.y}, 180, -180, 0, -90], 40)
mc.sync_send_coords([${red.x}, ${red.y}, ${114 - KIT_RISE_MM}, -180, 0, -90], 20)
pump(True)
mc.sync_send_coords([${red.x}, ${red.y}, 200, -180, 0, -90], 40)
mc.sync_send_coords([132.2, -136.9, 200.8, -178.24, -3.72, -107.17], 40)
pump(False)
mc.sync_send_angles([0.61, 45.87, -92.37, -41.3, 2.02, 9.58], 40)
`;
  const r = run(code);
  assert.ok(r.ok, JSON.stringify(r.error));
  const world = createWorld('pump', false, layout, 'kit');
  const logs: string[] = [];
  const actions = await playTimeline(r, { chain: kitChain, world, poses: {}, animate: instant, see: async () => null, log: (_k, m) => logs.push(m) });
  assert.equal(blocksSorted(world), 1, `red block in bin D: ${logs.join(' / ')}`);
  assert.ok(actions.every((a) => a.type === 'timed') && actions.some((a) => a.type === 'timed' && a.cmd === 'pump' && a.on));
  console.log(`  ok   Python pick-and-place on the AI Kit: red block into bin D (${actions.length} timed commands for the robot)`);

  const crash = run(`from pymycobot import MyCobot280RDKX5
import time
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.sync_send_angles([0, 0, 0, 0, 0, 0], 40)
mc.send_angles([0, 100, 40, 0, 0, 0], 40)
time.sleep(3)
`);
  await assert.rejects(
    playTimeline(crash, { chain: kitChain, world: createWorld('pump', false, BLOCK_START, 'kit'), poses: {}, animate: instant, see: async () => null }),
    (err: unknown) => err instanceof RunError && err.line === 5 && err.collision,
  );
  console.log('  ok   a collision during playback points at the line that sent the move');
}

/* --- ROS 2 ---------------------------------------------------------------------- */
{
  const r = run(
    `import math
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState


class Waver(Node):
    def __init__(self):
        super().__init__("waver")
        self.pub = self.create_publisher(JointState, "joint_states", 10)
        self.k = 0
        self.create_timer(0.5, self.tick)

    def tick(self):
        msg = JointState()
        msg.position = [math.radians(20 * math.sin(self.k / 2)), 0.0, 0.0, 0.0, 0.0, 0.0]
        self.pub.publish(msg)
        self.k += 1
        if self.k > 6:
            rclpy.shutdown()


rclpy.init()
rclpy.spin(Waver())
`,
    'ros',
  );
  assert.ok(r.ok, JSON.stringify(r.error));
  const moves = r.events.filter((e) => e.kind === 'move');
  assert.ok(moves.length >= 6 && moves.every((e) => e.line === 17), `driver moves from the publish line: ${moves.map((e) => e.line)}`);
  const names = r.ros!.graph.nodes.map((n) => n.name).sort();
  assert.deepEqual(names, ['control_slider', 'waver']);
  assert.ok(r.ros!.messages.every((m) => m.topic === '/joint_states' && m.type === 'sensor_msgs/JointState'));
  console.log(`  ok   ROS 2: node publishes /joint_states, the official driver (control_slider) moves the arm (${moves.length} moves)`);
}

/* --- every starter program of the 중급 and 고급 practices ------------------------ */
{
  const { practicesFor, newSession, placedBlocks } = await import('../../src/engine/simulator/practices');
  for (const level of ['python', 'ros'] as const) {
    for (const theme of ['kit', 'arm'] as const) {
      const session = newSession();
      for (const p of practicesFor(level, theme)) {
        // 엔드이펙터 교체: once with the practice's gripper, once with the suction pump.
        const tools = p.id === 'tools' ? [p.effector, 'pump' as const] : [p.effector];
        let world = createWorld(p.effector, false, BLOCK_START, theme);
        for (const effector of tools) {
          const r = runScript(py, p.starter(effector, theme), { robot, startAngles: HOME_DEG.slice(), mode: level });
          assert.ok(r.ok, `${level}/${theme}/${p.id}/${effector}: ${JSON.stringify(r.error)}`);
          world = createWorld(effector, p.cameraFlange ?? false, BLOCK_START, theme);
          const logs: string[] = [];
          try {
            await playTimeline(r, { chain: theme === 'kit' ? kitChain : chain, world, poses: {}, animate: instant, see: async () => null, log: (k, m) => k === 'warn' && logs.push(m) });
          } catch (err) {
            throw new Error(`${level}/${theme}/${p.id}/${effector}: ${err instanceof Error ? err.message : err} (line ${(err as { line?: number }).line})`);
          }
          assert.deepEqual(logs, [], `${level}/${theme}/${p.id}: warnings ${logs.join(' / ')}`);
          if (r.ros) session.lastRos = r.ros;
          if (placedBlocks(world) > 0) session.pickTools.add(effector);
        }
        if (p.action === 'api') session.apiRuns += 1;
        const m = p.progress(world, session);
        if (p.id !== 'free') assert.ok(m.total > 0 && m.done >= m.total, `${level}/${theme}/${p.id}: progress ${m.done}/${m.total} (${m.title})`);
        session.pickTools.clear();
      }
      console.log(`  ok   ${level === 'python' ? '중급' : '고급'} · ${theme === 'kit' ? 'AI 키트' : '로봇팔 단독'}: every starter runs, plays without collision and completes its practice`);
    }
  }
}

/* --- every arm: each arm-only practice at every level, and the pump the way its board does it ---- */
{
  const { ARMS, setActiveArm } = await import('../../src/engine/robot/arms');
  const { practicesFor, newSession, placedBlocks } = await import('../../src/engine/simulator/practices');
  const { practiceUsesMat, setMatNeeded } = await import('../../src/engine/simulator/desk');
  const { parse, check } = await import('../../src/engine/simulator/program');
  const { runProgram } = await import('../../src/engine/simulator/sim');
  const seen = new Set<string>();
  for (const spec of Object.values(ARMS)) {
    if (!spec || spec.id === 'mycobot280-rdkx5') continue;
    setActiveArm(spec.id);
    const armRobot = parseUrdf(readFileSync(new URL(`../../public${spec.urdf}`, import.meta.url), 'utf8'));
    const armChain = buildChain(armRobot);
    const done: string[] = [];
    for (const level of ['basic', 'python', 'ros'] as const) {
      const session = newSession();
      for (const p of practicesFor(level, 'arm')) {
        setMatNeeded(practiceUsesMat(p.id));
        const tools = p.id === 'tools' ? [p.effector, 'pump' as const] : [p.effector];
        let world = createWorld(p.effector, false, BLOCK_START, 'arm');
        for (const effector of tools) {
          const code = p.starter(effector, 'arm');
          const where: string = `${spec.id} ${level}/${p.id}/${effector}`;
          world = createWorld(effector, false, BLOCK_START, 'arm');
          if (level === 'basic') {
            const { steps, errors } = parse(code);
            assert.equal(errors.length, 0, `${where}: ${JSON.stringify(errors)}`);
            const poses = { '내 자세 1': [30, 20, -60, -40, 0, 0], '내 자세 2': [-30, 10, -50, -50, 0, 0], '내 자세 3': [0, 30, -90, -20, 0, 0] };
            assert.equal(check(steps, { theme: 'arm', effector, cameraFlange: false, poses }).errors.length, 0, where);
            try {
              await runProgram(steps, { chain: armChain, world, poses, animate: instant, see: async () => null });
            } catch (err) {
              throw new Error(`${where}: ${err instanceof Error ? err.message : err} (line ${(err as { line?: number }).line})`);
            }
          } else {
            // As in the browser's web worker, where nothing has set the arm: the run brings its own.
            setActiveArm('mycobot280-rdkx5');
            const r = runScript(py, code, { robot: armRobot, startAngles: spec.home.slice(), mode: level, armId: spec.id });
            assert.ok(r.ok, `${where}: ${JSON.stringify(r.error)}`);
            if (level === 'python' && p.id === 'place' && spec.tools.includes('pump')) {
              const marker = { hobot: 'Hobot.GPIO', rpi: 'RPi.GPIO', basic25: 'set_basic_output(5', basic12: 'set_basic_output(1', none: 'def pump' }[spec.pump];
              assert.ok(code.includes(marker), `${where}: pump code should use ${marker}`);
              const pumps = r.events.filter((e) => e.kind === 'pump').map((e) => (e.kind === 'pump' ? e.on : null));
              assert.deepEqual(pumps, [true, false], `${where}: pump ${JSON.stringify(pumps)}`);
              seen.add(spec.pump);
            }
            if (level === 'ros') assert.ok(code.includes(`"${spec.ros.joints[0]}"`) || !code.includes('msg.name'), `${where}: joint names`);
            try {
              await playTimeline(r, { chain: armChain, world, poses: {}, animate: instant, see: async () => null });
            } catch (err) {
              throw new Error(`${where}: ${err instanceof Error ? err.message : err} (line ${(err as { line?: number }).line})`);
            }
            if (r.ros) session.lastRos = r.ros;
          }
          if (placedBlocks(world) > 0) session.pickTools.add(effector);
        }
        if (p.action === 'api') session.apiRuns += 1;
        const m = p.progress(world, session);
        if (p.id !== 'free' && p.id !== 'teach') assert.ok(m.total > 0 && m.done >= m.total, `${spec.id} ${level}/${p.id}: progress ${m.done}/${m.total} (${m.title})`);
        session.pickTools.clear();
        done.push(`${level[0]}:${p.id}`);
      }
    }
    console.log(`  ok   ${spec.name} ${spec.board}: ${done.length} practices (블록 · 파이썬 · ROS 2) run and complete`);
  }
  setActiveArm('mycobot280-rdkx5');
  setMatNeeded(true);
  console.log(`  ok   suction pump per board (${[...seen].join(', ')}): the starter turns it on and off the official way`);
}

console.log('\nPython levels validated.');
