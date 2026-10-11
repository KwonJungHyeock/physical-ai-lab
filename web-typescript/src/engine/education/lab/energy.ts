/**
 * 에너지 · 자원순환 — 재활용 선별 (myCobot 280 RDK X5 + 공식 AI 키트: 위에서 보는 카메라, 흡착 펌프,
 * 분류함 4개, 보정판과 마커 두 개). The kit as shipped (simulator/board.ts, the camera and pixel → mm of
 * ai.ts) set up as a small sorting cell: flattened recyclables lie on the board, the camera finds them,
 * the cup takes each to its bin — 투명 PET A, 유색 PET B, 종이팩 C, 캔 D. Three problems:
 *
 *  ① 투명 PET가 안 보인다 — the program sorts by colour: saturated pixels by hue (종이팩 · 유색 PET),
 *    grey ones by brightness (darker than V 200 = 캔). Clear PET has no colour and lets the white
 *    board show through (about 90 % of its light): its pixels are grey and nearly as bright as the
 *    board, so the old band for it (V 200 ~ 210) never holds them and both bottles stay on the board.
 *    The fix: a band between the PET's brightest pixel and the board's darkest (7-2).
 *  ② 빨리 하면 떨어진다 — one speed (100) for every carry. A cup holds a piece while
 *    m(g + a_z) + m|a_xy| ÷ μ ≤ F (the suction-cup rule for a cup moved sideways): the can with drink
 *    left in it and the wet paper pack let go at the start of the carry and land on the plate. Slower
 *    carries hold but take longer; the measure is pieces sorted right per minute. The fix: a carry
 *    speed per kind, each under its own limit — the light PET still at full speed (3-2, 4-3).
 *  ③ 겹쳐 놓인 쓰레기 — a can lies on a paper pack, a coloured PET on a clear one. The program picks
 *    the biggest blob first: the pack, with the can riding on it, into the pack bin — a can in the
 *    paper. The fix: the pieces seen whole (on top) first — visible area ÷ the kind's full area (6-4, 7-2).
 *
 * The camera picture is made here (pinhole over the board: board, markers, the pieces' tops drawn
 * lowest first, clear PET tinting what lies under it) and the program's vision really runs on it.
 * Accelerations are the cup's, from the arm's own trajectories (robot/motion.ts) through forward
 * kinematics; a piece that lets go flies and lands where the engine says. No React, no WebGL:
 * tests/education/energy-check.mts runs these headless.
 */

import type { ChainSegment } from '../../robot/kinematics';
import { jointTrajectory } from '../../robot/motion';
import { BINS, CAL_BOARD, DESK_Z, HOME_DEG, MARKERS, MARKER_MM, PLATE, binAt, type BinName } from '../../simulator/board';
import { CAMERA, hsvCv, markerCalibration, poseAt, toPixel, toRobot, toolAt, type Picture } from './ai';
import { CUP_R, PRESS_MM, type Mm } from './cell';

export type EnergyProblem = 1 | 2 | 3;

/** The four kinds the cell sorts, and their bins (the bins carry these signs). */
export type Kind = 'can' | 'clear' | 'color' | 'pack';
export const KINDS: readonly Kind[] = ['clear', 'color', 'pack', 'can'];
export const KIND_NAME: Record<Kind, string> = { can: '캔', clear: '투명 PET', color: '유색 PET', pack: '종이팩' };
export const BIN_OF: Record<Kind, BinName> = { clear: 'A', color: 'B', pack: 'C', can: 'D' };
export const KIND_OF_BIN: Record<BinName, Kind> = { A: 'clear', B: 'color', C: 'pack', D: 'can' };

/** Each kind's flattened piece as the program's table has it: a disc (Ø) or a rectangle, mm; and its thickness. */
export const SIZE: Record<Kind, { shape: 'disc' | 'rect'; sx: number; sy: number; h: number }> = {
  can: { shape: 'disc', sx: 32, sy: 32, h: 12 },
  clear: { shape: 'rect', sx: 50, sy: 34, h: 6 },
  color: { shape: 'rect', sx: 42, sy: 28, h: 6 },
  pack: { shape: 'rect', sx: 60, sy: 40, h: 9 },
};
/** A kind's whole top, mm² (the program's table, for ③'s visible share). */
export const fullArea = (k: Kind) => (SIZE[k].shape === 'disc' ? Math.PI * (SIZE[k].sx / 2) ** 2 : SIZE[k].sx * SIZE[k].sy);

/** g, m/s². */
export const G = 9.81;
/** Friction between two pieces lying on each other (a piece riding on the one the cup holds). */
export const MU_PIECE = 0.35;

export interface Item {
  kind: Kind;
  /** As the screens call it ('캔 (음료 남음)'). */
  name: string;
  /** Footprint centre, mm. */
  x: number;
  y: number;
  /** Turned 90° (a rectangle's long side along y). */
  turn?: boolean;
  /** Lying on another piece (its index): its foot is that piece's top. */
  on?: number;
  massG: number;
  /** 흡착 유지력: the cup pulled straight off it (spring scale), N. */
  holdN: number;
  /** Friction between the cup's lip and its top. */
  mu: number;
  /** Top colour: H in OpenCV units (0 – 180), S and V (0 – 1). Clear PET: what it lets through instead. */
  hue: number;
  sat: number;
  val: number;
}

/** A piece's footprint size (x, y) and thickness. */
export const dims = (t: Item) => {
  const s = SIZE[t.kind];
  return { shape: s.shape, sx: t.turn ? s.sy : s.sx, sy: t.turn ? s.sx : s.sy, h: s.h };
};
/** Its foot and top height as it lies on the board, mm. */
export function footOf(list: readonly Item[], k: number): number {
  const t = list[k];
  return t.on === undefined ? 0 : footOf(list, t.on) + dims(list[t.on]).h;
}
export const topOf = (list: readonly Item[], k: number) => footOf(list, k) + dims(list[k]).h;

/** Is (x, y) on the piece's footprint (centre cx, cy), `inset` mm in from its edge? */
export function onPiece(t: Item, cx: number, cy: number, x: number, y: number, inset = 0): boolean {
  const d = dims(t);
  if (d.shape === 'disc') return Math.hypot(x - cx, y - cy) <= d.sx / 2 - inset;
  return Math.abs(x - cx) <= d.sx / 2 - inset && Math.abs(y - cy) <= d.sy / 2 - inset;
}

