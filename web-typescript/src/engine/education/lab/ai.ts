/**
 * 산업단지 · AI 연구소 — 종합 미션 (myCobot 280 RDK X5 + 공식 AI 키트: 위에서 보는 카메라, 흡착 펌프,
 * 분류함 4개, 보정판과 마커 두 개). Everything is the kit as shipped (simulator/board.ts: its layout,
 * camera, bins and the official colour program's HSV ranges and pixel → mm formula). Three problems:
 *
 *  ① 색이 섞여 있다 — the new block set's green is a yellowish green (H 50). The official ranges
 *    overlap (yellow 11–59, green 35–90) and are tried in order, yellow first: the green block is
 *    taken for yellow and goes to the yellow bin. The fix: ranges that do not overlap (7-2).
 *  ② 시연을 보고 따라 하기 — the red-block job was taught by one demonstration (the arm's joint
 *    angles recorded at the block). Replayed, it goes back to where the block was then. The fix: a
 *    policy from several demonstrations, mixing their joint angles by 1 ÷ distanceᵖ (8-1).
 *  ③ 처음 보는 물건 — 60 mm tall parts instead of 25 mm cubes. The program still takes them for
 *    cubes: it comes down to 25 mm (into the part) and, once that is fixed, it misses the top
 *    because the camera sees a top 60 mm nearer as farther out (parallax). The fix: the part's
 *    height in the pipeline — for the pick height and for the pixel → mm conversion (6-3, 7-1, 8-2).
 *
 * The camera picture is made here (pinhole over the board: plate, board, markers, the objects' tops
 * — their sides fall in shadow, below the official ranges' brightness) and the program's vision
 * really runs on it. No React, no WebGL: tests/education/ai-check.mts runs these headless.
 */

import { forwardKinematicsFrames, type ChainSegment } from '../../robot/kinematics';
import { jointTrajectory } from '../../robot/motion';
import { solveToolPose } from '../../robot/tool';
import { BINS, BLOCK_MM, CAL_BOARD, HOME_DEG, MARKERS, MARKER_MM, MARKER_SPAN_MM, TOP_CAMERA, type BinName, type ColorName } from '../../simulator/board';
import { TCP_MM, PRESS_MM, type Mm } from './cell';

export type AiProblem = 1 | 2 | 3;

/** The suction cup seals when its centre is this close to the centre of a flat top, mm (a Ø20 cup). */
export const SEAL_MM = 6;

/** The kit camera: height above the plate, focal length (px), picture size (px). */
export const CAMERA = { x: TOP_CAMERA.x, y: TOP_CAMERA.y, z: TOP_CAMERA.z, f: TOP_CAMERA.width / 2 / Math.tan((TOP_CAMERA.hfovDeg * Math.PI) / 360), w: TOP_CAMERA.width, h: TOP_CAMERA.height } as const;

export interface Thing {
  color: ColorName;
  /** Hue in OpenCV units (0 – 180), saturation, value (0 – 1) of its top. */
  hue: number;
  sat: number;
  val: number;
  x: number;
  y: number;
  /** Top height, mm; 'cube' 25 mm blocks or 'post' Ø30 parts. */
  h: number;
  shape: 'cube' | 'post';
  /** What it really is (where it belongs). */
  bin: BinName;
}

const cube = (color: ColorName, hue: number, x: number, y: number, bin: BinName, sat = 0.78, val = 0.82): Thing => ({ color, hue, sat, val, x, y, h: BLOCK_MM, shape: 'cube', bin });
const post = (color: ColorName, hue: number, x: number, y: number, bin: BinName): Thing => ({ color, hue, sat: 0.78, val: 0.8, x, y, h: POST.h, shape: 'post', bin });

/** ③: the new parts: Ø30 × 60 mm posts. */
export const POST = { d: 30, h: 60 } as const;

/** The official colour → bin mapping (aikit_color.py): red D, green C, blue A, yellow B. */
export const BIN_OF: Record<ColorName, BinName> = { 빨강: 'D', 초록: 'C', 파랑: 'A', 노랑: 'B' };

/** ①: the new set — its green is yellowish (H 50). ③: the posts. Positions on the board, mm. */
export const AI_THINGS: Record<1 | 3, readonly Thing[]> = {
  1: [cube('빨강', 4, 135, -25, 'D'), cube('노랑', 25, 135, 25, 'B'), cube('초록', 50, 185, -25, 'C', 0.7, 0.72), cube('파랑', 112, 185, 25, 'A')],
  3: [post('빨강', 4, 118, -48, 'D'), post('노랑', 25, 128, 50, 'B'), post('초록', 70, 212, -42, 'C'), post('파랑', 112, 208, 48, 'A')],
};

