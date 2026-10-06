/**
 * 단원 5 경로계획: where to go (a collision-free path) and how fast (a time profile).
 *
 * Path: RRT-Connect in joint space. Two trees, one from the start and one from
 * the goal, grow towards random poses and towards each other; every new branch
 * is collision-checked. When they meet, the path is the two branches joined,
 * then shortened by cutting corners wherever the straight cut is also free.
 *
 * Time: a move of distance D (any unit) with a speed limit v and an
 * acceleration limit a, as a trapezoid (accelerate, cruise, brake — the fastest
 * within the limits, but with jumps in acceleration) or a quintic (smooth
 * everywhere, as the simulator's moves are, but slower at the same peak speed).
 */

import { jointMax, jointMin, JOINT_COUNT } from '../robot/limits';

/* -------------------------------------------------------------------------- */
/* Time profiles                                                              */
/* -------------------------------------------------------------------------- */

export interface ProfileSample {
  /** 0..D */
  p: number;
  v: number;
  a: number;
}

export interface Profile {
  kind: 'trapezoid' | 'quintic';
  durationS: number;
  sample(tS: number): ProfileSample;
}

/** Fastest move of `dist` with |v| ≤ vMax and |a| ≤ aMax (a triangle when there is no room to cruise). */
export function trapezoid(dist: number, vMax: number, aMax: number): Profile {
  const D = Math.abs(dist);
  const sgn = Math.sign(dist) || 1;
  let ta = vMax / aMax;
  let vp = vMax;
  if (aMax * ta * ta > D) {
    ta = Math.sqrt(D / aMax);
    vp = aMax * ta;
  }
  const tc = D > 0 ? (D - aMax * ta * ta) / vp : 0;
  const T = 2 * ta + Math.max(0, tc);
  return {
    kind: 'trapezoid',
    durationS: T,
    sample(t) {
      const s = Math.min(Math.max(t, 0), T);
      let p: number;
      let v: number;
      let a: number;
      if (s < ta) {
        a = aMax;
        v = aMax * s;
        p = 0.5 * aMax * s * s;
      } else if (s < ta + tc) {
        a = 0;
        v = vp;
        p = 0.5 * aMax * ta * ta + vp * (s - ta);
      } else {
        const r = T - s;
        a = s >= T ? 0 : -aMax;
        v = aMax * r;
        p = D - 0.5 * aMax * r * r;
      }
      return { p: p * sgn, v: v * sgn, a: a * sgn };
    },
  };
}

/** Quintic (minimum-jerk) move taking `durationS`; peak speed 1.875·D/T, peak acceleration 5.77·D/T². */
export function quinticProfile(dist: number, durationS: number): Profile {
  const T = Math.max(1e-6, durationS);
  return {
    kind: 'quintic',
    durationS: T,
    sample(t) {
      const u = Math.min(Math.max(t / T, 0), 1);
      return {
        p: dist * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5),
        v: (dist * (30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4)) / T,
        a: (dist * (60 * u - 180 * u ** 2 + 120 * u ** 3)) / (T * T),
      };
    },
  };
}

/** The quintic that respects the same limits as `trapezoid(dist, vMax, aMax)`. */
export function quinticWithin(dist: number, vMax: number, aMax: number): Profile {
  const D = Math.abs(dist);
  const T = Math.max((1.875 * D) / vMax, Math.sqrt((5.7735 * D) / aMax), 1e-3);
  return quinticProfile(dist, T);
}

/* -------------------------------------------------------------------------- */
/* RRT-Connect                                                                */
/* -------------------------------------------------------------------------- */

export type Q = number[];

export interface TreeNode {
  q: Q;
  parent: number;
}

export interface PlanResult {
  ok: boolean;
  /** Raw path (start ... goal) and after corner cutting. */
  raw: Q[];
  path: Q[];
  /** Both trees, for drawing how the search spread. */
  trees: [TreeNode[], TreeNode[]];
  iterations: number;
  /** Poses collision-checked. */
  checks: number;
}

export interface PlanOptions {
  /** Joints the planner may move (others stay as in `start`); default J1–J5. */
  joints?: number[];
  /** Branch length, degrees (largest joint change). */
  stepDeg?: number;
  maxIterations?: number;
  /** Edge check resolution, degrees. */
  checkDeg?: number;
  rng?: () => number;
}

const dist = (a: Q, b: Q) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** Small deterministic PRNG (mulberry32), so a lesson's demo plans the same way every time. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plan a collision-free joint path from `start` to `goal`. `free(q)` says
 * whether a pose is clear (it is called a lot — keep it cheap).
 */
