/**
 * 실물 연동: the real arm follows the arm on the 교육 screen. Whatever drives the 3D arm (a lesson's
 * pose, a played-back site-lab run) is fed here every frame; the follower turns it into the robot
 * server's real-time targets (POST /api/target, the same stream as a held jog key):
 *
 *  - at most one target every `periodMs`, never one while the last is still on its way;
 *  - each target at most `lead`° ahead of the measured angles per joint (the server refuses more
 *    than JOG_LEAD_DEG = 15°), so a fast screen arm is followed, not overtaken: the real arm lags
 *    and the lag is shown;
 *  - inside the joint limits, at the classroom speed cap (50) or below, slower while catching up
 *    from far away (when the mode is switched on the real arm may stand anywhere);
 *  - every step is checked first (`check`: table, self-collision); a problem, a refused target or
 *    lost angles stop the arm at once and the follower stays stopped until it is started again.
 *
 * The pump and the gripper follow on change. No React, no DOM: tests/education/follow-check.mts
 * drives it with a fake robot and clock.
 */

import type { PostResult } from '../simulator/robotLink';

export interface FollowIo {
  /** The measured angles of the real arm (null: not reading). */
  actual(): readonly number[] | null;
  target(angles: number[], speed: number): Promise<PostResult>;
  stop(): Promise<PostResult>;
  pump?(on: boolean): Promise<PostResult>;
  grip?(open: boolean): Promise<PostResult>;
  /** Why the straight joint move from → to is not allowed (it hits the table, itself …), or null. */
  check(from: readonly number[], to: readonly number[]): string | null;
  /** The joint limits, degrees. */
  min: readonly number[];
  max: readonly number[];
}

export interface FollowOptions {
  /** Speed (1–100) while following; capped at `cap`. */
  speed?: number;
  cap?: number;
  periodMs?: number;
  /** How far, degrees, a target may lead the measured angles per joint. */
  lead?: number;
  /** Lag, degrees, above which it moves at the catch-up speed. */
  far?: number;
  catchUpSpeed?: number;
}

/** The tool as the screen shows it: pump on, gripper open (undefined: the screen has no such tool). */
export interface FollowTool {
  pump?: boolean;
  open?: boolean;
}

export type FollowPhase = 'off' | 'following' | 'stopped';

export interface FollowStatus {
  phase: FollowPhase;
  /** The largest joint difference between the screen arm and the real one, degrees (NaN: unknown). */
  lag: number;
  /** Why it stopped (phase 'stopped'), in words. */
  message: string;
}

/** The classroom speed cap of the robot server (robot-python/server/server.py SPEED_CAP). */
export const FOLLOW_CAP = 50;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const maxDiff = (a: readonly number[], b: readonly number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - (b[i] ?? v))), 0);

export class Follower {
  private phase: FollowPhase = 'off';
  private lag = NaN;
  private message = '';
  private sent = -Infinity;
  private inflight = false;
  private last: number[] | null = null;
  private tool: FollowTool = {};
  private readonly o: Required<FollowOptions>;

  constructor(
    private readonly io: FollowIo,
    opts: FollowOptions = {},
  ) {
    const cap = Math.min(FOLLOW_CAP, opts.cap ?? FOLLOW_CAP);
    const speed = Math.min(opts.speed ?? cap, cap);
    this.o = {
      periodMs: opts.periodMs ?? 120,
      lead: Math.min(opts.lead ?? 12, 14),
      far: opts.far ?? 20,
      cap,
      speed,
      catchUpSpeed: Math.min(opts.catchUpSpeed ?? 25, speed),
    };
  }

  get status(): FollowStatus {
    return { phase: this.phase, lag: this.lag, message: this.message };
  }

  /** Starts following (again, after a stop). The tool is sent on the first feed. */
  start(): void {
    this.phase = 'following';
    this.message = '';
    this.last = null;
    this.tool = {};
    this.sent = -Infinity;
  }

  /** Stops the real arm now; with a reason, the follower stays stopped and shows it. */
  stop(why = ''): void {
    if (this.phase === 'off') return;
    this.phase = why ? 'stopped' : 'off';
    this.message = why;
    void this.io.stop();
  }

  /** The screen arm at time `now` (ms): sends the next target when it is due. */
  feed(now: number, goal: readonly number[], tool: FollowTool = {}): void {
    if (this.phase !== 'following') return;
    const actual = this.io.actual();
    if (!actual) return this.stop('로봇 관절 각도를 읽지 못해 멈췄어요.');
    this.lag = maxDiff(goal, actual);
    this.sendTool(tool);
    if (this.inflight || now - this.sent < this.o.periodMs) return;
    const next = goal.map((g, i) => clamp(clamp(g, actual[i] - this.o.lead, actual[i] + this.o.lead), this.io.min[i], this.io.max[i]));
    // Already there and nothing new to send: the arm rests (the server stops it when targets stop).
    if (this.last && maxDiff(next, this.last) < 0.2 && maxDiff(next, actual) < 0.5) return;
    const why = this.io.check(this.last ?? actual, next);
    if (why) return this.stop(`실물을 멈췄어요: ${why}`);
    this.sent = now;
    this.inflight = true;
    this.last = next;
    const speed = this.lag > this.o.far ? this.o.catchUpSpeed : this.o.speed;
    void this.io.target(next, speed).then((res) => {
      this.inflight = false;
      if (!res.ok && this.phase === 'following') this.stop(`로봇: ${res.error ?? '움직일 수 없어요.'}`);
    });
  }

  private sendTool(tool: FollowTool) {
    if (tool.pump !== undefined && tool.pump !== this.tool.pump && this.io.pump) {
      this.tool.pump = tool.pump;
      void this.io.pump(tool.pump);
    }
    if (tool.open !== undefined && tool.open !== this.tool.open && this.io.grip) {
      this.tool.open = tool.open;
      void this.io.grip(tool.open);
    }
  }
}
