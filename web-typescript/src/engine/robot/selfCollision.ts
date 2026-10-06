/**
 * The arm against itself: links as capsules between the joint centres (from the arm's own URDF
 * chain), checked pair by pair for links that are not neighbours, each link (but the upper arm,
 * which stands on it) against the robot's base, and the links against the table plane. Used before
 * every move the simulator makes (jog, sliders, poses, programs): a pose that folds the arm into
 * itself or back through its base is refused, with the joint to change and which way.
 *
 * Robot base frame, mm, z up; works for every arm in engine/robot/arms.ts (6 or 4 joints).
 */

import { forwardKinematicsFrames, type ChainSegment } from './kinematics';
import type { ArmFamily, ArmSpec } from './arms';

type V3 = [number, number, number];

export interface Link {
  /** Korean name for the message. */
  name: string;
  a: V3;
  b: V3;
  r: number;
}

export interface SelfHit {
  kind: 'self' | 'base' | 'table';
  /** The two parts that touch (the second is 받침 or 책상 for those kinds). */
  a: string;
  b: string;
  /** How deep, mm (radii minus distance). */
  depth: number;
}

/**
 * Per family: link half-widths along the arm (upper arm, forearm, wrist …), the tool's, and the base
 * as a box around the J1 column (x, y half sizes; top = a little under the shoulder joint).
 * Slightly under the real servo widths: two links only count as touching when they truly overlap.
 */
const GEOMETRY: Record<ArmFamily, { radii: readonly number[]; tool: number; base: { x0: number; x1: number; y: number } }> = {
  mycobot280: { radii: [21, 20, 18, 17], tool: 11, base: { x0: -70, x1: 40, y: 40 } },
  mycobot320: { radii: [28, 26, 22, 20], tool: 12, base: { x0: -60, x1: 55, y: 55 } },
  mecharm270: { radii: [24, 22, 18, 17], tool: 11, base: { x0: -60, x1: 45, y: 48 } },
  mypalletizer260: { radii: [22, 20, 18, 17], tool: 11, base: { x0: -60, x1: 45, y: 50 } },
};

/** Two parts closer than this into each other are touching, mm (the capsules are a simplification). */
export const SELF_SLACK_MM = 3;

const NAMES_6 = ['위팔', '아래팔', '손목', '손목 끝'];
const NAMES_4 = ['위팔', '아래팔', '손목'];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Shortest distance between segments p1-q1 and p2-q2. */
export function segmentDistance(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a < 1e-9 && e < 1e-9) return dist(p1, p2);
  if (a < 1e-9) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = dot(d1, r);
    if (e < 1e-9) s = Math.min(1, Math.max(0, -c / a));
    else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return dist(lerp(p1, q1, s), lerp(p2, q2, t));
}

function pointBox(p: V3, min: V3, max: V3): number {
  const dx = Math.max(min[0] - p[0], 0, p[0] - max[0]);
  const dy = Math.max(min[1] - p[1], 0, p[1] - max[1]);
  const dz = Math.max(min[2] - p[2], 0, p[2] - max[2]);
  return Math.hypot(dx, dy, dz);
}

/** The arm's links for these angles: upper arm, forearm, wrist parts, then the tool (when longer than its own width). */
export function armLinks(chain: readonly ChainSegment[], anglesDeg: readonly number[], family: ArmFamily, tcpMm = 0): { links: Link[]; base: { min: V3; max: V3 } } {
  const g = GEOMETRY[family];
  const frames = forwardKinematicsFrames(chain, anglesDeg);
  const joints: V3[] = [];
  chain.forEach((seg, i) => {
    if (seg.movableIndex >= 0 && !seg.mimic) {
      const e = frames[i].elements;
      joints[seg.movableIndex] = [e[12] * 1000, e[13] * 1000, e[14] * 1000];
    }
  });
  const f = frames[frames.length - 1].elements;
  const flange: V3 = [f[12] * 1000, f[13] * 1000, f[14] * 1000];
  // From the shoulder (J2) on; points closer than 8 mm are one joint (mechArm's J4/J5).
  const pts: V3[] = [];
  for (const p of [...joints.slice(1), flange]) if (p && (!pts.length || dist(pts[pts.length - 1], p) > 8)) pts.push(p);
  const names = joints.length > 4 ? NAMES_6 : NAMES_4;
  const links: Link[] = [];
  for (let k = 0; k + 1 < pts.length; k += 1) links.push({ name: names[Math.min(k, names.length - 1)], a: pts[k], b: pts[k + 1], r: g.radii[Math.min(k, g.radii.length - 1)] });
  if (tcpMm > g.tool * 2) {
    const r = g.tool;
    const dir: V3 = [f[8], f[9], f[10]];
    // From one width out of the flange (the wrist's own servo covers the flange face) to the rounded tip.
    links.push({
      name: '도구',
      a: [flange[0] + dir[0] * r, flange[1] + dir[1] * r, flange[2] + dir[2] * r],
      b: [flange[0] + dir[0] * (tcpMm - r), flange[1] + dir[1] * (tcpMm - r), flange[2] + dir[2] * (tcpMm - r)],
      r,
    });
  }
  const top = (joints[1]?.[2] ?? 120) - 14;
  return { links, base: { min: [g.base.x0, -g.base.y, -1000], max: [g.base.x1, g.base.y, top] } };
}

/**
 * The first place the arm runs into itself in this pose, or null: non-neighbouring links, a link
 * (not the upper arm) in the base, a link's body below the table (z < floorZ; the tool's tip is the
 * simulator's own rule, so the tool is left out here).
 */
