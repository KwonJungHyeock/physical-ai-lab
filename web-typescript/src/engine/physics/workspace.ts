/**
 * The arm's workspace: every point the tool can reach within the joint limits.
 *
 * J1 turns the whole arm about the vertical axis, so the workspace is a solid
 * of revolution: sample J2–J4 in the arm's own plane (J1 = 0), keep each tool
 * point's distance from the axis r and height z, and take, row by row in z,
 * the nearest and furthest r. Spinning that outline about the axis over J1's
 * range (±168°) gives the 3D shell drawn on the 교육 and 시뮬레이터 screens.
 */

import { forwardKinematicsFrames, type ChainSegment } from '../robot/kinematics';
import { jointMax, jointMin } from '../robot/limits';

export interface WorkspaceProfile {
  /** Rows of the outline, bottom to top: height (mm) and nearest / furthest distance from the J1 axis (mm). */
  rows: { z: number; rMin: number; rMax: number }[];
  /** Furthest reach (mm) and the height it happens at. */
  reachMm: number;
  reachZ: number;
  /** Highest point (mm). */
  topZ: number;
  /** J1's turning range, degrees. */
  j1Range: [number, number];
  /** Direction the arm reaches at J1 = 0 (degrees from +x, about the J1 axis) — the middle of J1's range. */
  axisDeg: number;
}

/**
 * The workspace outline for a tool point `tcpMm` past the flange, rows `cellMm` tall, above `floorZ`.
 * `limitScale` < 1 narrows every joint's range about 0 (the 교육 screen's "관절 한계를 줄이면").
 */
export function workspaceProfile(chain: readonly ChainSegment[], tcpMm = 0, stepDeg = 4, cellMm = 6, floorZ = 0, limitScale = 1): WorkspaceProfile {
  const lo = jointMin().map((v) => v * limitScale);
  const hi = jointMax().map((v) => v * limitScale);
  const rowsMap = new Map<number, { rMin: number; rMax: number }>();
  let reach = 0;
  let reachZ = 0;
  let axisDeg = 0;
  let top = -Infinity;
  const q = [0, 0, 0, 0, 0, 0];
  for (let a2 = lo[1]; a2 <= hi[1]; a2 += stepDeg) {
    for (let a3 = lo[2]; a3 <= hi[2]; a3 += stepDeg) {
      for (let a4 = lo[3]; a4 <= hi[3]; a4 += stepDeg * 1.5) {
        q[1] = a2;
        q[2] = a3;
        q[3] = a4;
        const frames = forwardKinematicsFrames(chain, q);
        // The arm's own joints must stay above the table too.
        let ok = true;
        for (let i = 2; i < frames.length; i += 1) if (frames[i].elements[14] * 1000 < floorZ) ok = false;
        if (!ok) continue;
        const e = frames[frames.length - 1].elements;
        const x = (e[12] + (e[8] * tcpMm) / 1000) * 1000;
        const y = (e[13] + (e[9] * tcpMm) / 1000) * 1000;
        const z = (e[14] + (e[10] * tcpMm) / 1000) * 1000;
        if (z < floorZ) continue;
        const r = Math.hypot(x, y);
        const row = Math.floor(z / cellMm);
        const cur = rowsMap.get(row);
        if (!cur) rowsMap.set(row, { rMin: r, rMax: r });
        else {
          if (r < cur.rMin) cur.rMin = r;
          if (r > cur.rMax) cur.rMax = r;
        }
        if (r > reach) {
          reach = r;
          reachZ = z;
          axisDeg = (Math.atan2(y, x) * 180) / Math.PI;
        }
        if (z > top) top = z;
      }
    }
  }
  const rows = [...rowsMap.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ z: (k + 0.5) * cellMm, ...v }));
  return { rows, reachMm: reach, reachZ, topZ: top, j1Range: [lo[0], hi[0]], axisDeg };
}

/** Is (r, z) inside the profile? (a quick test for a target, before solving IK) */
export function insideProfile(p: WorkspaceProfile, xMm: number, yMm: number, zMm: number, marginMm = 0): boolean {
  const r = Math.hypot(xMm, yMm);
  const row = p.rows.reduce((best, w) => (Math.abs(w.z - zMm) < Math.abs(best.z - zMm) ? w : best), p.rows[0]);
  if (!row || Math.abs(row.z - zMm) > 12) return false;
  return r <= row.rMax - marginMm && r >= row.rMin + marginMm;
}

/**
 * The outline as one closed polygon in (r, z): up the outer edge, down the inner
 * one. Light smoothing (a 3-row running mean) hides the sampling steps.
 */
export function profileOutline(p: WorkspaceProfile): [number, number][] {
  const smooth = (vals: number[]) => vals.map((_, i) => {
    const w = vals.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((s, v) => s + v, 0) / w.length;
  });
  const outer = smooth(p.rows.map((r) => r.rMax));
  const inner = smooth(p.rows.map((r) => r.rMin));
  const up = p.rows.map((r, i) => [outer[i], r.z] as [number, number]);
  const down = p.rows.map((r, i) => [inner[i], r.z] as [number, number]).reverse();
  return [...up, ...down];
}
