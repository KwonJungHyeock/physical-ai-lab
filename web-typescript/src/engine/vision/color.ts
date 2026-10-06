/**
 * Colour-block detection the way the official AI Kit program does it
 * (elephantrobotics/aikit_V2, AiKit_280PI/scripts/aikit_color.py), step for
 * step, so what students see in the simulator is what the kit's own code does:
 *
 *   1. Find the two ArUco markers (DICT_6X6_250, ids 1 and 2) on the board.
 *      Their midpoint is the board centre; their distance |du| + |dv| in pixels
 *      corresponds to 220 mm, which gives the mm-per-pixel ratio.
 *   2. Crop to the board (the official code crops the frame around the markers).
 *   3. cv2.cvtColor(BGR2HSV) + cv2.inRange with the official HSV ranges.
 *   4. Keep contours whose bounding box is a sensible size; take the largest per colour.
 *   5. Robot coordinates: x = (v - c_v) * ratio + camera_x, y = (u - c_u) * ratio + camera_y.
 *
 * HSV is in OpenCV units (H 0–180, S and V 0–255) so the ranges can be copied
 * between this code and Python unchanged.
 *
 * For the hand camera there are no markers in view; its pixels are mapped by
 * casting the camera ray (pixelToPlane), which is what a hand–eye calibration
 * provides on the real robot.
 */

import { Matrix4, Vector3 } from 'three';

import { ARUCO_6X6, CAL_BOARD, MARKER_SPAN_MM, type ColorName } from '../simulator/board';

/** One official HSV range [C]. `color` is the block colour it sorts as (cyan sorts with blue). */
export interface HsvRange {
  official: string;
  color: ColorName;
  lo: [number, number, number];
  hi: [number, number, number];
}

/** aikit_color.py `self.HSV`, in its dictionary order (the order matters: first match wins). */
export const OFFICIAL_HSV: readonly HsvRange[] = [
  { official: 'yellow', color: '노랑', lo: [11, 85, 70], hi: [59, 255, 245] },
  { official: 'red', color: '빨강', lo: [0, 43, 46], hi: [8, 255, 255] },
  { official: 'green', color: '초록', lo: [35, 43, 35], hi: [90, 255, 255] },
  { official: 'blue', color: '파랑', lo: [100, 43, 46], hi: [124, 255, 255] },
  { official: 'cyan', color: '파랑', lo: [78, 43, 46], hi: [99, 255, 255] },
];

export const COLOR_ORDER: readonly ColorName[] = ['노랑', '빨강', '초록', '파랑'];

