/**
 * myAGV simulator: the classroom, mecanum driving with motors that are not
 * quite equal, collisions, the 2D lidar, and the straight-line calibration.
 *
 * Floor coordinates as the robot sees them (and as ROS does): X ahead from
 * the start, Y to the left, metres; heading `th` counter-clockwise, radians.
 * No three.js here, so it runs in the tests as it runs on the page.
 */

export type AgvModelId = 'pi' | 'jn' | 'plus';

export interface AgvModel {
  id: AgvModelId;
  name: string;
  /** Top bar label. */
  short: string;
  file: string;
  /** One line under the name: ROS, camera, lidar, top speed. */
  line: string;
  /** Front camera: x ahead of the centre, height (m); horizontal field of view (°); what it is. */
  cam: [number, number];
  hfov: number;
  camSpec: string;
  /** Lidar: x ahead of the centre, height (m). */
  lidar: [number, number];
  /** Footprint, length × width (m). */
  size: [number, number];
  plus: boolean;
}

export const AGV_MODELS: Record<AgvModelId, AgvModel> = {
  pi: {
    id: 'pi',
    name: 'myAGV 2023 · Raspberry Pi',
    short: 'myAGV 2023 · Pi',
    file: '/robot/myagv/myagv2023.glb',
    line: 'ROS 1 · 카메라 5MP 65° · 라이다 X2L · 0.9m/s',
    cam: [0.13, 0.131],
    hfov: 65,
    camSpec: '5MP · 65°',
    lidar: [0.065, 0.08],
    size: [0.313, 0.229],
    plus: false,
  },
  jn: {
    id: 'jn',
    name: 'myAGV 2023 · Jetson Nano',
    short: 'myAGV 2023 · JN',
    file: '/robot/myagv/myagv2023.glb',
    line: 'ROS 1 + ROS 2 · 카메라 8MP 77° · 라이다 X2L · 0.9m/s',
    cam: [0.13, 0.131],
    hfov: 77,
    camSpec: '8MP · 77°',
    lidar: [0.065, 0.08],
    size: [0.313, 0.229],
    plus: false,
  },
  plus: {
    id: 'plus',
    name: 'myAGV Plus',
    short: 'myAGV Plus',
    file: '/robot/myagv/myagvplus.glb',
    line: 'ROS 2 · 카메라 8MP 77° · 라이다 360° · 1.6m/s',
    cam: [0.16, 0.069],
    hfov: 77,
    camSpec: '8MP · 77°',
    lidar: [0.075, 0.091],
    size: [0.333, 0.239],
    plus: true,
  },
};

// ---------------------------------------------------------------- the classroom

export const ROOM = { x0: -1.9, x1: 3.5, y0: -2.3, y1: 2.3 };
/** The printed course mat: centre and size (m). */
export const MAT = { cx: 0.9, cy: 0, w: 2.4, h: 1.6 };
/** The course line on the mat, mat-local (m from the mat's start box). */
export const COURSE: [number, number][] = [
  [0.0, 0],
  [1.0, 0],
  [1.25, 0.25],
  [1.25, 0.55],
  [1.7, 0.55],
  [1.85, 0.3],
  [1.85, -0.5],
  [0.5, -0.5],
  [0.2, -0.3],
];
/** The calibration tape: 1 m (and a bit) of yellow tape with 10 cm ticks, starting at x0. */
export const LANE = { x0: -0.55, y: -1.45 };

/** Walls as segments [x0, y0, x1, y1] (the far wall with the windows and the left wall with the board). */
export const WALLS: [number, number, number, number][] = [
  [ROOM.x1, ROOM.y0, ROOM.x1, ROOM.y1],
  [ROOM.x0, ROOM.y1, ROOM.x1, ROOM.y1],
];

/** An axis-aligned footprint something stands on (centre, size along X and Y). */
export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface Box extends Footprint {
  h: number;
}

