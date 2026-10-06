'use client';

/**
 * Pieces the topic panels share: the arm's pose state, a frame-loop animator,
 * tool-tip maths, point clouds for traces, and the "실물로 확인" button.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { tcpFor, type EffectorId } from '@/engine/simulator/effectors';
import { DEFAULT_SPEED } from '@/engine/simulator/program';
import { Vector3 } from 'three';

import { forwardKinematicsFrames, solveIk, type ChainSegment, type IkOptions, type IkResult } from '@/engine/robot/kinematics';
import { jointMoveDuration } from '@/engine/robot/motion';
import { solveToolPose, STRAIGHT_DOWN, type ToolOrientation } from '@/engine/robot/tool';
import { poseContact } from '@/engine/physics/collide';

import { HOME_POSE, type Mm, type RealArm } from '../lessons';
import { LEARN_COLORS } from '../stage/learn3d';
import css from '../learn.module.css';

export { HOME_POSE, LEARN_COLORS };
export type { Mm };

/** Step colours used in every comparison, bright on the dark stage: A amber, B cyan, C green. */
export const STEP_COLORS = { A: '#ffad1f', B: '#22c7e8', C: '#3ddc84' } as const;

/**
 * The tool every topic shows unless it picks another (the parallel gripper), and its tool point:
 * 손끝 in the topics is the gripper's tip, so targets, traces and contact checks agree with what is drawn.
 */
export const LEARN_TOOL: EffectorId = 'parallel';
export const TCP = tcpFor(LEARN_TOOL, false);

/** Moves between poses run at the simulator's default speed (speed 35 → 70°/s peak), never faster. */
export const LEARN_SPEED = DEFAULT_SPEED;
/** Timelines (profiles, physics replays) play at half speed so a motion can be followed by eye. */
export const PLAYBACK = 0.5;

export const fmt = (n: number, d = 1) => (Math.abs(n) < 0.05 && d <= 1 ? '0.0' : n.toFixed(d));
export const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const ease = (u: number) => u * u * (3 - 2 * u);
export const lerpQ = (a: readonly number[], b: readonly number[], s: number) => a.map((v, i) => v + (b[i] - v) * s);

/** Tool point (the gripper tip by default; tcpMm = 0 for the flange), mm in the base frame. */
export function tipOf(chain: readonly ChainSegment[], q: readonly number[], tcpMm = TCP): Mm {
  const f = forwardKinematicsFrames(chain, q);
  const e = f[f.length - 1].elements;
  return [e[12] * 1000 + e[8] * tcpMm, e[13] * 1000 + e[9] * tcpMm, e[14] * 1000 + e[10] * tcpMm];
}

/** Joint angles that put the tool point at `mm` (tool held as `o`, straight down by default); null when out of reach. */
export function reachFor(chain: readonly ChainSegment[], mm: Mm, seed: readonly number[], tcpMm = TCP, o: ToolOrientation = STRAIGHT_DOWN): number[] | null {
  const r = solveToolPose(chain, { x: mm[0], y: mm[1], z: mm[2] }, seed, { tcpMm, orientation: o, toleranceMm: 1 });
  return r.converged ? r.anglesDeg : null;
}

/**
 * Position-only IK for the tool point (solveIk works on the flange): solve for the flange, move the
 * flange goal back along the tool axis of the answer, and again until the tool point is on target.
 */
export function solveTcpIk(chain: readonly ChainSegment[], target: Mm, seed: readonly number[], opts: IkOptions = {}, tcpMm = TCP): IkResult {
  const tol = (opts.positionToleranceM ?? 0.001) * 1000;
  let q = seed.slice();
  let iterations = 0;
  let r: IkResult | null = null;
  for (let k = 0; k < 8; k++) {
    const e = forwardKinematicsFrames(chain, q).at(-1)!.elements;
    const goal = new Vector3((target[0] - e[8] * tcpMm) / 1000, (target[1] - e[9] * tcpMm) / 1000, (target[2] - e[10] * tcpMm) / 1000);
    r = solveIk(chain, goal, q, { ...opts, restarts: k === 0 ? opts.restarts : 0 });
    iterations += r.iterations;
    q = r.anglesDeg;
    const err = dist(tipOf(chain, q, tcpMm), target);
    if (err <= tol) return { ...r, iterations, positionErrorM: err / 1000, converged: true };
  }
  const err = dist(tipOf(chain, q, tcpMm), target);
  return { ...r!, iterations, positionErrorM: err / 1000, converged: err <= tol };
}

