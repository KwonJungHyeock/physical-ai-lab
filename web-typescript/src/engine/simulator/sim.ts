/**
 * The simulated classroom robot: world state plus a program runner.
 *
 * Free of React and WebGL on purpose. The page supplies `animate` (one call per
 * motion, driven by requestAnimationFrame) and `see` (renders a camera and runs
 * the colour detector); the headless test supplies instant versions of both and
 * runs whole missions in milliseconds.
 *
 * What the runner checks on every animation frame, so a program that passes the
 * simulator is one that would not crash into the table on the real robot:
 *   - no joint of the arm below the table,
 *   - the tool tip not below the board (the pen may press 1 mm on its spring),
 *   - the tool not driven into a block it is not holding,
 *   - a held block not pushed into the table or into another block,
 *   - (arm-only theme) the arm off the scene's furniture, and off the desk's objects when physics
 *     is off (with physics on, the page's rigid-body world lets the arm push them instead);
 *     with physics off the pump or a gripper picks a desk object up exactly (it keeps its turn),
 *     and the object carried keeps off the desk, the furniture and the other objects.
 */

import { Matrix4, Vector3 } from 'three';

import { forwardKinematicsFrames, type ChainSegment } from '../robot/kinematics';
import {
  jointMoveDuration,
  jointTrajectory,
  linearPath,
  tcpPositionMm,
  type Trajectory,
} from '../robot/motion';
import { SELF_SLACK_MM, selfContact, selfFix, selfMessage } from '../robot/selfCollision';
import { currentOrientation, solveToolPose, type PointMm } from '../robot/tool';
import { ArmModel } from '../python/arm';
import { activeArm } from '../robot/arms';
import { OBJECT_KINDS, SCENE_FIXED, activeDesk, footprint, matShown, objectBox, type DeskObject, type FixedBox, type SceneId } from './desk';
import type { PyEvent } from '../python/types';
import {
  ABOVE_MM,
  ARM_STORED,
  BINS,
  BIN_NAMES,
  BLOCK_MM,
  BLOCK_START,
  BUTTON,
  COLORS,
  COLOR_TO_BIN,
  DROP_CLEARANCE_MM,
  BLOCK_STORED,
  SPOTS,
  STAND_BOXES,
  STORAGE_BOX,
  binAt,
  wallTopAt,
  type Tub,
  spotAt,
  type Bin,
  type ColorName,
  type Theme,
} from './board';
import {
  CYLINDER_PRESS_MM,
  EFFECTOR_BY_ID,
  PEN_LIFT_MM,
  fittedPhrase,
  tcpFor,
  type EffectorId,
} from './effectors';
import { DEFAULT_SPEED, SPEED_CAP, type CameraId, type Step, type Target } from './program';

export interface BlockState {
  color: ColorName;
  /** Centre, mm. */
  x: number;
  y: number;
  z: number;
  yawDeg: number;
}

/** What a run did, for the practice checks (practices.ts). Kept until the world is reset. */
export interface WorldStats {
  /** Lowest and highest angle each joint reached, degrees. */
  jointMin: number[];
  jointMax: number[];
  /** Tool tip at the end of every move, mm. */
  arrivals: { x: number; y: number; z: number }[];
  /** Recorded poses the program went to. */
  posesUsed: string[];
}

export interface WorldState {
  theme: Theme;
  /** 작업대 (arm-only theme): the scene, its fixed furniture, the objects on the desk, physics on/off. */
  scene: SceneId;
  fixed: readonly FixedBox[];
  objects: DeskObject[];
  physics: boolean;
  angles: number[];
  /** Where a running move is heading (the monitor marks it on each joint's dial); null when still. */
  goal?: number[] | null;
  effector: EffectorId;
  cameraFlange: boolean;
  /** Finger gap, mm (grippers). */
  gapMm: number;
  pump: boolean;
  penDown: boolean;
  blocks: BlockState[];
  held: { color: ColorName; offset: Matrix4 } | null;
  /** A desk object the tool carries (physics off): it hangs this far from the tool tip and keeps its turn, mm. */
  carry?: { id: string; dx: number; dy: number; dz: number } | null;
  /** Pen strokes on the board, each a list of [x, y] mm. */
  trail: [number, number][][];
  buttonPresses: number;
  /** 0..1, how far the button cap is pushed in. */
  buttonDepth: number;
  stats: WorldStats;
  /** Bumped on every change the renderer should pick up. */
  version: number;
}

export function emptyStats(angles: readonly number[]): WorldStats {
  return { jointMin: angles.slice(), jointMax: angles.slice(), arrivals: [], posesUsed: [] };
}

export function createWorld(effector: EffectorId, cameraFlange: boolean, layout = BLOCK_START, theme: Theme = 'kit'): WorldState {
  const e = EFFECTOR_BY_ID[effector];
  const picks = e.kind === 'grip' || e.kind === 'suction';
  const desk = activeDesk();
  const arm = theme === 'arm';
  return {
    theme,
    scene: arm ? desk.scene : 'kit',
    fixed: arm ? SCENE_FIXED[desk.scene] : [],
    objects: arm ? desk.objects.map((o) => ({ ...o, size: [...o.size] as DeskObject['size'] })) : [],
    physics: arm && desk.physics,
    angles: activeArm().home.slice(),
    effector,
    cameraFlange,
    gapMm: e.gapMm?.open ?? 0,
    pump: false,
    penDown: false,
    // Tools that do not pick blocks start with the blocks put away (kit: in the
    // storage box; arm only: at the back corner of the desk).
    // Arm only: the practice mat's blocks are on the desk only while the mat is.
    blocks: (arm && !matShown() ? [] : COLORS).map(({ name }) =>
      picks
        ? { color: name, x: layout[name].x, y: layout[name].y, z: BLOCK_MM / 2, yawDeg: 0 }
        : theme === 'kit'
          ? { color: name, x: BLOCK_STORED[name].x, y: BLOCK_STORED[name].y, z: STORAGE_BOX.floorZ + BLOCK_MM / 2, yawDeg: 0 }
          : { color: name, x: ARM_STORED[name].x, y: ARM_STORED[name].y, z: BLOCK_MM / 2, yawDeg: 0 },
    ),
    held: null,
    trail: [],
    buttonPresses: 0,
    buttonDepth: 0,
    stats: emptyStats(activeArm().home),
    version: 0,
  };
}

/* -------------------------------------------------------------------------- */

export class Stop extends Error {
  constructor() {
    super('stopped');
  }
}

/** A problem found while running: which line, what happened, how to fix it. */
export class RunError extends Error {
  /** Program line that was running; filled in by the runner. */
  line = 0;
  constructor(
    message: string,
    public fix?: string,
    public collision = false,
  ) {
    super(message);
  }
}

/** The arm ran into itself, its base or (with its body) the table: found before the move is made. */
export class SelfCollision extends RunError {}


export type LogKind = 'info' | 'ok' | 'warn' | 'err';

/** What the real robot has to do, recorded while the simulator runs (see export.ts). */
export type RobotAction =
  /** `via`: an intermediate point of a straight line — the robot may go on before settling there. */
  | { type: 'angles'; angles: number[]; speed: number; line: number; via?: boolean }
  | { type: 'gripper'; open: boolean; line: number }
  | { type: 'pump'; on: boolean; line: number }
  | { type: 'wait'; sec: number; line: number }
  | { type: 'found'; color: ColorName; x: number; y: number; line: number }
  /**
   * A command of a Python program (중급·고급) at time t after the start, as the
   * program issued it — send_angles does not wait; the robot replays the list
   * with the same timing.
   */
  | {
      type: 'timed';
      t: number;
      cmd: 'angles' | 'stop' | 'pump' | 'gripper' | 'focus';
      angles?: number[];
      speed?: number;
      on?: boolean;
      open?: boolean;
      gripperType?: number;
      line: number;
    };

