/**
 * The classroom program: a small, strict subset of Python that the block editor
 * and the Python editor both edit.
 *
 *     from edu import robot, camera
 *
 *     robot.home()
 *     block = camera.find("빨강")
 *     robot.move_above(block)
 *     robot.move_down(block)
 *     robot.gripper.close()
 *
 * Blocks and text are two views of one program: blocks serialise to exactly this
 * text, and this text parses back to exactly those blocks. Anything outside the
 * subset is reported with its line number and a suggested fix instead of being
 * guessed at, because a beginner's typo must never turn into an unexpected
 * motion.
 */

import { jointMax, jointMin } from '../robot/limits';
import { activeArm } from '../robot/arms';
import { BIN_NAMES, COLORS, COLOR_TO_BIN, SPOT_NAMES, type BinName, type ColorName, type SpotName, type Theme } from './board';
import { EFFECTOR_BY_ID, fittedPhrase, type EffectorId, type EffectorKind } from './effectors';

export type CameraId = 'top' | 'hand';

/**
 * Where "위로 가기 / 내려가기" go: a block found by a camera, one of the kit's
 * bins, the button, a place square on the arm-only mat, or a block where it
 * lies now (arm-only practice without a camera: "빨강 블록").
 */
export type Target =
  | { kind: 'var'; name: string }
  | { kind: 'bin'; bin: BinName }
  | { kind: 'button' }
  | { kind: 'spot'; spot: SpotName }
  | { kind: 'block'; color: ColorName };

export type Step =
  | { type: 'home'; line: number }
  | { type: 'pose'; name: string; line: number }
  /** `sec`: arrive in this many seconds (the speed is chosen for it); null = at the set speed. */
  | { type: 'joint'; j: number; deg: number; sec?: number | null; line: number }
  | { type: 'move'; joints: number[]; speed: number | null; sec?: number | null; line: number }
  | { type: 'moveTo'; x: number; y: number; z: number; line: number }
  | { type: 'above'; target: Target; line: number }
  | { type: 'down'; target: Target; line: number }
  | { type: 'find'; variable: string; camera: CameraId; color: ColorName; line: number }
  | { type: 'speed'; value: number; line: number }
  | { type: 'wait'; sec: number; line: number }
  | { type: 'grip'; open: boolean; line: number }
  | { type: 'pump'; on: boolean; line: number }
  | { type: 'pen'; down: boolean; line: number }
  | { type: 'push'; line: number }
  | { type: 'repeat'; times: number; body: Step[]; line: number };

export type StepType = Step['type'];

export interface Problem {
  line: number;
  msg: string;
  fix?: string;
}

export const SPEEDS: readonly [string, number][] = [
  ['느리게', 20],
  ['보통', 35],
  ['빠르게', 50],
];
export const DEFAULT_SPEED = 35;
/** Classroom speed cap: faster requests run at this speed, with a warning. */
export const SPEED_CAP = 50;

