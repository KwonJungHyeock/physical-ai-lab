/**
 * 산업단지 · 스마트팜 — 방울토마토 선별 (myCobot 280 RDK X5 + 어댑티브 그리퍼 + 위에서 보는 USB
 * 카메라, real size). A camera on a stand looks straight down at the sorting tray; the program finds
 * tomatoes by colour, turns their pixels into robot millimetres and packs them. Three problems, each a
 * run the screen plays back (FarmCell) and reads its numbers from:
 *
 *  ① 덜 익은 것도 딴다 — the hue range was copied from last season's orange-paprika program
 *    (−10° ~ 40°): it takes the turning tomatoes (24°, 31°) with the ripe ones. The fix is the
 *    threshold (7-2), between the ripe tomatoes' hues and the turning ones'.
 *  ② 카메라와 손끝이 안 맞는다 — the camera was raised 80 mm for the larger tray but the program
 *    keeps the old mm-per-pixel ratio. Every tomato lands short towards the image centre by
 *    r × (1 − old ÷ new): the centre is fine, the edge ones the fingers land on. The fix is the ratio
 *    measured again from the two markers 220 mm apart (7-1, the AI Kit's own method).
 *  ③ 물러서 터진다 — the program closes the fingers to (diameter seen by the camera − squeeze) at
 *    full speed: the servo overshoots and the soft ripe tomato bursts. Too little squeeze and it
 *    slips. The fix is the window between them with a safety margin (4-3 friction, 5-4 force limit).
 *
 * The camera picture is made here (a pinhole camera over the scene, the tomatoes shaded spheres with
 * a calyx and a highlight, a little noise) and the program's vision really runs on it: HSV, mask,
 * connected regions, centroid, pixel → mm. Nothing the panel shows is written down without being
 * computed. No React, no WebGL: tests/education/farm-check.mts runs these headless.
 */

import { poseContact, type Box } from '../../physics/collide';
import { forwardKinematicsFrames, type ChainSegment } from '../../robot/kinematics';
import { jointTrajectory } from '../../robot/motion';
import { solveToolPose } from '../../robot/tool';
import { tcpFor } from '../../simulator/effectors';
import { HOME_Q, type Mm } from './cell';

export type FarmProblem = 1 | 2 | 3;

/** The official adaptive gripper: flange to the point between the fingertips, mm; its fingers fully open, mm. */
export const TOOL_MM = tcpFor('adaptive', false);
export const GAP_OPEN = 43;

/** The sorting tray (black plastic): centre, size, and its surface height, mm. */
export const TRAY = { x: 200, y: 20, sx: 140, sy: 230, top: 20 } as const;
/** The camera on its stand: straight above the tray's centre, its height above the bench now and before (mm), focal length (px), picture size (px). */
export const CAM = { x: 200, y: 20, z: 480, zOld: 400, f: 554, w: 640, h: 480 } as const;
/** The two calibration markers on the tray (the AI Kit's method): their distance, size, mm. */
export const MARKER = { span: 220, size: 26 } as const;
export const MARKERS: readonly [number, number][] = [
  [TRAY.x, TRAY.y - MARKER.span / 2],
  [TRAY.x, TRAY.y + MARKER.span / 2],
];
/** mm per pixel on the tray's surface: what the program keeps (measured at the old height) and what it is now. */
export const RATIO_OLD = (CAM.zOld - TRAY.top) / CAM.f;
export const RATIO_NOW = (CAM.z - TRAY.top) / CAM.f;

/** The packing punnet (clear plastic, 2 × 4): its floor and slot centres, mm. */
export const PUNNET = { x: 85, y: -150, floor: 8, wall: 30, pitchX: 34, pitchY: 33 } as const;
export const punnetSlot = (k: number): [number, number] => [PUNNET.x + ((k % 2) - 0.5) * PUNNET.pitchX, PUNNET.y + (Math.floor(k / 2) - 1.5) * PUNNET.pitchY];

/** The program's vision: the smallest region it counts as a tomato, the saturation and brightness a tomato pixel needs. */
export const MIN_AREA = 150;
export const S_MIN = 0.45;
export const V_MIN = 0.2;

/** ③: the ripe tomato as measured on the farm's force gauge: stiffness N/mm, burst N; friction of the finger pads on its skin; the arm's lifting acceleration. */
export const TOMATO = { k: 1.2, burst: 6, mu: 0.4, liftAcc: 3 } as const;
/** ③: the safety rule — the peak force stays at or under this share of the burst force. */
export const SAFE_SHARE = 0.7;
/** ③: how far the gripper's servo closes past its target per unit of speed (1 – 100), mm; and its closing rate per unit, mm/s. */
export const OVERSHOOT_PER_SPEED = 0.03;
const CLOSE_RATE_PER_SPEED = 0.8;

export const GRAVITY = 9.81;

export interface Tomato {
  /** Centre on the tray, mm. */
  x: number;
  y: number;
  /** Diameter, mm. */
  d: number;
  /** Hue, degrees (red 0, −180 … 180 as in 7-2). */
  hue: number;
  ripe: boolean;
}