export interface RunHooks {
  chain: readonly ChainSegment[];
  world: WorldState;
  poses: Record<string, readonly number[]>;
  /** Advance `durationS` of simulated time, calling `frame(t)` with t in seconds. Rejects with Stop when aborted. */
  animate(durationS: number, frame: (tS: number) => void): Promise<void>;
  /** Look for a block of this colour; board position of its top face, mm, or null. */
  see(camera: CameraId, color: ColorName): Promise<{ x: number; y: number } | null>;
  onLine?(line: number): void;
  log?(kind: LogKind, msg: string): void;
  record?(action: RobotAction): void;
}

interface Runtime extends RunHooks {
  speed: number;
  vars: Map<string, { x: number; y: number }>;
  line: number;
  /** A move that starts with the arm already into itself may go on while it gets no deeper, mm. */
  selfSlack?: number;
}

export async function runProgram(steps: readonly Step[], hooks: RunHooks): Promise<void> {
  const rt: Runtime = { ...hooks, speed: DEFAULT_SPEED, vars: new Map(), line: 0 };
  await runList(steps, rt);
}

async function runList(list: readonly Step[], rt: Runtime): Promise<void> {
  for (const s of list) {
    rt.line = s.line;
    rt.onLine?.(s.line);
    try {
      await runStep(s, rt);
    } catch (err) {
      if (err instanceof RunError && !err.line) err.line = s.line;
      throw err;
    }
  }
}

async function runStep(s: Step, rt: Runtime): Promise<void> {
  const w = rt.world;
  switch (s.type) {
    case 'home':
      return moveJoints(rt, activeArm().home);
    case 'pose':
      w.stats.posesUsed.push(s.name);
      return moveJoints(rt, rt.poses[s.name]);
    case 'joint': {
      const t = w.angles.slice();
      t[s.j - 1] = s.deg;
      return s.sec ? moveJointsTimed(rt, t, s.sec) : moveJoints(rt, t);
    }
    case 'move':
      return s.sec ? moveJointsTimed(rt, s.joints, s.sec) : moveJoints(rt, s.joints, s.speed ?? undefined);
    case 'speed':
      rt.speed = s.value;
      return;
    case 'wait':
      rt.record?.({ type: 'wait', sec: s.sec, line: s.line });
      return rt.animate(s.sec, () => {});
    case 'repeat':
      for (let k = 0; k < s.times; k += 1) {
        rt.onLine?.(s.line);
        await runList(s.body, rt);
      }
      return;
    case 'moveTo':
      return moveTool(rt, { x: s.x, y: s.y, z: s.z });
    case 'above':
    case 'down': {
      const place = resolveTarget(rt, s.target);
      const z = s.type === 'above' ? aboveHeight(rt, place) : downHeight(rt, place);
      return moveTool(rt, { x: place.x, y: place.y, z });
    }
    case 'find': {
      const found = await rt.see(s.camera, s.color);
      if (!found) {
        throw new RunError(
          `${s.camera === 'hand' ? '손 카메라' : '키트 카메라'}에 ${s.color} 블록이 보이지 않아요.`,
          s.camera === 'hand' ? '손 카메라가 블록 쪽을 보도록 먼저 움직여 주세요.' : '찾기 전에 robot.home() 으로 관찰 자세에 가면 팔이 카메라를 가리지 않아요 (공식 키트 프로그램도 그렇게 해요). 블록이 흰 보정판 위에 있는지도 확인해 주세요.',
        );
      }
      rt.vars.set(s.variable, found);
      rt.record?.({ type: 'found', color: s.color, x: found.x, y: found.y, line: s.line });
      rt.log?.('info', `${s.color} 블록을 찾았어요: x ${Math.round(found.x)}, y ${Math.round(found.y)} mm`);
      return;
    }
    case 'grip':
      rt.record?.({ type: 'gripper', open: s.open, line: s.line });
      return s.open ? release(rt, 'grip') : gripClose(rt);
    case 'pump':
      rt.record?.({ type: 'pump', on: s.on, line: s.line });
      return s.on ? pumpOn(rt) : release(rt, 'suction');
    // The pen holder and the cylinder have no motor or pin: they are moved by
    // the arm, so these commands become arm motion (and run on the real robot).
    case 'pen':
      return penSet(rt, s.down);
    case 'push':
      return cylinderPush(rt);
  }
}

/* --- targets --------------------------------------------------------------- */

interface Place {
  x: number;
  y: number;
  /** Height of the surface the tool works on (a bin: its rim), mm. */
  top: number;
  bin?: Bin;
}

function resolveTarget(rt: Runtime, t: Target): Place {
  if (t.kind === 'bin') {
    const b = BINS[t.bin];
    return { x: b.drop.x, y: b.drop.y, top: b.rimZ, bin: b };
  }
  if (t.kind === 'button') return { x: BUTTON.x, y: BUTTON.y, top: BUTTON.heightMm };
  if (t.kind === 'spot') return { x: SPOTS[t.spot].x, y: SPOTS[t.spot].y, top: 0 };
  if (t.kind === 'block') {
    // A held block is wherever the tool carries it: "위로" lifts it straight up.
    const b = rt.world.blocks.find((k) => k.color === t.color);
    if (!b) throw new RunError('책상에 블록이 없어요.', '아래 [실습 환경] 막대에서 [매트] 를 켜 주세요.');
    return { x: b.x, y: b.y, top: b.z + BLOCK_MM / 2 };
  }
  const v = rt.vars.get(t.name);
  if (!v) throw new RunError(`'${t.name}'을 아직 찾지 않았어요.`);
  return { x: v.x, y: v.y, top: BLOCK_MM };
}

/** How far a held block's bottom hangs below the TCP, mm. */
function heldDrop(rt: Runtime): number {
  if (!rt.world.held) return 0;
  return EFFECTOR_BY_ID[rt.world.effector].kind === 'suction' ? BLOCK_MM : BLOCK_MM / 2;
}

/** Highest bin rim: a carried block must clear it wherever it travels. */
const TALLEST_RIM = Math.max(...BIN_NAMES.map((n) => BINS[n].rimZ), STORAGE_BOX.rimZ);

/** Everything with walls on the kit: the four bins and the material box. */
const KIT_TUBS: readonly { tub: Tub; label: string }[] = [
  ...BIN_NAMES.map((n) => ({ tub: BINS[n] as Tub, label: `분류함 ${n}` })),
  { tub: STORAGE_BOX, label: '블록 보관함' },
];

/** Highest wall a square of half-size `half` centred at y touches (the bins' front is lower). */
function wallTopOver(t: Tub, y: number, half: number): number {
  return Math.max(wallTopAt(t, y - half), wallTopAt(t, y + half));
}

/**
 * TCP height for "위로 가기". Over a bin: high enough that a held block clears
 * the rim. Carrying a block anywhere: high enough to clear every rim, so the
 * next move across the kit cannot sweep it into a bin wall (the official
 * program likewise lifts before it travels).
 */
function aboveHeight(rt: Runtime, place: Place): number {
  if (place.bin) return place.bin.rimZ + DROP_CLEARANCE_MM + heldDrop(rt);
  const carry = rt.world.held ? TALLEST_RIM + DROP_CLEARANCE_MM + heldDrop(rt) : 0;
  return Math.max(place.top + ABOVE_MM, carry);
}

/** TCP height for "내려가기" onto a place, per tool. */
function downHeight(rt: Runtime, place: Place): number {
  const kind = EFFECTOR_BY_ID[rt.world.effector].kind;
  const holding = rt.world.held !== null;
  // A bin is dropped into from just above its rim.
  if (place.bin) return place.bin.rimZ + 3 + heldDrop(rt);
  switch (kind) {
    case 'grip':
      // Grasp a block at mid-height; set a held block down 1 mm above the block below.
      return holding ? place.top + BLOCK_MM / 2 + 1 : place.top - BLOCK_MM / 2;
    case 'suction':
      return holding ? place.top + BLOCK_MM + 1 : place.top;
    case 'pen':
      return place.top;
    case 'press':
      return place.top + 6;
    case 'hold':
      return place.top + 40;
    case 'none':
      // The bare flange: stop a finger's width above, never press the flange onto anything.
      return place.top + 15;
  }
}

