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
import { CELL_BY_ID, cellLayout, type CellId } from './cell/cells';
import { LIMIT_NAMES, OUTLINES, REJECT, RULE_WORDS, VISION_COLORS } from './cell/vision';

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
  | { type: 'repeat'; times: number; body: Step[]; line: number }
  /* 한 번에 하는 동작 (blocks for beginners): one line, many motions. */
  /** 집어서 옮기기: above, down, grip / suction, up, above the place, down, release, up. */
  | { type: 'carry'; from: Target; to: Target; line: number }
  /** 도형 그리기 (pen): a shape `cm` across around the mat's middle. */
  | { type: 'shape'; shape: ShapeName; cm: number; line: number }
  /** 색깔별로 정리하기: every block onto its own place, 빨강 → 자리 1 … 파랑 → 자리 4 (arm-only mat). */
  | { type: 'sort'; line: number }
  /* 실습 셀 (cell/): the arm works with the cell's places and its equipment's signals. */
  /** 집기: down onto the part at a place ("소재 1", "끝 위치", "소재 판 다음 칸"), take it, up. */
  | { type: 'cellPick'; place: string; line: number }
  /** 놓기: over a place, offset by x · y · z shop mm (z: the layer it goes on), down, let go, up. */
  | { type: 'cellPlace'; place: string; dx: number; dy: number; dz: number; line: number }
  /** 공급 요청: 자동 운전 pushes one part out of the magazine and brings it to the end. */
  | { type: 'cellFeed'; line: number }
  /** Wait until an input is on (or off). */
  | { type: 'cellWait'; signal: string; on: boolean; line: number }
  /** Switch an output (when 자동 운전 is off). */
  | { type: 'cellSet'; signal: string; on: boolean; line: number }
  /** 실습 셀 B: the camera reads the part nearest the belt's end (part = camera.look()). */
  | { type: 'cellLook'; variable: string; line: number }
  /** Teach the outline classifier: the part under the camera is this outline (camera.learn("육각")). */
  | { type: 'cellLearn'; outline: string; line: number }
  /** Pick the part where the camera saw it (robot.pick(part)). */
  | { type: 'cellPickVar'; variable: string; line: number }
  /** Put the held part where the rule table says for what the camera saw (robot.place_by_rule(part)). */
  | { type: 'cellSortPlace'; variable: string; line: number }
  /** A line of the rule table: these words (colour · 큰/작은 · outline, all optional) → a bin (cell.rule("빨강", "함 1")). */
  | { type: 'cellRule'; when: string[]; to: string; line: number }
  /** A set point: 지름 (shop mm, from it up is 큰) or 확신도 (%, below it the chute) (cell.limit("지름", 110)). */
  | { type: 'cellLimit'; what: string; value: number; line: number }
  /** C: 검사 위치에 멈춘 부품을 스토퍼까지 보내기 / 불량함으로 밀어내기 (자동 운전; each returns when it is done). */
  | { type: 'cellSend'; line: number }
  | { type: 'cellEject'; line: number }
  /* 조건 · 숫자 상자 (C onwards): if / elif / else, a counter, leaving a loop. */
  /** `elif`: written as an elif of the if whose `orelse` it is the only step of. */
  | { type: 'if'; cond: Cond; body: Step[]; orelse: Step[]; elif?: boolean; line: number }
  | { type: 'setVar'; name: string; value: number; line: number }
  | { type: 'addVar'; name: string; by: number; line: number }
  | { type: 'break'; line: number };

export const COMPARE_OPS = ['>=', '>', '<=', '<', '==', '!='] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

/** What an if asks: is a cell input on (or off), or how a number box compares with a number. */
export type Cond = { kind: 'signal'; signal: string; on: boolean } | { kind: 'compare'; name: string; op: CompareOp; value: number };

/** The steps a step holds (a loop's body, an if's two branches). */
export function childLists(s: Step): Step[][] {
  if (s.type === 'repeat') return [s.body];
  if (s.type === 'if') return [s.body, s.orelse];
  return [];
}

/** Every step, nested ones too, in program order. */
export function allSteps(list: readonly Step[]): Step[] {
  return list.flatMap((s) => [s, ...childLists(s).flatMap((l) => allSteps(l))]);
}