/** Ripe ≤ 12°, 착색기 (turning) ~ 20 – 35°, green ~ 80°. */
const T = (x: number, y: number, d: number, hue: number): Tomato => ({ x, y, d, hue, ripe: Math.abs(hue) <= 12 });

export const FARM_TOMATOES: Record<FarmProblem, readonly Tomato[]> = {
  1: [T(200, 18, 27, 2), T(156, -48, 26, -5), T(243, -46, 26, 24), T(246, 52, 28, 8), T(157, 54, 25, 82), T(203, 101, 27, 31), T(158, 104, 26, 4)],
  2: [T(198, 22, 27, 3), T(228, -16, 26, -4), T(168, 58, 27, 6), T(215, 80, 27, 1), T(150, -40, 26, -6), T(160, 108, 27, 5)],
  3: [T(200, 18, 27, 2), T(156, -48, 25, -3), T(246, 52, 29, 6), T(157, 54, 26, 4), T(243, -46, 28, -1)],
};

/* --- values ---------------------------------------------------------------------------- */

/** ①: the hue range a tomato pixel must fall in, degrees. */
export interface HueValues {
  lo: number;
  hi: number;
}
/** ②: the mm-per-pixel ratio the program turns pixels into millimetres with. */
export interface RatioValues {
  ratio: number;
}
/** ③: how much narrower than the seen diameter the fingers close (mm), and the gripper speed (1 – 100). */
export interface GripValues {
  squeeze: number;
  speed: number;
}
export type FarmValues = HueValues | RatioValues | GripValues;

export const FARM_DEFAULTS: Record<FarmProblem, FarmValues> = {
  1: { lo: -10, hi: 40 },
  2: { ratio: Math.round(RATIO_OLD * 1000) / 1000 },
  3: { squeeze: 3, speed: 100 },
};
export const FARM_FIXES: Record<FarmProblem, FarmValues> = {
  1: { lo: -10, hi: 15 },
  2: { ratio: 0.83 },
  3: { squeeze: 2, speed: 40 },
};
/** The program's range for ② and ③ (already right there). */
export const RIPE_RANGE: HueValues = { lo: -10, hi: 15 };

/* --- the camera picture ------------------------------------------------------------------- */

export interface Picture {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Robot mm (on a plane at height z) → pixel. The image's u grows with +y, v with +x (as the AI Kit's formula reads it). */
export function toPixel(x: number, y: number, z: number, camZ: number = CAM.z): { u: number; v: number } {
  const depth = camZ - z;
  return { u: CAM.w / 2 + (CAM.f * (y - CAM.y)) / depth, v: CAM.h / 2 + (CAM.f * (x - CAM.x)) / depth };
}
/** Pixel → robot mm, the AI Kit's way: x = (v − c_v) × ratio + camera x, y = (u − c_u) × ratio + camera y. */
export const toRobot = (u: number, v: number, ratio: number): [number, number] => [(v - CAM.h / 2) * ratio + CAM.x, (u - CAM.w / 2) * ratio + CAM.y];

/** A repeatable hash noise in [0, 1). */
const noise = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

function hsvToRgb(hDeg: number, s: number, v: number): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const mm = v - c;
  return [Math.round((r + mm) * 255), Math.round((g + mm) * 255), Math.round((b + mm) * 255)];
}

/** RGB (0–255) → hue (degrees, −180 … 180, red 0), saturation and value (0 – 1), the way 7-2 writes them. */
export function rgbToHsvDeg(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = (60 * (g - b)) / d;
    else if (max === g) h = 120 + (60 * (b - r)) / d;
    else h = 240 + (60 * (r - g)) / d;
  }
  if (h > 180) h -= 360;
  if (h <= -180) h += 360;
  return [h, max === 0 ? 0 : d / max, max / 255];
}

/**
 * What the camera sees from `camZ` (mm above the bench): the bench, the black tray, the two markers,
 * the tomatoes that are on the tray. Each tomato is a shaded sphere (light from the upper left), with
 * a green calyx on top and a shiny highlight; every pixel carries a little noise.
 */