export const DEFAULT_VARIABLE = 'block';
const COLOR_NAMES = COLORS.map((c) => c.name) as string[];

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const STR = String.raw`["']([^"']+)["']`;
const IDENT = String.raw`([A-Za-z_][A-Za-z0-9_]*)`;
const RE = {
  imp: /^from\s+edu\s+import\s+[A-Za-z_]+(?:\s*,\s*[A-Za-z_]+)*$/,
  pass: /^pass$/,
  repeat: /^for\s+\w+\s+in\s+range\(\s*(\d+)\s*\)\s*:$/,
  home: /^robot\.home\(\s*\)$/,
  open: /^robot\.gripper\.open\(\s*\)$/,
  close: /^robot\.gripper\.close\(\s*\)$/,
  pumpOn: /^robot\.pump\.on\(\s*\)$/,
  pumpOff: /^robot\.pump\.off\(\s*\)$/,
  penDown: /^robot\.pen\.down\(\s*\)$/,
  penUp: /^robot\.pen\.up\(\s*\)$/,
  push: /^robot\.cylinder\.push\(\s*\)$/,
  wait: new RegExp(String.raw`^robot\.wait\(\s*(${NUM})\s*\)$`),
  speed: new RegExp(String.raw`^robot\.set_speed\(\s*(${NUM})\s*\)$`),
  pose: new RegExp(String.raw`^robot\.go_pose\(\s*${STR}\s*\)$`),
  joint: new RegExp(String.raw`^robot\.move_joint\(\s*(\d+)\s*,\s*(${NUM})\s*(?:,\s*time\s*=\s*(${NUM}))?\s*\)$`),
  move: new RegExp(String.raw`^robot\.move_joints\(\s*\[([^\]]*)\]\s*(?:,\s*(speed|time)\s*=\s*(${NUM}))?\s*\)$`),
  moveTo: new RegExp(String.raw`^robot\.move_to\(\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*\)$`),
  aboveStr: new RegExp(String.raw`^robot\.move_above\(\s*${STR}\s*\)$`),
  aboveVar: new RegExp(String.raw`^robot\.move_above\(\s*${IDENT}\s*\)$`),
  downStr: new RegExp(String.raw`^robot\.move_down\(\s*${STR}\s*\)$`),
  downVar: new RegExp(String.raw`^robot\.move_down\(\s*${IDENT}\s*\)$`),
  find: new RegExp(String.raw`^${IDENT}\s*=\s*(camera|hand_camera)\.find\(\s*${STR}\s*\)$`),
};

/** "분류함 A" -> bin A, "버튼" -> button, "자리 1" -> spot, "빨강 블록" -> that block. */
export function parsePlaceName(name: string): Target | null {
  if (name === '버튼') return { kind: 'button' };
  let m = name.match(/^분류함\s*([A-Da-d])$/);
  if (m) return { kind: 'bin', bin: m[1].toUpperCase() as BinName };
  m = name.match(/^자리\s*([1-4])$/);
  if (m) return { kind: 'spot', spot: `자리 ${m[1]}` as SpotName };
  m = name.match(/^(\S+)\s*블록$/);
  if (m && COLOR_NAMES.includes(m[1])) return { kind: 'block', color: m[1] as ColorName };
  return null;
}

export function targetLabel(t: Target): string {
  if (t.kind === 'button') return '버튼';
  if (t.kind === 'bin') return `분류함 ${t.bin}`;
  if (t.kind === 'spot') return t.spot;
  if (t.kind === 'block') return `${t.color} 블록`;
  return t.name === DEFAULT_VARIABLE ? '찾은 블록' : t.name;
}

function targetCode(t: Target): string {
  return t.kind === 'var' ? t.name : `"${targetLabel(t)}"`;
}

