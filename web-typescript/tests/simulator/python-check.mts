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
{
  // send_coords(coords, speed, coord_mode): 1 = linear, the tool on the straight line; 0 = joint move, off it.
  const off = (mode: number) =>
    run(`from pymycobot import MyCobot280RDKX5
import math, time
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.sync_send_angles([0, 20, -60, -40, 0, 0], 50)
a = mc.get_coords()
b = list(a)
b[0] += 60
b[1] += 40
b[2] -= 50
mc.send_coords(b, 40, ${mode})
worst = 0
while mc.is_moving():
    time.sleep(0.05)
    p = mc.get_coords()[:3]
    ab = [b[i] - a[i] for i in range(3)]
    ap = [p[i] - a[i] for i in range(3)]
    f = max(0, min(1, sum(x * y for x, y in zip(ab, ap)) / sum(x * x for x in ab)))
    worst = max(worst, math.dist(p, [a[i] + ab[i] * f for i in range(3)]))
print(round(worst, 2), round(math.dist(mc.get_coords()[:3], b[:3]), 2))
`);
  const lin = off(1);
  const joint = off(0);
  assert.ok(lin.ok && joint.ok, JSON.stringify(lin.error ?? joint.error));
  const [linOff, linEnd] = lin.output[0].text.split(' ').map(Number);
  const [jointOff] = joint.output[0].text.split(' ').map(Number);
  assert.ok(linOff < 2 && linEnd < 1.5, `linear: ${linOff} mm off the line, ends ${linEnd} mm away`);
  assert.ok(jointOff > 3 * linOff, `coord_mode 0 is a joint move (${jointOff} mm off the line), 1 is straight (${linOff} mm)`);
  assert.ok(lin.events.filter((e) => e.kind === 'move' && e.line === 10).length > 3, 'a linear move is sent as steps along the line');

  const modes = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.send_coords([150, -60, 200, -180, 0, -90], 40, coord_mode=1)
mc.send_coords([150, -60, 200, -180, 0, -90], 40, 2)
`);
  assert.equal(modes.error?.line, 4);
  assert.equal(modes.error?.message, 'The coord_mode not right, should be in (0, 1), but received 2.');
  assert.match(modes.error!.hint!, /직선 이동/);
  // pymycobot's MyCobot280RDKX5.send_coords has no `mode` keyword (coord_mode); sync_send_coords keeps `mode`.
  const kw = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.sync_send_coords([150, -60, 200, -180, 0, -90], 40, mode=1)
mc.send_coords([150, -60, 200, -180, 0, -90], 40, mode=1)
`);
  assert.equal(kw.error?.type, 'TypeError');
  assert.equal(kw.error?.line, 4);

  // An unreachable target: the real arm stays put and the program goes on, with one line saying so.
  const far = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.send_coords([250, 250, 300, -180, 0, 0], 40)
mc.send_coords([250, 250, 300, -180, 0, 0], 40, 1)
print("next", mc.is_moving())
`);
  assert.ok(far.ok, JSON.stringify(far.error));
  assert.deepEqual(
    far.output.map((o) => o.text.match(/^\[시뮬레이터\] (\d)번째 줄: 좌표 \[250, 250, 300, -180, 0, 0\] 에는 갈 수 없어요/)?.[1] ?? o.text),
    ['3', '4', 'next 0'],
  );
  assert.equal(far.events.length, 0);
  console.log(`  ok   send_coords coord_mode 1 goes straight (${linOff} mm off the line, joint move ${jointOff} mm), coord_mode checked, unreachable = warning, not an error`);
}
{
  const r = run(`from pymycobot import MyCobot280RDKX5