/** An HSV range in OpenCV units, tried in order; the first a pixel falls in names its colour. */
export interface Range {
  name: string;
  color: ColorName;
  lo: [number, number, number];
  hi: [number, number, number];
}

/** The official ranges and order (aikit_color.py `self.HSV`): yellow, red, green, blue, cyan. */
export function officialRanges(yellowHi = 59, greenLo = 35): Range[] {
  return [
    { name: 'yellow', color: '노랑', lo: [11, 85, 70], hi: [yellowHi, 255, 245] },
    { name: 'red', color: '빨강', lo: [0, 43, 46], hi: [8, 255, 255] },
    { name: 'green', color: '초록', lo: [greenLo, 43, 35], hi: [90, 255, 255] },
    { name: 'blue', color: '파랑', lo: [100, 43, 46], hi: [124, 255, 255] },
    { name: 'cyan', color: '파랑', lo: [78, 43, 46], hi: [99, 255, 255] },
  ];
}

/* --- values ------------------------------------------------------------------------------ */

/** ①: the yellow range's top and the green range's bottom (OpenCV H). */
export interface HsvValues {
  yellowHi: number;
  greenLo: number;
}
/**
 * ②: how the job uses its demonstrations — replay the recorded angles ('replay'), mix all the
 * demonstrations' angles by 1 ÷ distanceᵖ ('blend'), or keep the demonstration relative to the
 * block and place it where the camera sees the block ('relative').
 */
export type DemoMode = 'replay' | 'blend' | 'relative';
export interface DemoValues {
  mode: DemoMode;
  power: number;
}
/** ③: the object height the program uses (mm), and whether it corrects the camera's parallax with it. */
export interface PartValues {
  height: number;
  parallax: boolean;
  /** The situation, not the student's: how tall the new parts really are (default POST.h; 대단원 마무리 평가), mm. */
  partH?: number;
}

/** ③'s parts as they stand (their height from the situation). */
export const partThings = (v: PartValues): readonly Thing[] => (v.partH === undefined ? AI_THINGS[3] : AI_THINGS[3].map((t) => ({ ...t, h: v.partH! })));
export type AiValues = HsvValues | DemoValues | PartValues;

export const AI_DEFAULTS: Record<AiProblem, AiValues> = {
  1: { yellowHi: 59, greenLo: 35 },
  2: { mode: 'replay', power: 2 },
  3: { height: BLOCK_MM, parallax: false },
};
export const AI_FIXES: Record<AiProblem, AiValues> = {
  1: { yellowHi: 34, greenLo: 35 },
  2: { mode: 'relative', power: 2 },
  3: { height: POST.h, parallax: true },
};

/** ②: where the demonstrations were recorded (red block on the board), mm — the first is the job's own. */
export const DEMOS: readonly [number, number][] = [
  [135, -25],
  [110, -55],
  [160, -55],
  [210, -55],
  [110, 0],
  [160, 0],
  [210, 0],
  [110, 55],
  [160, 55],
  [210, 55],
];
/** ②: where the red block is today, three times, mm. */
export const TRIALS: readonly [number, number][] = [
  [195, 35],
  [125, 30],
  [185, -40],
];

/* --- the camera picture ------------------------------------------------------------------- */