function parseLine(body: string, line: number, errors: Problem[]): Step | null {
  let m: RegExpMatchArray | null;
  if (RE.home.test(body)) return { type: 'home', line };
  if (RE.open.test(body)) return { type: 'grip', open: true, line };
  if (RE.close.test(body)) return { type: 'grip', open: false, line };
  if (RE.pumpOn.test(body)) return { type: 'pump', on: true, line };
  if (RE.pumpOff.test(body)) return { type: 'pump', on: false, line };
  if (RE.penDown.test(body)) return { type: 'pen', down: true, line };
  if (RE.penUp.test(body)) return { type: 'pen', down: false, line };
  if (RE.push.test(body)) return { type: 'push', line };
  if ((m = body.match(RE.wait))) return { type: 'wait', sec: Number(m[1]), line };
  if ((m = body.match(RE.speed))) return { type: 'speed', value: Number(m[1]), line };
  if ((m = body.match(RE.pose))) return { type: 'pose', name: m[1], line };
  if ((m = body.match(RE.joint))) return { type: 'joint', j: Number(m[1]), deg: Number(m[2]), sec: m[3] !== undefined ? Number(m[3]) : null, line };
  if ((m = body.match(RE.moveTo))) return { type: 'moveTo', x: Number(m[1]), y: Number(m[2]), z: Number(m[3]), line };
  if ((m = body.match(RE.find))) {
    if (!COLOR_NAMES.includes(m[3])) {
      errors.push({ line, msg: `'${m[3]}' 색은 찾을 수 없어요.`, fix: `${COLOR_NAMES.join(', ')} 중에서 골라 주세요.` });
      return null;
    }
    return { type: 'find', variable: m[1], camera: m[2] === 'hand_camera' ? 'hand' : 'top', color: m[3] as ColorName, line };
  }
  for (const [str, ident, type] of [
    [RE.aboveStr, RE.aboveVar, 'above'],
    [RE.downStr, RE.downVar, 'down'],
  ] as const) {
    if ((m = body.match(str))) {
      const target = parsePlaceName(m[1]);
      if (!target) {
        errors.push({
          line,
          msg: `'${m[1]}'이라는 곳은 없어요.`,
          fix: `${BIN_NAMES.map((b) => `"분류함 ${b}"`).join(', ')}, ${SPOT_NAMES.map((n) => `"${n}"`).join(', ')}, "빨강 블록" 또는 "버튼"을 써 주세요.`,
        });
        return null;
      }
      return { type, target, line };
    }
    if ((m = body.match(ident))) return { type, target: { kind: 'var', name: m[1] }, line };
  }
  if ((m = body.match(RE.move))) {
    const joints = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    const dof = activeArm().dof;
    if (joints.length !== dof || joints.some((n) => !Number.isFinite(n))) {
      errors.push({
        line,
        msg: `관절 각도는 숫자 ${dof}개가 필요해요 (지금 ${joints.length}개).`,
        fix: dof === 6 ? '예: robot.move_joints([0, 30, 0, 0, 0, 0])' : '예: robot.move_joints([0, 30, 0, 0])',
      });
      return null;
    }
    // A 4-axis arm's lists fill the six slots with 0.
    while (joints.length < 6) joints.push(0);
    const value = m[3] !== undefined ? Number(m[3]) : null;
    return { type: 'move', joints, speed: m[2] === 'speed' ? value : null, sec: m[2] === 'time' ? value : null, line };
  }
  errors.push({ line, msg: `알 수 없는 명령이에요: ${body}`, fix: '철자와 괄호를 확인해 주세요.' });
  return null;
}

export function parse(code: string): { steps: Step[]; errors: Problem[] } {
  const steps: Step[] = [];
  const errors: Problem[] = [];
  let loop: Extract<Step, { type: 'repeat' }> | null = null;
  code.split('\n').forEach((raw, idx) => {
    const line = idx + 1;
    const noComment = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
    if (!noComment.trim()) return;
    const indent = (noComment.match(/^ */) ?? [''])[0].length;
    const body = noComment.trim();
    if (RE.imp.test(body)) return;
    if (indent === 0) loop = null;
    else if (!loop) {
      errors.push({ line, msg: '이 줄은 앞에 빈칸이 필요 없어요.', fix: '줄 앞의 빈칸을 지워 주세요.' });
      return;
    }
    const rep = body.match(RE.repeat);
    if (rep) {
      if (indent > 0) {
        errors.push({ line, msg: '반복 안에 반복은 아직 쓸 수 없어요.' });
        return;
      }
      loop = { type: 'repeat', times: Number(rep[1]), body: [], line };
      steps.push(loop);
      return;
    }
    if (RE.pass.test(body)) return;
    const step = parseLine(body, line, errors);
    if (step) (indent > 0 && loop ? loop.body : steps).push(step);
  });
  return { steps, errors };
}