/* Typical pieces: clean ones, the ② ones (drink left in a can, a soaked paper pack). */
const can = (x: number, y: number, name = '캔'): Item => ({ kind: 'can', name, x, y, massG: 15, holdN: 1.0, mu: 0.45, hue: 105, sat: 0.05, val: 0.66 });
const clear = (x: number, y: number, name = '투명 PET', turn = false): Item => ({ kind: 'clear', name, x, y, turn, massG: 8, holdN: 2.6, mu: 0.6, hue: 100, sat: 0.05, val: 0.9 });
const color = (x: number, y: number, name = '유색 PET', turn = false): Item => ({ kind: 'color', name, x, y, turn, massG: 8, holdN: 2.6, mu: 0.6, hue: 62, sat: 0.55, val: 0.62 });
const pack = (x: number, y: number, name = '종이팩', turn = false): Item => ({ kind: 'pack', name, x, y, turn, massG: 12, holdN: 1.8, mu: 0.5, hue: 16, sat: 0.72, val: 0.88 });

/** ①: two of each kind but packs and coloured PET; ②: the same kinds with a full can and a wet pack; ③: two stacks. */
export const ENERGY_ITEMS: Record<EnergyProblem, readonly Item[]> = {
  1: [can(125, -50, '캔 1'), clear(125, 0, '투명 PET 1', true), color(143, 52), can(178, -50, '캔 2'), pack(192, 0), clear(198, 50, '투명 PET 2')],
  2: [
    can(125, -50, '빈 캔'),
    clear(125, 0, '투명 PET', true),
    color(143, 52),
    { ...can(178, -50, '캔 (음료 남음)'), massG: 60 },
    pack(192, 0, '종이팩 (마른)'),
    { ...pack(198, 50, '종이팩 (젖음)'), massG: 30, holdN: 0.39, mu: 0.25, val: 0.6 },
  ],
  3: [pack(135, -25, '종이팩'), { ...can(157, -25, '캔'), on: 0 }, clear(190, 25, '투명 PET', true), { ...color(190, 39, '유색 PET'), on: 2 }],
};

/** ②: the can with drink left in it (its index in ENERGY_ITEMS[2]). */
export const FULL_CAN = 3;
const fullCans = new Map<number, readonly Item[]>();
/** ②'s pieces with the full can at `canG` g (the situation), one list per mass so its camera picture is made once. */
export function speedItems(canG?: number): readonly Item[] {
  const base = ENERGY_ITEMS[2];
  if (canG === undefined || canG === base[FULL_CAN].massG) return base;
  let list = fullCans.get(canG);
  if (!list) {
    list = base.map((t, k) => (k === FULL_CAN ? { ...t, massG: canG } : t));
    fullCans.set(canG, list);
  }
  return list;
}

/* --- values ------------------------------------------------------------------------------ */

/** ①: the brightness bands for the grey pixels (S < 43): below `canV` a can, from there below `clearV` clear PET, above it the board. */
export interface VisionValues {
  canV: number;
  clearV: number;
}
/** ②: the carry speed (setting 1 – 100, as pymycobot's) for each kind; empty moves stay at 100. */
export type SpeedValues = Record<Kind, number> & {
  /** The situation, not the student's: how heavy the can with drink left in it really is (default 60 g; 대단원 마무리 평가), g. */
  canG?: number;
};
/** ③: which blob the program picks first — the biggest, the nearest the robot, or the one seen whole. */
export type OrderMode = 'area' | 'near' | 'visible';
export interface OrderValues {
  order: OrderMode;
}
export type EnergyValues = VisionValues | SpeedValues | OrderValues;

export const ENERGY_DEFAULTS: Record<EnergyProblem, EnergyValues> = {
  1: { canV: 200, clearV: 210 },
  2: { can: 100, clear: 100, color: 100, pack: 100 },
  3: { order: 'area' },
};
export const ENERGY_FIXES: Record<EnergyProblem, EnergyValues> = {
  1: { canV: 200, clearV: 230 },
  2: { can: 60, clear: 100, color: 100, pack: 40 },
  3: { order: 'visible' },
};

/** ②: the work order — pieces sorted right per minute, at least. */
export const TARGET_PM = 12;

/* --- the camera picture ------------------------------------------------------------------- */

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

/** Clear PET lets this much of the light through, red · green · blue (the board seen through it, a hint of blue). */
export const CLEAR_PASS: readonly [number, number, number] = [0.86, 0.88, 0.9];

/** Pixel → the point at height z it shows (the inverse of toPixel). */
function atHeight(u: number, v: number, z: number): [number, number] {
  const d = CAMERA.z - z;
  return [CAMERA.x + ((v - CAMERA.h / 2) * d) / CAMERA.f, CAMERA.y + ((u - CAMERA.w / 2) * d) / CAMERA.f];
}

/** The board the program looks at (4 px in from its edge), and the markers' squares it leaves out (found first, for the scale). */
export const ROI = (() => {
  const a = toPixel(CAL_BOARD.x - CAL_BOARD.size / 2, CAL_BOARD.y - CAL_BOARD.size / 2, 0);
  const b = toPixel(CAL_BOARD.x + CAL_BOARD.size / 2, CAL_BOARD.y + CAL_BOARD.size / 2, 0);
  return { u0: Math.ceil(a.u) + 4, v0: Math.ceil(a.v) + 4, u1: Math.floor(b.u) - 4, v1: Math.floor(b.v) - 4 };
})();
const MARKS = MARKERS.map((m) => ({ a: toPixel(m.x - MARKER_MM / 2, m.y - MARKER_MM / 2, 0), b: toPixel(m.x + MARKER_MM / 2, m.y + MARKER_MM / 2, 0) }));
const inMark = (u: number, v: number, pad = 0) => MARKS.some((m) => u >= m.a.u - pad && u <= m.b.u + pad && v >= m.a.v - pad && v <= m.b.v + pad);

const pictures = new WeakMap<readonly Item[], Picture>();

