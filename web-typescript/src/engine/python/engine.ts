/**
 * Run a student's Python program (중급: pymycobot, 고급: rclpy) against the
 * simulated robot, in simulated time.
 *
 * The program runs start to finish at once: time.sleep only moves the
 * simulated clock forward, and get_angles/get_coords answer from the arm model
 * at that moment. What comes back is the list of timed robot commands with the
 * program line of each; the console then plays that list in 3D with the usual
 * collision checks, and the robot server can replay the same list on the real
 * arm with the same timing.
 *
 * Runs wherever a Pyodide instance is: in the page's web worker (worker.ts),
 * or in Node for the automated checks (tests/simulator/python-check.mts).
 */

import { Vector3 } from 'three';

import { buildChain, forwardKinematics, solveIk } from '../robot/kinematics';
import { jointMax, jointMin } from '../robot/limits';
import { activeArm, setActiveArm } from '../robot/arms';
import { ArmModel } from './arm';
import { PY_FILES, PY_PRELUDE } from './pylib';
import { MAX_SIM_S, type PyError, type PyEvent, type PyInit, type PyOutput, type PyResult, type RosGraph, type RosMessage } from './types';

/** The part of the Pyodide API used here (avoids a type import of the whole package). */
export interface PyodideLike {
  runPython(code: string, options?: { filename?: string; globals?: unknown }): unknown;
  registerJsModule(name: string, module: object): void;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
}

/** Classroom speed cap (same as the block level and the robot server). */
const SPEED_CAP = 50;

let installed = false;

function install(py: PyodideLike): void {
  if (installed) return;
  for (const [path, src] of Object.entries(PY_FILES)) {
    py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    py.FS.writeFile(path, src);
  }
  installed = true;
}

/** JS arrays or Python lists (PyProxy) -> number[]. */
function nums(v: unknown): number[] {
  const x = v as { toJs?: () => unknown };
  const arr = typeof x?.toJs === 'function' ? (x.toJs() as unknown[]) : (v as unknown[]);
  return Array.from(arr, Number);
}

