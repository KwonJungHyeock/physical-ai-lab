/**
 * 색 따라가기: the hand camera keeps one colour in the middle of its picture
 * by moving the tool sideways (x, y in the base frame; height and the way the
 * tool points are kept).
 *
 * How the picture moves when the tool moves is measured, not assumed: before
 * following, the arm moves a little along x and along y and watches where the
 * colour goes in the picture. That gives the 2 × 2 "image Jacobian" (pixels
 * per millimetre) for the camera as it is actually mounted — whichever way the
 * camera module was turned on the flange, and at whatever height the tool is —
 * so the real robot and the simulator follow the same way without a hand–eye
 * calibration. Following is then a proportional step towards the centre,
 * limited in size, with a dead zone so the arm rests when the colour is
 * centred.
 *
 * Free of React and the page: tests/robot/track-check.mts runs it on its own.
 */

import type { ColorName } from '../simulator/board';
import { classify, findBlobs, type ImageLike } from './color';

/** Where the colour is in the picture: its centre and size, pixels. */
export interface Seen {
  u: number;
  v: number;
  area: number;
  width: number;
  height: number;
}

/** Pixels the colour moves per millimetre of tool motion: [du/dx, du/dy; dv/dx, dv/dy]. */
export interface ImageJacobian {
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

/** The colour names a camera can follow (the four block colours). */
export const TRACK_COLORS: readonly ColorName[] = ['빨강', '초록', '파랑', '노랑'];

/** The largest patch of one colour (official HSV ranges, as the colour program uses), or null. */
export function findColor(image: ImageLike, color: ColorName): Seen | null {
  const labels = classify(image);
  const blob = findBlobs(labels, image.width, image.height).find((b) => b.color === color);
  if (!blob) return null;
  return { u: blob.cx, v: blob.cy, area: blob.area, width: image.width, height: image.height };
}

/**
 * The image Jacobian from a probe: the colour seen at the start (`base`, the
 * mean of the sightings before and after each probe move), after moving the
 * tool `stepX` mm along x, and after moving it `stepY` mm along y. Null when
 * the picture hardly moved or the two moves look the same way (the colour
 * moved by itself, or the camera does not look down at it).
 */
export function probeJacobian(base: Seen, afterX: Seen, afterY: Seen, stepX: number, stepY: number): ImageJacobian | null {
  const j = {
    ux: (afterX.u - base.u) / stepX,
    vx: (afterX.v - base.v) / stepX,
    uy: (afterY.u - base.u) / stepY,
    vy: (afterY.v - base.v) / stepY,
  };
  // Each move has to shift the picture a clear amount, in clearly different directions.
  const nx = Math.hypot(j.ux, j.vx);
  const ny = Math.hypot(j.uy, j.vy);
  const scale = base.width / 640;
  if (nx * Math.abs(stepX) < 6 * scale || ny * Math.abs(stepY) < 6 * scale) return null;
  const sin = Math.abs(j.ux * j.vy - j.uy * j.vx) / (nx * ny);
  if (sin < 0.5) return null;
  return j;
}

export interface StepOptions {
  /** Share of the error corrected per step (0..1). */
  gain: number;
  /** Largest tool move per step, mm. */
  maxStepMm: number;
  /** Centred enough: no move inside this many pixels (at 640 px width). */
  deadbandPx: number;
}

export const STEP_DEFAULTS: StepOptions = { gain: 0.6, maxStepMm: 10, deadbandPx: 14 };

/** Distance of the colour from the picture's centre, pixels at 640 px width. */
export function offCentre(seen: Seen): number {
  return Math.hypot(seen.u - seen.width / 2, seen.v - seen.height / 2) * (640 / seen.width);
}

/**
 * The tool move (mm, base x and y) that brings the colour towards the centre,
 * or null when it is centred already.
 */
export function stepTowards(j: ImageJacobian, seen: Seen, o: StepOptions = STEP_DEFAULTS): { x: number; y: number } | null {
  if (offCentre(seen) < o.deadbandPx) return null;
  const du = seen.width / 2 - seen.u;
  const dv = seen.height / 2 - seen.v;
  const det = j.ux * j.vy - j.uy * j.vx;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  // Solve J · d = (du, dv) for d, then take a share of it.
  let x = ((j.vy * du - j.uy * dv) / det) * o.gain;
  let y = ((-j.vx * du + j.ux * dv) / det) * o.gain;
  const n = Math.hypot(x, y);
  if (n > o.maxStepMm) {
    x *= o.maxStepMm / n;
    y *= o.maxStepMm / n;
  }
  return { x, y };
}

/**
 * Watches the following: if the colour keeps getting further from the centre
 * although the arm moves towards it, the measured directions are wrong (the
 * colour moved during the probe) and following has to stop.
 */
export class Divergence {
  private worse = 0;
  private last: number | null = null;

  /** Feed the distance from centre after each move; true when it is time to give up. */
  feed(off: number, moved: boolean): boolean {
    if (this.last !== null && moved) {
      if (off > this.last * 1.15 && off > 60) this.worse += 1;
      else this.worse = Math.max(0, this.worse - 1);
    }
    this.last = off;
    return this.worse >= 6;
  }
}
