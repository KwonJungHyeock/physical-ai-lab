'use client';

/**
 * The one-joint model the 5 로봇 제어공학 topics share: the shoulder (J2) as one
 * pendulum, I θ̈ + b θ̇ + m·g·l·sinθ = u (+ a contact torque when a hand is in
 * the way), sent from 0° to 60°. Open loop or PID, a fixed target or a moving
 * one (a quintic from 0° to 60° in T s, with optional feedforward), and a motor
 * torque limit. Plus the graph the four panels draw their runs on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { gravityTorques, massMatrix } from '@/engine/physics/dynamics';

import type { LearnScene } from '../../stage/LearnStage';
import css from '../../learn.module.css';
import { LEARN_COLORS, PLAYBACK, TCP, tipOf, useAnimator, type Mm } from '../kit';
import type { StepView } from '../types';

export const TARGET = 60; // °
export const DT = 0.001; // s, simulation step
export const EVERY = 10; // keep one sample in 10 (10 ms)
export const SAMPLE_S = EVERY * DT;
/** Motor + gearbox inertia seen at the joint, kg·m² (a guess: the servo's own share). */
const I_MOTOR = 0.017;
/** Viscous friction, N·m·s/rad. */
export const FRICTION = 0.15;
/** Motor torque limit, N·m. */
export const U_MAX = 3;
const D2R = Math.PI / 180;

/** The arm on screen: J2 = θ − 120°, the forearm bent up so it stays off the table. */
const J2_AT_ZERO = -120;
const BASE = [0, J2_AT_ZERO, 60, 0, 0, 0];
const STRAIGHT = [0, -90, 0, 0, 0, 0];

export const poseAt = (thetaDeg: number) => {
  const q = BASE.slice();
  q[1] = Math.max(-135, Math.min(135, J2_AT_ZERO + thetaDeg));
  return q;
};

export interface Model {
  /** m g l of the arm alone (N·m) and per kg held at the tool. */
  mgl: number;
  mglPerKg: number;
  /** Inertia about J2 (kg·m²): arm + motor, and per kg held. */
  inertia: number;
  inertiaPerKg: number;
}

/** The pendulum's numbers from the arm itself (gravity torque and inertia about J2, stretched out, gripper on). */
export function useJointModel(chain: readonly ChainSegment[]): Model {
  return useMemo(() => {
    const g0 = Math.abs(gravityTorques(chain, STRAIGHT, { tcpMm: TCP })[1]);
    const g1 = Math.abs(gravityTorques(chain, STRAIGHT, { payloadKg: 1, tcpMm: TCP })[1]);
    const m0 = massMatrix(chain, STRAIGHT)[1][1];
    const m1 = massMatrix(chain, STRAIGHT, { payloadKg: 1, tcpMm: TCP })[1][1];
    return { mgl: g0, mglPerKg: g1 - g0, inertia: m0 + I_MOTOR, inertiaPerKg: m1 - m0 };
  }, [chain]);
}

export interface Gains {
  kp: number;
  ki: number;
  kd: number;
}

export interface SimOptions {
  kg: number;
  /** Open loop: the torque that holds 60° with no load, worked out once and sent as is. */
  open?: boolean;
  gains?: Gains;
  /** A moving target: a quintic 0° → 60° in this many seconds (the D term then acts on ṙ − θ̇). */
  rampS?: number;
  /** Add the model's own torque for the moving target (I r̈ + b ṙ + m g l sin r). */
  feedforward?: boolean;
  /** Motor torque limit, N·m (default U_MAX). */
  uMax?: number;
  /** A hand in the way: a stiff spring from this angle on. */
  handDeg?: number;
  /** Simulated time, s. */
  T: number;
}

export interface Run {
  /** θ every 10 ms, degrees. */
  y: number[];
  /** The command every 10 ms, degrees. */
  r: number[];
  /** The torque on the hand every 10 ms, N·m. */
  c: number[];
  /** Into the ±2% band for good (s), or null if still outside at the end. */
  settleS: number | null;
  overshootPct: number;
  /** |60° − θ| at the end. */
  errorDeg: number;
  /** Largest |r − θ|. */
  maxTrackDeg: number;
  /** After the ramp ends, how long until θ stays within ±1° of 60° (s; 0 if it already is). */
  afterRampS: number | null;
  /** The torque on the hand at the end, N·m. */
  pushNm: number;
}

const HAND_K = 30; // N·m/rad
const HAND_DAMP = 0.5; // N·m·s/rad, pressing in only

function quintic(T: number, t: number) {
  if (t >= T) return { p: 1, v: 0, a: 0 };
  const s = Math.max(0, t / T);
  return { p: 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5, v: (30 * s ** 2 - 60 * s ** 3 + 30 * s ** 4) / T, a: (60 * s - 180 * s ** 2 + 120 * s ** 3) / (T * T) };
}