export const SHAPE_NAMES = ['네모', '원', '삼각형', '별'] as const;
export type ShapeName = (typeof SHAPE_NAMES)[number];
/** 도형 그리기: the size can be this many cm across. */
export const SHAPE_CM = { min: 2, max: 12 } as const;

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
  carry: new RegExp(String.raw`^robot\.pick_place\(\s*${STR}\s*,\s*${STR}\s*\)$`),
  shape: new RegExp(String.raw`^robot\.draw_shape\(\s*${STR}\s*,\s*(${NUM})\s*\)$`),
  sort: /^robot\.sort_blocks\(\s*\)$/,
  cellPick: new RegExp(String.raw`^robot\.pick\(\s*${STR}\s*\)$`),
  cellPlace: new RegExp(String.raw`^robot\.place\(\s*${STR}\s*((?:,\s*[xyz]\s*=\s*${NUM}\s*)*)\)$`),
  cellFeed: /^cell\.feed\(\s*\)$/,
  cellWait: new RegExp(String.raw`^cell\.wait\(\s*${STR}\s*(?:,\s*(True|False)\s*)?\)$`),
  cellSet: new RegExp(String.raw`^cell\.set\(\s*${STR}\s*,\s*(True|False)\s*\)$`),
  cellLook: new RegExp(String.raw`^${IDENT}\s*=\s*camera\.look\(\s*\)$`),
  cellLearn: new RegExp(String.raw`^camera\.learn\(\s*${STR}\s*\)$`),
  cellPickVar: new RegExp(String.raw`^robot\.pick\(\s*${IDENT}\s*\)$`),
  cellSortPlace: new RegExp(String.raw`^robot\.place_by_rule\(\s*${IDENT}\s*\)$`),
  cellRule: /^cell\.rule\(\s*((?:["'][^"']+["']\s*,\s*)*["'][^"']+["'])\s*\)$/,
  cellLimit: new RegExp(String.raw`^cell\.limit\(\s*${STR}\s*,\s*(${NUM})\s*\)$`),
  cellSend: /^cell\.send\(\s*\)$/,
  cellEject: /^cell\.eject\(\s*\)$/,
  ifHead: /^(if|elif)\s+(.+?)\s*:$/,
  elseHead: /^else\s*:$/,
  condSignal: new RegExp(String.raw`^(not\s+)?cell\.is_on\(\s*${STR}\s*\)$`),
  condCompare: new RegExp(String.raw`^${IDENT}\s*(>=|<=|==|!=|>|<)\s*(-?\d+)$`),
  setVar: new RegExp(String.raw`^${IDENT}\s*=\s*(-?\d+)$`),
  addVar: new RegExp(String.raw`^${IDENT}\s*(\+=|-=)\s*(\d+)$`),
  brk: /^break$/,
};

/** Names a number box may not take (the program's own words). */
const RESERVED = new Set(['robot', 'cell', 'camera', 'hand_camera', 'for', 'in', 'range', 'if', 'elif', 'else', 'not', 'and', 'or', 'break', 'pass', 'True', 'False', 'None']);

function parseCond(text: string): Cond | null {
  let m = text.match(RE.condSignal);
  if (m) return { kind: 'signal', signal: m[2], on: !m[1] };
  m = text.match(RE.condCompare);
  if (m && !RESERVED.has(m[1])) return { kind: 'compare', name: m[1], op: m[2] as CompareOp, value: Number(m[3]) };
  return null;
}