export function cameraPicture(tomatoes: readonly Tomato[], camZ: number = CAM.z): Picture {
  const { w, h } = CAM;
  const data = new Uint8ClampedArray(w * h * 4);
  const tray0 = toPixel(TRAY.x - TRAY.sx / 2, TRAY.y - TRAY.sy / 2, TRAY.top, camZ);
  const tray1 = toPixel(TRAY.x + TRAY.sx / 2, TRAY.y + TRAY.sy / 2, TRAY.top, camZ);
  const marks = MARKERS.map(([x, y]) => ({ a: toPixel(x - MARKER.size / 2, y - MARKER.size / 2, TRAY.top, camZ), b: toPixel(x + MARKER.size / 2, y + MARKER.size / 2, TRAY.top, camZ) }));
  const balls = tomatoes.map((t) => {
    const c = toPixel(t.x, t.y, TRAY.top + t.d / 2, camZ);
    return { ...t, cu: c.u, cv: c.v, r: (CAM.f * (t.d / 2)) / (camZ - TRAY.top - t.d / 2) };
  });
  const L = [-0.35, -0.45, 0.82];
  const Ln = Math.hypot(...L);
  const H = [L[0] / Ln, L[1] / Ln, L[2] / Ln + 1];
  const Hn = Math.hypot(...H);
  for (let v = 0; v < h; v += 1) {
    for (let u = 0; u < w; u += 1) {
      const n1 = noise(u, v);
      let rgb: [number, number, number];
      // The bench (light grey laminate) and the tray (black plastic, a faint ribbing).
      if (u >= tray0.u && u <= tray1.u && v >= tray0.v && v <= tray1.v) {
        const rib = (Math.floor((v - tray0.v) / 9) % 2) * 6;
        const g = 34 + rib + n1 * 8;
        rgb = [g, g + 2, g + 4];
      } else {
        const g = 196 + n1 * 10;
        rgb = [g, g + 1, g - 4];
      }
      for (const m of marks) {
        if (u >= m.a.u && u <= m.b.u && v >= m.a.v && v <= m.b.v) {
          // An ArUco-like square: white border, black body, a white cell pattern.
          const fu = (u - m.a.u) / (m.b.u - m.a.u);
          const fv = (v - m.a.v) / (m.b.v - m.a.v);
          const border = fu < 0.1 || fu > 0.9 || fv < 0.1 || fv > 0.9;
          const cell = !border && fu > 0.25 && fu < 0.75 && fv > 0.25 && fv < 0.75 && (Math.floor(fu * 6) + Math.floor(fv * 6)) % 2 === 0;
          const g = border || cell ? 238 : 18;
          rgb = [g, g, g];
        }
      }
      for (const b of balls) {
        const du = u - b.cu;
        const dv = v - b.cv;
        const rho2 = (du * du + dv * dv) / (b.r * b.r);
        if (rho2 > 1) continue;
        const nx = du / b.r;
        const ny = dv / b.r;
        const nz = Math.sqrt(1 - rho2);
        const diff = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / Ln);
        const spec = Math.pow(Math.max(0, (nx * H[0] + ny * H[1] + nz * H[2]) / Hn), 60);
        // The calyx: a small five-pointed green star at the top.
        const ang = Math.atan2(dv, du);
        const star = Math.sqrt(rho2) < 0.2 + 0.1 * Math.cos(5 * ang);
        if (star) {
          rgb = hsvToRgb(105 + (n1 - 0.5) * 10, 0.6, 0.32 + 0.3 * diff);
          continue;
        }
        const hue = b.hue + (n1 - 0.5) * 6 + (noise(v, u) - 0.5) * 2;
        const val = Math.min(1, 0.32 + 0.62 * diff + (n1 - 0.5) * 0.04);
        const sat = 0.86 * (1 - 0.8 * spec);
        const c = hsvToRgb(hue, sat, Math.min(1, val + 0.35 * spec));
        rgb = c;
      }
      const i = (v * w + u) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/* --- the program's vision ------------------------------------------------------------------- */

/** Per-pixel hue / saturation / value of a picture (worked out once, then thresholded as often as wanted). */
export interface HsvPicture {
  h: Float32Array;
  s: Float32Array;
  v: Float32Array;
  width: number;
  height: number;
}
export function toHsv(p: Picture): HsvPicture {
  const n = p.width * p.height;
  const h = new Float32Array(n);
  const s = new Float32Array(n);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const [a, b, c] = rgbToHsvDeg(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
    h[i] = a;
    s[i] = b;
    v[i] = c;
  }
  return { h, s, v, width: p.width, height: p.height };
}

/** The mask: 1 where the hue is in [lo, hi] and the pixel is coloured and bright enough (7-2). */
export function hueMask(img: HsvPicture, r: HueValues): Uint8Array {
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0; i < m.length; i += 1) if (img.s[i] >= S_MIN && img.v[i] >= V_MIN && img.h[i] >= r.lo && img.h[i] <= r.hi) m[i] = 1;
  return m;
}

export interface Region {
  area: number;
  /** Centroid, px. */
  u: number;
  v: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Connected regions of the mask (4-neighbours), the ones of at least `minArea` pixels, largest first. */
export function regions(mask: Uint8Array, width: number, height: number, minArea = MIN_AREA): Region[] {
  const seen = new Uint8Array(mask.length);
  const out: Region[] = [];
  const stack: number[] = [];
  for (let s0 = 0; s0 < mask.length; s0 += 1) {
    if (!mask[s0] || seen[s0]) continue;
    let area = 0;
    let su = 0;
    let sv = 0;
    let u0 = width;
    let u1 = 0;
    let v0 = height;
    let v1 = 0;
    stack.push(s0);
    seen[s0] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const u = i % width;
      const v = (i - u) / width;
      area += 1;
      su += u;
      sv += v;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
      const nb = [u > 0 ? i - 1 : -1, u < width - 1 ? i + 1 : -1, v > 0 ? i - width : -1, v < height - 1 ? i + width : -1];
      for (const n of nb) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (area >= minArea) out.push({ area, u: su / area, v: sv / area, u0, u1, v0, v1 });
  }
  return out.sort((a, b) => b.area - a.area);
}

/** What the program finds: each region in robot mm (with the ratio it was given) and the diameter it reads off the region's width. */
export interface Found {
  region: Region;
  x: number;
  y: number;
  dSeen: number;
  /** The tomato it really is (index into the problem's tomatoes), or −1. */
  k: number;
}

export function findTomatoes(img: HsvPicture, range: HueValues, ratio: number, tomatoes: readonly Tomato[], camZ: number = CAM.z): Found[] {
  const regs = regions(hueMask(img, range), img.width, img.height);
  const found = regs.map((r) => {
    const [x, y] = toRobot(r.u, r.v, ratio);
    const dSeen = ((r.u1 - r.u0 + 1 + (r.v1 - r.v0 + 1)) / 2) * ratio;
    // Which tomato it is: the nearest in the picture.
    let k = -1;
    let best = Infinity;
    tomatoes.forEach((t, j) => {
      const p = toPixel(t.x, t.y, TRAY.top + t.d / 2, camZ);
      const dd = Math.hypot(p.u - r.u, p.v - r.v);
      if (dd < best) {
        best = dd;
        k = j;
      }
    });
    return { region: r, x, y, dSeen, k: best < 25 ? k : -1 };
  });
  // The program packs from the picture's centre outwards.
  return found.sort((a, b) => Math.hypot(a.region.u - CAM.w / 2, a.region.v - CAM.h / 2) - Math.hypot(b.region.u - CAM.w / 2, b.region.v - CAM.h / 2));
}

/** A tomato's hue as the camera reads it: the median over a ring of its pixels (the calyx in the middle and the rim left out, the highlight by the S limit). */
export function measuredHue(img: HsvPicture, t: Tomato, camZ: number = CAM.z): number {
  const c = toPixel(t.x, t.y, TRAY.top + t.d / 2, camZ);
  const r = (CAM.f * (t.d / 2)) / (camZ - TRAY.top - t.d / 2);
  const hs: number[] = [];
  for (let v = Math.floor(c.v - r); v <= Math.ceil(c.v + r); v += 1)
    for (let u = Math.floor(c.u - r); u <= Math.ceil(c.u + r); u += 1) {
      const rho2 = ((u - c.u) ** 2 + (v - c.v) ** 2) / (r * r);
      if (rho2 > 0.8 || rho2 < 0.16) continue;
      const i = v * img.width + u;
      if (img.s[i] >= S_MIN && img.v[i] >= V_MIN) hs.push(img.h[i]);
    }
  hs.sort((a, b) => a - b);
  return hs.length ? hs[Math.floor(hs.length / 2)] : NaN;
}

/** The marker centres in the picture, px (where the program measures the 220 mm from). */
export const markerPixels = (camZ: number = CAM.z) => MARKERS.map(([x, y]) => toPixel(x, y, TRAY.top, camZ));

/* --- the run ------------------------------------------------------------------------------ */

export type TomatoMode = 'tray' | 'held' | 'packed' | 'burst' | 'dropped';

export interface TomatoState {
  /** Centre, mm. */
  c: Mm;
  mode: TomatoMode;
}

export interface FarmFrame {
  t: number;
  q: number[];
  gap: number;
  tomatoes: TomatoState[];
  /** The grip force on the held tomato, N (0 when none). */
  force: number;
  alarm: boolean;
}

export type FarmEventKind = 'see' | 'grip' | 'place' | 'unripe' | 'missed' | 'press' | 'burst' | 'slip' | 'unreachable' | 'hit' | 'done';

export interface FarmEvent {
  t: number;
  kind: FarmEventKind;
  text: string;
  at?: Mm;
  value?: number;
  tomato?: number;
}

export interface FarmPick {
  k: number;
  /** ②: how far the fingers' centre was from the tomato's, mm. */
  offset: number;
  /** ③: the diameter the camera read, the force at its peak and while holding, N. */
  dSeen: number;
  peak: number;
  hold: number;
  packed: boolean;
}

export interface FarmRun {
  values: FarmValues;
  frames: FarmFrame[];
  events: FarmEvent[];
  durationS: number;
  /** What went wrong first (① a wrong pick or a ripe one left; ②③ what stopped the line). */
  failure: FarmEvent | null;
  tip: Mm[];
  found: Found[];
  picks: FarmPick[];
  /** ①: ripe tomatoes packed, unripe ones packed, ripe ones left on the tray. */
  ripePacked: number;
  unripePacked: number;
  ripeLeft: number;
}

const DT = 0.01;
const FRAME_DT = 0.02;
const SPEED = { travel: 55, down: 30 };
/** How high above a tomato's centre the gripper comes down from, mm. */
const ABOVE = 60;
const CARRY_Z = 110;

/** Grip point and tool axis for joint angles, mm. */
export function toolAt(chain: readonly ChainSegment[], q: readonly number[]): { tip: Mm; axis: Mm } {
  const f = forwardKinematicsFrames(chain, q);
  const e = f[f.length - 1].elements;
  const axis: Mm = [e[8], e[9], e[10]];
  return { tip: [e[12] * 1000 + axis[0] * TOOL_MM, e[13] * 1000 + axis[1] * TOOL_MM, e[14] * 1000 + axis[2] * TOOL_MM], axis };
}

/** The tool straight down at a point (null: out of reach). */
export function poseAt(chain: readonly ChainSegment[], p: Mm, seed: readonly number[] = HOME_Q): number[] | null {
  const r = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm: TOOL_MM, orientation: { yawDeg: 0, tiltDeg: 0 } });
  return r.converged ? r.anglesDeg : null;
}

