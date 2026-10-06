/**
 * How the arm moves under pymycobot commands, in simulated time.
 *
 * send_angles returns at once and the arm travels on its own (the real
 * controller runs in "fresh mode" — a new command replaces the one in
 * progress, starting from wherever the arm is). The same model answers
 * get_angles while the Python program runs and drives the 3D arm when the run
 * is played back, so what the program read and what is shown always agree.
 */

import { jointTrajectory, type Trajectory } from '../robot/motion';

export class ArmModel {
  private rest: number[];
  private seg: { t0: number; traj: Trajectory } | null = null;

  constructor(start: readonly number[]) {
    this.rest = start.slice();
  }

  /** Joint angles, degrees, at time t (seconds since the program started). */
  at(t: number): number[] {
    if (!this.seg) return this.rest.slice();
    const u = t - this.seg.t0;
    if (u >= this.seg.traj.durationS) return this.seg.traj.end.slice();
    return this.seg.traj.sample(Math.max(0, u));
  }

  moving(t: number): boolean {
    return this.seg !== null && t - this.seg.t0 < this.seg.traj.durationS;
  }

  /** Start a joint move at time t; returns when it will arrive. */
  move(t: number, to: readonly number[], speed: number): number {
    const from = this.at(t);
    this.seg = { t0: t, traj: jointTrajectory(from, to, speed) };
    return t + this.seg.traj.durationS;
  }

  stop(t: number): void {
    this.rest = this.at(t);
    this.seg = null;
  }

  /** Time the last move ends (0 when nothing moved). */
  endTime(): number {
    return this.seg ? this.seg.t0 + this.seg.traj.durationS : 0;
  }
}
