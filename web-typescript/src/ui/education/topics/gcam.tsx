'use client';

/**
 * A small virtual camera for the G topics (G1–G3): a pinhole camera with a pose
 * (fixed above the table, or on the hand via the flange frame), a ray caster
 * that "takes a photo" of the table, blocks, markers and the arm (boxes), the
 * pixel ↔ table maths (ray–plane, 4-point homography), and the picture itself
 * as a canvas with an SVG overlay. Deterministic: the same scene gives the same pixels.
 *
 * Camera axes follow OpenCV: x right, y down, z forward (into the scene).
 */

import { useEffect, useRef, type ReactNode } from 'react';

import { HAND_CAMERA } from '@/engine/simulator/board';
import { HAND_CAMERA_MOUNT } from '@/engine/simulator/effectors';
import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import { solve } from '@/engine/physics/linalg';
import { rgbToHsvCv } from '@/engine/vision/color';

import type { Mm } from './kit';

export const IMG_W = 320;
export const IMG_H = 240;

export type Rgb = [number, number, number];

export interface Cam {
  /** Lens position, mm, base frame. */
  pos: Mm;
  /** Camera x (right), y (down), z (forward) axes in the base frame. */
  R: [Mm, Mm, Mm];
  /** Focal length, pixels. */
  f: number;
  w: number;
  h: number;
}

const sub = (a: readonly number[], b: readonly number[]): Mm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): Mm => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: readonly number[]): Mm => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** A camera at `eye` looking at `target`, the top of the picture towards `up`. */
export function lookAt(eye: Mm, target: Mm, up: Mm, f: number, w = IMG_W, h = IMG_H): Cam {
  const z = norm(sub(target, eye));
  const u = sub(up, z.map((c) => c * dot(up, z)));
  const y = norm(u).map((c) => -c) as Mm;
  const x = cross(y, z);
  return { pos: eye, R: [x, y, z], f, w, h };
}

/** Horizontal field of view → focal length in pixels. */
export const focalFor = (hfovDeg: number, w = IMG_W) => w / 2 / Math.tan((hfovDeg * Math.PI) / 360);

/**
 * The hand camera: on the flange as the kit mounts it (HAND_CAMERA_MOUNT: 44.4 mm off the
 * flange axis, 11.6 mm out), looking along the flange axis. Picture right = flange +y,
 * picture up = flange +x (with the tool pointing down, that is away from the robot).
 */
export const HAND_EYE = { offset: [HAND_CAMERA_MOUNT.x, HAND_CAMERA_MOUNT.y, HAND_CAMERA_MOUNT.z] as Mm, hfovDeg: HAND_CAMERA.hfovDeg };

export function handCam(chain: readonly ChainSegment[], q: readonly number[], w = IMG_W, h = IMG_H): Cam {
  const e = forwardKinematicsFrames(chain, q).at(-1)!.elements;
  const fx: Mm = [e[0], e[1], e[2]];
  const fy: Mm = [e[4], e[5], e[6]];
  const fz: Mm = [e[8], e[9], e[10]];
  const o = HAND_EYE.offset;
  const pos: Mm = [0, 1, 2].map((i) => e[12 + i] * 1000 + fx[i] * o[0] + fy[i] * o[1] + fz[i] * o[2]) as Mm;
  return { pos, R: [fy, fx.map((c) => -c) as Mm, fz], f: focalFor(HAND_EYE.hfovDeg, w), w, h };
}

/** Pixel (u, v) where a point appears; null behind the camera. */
export function project(cam: Cam, p: Mm): [number, number] | null {
  const d = sub(p, cam.pos);
  const z = dot(d, cam.R[2]);
  if (z <= 1e-6) return null;
  return [(cam.f * dot(d, cam.R[0])) / z + cam.w / 2, (cam.f * dot(d, cam.R[1])) / z + cam.h / 2];
}

/** The ray through pixel (u, v): unit direction in the base frame. */
export function rayDir(cam: Cam, u: number, v: number): Mm {
  const a = (u - cam.w / 2) / cam.f;
  const b = (v - cam.h / 2) / cam.f;
  return norm([0, 1, 2].map((i) => cam.R[0][i] * a + cam.R[1][i] * b + cam.R[2][i]));
}

/** Where the ray through (u, v) meets the horizontal plane z = planeZ; null if it does not. */
export function toPlane(cam: Cam, u: number, v: number, planeZ = 0): Mm | null {
  const d = rayDir(cam, u, v);
  if (Math.abs(d[2]) < 1e-9) return null;
  const t = (planeZ - cam.pos[2]) / d[2];
  if (t <= 0) return null;
  return [cam.pos[0] + d[0] * t, cam.pos[1] + d[1] * t, planeZ];
}