export function condCode(c: Cond): string {
  return c.kind === 'signal' ? `${c.on ? '' : 'not '}cell.is_on("${c.signal}")` : `${c.name} ${c.op} ${c.value}`;
}

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
  if (RE.sort.test(body)) return { type: 'sort', line };
  if ((m = body.match(RE.cellPick))) return { type: 'cellPick', place: m[1], line };
  if ((m = body.match(RE.cellPlace))) {
    const off = { x: 0, y: 0, z: 0 };
    for (const kw of (m[2] ?? '').matchAll(new RegExp(String.raw`([xyz])\s*=\s*(${NUM})`, 'g'))) off[kw[1] as 'x' | 'y' | 'z'] = Number(kw[2]);
    return { type: 'cellPlace', place: m[1], dx: off.x, dy: off.y, dz: off.z, line };
  }
  if (RE.cellFeed.test(body)) return { type: 'cellFeed', line };
  if ((m = body.match(RE.cellWait))) return { type: 'cellWait', signal: m[1], on: m[2] !== 'False', line };
  if ((m = body.match(RE.cellSet))) return { type: 'cellSet', signal: m[1], on: m[2] === 'True', line };
  if ((m = body.match(RE.cellLook))) return { type: 'cellLook', variable: m[1], line };
  if ((m = body.match(RE.cellLearn))) return { type: 'cellLearn', outline: m[1], line };
  if ((m = body.match(RE.cellPickVar))) return { type: 'cellPickVar', variable: m[1], line };
  if ((m = body.match(RE.cellSortPlace))) return { type: 'cellSortPlace', variable: m[1], line };
  if ((m = body.match(RE.cellRule))) {
    const words = [...m[1].matchAll(/["']([^"']+)["']/g)].map((w) => w[1]);
    return { type: 'cellRule', when: words.slice(0, -1), to: words[words.length - 1], line };
  }
  if ((m = body.match(RE.cellLimit))) return { type: 'cellLimit', what: m[1], value: Number(m[2]), line };
  if (RE.cellSend.test(body)) return { type: 'cellSend', line };
  if (RE.cellEject.test(body)) return { type: 'cellEject', line };
  if (RE.brk.test(body)) return { type: 'break', line };
  if ((m = body.match(RE.setVar)) && !RESERVED.has(m[1])) return { type: 'setVar', name: m[1], value: Number(m[2]), line };
  if ((m = body.match(RE.addVar)) && !RESERVED.has(m[1])) return { type: 'addVar', name: m[1], by: m[2] === '-=' ? -Number(m[3]) : Number(m[3]), line };
  if ((m = body.match(RE.shape))) {
    if (!(SHAPE_NAMES as readonly string[]).includes(m[1])) {
      errors.push({ line, msg: `'${m[1]}' 모양은 그릴 수 없어요.`, fix: `${SHAPE_NAMES.map((n) => `"${n}"`).join(', ')} 중에서 골라 주세요.` });
      return null;
    }
    return { type: 'shape', shape: m[1] as ShapeName, cm: Number(m[2]), line };
  }
  if ((m = body.match(RE.carry))) {
    const from = parsePlaceName(m[1]);
    const to = parsePlaceName(m[2]);
    if (!from || !to) {
      errors.push({ line, msg: `'${!from ? m[1] : m[2]}'이라는 곳은 없어요.`, fix: '"빨강 블록" 같은 블록과 "자리 1" 같은 곳을 써 주세요.' });
      return null;
    }
    return { type: 'carry', from, to, line };
  }
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
        fix: dof === 6 ? '예: robot.move_joints([0, 30, 0, 0, 0, 0])' : dof === 5 ? '예: robot.move_joints([0, 30, 0, 0, 0])' : '예: robot.move_joints([0, 30, 0, 0])',
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
  // The blocks open now, innermost last: the indent of their lines and the list they go into.
  const frames: { indent: number; list: Step[] }[] = [{ indent: 0, list: steps }];
  /** A header (for · if · elif · else) waiting for its first indented line. */
  let pending: { list: Step[]; indent: number; line: number } | null = null;
  // The last if of the chain at the end of a list (where an elif or else goes).
  const chainEnd = (list: Step[]): Extract<Step, { type: 'if' }> | null => {
    let s = list[list.length - 1];
    if (!s || s.type !== 'if') return null;
    while (s.orelse.length === 1 && s.orelse[0].type === 'if' && s.orelse[0].elif) s = s.orelse[0];
    return s;
  };
  code.split('\n').forEach((raw, idx) => {
    const line = idx + 1;
    const noComment = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
    if (!noComment.trim()) return;
    const indent = (noComment.match(/^ */) ?? [''])[0].length;
    const body = noComment.trim();
    if (RE.imp.test(body)) return;
    if (pending) {
      if (indent > pending.indent) {
        frames.push({ indent, list: pending.list });
        pending = null;
      } else {
        errors.push({ line: pending.line, msg: '이 줄 아래에 들여 쓴 줄이 없어요.', fix: '안에 넣을 줄을 빈칸 4개 들여 써 주세요 (넣을 것이 없으면 pass).' });
        pending = null;
      }
    }
    while (frames.length > 1 && indent < frames[frames.length - 1].indent) frames.pop();
    const top = frames[frames.length - 1];
    if (indent !== top.indent) {
      errors.push(
        frames.length === 1 ? { line, msg: '이 줄은 앞에 빈칸이 필요 없어요.', fix: '줄 앞의 빈칸을 지워 주세요.' } : { line, msg: '들여쓰기가 위 줄과 맞지 않아요.', fix: '같은 묶음의 줄은 빈칸 수를 똑같이 맞춰 주세요.' },
      );
      return;
    }
    const open = (list: Step[]) => {
      pending = { list, indent, line };
    };
    const rep = body.match(RE.repeat);
    if (rep) {
      const loop: Step = { type: 'repeat', times: Number(rep[1]), body: [], line };
      top.list.push(loop);
      open(loop.body);
      return;
    }
    const head = body.match(RE.ifHead);
    if (head) {
      const cond = parseCond(head[2]);
      if (!cond) {
        errors.push({ line, msg: `조건을 알 수 없어요: ${head[2]}`, fix: '예: if cell.is_on("높이 정상"):  ·  if not cell.is_on("금속"):  ·  if bad >= 3:' });
        return;
      }
      const step: Extract<Step, { type: 'if' }> = { type: 'if', cond, body: [], orelse: [], line };
      if (head[1] === 'elif') {
        const end = chainEnd(top.list);
        if (!end || end.orelse.length) {
          errors.push({ line, msg: 'elif 는 if 바로 다음에 써요.', fix: '위에 같은 칸에서 시작하는 if 를 먼저 써 주세요.' });
          return;
        }
        step.elif = true;
        end.orelse.push(step);
      } else top.list.push(step);
      open(step.body);
      return;
    }
    if (RE.elseHead.test(body)) {
      const end = chainEnd(top.list);
      if (!end || end.orelse.length) {
        errors.push({ line, msg: 'else 는 if 바로 다음에 써요.', fix: '위에 같은 칸에서 시작하는 if 를 먼저 써 주세요.' });
        return;
      }
      open(end.orelse);
      return;
    }
    if (RE.pass.test(body)) return;
    const step = parseLine(body, line, errors);
    if (step) top.list.push(step);
  });
  if (pending) errors.push({ line: (pending as { line: number }).line, msg: '이 줄 아래에 들여 쓴 줄이 없어요.', fix: '안에 넣을 줄을 빈칸 4개 들여 써 주세요 (넣을 것이 없으면 pass).' });
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
    case 'carry':
      return `robot.pick_place(${targetCode(s.from)}, ${targetCode(s.to)})`;
    case 'shape':
      return `robot.draw_shape("${s.shape}", ${s.cm})`;
    case 'sort':
      return 'robot.sort_blocks()';
    case 'cellPick':
      return `robot.pick("${s.place}")`;
    case 'cellPlace': {
      const kw = (['x', 'y', 'z'] as const).filter((k) => s[`d${k}`] !== 0).map((k) => `, ${k}=${s[`d${k}`]}`);
      return `robot.place("${s.place}"${kw.join('')})`;
    }
    case 'cellFeed':
      return 'cell.feed()';
    case 'cellWait':
      return `cell.wait("${s.signal}"${s.on ? '' : ', False'})`;
    case 'cellSet':
      return `cell.set("${s.signal}", ${s.on ? 'True' : 'False'})`;
    case 'cellLook':
      return `${s.variable} = camera.look()`;
    case 'cellLearn':
      return `camera.learn("${s.outline}")`;
    case 'cellPickVar':
      return `robot.pick(${s.variable})`;
    case 'cellSortPlace':
      return `robot.place_by_rule(${s.variable})`;
    case 'cellRule':
      return `cell.rule(${[...s.when, s.to].map((w) => `"${w}"`).join(', ')})`;
    case 'cellLimit':
      return `cell.limit("${s.what}", ${s.value})`;
    case 'cellSend':
      return 'cell.send()';
    case 'cellEject':
      return 'cell.eject()';
    case 'setVar':
      return `${s.name} = ${s.value}`;
    case 'addVar':
      return `${s.name} ${s.by < 0 ? '-=' : '+='} ${Math.abs(s.by)}`;
    case 'break':
      return 'break';
    case 'repeat':
    case 'if':
      return '';
  }
}