export function runScript(py: PyodideLike, code: string, init: PyInit): PyResult {
  // In the web worker nothing has set the arm yet (it starts as the myCobot 280 RDK X5).
  if (init.armId && activeArm().id !== init.armId) setActiveArm(init.armId);
  install(py);
  const chain = buildChain(init.robot);
  const arm = new ArmModel(init.startAngles);
  const events: PyEvent[] = [];
  const output: PyOutput[] = [];
  const messages: RosMessage[] = [];
  const graph: RosGraph = { nodes: [] };
  const pins = new Map<number, number>();
  const basic = new Map<number, number>();
  let gpioMode = 10; // BOARD (Hobot) unless set to BCM (RPi)
  let pumpOn = false;
  let gripperOpen = true;
  let t = 0;

  const coordsAt = (angles: readonly number[]) => {
    const p = forwardKinematics(chain, angles);
    return [p.position.x * 1000, p.position.y * 1000, p.position.z * 1000, p.rpyDeg.x, p.rpyDeg.y, p.rpyDeg.z];
  };
  const say = (text: string) => output.push({ t, text });
  const setPump = (on: boolean, line: number) => {
    if (on === pumpOn) return;
    pumpOn = on;
    events.push({ t, line, kind: 'pump', on });
  };
  let capped = false;
  const cap = (speed: number) => {
    if (speed > SPEED_CAP && !capped) {
      capped = true;
      say(`[시뮬레이터] 수업 중에는 속도가 최대 ${SPEED_CAP}이라 ${SPEED_CAP}로 움직여요.`);
    }
    return Math.min(SPEED_CAP, Number(speed));
  };
  const node = (name: string) => {
    let n = graph.nodes.find((k) => k.name === name);
    if (!n) {
      n = { name, publishes: [], subscribes: [] };
      graph.nodes.push(n);
    }
    return n;
  };

  const sim = {
    connect: () => undefined,
    now: () => t,
    limit: () => MAX_SIM_S,
    sleep: (s: number) => {
      if (!(s >= 0)) throw new Error(`time.sleep 에 음수(${s})는 쓸 수 없어요.`);
      t += s;
      if (t > MAX_SIM_S) throw new Error(`시뮬레이션은 ${MAX_SIM_S}초까지만 돌릴 수 있어요. 끝나지 않는 반복이 있는지 확인해 주세요.`);
    },
    angles: () => arm.at(t),
    coords: () => coordsAt(arm.at(t)),
    fk: (angles: unknown) => coordsAt(nums(angles)),
    dof: () => activeArm().dof,
    angles_min: () => [...jointMin()],
    angles_max: () => [...jointMax()],
    coords_min: () => [...activeArm().coordsMin],
    coords_max: () => [...activeArm().coordsMax],
    moving: () => arm.moving(t),
    move: (angles: unknown, speed: number, what: string, line: number) => {
      const to = nums(angles);
      events.push({ t, line, kind: 'move', to, speed: cap(speed), what });
      arm.move(t, to, cap(speed));
    },
    move_coords: (coords: unknown, speed: number, what: string, line: number) => {
      const c = nums(coords);
      const seed = arm.at(t);
      const r = solveIk(chain, new Vector3(c[0] / 1000, c[1] / 1000, c[2] / 1000), seed, {
        matchOrientation: true,
        targetRpyDeg: [c[3], c[4], c[5]],
        restarts: 8,
      });
      if (!r.converged) {
        throw new Error(`좌표 [${c.map((v) => Math.round(v)).join(', ')}] 에는 갈 수 없어요 (팔이 닿지 않거나 그 방향으로 돌 수 없어요).`);
      }
      const to = r.anglesDeg.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
      events.push({ t, line, kind: 'move', to, speed: cap(speed), what });
      arm.move(t, to, cap(speed));
    },
    stop: (line: number) => {
      events.push({ t, line, kind: 'stop' });
      arm.stop(t);
    },
    servos: (on: boolean, line: number) => events.push({ t, line, kind: 'servos', on: Boolean(on) }),
    gripper: (open: boolean, gripperType: number, line: number) => {
      gripperOpen = Boolean(open);
      events.push({ t, line, kind: 'gripper', open: gripperOpen, gripperType: Number(gripperType) });
    },
    gripper_value: () => (gripperOpen ? 100 : 0),
    gpio_mode: (mode: number) => {
      gpioMode = Number(mode);
    },
    gpio: (pin: number, value: number, line: number) => {
      pins.set(pin, value);
      // Suction pump V2.0 on BOARD 31/37 (RDK X5 vision kit): on = 31 HIGH + 37 LOW, off = 37 HIGH.
      // Raspberry Pi / Jetson Nano (official AI kit): BCM 20 and 21 both LOW = on, both HIGH = off.
      const next =
        gpioMode === 11
          ? pins.get(20) === 0 && pins.get(21) === 0
            ? true
            : pins.get(20) === 1 && pins.get(21) === 1
              ? false
              : pumpOn
          : pins.get(37) === 1
            ? false
            : pins.get(31) === 1 && pins.get(37) === 0
              ? true
              : pumpOn;
      setPump(next, line);
    },
    basic_out: (pin: number, value: number, line: number) => {
      basic.set(pin, value);
      // The robot's own outputs (official AI kit): M5 — 2 and 5 both 0 = on, both 1 = off;
      // myCobot 320 — 1 = 0 on, 1 = 1 off.
      const next =
        activeArm().pump === 'basic12'
          ? basic.get(1) === 0
            ? true
            : basic.get(1) === 1
              ? false
              : pumpOn
          : basic.get(2) === 0 && basic.get(5) === 0
            ? true
            : basic.get(2) === 1 && basic.get(5) === 1
              ? false
              : pumpOn;
      setPump(next, line);
    },
    basic_get: (pin: number) => basic.get(pin) ?? 0,
    gpio_get: (pin: number) => pins.get(pin) ?? 0,
    log: (text: string) => say(String(text)),
    ros_node: (name: string) => void node(String(name)),
    ros_link: (name: string, topic: string, kind: string) => {
      const n = node(String(name));
      const list = kind === 'pub' ? n.publishes : n.subscribes;
      if (!list.includes(String(topic))) list.push(String(topic));
    },
    ros_msg: (topic: string, type: string, data: string) => {
      if (messages.length < 2000) messages.push({ t, topic: String(topic), type: String(type), data: String(data) });
    },
    driver_move: (angles: unknown, speed: number, line: number) => {
      const to = nums(angles).map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
      events.push({ t, line: Number(line), kind: 'move', to, speed: cap(speed), what: 'control_slider' });
      arm.move(t, to, cap(speed));
    },
  };

  py.registerJsModule('_sim', sim);
  py.setStdout({ batched: (s) => say(s) });
  py.setStderr({ batched: (s) => say(s) });
  let error: PyError | undefined;
  try {
    py.runPython(PY_PRELUDE);
    py.runPython(code, { filename: 'main.py' });
  } catch (err) {
    error = explain(err instanceof Error ? err.message : String(err));
  }
  return {
    ok: !error,
    events,
    endT: t,
    output,
    error,
    ros: init.mode === 'ros' ? { graph, messages } : undefined,
  };
}