const OBSTACLES: Box[] = [
  { min: [TRAY.x - TRAY.sx / 2, TRAY.y - TRAY.sy / 2, 0], max: [TRAY.x + TRAY.sx / 2, TRAY.y + TRAY.sy / 2, TRAY.top], name: '선별 트레이' },
  { min: [PUNNET.x - 40, PUNNET.y - 75, 0], max: [PUNNET.x + 40, PUNNET.y + 75, PUNNET.floor], name: '포장 용기' },
];

class FarmSim {
  t = 0;
  q: number[] = HOME_Q.slice();
  gap: number = GAP_OPEN;
  force = 0;
  tomatoes: TomatoState[];
  held = -1;
  frames: FarmFrame[] = [];
  events: FarmEvent[] = [];
  tip: Mm[] = [];
  failure: FarmEvent | null = null;
  /** ①: the line runs on after a wrong pick; ②③ stop. */
  stopped = false;
  private nextFrame = 0;

  constructor(
    readonly chain: readonly ChainSegment[],
    readonly list: readonly Tomato[],
  ) {
    this.tomatoes = list.map((t) => ({ c: [t.x, t.y, TRAY.top + t.d / 2], mode: 'tray' }));
    this.snap();
  }

  log(kind: FarmEventKind, text: string, extra: Partial<FarmEvent> = {}): FarmEvent {
    const e = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }
  /** A problem: the first one is the run's failure; `stop` ends the line there. */
  fail(kind: FarmEventKind, text: string, extra: Partial<FarmEvent> = {}, stop = true): false {
    const e = this.log(kind, text, extra);
    this.failure ??= e;
    if (stop) this.stopped = true;
    return false;
  }