export interface ImageLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** cv2.cvtColor(..., COLOR_RGB2HSV) for 8-bit images: H 0–180, S and V 0–255. */
export function rgbToHsvCv(r: number, g: number, b: number): [number, number, number] {
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

export function inRangeCv(hsv: [number, number, number], r: HsvRange): boolean {
  return hsv.every((v, i) => v >= r.lo[i] && v <= r.hi[i]);
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Per-pixel label inside `roi`: 0 = none, k + 1 = OFFICIAL_HSV[k].
 * Like the official loop, a pixel takes the first range it falls in.
 */
export function classify(image: ImageLike, roi?: Rect): Uint8Array {
  const { data, width, height } = image;
  const labels = new Uint8Array(width * height);
  const r = roi ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  for (let y = Math.max(0, r.y0); y <= Math.min(height - 1, r.y1); y += 1) {
    for (let x = Math.max(0, r.x0); x <= Math.min(width - 1, r.x1); x += 1) {
      const i = y * width + x;
      const hsv = rgbToHsvCv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      for (let k = 0; k < OFFICIAL_HSV.length; k += 1) {
        if (inRangeCv(hsv, OFFICIAL_HSV[k])) {
          labels[i] = k + 1;
          break;
        }
      }
    }
  }
  return labels;
}

export interface Blob {
  color: ColorName;
  official: string;
  area: number;
  /** Centre of the bounding box, pixels — the point the official code uses. */
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Connected regions of one label (4-connectivity). The official size filter:
 * the shorter side of the bounding box must be between 1/10 of the cropped
 * image's shorter side and that whole side. Largest region per colour wins.
 */
export function findBlobs(labels: Uint8Array, width: number, height: number, roi?: Rect): Blob[] {
  const r = roi ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  const roiMin = Math.min(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1);
  const seen = new Uint8Array(labels.length);
  const stack: number[] = [];
  const best = new Map<ColorName, Blob>();

  for (let start = 0; start < labels.length; start += 1) {
    const label = labels[start];
    if (!label || seen[start]) continue;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % width;
      const y = (i - x) / width;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      for (const n of nb) {
        if (n >= 0 && !seen[n] && labels[n] === label) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const side = Math.min(x1 - x0 + 1, y1 - y0 + 1);
    if (side <= roiMin / 10 || side >= roiMin) continue;
    const range = OFFICIAL_HSV[label - 1];
    const blob: Blob = { color: range.color, official: range.official, area, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1 };
    const prev = best.get(blob.color);
    if (!prev || prev.area < blob.area) best.set(blob.color, blob);
  }
  return [...best.values()].sort((a, b) => b.area - a.area);
}

/* -------------------------------------------------------------------------- */
/* ArUco markers                                                              */
/* -------------------------------------------------------------------------- */

export interface Marker {
  id: number;
  /** Centre, pixels. */
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function gray(data: ImageLike['data'], i: number): number {
  return 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
}

const ROTATIONS = (() => {
  const rot = (bits: string) => {
    let out = '';
    for (let r = 0; r < 6; r += 1) for (let c = 0; c < 6; c += 1) out += bits[(5 - c) * 6 + r];
    return out;
  };
  const table: { id: number; bits: string }[] = [];
  for (const [id, code] of Object.entries(ARUCO_6X6)) {
    let b = code;
    for (let k = 0; k < 4; k += 1) {
      table.push({ id: Number(id), bits: b });
      b = rot(b);
    }
  }
  return table;
})();

/**
 * Find ArUco 6x6 markers: dark square regions whose 8 x 8 cell grid has a dark
 * border and an inner pattern matching the dictionary (any of 4 rotations).
 * Assumes the camera looks straight at the board, as the kit's does.
 */
export function detectMarkers(image: ImageLike): Marker[] {
  const { data, width, height } = image;
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) dark[i] = gray(data, i) < 90 ? 1 : 0;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const found: Marker[] = [];
  for (let start = 0; start < dark.length; start += 1) {
    if (!dark[start] || seen[start]) continue;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % width;
      const y = (i - x) / width;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      for (const n of nb) {
        if (n >= 0 && !seen[n] && dark[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < 14 || h < 14 || Math.abs(w - h) > 0.25 * Math.max(w, h) || area < 0.3 * w * h) continue;
    // A small marker (a wide camera sees ~20 px) has anti-aliased edges: the
    // pixel row just outside the dark region is partly covered. Place each edge
    // at sub-pixel precision from how dark that row is, and read the cells
    // against the marker's own black and white levels (OpenCV thresholds
    // locally too).
    const at = (x: number, y: number) => gray(data, Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x)));
    let black = 255;
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) black = Math.min(black, at(x, y));
    let white = 0;
    for (let x = x0 - 2; x <= x1 + 2; x += 1) white = Math.max(white, at(x, y0 - 2), at(x, y1 + 2));
    for (let y = y0 - 2; y <= y1 + 2; y += 1) white = Math.max(white, at(x0 - 2, y), at(x1 + 2, y));
    if (white - black < 60) continue;
    const coverage = (sum: number, n: number) => Math.min(1, Math.max(0, (white - sum / n) / (white - black)));
    const rowMean = (y: number) => {
      let s = 0;
      for (let x = x0; x <= x1; x += 1) s += at(x, y);
      return coverage(s, w);
    };
    const colMean = (x: number) => {
      let s = 0;
      for (let y = y0; y <= y1; y += 1) s += at(x, y);
      return coverage(s, h);
    };
    const left = x0 - colMean(x0 - 1);
    const right = x1 + 1 + colMean(x1 + 1);
    const top = y0 - rowMean(y0 - 1);
    const bottom = y1 + 1 + rowMean(y1 + 1);
    const mid = (black + white) / 2;
    // Bilinear sample at a sub-pixel point (pixel centres at +0.5).
    const sample = (fx: number, fy: number) => {
      const x = fx - 0.5;
      const y = fy - 0.5;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const tx = x - xi;
      const ty = y - yi;
      return (
        at(xi, yi) * (1 - tx) * (1 - ty) + at(xi + 1, yi) * tx * (1 - ty) + at(xi, yi + 1) * (1 - tx) * ty + at(xi + 1, yi + 1) * tx * ty
      );
    };
    const cell = (r: number, c: number) => {
      const fx = left + ((c + 0.5) * (right - left)) / 8;
      const fy = top + ((r + 0.5) * (bottom - top)) / 8;
      return sample(fx, fy) < mid ? 0 : 1;
    };
    let border = true;
    for (let k = 0; k < 8 && border; k += 1) border = !cell(0, k) && !cell(7, k) && !cell(k, 0) && !cell(k, 7);
    if (!border) continue;
    let bits = '';
    for (let r = 1; r <= 6; r += 1) for (let c = 1; c <= 6; c += 1) bits += cell(r, c);
    const match = ROTATIONS.find((t) => t.bits === bits);
    if (match) found.push({ id: match.id, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, x0, y0, x1, y1 });
  }
  return found.sort((a, b) => a.id - b.id);
}

export interface BoardCalibration {
  markers: [Marker, Marker];
  /** Midpoint of the two markers, pixels. */
  cu: number;
  cv: number;
  /** Millimetres per pixel: 220 / (|du| + |dv|). */
  ratio: number;
  /** Search area: the board, as the official code crops it. */
  roi: Rect;
}

/** The official calibration from two markers; null unless both are seen. */
export function calibrateFromMarkers(markers: readonly Marker[], width: number, height: number): BoardCalibration | null {
  if (markers.length < 2) return null;
  const [a, b] = markers;
  const du = Math.abs(a.cx - b.cx);
  const dv = Math.abs(a.cy - b.cy);
  if (du + dv < 1) return null;
  // Crop: the square spanned by the markers, grown by one marker size — the whole board.
  const pad = Math.max(a.x1 - a.x0, b.x1 - b.x0);
  const roi = {
    x0: Math.max(0, Math.round(Math.min(a.x0, b.x0) - pad)),
    y0: Math.max(0, Math.round(Math.min(a.y0, b.y0) - pad)),
    x1: Math.min(width - 1, Math.round(Math.max(a.x1, b.x1) + pad)),
    y1: Math.min(height - 1, Math.round(Math.max(a.y1, b.y1) + pad)),
  };
  return { markers: [a, b], cu: (a.cx + b.cx) / 2, cv: (a.cy + b.cy) / 2, ratio: MARKER_SPAN_MM / (du + dv), roi };
}

/** Official pixel -> robot conversion (get_position in aikit_color.py). camera_x/y = board centre. */
export function officialToRobot(cal: BoardCalibration, u: number, v: number): { x: number; y: number } {
  return { x: (v - cal.cv) * cal.ratio + CAL_BOARD.x, y: (u - cal.cu) * cal.ratio + CAL_BOARD.y };
}

export interface KitDetection {
  labels: Uint8Array;
  calibration: BoardCalibration | null;
  markers: Marker[];
  blobs: (Blob & { robot: { x: number; y: number } | null })[];
}

/** The whole official pipeline on one overhead frame. */
export function detectKit(image: ImageLike): KitDetection {
  const markers = detectMarkers(image);
  const calibration = calibrateFromMarkers(markers, image.width, image.height);
  const roi = calibration?.roi;
  const labels = classify(image, roi);
  const blobs = findBlobs(labels, image.width, image.height, roi).map((b) => ({
    ...b,
    robot: calibration ? officialToRobot(calibration, b.cx, b.cy) : null,
  }));
  return { labels, calibration, markers, blobs };
}

/* -------------------------------------------------------------------------- */
/* Pinhole camera (hand camera)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Pinhole camera looking down its local -Z with +X right and +Y up (the three.js
 * camera convention). `cameraToWorld` maps camera coordinates to the robot base
 * frame, in millimetres. `fovDeg` is the vertical field of view.
 */
export interface PinholeCamera {
  cameraToWorld: Matrix4;
  fovDeg: number;
  width: number;
  height: number;
}

/** Board position (mm) seen at pixel (u, v), on the horizontal plane z = planeZMm. */
export function pixelToPlane(camera: PinholeCamera, u: number, v: number, planeZMm: number): { x: number; y: number } | null {
  const f = camera.height / 2 / Math.tan((camera.fovDeg * Math.PI) / 360);
  const dirCam = new Vector3(u + 0.5 - camera.width / 2, -(v + 0.5 - camera.height / 2), -f);
  const origin = new Vector3().setFromMatrixPosition(camera.cameraToWorld);
  const dir = dirCam.transformDirection(camera.cameraToWorld);
  if (Math.abs(dir.z) < 1e-9) return null;
  const t = (planeZMm - origin.z) / dir.z;
  if (t <= 0) return null;
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
}

/** The inverse: pixel where a point appears (for overlays and tests). */
export function planeToPixel(camera: PinholeCamera, p: { x: number; y: number; z: number }): { u: number; v: number } | null {
  const f = camera.height / 2 / Math.tan((camera.fovDeg * Math.PI) / 360);
  const local = new Vector3(p.x, p.y, p.z).applyMatrix4(new Matrix4().copy(camera.cameraToWorld).invert());
  if (local.z >= 0) return null;
  return {
    u: (local.x * f) / -local.z + camera.width / 2 - 0.5,
    v: -(local.y * f) / -local.z + camera.height / 2 - 0.5,
  };
}