/** Cardboard boxes on the course. */
export const BOXES: Box[] = [
  { x: 0.95, y: 0.42, w: 0.22, d: 0.22, h: 0.16 },
  { x: 1.45, y: -0.18, w: 0.18, d: 0.28, h: 0.12 },
];

/** A card or marker on a little stand, facing along its yaw (0 = facing the start, −X). */
export interface Target {
  name: string;
  kind: 'card' | 'marker';
  x: number;
  y: number;
  yawDeg: number;
  /** Card colour, or marker id. */
  color?: string;
  id?: number;
  w: number;
  h: number;
}

export const TARGETS: Target[] = [
  { name: '빨강 카드', kind: 'card', x: 1.42, y: 0.12, yawDeg: 0, color: '#e5484d', w: 0.1, h: 0.14 },
  { name: '파랑 카드', kind: 'card', x: 2.0, y: 0.55, yawDeg: 30, color: '#2f6fe4', w: 0.1, h: 0.14 },
  { name: '초록 카드', kind: 'card', x: 0.55, y: -0.72, yawDeg: 110, color: '#27a35a', w: 0.1, h: 0.14 },
  { name: '노랑 카드', kind: 'card', x: 0.2, y: 0.7, yawDeg: -110, color: '#f2c200', w: 0.1, h: 0.14 },
  { name: '마커 1', kind: 'marker', x: 2.08, y: -0.05, yawDeg: 0, id: 1, w: 0.12, h: 0.12 },
  { name: '마커 2', kind: 'marker', x: 1.35, y: 0.78, yawDeg: -80, id: 2, w: 0.12, h: 0.12 },
  { name: '마커 3', kind: 'marker', x: 1.1, y: -0.78, yawDeg: 95, id: 3, w: 0.12, h: 0.12 },
];
/** A stand's footprint on the floor. */
export const STAND = { w: 0.08, d: 0.13, board: 0.06 };

export const COLLIDERS: Footprint[] = [...BOXES, ...TARGETS.map((t) => ({ x: t.x, y: t.y, w: STAND.w, d: STAND.d }))];

// ---------------------------------------------------------------- driving

/** Mecanum wheel radius (m) and half wheelbase + half track (m): myagv_plus_description. */
export const WHEEL_R = 0.04;
export const WHEEL_K = 0.221;
/** Classroom limits (the server caps the real robot at the same). */
export const MAX_V = 0.5;
export const MAX_W = 1.5;

export interface Pose {
  x: number;
  y: number;
  th: number;
}

export interface Twist {
  vx: number;
  vy: number;
  wz: number;
}