  snap(): void {
    const { tip } = toolAt(this.chain, this.q);
    if (this.held >= 0) this.tomatoes[this.held].c = [tip[0], tip[1], tip[2]];
    if (this.t + 1e-9 >= this.nextFrame) {
      this.nextFrame += FRAME_DT;
      this.frames.push({ t: this.t, q: this.q.slice(), gap: this.gap, tomatoes: this.tomatoes.map((x) => ({ c: [...x.c] as Mm, mode: x.mode })), force: this.force, alarm: this.stopped });
      this.tip.push(tip);
    }
  }

  moveJ(to: readonly number[], speed: number): boolean {
    if (this.stopped) return false;
    const tr = jointTrajectory(this.q, to, speed);
    const steps = Math.max(1, Math.ceil(tr.durationS / DT));
    for (let k = 1; k <= steps; k += 1) {
      this.t += tr.durationS / steps;
      this.q = tr.sample((k / steps) * tr.durationS);
      const c = poseContact(this.chain, this.q, OBSTACLES, TOOL_MM);
      if (c) {
        this.snap();
        return this.fail('hit', `J${c.joint} 쪽이 ${c.what}에 닿았어요 — 작업 중지`, { at: c.at as Mm });
      }
      this.snap();
    }
    return true;
  }

  /** The fingers from one opening to another at a rate (mm/s), the force following a curve of the opening. */
  fingers(to: number, rate: number, force: (gap: number) => number = () => 0): void {
    const from = this.gap;
    const n = Math.max(1, Math.ceil(Math.abs(to - from) / rate / 0.02));
    for (let i = 1; i <= n; i += 1) {
      this.gap = from + (to - from) * (i / n);
      this.force = force(this.gap);
      this.t += Math.abs(to - from) / rate / n;
      this.snap();
    }
  }

  wait(s: number): void {
    const end = this.t + s;
    while (this.t < end - 1e-9) {
      this.t = Math.min(end, this.t + DT);
      this.snap();
    }
  }
}

const reachFail = (sim: FarmSim, what: string, p: Mm) => sim.fail('unreachable', `${what} (${p[0].toFixed(0)}, ${p[1].toFixed(0)})에 손이 닿지 않아요 — 작업 중지`, { at: p });

/**
 * One tomato: down over where the program thinks it is, close, lift, into the punnet. The gripper
 * part depends on the problem; returns the pick (null: the line stopped before it closed).
 */