/**
 * The kit camera's picture: grey plate, white board with its two markers, the pieces' tops drawn
 * from the lowest up. A can is dented aluminium (grey, with a few glints); clear PET lets through
 * CLEAR_PASS of whatever is under it; the others are their printed or tinted colour.
 */
export function sortPicture(list: readonly Item[]): Picture {
  const have = pictures.get(list);
  if (have) return have;
  const { w, h } = CAMERA;
  const data = new Uint8ClampedArray(w * h * 4);
  const b0 = toPixel(CAL_BOARD.x - CAL_BOARD.size / 2, CAL_BOARD.y - CAL_BOARD.size / 2, 0);
  const b1 = toPixel(CAL_BOARD.x + CAL_BOARD.size / 2, CAL_BOARD.y + CAL_BOARD.size / 2, 0);
  const order = list.map((t, k) => ({ t, k, top: topOf(list, k) })).sort((a, b) => a.top - b.top);
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
      for (const m of MARKS) {
        if (u >= m.a.u && u <= m.b.u && v >= m.a.v && v <= m.b.v) {
          const fu = (u - m.a.u) / (m.b.u - m.a.u);
          const fv = (v - m.a.v) / (m.b.v - m.a.v);
          const cell = (Math.floor(fu * 8) + Math.floor(fv * 8) * 3) % 3 === 0 && fu > 0.13 && fu < 0.87 && fv > 0.13 && fv < 0.87;
          const g = cell ? 230 : 16;
          rgb = [g, g, g];
        }
      }
      for (const { t, top } of order) {
        const [x, y] = atHeight(u, v, top);
        if (!onPiece(t, t.x, t.y, x, y)) continue;
        if (t.kind === 'clear') rgb = [rgb[0] * CLEAR_PASS[0], rgb[1] * CLEAR_PASS[1], rgb[2] * CLEAR_PASS[2]];
        else if (t.kind === 'can') {
          // Dented aluminium: brightness in waves across the dents, and a few glints.
          const dent = 0.07 * Math.sin((x - t.x) * 0.55) * Math.cos((y - t.y) * 0.45);
          const glint = noise(v, u) > 0.985;
          rgb = hsvToRgb(t.hue * 2, glint ? 0.02 : t.sat, glint ? 0.97 : t.val + dent + (n - 0.5) * 0.03);
        } else {
          const lit = 0.95 + (n - 0.5) * 0.06;
          rgb = hsvToRgb(t.hue * 2 + (noise(v, u) - 0.5) * 4, t.sat, Math.min(1, t.val * lit));
        }
      }
      const i = (v * w + u) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  const pic = { data, width: w, height: h };
  pictures.set(list, pic);
  return pic;
}

/** The program's rule for one pixel: saturated ones by hue, grey ones by brightness (VisionValues). */
export function classify(hsv: readonly [number, number, number], v: VisionValues): Kind | null {
  const [H, S, V] = hsv;
  if (S >= 43) return H >= 11 && H <= 34 ? 'pack' : H >= 35 && H <= 90 ? 'color' : null;
  return V < v.canV ? 'can' : V < v.clearV ? 'clear' : null;
}

/** Per pixel of the board (markers left out): 0 = background, else 1 + KINDS index. */
export function labelPicture(p: Picture, v: VisionValues): Uint8Array {
  const out = new Uint8Array(p.width * p.height);
  for (let y = ROI.v0; y <= ROI.v1; y += 1)
    for (let x = ROI.u0; x <= ROI.u1; x += 1) {
      if (inMark(x, y, 4)) continue;
      const i = y * p.width + x;
      const k = classify(hsvCv(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]), v);
      if (k) out[i] = KINDS.indexOf(k) + 1;
    }
  return out;
}

/** ①: how many grey pixels (S < 43) of the board's picture (markers left out) have each brightness V, 0 – 255. */
export function greyHistogram(p: Picture): number[] {
  const out = new Array<number>(256).fill(0);
  for (let y = ROI.v0; y <= ROI.v1; y += 1)
    for (let x = ROI.u0; x <= ROI.u1; x += 1) {
      if (inMark(x, y, 4)) continue;
      const i = (y * p.width + x) * 4;
      const [, S, V] = hsvCv(p.data[i], p.data[i + 1], p.data[i + 2]);
      if (S < 43) out[V] += 1;
    }
  return out;
}

/** A blob the program keeps: 150 px and up, no bigger than MAX_PX (bigger is the board itself). */
export const MIN_PX = 150;
export const MAX_PX = 6000;

export interface Found {
  kind: Kind;
  area: number;
  /** Its area at the board's scale, mm², and that ÷ the kind's whole top (③: seen whole ≈ 1). */
  areaMm: number;
  visible: number;
  /** The centroid (cv2.moments), px, and its bounding box. */
  u: number;
  v: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Robot mm the program computes for the centroid. */
  x: number;
  y: number;
  /** What it really is (index into the pieces), or −1. */
  k: number;
}

export interface Seen {
  found: Found[];
  /** Blobs left out for their size: too small (specks) or as big as the board. */
  tooBig: number;
}