import time
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.sync_send_angles([0, 20, -60, -40, 0, 0], 50)
mc.jog_angle(1, 1, 20)
time.sleep(1)
j1 = mc.get_angles()[0]
mc.stop()
time.sleep(1.5)
held = mc.get_angles()[0]
time.sleep(1)
print(j1, held, mc.get_angles()[0], mc.is_moving())
c = mc.get_coords()
mc.jog_coord(3, 0, 20)
time.sleep(1)
d = mc.get_coords()
mc.stop()
time.sleep(1.5)
print(c[2] - d[2], max(abs(d[i] - c[i]) for i in (0, 1, 3, 4, 5)))
c = mc.get_coords()
mc.jog_increment_coord(1, 15, 30)
time.sleep(3)
print(mc.get_coords()[0] - c[0])
mc.jog_angle(6, 0, 50)
time.sleep(10)
print(mc.get_angles()[5], mc.is_moving())
`);
  assert.ok(r.ok, JSON.stringify(r.error));
  const [j1, held, later, moving] = r.output[0].text.split(' ');
  assert.ok(Number(j1) > 10 && Number(j1) < 60, `jog_angle at speed 20 for 1 s: J1 ${j1}`);
  assert.ok(Number(held) >= Number(j1) && Number(held) === Number(later) && moving === '0', `stop() ends the jog: ${r.output[0].text}`);
  const [down, drift] = r.output[1].text.split(' ').map(Number);
  assert.ok(down > 5 && drift < 1, `jog_coord z-: ${down} mm down, the rest drifts ${drift}`);
  assert.ok(Math.abs(Number(r.output[2].text) - 15) < 1, `jog_increment_coord x +15: ${r.output[2].text}`);
  assert.match(r.output[3].text, /^-180(\.0)? 0$/, 'a jog without stop() ends at the joint limit');
  assert.ok(r.events.some((e) => e.kind === 'move' && e.what === 'jog_coord') && r.events.filter((e) => e.kind === 'stop').length === 2);

  // pymycobot 4.0.x (MyCobot280RDKX5) checks jog_increment_angle with id= and fails with TypeError: the simulator does too.
  const inc = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.jog_increment_angle(1, 10, 30)
`);
  assert.equal(inc.error?.type, 'TypeError');
  assert.equal(inc.error?.line, 3);
  assert.match(inc.output.map((o) => o.text).join('\n'), /send_angle\(joint_id/);
  const bad = run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.jog_coord(2, -1, 30)
`);
  assert.equal(bad.error?.message, 'The direction not right, should be in (0, 1), but received -1.');
  console.log(`  ok   jog_angle / jog_coord run until stop() or a limit (J1 ${Number(j1).toFixed(1)}° in 1 s, z ${down.toFixed(1)} mm), jog_increment_coord, jog_increment_angle fails as in pymycobot 4.0.x`);
}
{
  const r = run(`from pymycobot import MyCobot280RDKX5, MyCobot280
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.set_gripper_state(gripper_state=1, gripper_speed=50, gripper_type=1, is_torque=1)
print(mc.get_gripper_value())
mc.set_gripper_value(60, 50, 1, is_torque=0)
print(mc.get_gripper_value(gripper_type=1))
mc.set_gripper_state(254, 50)
print(mc.get_gripper_value())
mc.set_gripper_state(0, 0)
print(mc.get_gripper_value())
MyCobot280("/dev/ttyAMA0", 1000000).set_gripper_state(flag=1, speed=50, _type_1=1)
`);
  assert.ok(r.ok, JSON.stringify(r.error));
  const out = r.output.map((o) => o.text);
  assert.deepEqual([out[0], out[1], out[3], out[4]], ['0', '60', '60', '100'], out.join(' / '));
  assert.match(out[2], /^\[시뮬레이터\] 7번째 줄: 그리퍼의 힘을 풀었어요 \(254\)/);
  assert.deepEqual(
    r.events.map((e) => (e.kind === 'gripper' ? [e.line, e.open] : null)),
    [
      [3, false],
      [5, false],
      [9, true],
      [11, false],
    ],
    '254 sends nothing (the fingers stay), 60 still holds',
  );
  const msg = (call: string) =>
    run(`from pymycobot import MyCobot280RDKX5
mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)
mc.${call}
`).error;
  assert.equal(msg('set_gripper_state(2, 50)')?.message, 'The gripper_state not right, should be in (0, 1, 254), but received 2.');
  assert.equal(msg('set_gripper_state(0, 101)')?.message, 'The gripper_speed value not right, should be 0 ~ 100, the received speed is 101');
  assert.equal(msg('set_gripper_state(0, 50, 5)')?.message, 'The gripper_type not right, should be in (1, 2, 3, 4), but received 5.');
  assert.equal(msg('set_gripper_value(50, 50, 1, 2)')?.message, 'The is_torque not right, should be in (0, 1), but received 2.');
  assert.equal(msg('set_gripper_value(50, 0)')?.message, 'speed value not right, should be 1 ~ 100, the received speed is 0');
  assert.match(msg('get_gripper_value(0)')!.hint!, /gripper_type/);
  assert.equal(msg('set_gripper_state(flag=1, speed=50)')?.type, 'TypeError', "MyCobot280RDKX5's names are gripper_state, gripper_speed");
  console.log('  ok   gripper: pymycobot 4.0.x RDK X5 names and checks, 254 releases, get_gripper_value reports the opening');
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
  // Past a joint's limit the driver's send_angles refuses it, as pymycobot does on the robot.
  const far = run(
    `import math
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState

rclpy.init()
node = Node("far")
pub = node.create_publisher(JointState, "joint_states", 10)
msg = JointState()
msg.position = [math.radians(400), 0.0, 0.0, 0.0, 0.0, 0.0]
pub.publish(msg)
rclpy.spin_once(node)
`,
    'ros',
  );
  assert.ok(!far.ok && /angles not right/.test(far.error?.message ?? ''), JSON.stringify(far.error));
  console.log(`  ok   ROS 2: an angle past the limit stops with pymycobot's message (${far.error?.type})`);
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
              const marker = { hobot: 'Hobot.GPIO', rpi: 'RPi.GPIO', basic25: 'set_basic_output(5', basic12: 'set_basic_output(1', dobot: 'mc.DO(1', none: 'def pump' }[spec.pump];
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