function pickAndPack(sim: FarmSim, f: Found, slot: number, grip: (sim: FarmSim, f: Found, t: Tomato) => FarmPick | null): FarmPick | null {
  const t = sim.list[f.k];
  const zc = TRAY.top + (t?.d ?? 27) / 2;
  const above: Mm = [f.x, f.y, zc + ABOVE];
  const at: Mm = [f.x, f.y, zc];
  const a = poseAt(sim.chain, above, sim.q);
  const b = a && poseAt(sim.chain, at, a);
  if (!a || !b) return reachFail(sim, '토마토 위', above), null;
  if (!sim.moveJ(a, SPEED.travel) || !sim.moveJ(b, SPEED.down)) return null;
  if (!t) {
    sim.fail('press', '찾은 자리에 토마토가 없어요 — 작업 중지', { at });
    return null;
  }
  const pick = grip(sim, f, t);
  if (!pick || sim.stopped) return pick;
  sim.held = f.k;
  sim.tomatoes[f.k].mode = 'held';
  if (!sim.moveJ(a, SPEED.down)) return pick;
  // ③: a tomato held too loosely slips once the arm lifts it.
  if (pick.hold < needForce(t)) {
    sim.held = -1;
    sim.tomatoes[f.k].mode = 'dropped';
    sim.tomatoes[f.k].c = [f.x, f.y, zc];
    sim.force = 0;
    sim.snap();
    sim.fail('slip', `${f.k + 1}번 토마토가 미끄러져 떨어졌어요 (잡는 힘 ${pick.hold.toFixed(2)} N < 필요한 힘 ${needForce(t).toFixed(2)} N) — 작업 중지`, { at: above, tomato: f.k, value: pick.hold });
    return pick;
  }
  const [px, py] = punnetSlot(slot);
  const pz = PUNNET.floor + t.d / 2 + 1;
  const c = poseAt(sim.chain, [px, py, CARRY_Z], sim.q);
  const d = c && poseAt(sim.chain, [px, py, pz], c);
  if (!c || !d) return reachFail(sim, '포장 용기', [px, py, CARRY_Z]), pick;
  const lift = poseAt(sim.chain, [f.x, f.y, CARRY_Z], sim.q);
  if (lift && !sim.moveJ(lift, SPEED.down)) return pick;
  if (!sim.moveJ(c, SPEED.travel) || !sim.moveJ(d, SPEED.down)) return pick;
  sim.fingers(GAP_OPEN, 120);
  sim.force = 0;
  sim.held = -1;
  sim.tomatoes[f.k].mode = 'packed';
  sim.tomatoes[f.k].c = [px, py, pz];
  pick.packed = true;
  sim.log('place', `${f.k + 1}번 토마토를 포장 용기 ${slot + 1}번 칸에 담았어요`, { tomato: f.k, at: [px, py, pz] });
  sim.moveJ(c, SPEED.down);
  return pick;
}

/** ③: the force it takes to hold a tomato as the arm lifts it: m (g + a) ÷ (2 μ), N. Mass from its size (a sphere of water-like density). */
export function needForce(t: Tomato): number {
  const m = ((4 / 3) * Math.PI * (t.d / 2 / 1000) ** 3 * 1000) as number;
  return (m * (GRAVITY + TOMATO.liftAcc)) / (2 * TOMATO.mu);
}
/** ③: mass in grams. */
export const tomatoGrams = (t: Tomato) => (4 / 3) * Math.PI * (t.d / 20) ** 3;

/** The gripper of ① and ②: close to 12 mm narrower than the tomato at a gentle speed (fine for them). */
function gentleGrip(sim: FarmSim, f: Found, t: Tomato): FarmPick | null {
  const off = Math.hypot(f.x - t.x, f.y - t.y);
  if (off > (GAP_OPEN - t.d) / 2) {
    sim.fingers(GAP_OPEN - 6, 40);
    sim.fail('press', `${f.k + 1}번 토마토: 손가락이 토마토 위를 눌렀어요 (어긋남 ${off.toFixed(1)} mm) — 작업 중지`, { at: [t.x, t.y, TRAY.top + t.d], tomato: f.k, value: off });
    return { k: f.k, offset: off, dSeen: f.dSeen, peak: 0, hold: 0, packed: false };
  }
  const target = t.d - 1.5;
  sim.fingers(target, 32, (g) => Math.max(0, (t.d - g) * TOMATO.k));
  sim.log('grip', `${f.k + 1}번 토마토를 잡았어요${off > 0.5 ? ` (손가락 가운데에서 ${off.toFixed(1)} mm)` : ''}`, { tomato: f.k, value: off, at: [t.x, t.y, TRAY.top + t.d / 2] });
  return { k: f.k, offset: off, dSeen: f.dSeen, peak: 1.5 * TOMATO.k, hold: 1.5 * TOMATO.k, packed: false };
}

/* --- ① 덜 익은 것도 딴다 · ② 카메라와 손끝이 안 맞는다 ------------------------------------------------- */

