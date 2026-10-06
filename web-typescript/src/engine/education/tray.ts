/**
 * A block resting on a tray the arm carries in a straight line (교육 C1). The
 * tray follows a time profile; the block is held only by friction, so when the
 * tray accelerates harder than μ·g the block slides, and past the tray's edge it
 * falls. One dimension (along the motion), Coulomb friction, 1 ms steps.
 */

import type { Profile } from '../physics/planning';

export const G_MM = 9810;

export interface TrayOptions {
  /** Static and kinetic friction coefficients (wood on plastic ~0.5 / 0.4). */
  muS?: number;
  muK?: number;
  /** How far the block can slide either way before it drops off, mm. */
  marginMm?: number;
  /** Time to keep simulating after the tray stops, s. */
  afterS?: number;
}

export interface TraySample {
  t: number;
  /** Tray position along the line, mm. */
  tray: number;
  trayV: number;
  trayA: number;
  /** Block position relative to the tray, mm (0 = where it started). */
  rel: number;
}

export interface TrayRun {
  samples: TraySample[];
  durationS: number;
  /** Largest |rel| while on the tray, mm. */
  maxSlideMm: number;
  /** Where the block ended relative to the tray, mm (when it stayed on). */
  finalRelMm: number;
  /** Peak |tray acceleration|, mm/s². */
  peakAccel: number;
  /** When and where (along the line, world) the block fell off, if it did. */
  fell: { t: number; at: number; v: number } | null;
}

export function simulateTray(profile: Profile, o: TrayOptions = {}): TrayRun {
  const muS = o.muS ?? 0.5;
  const muK = o.muK ?? 0.4;
  const margin = o.marginMm ?? 27.5;
  const T = profile.durationS + (o.afterS ?? 0.3);
  const dt = 0.0005;
  const samples: TraySample[] = [];
  let y = profile.sample(0).p;
  let v = 0;
  let stuck = true;
  let maxSlide = 0;
  let peak = 0;
  let fell: TrayRun['fell'] = null;
  let next = 0;
  for (let t = 0; t <= T + 1e-9; t += dt) {
    const s = profile.sample(t);
    const a = t <= profile.durationS ? s.a : 0;
    const vt = t <= profile.durationS ? s.v : 0;
    peak = Math.max(peak, Math.abs(a));
    if (!fell) {
      if (stuck && Math.abs(a) <= muS * G_MM) {
        v = vt;
      } else {
        stuck = false;
        const dir = Math.sign(vt - v);
        const nv = v + dir * muK * G_MM * dt;
        // Friction cannot push the block past the tray's speed: it catches up and sticks.
        if (Math.sign(vt - nv) !== dir || dir === 0) {
          v = vt;
          stuck = Math.abs(a) <= muS * G_MM;
        } else v = nv;
      }
      y += v * dt;
      const rel = y - s.p;
      maxSlide = Math.max(maxSlide, Math.abs(rel));
      if (Math.abs(rel) > margin) fell = { t, at: y, v };
    }
    if (t >= next - 1e-9) {
      samples.push({ t, tray: s.p, trayV: vt, trayA: a, rel: fell ? Math.sign(y - s.p) * (margin + 1) : y - s.p });
      next += 0.005;
    }
  }
  const last = samples[samples.length - 1];
  return { samples, durationS: profile.durationS, maxSlideMm: Math.min(maxSlide, margin), finalRelMm: fell ? NaN : last.rel, peakAccel: peak, fell };
}

/** The sample at time t (nearest at or before). */
export function trayAt(run: TrayRun, t: number): TraySample {
  const i = Math.min(run.samples.length - 1, Math.max(0, Math.floor(t / 0.005)));
  return run.samples[i];
}