export function simulate(m: Model, o: SimOptions): Run {
  const mgl = m.mgl + m.mglPerKg * o.kg;
  const I = m.inertia + m.inertiaPerKg * o.kg;
  const goal = TARGET * D2R;
  const uOpen = m.mgl * Math.sin(goal);
  const g = o.gains ?? { kp: 0, ki: 0, kd: 0 };
  const uMax = o.uMax ?? U_MAX;
  const hand = o.handDeg === undefined ? null : o.handDeg * D2R;
  let th = 0;
  let w = 0;
  let integ = 0;
  let maxTrack = 0;
  let lastOff1 = -1;
  let c = 0;
  const y: number[] = [];
  const rs: number[] = [];
  const cs: number[] = [];
  const steps = Math.round(o.T / DT);
  for (let k = 0; k <= steps; k += 1) {
    const t = k * DT;
    const q = o.rampS ? quintic(o.rampS, t) : { p: 1, v: 0, a: 0 };
    const r = goal * q.p;
    const rd = goal * q.v;
    const rdd = goal * q.a;
    c = hand !== null && th > hand ? HAND_K * (th - hand) + HAND_DAMP * Math.max(0, w) : 0;
    if (k % EVERY === 0) {
      y.push(th / D2R);
      rs.push(r / D2R);
      cs.push(c);
    }
    const e = r - th;
    maxTrack = Math.max(maxTrack, Math.abs(e));
    if (Math.abs(th - goal) > D2R) lastOff1 = t;
    let u: number;
    if (o.open) u = uOpen;
    else {
      integ = Math.max(-1, Math.min(1, integ + e * DT)); // keep the I term from winding up
      // A fixed target: de/dt = −θ̇. A moving one: ṙ − θ̇.
      u = g.kp * e + g.ki * integ + g.kd * ((o.rampS ? rd : 0) - w);
      if (o.feedforward) u += I * rdd + FRICTION * rd + mgl * Math.sin(r);
    }
    u = Math.max(-uMax, Math.min(uMax, u));
    const acc = (u - c - FRICTION * w - mgl * Math.sin(th)) / I;
    w += acc * DT;
    th += w * DT;
  }
  const band = TARGET * 0.02;
  let settle: number | null = 0;
  for (let i = y.length - 1; i >= 0; i -= 1) {
    if (Math.abs(y[i] - TARGET) > band) {
      settle = i + 1 < y.length ? (i + 1) * SAMPLE_S : null;
      break;
    }
  }
  const peak = Math.max(...y);
  const ramp = o.rampS ?? 0;
  return {
    y,
    r: rs,
    c: cs,
    settleS: settle,
    overshootPct: Math.max(0, ((peak - TARGET) / TARGET) * 100),
    errorDeg: Math.abs(TARGET - y[y.length - 1]),
    maxTrackDeg: maxTrack / D2R,
    afterRampS: lastOff1 >= o.T - DT ? null : Math.max(0, lastOff1 + DT - ramp),
    pushNm: c,
  };
}

/* -------------------------------------------------------------------------- */
/* A time graph with fixed axes                                               */
/* -------------------------------------------------------------------------- */

export interface Series {
  key: string;
  label: string;
  color: string;
  /** One value per 10 ms. */
  y: readonly number[];
  dashed?: boolean;
}