/** Dashed lines showing what the camera sees: lens → the four picture corners on the table, and the outline. */
export function frustumLines(cam: Cam, color: string, key = 'cam') {
  const corners = [
    [0, 0],
    [cam.w, 0],
    [cam.w, cam.h],
    [0, cam.h],
  ].map(([u, v]) => toPlane(cam, u, v, 0.5));
  if (corners.some((c) => !c)) return [];
  const c = corners as Mm[];
  return [
    { key: `${key}-out`, points: [...c, c[0]], color, width: 1.5 },
    { key: `${key}-rays`, points: c.flatMap((p) => [cam.pos, p]), color, width: 1, dashed: true, segments: true },
  ];
}

/* -------------------------------------------------------------------------- */
/* Homography (4 or more point pairs, h33 = 1)                                 */
/* -------------------------------------------------------------------------- */

/** 3 × 3 homography (row-major) taking pixels to table mm; null when the points are degenerate. */
export function homography(px: readonly (readonly [number, number])[], mm: readonly (readonly [number, number])[]): number[] | null {
  // DLT rows; 4 points give a square system, more are solved by normal equations.
  const rows: number[][] = [];
  const rhs: number[] = [];
  px.forEach(([u, v], i) => {
    const [x, y] = mm[i];
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  });
  const square = rows.length === 8;
  const A = square ? rows : Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => rows.reduce((s, row) => s + row[r] * row[c], 0)));
  const b = square ? rhs : Array.from({ length: 8 }, (_, r) => rows.reduce((s, row, k) => s + row[r] * rhs[k], 0));
  const h = solve(A, b);
  if (!h.every(Number.isFinite)) return null;
  return [...h, 1];
}

export function applyH(H: readonly number[], u: number, v: number): [number, number] {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

/* -------------------------------------------------------------------------- */
/* The scene and the ray caster                                                */
/* -------------------------------------------------------------------------- */

export interface CamBox {
  /** ≥ 1; what a pixel shows (0 = table, −1 = floor). */
  id: number;
  min: Mm;
  max: Mm;
  rgb: Rgb;
}

export interface CamScene {
  boxes: readonly CamBox[];
  /** Square markers on the table (black with a white middle): centre x, y and side, mm. */
  markers?: readonly { at: [number, number]; size: number }[];
}

/** A cube block standing on the table. */
export function cube(id: number, x: number, y: number, rgb: Rgb, size = 25): CamBox {
  return { id, min: [x - size / 2, y - size / 2, 0], max: [x + size / 2, y + size / 2, size], rgb };
}

/** Light grey boxes along the arm from joint `fromJoint` (0-based) to the flange, for what the arm hides. */
export function armBoxes(chain: readonly ChainSegment[], q: readonly number[], fromJoint = 2, r = 17, id = 99): CamBox[] {
  const frames = forwardKinematicsFrames(chain, q);
  const pts: Mm[] = [];
  chain.forEach((seg, i) => {
    if (seg.movableIndex >= fromJoint || i === chain.length - 1) {
      const e = frames[i].elements;
      pts.push([e[12] * 1000, e[13] * 1000, e[14] * 1000]);
    }
  });
  const out: CamBox[] = [];
  for (let k = 1; k < pts.length; k += 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(...sub(pts[k], pts[k - 1])) / 14));
    for (let j = 0; j <= n; j += 1) {
      const p = pts[k - 1].map((c, i) => c + ((pts[k][i] - c) * j) / n);
      out.push({ id, min: [p[0] - r, p[1] - r, p[2] - r], max: [p[0] + r, p[1] + r, p[2] + r], rgb: [206, 210, 216] });
    }
  }
  return out;
}

export interface Shot {
  w: number;
  h: number;
  /** What each pixel shows: box id, 0 table, −1 floor. */
  id: Int16Array;
  /** Shaded colour at light 1, RGB per pixel (may exceed 255 before clamping). */
  rgb: Float32Array;
}

const TABLE = { x0: -420, x1: 780, y0: -400, y1: 400 };
const LIGHT = norm([0.35, 0.25, 1]);
const TOP = 0.45 + 0.55 * LIGHT[2];

const WHITE: Rgb = [245, 245, 245];
const BLACK: Rgb = [28, 28, 30];
const GRID: Rgb = [212, 202, 186];
const PAPER: Rgb = [234, 226, 212];

function tableColor(x: number, y: number, markers: CamScene['markers']): Rgb {
  for (const m of markers ?? []) {
    const dx = Math.abs(x - m.at[0]);
    const dy = Math.abs(y - m.at[1]);
    if (dx <= m.size / 2 && dy <= m.size / 2) return dx <= m.size / 5 && dy <= m.size / 5 ? WHITE : BLACK;
  }
  const gx = Math.abs(((x % 50) + 50) % 50);
  const gy = Math.abs(((y % 50) + 50) % 50);
  const line = gx < 0.8 || gx > 49.2 || gy < 0.8 || gy > 49.2;
  return line ? GRID : PAPER;
}