/* --- motion ---------------------------------------------------------------- */

function tcp(rt: Runtime): number {
  return tcpFor(rt.world.effector, rt.world.cameraFlange);
}

function effectiveSpeed(rt: Runtime, speed?: number): number {
  return Math.min(SPEED_CAP, speed ?? rt.speed);
}

/**
 * "N초 동안 …": the speed that makes the move take `sec` seconds (the robot gets that speed,
 * so it takes about as long there). Too quick for the speed limit: the fastest allowed, and a
 * note; a short move with a long time: the slowest speed, then waiting out the rest.
 */
async function moveJointsTimed(rt: Runtime, target: readonly number[], sec: number): Promise<void> {
  const from = rt.world.angles;
  let lo = 1;
  let hi = SPEED_CAP;
  if (jointMoveDuration(from, target, hi) > sec) {
    rt.log?.('warn', `${rt.line}번째 줄: ${sec}초 안에 가기엔 너무 빨라요. 가장 빠른 속도(${SPEED_CAP})로 ${jointMoveDuration(from, target, hi).toFixed(1)}초 걸려요.`);
    return moveJoints(rt, target, hi);
  }
  if (jointMoveDuration(from, target, lo) <= sec) {
    const took = jointMoveDuration(from, target, lo);
    await moveJoints(rt, target, lo);
    const rest = Math.round((sec - took) * 10) / 10;
    if (rest > 0.05) {
      rt.record?.({ type: 'wait', sec: rest, line: rt.line });
      await rt.animate(rest, () => {});
    }
    return;
  }
  for (let k = 0; k < 20; k += 1) {
    const mid = (lo + hi) / 2;
    if (jointMoveDuration(from, target, mid) > sec) lo = mid;
    else hi = mid;
  }
  return moveJoints(rt, target, Math.max(1, Math.round(hi * 10) / 10));
}

async function moveJoints(rt: Runtime, target: readonly number[], speed?: number): Promise<void> {
  const v = effectiveSpeed(rt, speed);
  await play(rt, jointTrajectory(rt.world.angles, target, v));
  rt.record?.({ type: 'angles', angles: target.slice(), speed: v, line: rt.line });
  noteArrival(rt);
}

function noteArrival(rt: Runtime): void {
  const p = tcpPositionMm(rt.chain, rt.world.angles, tcp(rt));
  rt.world.stats.arrivals.push({ x: p.x, y: p.y, z: p.z });
}

/**
 * Move the TCP to a point with the tool (almost) vertical. When the tool is
 * already held the way the target needs it, the TCP travels in a straight line
 * (like send_coords in linear mode) — so lowering onto a block is a clean
 * vertical descent; otherwise the arm makes one smooth joint move.
 */
async function moveTool(rt: Runtime, to: PointMm): Promise<void> {
  const len = tcp(rt);
  const w = rt.world;
  const speed = effectiveSpeed(rt);
  // A vertical move (descend, lift) keeps the way the tool is held, so it stays
  // a straight line. Travel to somewhere else starts the search from straight
  // down again, so a lean needed at one bin is not dragged across the kit.
  const now = currentOrientation(rt.chain, w.angles, len);
  const here = tcpPositionMm(rt.chain, w.angles, len);
  const vertical = Math.hypot(to.x - here.x, to.y - here.y) < 5;
  // A lowered pen keeps its orientation for the whole stroke too.
  let end = now && (vertical || w.penDown) ? solveToolPose(rt.chain, to, w.angles, { tcpMm: len, orientation: now }) : null;
  if (!end?.converged) end = solveToolPose(rt.chain, to, w.angles, { tcpMm: len });
  if (!end.converged) {
    throw new RunError(`(${fmt(to)})에는 도구를 아래로 향한 채 닿을 수 없어요.`, '로봇에 더 가까운 곳이나 더 높은 곳으로 바꿔 주세요.');
  }
  if (now && now.yawDeg === end.orientation.yawDeg && now.tiltDeg === end.orientation.tiltDeg) {
    const from = here;
    const plan = linearPath(rt.chain, w.angles, from, to, len, speed, end.orientation);
    if (plan.ok) {
      await play(rt, plan.trajectory);
      // The real arm gets the line as joint targets every ~15 mm (send_angles
      // interpolates in joint space, which over 15 mm stays within a fraction
      // of a millimetre of the straight line).
      const pieces = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / 15));
      for (let k = 1; k <= pieces; k += 1) {
        const t = (plan.trajectory.durationS * k) / pieces;
        rt.record?.({ type: 'angles', angles: plan.trajectory.sample(t), speed, line: rt.line, via: k < pieces });
      }
      noteArrival(rt);
      return;
    }
  }
  if (w.penDown) {
    throw new RunError(`펜을 내린 채로 (${fmt(to)})까지 곧게 갈 수 없어요.`, '펜을 올리고 옮기거나, 로봇에 더 가까운 곳에 그려 주세요.');
  }
  await play(rt, jointTrajectory(w.angles, end.anglesDeg, speed));
  rt.record?.({ type: 'angles', angles: end.anglesDeg.slice(), speed, line: rt.line });
  noteArrival(rt);
}

async function play(rt: Runtime, traj: Trajectory): Promise<void> {
  // Like a servo meeting the table: on contact the arm stays at the last pose that was
  // still clear (not drawn inside the table), and the run stops with the reason.
  let clear = rt.world.angles.slice();
  const step = (angles: number[]) => {
    rt.world.angles = angles;
    try {
      afterPoseChange(rt);
      clear = angles.slice();
    } catch (err) {
      if (err instanceof RunError) {
        rt.world.angles = clear;
        rt.world.version += 1;
      }
      throw err;
    }
  };
  rt.world.goal = traj.end.slice();
  try {
    await rt.animate(traj.durationS, (t) => step(traj.sample(t)));
    step(traj.end.slice());
  } finally {
    rt.world.goal = null;
  }
}

function fmt(p: PointMm): string {
  return `x ${Math.round(p.x)}, y ${Math.round(p.y)}, z ${Math.round(p.z)}`;
}

/* --- per-frame world update and safety checks ----------------------------- */

export function flangeMatrixMm(chain: readonly ChainSegment[], angles: readonly number[]): Matrix4 {
  const frames = forwardKinematicsFrames(chain, angles);
  const m = frames[frames.length - 1].clone();
  m.elements[12] *= 1000;
  m.elements[13] *= 1000;
  m.elements[14] *= 1000;
  return m;
}

/** TCP frame (flange moved out along its axis), mm. */
function tcpMatrix(rt: Runtime, lengthMm = tcp(rt)): Matrix4 {
  return flangeMatrixMm(rt.chain, rt.world.angles).multiply(new Matrix4().makeTranslation(0, 0, lengthMm));
}