export interface Wheels {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

/** Wheel speeds (rad/s) for a body speed (m/s, m/s, rad/s). */
export function wheelsFor({ vx, vy, wz }: Twist): Wheels {
  return {
    fl: (vx - vy - WHEEL_K * wz) / WHEEL_R,
    fr: (vx + vy + WHEEL_K * wz) / WHEEL_R,
    rl: (vx + vy - WHEEL_K * wz) / WHEEL_R,
    rr: (vx - vy + WHEEL_K * wz) / WHEEL_R,
  };
}

/** Body speed from wheel speeds (the inverse of wheelsFor). */
export function bodyFor(w: Wheels): Twist {
  return {
    vx: (WHEEL_R * (w.fl + w.fr + w.rl + w.rr)) / 4,
    vy: (WHEEL_R * (-w.fl + w.fr + w.rl - w.rr)) / 4,
    wz: (WHEEL_R * (-w.fl + w.fr - w.rl + w.rr)) / (4 * WHEEL_K),
  };
}

/** What stops the robot at this pose: the room's edge, a wall, a box or a stand; null when free. */
export function blockedAt(model: AgvModel, x: number, y: number, th: number): 'wall' | 'object' | null {
  const [L, W] = model.size;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const corners: [number, number][] = [
    [L / 2, W / 2],
    [L / 2, -W / 2],
    [-L / 2, W / 2],
    [-L / 2, -W / 2],
    [L / 2, 0],
    [0, W / 2],
    [0, -W / 2],
    [-L / 2, 0],
  ];
  const pts = corners.map(([a, b]) => [x + a * c - b * s, y + a * s + b * c]);
  const m = 0.05;
  if (pts.some(([u, v]) => u < ROOM.x0 + m || u > ROOM.x1 - m || v < ROOM.y0 + m || v > ROOM.y1 - m)) return 'wall';
  const inside = (o: Footprint, u: number, v: number) => Math.abs(u - o.x) < o.w / 2 && Math.abs(v - o.y) < o.d / 2;
  if (COLLIDERS.some((o) => pts.some(([u, v]) => inside(o, u, v)) || (Math.abs(o.x - x) < L / 2 && Math.abs(o.y - y) < W / 2))) return 'object';
  return null;
}

/** How much each motor really gives of what it is asked (the simulated robot's rear-right is 12 % weak). */
export const SIM_GAINS: Wheels = { fl: 1, fr: 1, rl: 1, rr: 0.88 };

/** Saved straight-line correction: turn (rad) and sideways (m) added for every metre ahead. */
export interface Trim {
  w: number;
  y: number;
}

/** A run the simulator drives by itself (the 1 m straight-line test). */
interface Script {
  speed: Twist;
  left: number;
}

export interface StepResult {
  blocked: 'wall' | 'object' | null;
  /** The script finished in this step. */
  scriptDone: boolean;
}

export class AgvSim {
  pose: Pose = { x: 0, y: 0, th: 0 };
  /** Body speed now (after acceleration limits), and wheel speeds and angles. */
  vel: Twist = { vx: 0, vy: 0, wz: 0 };
  wheels: Wheels = { fl: 0, fr: 0, rl: 0, rr: 0 };
  wheelAngle: Wheels = { fl: 0, fr: 0, rl: 0, rr: 0 };
  /** Speed asked for by the driver (joystick, keys, pad). */
  cmd: Twist = { vx: 0, vy: 0, wz: 0 };
  trim: Trim = { w: 0, y: 0 };
  gains: Wheels = { ...SIM_GAINS };
  /** Heading hold with the gyro while going straight. */
  hold = false;
  private holdYaw: number | null = null;
  private script: Script | null = null;
  /** Where the robot has been (every centimetre). */
  trail: { x: number; y: number }[] = [];
  /** Changes whenever the trail does (for redrawing). */
  trailVersion = 0;

  constructor(public model: AgvModel) {}

  reset(pose: Pose) {
    this.pose = { ...pose };
    this.vel = { vx: 0, vy: 0, wz: 0 };
    this.cmd = { vx: 0, vy: 0, wz: 0 };
    this.script = null;
    this.holdYaw = null;
    this.trail = [{ x: pose.x, y: pose.y }];
    this.trailVersion += 1;
  }

  get scripted() {
    return this.script !== null;
  }

  /** Drive `speed` for `seconds` by itself (driver input is ignored meanwhile). */
  runScript(speed: Twist, seconds: number) {
    this.script = { speed, left: seconds };
  }

  cancelScript() {
    this.script = null;
  }