/** Take the photo: cast one ray per pixel (no allocations in the loop — G3 shoots every frame). */
export function shoot(cam: Cam, scene: CamScene): Shot {
  const { w, h, f } = cam;
  const id = new Int16Array(w * h);
  const rgb = new Float32Array(w * h * 3);
  const [ox, oy, oz] = cam.pos;
  const [X, Y, Z] = cam.R;
  const boxes = scene.boxes;
  const nb = boxes.length;
  const lo = new Float64Array(nb * 3);
  const hi = new Float64Array(nb * 3);
  boxes.forEach((b, k) => {
    for (let a = 0; a < 3; a += 1) {
      lo[k * 3 + a] = b.min[a];
      hi[k * 3 + a] = b.max[a];
    }
  });
  const o = [ox, oy, oz];
  const d = [0, 0, 0];
  for (let v = 0; v < h; v += 1) {
    const b = (v + 0.5 - h / 2) / f;
    for (let u = 0; u < w; u += 1) {
      const a = (u + 0.5 - w / 2) / f;
      d[0] = X[0] * a + Y[0] * b + Z[0];
      d[1] = X[1] * a + Y[1] * b + Z[1];
      d[2] = X[2] * a + Y[2] * b + Z[2];
      let best = Infinity;
      let hit = -1;
      let axis = 2;
      let sign = 1;
      for (let k = 0; k < nb; k += 1) {
        let t0 = -Infinity;
        let t1 = Infinity;
        let ax = 0;
        let sg = 1;
        let k3 = 0;
        for (; k3 < 3; k3 += 1) {
          const dk = d[k3];
          const mn = lo[k * 3 + k3];
          const mx = hi[k * 3 + k3];
          if (dk > -1e-12 && dk < 1e-12) {
            if (o[k3] < mn || o[k3] > mx) break;
            continue;
          }
          let ta = (mn - o[k3]) / dk;
          let tb = (mx - o[k3]) / dk;
          let s = -1;
          if (ta > tb) {
            const tmp = ta;
            ta = tb;
            tb = tmp;
            s = 1;
          }
          if (ta > t0) {
            t0 = ta;
            ax = k3;
            sg = s;
          }
          if (tb < t1) t1 = tb;
          if (t0 > t1) break;
        }
        if (k3 === 3 && t0 > 0 && t0 < best) {
          best = t0;
          hit = k;
          axis = ax;
          sign = sg;
        }
      }
      const i = v * w + u;
      let c0: number;
      let c1: number;
      let c2: number;
      if (hit >= 0) {
        id[i] = boxes[hit].id;
        const shade = (0.45 + 0.55 * Math.max(0, sign * LIGHT[axis])) / TOP;
        const c = boxes[hit].rgb;
        c0 = c[0] * shade;
        c1 = c[1] * shade;
        c2 = c[2] * shade;
      } else if (d[2] < 0) {
        const tt = -oz / d[2];
        const x = ox + d[0] * tt;
        const y = oy + d[1] * tt;
        if (x >= TABLE.x0 && x <= TABLE.x1 && y >= TABLE.y0 && y <= TABLE.y1) {
          id[i] = 0;
          const c = tableColor(x, y, scene.markers);
          c0 = c[0] * 0.97;
          c1 = c[1] * 0.97;
          c2 = c[2] * 0.97;
        } else {
          id[i] = -1;
          c0 = 150;
          c1 = 156;
          c2 = 164;
        }
      } else {
        id[i] = -1;
        c0 = 200;
        c1 = 206;
        c2 = 214;
      }
      rgb[i * 3] = c0;
      rgb[i * 3 + 1] = c1;
      rgb[i * 3 + 2] = c2;
    }
  }
  return { w, h, id, rgb };
}

/** Small fixed per-pixel noise in −0.5..0.5 (a hash, so the same every time). */
function grain(i: number, ch: number) {
  let x = (Math.imul(i * 3 + ch + 1, 2654435761) ^ 0x5bd1e995) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x ^= x >>> 13;
  return (x & 1023) / 1023 - 0.5;
}

/** RGBA pixels at a lighting level (×light), with a little sensor noise. */
export function develop(shot: Shot, light = 1, noise = 8): Uint8ClampedArray {
  const n = shot.w * shot.h;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    for (let ch = 0; ch < 3; ch += 1) out[i * 4 + ch] = shot.rgb[i * 3 + ch] * light + grain(i, ch) * noise;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Centre of a box's top face in the picture — where a detector would put a block (rounded to whole pixels). */
export function topCentrePx(cam: Cam, b: CamBox): [number, number] | null {
  const p = project(cam, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.max[2]]);
  return p ? [Math.round(p[0]), Math.round(p[1])] : null;
}