function afterPoseChange(rt: Runtime): void {
  const w = rt.world;
  w.version += 1;
  w.angles.forEach((a, i) => {
    if (a < w.stats.jointMin[i]) w.stats.jointMin[i] = a;
    if (a > w.stats.jointMax[i]) w.stats.jointMax[i] = a;
  });

  // Arm joints above the table.
  const frames = forwardKinematicsFrames(rt.chain, w.angles);
  frames.forEach((f, i) => {
    if (i >= 1 && f.elements[14] < 0.005) {
      throw new RunError(`${i + 1}번 관절이 책상에 닿아요.`, '팔이 덜 숙여지도록 각도나 위치를 바꿔 주세요.', true);
    }
  });
  // The arm into itself or back through its base (with or without the physics engine).
  const self = selfContact(rt.chain, w.angles, activeArm().family, tcp(rt), 0, rt.selfSlack ?? SELF_SLACK_MM);
  if (self) {
    const fix = selfFix(rt.chain, w.angles, activeArm(), tcp(rt));
    throw new SelfCollision(selfMessage(self, fix, w.angles), '팔이 스스로 부딪히는 자세는 실제 로봇도 망가뜨려요. 안내한 관절을 바꾸거나 [기본 자세] 에서 다시 시작해 주세요.', true);
  }

  const tipMatrix = tcpMatrix(rt);
  const tip = new Vector3().setFromMatrixPosition(tipMatrix);
  const kind = EFFECTOR_BY_ID[w.effector].kind;

  // Tool tip above the board. The pen may press 1 mm into its spring (the
  // holder's ±1 mm); gripper fingertips reach up to ~10 mm past the grasp point
  // when closed.
  const floor = kind === 'pen' ? -1 : kind === 'grip' ? 10 : -0.5;
  if (tip.z < floor) {
    throw new RunError(`${EFFECTOR_BY_ID[w.effector].name}이(가) 판에 닿아요.`, '더 높은 곳에서 멈추도록 z 값을 키워 주세요.', true);
  }
  // The pen draws whenever its tip is on the paper.
  w.penDown = kind === 'pen' && tip.z <= 0.8;
  // The cylinder's rod pushes the button cap down as the arm lowers onto it.
  if (kind === 'press') {
    const over = Math.hypot(tip.x - BUTTON.x, tip.y - BUTTON.y) < BUTTON.radiusMm - 2;
    w.buttonDepth = over ? Math.min(1, Math.max(0, (BUTTON.heightMm - tip.z) / BUTTON.travelMm)) : 0;
    if (over && tip.z < BUTTON.heightMm - BUTTON.travelMm - 0.5) {
      throw new RunError('실린더가 버튼을 끝까지 누르고도 더 내려가요.', '버튼 위에서 더 높이 멈춰 주세요.', true);
    }
  }

  if (w.theme === 'kit') kitCollisions(w, frames, tip);
  else if (w.fixed.length || (w.objects.length && !w.physics)) deskCollisions(w, frames, tip, tcp(rt));

  // Held block follows the tool.
  if (w.held) {
    const b = w.blocks.find((k) => k.color === w.held!.color)!;
    const m = tipMatrix.clone().multiply(w.held.offset);
    const p = new Vector3().setFromMatrixPosition(m);
    b.x = p.x;
    b.y = p.y;
    b.z = p.z;
    b.yawDeg = yawOf(m);
    const inBin = w.theme === 'kit' ? binAt(b.x, b.y, BLOCK_MM / 2) : null;
    if (b.z - BLOCK_MM / 2 < (inBin ? inBin.floorZ : 0) - 0.5) {
      throw new RunError(`잡은 ${b.color} 블록이 판에 부딪혀요.`, '조금 더 위에서 놓아 주세요.', true);
    }
    if (w.theme === 'kit') {
      for (const { tub, label } of KIT_TUBS) {
        if (b.z - BLOCK_MM / 2 < wallTopOver(tub, b.y, BLOCK_MM / 2) && hitsWalls(b.x, b.y, BLOCK_MM / 2, tub)) {
          throw new RunError(`잡은 ${b.color} 블록이 ${label} 벽에 부딪혀요.`, `${label} 위로 더 올린 뒤 옮겨 주세요.`, true);
        }
      }
    }
    for (const other of w.blocks) {
      if (other === b) continue;
      if (overlaps(b, other, 0.5)) {
        throw new RunError(`잡은 ${b.color} 블록이 ${other.color} 블록에 부딪혀요.`, '다른 블록이 없는 곳으로 옮겨 주세요.', true);
      }
    }
  }
  if (w.carry) carryObject(w, tip);
  toolIntoBlocks(w, tip, kind);
  penTrail(w, tip, kind);
}

/** Kit only: the camera stand and the bin walls. */
function kitCollisions(w: WorldState, frames: readonly Matrix4[], tip: Vector3): void {
  // Camera stand: arm joints, flange and tool tip keep ~20 mm off it.
  const pts = frames.map((f) => new Vector3(f.elements[12] * 1000, f.elements[13] * 1000, f.elements[14] * 1000));
  pts.push(tip);
  for (const p of pts) {
    const hit = STAND_BOXES.find((bx) => p.x > bx.xMin - 20 && p.x < bx.xMax + 20 && p.y > bx.yMin - 20 && p.y < bx.yMax + 20 && p.z > bx.zMin - 20 && p.z < bx.zMax + 20);
    if (hit) throw new RunError(`팔이 ${hit.name}에 닿아요.`, '거치대에서 먼 쪽으로, 더 낮게 움직여 주세요.', true);
  }

  // Bin walls: the tool tip may only go below a rim inside the opening.
  for (const { tub, label } of KIT_TUBS) {
    if (tip.z < wallTopAt(tub, tip.y) && hitsWalls(tip.x, tip.y, 0, tub)) {
      throw new RunError(`${EFFECTOR_BY_ID[w.effector].name}이(가) ${label} 벽에 닿아요.`, `${label} 위로 충분히 올라간 뒤 옮겨 주세요.`, true);
    }
  }
}

/** Arm only: the scene's furniture always, the desk's objects when physics is off (keeping ~12 mm off). */
function deskCollisions(w: WorldState, frames: readonly Matrix4[], tip: Vector3, tcpMm: number): void {
  const joints = frames.map((f) => new Vector3(f.elements[12] * 1000, f.elements[13] * 1000, f.elements[14] * 1000));
  joints.push(tip);
  // Points along the links too (a link can cross a thin object between two joints); `tool`: a point of
  // the tool (flange to tip), this far from the tip, mm.
  const n = joints.length;
  const pts: { p: Vector3; tool?: number }[] = [];
  joints.forEach((p, i) => {
    pts.push({ p, tool: i === n - 1 ? 0 : i === n - 2 ? tcpMm : undefined });
    const next = joints[i + 1];
    if (next) for (const f of [0.25, 0.5, 0.75]) pts.push({ p: p.clone().lerp(next, f), tool: i === n - 2 ? tcpMm * (1 - f) : undefined });
  });
  const pad = 12;
  const inBox = (p: Vector3, b: FixedBox, d: number) => p.x > b.min[0] - d && p.x < b.max[0] + d && p.y > b.min[1] - d && p.y < b.max[1] + d && p.z > b.min[2] - d && p.z < b.max[2] + d;
  const fix = w.physics ? '피해서 더 높게 움직여 주세요.' : '피해서 움직이거나, [실습 환경] 막대에서 [물리] 를 켜면 팔이 물건을 밀어요.';
  for (const b of w.fixed) {
    if (pts.some(({ p }) => inBox(p, b, pad))) throw new RunError(`팔이 ${b.name}에 닿아요.`, fix, true);
  }
  if (w.physics) return;
  for (const o of w.objects) {
    if (o.id === w.carry?.id) continue;
    const b = objectBox(o);
    // The tool on an object it works on: open fingers may go round it, a suction cup may touch its top.
    const rule = toolRule(w, o, tip);
    const top = o.z + o.size[2];
    const hit = pts.some(({ p, tool }) =>
      tool === undefined || !rule ? inBox(p, b, pad) : rule === 'straddle' ? tool > FINGER_MM && inBox(p, b, 0) : p.z < top - 1.5 && p.z > o.z && insideFoot(o, localXY(o, p), 0),
    );
    if (hit) throw new RunError(`팔이 ${b.name}에 닿아요.`, fix, true);
  }
}

