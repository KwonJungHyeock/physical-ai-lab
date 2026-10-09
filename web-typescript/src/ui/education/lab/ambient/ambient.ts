'use client';

/**
 * The site's ambient motion (other robots, AGVs, belts, lamps, screens round the cell): on or off for
 * the whole app, remembered in the browser. Off when the computer asks for reduced motion, until the
 * viewer turns it on. Ambient things keep their own clock, which stops while it is off, so they
 * freeze where they are instead of jumping.
 */

import { createContext, useMemo, useSyncExternalStore } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

/** The lesson's robot description, for the arms round the cell (LearnStage provides it). */
export const StageRobot = createContext<{ robot: UrdfRobot; chain: readonly ChainSegment[] } | null>(null);

const KEY = 'edu-ambient';
const subs = new Set<() => void>();
let on = true;
let read = false;

function current(): boolean {
  if (!read && typeof window !== 'undefined') {
    read = true;
    try {
      const v = localStorage.getItem(KEY);
      on = v ? v !== 'off' : !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      on = true;
    }
  }
  return on;
}

export function ambientOn(): boolean {
  return current();
}

export function setAmbient(v: boolean): void {
  current();
  on = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    /* private window: for this visit only */
  }
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export function useAmbient(): boolean {
  return useSyncExternalStore(subscribe, current, () => true);
}

/** The ambient clock of one moving thing (seconds, from `seed`). */
export interface AmbientClock {
  /** Advances by the frame's `dt` while motion is on: the time to draw at, or null to leave the frame as it is. */
  tick(dt: number): number | null;
}

/**
 * A clock for a frame loop: it gives a time on the first frame (so things take their first pose) and
 * then only while ambient motion is on.
 */
export function useAmbientClock(seed = 0): AmbientClock {
  return useMemo(() => new Clock(seed), [seed]);
}

class Clock implements AmbientClock {
  private first = true;
  constructor(private t: number) {}
  tick(dt: number): number | null {
    const live = current();
    if (!live && !this.first) return null;
    this.first = false;
    this.t += live ? Math.min(dt, 0.1) : 0;
    return this.t;
  }
}

/** A closed path through `points` (mm) driven at a steady speed: where along it at time t, and which way it faces. */
export function loopPath(points: readonly (readonly [number, number])[]) {
  const segs = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
  const total = segs.reduce((s, g) => s + g.len, 0);
  return {
    total,
    /** Position and heading (rad) after `s` mm along the loop. */
    at(s: number): { x: number; y: number; yaw: number } {
      let d = ((s % total) + total) % total;
      for (const g of segs) {
        if (d <= g.len) {
          const k = g.len ? d / g.len : 0;
          return { x: g.p[0] + (g.q[0] - g.p[0]) * k, y: g.p[1] + (g.q[1] - g.p[1]) * k, yaw: Math.atan2(g.q[1] - g.p[1], g.q[0] - g.p[0]) };
        }
        d -= g.len;
      }
      const g = segs[0];
      return { x: g.p[0], y: g.p[1], yaw: Math.atan2(g.q[1] - g.p[1], g.q[0] - g.p[0]) };
    },
  };
}

/** Turns `from` toward `to` (rad) by at most `k` of the way, the short way round. */
export function turnToward(from: number, to: number, k: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return from + d * Math.min(1, k);
}

/** Smooth 0 → 1 over [a, b]. */
export const ease = (x: number, a: number, b: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
