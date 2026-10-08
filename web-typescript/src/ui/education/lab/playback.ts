/**
 * Playback of a lab run for the 3D view: the time, whether it plays, and the arm pose the frame
 * loop hands to LearnStage (`arm`, read as its `live` ref). One object the screen keeps; the frame
 * loop (ConveyorCell) calls `advance` every frame.
 */

import { frameAt, type Frame, type LabRun } from '@/engine/education/lab/run';

import type { LiveArm } from '../stage/LearnStage';

export class Playback {
  run: LabRun | null = null;
  t = 0;
  playing = false;
  /** 1 = real time. */
  rate = 1;
  /** Boxes to show when there is no run. */
  still: Frame['boxes'] | null = null;
  /** The arm as the run has it now (null: the scene's own pose). */
  readonly arm: { current: LiveArm | null } = { current: null };
  /** Called about ten times a second while playing, and at the end. */
  onTick: ((t: number, done: boolean) => void) | null = null;
  private lastTick = 0;

  /** Who hears the ticks (one listener: the screen). */
  listen(fn: ((t: number, done: boolean) => void) | null): void {
    this.onTick = fn;
  }

  setStill(boxes: Frame['boxes'] | null): void {
    this.still = boxes;
  }

  /** Show `run` from time `at` (or its end), playing on unless at the end. */
  start(run: LabRun | null, at: number | 'end' = 0, rate = 1): void {
    this.run = run;
    this.rate = rate;
    this.t = run ? (at === 'end' ? run.durationS : Math.min(at, run.durationS)) : 0;
    this.playing = !!run && this.t < run.durationS;
    this.lastTick = this.t;
  }

  /** Move on by `dt` seconds of screen time; the frame to draw (null: no run). */
  advance(dt: number): Frame | null {
    const run = this.run;
    if (!run) {
      this.arm.current = null;
      return null;
    }
    if (this.playing) {
      this.t = Math.min(run.durationS, this.t + Math.min(dt, 0.1) * this.rate);
      const done = this.t >= run.durationS;
      if (done) this.playing = false;
      if (done || this.t - this.lastTick >= 0.1) {
        this.lastTick = this.t;
        this.onTick?.(this.t, done);
      }
    }
    const f = frameAt(run, this.t);
    this.arm.current = { angles: f.q, pump: f.pump };
    return f;
  }
}