/* --- desk objects the tool picks up (physics off) ----------------------------- */

/** The last this many mm of a gripper are its fingers: they may go round what they are about to hold. */
const FINGER_MM = 40;

const objectName = (o: DeskObject) => OBJECT_KINDS[o.kind].name;

/** A point in an object's own frame (its turn taken off), from its centre, mm. */
function localXY(o: DeskObject, p: { x: number; y: number }): { x: number; y: number } {
  const a = (-o.yawDeg * Math.PI) / 180;
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Is a point (object frame) over the object's footprint, `inset` mm in from its edge? */
function insideFoot(o: DeskObject, l: { x: number; y: number }, inset: number): boolean {
  const shape = OBJECT_KINDS[o.kind].shape;
  if (shape === 'box' || shape === 'bin') return Math.abs(l.x) < o.size[0] / 2 - inset && Math.abs(l.y) < o.size[1] / 2 - inset;
  return Math.hypot(l.x, l.y) < o.size[0] / 2 - inset;
}

/** How far a gripper closes on an object: across a solid one, onto the wall of a cup (held by its rim). */
function gripWidth(o: DeskObject): number {
  const shape = OBJECT_KINDS[o.kind].shape;
  return shape === 'cup' ? 4 : shape === 'box' || shape === 'bin' ? Math.min(o.size[0], o.size[1]) : o.size[0];
}

/** Gripper fingers lined up on an object: round its middle, or on a cup's rim. */
function gripLined(o: DeskObject, tip: Vector3): boolean {
  const shape = OBJECT_KINDS[o.kind].shape;
  const l = localXY(o, tip);
  if (shape === 'cup') return Math.abs(Math.hypot(l.x, l.y) - (o.size[0] / 2 - 2)) < 8;
  return shape !== 'bin' && Math.hypot(l.x, l.y) < 12;
}

/**
 * How the tool's own points meet a desk object under it: 'straddle' — open gripper fingers go round
 * it (the rest of the tool keeps off), 'top' — the tool may touch its top but not go in; null — kept off.
 */
function toolRule(w: WorldState, o: DeskObject, tip: Vector3): 'straddle' | 'top' | null {
  const kind = EFFECTOR_BY_ID[w.effector].kind;
  if (kind !== 'grip' && kind !== 'suction') return null;
  if (kind === 'grip' && gripLined(o, tip) && w.gapMm >= gripWidth(o) + 1) return 'straddle';
  return insideFoot(o, localXY(o, tip), 0) ? 'top' : null;
}

/** The object a closing gripper takes hold of at the tip, or null. */
function gripTarget(w: WorldState, tip: Vector3): DeskObject | null {
  const open = EFFECTOR_BY_ID[w.effector].gapMm?.open ?? 0;
  const at = (o: DeskObject) => {
    const top = o.z + o.size[2];
    return OBJECT_KINDS[o.kind].shape === 'cup' ? tip.z >= top - 40 && tip.z <= top : tip.z > o.z + 2 && tip.z < top - 2;
  };
  return w.objects.find((o) => at(o) && gripLined(o, tip) && gripWidth(o) <= open - 1) ?? null;
}

/** The flat-topped object a suction cup at the tip is on, or null. */
function suctionTarget(w: WorldState, tip: Vector3): DeskObject | null {
  const flat = (o: DeskObject) => OBJECT_KINDS[o.kind].shape === 'box' || OBJECT_KINDS[o.kind].shape === 'cylinder';
  return w.objects.find((o) => flat(o) && Math.abs(tip.z - (o.z + o.size[2])) < 3 && insideFoot(o, localXY(o, tip), 3)) ?? null;
}

/** Hold an object at the tool tip from now on. */
function takeObject(rt: Runtime, o: DeskObject, tip: Vector3): void {
  rt.world.carry = { id: o.id, dx: o.x - tip.x, dy: o.y - tip.y, dz: o.z - tip.z };
  rt.world.version += 1;
  rt.log?.('info', `${objectName(o)}을(를) 잡았어요.`);
}

/** The bin an object is inside of (through its opening, above its floor), or null. */
function binAround(w: WorldState, o: DeskObject): DeskObject | null {
  const f = footprint(o);
  const around = (k: DeskObject) => {
    if (k === o || OBJECT_KINDS[k.kind].shape !== 'bin') return false;
    const g = footprint(k);
    return Math.abs(o.x - k.x) + f.hx <= g.hx - 4 && Math.abs(o.y - k.y) + f.hy <= g.hy - 4 && o.z >= k.z + 3;
  };
  return w.objects.find(around) ?? null;
}

/** What a carried object, where it is now, runs into: the name of the furniture or object, or null. */
function objectHit(w: WorldState, o: DeskObject): string | null {
  const f = footprint(o);
  const top = o.z + o.size[2];
  const over = (min: readonly number[], max: readonly number[]) =>
    o.x + f.hx > min[0] + 1 && o.x - f.hx < max[0] - 1 && o.y + f.hy > min[1] + 1 && o.y - f.hy < max[1] - 1 && o.z < max[2] - 1 && top > min[2] + 1;
  for (const b of w.fixed) if (over(b.min, b.max)) return b.name;
  const bin = binAround(w, o);
  for (const k of w.objects) {
    if (k.id === o.id || k === bin) continue;
    const g = footprint(k);
    if (over([k.x - g.hx, k.y - g.hy, k.z], [k.x + g.hx, k.y + g.hy, k.z + k.size[2]])) return objectName(k);
  }
  return null;
}

/** The carried object follows the tool tip; it may not go into the desk, the furniture or other objects. */
function carryObject(w: WorldState, tip: Vector3): void {
  const c = w.carry!;
  const o = w.objects.find((k) => k.id === c.id);
  if (!o) return;
  const moved: DeskObject = { ...o, x: tip.x + c.dx, y: tip.y + c.dy, z: tip.z + c.dz, q: undefined };
  if (moved.z < -0.5) throw new RunError(`잡은 ${objectName(o)}이(가) 책상에 부딪혀요.`, '조금 더 위에서 놓아 주세요.', true);
  const hit = objectHit(w, moved);
  if (hit) throw new RunError(`잡은 ${objectName(o)}이(가) ${hit}에 부딪혀요.`, `${hit}보다 높이 들어서 옮겨 주세요.`, true);
  Object.assign(o, { x: moved.x, y: moved.y, z: moved.z, q: undefined });
}

/** Height of what is under an object let go: the desk, furniture, another object or a bin's floor, mm. */
function supportUnder(w: WorldState, o: DeskObject): number {
  const f = footprint(o);
  const bin = binAround(w, o);
  let z = bin ? bin.z + 4 : 0;
  const under = (min: readonly number[], max: readonly number[]) => o.x + f.hx > min[0] + 1 && o.x - f.hx < max[0] - 1 && o.y + f.hy > min[1] + 1 && o.y - f.hy < max[1] - 1 && max[2] <= o.z + 1;
  for (const b of w.fixed) if (under(b.min, b.max)) z = Math.max(z, b.max[2]);
  for (const k of w.objects) {
    if (k.id === o.id || k === bin) continue;
    const g = footprint(k);
    if (under([k.x - g.hx, k.y - g.hy], [k.x + g.hx, k.y + g.hy, k.z + k.size[2]])) z = Math.max(z, k.z + k.size[2]);
  }
  return z;
}

/** A carried object let go: it drops onto what is under it. */
async function settleObject(rt: Runtime, o: DeskObject): Promise<void> {
  const w = rt.world;
  const z0 = o.z;
  const z1 = supportUnder(w, o);
  if (z0 - z1 > 0.2) {
    const fall = Math.min(0.35, Math.sqrt((2 * (z0 - z1)) / 9810));
    await rt.animate(fall, (t) => {
      const f = Math.min(1, t / fall);
      o.z = z0 + (z1 - z0) * f * f;
      w.version += 1;
    });
  }
  o.z = z1;
  w.version += 1;
  const bin = binAround(w, o);
  if (bin) rt.log?.('info', `${objectName(o)}을(를) ${objectName(bin)}에 넣었어요.`);
  else if (z0 - z1 > 8) rt.log?.('warn', `${objectName(o)}이(가) ${Math.round(z0 - z1)}mm 높이에서 떨어졌어요. 더 내려가서 놓아 주세요.`);
  else rt.log?.('info', `${objectName(o)}을(를) 내려놓았어요.`);
}

function toolIntoBlocks(w: WorldState, tip: Vector3, kind: string): void {
  // Tool driven into a block it is not holding. Open gripper fingers straddle a
  // block, so for grippers only a closed hand counts.
  const gripOpenEnough = kind === 'grip' && w.gapMm > BLOCK_MM + 1;
  if (!gripOpenEnough) {
    for (const b of w.blocks) {
      if (w.held && b.color === w.held.color) continue;
      const inside =
        Math.abs(tip.x - b.x) < BLOCK_MM / 2 + 1 &&
        Math.abs(tip.y - b.y) < BLOCK_MM / 2 + 1 &&
        tip.z < b.z + BLOCK_MM / 2 - (kind === 'suction' ? 1.5 : 0.5) &&
        tip.z > b.z - BLOCK_MM / 2;
      if (inside) {
        const e = EFFECTOR_BY_ID[w.effector];
        const tooNarrow = kind === 'grip' && (e.gapMm?.open ?? 0) < BLOCK_MM + 1;
        throw new RunError(
          `${e.name}이(가) ${b.color} 블록에 부딪혀요.`,
          tooNarrow
            ? `${e.name}는 최대 ${e.gapMm?.open}mm 까지만 벌어져서 ${BLOCK_MM}mm 블록을 잡을 수 없어요. 어댑티브 그리퍼나 흡착 펌프를 써 주세요.`
            : kind === 'grip'
              ? '그리퍼를 먼저 열어 주세요.'
              : '블록 위에서 멈추도록 높이를 바꿔 주세요.',
          true,
        );
      }
    }
  }

}

function penTrail(w: WorldState, tip: Vector3, kind: string): void {
  if (kind === 'pen' && w.penDown && tip.z <= 0.8) {
    const stroke = w.trail[w.trail.length - 1];
    const last = stroke?.[stroke.length - 1];
    if (!stroke) w.trail.push([[tip.x, tip.y]]);
    else if (!last || Math.hypot(last[0] - tip.x, last[1] - tip.y) > 1) stroke.push([tip.x, tip.y]);
  } else if (w.trail.length && w.trail[w.trail.length - 1].length) {
    w.trail.push([]);
  }
}

/** Does a square of half-size `half` at (x, y) touch the bin's walls (inside the outer footprint, not inside the opening)? */
function hitsWalls(x: number, y: number, half: number, t: Tub): boolean {
  const o = t.outer;
  const inOuter = Math.abs(x - o.x) < o.sx / 2 + half && Math.abs(y - o.y) < o.sy / 2 + half;
  const inInner = Math.abs(x - t.x) <= t.innerX / 2 - half && Math.abs(y - t.y) <= t.innerY / 2 - half;
  return inOuter && !inInner;
}

function overlaps(a: BlockState, b: BlockState, tol: number): boolean {
  const s = BLOCK_MM - tol;
  return Math.abs(a.x - b.x) < s && Math.abs(a.y - b.y) < s && Math.abs(a.z - b.z) < s;
}

function yawOf(m: Matrix4): number {
  return (Math.atan2(m.elements[1], m.elements[0]) * 180) / Math.PI;
}

/* --- tools ------------------------------------------------------------------ */

async function gripClose(rt: Runtime): Promise<void> {
  const w = rt.world;
  const gap = EFFECTOR_BY_ID[w.effector].gapMm!;
  const tipMatrix = tcpMatrix(rt);
  const tip = new Vector3().setFromMatrixPosition(tipMatrix);
  const between = w.held
    ? null
    : w.blocks.find(
        (b) => Math.hypot(b.x - tip.x, b.y - tip.y) < 9 && Math.abs(b.z - tip.z) < 9,
      );
  const target = between || w.held || w.carry || w.physics ? null : gripTarget(w, tip);
  const stopAt = between ? Math.max(gap.closed, BLOCK_MM) : target ? Math.max(gap.closed, gripWidth(target)) : gap.closed;
  const from = w.gapMm;
  await rt.animate(0.5, (t) => {
    w.gapMm = from + (stopAt - from) * Math.min(1, t / 0.5);
    w.version += 1;
  });
  if (between && !w.held) {
    if (from < BLOCK_MM) {
      throw new RunError('그리퍼가 닫힌 채로 블록 위에 내려왔어요.', '내려가기 전에 그리퍼를 열어 주세요.');
    }
    w.held = { color: between.color, offset: relativeOffset(tipMatrix, between) };
    w.version += 1;
    rt.log?.('info', `${between.color} 블록을 잡았어요.`);
  } else if (target) {
    if (from < gripWidth(target)) throw new RunError('그리퍼가 덜 열린 채로 내려왔어요.', '내려가기 전에 그리퍼를 열어 주세요.');
    takeObject(rt, target, tip);
  } else if (!w.held && !w.carry) {
    rt.log?.('warn', '그리퍼를 닫았지만 잡힌 블록이 없어요.');
  }
}

async function pumpOn(rt: Runtime): Promise<void> {
  const w = rt.world;
  w.pump = true;
  w.version += 1;
  await rt.animate(0.3, () => {});
  const tipMatrix = tcpMatrix(rt);
  const tip = new Vector3().setFromMatrixPosition(tipMatrix);
  const touching = w.held
    ? null
    : w.blocks.find(
        (b) => Math.hypot(b.x - tip.x, b.y - tip.y) < 9 && Math.abs(b.z + BLOCK_MM / 2 - tip.z) < 3,
      );
  const object = touching || w.held || w.carry || w.physics ? null : suctionTarget(w, tip);
  if (touching) {
    w.held = { color: touching.color, offset: relativeOffset(tipMatrix, touching) };
    w.version += 1;
    rt.log?.('info', `${touching.color} 블록이 붙었어요.`);
  } else if (object) {
    takeObject(rt, object, tip);
  } else if (!w.held && !w.carry) {
    rt.log?.('warn', '펌프를 켰지만 붙은 블록이 없어요. 블록 윗면에 닿았는지 확인해 주세요.');
  }
}

function relativeOffset(tipMatrix: Matrix4, b: BlockState): Matrix4 {
  const blockMatrix = new Matrix4()
    .makeRotationZ((b.yawDeg * Math.PI) / 180)
    .setPosition(b.x, b.y, b.z);
  return tipMatrix.clone().invert().multiply(blockMatrix);
}

async function release(rt: Runtime, kind: 'grip' | 'suction'): Promise<void> {
  const w = rt.world;
  const held = w.held ? w.blocks.find((b) => b.color === w.held!.color)! : null;
  const carried = w.carry ? (w.objects.find((o) => o.id === w.carry!.id) ?? null) : null;
  w.held = null;
  w.carry = null;
  if (kind === 'grip') {
    const from = w.gapMm;
    const to = EFFECTOR_BY_ID[w.effector].gapMm!.open;
    await rt.animate(0.45, (t) => {
      w.gapMm = from + (to - from) * Math.min(1, t / 0.45);
      w.version += 1;
    });
  } else {
    w.pump = false;
    w.version += 1;
    await rt.animate(0.25, () => {});
  }
  if (carried) return settleObject(rt, carried);
  if (!held) return;
  // A block whose centre is over a bin opening tips in: it ends up inside,
  // clear of the walls. Anything else settles straight down.
  const into = w.theme === 'kit' ? binAt(held.x, held.y) : null;
  if (into) {
    const hx = into.innerX / 2 - BLOCK_MM / 2 - 0.5;
    const hy = into.innerY / 2 - BLOCK_MM / 2 - 0.5;
    held.x = Math.min(into.x + hx, Math.max(into.x - hx, held.x));
    held.y = Math.min(into.y + hy, Math.max(into.y - hy, held.y));
    held.yawDeg = 0;
  }
  const support = supportHeight(w, held);
  const z0 = held.z;
  const z1 = support + BLOCK_MM / 2;
  if (z0 - z1 > 0.2) {
    const fall = Math.min(0.35, Math.sqrt((2 * (z0 - z1)) / 9810));
    await rt.animate(fall, (t) => {
      const f = Math.min(1, t / fall);
      held.z = z0 + (z1 - z0) * f * f;
      w.version += 1;
    });
  }
  held.z = z1;
  w.version += 1;
  // Dropping into a bin from above its rim is how the kit sorts; elsewhere a long fall is a mistake.
  if (!into && z0 - z1 > 8) rt.log?.('warn', `${held.color} 블록이 ${Math.round(z0 - z1)}mm 높이에서 떨어졌어요. 더 내려가서 놓아 주세요.`);
  const bin = w.theme === 'kit' ? binAt(held.x, held.y) : null;
  const spot = w.theme === 'arm' ? spotAt(held.x, held.y) : null;
  if (spot) {
    rt.log?.('info', `${held.color} 블록을 ${spot}에 놓았어요.`);
  } else if (bin) {
    const right = COLOR_TO_BIN[held.color] === bin.name;
    rt.log?.(right ? 'info' : 'warn', right ? `${held.color} 블록을 분류함 ${bin.name}에 넣었어요.` : `${held.color} 블록이 분류함 ${bin.name}에 들어갔어요. ${held.color}은(는) 분류함 ${COLOR_TO_BIN[held.color]}이에요.`);
  } else {
    rt.log?.('info', `${held.color} 블록을 내려놓았어요.`);
  }
}

function supportHeight(w: WorldState, b: BlockState): number {
  // Inside a bin the floor is the bin's floor; a block half over a rim rests on the rim.
  const kit = w.theme === 'kit';
  const inside = kit ? binAt(b.x, b.y, BLOCK_MM / 2 - 2) : null;
  let top = inside ? inside.floorZ : 0;
  for (const { tub } of KIT_TUBS) {
    if (kit && !inside && hitsWalls(b.x, b.y, BLOCK_MM / 2, tub)) top = Math.max(top, wallTopOver(tub, b.y, BLOCK_MM / 2));
  }
  for (const o of w.blocks) {
    if (o === b) continue;
    if (Math.abs(o.x - b.x) < BLOCK_MM - 2 && Math.abs(o.y - b.y) < BLOCK_MM - 2 && o.z < b.z) {
      top = Math.max(top, o.z + BLOCK_MM / 2);
    }
  }
  return top;
}

/**
 * The pen holder only holds the pen (with ±1 mm of spring at the tip); it has
 * no lift of its own. "펜 내리기" lowers the arm straight down until the tip
 * touches the paper, "펜 올리기" lifts it PEN_LIFT_MM.
 */
async function penSet(rt: Runtime, down: boolean): Promise<void> {
  const here = tcpPositionMm(rt.chain, rt.world.angles, tcp(rt));
  if (down && here.z <= 0.8) return;
  await moveTool(rt, { x: here.x, y: here.y, z: down ? 0 : Math.max(here.z, 0) + PEN_LIFT_MM });
}

/**
 * The cylinder is a fixed rod for pressing buttons and keys: a press is the arm
 * going straight down CYLINDER_PRESS_MM and back up.
 */
async function cylinderPush(rt: Runtime): Promise<void> {
  const w = rt.world;
  const here = tcpPositionMm(rt.chain, w.angles, tcp(rt));
  const overButton = Math.hypot(here.x - BUTTON.x, here.y - BUTTON.y) < BUTTON.radiusMm - 2;
  const bottom = here.z - CYLINDER_PRESS_MM;
  const floor = overButton ? BUTTON.heightMm - BUTTON.travelMm : 0;
  if (bottom < floor - 0.5) {
    throw new RunError(
      overButton ? '버튼을 끝까지 누르고도 더 내려가요.' : '실린더가 판을 세게 눌러요.',
      overButton ? '누르기 전에 robot.move_down("버튼")으로 버튼 바로 위에 가 주세요.' : '누르기 전에 조금 더 올라가 주세요.',
      true,
    );
  }
  let pressed = false;
  const was = w.buttonDepth;
  await moveTool(rt, { ...here, z: bottom });
  pressed = w.buttonDepth >= 0.5 && was < 0.5;
  await moveTool(rt, here);
  if (pressed) {
    w.buttonPresses += 1;
    rt.log?.('info', `버튼을 눌렀어요 (${w.buttonPresses}번째).`);
  } else {
    rt.log?.('warn', '실린더로 눌렀지만 버튼에 닿지 않았어요.');
  }
}

/* -------------------------------------------------------------------------- */
/* Mission                                                                    */
/* -------------------------------------------------------------------------- */

export interface MissionStatus {
  title: string;
  done: number;
  total: number;
}

/** Blocks sitting on a mat spot (arm-only theme). */
export function blocksOnSpots(w: WorldState): number {
  return w.blocks.filter((b) => b.z < BLOCK_MM && spotAt(b.x, b.y) !== null && w.held?.color !== b.color).length;
}

/** Blocks in their official bin (kit theme). */
export function blocksSorted(w: WorldState): number {
  return w.blocks.filter((b) => {
    const bin = binAt(b.x, b.y);
    return bin !== null && bin.name === COLOR_TO_BIN[b.color] && b.z < bin.rimZ;
  }).length;
}

/** The free-practice mission of the fitted tool. */
export function mission(w: WorldState): MissionStatus {
  const kind = EFFECTOR_BY_ID[w.effector].kind;
  if ((kind === 'grip' || kind === 'suction') && w.theme === 'arm') {
    return { title: '블록을 자리 1~4로 옮기기', done: blocksOnSpots(w), total: COLORS.length };
  }
  if (kind === 'grip' || kind === 'suction') {
    const done = w.blocks.filter((b) => {
      const bin = binAt(b.x, b.y);
      return bin !== null && bin.name === COLOR_TO_BIN[b.color] && b.z < bin.rimZ;
    }).length;
    return { title: '색깔별로 분류함에 넣기', done, total: COLORS.length };
  }
  if (kind === 'press') return { title: '실린더로 버튼 3번 누르기', done: Math.min(3, w.buttonPresses), total: 3 };
  if (kind === 'pen') {
    const length = w.trail.reduce(
      (sum, s) => sum + s.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - s[i][0], p[1] - s[i][1]), 0),
      0,
    );
    return { title: '펜으로 판 위에 그리기 (20cm)', done: Math.min(200, Math.round(length)), total: 200 };
  }
  if (kind === 'none') return { title: '도구 없이 팔 움직여 보기', done: 0, total: 0 };
  return { title: '폰 홀더로 촬영 위치 잡기', done: 0, total: 0 };
}

