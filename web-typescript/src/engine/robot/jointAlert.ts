/**
 * One judgement per joint, shared by every view that warns: the 3D arm paints that joint's housing,
 * the mini arm and its angle chip turn the same colour, with the same reason. Two causes:
 * the motor's estimated load (gravity + acceleration torque ÷ the torque it is rated for,
 * engine/physics/dynamics.ts, myCobot 280 link masses only) and how close the joint is to its limit.
 */

import { inverseDynamics, torqueLimits } from '../physics/dynamics';
import type { ChainSegment } from './kinematics';
import { jointMax, jointMin } from './limits';

/** 0 = fine, 1 = caution (amber), 2 = danger (red). */
export type AlertLevel = 0 | 1 | 2;

export interface JointAlert {
  level: AlertLevel;
  /** Estimated motor load, percent of rated torque; null when not estimated. */
  loadPct: number | null;
  /** Degrees left before the nearer limit. */
  roomDeg: number;
  /** A few words for the chip, e.g. "부하 82%" or "한계까지 3°"; '' when fine. */
  why: string;
}

export const LOAD_WARN_PCT = 60;
export const LOAD_DANGER_PCT = 80;
export const ROOM_WARN_DEG = 10;
export const ROOM_DANGER_DEG = 3;

export function judge(loadPct: number | null, roomDeg: number): JointAlert {
  const byLoad: AlertLevel = loadPct === null ? 0 : loadPct >= LOAD_DANGER_PCT ? 2 : loadPct >= LOAD_WARN_PCT ? 1 : 0;
  const byRoom: AlertLevel = roomDeg < ROOM_DANGER_DEG ? 2 : roomDeg < ROOM_WARN_DEG ? 1 : 0;
  const level = Math.max(byLoad, byRoom) as AlertLevel;
  const why = !level ? '' : byLoad >= byRoom && loadPct !== null ? `부하 ${Math.round(loadPct)}%` : `한계까지 ${Math.max(0, roomDeg).toFixed(0)}°`;
  return { level, loadPct, roomDeg, why };
}

/**
 * Follows the arm frame by frame (joint speeds and accelerations from the angles, smoothed like the
 * monitor's) and judges every joint. `withLoad` false (an arm without link masses): limits only.
 */
export class AlertTracker {
  private limits: number[];
  private last: { t: number; q: number[] } | null = null;
  private qd: number[];
  private qdd: number[];
  alerts: JointAlert[];

  constructor(
    private chain: readonly ChainSegment[],
    private tcpMm: number,
    private withLoad: boolean,
    private dof: number,
  ) {
    // The load model is the myCobot 280's: given another arm's chain (for a moment while the 3D view
    // swaps models) it cannot be worked out, and the limits are judged alone.
    try {
      this.limits = withLoad ? torqueLimits(chain, tcpMm) : [];
    } catch {
      this.limits = [];
    }
    if (this.limits.length < dof || this.limits.some((l) => !Number.isFinite(l))) this.withLoad = false;
    this.qd = new Array(dof).fill(0);
    this.qdd = new Array(dof).fill(0);
    this.alerts = Array.from({ length: dof }, () => judge(null, 180));
  }

  update(tS: number, q: readonly number[], payloadKg = 0): JointAlert[] {
    const last = this.last;
    if (last && tS - last.t > 0.03) {
      const dt = tS - last.t;
      const k = Math.min(1, dt / 0.12);
      const v = q.map((a, i) => (a - last.q[i]) / dt);
      const acc = v.map((x, i) => (x - this.qd[i]) / dt);
      this.qd = this.qd.map((x, i) => x + (v[i] - x) * k);
      this.qdd = this.qdd.map((x, i) => x + (acc[i] - x) * k * 0.5);
      this.last = { t: tS, q: q.slice() };
    } else if (!last) this.last = { t: tS, q: q.slice() };
    else return this.alerts;
    const tau = this.withLoad ? inverseDynamics(this.chain, q, this.qd, this.qdd, { payloadKg, tcpMm: this.tcpMm }) : null;
    const lo = jointMin();
    const hi = jointMax();
    this.alerts = q.slice(0, this.dof).map((a, i) => judge(tau ? Math.min(100, (Math.abs(tau[i]) / this.limits[i]) * 100) : null, Math.min(a - lo[i], hi[i] - a)));
    return this.alerts;
  }
}