function serializeList(list: readonly Step[], pad: string, out: string[]): void {
  if (!list.length) out.push(`${pad}pass`);
  for (const s of list) {
    if (s.type === 'repeat') {
      out.push(`${pad}for _ in range(${s.times}):`);
      serializeList(s.body, pad + '    ', out);
    } else if (s.type === 'if') {
      let at: Extract<Step, { type: 'if' }> = s;
      out.push(`${pad}if ${condCode(at.cond)}:`);
      serializeList(at.body, pad + '    ', out);
      while (at.orelse.length === 1 && at.orelse[0].type === 'if' && at.orelse[0].elif) {
        at = at.orelse[0];
        out.push(`${pad}elif ${condCode(at.cond)}:`);
        serializeList(at.body, pad + '    ', out);
      }
      if (at.orelse.length) {
        out.push(`${pad}else:`);
        serializeList(at.orelse, pad + '    ', out);
      }
    } else out.push(pad + serializeOne(s));
  }
}

export function serialize(steps: readonly Step[]): string {
  const uses = new Set<string>(['robot']);
  for (const s of allSteps(steps)) {
    if (s.type === 'find') uses.add(s.camera === 'hand' ? 'hand_camera' : 'camera');
    if (s.type === 'cellLook' || s.type === 'cellLearn') uses.add('camera');
    // A 실습 셀 program imports the cell with the robot (an if on a cell input too).
    if (s.type.startsWith('cell') || (s.type === 'if' && s.cond.kind === 'signal')) uses.add('cell');
  }
  const order = ['robot', 'camera', 'hand_camera', 'cell'].filter((n) => uses.has(n));
  const out = [`from edu import ${order.join(', ')}`, ''];
  if (steps.length) serializeList(steps, '', out);
  return out.join('\n') + '\n';
}