/* -------------------------------------------------------------------------- */
/* Direct moves (control panel, real-robot jog)                               */
/* -------------------------------------------------------------------------- */

/**
 * Would a straight joint-space move from the world's pose to `to` hit anything
 * the simulator checks (table, board, kit, blocks)? The reason, or null when
 * the move is clear. Runs on a copy: the world is not changed.
 */
export function moveProblem(chain: readonly ChainSegment[], world: WorldState, to: readonly number[], samples = 30): string | null {
  return moveCheck(chain, world, to, samples)?.message ?? null;
}

/** moveProblem's error itself (a SelfCollision when the arm would run into itself). */
export function moveCheck(chain: readonly ChainSegment[], world: WorldState, to: readonly number[], samples = 30): RunError | null {
  const from = world.angles.slice();
  const copy: WorldState = {
    ...world,
    angles: from.slice(),
    blocks: world.blocks.map((b) => ({ ...b })),
    objects: world.objects.map((o) => ({ ...o })),
    trail: [],
    stats: emptyStats(from),
  };
  const rt: Runtime = { chain, world: copy, poses: {}, animate: async () => {}, see: async () => null, speed: DEFAULT_SPEED, vars: new Map(), line: 0, selfSlack: startSlack(chain, world, from) };
  try {
    for (let k = 1; k <= samples; k += 1) {
      copy.angles = from.map((a, i) => a + ((to[i] - a) * k) / samples);
      afterPoseChange(rt);
    }
  } catch (err) {
    if (err instanceof RunError) return err;
    throw err;
  }
  return null;
}