/** Small crosses at each point, for a `lines` entry with `segments: true`. */
export function dots(points: readonly Mm[], sizeMm = 2.5): Mm[] {
  const out: Mm[] = [];
  for (const p of points) {
    out.push([p[0] - sizeMm, p[1], p[2]], [p[0] + sizeMm, p[1], p[2]], [p[0], p[1] - sizeMm, p[2]], [p[0], p[1] + sizeMm, p[2]], [p[0], p[1], p[2] - sizeMm], [p[0], p[1], p[2] + sizeMm]);
  }
  return out;
}

/** The arm's pose, with a ref the animation frames read (synced after each render). */
export function usePose(initial: readonly number[] = HOME_POSE) {
  const [q, setQ] = useState<number[]>(initial.slice());
  const ref = useRef(q);
  useEffect(() => {
    ref.current = q;
  }, [q]);
  const set = useCallback((next: number[]) => {
    ref.current = next;
    setQ(next);
  }, []);
  return [q, set, ref] as const;
}

/**
 * Run `frame(t)` every animation frame for `durationS` seconds of motion time (return false to stop early).
 * `rate` < 1 plays it slower than real time (t still counts motion seconds).
 */
export function useAnimator(rate = PLAYBACK) {
  const raf = useRef(0);
  const [running, setRunning] = useState(false);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    setRunning(false);
  }, []);
  const play = useCallback((durationS: number, frame: (t: number) => boolean | void, done?: () => void) => {
    cancelAnimationFrame(raf.current);
    setRunning(true);
    let t0 = -1;
    const tick = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = Math.min(durationS, ((now - t0) / 1000) * rate);
      const halt = frame(t) === false;
      if (t < durationS && !halt) raf.current = requestAnimationFrame(tick);
      else {
        raf.current = 0;
        setRunning(false);
        done?.();
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, [rate]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useMemo(() => ({ play, stop, running }), [play, stop, running]);
}

/** Glide the pose from where it is to `to` (smoothstep), at least `s` seconds and never faster than the simulator. */
export function useGlide(set: (q: number[]) => void, ref: { current: readonly number[] }) {
  const { play, stop, running } = useAnimator(1);
  const glide = useCallback(
    (to: readonly number[], s = 1.2, done?: () => void) => {
      const from = ref.current.slice();
      const T = Math.max(s, jointMoveDuration(from, to, LEARN_SPEED));
      play(T, (t) => set(lerpQ(from, to, ease(t / T))), done);
    },
    [play, set, ref],
  );
  return { glide, running, stop, play };
}

/** Send a pose (or a motion) to the real arm — only when the console runs on the robot and the pose is clear of the table. */
export function RealButton({
  real,
  chain,
  angles,
  tcpMm = TCP,
  label = '실물 로봇으로 같은 자세',
  speed = 25,
  onMoved,
}: {
  real: RealArm;
  chain: readonly ChainSegment[];
  angles: readonly number[];
  tcpMm?: number;
  label?: string;
  speed?: number;
  onMoved?: () => void;
}) {
  const [msg, setMsg] = useState('');
  const go = async () => {
    const hit = poseContact(chain, angles, [], tcpMm);
    if (hit) {
      setMsg(`보내지 않았어요: J${hit.joint} 가 ${hit.what}에 닿는 자세예요.`);
      return;
    }
    setMsg('보내는 중…');
    const r = await real.move(angles.slice(), speed);
    setMsg(r.ok ? `로봇이 움직여요 (속도 ${speed}).` : (r.error ?? '로봇이 받지 않았어요.'));
    if (r.ok) onMoved?.();
  };
  return (
    <div className={css.real}>
      <button type="button" className={css.realBtn} disabled={!real.online} onClick={() => void go()}>
        {label}
      </button>
      <small>{real.online ? msg || '로봇 주변을 비워 두세요.' : '로봇에 연결된 콘솔에서 쓸 수 있어요 (지금: 시뮬레이션).'}</small>
    </div>
  );
}

/** A one-line result after a try, e.g. "블록이 떨어졌어요". */
export function Verdict({ tone, children }: { tone: 'ok' | 'bad' | 'warn'; children: ReactNode }) {
  return (
    <p className={css.verdict} data-tone={tone}>
      {children}
    </p>
  );
}