function serializeOne(s: Step): string {
  switch (s.type) {
    case 'home':
      return 'robot.home()';
    case 'grip':
      return `robot.gripper.${s.open ? 'open' : 'close'}()`;
    case 'pump':
      return `robot.pump.${s.on ? 'on' : 'off'}()`;
    case 'pen':
      return `robot.pen.${s.down ? 'down' : 'up'}()`;
    case 'push':
      return 'robot.cylinder.push()';
    case 'wait':
      return `robot.wait(${s.sec})`;
    case 'speed':
      return `robot.set_speed(${s.value})`;
    case 'pose':
      return `robot.go_pose("${s.name}")`;
    case 'joint':
      return `robot.move_joint(${s.j}, ${s.deg}${s.sec ? `, time=${s.sec}` : ''})`;
    case 'move':
      return `robot.move_joints([${s.joints.slice(0, activeArm().dof).join(', ')}]${s.sec ? `, time=${s.sec}` : s.speed ? `, speed=${s.speed}` : ''})`;
    case 'moveTo':
      return `robot.move_to(${s.x}, ${s.y}, ${s.z})`;
    case 'above':
      return `robot.move_above(${targetCode(s.target)})`;
    case 'down':
      return `robot.move_down(${targetCode(s.target)})`;
    case 'find':
      return `${s.variable} = ${s.camera === 'hand' ? 'hand_camera' : 'camera'}.find("${s.color}")`;
    case 'repeat':
      return '';
  }
}

export function serialize(steps: readonly Step[]): string {
  const uses = new Set<string>(['robot']);
  const scan = (list: readonly Step[]) =>
    list.forEach((s) => {
      if (s.type === 'find') uses.add(s.camera === 'hand' ? 'hand_camera' : 'camera');
      if (s.type === 'repeat') scan(s.body);
    });
  scan(steps);
  const order = ['robot', 'camera', 'hand_camera'].filter((n) => uses.has(n));
  const out = [`from edu import ${order.join(', ')}`, ''];
  for (const s of steps) {
    if (s.type === 'repeat') {
      out.push(`for _ in range(${s.times}):`);
      if (!s.body.length) out.push('    pass');
      s.body.forEach((b) => out.push(`    ${serializeOne(b)}`));
    } else out.push(serializeOne(s));
  }
  return out.join('\n') + '\n';
}

/* -------------------------------------------------------------------------- */
/* Checks before anything moves                                               */
/* -------------------------------------------------------------------------- */

export interface CheckContext {
  theme?: Theme;
  effector: EffectorId;
  cameraFlange: boolean;
  poses: Record<string, readonly number[]>;
}

const TOOL_COMMAND: Partial<Record<StepType, { kind: EffectorKind; what: string }>> = {
  grip: { kind: 'grip', what: '그리퍼' },
  pump: { kind: 'suction', what: '흡착 펌프' },
  pen: { kind: 'pen', what: '펜 홀더' },
  push: { kind: 'press', what: '실린더' },
};