/** Connected regions of each label (4-neighbours), kept between MIN_PX and MAX_PX. */
export function findItems(p: Picture, v: VisionValues, list: readonly Item[]): Seen {
  const labels = labelPicture(p, v);
  const seen = new Uint8Array(labels.length);
  const out: Found[] = [];
  const stack: number[] = [];
  const W = p.width;
  const ratio = markerCalibration().ratio;
  let tooBig = 0;
  for (let s0 = 0; s0 < labels.length; s0 += 1) {
    const lab = labels[s0];
    if (!lab || seen[s0]) continue;
    let area = 0;
    let su = 0;
    let sv = 0;
    let u0 = W;
    let u1 = 0;
    let v0 = p.height;
    let v1 = 0;
    stack.push(s0);
    seen[s0] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const u = i % W;
      const vv = (i - u) / W;
      area += 1;
      su += u;
      sv += vv;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (vv < v0) v0 = vv;
      if (vv > v1) v1 = vv;
      for (const n of [u > 0 ? i - 1 : -1, u < W - 1 ? i + 1 : -1, vv > 0 ? i - W : -1, vv < p.height - 1 ? i + W : -1]) {
        if (n >= 0 && !seen[n] && labels[n] === lab) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (area > MAX_PX) tooBig += 1;
    if (area < MIN_PX || area > MAX_PX) continue;
    const kind = KINDS[lab - 1];
    const u = su / area;
    const vv = sv / area;
    const [x, y] = toRobot(u, vv);
    const areaMm = area * ratio * ratio;
    let k = -1;
    let best = Infinity;
    list.forEach((t, j) => {
      const c = toPixel(t.x, t.y, topOf(list, j));
      const d = Math.hypot(c.u - u, c.v - vv);
      if (d < best) {
        best = d;
        k = j;
      }
    });
    out.push({ kind, area, areaMm, visible: areaMm / fullArea(kind), u, v: vv, u0, u1, v0, v1, x, y, k: best < 30 ? k : -1 });
  }
  return { found: out.sort((a, b) => a.v - b.v || a.u - b.u), tooBig };
}

/** A piece's top as the camera reads it: median H · S · V and the darkest and brightest V over the inner 70 %. */
export function measureItem(p: Picture, list: readonly Item[], k: number) {
  const t = list[k];
  const top = topOf(list, k);
  const d = dims(t);
  const hs: number[] = [];
  const ss: number[] = [];
  const vs: number[] = [];
  const c = toPixel(t.x, t.y, top);
  const r = (CAMERA.f * Math.max(d.sx, d.sy)) / 2 / (CAMERA.z - top);
  for (let v = Math.floor(c.v - r); v <= Math.ceil(c.v + r); v += 1)
    for (let u = Math.floor(c.u - r); u <= Math.ceil(c.u + r); u += 1) {
      const [x, y] = atHeight(u, v, top);
      if (!onPiece(t, t.x, t.y, x, y)) continue;
      // Only where nothing lies on it, and away from the edge (70 % of the way out).
      if (!onPiece(t, t.x, t.y, t.x + (x - t.x) / 0.7, t.y + (y - t.y) / 0.7)) continue;
      if (list.some((o, j) => o.on === k && onPiece(o, o.x, o.y, ...atHeight(u, v, topOf(list, j))))) continue;
      const i = v * p.width + u;
      const hsv = hsvCv(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
      // A can's glints are the board's brightness: not its metal.
      if (t.kind === 'can' && hsv[2] > 230) continue;
      hs.push(hsv[0]);
      ss.push(hsv[1]);
      vs.push(hsv[2]);
    }
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return { h: med(hs.slice()), s: med(ss.slice()), v: med(vs.slice()), vMin: Math.min(...vs), vMax: Math.max(...vs) };
}

/** The empty board's brightness (V) where the program looks: darkest and brightest. */
export function boardV(): { min: number; max: number } {
  const p = sortPicture(EMPTY);
  let min = 255;
  let max = 0;
  for (let v = ROI.v0; v <= ROI.v1; v += 1)
    for (let u = ROI.u0; u <= ROI.u1; u += 1) {
      if (inMark(u, v, 4)) continue;
      const i = (v * p.width + u) * 4;
      const V = Math.max(p.data[i], p.data[i + 1], p.data[i + 2]);
      if (V < min) min = V;
      if (V > max) max = V;
    }
  return { min, max };
}
const EMPTY: readonly Item[] = [];

/* --- the run ------------------------------------------------------------------------------ */

export type PieceMode = 'board' | 'held' | 'riding' | 'falling' | 'binned' | 'dropped';

export interface PieceState {
  /** The piece's foot centre, mm. */
  c: Mm;
  mode: PieceMode;
  /** The bin it ended in. */
  bin?: BinName;
}

export interface EnergyFrame {
  t: number;
  q: number[];
  pump: boolean;
  things: PieceState[];
  alarm: boolean;
  /** The cup's sideways acceleration, m/s², and the piece it holds (−1: none). */
  acc: number;
  held: number;
}

export type EnergyEventKind = 'see' | 'pick' | 'place' | 'wrong' | 'miss' | 'drop' | 'ride' | 'left' | 'unreachable' | 'done';

export interface EnergyEvent {
  t: number;
  kind: EnergyEventKind;
  text: string;
  at?: Mm;
  value?: number;
  thing?: number;
}

/** One carry: what was held, how hard the cup pulled it about, and what came of it. */
export interface EnergyPick {
  /** The blob the program meant and the piece the cup really took. */
  meant: number;
  k: number;
  speed: number;
  /** The largest sideways and the upward acceleration with it, m/s²; the force needed then and what the cup holds, N. */
  aXY: number;
  aZ: number;
  needN: number;
  holdN: number;
  dropped: boolean;
  /** Pieces riding on it. */
  riders: number[];
  bin?: BinName;
  /** The carry move's time, s. */
  carryS: number;
}

export interface EnergyRun {
  values: EnergyValues;
  frames: EnergyFrame[];
  events: EnergyEvent[];
  durationS: number;
  failure: EnergyEvent | null;
  tip: Mm[];
  found: Found[];
  /** Blobs the program threw away as big as the board (①, a band reaching into the board's brightness). */
  tooBig: number;
  picks: EnergyPick[];
  /** Pieces in their own bin, in another bin, come off the cup on the way (wherever they landed), left on the board — out of how many. */
  right: number;
  wrong: number;
  dropped: number;
  left: number;
  of: number;
  /** Pieces sorted right per minute of the job. */
  perMin: number;
}

const DT = 0.01;
const FRAME_DT = 0.02;
/** Speed settings: travel (①③, safe for every clean piece), empty moves in ②, the short moves down and up. */
export const SPEED = { travel: 60, empty: 100, down: 35 } as const;
/** Where the cup waits over a piece before coming down to it (no piece or stack is taller), mm. */
export const APPROACH_Z = 70;
/** The photo and the program's vision, s. */
const SEE_S = 0.6;

interface Fall {
  t0: number;
  p0: Mm;
  v0: Mm;
  tLand: number;
  land: PieceState;
  where: string;
}

/** A piece let go at p0 (its foot) moving at v0 (mm/s): where it lands — a bin, the plate, or the desk beside the kit. */
export function flight(p0: Mm, v0: Mm): { tLand: number; land: PieceState; where: string } {
  const g = G * 1000;
  for (let t = 0; t < 3; t += 0.002) {
    const x = p0[0] + v0[0] * t;
    const y = p0[1] + v0[1] * t;
    const z = p0[2] + v0[2] * t - 0.5 * g * t * t;
    const b = binAt(x, y);
    if (b && z <= b.rimZ) {
      // In through the opening: on down to its floor.
      const tf = (v0[2] + Math.sqrt(v0[2] * v0[2] + 2 * g * (p0[2] - b.floorZ))) / g;
      return { tLand: Math.max(t, tf), land: { c: [x, y, b.floorZ], mode: 'binned', bin: b.name }, where: `분류함 ${b.name}` };
    }
    const onPlate = x >= PLATE.xMin && x <= PLATE.xMax && y >= PLATE.yMin && y <= PLATE.yMax;
    if (onPlate && z <= 0) return { tLand: t, land: { c: [x, y, 0], mode: 'dropped' }, where: '키트 판 위' };
    if (!onPlate && z <= DESK_Z) return { tLand: t, land: { c: [x, y, DESK_Z], mode: 'dropped' }, where: '책상 위' };
  }
  return { tLand: 3, land: { c: [p0[0], p0[1], 0], mode: 'dropped' }, where: '키트 판 위' };
}

class EnergySim {
  t = 0;
  q: number[] = HOME_DEG.slice();
  pump = false;
  things: PieceState[];
  /** The piece on the cup, where the cup took it (from its centre), and the pieces riding on it (their offset from it). */
  held = -1;
  heldOff: [number, number] = [0, 0];
  riders: { k: number; off: Mm }[] = [];
  falls = new Map<number, Fall>();
  /** Every piece that came off the cup (or off the piece it rode on), wherever it landed. */
  fell = new Set<number>();
  acc = 0;
  frames: EnergyFrame[] = [];
  events: EnergyEvent[] = [];
  tip: Mm[] = [];
  failure: EnergyEvent | null = null;
  stopped = false;
  private nextFrame = 0;

  constructor(
    readonly chain: readonly ChainSegment[],
    readonly list: readonly Item[],
  ) {
    this.things = list.map((t, k) => ({ c: [t.x, t.y, footOf(list, k)], mode: 'board' }));
    this.snap();
  }

  log(kind: EnergyEventKind, text: string, extra: Partial<EnergyEvent> = {}): EnergyEvent {
    const e = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    return e;
  }
  fail(kind: EnergyEventKind, text: string, extra: Partial<EnergyEvent> = {}, stop = true): false {
    const e = this.log(kind, text, extra);
    this.failure ??= e;
    if (stop) this.stopped = true;
    return false;
  }

  /** The held piece's foot under the cup tip. */
  heldFoot(tip: Mm): Mm {
    const d = dims(this.list[this.held]);
    return [tip[0] - this.heldOff[0], tip[1] - this.heldOff[1], tip[2] - d.h];
  }

  snap(): void {
    const tip = toolAt(this.chain, this.q);
    if (this.held >= 0) {
      const f = this.heldFoot(tip);
      this.things[this.held].c = f;
      for (const r of this.riders) this.things[r.k].c = [f[0] + r.off[0], f[1] + r.off[1], f[2] + r.off[2]];
    }
    for (const [k, f] of this.falls) {
      const s = Math.min(this.t - f.t0, f.tLand);
      if (this.t - f.t0 >= f.tLand) {
        this.things[k] = { ...f.land, c: [...f.land.c] as Mm };
        this.falls.delete(k);
        continue;
      }
      const g = G * 1000;
      this.things[k].c = [f.p0[0] + f.v0[0] * s, f.p0[1] + f.v0[1] * s, f.p0[2] + f.v0[2] * s - 0.5 * g * s * s];
    }
    if (this.t + 1e-9 >= this.nextFrame) {
      this.nextFrame += FRAME_DT;
      this.frames.push({ t: this.t, q: this.q.slice(), pump: this.pump, things: this.things.map((x) => ({ ...x, c: [...x.c] as Mm })), alarm: this.stopped, acc: this.acc, held: this.held });
      this.tip.push(tip);
    }
  }

  /** A joint move; `each` (the holding check) sees the cup's position, velocity (mm/s) and acceleration (m/s²) at every step. */
  moveJ(to: readonly number[], speed: number, each?: (tip: Mm, vel: Mm, acc: Mm) => void): number {
    if (this.stopped) return 0;
    const tr = jointTrajectory(this.q, to, speed);
    const steps = Math.max(1, Math.ceil(tr.durationS / DT));
    const h = 0.004;
    const at = (s: number) => toolAt(this.chain, tr.sample(Math.max(0, Math.min(tr.durationS, s))));
    for (let k = 1; k <= steps; k += 1) {
      const s = (k / steps) * tr.durationS;
      this.t += tr.durationS / steps;
      this.q = tr.sample(s);
      if (each || this.held >= 0) {
        const [a, b, c] = [at(s - h), at(s), at(s + h)];
        const vel: Mm = [(c[0] - a[0]) / (2 * h), (c[1] - a[1]) / (2 * h), (c[2] - a[2]) / (2 * h)];
        // Central difference; at the very ends the profile's own zero acceleration.
        const edge = s - h < 0 || s + h > tr.durationS;
        const acc: Mm = edge ? [0, 0, 0] : [(c[0] - 2 * b[0] + a[0]) / (h * h) / 1000, (c[1] - 2 * b[1] + a[1]) / (h * h) / 1000, (c[2] - 2 * b[2] + a[2]) / (h * h) / 1000];
        this.acc = Math.hypot(acc[0], acc[1]);
        each?.(b, vel, acc);
      } else this.acc = 0;
      this.snap();
    }
    this.acc = 0;
    return tr.durationS;
  }

  wait(s: number): void {
    const end = this.t + s;
    while (this.t < end - 1e-9) {
      this.t = Math.min(end, this.t + DT);
      this.snap();
    }
  }

  /** A piece starts to fall from where it is, moving as the cup moved. */
  letGo(k: number, vel: Mm): Fall {
    const p0 = [...this.things[k].c] as Mm;
    const f = flight(p0, vel);
    const fall = { t0: this.t, p0, v0: vel, ...f };
    this.falls.set(k, fall);
    this.fell.add(k);
    this.things[k].mode = 'falling';
    return fall;
  }
}

/** The bin's drop point for a piece (and what rides on it) hanging `hang` mm below the cup: over its opening, above its rim, mm. */
function dropAt(bin: BinName, hang: number): Mm {
  const b = BINS[bin];
  return [b.drop.x, b.drop.y, b.rimZ + hang + 20];
}

/** The force the cup needs to hold mass M (kg) at acceleration a (m/s²) with lip friction μ: M(g + a_z) + M|a_xy| ÷ μ, N. */
export const needForce = (M: number, acc: Mm, mu: number) => M * (G + acc[2]) + (M * Math.hypot(acc[0], acc[1])) / mu;
/** Sideways acceleration a piece can take on the cup (no up or down): μ(F ÷ m − g), m/s². */
export const sideLimit = (t: Item) => t.mu * (t.holdN / (t.massG / 1000) - G);

/** The piece the cup meets coming down at (x, y): the highest top under its rim. */
export function touched(sim: { list: readonly Item[]; things: readonly PieceState[] }, x: number, y: number): number {
  let best = -1;
  let z = -Infinity;
  sim.list.forEach((t, k) => {
    const s = sim.things[k];
    if (s.mode !== 'board') return;
    const top = s.c[2] + dims(t).h;
    // Any part of the Ø20 rim over the piece.
    if (circleHits(t, s.c, x, y) && top > z) {
      z = top;
      best = k;
    }
  });
  return best;
}
/** Does the cup's rim (a circle of CUP_R at x, y) cover any of the piece's footprint? */
function circleHits(t: Item, c: Mm, x: number, y: number): boolean {
  const d = dims(t);
  if (d.shape === 'disc') return Math.hypot(x - c[0], y - c[1]) < d.sx / 2 + CUP_R;
  const dx = Math.max(Math.abs(x - c[0]) - d.sx / 2, 0);
  const dy = Math.max(Math.abs(y - c[1]) - d.sy / 2, 0);
  return Math.hypot(dx, dy) < CUP_R;
}

interface Plan {
  /** The carry speed for a kind (②), the travel speed otherwise. */
  carry(kind: Kind): number;
  empty: number;
}

/**
 * Take the blob at (x, y), meant to be a `kind` (the program's word): over it, down until the cup
 * touches (the pump's vacuum switch tells it), suck, up, carry to the kind's bin, let go. What it
 * really takes, and what rides along or falls off, the geometry and the forces decide.
 */
function pickPlace(sim: EnergySim, f: Found, plan: Plan): EnergyPick | null {
  const { x, y, kind } = f;
  const name = KIND_NAME[kind];
  const above: Mm = [x, y, APPROACH_Z];
  const a = poseAt(sim.chain, above, sim.q);
  if (!a) {
    sim.fail('unreachable', `${name} 위 (${x.toFixed(0)}, ${y.toFixed(0)})에 손이 닿지 않아요 (작업 중지)`, { at: above });
    return null;
  }
  if (!sim.moveJ(a, plan.empty)) return null;
  const k = touched(sim, x, y);
  const t = k >= 0 ? sim.list[k] : null;
  const s = k >= 0 ? sim.things[k] : null;
  const contact = t && s ? s.c[2] + dims(t).h : 0;
  const b = poseAt(sim.chain, [x, y, contact - (t ? PRESS_MM : 0)], a);
  if (!b) {
    sim.fail('unreachable', `${name}까지 내려가지 못해요 (작업 중지)`, { at: above });
    return null;
  }
  sim.moveJ(b, SPEED.down);
  sim.pump = true;
  sim.wait(0.3);
  // It seals when the whole rim sits on that one top (a millimetre of lip to spare).
  if (!t || !s || !onPiece(t, s.c[0], s.c[1], x, y, CUP_R - 1)) {
    sim.pump = false;
    sim.moveJ(a, SPEED.down);
    sim.fail('miss', t ? `${name}: 흡착 컵이 ${t.name} 가장자리에 걸쳐 공기가 새요. 들지 못했어요` : `${name}: 그 자리에 아무것도 없어 판을 집었어요`, { at: [x, y, contact], thing: k }, false);
    return { meant: f.k, k, speed: 0, aXY: 0, aZ: 0, needN: 0, holdN: t?.holdN ?? 0, dropped: false, riders: [], carryS: 0 };
  }
  sim.held = k;
  sim.heldOff = [x - s.c[0], y - s.c[1]];
  s.mode = 'held';
  // What lies on it comes up with it when its middle is over it; otherwise it slides back down onto the board.
  const riders: number[] = [];
  sim.list.forEach((o, j) => {
    if (o.on !== k || sim.things[j].mode !== 'board') return;
    const c = sim.things[j].c;
    if (onPiece(t, s.c[0], s.c[1], c[0], c[1])) {
      riders.push(j);
      sim.riders.push({ k: j, off: [c[0] - s.c[0], c[1] - s.c[1], dims(t).h] });
      sim.things[j].mode = 'riding';
    } else sim.things[j].c = [c[0], c[1], 0];
  });
  const what = t.name + (f.k === k ? '' : ` (프로그램은 ${name}로 알아요)`);
  sim.log('pick', `${what}: 집었어요${riders.length ? ` · 위에 ${riders.map((j) => sim.list[j].name).join(', ')}이(가) 얹혀 있어요` : ''}`, { at: [x, y, contact], thing: k });
  if (riders.length) sim.log('ride', `${riders.map((j) => sim.list[j].name).join(', ')}이(가) ${t.name} 위에 얹혀 함께 올라가요`, { at: [x, y, contact + 10], thing: riders[0] });

  const pk: EnergyPick = { meant: f.k, k, speed: plan.carry(kind), aXY: 0, aZ: 0, needN: 0, holdN: t.holdN, dropped: false, riders, carryS: 0 };
  // Holding: the cup must give M(g + a_z) + M|a_xy| ÷ μ; riders slide off past μ_piece (g + a_z).
  const hold = (_tip: Mm, vel: Mm, acc: Mm) => {
    if (sim.held !== k) return;
    const axy = Math.hypot(acc[0], acc[1]);
    for (const r of sim.riders.slice()) {
      if (axy > MU_PIECE * (G + acc[2])) {
        sim.riders = sim.riders.filter((x) => x !== r);
        const fl = sim.letGo(r.k, vel);
        sim.log('drop', `${sim.list[r.k].name}이(가) 가속도 ${axy.toFixed(1)} m/s²에 ${t.name} 위에서 미끄러져 ${fl.where}에 떨어졌어요`, { at: fl.land.c, thing: r.k, value: axy });
      }
    }
    const M = (t.massG + sim.riders.reduce((acc2, r) => acc2 + sim.list[r.k].massG, 0)) / 1000;
    const need = needForce(M, acc, t.mu);
    if (axy > pk.aXY) {
      pk.aXY = axy;
      pk.aZ = acc[2];
    }
    if (need > pk.needN) pk.needN = need;
    if (need > t.holdN) {
      pk.dropped = true;
      sim.held = -1;
      const fl = sim.letGo(k, vel);
      for (const r of sim.riders) sim.letGo(r.k, vel);
      sim.riders = [];
      sim.fail('drop', `${t.name}이(가) 흡착 컵에서 떨어졌어요. 가속도 ${axy.toFixed(1)} m/s²에 필요한 힘 ${need.toFixed(2)} N > 붙잡는 힘 ${t.holdN.toFixed(2)} N · ${fl.where}에 떨어짐`, { at: fl.land.c, thing: k, value: axy }, false);
    }
  };
  sim.moveJ(a, SPEED.down, hold);
  if (sim.held !== k) return pk;
  const bin = BIN_OF[kind];
  const hang = dims(t).h + riders.reduce((acc2, j) => acc2 + dims(sim.list[j]).h, 0);
  const d = dropAt(bin, hang);
  const q = poseAt(sim.chain, d, sim.q);
  if (!q) {
    sim.fail('unreachable', `분류함 ${bin} 위에 손이 닿지 않아요 (작업 중지)`, { at: d });
    return pk;
  }
  pk.carryS = sim.moveJ(q, pk.speed, hold);
  if (sim.held !== k) {
    // The program does not know: it lets go over the bin of nothing, and goes on.
    sim.pump = false;
    sim.wait(0.3);
    return pk;
  }
  sim.pump = false;
  sim.held = -1;
  const B = BINS[bin];
  for (const j of [k, ...sim.riders.map((r) => r.k)]) {
    const c = sim.things[j].c;
    sim.things[j] = { c: [B.x + (c[0] - d[0]) * 0.3, B.y + (c[1] - d[1]) * 0.3, B.floorZ], mode: 'binned', bin };
    const own = BIN_OF[sim.list[j].kind] === bin;
    const e = sim.log(own ? 'place' : 'wrong', own ? `${sim.list[j].name} → 분류함 ${bin} (${KIND_NAME[KIND_OF_BIN[bin]]})` : `${sim.list[j].name}이(가) 분류함 ${bin} (${KIND_NAME[KIND_OF_BIN[bin]]})에 섞여 들어갔어요 (제자리는 ${BIN_OF[sim.list[j].kind]})`, {
      at: [B.x, B.y, B.rimZ],
      thing: j,
    });
    // A piece in another kind's bin spoils that bin's load: the run's trouble.
    if (!own) sim.failure ??= e;
  }
  sim.riders = [];
  pk.bin = bin;
  sim.wait(0.3);
  return pk;
}

function finish(sim: EnergySim, values: EnergyValues, found: Found[], tooBig: number, picks: EnergyPick[]): EnergyRun {
  if (!sim.stopped) {
    sim.moveJ(HOME_DEG, SPEED.empty);
    sim.log('done', '작업을 마쳤어요');
  }
  // Let anything still in the air land.
  const flying = [...sim.falls.values()].reduce((m, f) => Math.max(m, f.t0 + f.tLand - sim.t), 0);
  sim.wait(Math.max(0.4, flying + 0.1));
  const L = sim.list;
  const right = sim.things.filter((x, k) => x.mode === 'binned' && x.bin === BIN_OF[L[k].kind]).length;
  const wrong = sim.things.filter((x, k) => x.mode === 'binned' && x.bin !== BIN_OF[L[k].kind]).length;
  const dropped = sim.fell.size;
  const left = sim.things.filter((x) => x.mode === 'board').length;
  return { values, frames: sim.frames, events: sim.events, durationS: sim.t, failure: sim.failure, tip: sim.tip, found, tooBig, picks, right, wrong, dropped, left, of: L.length, perMin: (right / sim.t) * 60 };
}

/** The order the program takes its blobs in. */
export function pickOrder(found: readonly Found[], order: OrderMode): Found[] {
  const r = (f: Found) => Math.hypot(f.x, f.y);
  return found.slice().sort((a, b) => (order === 'area' ? b.area - a.area : order === 'near' ? r(a) - r(b) : b.visible - a.visible || b.area - a.area));
}

/** One job: photo, vision, then every blob in order. */
function runJob(chain: readonly ChainSegment[], list: readonly Item[], vision: VisionValues, order: OrderMode, plan: Plan, values: EnergyValues): EnergyRun {
  const seen = findItems(sortPicture(list), vision, list);
  const sim = new EnergySim(chain, list);
  sim.wait(SEE_S);
  sim.log('see', `사진에서 ${seen.found.length}개를 찾았어요: ${seen.found.map((f) => KIND_NAME[f.kind]).join(' · ') || '없음'}${seen.tooBig ? ` (판만 한 덩어리 ${seen.tooBig}개는 버렸어요)` : ''}`);
  const picks: EnergyPick[] = [];
  for (const f of pickOrder(seen.found, order)) {
    if (sim.stopped) break;
    const pk = pickPlace(sim, f, plan);
    if (pk) picks.push(pk);
  }
  // What the camera never saw stays on the board.
  list.forEach((t, k) => {
    if (sim.things[k].mode === 'board' && !seen.found.some((f) => f.k === k)) sim.fail('left', `${t.name}을(를) 찾지 못해 판에 남겼어요. 재활용되지 못해요`, { thing: k, at: [t.x, t.y, topOf(list, k)] }, false);
  });
  return finish(sim, values, seen.found, seen.tooBig, picks);
}

/** ①③'s program after ①: the bands that find clear PET. */
export const VISION_FIX = ENERGY_FIXES[1] as VisionValues;
const travel: Plan = { carry: () => SPEED.travel, empty: SPEED.travel };

export function runVision(chain: readonly ChainSegment[], v: VisionValues): EnergyRun {
  return runJob(chain, ENERGY_ITEMS[1], v, 'area', travel, v);
}
export function runSpeed(chain: readonly ChainSegment[], v: SpeedValues): EnergyRun {
  return runJob(chain, speedItems(v.canG), VISION_FIX, 'area', { carry: (k) => v[k], empty: SPEED.empty }, v);
}
export function runOrder(chain: readonly ChainSegment[], v: OrderValues): EnergyRun {
  return runJob(chain, ENERGY_ITEMS[3], VISION_FIX, v.order, travel, v);
}

export function runEnergy(chain: readonly ChainSegment[], p: EnergyProblem, v: EnergyValues): EnergyRun {
  return p === 1 ? runVision(chain, v as VisionValues) : p === 2 ? runSpeed(chain, v as SpeedValues) : runOrder(chain, v as OrderValues);
}

/* --- ② without a run: each carry's acceleration and force ---------------------------------- */

/** ②: the carry of each piece at a speed setting (no run): its time, the cup's largest sideways acceleration, and the force the cup needs then vs what it holds. */
export function carryPreview(chain: readonly ChainSegment[], v: SpeedValues) {
  const list = speedItems(v.canG);
  return list.map((t, k) => {
    const above = poseAt(chain, [t.x, t.y, APPROACH_Z])!;
    const d = poseAt(chain, dropAt(BIN_OF[t.kind], dims(t).h), above)!;
    const tr = jointTrajectory(above, d, v[t.kind]);
    let aXY = 0;
    let need = 0;
    const h = 0.004;
    for (let s = h; s <= tr.durationS - h; s += 0.01) {
      const [a, b, c] = [s - h, s, s + h].map((x) => toolAt(chain, tr.sample(x)));
      const acc: Mm = [0, 1, 2].map((i) => (c[i] - 2 * b[i] + a[i]) / (h * h) / 1000) as Mm;
      aXY = Math.max(aXY, Math.hypot(acc[0], acc[1]));
      need = Math.max(need, needForce(t.massG / 1000, acc, t.mu));
    }
    return { k, speed: v[t.kind], carryS: tr.durationS, aXY, needN: need, holdN: t.holdN, limit: sideLimit(t), ok: need <= t.holdN };
  });
}

/** ②: a whole job at one speed for every kind (the curve of sorted per minute against speed). */
export function oneSpeed(chain: readonly ChainSegment[], s: number): EnergyRun {
  return runSpeed(chain, { can: s, clear: s, color: s, pack: s });
}

/* --- 판정 ------------------------------------------------------------------------------------ */

export interface EnergyCheck {
  label: string;
  ok: boolean;
  value: string;
}
export interface EnergyScore {
  pass: boolean;
  checks: EnergyCheck[];
  headline: string;
}

const strip = (s: string) => s.replace(/ \(작업 중지\)$/, '');
/** Sorted right per minute, as shown. */
export const perMinText = (r: EnergyRun) => `${r.perMin.toFixed(1)}개/분`;

export function scoreEnergy(p: EnergyProblem, run: EnergyRun): EnergyScore {
  const stopEv = run.events.find((e) => e.kind === 'unreachable');
  const all: EnergyCheck = { label: `${run.of}개 모두 제 분류함에`, ok: run.right === run.of, value: `${run.right} / ${run.of}` };
  if (p === 1) {
    const checks: EnergyCheck[] = [
      all,
      { label: '판에 남은 것 없음', ok: run.left === 0, value: `${run.left}개` },
      { label: '다른 칸에 섞인 것 없음', ok: run.wrong === 0, value: `${run.wrong}개` },
    ];
    if (stopEv) checks.push({ label: '작업 중지 없음', ok: false, value: strip(stopEv.text) });
    const pass = checks.every((c) => c.ok);
    return { pass, checks, headline: pass ? '투명 PET까지 여섯 개 모두 제 칸에 나눴어요' : run.left ? `${run.left}개를 찾지 못해 판에 남겼어요` : run.failure ? strip(run.failure.text) : `${run.right} / ${run.of}만 제 칸에 들어갔어요` };
  }
  if (p === 2) {
    const checks: EnergyCheck[] = [
      all,
      { label: '떨어뜨린 것 없음', ok: run.dropped === 0, value: `${run.dropped}개` },
      { label: `처리량 ${TARGET_PM}개/분 이상`, ok: run.perMin >= TARGET_PM, value: perMinText(run) },
    ];
    if (stopEv) checks.push({ label: '작업 중지 없음', ok: false, value: strip(stopEv.text) });
    const pass = checks.every((c) => c.ok);
    return {
      pass,
      checks,
      headline: pass ? `떨어뜨리지 않고 처리량 ${perMinText(run)}, 기준 ${TARGET_PM}개/분을 넘었어요` : run.dropped ? `${run.dropped}개를 떨어뜨렸어요 (처리량 ${perMinText(run)})` : `떨어뜨리지는 않았지만 처리량이 ${perMinText(run)}예요 (기준 ${TARGET_PM})`,
    };
  }
  const missed = run.events.filter((e) => e.kind === 'miss').length;
  const checks: EnergyCheck[] = [
    all,
    { label: '다른 칸에 섞인 것 없음', ok: run.wrong === 0, value: `${run.wrong}개` },
    { label: '놓치거나 떨어뜨린 것 없음', ok: missed === 0 && run.dropped === 0 && run.left === 0, value: `${missed + run.dropped + run.left}개` },
  ];
  if (stopEv) checks.push({ label: '작업 중지 없음', ok: false, value: strip(stopEv.text) });
  const pass = checks.every((c) => c.ok);
  return { pass, checks, headline: pass ? '겹친 것도 위에서부터 모두 제 칸에 넣었어요' : run.wrong ? `${run.wrong}개가 다른 칸에 섞여 들어갔어요` : run.failure ? strip(run.failure.text) : '아직 기준을 못 넘었어요' };
}