/** Already into itself (a real arm left that way): how deep, so a move out of it is not refused. */
function startSlack(chain: readonly ChainSegment[], world: WorldState, from: readonly number[]): number {
  const hit = selfContact(chain, from, activeArm().family, tcpFor(world.effector, world.cameraFlange));
  return hit ? hit.depth + 0.5 : SELF_SLACK_MM;
}

/**
 * Before a program runs: the whole run played at once on a copy of the world (30 frames a second
 * of motion, no camera), stopping at the first pose where the arm would run into itself. That
 * error (with its line), or null — other problems are left to the run itself, which shows them
 * where they happen.
 */
export async function preflight(run: (hooks: RunHooks) => Promise<unknown>, hooks: Pick<RunHooks, 'chain' | 'world' | 'poses'>): Promise<SelfCollision | null> {
  const coarse = async (d: number, frame: (t: number) => void) => {
    const n = Math.max(1, Math.ceil(d * 30));
    for (let k = 1; k <= n; k += 1) frame((d * k) / n);
  };
  try {
    await run({ ...hooks, animate: coarse, see: async () => null });
  } catch (err) {
    if (err instanceof SelfCollision) return err;
  }
  return null;
}

/**
 * Real-time jog (direct control, one frame of a held key): the small pose
 * change is checked like a program move and, when clear, applied to the world
 * (a held block follows, the pen draws). Returns why it was refused; the world
 * is left as it was then.
 */