export function check(steps: readonly Step[], ctx: CheckContext): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const effector = EFFECTOR_BY_ID[ctx.effector];
  const assigned = new Set<string>();

  const walk = (list: readonly Step[]) =>
    list.forEach((s) => {
      const tool = TOOL_COMMAND[s.type];
      if (tool && effector.kind !== tool.kind) {
        errors.push({
          line: s.line,
          msg: `${tool.what} 명령인데 ${fittedPhrase(ctx.effector)}.`,
          fix: `위의 [도구]에서 ${tool.what}${tool.kind === 'grip' ? '(어댑티브·평행·플렉서블)' : ''}를 달거나 이 줄을 지워 주세요.`,
        });
      }
      switch (s.type) {
        case 'repeat':
          if (s.times < 1 || s.times > 20)
            errors.push({ line: s.line, msg: `${s.times}번 반복은 쓸 수 없어요.`, fix: '1에서 20 사이로 정해 주세요.' });
          walk(s.body);
          break;
        case 'joint':
          if (s.j < 1 || s.j > activeArm().dof) errors.push({ line: s.line, msg: `${s.j}번 관절은 없어요.`, fix: `1번부터 ${activeArm().dof}번까지 있어요.` });
          else if (s.deg < jointMin()[s.j - 1] || s.deg > jointMax()[s.j - 1])
            errors.push(rangeProblem(s.line, s.j - 1, s.deg));
          if (s.sec != null && !(s.sec >= MOVE_TIME_MIN && s.sec <= MOVE_TIME_MAX)) errors.push(timeProblem(s.line, s.sec));
          break;
        case 'move':
          s.joints.forEach((v, i) => {
            if (v < jointMin()[i] || v > jointMax()[i]) errors.push(rangeProblem(s.line, i, v));
          });
          if (s.sec != null && !(s.sec >= MOVE_TIME_MIN && s.sec <= MOVE_TIME_MAX)) errors.push(timeProblem(s.line, s.sec));
          break;
        case 'moveTo':
          if (s.z < 0) errors.push({ line: s.line, msg: `높이 z=${s.z}mm는 책상 아래예요.`, fix: 'z는 0 이상으로 정해 주세요.' });
          break;
        case 'wait':
          if (s.sec < 0 || s.sec > 10)
            errors.push({ line: s.line, msg: `${s.sec}초는 기다릴 수 없어요.`, fix: '0에서 10초 사이로 정해 주세요.' });
          break;
        case 'pose':
          if (!ctx.poses[s.name])
            errors.push({
              line: s.line,
              msg: `'${s.name}'이라는 자세가 없어요.`,
              fix: '[수동 제어] → [자세 저장 · 불러오기]에서 자세를 기록하거나 있는 자세를 골라 주세요.',
            });
          break;
        case 'find':
          if (s.camera === 'top' && ctx.theme === 'arm')
            errors.push({
              line: s.line,
              msg: '로봇팔 단독 실습 환경에는 키트 카메라가 없어요.',
              fix: '실습 환경을 [AI 키트]로 바꾸거나, 카메라 플랜지를 달고 hand_camera.find 를 써 주세요.',
            });
          if (s.camera === 'hand' && !ctx.cameraFlange)
            errors.push({
              line: s.line,
              msg: '손 카메라는 카메라 플랜지를 달아야 쓸 수 있어요.',
              fix: '위의 [카메라 플랜지]를 켜거나 camera.find 로 바꿔 주세요.',
            });
          assigned.add(s.variable);
          break;
        case 'above':
        case 'down':
          if (s.target.kind === 'bin' && ctx.theme === 'arm')
            errors.push({ line: s.line, msg: '분류함은 AI 키트에만 있어요.', fix: '"자리 1"~"자리 4"를 쓰거나 실습 환경을 [AI 키트]로 바꿔 주세요.' });
          if (s.target.kind === 'spot' && ctx.theme !== 'arm')
            errors.push({ line: s.line, msg: `${s.target.spot}는 로봇팔 단독 실습 환경의 작업 매트에만 있어요.`, fix: '"분류함 A"~"분류함 D"를 쓰거나 실습 환경을 [빈 화면]으로 바꿔 주세요.' });
          if (s.target.kind === 'var' && !assigned.has(s.target.name))
            errors.push({
              line: s.line,
              msg: `'${s.target.name}'을 아직 찾지 않았어요.`,
              fix: `이 줄보다 위에 ${s.target.name} = camera.find("빨강") 처럼 먼저 찾아 주세요.`,
            });
          break;
      }
      const sp = s.type === 'speed' ? s.value : s.type === 'move' ? s.speed : null;
      if (sp !== null) {
        if (sp < 1 || sp > 100) errors.push({ line: s.line, msg: `속도 ${sp}는 쓸 수 없어요.`, fix: '1에서 100 사이로 정해 주세요.' });
        else if (sp > SPEED_CAP) warnings.push({ line: s.line, msg: `수업 중에는 속도가 최대 ${SPEED_CAP}이라 ${SPEED_CAP}로 움직여요.` });
      }
    });

  walk(steps);
  return { errors, warnings };
}