/** Python traceback -> program line, error type, and a plain explanation. */
export function explain(traceback: string): PyError {
  const lines = traceback.trim().split('\n');
  let line = 0;
  for (const l of lines) {
    const m = l.match(/File "main\.py", line (\d+)/);
    if (m) line = Number(m[1]);
  }
  const last = lines[lines.length - 1] ?? traceback;
  const m = last.match(/^(\w+(?:\.\w+)*):\s?(.*)$/);
  const type = m ? m[1].split('.').pop()! : 'Error';
  let message = m ? m[2] : last;
  // A JS error thrown by the simulator reaches Python as JsException: keep only its text.
  if (type === 'JsException') message = message.replace(/^Error:\s*/, '');
  return { line, type, message, hint: hintFor(type, message) };
}

function hintFor(type: string, message: string): string | undefined {
  let m: RegExpMatchArray | null;
  if (type === 'SyntaxError' || type === 'IndentationError') return '문법 오류예요. 괄호·따옴표·콜론(:)·들여쓰기를 확인해 주세요.';
  if (type === 'NameError' && (m = message.match(/name '(\w+)' is not defined/))) return `'${m[1]}' 이라는 이름이 없어요. 철자를 확인하거나 먼저 만들고(import) 써 주세요.`;
  if (type === 'ModuleNotFoundError') return '시뮬레이터에 없는 모듈이에요. pymycobot, omx (OMX-F), Hobot.GPIO, RPi.GPIO, time, math, rclpy, sensor_msgs, std_msgs 를 쓸 수 있어요.';
  if (type === 'AttributeError') return '그런 이름의 함수(명령)가 없어요. 철자를 확인해 주세요. 시뮬레이터에 아직 없는 명령일 수도 있어요.';
  if (type === 'ValueError' && /angles? not right/.test(message)) return '관절 각도가 로봇이 움직일 수 있는 범위를 벗어났어요 (pymycobot 이 실제 로봇에서도 같은 오류를 내요).';
  if (type === 'ValueError' && /coords? not right/.test(message)) return '좌표가 로봇의 작업 범위를 벗어났어요 (pymycobot 이 실제 로봇에서도 같은 오류를 내요).';
  if (type === 'ValueError' && /speed/.test(message)) return '속도는 1~100 이에요.';
  if (type === 'TypeError') return '함수에 넣은 값의 개수나 종류가 맞지 않아요.';
  if (type === 'ZeroDivisionError') return '0 으로 나눌 수 없어요.';
  if (type === 'IndexError') return '리스트 범위를 벗어난 번호예요.';
  return undefined;
}