export function rrtConnect(start: Q, goal: Q, free: (q: Q) => boolean, opts: PlanOptions = {}): PlanResult {
  const joints = opts.joints ?? [0, 1, 2, 3, 4];
  const step = opts.stepDeg ?? 12;
  const checkDeg = opts.checkDeg ?? 3;
  const maxIt = opts.maxIterations ?? 3000;
  const rng = opts.rng ?? mulberry32(7);
  let checks = 0;
  const isFree = (q: Q) => {
    checks += 1;
    return free(q);
  };
  const edgeFree = (a: Q, b: Q) => {
    const n = Math.max(1, Math.ceil(dist(a, b) / checkDeg));
    for (let k = 1; k <= n; k += 1) if (!isFree(a.map((v, i) => v + ((b[i] - v) * k) / n))) return false;
    return true;
  };
  const trees: [TreeNode[], TreeNode[]] = [[{ q: start.slice(), parent: -1 }], [{ q: goal.slice(), parent: -1 }]];
  const result = (ok: boolean, raw: Q[], iterations: number): PlanResult => ({
    ok,
    raw,
    path: ok ? shortcut(raw, edgeFree, rng) : raw,
    trees,
    iterations,
    checks,
  });
  if (!isFree(start) || !isFree(goal)) return result(false, [], 0);
  if (edgeFree(start, goal)) return result(true, [start.slice(), goal.slice()], 0);

  const nearest = (t: TreeNode[], q: Q) => {
    let best = 0;
    let bd = Infinity;
    t.forEach((n, i) => {
      const d = dist(n.q, q);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const steer = (from: Q, to: Q) => {
    const d = dist(from, to);
    if (d <= step) return to.slice();
    return from.map((v, i) => v + ((to[i] - v) * step) / d);
  };
  /** Grow `t` one step towards q; 'reached' | 'advanced' | 'trapped'. */
  const extend = (t: TreeNode[], q: Q): ['reached' | 'advanced' | 'trapped', number] => {
    const ni = nearest(t, q);
    const nq = steer(t[ni].q, q);
    if (!edgeFree(t[ni].q, nq)) return ['trapped', -1];
    t.push({ q: nq, parent: ni });
    return [dist(nq, q) < 1e-6 ? 'reached' : 'advanced', t.length - 1];
  };
  const connect = (t: TreeNode[], q: Q): ['reached' | 'advanced' | 'trapped', number] => {
    let s: ['reached' | 'advanced' | 'trapped', number] = ['advanced', -1];
    for (let k = 0; k < 200 && s[0] === 'advanced'; k += 1) s = extend(t, q);
    return s;
  };
  const branch = (t: TreeNode[], i: number) => {
    const out: Q[] = [];
    for (let k = i; k >= 0; k = t[k].parent) out.push(t[k].q);
    return out;
  };

  let a = 0;
  for (let it = 1; it <= maxIt; it += 1) {
    const q = start.slice();
    for (const j of joints) q[j] = jointMin()[j] + rng() * (jointMax()[j] - jointMin()[j]);
    for (let j = 0; j < JOINT_COUNT; j += 1) if (!joints.includes(j)) q[j] = start[j] + (goal[j] - start[j]) * rng();
    const [sa, ia] = extend(trees[a], q);
    if (sa !== 'trapped') {
      const [sb, ib] = connect(trees[1 - a], trees[a][ia].q);
      if (sb === 'reached') {
        const fromA = branch(trees[a], ia).reverse();
        const fromB = branch(trees[1 - a], ib);
        const joined = [...fromA, ...fromB.slice(1)];
        return result(true, a === 0 ? joined : joined.reverse(), it);
      }
    }
    a = 1 - a;
  }
  return result(false, [], maxIt);
}

/** Cut corners: replace a stretch with the straight move wherever that is also free (random pairs, then a final pass). */
export function shortcut(path: Q[], edgeFree: (a: Q, b: Q) => boolean, rng: () => number = Math.random, tries = 120): Q[] {
  let p = path.map((q) => q.slice());
  for (let k = 0; k < tries && p.length > 2; k += 1) {
    const i = Math.floor(rng() * (p.length - 2));
    const j = i + 2 + Math.floor(rng() * (p.length - i - 2));
    if (j < p.length && edgeFree(p[i], p[j])) p = [...p.slice(0, i + 1), ...p.slice(j)];
  }
  return p;
}

/** Length of a joint path, degrees (sum of the largest joint change per stretch). */
export function pathLengthDeg(path: Q[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i += 1) s += dist(path[i - 1], path[i]);
  return s;
}