function runSort(chain: readonly ChainSegment[], p: 1 | 2, values: FarmValues, range: HueValues, ratio: number): FarmRun {
  const list = FARM_TOMATOES[p];
  const img = toHsv(cameraPicture(list));
  const found = findTomatoes(img, range, ratio, list);
  const sim = new FarmSim(chain, list);
  sim.log('see', `사진에서 토마토 ${found.length}개를 찾았어요`);
  const picks: FarmPick[] = [];
  let slot = 0;
  for (const f of found) {
    if (sim.stopped) break;
    const pick = pickAndPack(sim, f, slot, gentleGrip);
    if (pick) picks.push(pick);
    if (pick?.packed) {
      slot += 1;
      const t = list[f.k];
      if (p === 1 && !t.ripe) sim.fail('unripe', `${f.k + 1}번 토마토는 덜 익었는데 땄어요 (색상 ${t.hue}°)`, { tomato: f.k, value: t.hue, at: [t.x, t.y, TRAY.top + t.d / 2] }, false);
    }
  }
  const ripePacked = picks.filter((x) => x.packed && list[x.k].ripe).length;
  const unripePacked = picks.filter((x) => x.packed && !list[x.k].ripe).length;
  const ripeLeft = list.filter((t) => t.ripe).length - ripePacked;
  if (!sim.stopped) {
    if (p === 1 && ripeLeft > 0) {
      const left = list.map((t, k) => ({ t, k })).filter(({ t, k }) => t.ripe && !picks.some((x) => x.k === k && x.packed));
      sim.fail('missed', `익은 토마토 ${ripeLeft}개를 찾지 못하고 남겼어요 (${left.map(({ k }) => `${k + 1}번`).join(' · ')})`, { tomato: left[0].k, at: [left[0].t.x, left[0].t.y, TRAY.top + left[0].t.d / 2] }, false);
    }
    sim.moveJ(HOME_Q, SPEED.travel);
  }
  if (!sim.stopped) sim.log('done', '작업을 마쳤어요');
  sim.wait(0.4);
  return { values, frames: sim.frames, events: sim.events, durationS: sim.t, failure: sim.failure, tip: sim.tip, found, picks, ripePacked, unripePacked, ripeLeft };
}

export const runHue = (chain: readonly ChainSegment[], v: HueValues) => runSort(chain, 1, v, v, RATIO_NOW);
export const runRatio = (chain: readonly ChainSegment[], v: RatioValues) => runSort(chain, 2, v, RIPE_RANGE, v.ratio);

/** ②: where each tomato's fingers would land for a ratio (no run): its distance from the picture's centre and the miss, mm. */
export function ratioPreview(ratio: number): { k: number; r: number; offset: number; limit: number }[] {
  const list = FARM_TOMATOES[2];
  const img = toHsv(cameraPicture(list));
  return findTomatoes(img, RIPE_RANGE, ratio, list)
    .filter((f) => f.k >= 0)
    .map((f) => {
      const t = list[f.k];
      return { k: f.k, r: Math.hypot(t.x - CAM.x, t.y - CAM.y), offset: Math.hypot(f.x - t.x, f.y - t.y), limit: (GAP_OPEN - t.d) / 2 };
    });
}

/* --- ③ 물러서 터진다 ------------------------------------------------------------------------------ */

/** ③: one tomato's grip for a squeeze and speed: the opening it closes to, the squeeze it really gets (static, peak), the forces. */
export function gripOf(t: Tomato, dSeen: number, v: GripValues) {
  const target = dSeen - v.squeeze;
  const over = OVERSHOOT_PER_SPEED * v.speed;
  const still = t.d - target;
  const peakMm = still + over;
  return { target, over, still, peakMm, hold: Math.max(0, still) * TOMATO.k, peak: Math.max(0, peakMm) * TOMATO.k, need: needForce(t) };
}

export function runGrip(chain: readonly ChainSegment[], v: GripValues): FarmRun {
  const list = FARM_TOMATOES[3];
  const img = toHsv(cameraPicture(list));
  const found = findTomatoes(img, RIPE_RANGE, RATIO_NOW, list);
  const sim = new FarmSim(chain, list);
  const picks: FarmPick[] = [];
  let slot = 0;
  for (const f of found) {
    if (sim.stopped) break;
    const pick = pickAndPack(sim, f, slot, (s, ff, t) => {
      const g = gripOf(t, ff.dSeen, v);
      const rate = CLOSE_RATE_PER_SPEED * v.speed;
      // Free closing until the fingers touch, then the servo runs past its target and settles back.
      const touch = Math.max(t.d, g.target);
      s.fingers(touch, rate);
      const pk: FarmPick = { k: ff.k, offset: 0, dSeen: ff.dSeen, peak: g.peak, hold: g.hold, packed: false };
      if (g.target < t.d) {
        s.fingers(t.d - Math.max(0, g.peakMm), rate, (gap) => (t.d - gap) * TOMATO.k);
        if (g.peak >= TOMATO.burst) {
          s.tomatoes[ff.k].mode = 'burst';
          s.force = 0;
          s.snap();
          s.fail('burst', `${ff.k + 1}번 토마토가 터졌어요 — 잡는 힘이 ${g.peak.toFixed(1)} N까지 올라갔어요 (터지는 힘 ${TOMATO.burst} N) — 작업 중지`, { tomato: ff.k, value: g.peak, at: [t.x, t.y, TRAY.top + t.d / 2] });
          return pk;
        }
        s.fingers(t.d - g.still, 40, (gap) => (t.d - gap) * TOMATO.k);
      }
      s.log('grip', `${ff.k + 1}번 토마토: 카메라 지름 ${ff.dSeen.toFixed(1)} mm → ${g.target.toFixed(1)} mm로 닫기 · 최대 ${g.peak.toFixed(1)} N, 잡는 동안 ${g.hold.toFixed(1)} N`, { tomato: ff.k, value: g.peak, at: [t.x, t.y, TRAY.top + t.d / 2] });
      return pk;
    });
    if (pick) picks.push(pick);
    if (pick?.packed) slot += 1;
  }
  if (!sim.stopped) {
    sim.moveJ(HOME_Q, SPEED.travel);
    sim.log('done', '작업을 마쳤어요');
  }
  sim.wait(0.4);
  const packed = picks.filter((x) => x.packed).length;
  return { values: v, frames: sim.frames, events: sim.events, durationS: sim.t, failure: sim.failure, tip: sim.tip, found, picks, ripePacked: packed, unripePacked: 0, ripeLeft: list.length - packed };
}