export function jogTo(chain: readonly ChainSegment[], world: WorldState, to: readonly number[]): string | null {
  const why = moveProblem(chain, world, to, 1);
  if (why) return why;
  const rt: Runtime = { chain, world, poses: {}, animate: async () => {}, see: async () => null, speed: DEFAULT_SPEED, vars: new Map(), line: 0, selfSlack: startSlack(chain, world, world.angles) };
  world.angles = to.slice();
  try {
    afterPoseChange(rt);
  } catch (err) {
    if (err instanceof RunError) return err.message;
    throw err;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Python programs (중급 · 고급): play the timed commands                     */
/* -------------------------------------------------------------------------- */

/** Run a list of frames with no waiting (tool actions inside a playback). */
/** Runs the frames of a motion at once (no waiting): for previews and the timed playback. */
export const instantAnimate = async (durationS: number, frame: (tS: number) => void): Promise<void> => {
  const n = Math.max(1, Math.ceil(durationS * 60));
  for (let k = 1; k <= n; k += 1) frame((durationS * k) / n);
};

/**
 * Play a Python run on the simulated world: the arm follows the same motion
 * model the program read its angles from, every frame goes through the same
 * collision checks as the block programs, and the pump and gripper act on the
 * blocks. Returns what the real robot has to do, with the same timing.
 */
export async function playTimeline(run: { events: readonly PyEvent[]; endT: number }, hooks: RunHooks): Promise<RobotAction[]> {
  const rt: Runtime = { ...hooks, speed: DEFAULT_SPEED, vars: new Map(), line: 0 };
  const tools: Runtime = { ...rt, animate: instantAnimate };
  const w = rt.world;
  const arm = new ArmModel(w.angles);
  const probe = new ArmModel(w.angles);
  for (const e of run.events) {
    if (e.kind === 'move') probe.move(e.t, e.to, e.speed);
    else if (e.kind === 'stop') probe.stop(e.t);
  }
  const end = Math.max(run.endT, probe.endTime());
  // Where each move would arrive, if nothing replaces it first (for the practice checks).
  const arrivals: { at: number; to: number[] }[] = [];
  {
    const a = new ArmModel(w.angles);
    run.events.forEach((e, i) => {
      if (e.kind !== 'move') return;
      const at = a.move(e.t, e.to, e.speed);
      const next = run.events.slice(i + 1).find((k) => k.kind === 'move' || k.kind === 'stop');
      if (!next || next.t >= at - 1e-6) arrivals.push({ at, to: e.to });
    });
  }
  const actions: RobotAction[] = [];
  const kind = EFFECTOR_BY_ID[w.effector].kind;
  let moveLine = 0;

  const apply = async (e: PyEvent) => {
    rt.line = tools.line = e.line;
    if (e.line) rt.onLine?.(e.line);
    switch (e.kind) {
      case 'move':
        arm.move(e.t, e.to, e.speed);
        w.goal = e.to.slice();
        moveLine = e.line;
        actions.push({ type: 'timed', t: e.t, cmd: 'angles', angles: e.to.slice(), speed: Math.min(SPEED_CAP, e.speed), line: e.line });
        return;
      case 'stop':
        arm.stop(e.t);
        w.goal = null;
        actions.push({ type: 'timed', t: e.t, cmd: 'stop', line: e.line });
        return;
      case 'pump':
        actions.push({ type: 'timed', t: e.t, cmd: 'pump', on: e.on, line: e.line });
        if (kind !== 'suction') {
          rt.log?.('warn', `${e.line}번째 줄: 흡착 펌프를 ${e.on ? '켰지만' : '껐지만'} ${fittedPhrase(w.effector)}.`);
          return;
        }
        w.angles = arm.at(e.t);
        return e.on ? pumpOn(tools) : release(tools, 'suction');
      case 'gripper':
        actions.push({ type: 'timed', t: e.t, cmd: 'gripper', open: e.open, gripperType: e.gripperType, line: e.line });
        if (kind !== 'grip') {
          rt.log?.('warn', `${e.line}번째 줄: 그리퍼 명령인데 ${fittedPhrase(w.effector)}.`);
          return;
        }
        w.angles = arm.at(e.t);
        return e.open ? release(tools, 'grip') : gripClose(tools);
      case 'servos':
        // A program must not let the arm drop: only "servos on" goes to the robot.
        if (e.on) actions.push({ type: 'timed', t: e.t, cmd: 'focus', line: e.line });
        else rt.log?.('warn', `${e.line}번째 줄: 프로그램에서 서보를 풀면 팔이 떨어져요. 실제 로봇에서는 이 명령을 건너뛰어요.`);
        return;
    }
  };

  let now = 0;
  for (let i = 0; i <= run.events.length; i += 1) {
    const at = i < run.events.length ? run.events[i].t : end;
    if (at > now) {
      const t0 = now;
      await rt.animate(at - t0, (dt) => {
        w.angles = arm.at(t0 + dt);
        try {
          afterPoseChange(rt);
        } catch (err) {
          if (err instanceof RunError && !err.line) err.line = moveLine;
          throw err;
        }
      });
      now = at;
    }
    if (i < run.events.length) await apply(run.events[i]);
  }
  w.angles = arm.at(end);
  w.goal = null;
  afterPoseChange(rt);
  for (const a of arrivals) {
    const p = tcpPositionMm(rt.chain, a.to, tcp(rt));
    w.stats.arrivals.push({ x: p.x, y: p.y, z: p.z });
  }
  return actions;
}