export function selfContact(chain: readonly ChainSegment[], anglesDeg: readonly number[], family: ArmFamily, tcpMm = 0, floorZ = 0, slack = SELF_SLACK_MM): SelfHit | null {
  const { links, base } = armLinks(chain, anglesDeg, family, tcpMm);
  for (let i = 0; i < links.length; i += 1) {
    for (let j = i + 2; j < links.length; j += 1) {
      const a = links[i];
      const b = links[j];
      const depth = a.r + b.r - segmentDistance(a.a, a.b, b.a, b.b);
      if (depth > slack) return { kind: 'self', a: b.name, b: a.name, depth };
    }
  }
  for (let i = 1; i < links.length; i += 1) {
    const l = links[i];
    const n = Math.max(2, Math.ceil(dist(l.a, l.b) / 4));
    let worst = -Infinity;
    for (let k = 0; k <= n; k += 1) worst = Math.max(worst, l.r - pointBox(lerp(l.a, l.b, k / n), base.min, base.max));
    if (worst > slack) return { kind: 'base', a: l.name, b: '로봇 받침', depth: worst };
  }
  for (const l of links) {
    if (l.name === '도구') continue;
    // The servo bodies: the centre line's lowest point, less most of the half-width (the flange end is the tool's).
    const depth = floorZ - (Math.min(l.a[2], l.b[2]) - l.r * 0.6);
    if (depth > slack) return { kind: 'table', a: l.name, b: '책상', depth };
  }
  return null;
}

export interface SelfFix {
  /** 0-based joint. */
  joint: number;
  /** The angle to go past, degrees (rounded outward). */
  limitDeg: number;
  /** +1: make it larger than limitDeg; -1: smaller. */
  dir: 1 | -1;
}

/**
 * Which one joint, turned the least, frees the pose (of what selfContact finds): tried 1° at a time
 * both ways within the joint's range, on the bending joints (J2 … the last but one). Null when no
 * single joint within 150° does.
 */
export function selfFix(chain: readonly ChainSegment[], anglesDeg: readonly number[], arm: Pick<ArmSpec, 'family' | 'dof' | 'min' | 'max'>, tcpMm = 0, floorZ = 0): SelfFix | null {
  const { family, min, max } = arm;
  if (!selfContact(chain, anglesDeg, family, tcpMm, floorZ)) return null;
  // J2 .. the last bending joint (J1 turns the whole arm; the last joint spins the tool on its axis).
  const candidates = Array.from({ length: Math.max(0, arm.dof - 2) }, (_, k) => k + 1);
  let best: (SelfFix & { cost: number }) | null = null;
  for (const j of candidates) {
    for (const dir of [1, -1] as const) {
      for (let d = 1; d <= 150; d += 1) {
        if (best && d >= best.cost) break;
        const v = anglesDeg[j] + dir * d;
        if (v > max[j] || v < min[j]) break;
        const q = anglesDeg.slice();
        q[j] = v;
        if (!selfContact(chain, q, family, tcpMm, floorZ)) {
          // Ties: the way back toward 0° (unfolding) first.
          const cost = d + (Math.abs(v) < Math.abs(anglesDeg[j]) ? 0 : 0.5);
          if (!best || cost < best.cost) best = { joint: j, dir, limitDeg: dir > 0 ? Math.ceil(v - 1) : Math.floor(v + 1), cost };
          break;
        }
      }
    }
  }
  return best && { joint: best.joint, limitDeg: best.limitDeg, dir: best.dir };
}

/** "J3 를 -120° 보다 크게 (덜 접히게) 하세요" */
export function fixPhrase(fix: SelfFix, now: number): string {
  const unfold = Math.abs(fix.limitDeg + fix.dir) < Math.abs(now);
  return `J${fix.joint + 1} 를 ${fix.limitDeg}° 보다 ${fix.dir > 0 ? '크게' : '작게'}${unfold ? ' (덜 접히게)' : ''} 하세요`;
}

/** 이 / 가 after a Korean word (by its last syllable's final consonant). */
const subj = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return `${w}${c >= 0 && c < 11172 && c % 28 === 0 ? '가' : '이'}`;
};

/** The notice for a pose that runs into itself: what touches, then the joint to change. */
export function selfMessage(hit: SelfHit, fix: SelfFix | null, anglesDeg: readonly number[]): string {
  const what =
    hit.kind === 'self'
      ? `팔끼리 부딪혀요 — ${subj(hit.a)} ${hit.b}에 닿아요.`
      : hit.kind === 'base'
        ? `팔이 로봇 받침에 부딪혀요 — ${subj(hit.a)} 받침 속으로 들어가요.`
        : `팔이 책상을 뚫고 내려가요 — ${subj(hit.a)} 책상에 닿아요.`;
  return fix ? `${what} ${fixPhrase(fix, anglesDeg[fix.joint])}.` : `${what} 팔을 덜 접히게 해 주세요.`;
}

/** The notice for this pose when it runs into itself, or null when it is free. */
export function selfProblem(chain: readonly ChainSegment[], anglesDeg: readonly number[], arm: Pick<ArmSpec, 'family' | 'dof' | 'min' | 'max'>, tcpMm = 0): string | null {
  const hit = selfContact(chain, anglesDeg, arm.family, tcpMm);
  return hit && selfMessage(hit, selfFix(chain, anglesDeg, arm, tcpMm), anglesDeg);
}