/* -------------------------------------------------------------------------- */
/* Colour masks and blobs (G2, G3)                                             */
/* -------------------------------------------------------------------------- */

/** Hue in degrees −180..180 (red at 0), saturation and value 0..1 — from the app's OpenCV-unit converter. */
export function hueSatVal(r: number, g: number, b: number): [number, number, number] {
  const [h, s, v] = rgbToHsvCv(r, g, b);
  const deg = h * 2;
  return [deg > 180 ? deg - 360 : deg, s / 255, v / 255];
}

/** Which pixels count as "the colour": an HSV range, or a plain RGB box (R high, G and B low). */
export interface ColorRule {
  mode: 'hsv' | 'rgb';
  hMin: number;
  hMax: number;
  sMin: number;
  vMin: number;
}

/** RGB rule used for comparison: R ≥ 140, G ≤ 90, B ≤ 90 (tuned at normal light). */
export const RGB_RED = { rMin: 140, gMax: 90, bMax: 90 };

export function threshold(rgba: Uint8ClampedArray, rule: ColorRule): Uint8Array {
  const n = rgba.length / 4;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    if (rule.mode === 'rgb') {
      mask[i] = r >= RGB_RED.rMin && g <= RGB_RED.gMax && b <= RGB_RED.bMax ? 1 : 0;
      continue;
    }
    const [h, s, v] = hueSatVal(r, g, b);
    mask[i] = h >= rule.hMin && h <= rule.hMax && s >= rule.sMin && v >= rule.vMin ? 1 : 0;
  }
  return mask;
}

export interface MaskBlob {
  area: number;
  /** Centroid (moments), pixels. */
  u: number;
  v: number;
}

/** Connected regions of the mask (4-neighbours), largest first; specks under `minArea` pixels are dropped. */
export function blobsOf(mask: Uint8Array, w: number, h: number, minArea = 25): MaskBlob[] {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const out: MaskBlob[] = [];
  for (let s0 = 0; s0 < mask.length; s0 += 1) {
    if (!mask[s0] || seen[s0]) continue;
    let area = 0;
    let su = 0;
    let sv = 0;
    seen[s0] = 1;
    stack.push(s0);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      area += 1;
      su += x + 0.5;
      sv += y + 0.5;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (area >= minArea) out.push({ area, u: su / area, v: sv / area });
  }
  return out.sort((a, b) => b.area - a.area);
}

/** The mask as a black-and-white picture. */
export function maskImage(mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const c = mask[i] ? 255 : 18;
    out[i * 4] = c;
    out[i * 4 + 1] = c;
    out[i * 4 + 2] = c;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The picture                                                                 */
/* -------------------------------------------------------------------------- */

/** The camera picture (canvas) with an SVG overlay in pixel units; clicks report (u, v). */
export function CamImage({
  rgba,
  w = IMG_W,
  h = IMG_H,
  onPick,
  caption,
  children,
}: {
  rgba: Uint8ClampedArray;
  w?: number;
  h?: number;
  onPick?: (u: number, v: number) => void;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || rgba.length !== w * h * 4) return;
    const img = ctx.createImageData(w, h);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }, [rgba, w, h]);
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 3 }}>
      <div style={{ position: 'relative', lineHeight: 0 }}>
        <canvas
          ref={ref}
          width={w}
          height={h}
          style={{ width: '100%', height: 'auto', aspectRatio: `${w} / ${h}`, borderRadius: 8, background: '#222', cursor: onPick ? 'crosshair' : 'default', imageRendering: 'pixelated' }}
          onClick={(e) => {
            if (!onPick) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPick(((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h);
          }}
        />
        <svg viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
          {children}
        </svg>
      </div>
      {caption && <figcaption style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.3 }}>{caption}</figcaption>}
    </figure>
  );
}

/** A '+' mark in the picture, with an optional label. */
export function Cross({ u, v, color, size = 9, label }: { u: number; v: number; color: string; size?: number; label?: string }) {
  return (
    <g>
      <line x1={u - size} x2={u + size} y1={v} y2={v} stroke="#fff" strokeWidth={4} />
      <line x1={u} x2={u} y1={v - size} y2={v + size} stroke="#fff" strokeWidth={4} />
      <line x1={u - size} x2={u + size} y1={v} y2={v} stroke={color} strokeWidth={2} />
      <line x1={u} x2={u} y1={v - size} y2={v + size} stroke={color} strokeWidth={2} />
      {label && (
        <text x={u + size + 2} y={v - 4} fontSize={11} fontWeight={700} fill={color} stroke="#fff" strokeWidth={3} paintOrder="stroke">
          {label}
        </text>
      )}
    </g>
  );
}

/** Two images side by side (camera picture and mask). */
export function Pair({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{children}</div>;
}