/** A timed move ("2초 동안 …") may take this long, seconds. */
export const MOVE_TIME_MIN = 0.3;
export const MOVE_TIME_MAX = 20;

function timeProblem(line: number, sec: number): Problem {
  return { line, msg: `${sec}초 동안 움직이기는 쓸 수 없어요.`, fix: `${MOVE_TIME_MIN}초에서 ${MOVE_TIME_MAX}초 사이로 정해 주세요.` };
}

function rangeProblem(line: number, i: number, v: number): Problem {
  const lo = jointMin()[i];
  const hi = jointMax()[i];
  return {
    line,
    msg: `${i + 1}번 관절 ${v}°는 움직일 수 있는 범위(${lo}°~${hi}°) 밖이에요.`,
    fix: `${lo}°에서 ${hi}° 사이로 바꿔 주세요.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Starter programs, one per tool family                                      */
/* -------------------------------------------------------------------------- */

/** The official colour-sorting destination for a colour, as a program target name. */
export function binFor(color: ColorName): string {
  return `분류함 ${COLOR_TO_BIN[color]}`;
}

export function starterProgram(effector: EffectorId, theme: Theme = 'kit'): string {
  const kind = EFFECTOR_BY_ID[effector].kind;
  if (theme === 'arm' && (kind === 'grip' || kind === 'suction')) {
    // No camera on a bare desk: the program names the block where it lies.
    const [grab, release] = kind === 'grip' ? ['robot.gripper.close()', 'robot.gripper.open()'] : ['robot.pump.on()', 'robot.pump.off()'];
    return `from edu import robot

robot.home()
${release}
robot.move_above("빨강 블록")
robot.move_down("빨강 블록")
${grab}
robot.move_above("빨강 블록")
robot.move_above("자리 1")
robot.move_down("자리 1")
${release}
robot.move_above("자리 1")
robot.home()
`;
  }
  // Same flow as the official AI Kit colour program (aikit_color.py): look from
  // the observation pose, go above the block, down, pick, up, over the bin, release.
  const pick = (grab: string, release: string) =>
    `from edu import robot, camera

robot.home()
${release}
block = camera.find("빨강")
robot.move_above(block)
robot.move_down(block)
${grab}
robot.move_above(block)
robot.move_above("${binFor('빨강')}")
${release}
robot.home()
`;
  switch (kind) {
    case 'grip':
      return pick('robot.gripper.close()', 'robot.gripper.open()');
    case 'suction':
      return pick('robot.pump.on()', 'robot.pump.off()');
    case 'pen': {
      // A square on the mat (where this arm's mat lies: see ArmSpec.matShiftMm).
      const [x0, x1] = [130, 190].map((x) => x + (theme === 'arm' ? activeArm().matShiftMm : 0));
      return `from edu import robot

robot.home()
robot.move_to(${x0}, -30, 20)
robot.pen.down()
robot.move_to(${x0}, -30, 0)
robot.move_to(${x1}, -30, 0)
robot.move_to(${x1}, 30, 0)
robot.move_to(${x0}, 30, 0)
robot.move_to(${x0}, -30, 0)
robot.pen.up()
robot.move_to(${x0}, -30, 40)
robot.home()
`;
    }
    case 'press':
      return `from edu import robot

robot.home()
robot.move_above("버튼")
for _ in range(3):
    robot.move_down("버튼")
    robot.cylinder.push()
robot.move_above("버튼")
robot.home()
`;
    case 'hold':
    case 'none':
      return `from edu import robot

robot.home()
robot.move_to(160, 0, 200)
robot.wait(1)
robot.move_to(160, -80, 200)
robot.wait(1)
robot.home()
`;
  }
}