/* -------------------------------------------------------------------------- */
/* Checks before anything moves                                               */
/* -------------------------------------------------------------------------- */

export interface CheckContext {
  theme?: Theme;
  /** The 실습 셀 the program runs in (its places and signals), or none. */
  cell?: CellId | null;
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
  /** Number boxes given a value so far (in program order). */
  const numbers = new Set<string>();
  let loops = 0;

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
      const picks = effector.kind === 'grip' || effector.kind === 'suction';
      switch (s.type) {
        case 'carry':
          if (!picks) errors.push({ line: s.line, msg: `집어서 옮기기인데 ${fittedPhrase(ctx.effector)}.`, fix: '위의 [도구]에서 그리퍼나 흡착 펌프를 달아 주세요.' });
          if ((s.from.kind === 'spot' || s.to.kind === 'spot' || s.from.kind === 'block' || s.to.kind === 'block') && ctx.theme !== 'arm')
            errors.push({ line: s.line, msg: '"빨강 블록" · "자리 1" 은 로봇팔 단독 실습 환경의 매트에만 있어요.', fix: 'AI 키트에서는 카메라로 찾은 블록과 "분류함 A" 를 써 주세요.' });
          if (s.from.kind === 'var' && !assigned.has(s.from.name)) errors.push({ line: s.line, msg: `'${s.from.name}'을 아직 찾지 않았어요.`, fix: `이 줄보다 위에 ${s.from.name} = camera.find("빨강") 처럼 먼저 찾아 주세요.` });
          break;
        case 'sort':
          if (!picks) errors.push({ line: s.line, msg: `색깔별로 정리하기인데 ${fittedPhrase(ctx.effector)}.`, fix: '위의 [도구]에서 그리퍼나 흡착 펌프를 달아 주세요.' });
          if (ctx.theme !== 'arm') errors.push({ line: s.line, msg: '색깔별로 정리하기는 로봇팔 단독 실습 환경의 매트에서 해요.', fix: 'AI 키트에서는 카메라로 찾아 분류함에 넣어 주세요.' });
          break;
        case 'shape':
          if (effector.kind !== 'pen') errors.push({ line: s.line, msg: `도형 그리기인데 ${fittedPhrase(ctx.effector)}.`, fix: '위의 [도구]에서 펜 홀더를 달아 주세요.' });
          if (!(s.cm >= SHAPE_CM.min && s.cm <= SHAPE_CM.max)) errors.push({ line: s.line, msg: `${s.cm}cm 는 그릴 수 없어요.`, fix: `${SHAPE_CM.min}에서 ${SHAPE_CM.max}cm 사이로 정해 주세요.` });
          break;
        case 'cellPick':
        case 'cellPlace':
        case 'cellFeed':
        case 'cellWait':
        case 'cellSet': {
          if (!ctx.cell) {
            errors.push({ line: s.line, msg: '이 명령은 실습 셀에서만 써요.', fix: '왼쪽 [환경]에서 실습 셀을 골라 주세요.' });
            break;
          }
          const l = cellLayout(ctx.cell);
          if ((s.type === 'cellPick' || s.type === 'cellPlace') && !picks) errors.push({ line: s.line, msg: `집기 · 놓기인데 ${fittedPhrase(ctx.effector)}.`, fix: '위의 [도구]에서 그리퍼나 흡착 펌프를 달아 주세요.' });
          if (s.type === 'cellPick' || s.type === 'cellPlace') {
            const grid = s.place.match(/^(.+) 다음 칸$/)?.[1];
            if (grid ? !l.grids[grid] : !l.places[s.place])
              errors.push({ line: s.line, msg: `'${s.place}'이라는 곳은 ${CELL_BY_ID[ctx.cell].name}에 없어요.`, fix: `${[...Object.keys(l.places).filter((n) => !/[2-9]$/.test(n)), ...Object.keys(l.grids).map((g) => `${g} 다음 칸`)].map((n) => `"${n}"`).join(', ')} 중에서 골라 주세요.` });
          }
          if (s.type === 'cellPlace' && [s.dx, s.dy, s.dz].some((v) => Math.abs(v) > 1000)) errors.push({ line: s.line, msg: '1000 mm보다 멀리 비켜 놓을 수 없어요.', fix: 'x · y · z는 -1000에서 1000 mm 사이로 정해 주세요.' });
          if (s.type === 'cellWait' && !l.inputs.includes(s.signal)) errors.push({ line: s.line, msg: `'${s.signal}'이라는 입력 신호는 없어요.`, fix: `${l.inputs.map((n) => `"${n}"`).join(', ')} 중에서 골라 주세요.` });
          if (s.type === 'cellSet' && !l.outputs.includes(s.signal)) errors.push({ line: s.line, msg: `'${s.signal}'이라는 출력 신호는 없어요.`, fix: `${l.outputs.map((n) => `"${n}"`).join(', ')} 중에서 골라 주세요.` });
          break;
        }
        case 'repeat':
          if (s.times < 1 || s.times > 20)
            errors.push({ line: s.line, msg: `${s.times}번 반복은 쓸 수 없어요.`, fix: '1에서 20 사이로 정해 주세요.' });
          loops += 1;
          walk(s.body);
          loops -= 1;
          break;
        case 'if': {
          const c = s.cond;
          if (c.kind === 'signal') {
            if (!ctx.cell) errors.push({ line: s.line, msg: '신호 조건은 실습 셀에서만 써요.', fix: '왼쪽 [환경]에서 실습 셀을 골라 주세요.' });
            else if (!cellLayout(ctx.cell).inputs.includes(c.signal)) errors.push({ line: s.line, msg: `'${c.signal}'이라는 입력 신호는 없어요.`, fix: `${cellLayout(ctx.cell).inputs.map((n) => `"${n}"`).join(', ')} 중에서 골라 주세요.` });
          } else if (!numbers.has(c.name)) errors.push({ line: s.line, msg: `'${c.name}'에 아직 숫자를 넣지 않았어요.`, fix: `이 줄보다 위에 ${c.name} = 0 처럼 먼저 숫자를 넣어 주세요.` });
          walk(s.body);
          walk(s.orelse);
          break;
        }
        case 'setVar':
          numbers.add(s.name);
          break;
        case 'addVar':
          if (!numbers.has(s.name)) errors.push({ line: s.line, msg: `'${s.name}'에 아직 숫자를 넣지 않았어요.`, fix: `이 줄보다 위에 ${s.name} = 0 처럼 먼저 숫자를 넣어 주세요.` });
          break;
        case 'break':
          if (!loops) errors.push({ line: s.line, msg: 'break 는 반복 안에서만 써요.', fix: '반복(for) 안에 넣어 주세요.' });
          break;
        case 'cellSend':
        case 'cellEject':
          if (!ctx.cell) errors.push({ line: s.line, msg: '이 명령은 실습 셀에서만 써요.', fix: '왼쪽 [환경]에서 실습 셀을 골라 주세요.' });
          else if (!cellLayout(ctx.cell).line.inspect) errors.push({ line: s.line, msg: `${CELL_BY_ID[ctx.cell].name}에는 검사 위치가 없어요.`, fix: '부품 보내기 · 불량 밀어내기는 C 검사 · 불량 배출 셀에서 써요.' });
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
        case 'cellLook':
        case 'cellLearn':
        case 'cellPickVar':
        case 'cellSortPlace':
        case 'cellRule':
        case 'cellLimit':
          errors.push(...checkVision(s, ctx, assigned, picks));
          if (s.type === 'cellLook') assigned.add(s.variable);
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

/** 실습 셀 B's camera commands, the rule table and the set points. */
function checkVision(s: Step, ctx: CheckContext, assigned: ReadonlySet<string>, picks: boolean): Problem[] {
  const out: Problem[] = [];
  if (!ctx.cell) return [{ line: s.line, msg: '이 명령은 실습 셀에서만 써요.', fix: '왼쪽 [환경]에서 실습 셀을 골라 주세요.' }];
  const l = cellLayout(ctx.cell);
  const name = CELL_BY_ID[ctx.cell].name;
  switch (s.type) {
    case 'cellLook':
    case 'cellLearn':
      if (!l.line.camera) out.push({ line: s.line, msg: `${name}에는 위 카메라가 없어요.`, fix: '카메라 명령은 B 비전 분류 셀에서 써요.' });
      if (s.type === 'cellLearn' && !(OUTLINES as readonly string[]).includes(s.outline)) out.push({ line: s.line, msg: `'${s.outline}' 모양은 가르칠 수 없어요.`, fix: `${OUTLINES.map((o) => `"${o}"`).join(', ')} 중에서 골라 주세요.` });
      break;
    case 'cellPickVar':
    case 'cellSortPlace':
      if (!assigned.has(s.variable)) out.push({ line: s.line, msg: `'${s.variable}'에는 찍은 부품이 없어요.`, fix: `이 줄보다 위에 ${s.variable} = camera.look() 으로 먼저 찍어 주세요.` });
      if (!picks) out.push({ line: s.line, msg: `집기 · 놓기인데 ${fittedPhrase(ctx.effector)}.`, fix: '위의 [도구]에서 그리퍼나 흡착 펌프를 달아 주세요.' });
      break;
    case 'cellRule': {
      const bad = s.when.filter((w) => !RULE_WORDS.includes(w));
      if (bad.length) out.push({ line: s.line, msg: `규칙에 쓸 수 없는 말이에요: '${bad[0]}'`, fix: `색(${VISION_COLORS.join(' · ')}), 크기(큰 · 작은), 모양(${OUTLINES.join(' · ')})만 써요.` });
      if (s.when.length > 3) out.push({ line: s.line, msg: '규칙 한 줄의 조건은 3개까지예요.' });
      const bins = Object.keys(l.places).filter((n) => n.startsWith('함 ') || n === REJECT);
      if (!bins.includes(s.to)) out.push({ line: s.line, msg: `'${s.to}'에는 보낼 수 없어요.`, fix: `${bins.map((n) => `"${n}"`).join(', ')} 중에서 골라 주세요.` });
      break;
    }
    case 'cellLimit':
      if (!(LIMIT_NAMES as readonly string[]).includes(s.what)) out.push({ line: s.line, msg: `'${s.what}' 기준은 없어요.`, fix: '"지름" 또는 "확신도"를 써 주세요.' });
      else if (s.what === '지름' && (s.value < 30 || s.value > 300)) out.push({ line: s.line, msg: `지름 기준 ${s.value} mm는 쓸 수 없어요.`, fix: '30에서 300 mm 사이로 정해 주세요.' });
      else if (s.what === '확신도' && (s.value < 0 || s.value > 100)) out.push({ line: s.line, msg: `확신도 기준 ${s.value}%는 쓸 수 없어요.`, fix: '0에서 100 사이로 정해 주세요.' });
      break;
  }
  return out;
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
