/**
 * How the arm moves under pymycobot commands, in simulated time.
 *
 * send_angles returns at once and the arm travels on its own (the real
 * controller runs in "fresh mode" — a new command replaces the one in
 * progress, starting from wherever the arm is). The same model answers
 * get_angles while the Python program runs and drives the 3D arm when the run
 * is played back, so what the program read and what is shown always agree.
 * Moves follow the real arm's measured timing (armTrajectory), and after stop() the arm runs on a
 * little, as the real one does (about 3° from speed 10).
 */

import { armTrajectory, coastTrajectory, type Trajectory } from '../robot/motion';

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
    this.seg = { t0: t, traj: armTrajectory(from, to, speed) };
    return t + this.seg.traj.durationS;
  }

  stop(t: number): void {
    const here = this.at(t);
    if (!this.moving(t)) {
      this.rest = here;
      this.seg = null;
      return;
    }
    // Its velocity now (°/s), then slowing down from it.
    const dt = 0.01;
    const ahead = this.at(t + dt);
    const coast = coastTrajectory(
      here,
      here.map((q, i) => (ahead[i] - q) / dt),
    );
    this.rest = coast.end.slice();
    this.seg = { t0: t, traj: coast };
  }

  /** Time the last move ends (0 when nothing moved). */
  endTime(): number {
    return this.seg ? this.seg.t0 + this.seg.traj.durationS : 0;
  }
}