export function TimeGraph({
  title,
  tEnd,
  series,
  unit = '°',
  lo,
  hi,
  marks = [],
  band,
}: {
  title: string;
  tEnd: number;
  series: Series[];
  unit?: string;
  lo?: number;
  hi?: number;
  /** Horizontal lines (target, limit), labelled on the axis. */
  marks?: { v: number; label: string; color: string }[];
  /** A shaded band around a value (±2% of the target). */
  band?: { from: number; to: number };
}) {
  const W = 320;
  const H = 150;
  const pad = { l: 38, r: 8, t: 8, b: 18 };
  const all = series.flatMap((s) => s.y);
  const y0 = lo ?? Math.min(0, ...all);
  const y1 = hi ?? Math.max(...marks.map((m) => m.v * 1.15), ...all.map((v) => v * 1.05), 1);
  const n = Math.round(tEnd / SAMPLE_S);
  const sx = (i: number) => pad.l + (i / n) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const fmtTick = (v: number) => `${Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)}${unit}`;
  const ticks = Array.from({ length: Math.floor(tEnd) }, (_, i) => i + 1);
  return (
    <figure className={css.graph}>
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {band && <rect x={pad.l} y={sy(band.to)} width={W - pad.l - pad.r} height={Math.max(0, sy(band.from) - sy(band.to))} fill={LEARN_COLORS.ok} opacity={0.12} />}
        <line x1={pad.l} x2={W - pad.r} y1={sy(Math.max(y0, 0))} y2={sy(Math.max(y0, 0))} className={css.axis} />
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className={css.axis} />
        {marks.map((m) => (
          <g key={m.label}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(m.v)} y2={sy(m.v)} stroke={m.color} strokeWidth={1.2} strokeDasharray="5 3" />
            <text x={pad.l - 4} y={sy(m.v) + 3} className={css.tick} textAnchor="end">
              {m.label}
            </text>
          </g>
        ))}
        <text x={pad.l - 4} y={sy(y0) + 3} className={css.tick} textAnchor="end">
          {fmtTick(y0)}
        </text>
        <text x={pad.l - 4} y={pad.t + 8} className={css.tick} textAnchor="end">
          {fmtTick(y1)}
        </text>
        {ticks.map((s) => (
          <text key={s} x={sx(s / SAMPLE_S)} y={H - 4} className={css.tick} textAnchor={s === ticks.length ? 'end' : 'middle'}>
            {s} s
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '6 4' : undefined}
            strokeLinejoin="round"
            points={s.y.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      <div className={css.legend}>
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

export const grams = (kg: number) => `${Math.round(kg * 1000)} g`;

/* -------------------------------------------------------------------------- */
/* Playing a run on the arm                                                   */
/* -------------------------------------------------------------------------- */

type K = 'A' | 'B' | 'C';

/** Each try's last run, and which sample of the one playing the arm shows. Opening another step stops a run. */
export function usePlayback(step: StepView) {
  const [runs, setRuns] = useState<Partial<Record<K, Run>>>({});
  const [cursor, setCursor] = useState<{ k: K; i: number } | null>(null);
  const anim = useAnimator(PLAYBACK);
  const { play, stop, running } = anim;
  /** The step the playing run was started on. */
  const runStep = useRef<StepView | null>(null);
  useEffect(() => {
    // Stop a run of another step — but not one started on this step before this effect got to run.
    if (runStep.current !== step) stop();
  }, [step, stop]);
  const start = useCallback(
    (k: K, r: Run, done: () => void) => {
      runStep.current = step;
      setRuns((rs) => ({ ...rs, [k]: r }));
      setCursor({ k, i: 0 });
      const T = (r.y.length - 1) * SAMPLE_S;
      play(
        T,
        (t) => setCursor({ k, i: Math.min(r.y.length - 1, Math.round(t / SAMPLE_S)) }),
        () => {
          setCursor(null);
          done();
        },
      );
    },
    [play, step],
  );
  /** The run of try k and the sample to show (the end once it has played). */
  const shown = (k: K) => {
    const r = runs[k];
    if (!r) return null;
    const playing = running && cursor !== null && cursor.k === k;
    return { run: r, i: playing ? cursor.i : r.y.length - 1, playing };
  };
  return { runs, start, shown, running };
}

/** The arm at θ with the 60° goal as a faint ghost, the tool's trail so far, and what the panel adds. */
export function useJointScene(
  chain: readonly ChainSegment[],
  show: (s: LearnScene) => void,
  o: { thetaDeg: number; color: string; kg?: number; run?: Run | null; upTo?: number; ghostDeg?: number; ghostColor?: string; extra?: Partial<LearnScene> },
) {
  const { thetaDeg, color, kg = 0, run, upTo = 0, ghostDeg = TARGET, ghostColor = LEARN_COLORS.ok, extra } = o;
  const q = useMemo(() => poseAt(thetaDeg), [thetaDeg]);
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  const goalTip = useMemo(() => tipOf(chain, poseAt(TARGET)), [chain]);
  const trail = useMemo(() => {
    if (!run) return [];
    const pts: Mm[] = [];
    for (let i = 0; i <= upTo; i += 5) pts.push(tipOf(chain, poseAt(run.y[i])));
    return pts;
  }, [run, upTo, chain]);
  useEffect(() => {
    show({
      angles: q,
      frames: 'none',
      ghosts: [{ key: 'goal', angles: poseAt(ghostDeg), color: ghostColor, opacity: 0.2 }],
      payload: kg > 0 ? { mm: tip, kg } : null,
      lines: trail.length > 1 ? [{ key: 'trail', points: trail, color, width: 3 }] : [],
      labels: [
        { key: 'theta', mm: [tip[0], tip[1], tip[2] + 34], text: `어깨 θ = ${thetaDeg.toFixed(1)}°`, color },
        { key: 'goal', mm: [goalTip[0], goalTip[1], goalTip[2] + 30], text: '목표 60°', color: LEARN_COLORS.ok },
      ],
      ...extra,
    });
  }, [show, q, tip, goalTip, kg, trail, color, thetaDeg, ghostDeg, ghostColor, extra]);
  return { tip, goalTip };
}