/** ③: each tomato's grip for values (no run). */
export function gripPreview(v: GripValues) {
  const list = FARM_TOMATOES[3];
  const img = toHsv(cameraPicture(list));
  return findTomatoes(img, RIPE_RANGE, RATIO_NOW, list)
    .filter((f) => f.k >= 0)
    .map((f) => ({ k: f.k, d: list[f.k].d, dSeen: f.dSeen, ...gripOf(list[f.k], f.dSeen, v) }));
}

export function runFarm(chain: readonly ChainSegment[], p: FarmProblem, v: FarmValues): FarmRun {
  return p === 1 ? runHue(chain, v as HueValues) : p === 2 ? runRatio(chain, v as RatioValues) : runGrip(chain, v as GripValues);
}

/* --- 판정 ------------------------------------------------------------------------------------ */

export interface FarmCheck {
  label: string;
  ok: boolean;
  value: string;
}
export interface FarmScore {
  pass: boolean;
  checks: FarmCheck[];
  headline: string;
  packed: number;
}

const strip = (s: string) => s.replace(/ — 작업 중지$/, '');

export function scoreFarm(p: FarmProblem, run: FarmRun): FarmScore {
  const list = FARM_TOMATOES[p];
  const packed = run.picks.filter((x) => x.packed).length;
  const stopEv = run.events.find((e) => ['press', 'burst', 'slip', 'unreachable', 'hit'].includes(e.kind));
  const stop: FarmCheck = { label: '작업 중지 없음', ok: !stopEv, value: stopEv ? strip(stopEv.text) : '없음' };
  const ripeN = list.filter((t) => t.ripe).length;
  if (p === 1) {
    const checks: FarmCheck[] = [
      { label: `익은 토마토 ${ripeN}개 모두 담음`, ok: run.ripePacked === ripeN, value: `${run.ripePacked} / ${ripeN}` },
      { label: '덜 익은 토마토는 담지 않음', ok: run.unripePacked === 0, value: `${run.unripePacked}개 담음` },
      stop,
    ];
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: pass ? `익은 토마토 ${ripeN}개만 골라 담았어요` : run.unripePacked ? `덜 익은 토마토 ${run.unripePacked}개도 담았어요` : stopEv ? strip(stopEv.text) : `익은 토마토 ${run.ripeLeft}개를 남겼어요`, packed };
  }
  if (p === 2) {
    const offs = run.picks.filter((x) => x.packed).map((x) => x.offset);
    const worst = offs.length ? Math.max(...offs) : NaN;
    const checks: FarmCheck[] = [
      { label: `${list.length}개 모두 담음`, ok: packed === list.length, value: `${packed} / ${list.length}` },
      { label: '손가락 가운데에서 5 mm 안에 잡음', ok: packed === list.length && worst <= 5, value: offs.length ? `최대 ${worst.toFixed(1)} mm` : '—' },
      stop,
    ];
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: stopEv ? strip(stopEv.text) : pass ? `${list.length}개 모두 가운데로 잡아 담았어요` : `다 담았지만 ${worst.toFixed(1)} mm 어긋나게 잡은 것이 있어요`, packed };
  }
  const peaks = run.picks.map((x) => x.peak);
  const worst = peaks.length ? Math.max(...peaks) : 0;
  const safe = TOMATO.burst * SAFE_SHARE;
  const checks: FarmCheck[] = [
    { label: `${list.length}개 모두 담음 (터짐 · 떨어뜨림 없이)`, ok: packed === list.length, value: `${packed} / ${list.length}` },
    { label: `최대 잡는 힘 ${safe.toFixed(1)} N 이하 (터지는 힘의 ${Math.round(SAFE_SHARE * 100)}%)`, ok: packed === list.length && worst <= safe, value: `최대 ${worst.toFixed(1)} N` },
    stop,
  ];
  const pass = checks.every((c) => c.ok);
  return { pass, checks, headline: stopEv ? strip(stopEv.text) : pass ? `${list.length}개 모두 터뜨리지 않고 담았어요` : `다 담았지만 ${worst.toFixed(1)} N까지 세게 잡았어요 (여유 부족)`, packed };
}