  /** Advance `dt` seconds. `collide` false: nothing stops the robot (mirroring a real robot in another room). */
  step(dt: number, collide = true): StepResult {
    let scriptDone = false;
    let { vx: tx, vy: ty, wz: tw } = this.cmd;
    if (this.script) {
      ({ vx: tx, vy: ty, wz: tw } = this.script.speed);
      this.script.left -= dt;
      if (this.script.left <= 0) {
        this.script = null;
        scriptDone = true;
        tx = ty = tw = 0;
      }
    }
    // Saved correction, as the robot's server applies it: a little turn and sideways per metre ahead.
    ty += this.trim.y * tx;
    tw += this.trim.w * tx;
    // Heading hold: going straight without asking to turn, steer back to the heading at the start.
    const turning = Math.abs(this.cmd.wz) > 1e-3 || (this.script !== null && Math.abs(this.script.speed.wz) > 1e-3);
    if (this.hold && !turning && Math.hypot(tx, ty) > 0.01) {
      if (this.holdYaw === null) this.holdYaw = this.pose.th;
      tw += 2.5 * (this.holdYaw - this.pose.th);
    } else this.holdYaw = null;
    const clampTo = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
    const a = 1.2 * dt;
    const aw = 3 * dt;
    this.vel.vx += clampTo(tx - this.vel.vx, a);
    this.vel.vy += clampTo(ty - this.vel.vy, a);
    this.vel.wz += clampTo(tw - this.vel.wz, aw);
    // The wheel speeds asked for, then what the (unequal) motors really give.
    const want = wheelsFor(this.vel);
    const got: Wheels = { fl: want.fl * this.gains.fl, fr: want.fr * this.gains.fr, rl: want.rl * this.gains.rl, rr: want.rr * this.gains.rr };
    const b = bodyFor(got);
    const c = Math.cos(this.pose.th);
    const s = Math.sin(this.pose.th);
    const nx = this.pose.x + (b.vx * c - b.vy * s) * dt;
    const ny = this.pose.y + (b.vx * s + b.vy * c) * dt;
    const nth = this.pose.th + b.wz * dt;
    const blocked = collide ? blockedAt(this.model, nx, ny, nth) : null;
    if (blocked) {
      this.vel = { vx: 0, vy: 0, wz: 0 };
      this.cmd = { vx: 0, vy: 0, wz: 0 };
      this.script = null;
      this.wheels = { fl: 0, fr: 0, rl: 0, rr: 0 };
      return { blocked, scriptDone: false };
    }
    this.pose = { x: nx, y: ny, th: nth };
    this.wheels = got;
    for (const k of ['fl', 'fr', 'rl', 'rr'] as const) this.wheelAngle[k] += got[k] * dt;
    const last = this.trail.at(-1);
    if (!last || Math.hypot(last.x - nx, last.y - ny) > 0.01) {
      this.trail.push({ x: nx, y: ny });
      if (this.trail.length > 4000) this.trail.shift();
      this.trailVersion += 1;
    }
    return { blocked: null, scriptDone };
  }
}

// ---------------------------------------------------------------- driver input

export interface DriveInput {
  /** Joystick: x right, y down, each −1..1 (screen directions). */
  joy: [number, number];
  /** Turn track: −1 (left) .. 1 (right). */
  turn: number;
  /** Keys held: w a s d q e. */
  keys: ReadonlySet<string>;
  /** Game pad: ahead, left, turn left, each −1..1. */
  pad: [number, number, number];
}

/** One speed from every input at once; `speed` is the top speed (m/s). Turning goes up to MAX_W. */
export function driveCommand(input: DriveInput, speed: number): Twist {
  const k = input.keys;
  const kx = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
  const ky = (k.has('a') ? 1 : 0) - (k.has('d') ? 1 : 0);
  const kw = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
  let x = -input.joy[1] + kx + input.pad[0];
  let y = -input.joy[0] + ky + input.pad[1];
  const n = Math.hypot(x, y);
  if (n > 1) {
    x /= n;
    y /= n;
  }
  const w = Math.max(-1, Math.min(1, -input.turn + kw + input.pad[2]));
  const v = Math.min(MAX_V, Math.max(0, speed));
  return { vx: x * v, vy: y * v, wz: Math.max(-MAX_W, Math.min(MAX_W, w * v * 3.2)) };
}

// ---------------------------------------------------------------- lidar

function rayBox(ox: number, oy: number, dx: number, dy: number, b: Footprint): number | null {
  let t0 = 0;
  let t1 = 8;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.x - b.w / 2, b.x + b.w / 2],
    [oy, dy, b.y - b.d / 2, b.y + b.d / 2],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let a = (lo - o) / d;
    let c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

function raySegment(ox: number, oy: number, dx: number, dy: number, [x0, y0, x1, y1]: [number, number, number, number]): number | null {
  const ex = x1 - x0;
  const ey = y1 - y0;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x0 - ox) * ey - (y0 - oy) * ex) / den;
  const u = ((x0 - ox) * dy - (y0 - oy) * dx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

export interface LidarScan {
  /** Hit points on the floor plane (m). */
  points: [number, number][];
  /** Nearest hit all round, and ahead (±15°); null when nothing within range. */
  near: number | null;
  front: number | null;
}

/** LIDAR_MIN..LIDAR_MAX: the YDLIDAR X2L's range (m). */
export const LIDAR_MIN = 0.12;
export const LIDAR_MAX = 8;

/** One turn of the lidar: a ray per degree against the boxes, stands and walls. `noise` in m. */
export function scanLidar(model: AgvModel, pose: Pose, noise = 0.005, random: () => number = Math.random): LidarScan {
  const ox = pose.x + Math.cos(pose.th) * model.lidar[0];
  const oy = pose.y + Math.sin(pose.th) * model.lidar[0];
  const points: [number, number][] = [];
  let near = Infinity;
  let front = Infinity;
  for (let i = 0; i < 360; i += 1) {
    const a = pose.th + (i * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = LIDAR_MAX;
    for (const c of COLLIDERS) {
      const t = rayBox(ox, oy, dx, dy, c);
      if (t !== null && t > LIDAR_MIN && t < best) best = t;
    }
    for (const w of WALLS) {
      const t = raySegment(ox, oy, dx, dy, w);
      if (t !== null && t < best) best = t;
    }
    if (best < LIDAR_MAX) {
      const n = best + (random() - 0.5) * 2 * noise;
      points.push([ox + dx * n, oy + dy * n]);
      near = Math.min(near, best);
      if (i < 15 || i > 345) front = Math.min(front, best);
    }
  }
  return { points, near: Number.isFinite(near) ? near : null, front: Number.isFinite(front) ? front : null };
}

// ---------------------------------------------------------------- straight-line calibration

/** The 1 m straight-line test: 0.2 m/s ahead for 5 s. */
export const STRAIGHT_TEST = { speed: 0.2, seconds: 5.05 };

export interface StraightResult {
  /** Distance gone (m), heading change (rad, + = to the left), sideways from the tape (m, + = left). */
  d: number;
  dth: number;
  side: number;
}

export function straightResult(start: Pose, end: Pose): StraightResult {
  const c = Math.cos(start.th);
  const s = Math.sin(start.th);
  const ex = end.x - start.x;
  const ey = end.y - start.y;
  return { d: Math.hypot(ex, ey), dth: end.th - start.th, side: -ex * s + ey * c };
}

/** Straight enough: under 0.8° and 1 cm over the metre. */
export const straightOk = (r: StraightResult) => Math.abs(r.dth) < (0.8 * Math.PI) / 180 && Math.abs(r.side) < 0.01;

/**
 * The trim that cancels a measured run (added to the one in use during it). A steady turn of
 * dth over d also moves the robot sideways by about d·dth/2; the rest is a sideways slip.
 */
export function trimFromRun(trim: Trim, r: StraightResult): Trim {
  if (r.d < 0.2) return trim;
  return { w: trim.w - r.dth / r.d, y: trim.y - (r.side - (r.d * r.dth) / 2) / r.d };
}

/**
 * On the real robot only the tape tells: how far to the side (m, + = left) the robot ended up after
 * `d` metres. Taken as a steady turn (the usual cause): side ≈ d²·w/2.
 */
export function trimFromSide(trim: Trim, side: number, d = 1): Trim {
  return { w: trim.w - (2 * side) / (d * d), y: trim.y };
}