export interface Picture {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Robot mm at height z → pixel: u grows with +y, v with +x (image up = towards the robot). */
export function toPixel(x: number, y: number, z: number): { u: number; v: number } {
  const d = CAMERA.z - z;
  return { u: CAMERA.w / 2 + (CAMERA.f * (y - CAMERA.y)) / d, v: CAMERA.h / 2 + (CAMERA.f * (x - CAMERA.x)) / d };
}

/** The official conversion: the two markers give the scale (220 mm ÷ |du| + |dv|) and the board centre's pixel. */
export function markerCalibration() {
  const [a, b] = MARKERS.map((m) => toPixel(m.x, m.y, 0));
  const ratio = MARKER_SPAN_MM / (Math.abs(b.u - a.u) + Math.abs(b.v - a.v));
  return { ratio, cu: (a.u + b.u) / 2, cv: (a.v + b.v) / 2, a, b };
}
/** Pixel → robot mm: x = (v − c_v) × ratio + board x, y = (u − c_u) × ratio + board y (aikit_color.py). */
export function toRobot(u: number, v: number): [number, number] {
  const c = markerCalibration();
  return [(v - c.cv) * c.ratio + CAL_BOARD.x, (u - c.cu) * c.ratio + CAL_BOARD.y];
}
/** ③: a point seen on a top h mm above the plate, pulled back towards the camera's axis: × (Z − h) ÷ Z. */
export function parallaxFix(x: number, y: number, h: number): [number, number] {
  const k = (CAMERA.z - h) / CAMERA.z;
  return [CAMERA.x + (x - CAMERA.x) * k, CAMERA.y + (y - CAMERA.y) * k];
}

const noise = (a: number, b: number) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

function hsvToRgb(h360: number, s: number, v: number): [number, number, number] {
  const h = (((h360 % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** The ROI the program looks at: the board (the official code crops round the markers), px. */
export const ROI = (() => {
  const a = toPixel(CAL_BOARD.x - CAL_BOARD.size / 2 - 40, CAL_BOARD.y - CAL_BOARD.size / 2 - 40, 0);
  const b = toPixel(CAL_BOARD.x + CAL_BOARD.size / 2 + 40, CAL_BOARD.y + CAL_BOARD.size / 2 + 40, 0);
  return { u0: Math.max(0, Math.floor(a.u)), v0: Math.max(0, Math.floor(a.v)), u1: Math.min(CAMERA.w - 1, Math.ceil(b.u)), v1: Math.min(CAMERA.h - 1, Math.ceil(b.v)) };
})();

/**
 * The kit camera's picture: the grey plate, the white board with its two markers, the objects.
 * An object's top is its colour (lit from above, a little noise); its sides, seen between the top
 * and its foot, are in shadow — too dark for any of the official ranges.
 */
export function kitPicture(things: readonly Thing[]): Picture {
  const { w, h } = CAMERA;
  const data = new Uint8ClampedArray(w * h * 4);
  const b0 = toPixel(CAL_BOARD.x - CAL_BOARD.size / 2, CAL_BOARD.y - CAL_BOARD.size / 2, 0);
  const b1 = toPixel(CAL_BOARD.x + CAL_BOARD.size / 2, CAL_BOARD.y + CAL_BOARD.size / 2, 0);
  const marks = MARKERS.map((m) => ({ a: toPixel(m.x - MARKER_MM / 2, m.y - MARKER_MM / 2, 0), b: toPixel(m.x + MARKER_MM / 2, m.y + MARKER_MM / 2, 0) }));
  const shapes = things.map((t) => {
    const half = t.shape === 'cube' ? BLOCK_MM / 2 : POST.d / 2;
    const top = toPixel(t.x, t.y, t.h);
    const foot = toPixel(t.x, t.y, 0);
    const rTop = (CAMERA.f * half) / (CAMERA.z - t.h);
    const rFoot = (CAMERA.f * half) / CAMERA.z;
    return { t, top, foot, rTop, rFoot };
  });
  const inside = (s: (typeof shapes)[number], u: number, v: number, c: { u: number; v: number }, r: number) =>
    s.t.shape === 'cube' ? Math.abs(u - c.u) <= r && Math.abs(v - c.v) <= r : (u - c.u) ** 2 + (v - c.v) ** 2 <= r * r;
  for (let v = 0; v < h; v += 1) {
    for (let u = 0; u < w; u += 1) {
      const n = noise(u, v);
      let rgb: [number, number, number];
      if (u >= b0.u && u <= b1.u && v >= b0.v && v <= b1.v) {
        const g = 238 + n * 8;
        rgb = [g, g, g - 2];
      } else {
        const g = 150 + n * 10;
        rgb = [g, g + 3, g + 6];
      }
      for (const m of marks) {
        if (u >= m.a.u && u <= m.b.u && v >= m.a.v && v <= m.b.v) {
          const fu = (u - m.a.u) / (m.b.u - m.a.u);
          const fv = (v - m.a.v) / (m.b.v - m.a.v);
          const cell = (Math.floor(fu * 8) + Math.floor(fv * 8) * 3) % 3 === 0 && fu > 0.13 && fu < 0.87 && fv > 0.13 && fv < 0.87;
          const g = cell ? 230 : 16;
          rgb = [g, g, g];
        }
      }
      for (const s of shapes) {
        if (inside(s, u, v, s.top, s.rTop)) {
          const lit = 0.92 + (n - 0.5) * 0.06;
          rgb = hsvToRgb(s.t.hue * 2 + (noise(v, u) - 0.5) * 4, s.t.sat, Math.min(1, s.t.val * lit));
        } else {
          // The side between foot and top: the swept outline, in shadow.
          for (let k = 0; k <= 6; k += 1) {
            const c = { u: s.foot.u + ((s.top.u - s.foot.u) * k) / 6, v: s.foot.v + ((s.top.v - s.foot.v) * k) / 6 };
            const r = s.rFoot + ((s.rTop - s.rFoot) * k) / 6;
            if (inside(s, u, v, c, r)) {
              rgb = hsvToRgb(s.t.hue * 2, s.t.sat * 0.8, 0.12);
              break;
            }
          }
        }
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

/** cv2.cvtColor(BGR2HSV) for one pixel: H 0–180, S and V 0–255. */
export function hsvCv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = (60 * (g - b)) / d;
    else if (max === g) h = 120 + (60 * (b - r)) / d;
    else h = 240 + (60 * (r - g)) / d;
  }
  if (h < 0) h += 360;
  return [Math.round(h / 2), max === 0 ? 0 : Math.round((255 * d) / max), max];
}

/** Per pixel in the ROI: 0 = none, k + 1 = the first range it falls in. */
export function labelPicture(p: Picture, ranges: readonly Range[]): Uint8Array {
  const out = new Uint8Array(p.width * p.height);
  for (let v = ROI.v0; v <= ROI.v1; v += 1)
    for (let u = ROI.u0; u <= ROI.u1; u += 1) {
      const i = v * p.width + u;
      const hsv = hsvCv(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
      for (let k = 0; k < ranges.length; k += 1) {
        const r = ranges[k];
        if (hsv.every((x, j) => x >= r.lo[j] && x <= r.hi[j])) {
          out[i] = k + 1;
          break;
        }
      }
    }
  return out;
}

export interface Found {
  /** The colour the program calls it, by its range. */
  color: ColorName;
  range: string;
  area: number;
  /** Bounding-box centre (what the official code uses), px. */
  u: number;
  v: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Robot mm the program computes (before any parallax fix). */
  x: number;
  y: number;
  /** What it really is (index into the things), or −1. */
  k: number;
}

/** Connected regions of each label (4-neighbours), at least 150 px. */
export function findThings(p: Picture, ranges: readonly Range[], things: readonly Thing[]): Found[] {
  const labels = labelPicture(p, ranges);
  const seen = new Uint8Array(labels.length);
  const out: Found[] = [];
  const stack: number[] = [];
  const W = p.width;
  for (let s0 = 0; s0 < labels.length; s0 += 1) {
    const lab = labels[s0];
    if (!lab || seen[s0]) continue;
    let area = 0;
    let u0 = W;
    let u1 = 0;
    let v0 = p.height;
    let v1 = 0;
    stack.push(s0);
    seen[s0] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const u = i % W;
      const v = (i - u) / W;
      area += 1;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
      for (const n of [u > 0 ? i - 1 : -1, u < W - 1 ? i + 1 : -1, v > 0 ? i - W : -1, v < p.height - 1 ? i + W : -1]) {
        if (n >= 0 && !seen[n] && labels[n] === lab) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (area < 150) continue;
    const u = (u0 + u1) / 2;
    const v = (v0 + v1) / 2;
    const [x, y] = toRobot(u, v);
    let k = -1;
    let best = Infinity;
    things.forEach((t, j) => {
      const c = toPixel(t.x, t.y, t.h);
      const d = Math.hypot(c.u - u, c.v - v);
      if (d < best) {
        best = d;
        k = j;
      }
    });
    out.push({ color: ranges[lab - 1].color, range: ranges[lab - 1].name, area, u, v, u0, u1, v0, v1, x, y, k: best < 30 ? k : -1 });
  }
  return out.sort((a, b) => a.v - b.v || a.u - b.u);
}

/** A thing's top hue as the camera reads it (OpenCV H, the median over its top). */
export function measuredHue(p: Picture, t: Thing): number {
  const c = toPixel(t.x, t.y, t.h);
  const r = ((CAMERA.f * (t.shape === 'cube' ? BLOCK_MM : POST.d)) / 2 / (CAMERA.z - t.h)) * 0.7;
  const hs: number[] = [];
  for (let v = Math.round(c.v - r); v <= Math.round(c.v + r); v += 1)
    for (let u = Math.round(c.u - r); u <= Math.round(c.u + r); u += 1) {
      const i = v * p.width + u;
      hs.push(hsvCv(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2])[0]);
    }
  hs.sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)];
}

/* --- the run ------------------------------------------------------------------------------ */

export type ThingMode = 'board' | 'held' | 'binned' | 'dropped';

export interface ThingState {
  /** The thing's foot centre, mm. */
  c: Mm;
  mode: ThingMode;
  /** The bin it ended in. */
  bin?: BinName;
}

export interface AiFrame {
  t: number;
  q: number[];
  pump: boolean;
  things: ThingState[];
  alarm: boolean;
}

export type AiEventKind = 'see' | 'pick' | 'place' | 'wrong' | 'miss' | 'press' | 'left' | 'unreachable' | 'done';

export interface AiEvent {
  t: number;
  kind: AiEventKind;
  text: string;
  at?: Mm;
  value?: number;
  thing?: number;
}

export interface AiPick {
  k: number;
  /** Where the cup came down vs the top's centre, mm. */
  offset: number;
  ok: boolean;
  bin?: BinName;
}

export interface AiRun {
  values: AiValues;
  frames: AiFrame[];
  events: AiEvent[];
  durationS: number;
  failure: AiEvent | null;
  tip: Mm[];
  found: Found[];
  picks: AiPick[];
  /** Things that ended in their own bin, out of how many. */
  right: number;
  of: number;
}

const DT = 0.01;
const FRAME_DT = 0.02;
const SPEED = { travel: 60, down: 35 };
const ABOVE = 50;

export function toolAt(chain: readonly ChainSegment[], q: readonly number[]): Mm {
  const f = forwardKinematicsFrames(chain, q);
  const e = f[f.length - 1].elements;
  return [e[12] * 1000 + e[8] * TCP_MM, e[13] * 1000 + e[9] * TCP_MM, e[14] * 1000 + e[10] * TCP_MM];
}

export function poseAt(chain: readonly ChainSegment[], p: Mm, seed: readonly number[] = HOME_DEG): number[] | null {
  // The cup is round: any turn about the vertical will do (the solver tries the usual ones).
  const r = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, seed, { tcpMm: TCP_MM });
  return r.converged ? r.anglesDeg : null;
}

class AiSim {
  t = 0;
  q: number[] = HOME_DEG.slice();
  pump = false;
  things: ThingState[];
  held = -1;
  heldDz = 0;
  frames: AiFrame[] = [];
  events: AiEvent[] = [];
  tip: Mm[] = [];
  failure: AiEvent | null = null;
  stopped = false;
  private nextFrame = 0;

  constructor(
    readonly chain: readonly ChainSegment[],
    readonly list: readonly Thing[],
  ) {
    this.things = list.map((t) => ({ c: [t.x, t.y, 0], mode: 'board' }));
    this.snap();
  }

  log(kind: AiEventKind, text: string, extra: Partial<AiEvent> = {}): AiEvent {
    const e = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }
  fail(kind: AiEventKind, text: string, extra: Partial<AiEvent> = {}, stop = true): false {
    const e = this.log(kind, text, extra);
    this.failure ??= e;
    if (stop) this.stopped = true;
    return false;
  }

  snap(): void {
    const tip = toolAt(this.chain, this.q);
    if (this.held >= 0) this.things[this.held].c = [tip[0], tip[1], tip[2] - this.heldDz];
    if (this.t + 1e-9 >= this.nextFrame) {
      this.nextFrame += FRAME_DT;
      this.frames.push({ t: this.t, q: this.q.slice(), pump: this.pump, things: this.things.map((x) => ({ ...x, c: [...x.c] as Mm })), alarm: this.stopped });
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
      this.snap();
    }
    return true;
  }

  wait(s: number): void {
    const end = this.t + s;
    while (this.t < end - 1e-9) {
      this.t = Math.min(end, this.t + DT);
      this.snap();
    }
  }
}

/** The bin's drop point for an object hanging `hang` mm below the cup: its opening, above its rim, mm. */
function dropAt(bin: BinName, hang: number): Mm {
  const b = BINS[bin];
  return [b.drop.x, b.drop.y, b.rimZ + hang + 20];
}

/**
 * Pick at (x, y) believing the top is at `topZ`, carry to a bin, let go. Returns the pick.
 * Real geometry decides: the cup on a top it is pressed into too far (press), a cup off the top (miss).
 */
function pickPlace(sim: AiSim, x: number, y: number, topZ: number, bin: BinName, what: string, target: number): AiPick | null {
  const above: Mm = [x, y, topZ + ABOVE];
  const at: Mm = [x, y, topZ - PRESS_MM];
  const a = poseAt(sim.chain, above, sim.q);
  const b = a && poseAt(sim.chain, at, a);
  if (!a || !b) {
    sim.fail('unreachable', `${what} 위 (${x.toFixed(0)}, ${y.toFixed(0)})에 손이 닿지 않아요 — 작업 중지`, { at: above });
    return null;
  }
  if (!sim.moveJ(a, SPEED.travel)) return null;
  // Coming down: does the cup meet a real top on the way (higher than it thinks)?
  const t = target >= 0 ? sim.list[target] : null;
  const real = t ? Math.hypot(x - t.x, y - t.y) : Infinity;
  const half = t ? (t.shape === 'cube' ? BLOCK_MM / 2 : POST.d / 2) : 0;
  const onTop = t && real <= half + 10;
  if (t && onTop && t.h > topZ + 2) {
    // The cup lands on the top before reaching where it was sent: it presses into the part.
    const stopAt = poseAt(sim.chain, [x, y, t.h], a);
    if (stopAt) sim.moveJ(stopAt, SPEED.down);
    sim.fail('press', `${what}: 흡착 컵이 윗면을 ${(t.h - topZ + PRESS_MM).toFixed(0)} mm 눌렀어요 — 프로그램은 윗면을 ${topZ.toFixed(0)} mm로 알고 있어요 — 작업 중지`, { at: [x, y, t.h], value: t.h - topZ, thing: target });
    return { k: target, offset: real, ok: false };
  }
  if (!sim.moveJ(b, SPEED.down)) return null;
  sim.pump = true;
  sim.wait(0.3);
  if (!t || real > SEAL_MM || Math.abs(t.h - topZ) > 4) {
    sim.pump = false;
    const left = poseAt(sim.chain, above, sim.q);
    if (left) sim.moveJ(left, SPEED.down);
    sim.fail('miss', t ? `${what}: 흡착 컵이 윗면 가운데에서 ${real.toFixed(1)} mm 벗어나 공기가 새요 — 들지 못했어요` : `${what}: 그 자리에 아무것도 없어요 — 허공을 집었어요`, { at: at, value: real, thing: target }, false);
    return { k: target, offset: real, ok: false };
  }
  sim.held = target;
  sim.heldDz = t.h;
  sim.things[target].mode = 'held';
  sim.log('pick', `${what} — 집었어요 (가운데에서 ${real.toFixed(1)} mm)`, { at: [t.x, t.y, t.h], value: real, thing: target });
  sim.moveJ(a, SPEED.down);
  const d = dropAt(bin, t.h);
  const q = poseAt(sim.chain, d, sim.q);
  if (!q) {
    sim.fail('unreachable', `분류함 ${bin} 위에 손이 닿지 않아요 — 작업 중지`, { at: d });
    return { k: target, offset: real, ok: false };
  }
  sim.moveJ(q, SPEED.travel);
  sim.pump = false;
  sim.held = -1;
  const B = BINS[bin];
  sim.things[target] = { c: [B.x, B.y, B.floorZ], mode: 'binned', bin };
  sim.wait(0.3);
  const ok = bin === t.bin;
  sim.log(ok ? 'place' : 'wrong', ok ? `${what} → 분류함 ${bin}` : `${what} → 분류함 ${bin}에 들어갔어요 (제자리는 ${t.bin})`, { at: [B.x, B.y, B.rimZ], thing: target });
  return { k: target, offset: real, ok, bin };
}

function finish(sim: AiSim, values: AiValues, found: Found[], picks: AiPick[], of: number): AiRun {
  if (!sim.stopped) {
    sim.moveJ(HOME_DEG, SPEED.travel);
    sim.log('done', '작업을 마쳤어요');
  }
  sim.wait(0.4);
  const right = sim.things.filter((x, k) => x.mode === 'binned' && x.bin === sim.list[k]?.bin).length;
  return { values, frames: sim.frames, events: sim.events, durationS: sim.t, failure: sim.failure, tip: sim.tip, found, picks, right, of };
}

/* --- ① 색이 섞여 있다 ---------------------------------------------------------------------- */

export function runHsv(chain: readonly ChainSegment[], v: HsvValues): AiRun {
  const list = AI_THINGS[1];
  const pic = kitPicture(list);
  const found = findThings(pic, officialRanges(v.yellowHi, v.greenLo), list);
  const sim = new AiSim(chain, list);
  sim.log('see', `사진에서 ${found.length}개를 찾았어요 — ${found.map((f) => f.color).join(' · ')}`);
  const picks: AiPick[] = [];
  for (const f of found) {
    if (sim.stopped) break;
    const t = list[f.k];
    const pk = pickPlace(sim, f.x, f.y, BLOCK_MM, BIN_OF[f.color], `${t?.color ?? '?'} 블록 (프로그램: ${f.color})`, f.k);
    if (pk) picks.push(pk);
    if (pk && !pk.ok && pk.bin) sim.failure ??= sim.events[sim.events.length - 1];
  }
  const missing = list.map((t, k) => ({ t, k })).filter(({ k }) => !found.some((f) => f.k === k));
  for (const { t, k } of missing) sim.fail('left', `${t.color} 블록을 찾지 못해 남겼어요`, { thing: k, at: [t.x, t.y, t.h] }, false);
  return finish(sim, v, found, picks, list.length);
}

/* --- ② 시연을 보고 따라 하기 ------------------------------------------------------------------ */

/** ②: the joint angles each demonstration recorded at the block (the cup on its top). */
export function demoAngles(chain: readonly ChainSegment[]): number[][] {
  return DEMOS.map(([x, y]) => poseAt(chain, [x, y, BLOCK_MM - PRESS_MM])!);
}

/** ②: the policy for a block at p: the angles it sends and where the cup goes. */
export function policy(chain: readonly ChainSegment[], v: DemoValues, p: readonly [number, number]): { q: number[]; at: Mm; weights: number[] } {
  const qs = demoAngles(chain);
  if (v.mode === 'relative') {
    // The demonstration said "the cup on the block's top centre": put that where the block is now.
    const q = poseAt(chain, [p[0], p[1], BLOCK_MM - PRESS_MM], qs[0]) ?? qs[0];
    return { q, at: toolAt(chain, q), weights: DEMOS.map(() => 0) };
  }
  const w = DEMOS.map(([x, y], i) => (v.mode === 'replay' ? (i === 0 ? 1 : 0) : 1 / Math.max(1e-6, Math.hypot(p[0] - x, p[1] - y)) ** v.power));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const q = qs[0].map((_, j) => qs.reduce((acc, qi, i) => acc + qi[j] * w[i], 0) / sum);
  return { q, at: toolAt(chain, q), weights: w.map((x) => x / sum) };
}

export function runDemo(chain: readonly ChainSegment[], v: DemoValues): AiRun {
  // The red block, three times, each at a new spot (the camera tells the policy where).
  const list: Thing[] = TRIALS.map(([x, y]) => cube('빨강', 4, x, y, 'D'));
  const sim = new AiSim(chain, list);
  // Only the current trial's block is on the board.
  sim.things.forEach((s, k) => {
    if (k > 0) s.c = [s.c[0], s.c[1], -999];
  });
  const picks: AiPick[] = [];
  for (let k = 0; k < list.length && !sim.stopped; k += 1) {
    const t = list[k];
    sim.things[k].c = [t.x, t.y, 0];
    sim.log('see', `${k + 1}회: 빨간 블록이 (${t.x}, ${t.y})에 있어요`, { at: [t.x, t.y, BLOCK_MM], thing: k });
    const pol = policy(chain, v, [t.x, t.y]);
    const above = poseAt(chain, [pol.at[0], pol.at[1], BLOCK_MM + ABOVE], sim.q);
    if (!above || !sim.moveJ(above, SPEED.travel) || !sim.moveJ(pol.q, SPEED.down)) break;
    const off = Math.hypot(pol.at[0] - t.x, pol.at[1] - t.y);
    sim.pump = true;
    sim.wait(0.3);
    if (off > SEAL_MM) {
      sim.pump = false;
      sim.fail('miss', `${k + 1}회: 블록에서 ${off.toFixed(1)} mm 떨어진 곳을 집었어요${off > BLOCK_MM ? ' (허공)' : ' (가장자리 — 공기가 새요)'}`, { at: pol.at, value: off, thing: k }, false);
      picks.push({ k, offset: off, ok: false });
      sim.moveJ(above, SPEED.down);
      sim.things[k].c = [t.x, t.y, -999];
      continue;
    }
    sim.held = k;
    sim.heldDz = BLOCK_MM;
    sim.things[k].mode = 'held';
    sim.log('pick', `${k + 1}회: 집었어요 (가운데에서 ${off.toFixed(1)} mm)`, { at: [t.x, t.y, BLOCK_MM], value: off, thing: k });
    sim.moveJ(above, SPEED.down);
    const d = poseAt(chain, dropAt('D', BLOCK_MM), sim.q);
    if (d) sim.moveJ(d, SPEED.travel);
    sim.pump = false;
    sim.held = -1;
    sim.things[k] = { c: [BINS.D.x, BINS.D.y, BINS.D.floorZ], mode: 'binned', bin: 'D' };
    sim.log('place', `${k + 1}회: 분류함 D에 넣었어요`, { thing: k });
    picks.push({ k, offset: off, ok: true, bin: 'D' });
  }
  return finish(sim, v, [], picks, list.length);
}

/** ②: the policy's miss at points of the board (no run), mm. */
export function demoMiss(chain: readonly ChainSegment[], v: DemoValues, p: readonly [number, number]): number {
  const pol = policy(chain, v, p);
  return Math.hypot(pol.at[0] - p[0], pol.at[1] - p[1]);
}

/* --- ③ 처음 보는 물건 --------------------------------------------------------------------------- */

/** ③: where the program sends the cup for a part, with its values: (x, y), and its miss, mm. */
export function partTarget(found: Found, t: Thing | null, v: PartValues): { x: number; y: number; miss: number } {
  const [x, y] = v.parallax ? parallaxFix(found.x, found.y, v.height) : [found.x, found.y];
  return { x, y, miss: t ? Math.hypot(x - t.x, y - t.y) : NaN };
}

export function runPart(chain: readonly ChainSegment[], v: PartValues): AiRun {
  const list = partThings(v);
  const found = findThings(kitPicture(list), officialRanges(), list);
  const sim = new AiSim(chain, list);
  sim.log('see', `사진에서 ${found.length}개를 찾았어요`);
  const picks: AiPick[] = [];
  for (const f of found) {
    if (sim.stopped) break;
    const t = list[f.k] ?? null;
    const g = partTarget(f, t, v);
    const pk = pickPlace(sim, g.x, g.y, v.height, BIN_OF[f.color], `${f.color} 부품`, f.k);
    if (pk) picks.push(pk);
  }
  return finish(sim, v, found, picks, list.length);
}

/** ③: each part's miss for values (no run), mm. */
export function partPreview(v: PartValues) {
  const list = partThings(v);
  return findThings(kitPicture(list), officialRanges(), list)
    .filter((f) => f.k >= 0)
    .map((f) => {
      const t = list[f.k];
      return { k: f.k, r: Math.hypot(t.x - CAMERA.x, t.y - CAMERA.y), ...partTarget(f, t, v) };
    });
}

export function runAi(chain: readonly ChainSegment[], p: AiProblem, v: AiValues): AiRun {
  return p === 1 ? runHsv(chain, v as HsvValues) : p === 2 ? runDemo(chain, v as DemoValues) : runPart(chain, v as PartValues);
}

/* --- 판정 ------------------------------------------------------------------------------------ */

export interface AiCheck {
  label: string;
  ok: boolean;
  value: string;
}
export interface AiScore {
  pass: boolean;
  checks: AiCheck[];
  headline: string;
}

const strip = (s: string) => s.replace(/ — 작업 중지$/, '');

export function scoreAi(p: AiProblem, run: AiRun): AiScore {
  const stopEv = run.events.find((e) => e.kind === 'press' || e.kind === 'unreachable');
  const stop: AiCheck = { label: '작업 중지 없음', ok: !stopEv, value: stopEv ? strip(stopEv.text) : '없음' };
  if (p === 1) {
    const wrong = run.events.filter((e) => e.kind === 'wrong').length;
    const checks: AiCheck[] = [
      { label: '네 블록 모두 제 색 분류함에', ok: run.right === run.of, value: `${run.right} / ${run.of}` },
      { label: '다른 색 칸에 들어간 블록 없음', ok: wrong === 0, value: `${wrong}개` },
      stop,
    ];
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: pass ? '네 블록을 모두 제 칸에 나눴어요' : run.failure ? strip(run.failure.text) : `${run.right} / ${run.of}만 제 칸에 들어갔어요` };
  }
  if (p === 2) {
    const ok = run.picks.filter((x) => x.ok).length;
    const worst = run.picks.length ? Math.max(...run.picks.map((x) => x.offset)) : NaN;
    const checks: AiCheck[] = [
      { label: '세 번 모두 집어 D에 넣음', ok: ok === TRIALS.length, value: `${ok} / ${TRIALS.length}` },
      { label: `블록 가운데에서 ${SEAL_MM} mm 안에 집음`, ok: worst <= SEAL_MM, value: Number.isFinite(worst) ? `최대 ${worst.toFixed(1)} mm` : '—' },
      stop,
    ];
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: pass ? '새 자리의 블록도 세 번 모두 집었어요' : run.failure ? strip(run.failure.text) : '아직 기준을 못 넘었어요' };
  }
  const worst = run.picks.length ? Math.max(...run.picks.map((x) => x.offset)) : NaN;
  const checks: AiCheck[] = [
    { label: '네 부품 모두 제 분류함에', ok: run.right === run.of, value: `${run.right} / ${run.of}` },
    { label: `윗면 가운데에서 ${SEAL_MM} mm 안에 집음`, ok: run.picks.length === run.of && worst <= SEAL_MM, value: Number.isFinite(worst) ? `최대 ${worst.toFixed(1)} mm` : '—' },
    stop,
  ];
  const pass = checks.every((c) => c.ok);
  return { pass, checks, headline: pass ? '처음 보는 부품도 모두 제 칸에 넣었어요' : run.failure ? strip(run.failure.text) : '아직 기준을 못 넘었어요' };
}
