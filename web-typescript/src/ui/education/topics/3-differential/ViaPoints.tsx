'use client';

/** C2 경유점 잇기: four via points — A stops at every point, B keeps its speed and turns sharply, C rounds each corner (blend radius). */

import { useEffect, useMemo, useState } from 'react';

import { tcpFor } from '@/engine/simulator/effectors';
import { trapezoid } from '@/engine/physics/planning';

import css from '../../learn.module.css';
import { Graph, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, dist, dots, fmt, reachFor, useAnimator, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

/** A pen held straight down, 80 mm above the table. */
const TCP = tcpFor('pen', false);
const Z = 80;
const VIA: Mm[] = [
  [150, -70, Z],
  [230, -70, Z],
  [230, 70, Z],
  [150, 70, Z],
];
/** Round the square and back to the start: corners at points 2, 3, 4. */
const LOOP: Mm[] = [...VIA, VIA[0]];
/** Same limits for all three tries: top speed and acceleration along the path. */
const V_MAX = 150; // mm/s
const A_MAX = 600; // mm/s²
const DT = 1 / 60;
const BUTTON: Record<K, string> = { A: '멈추며 가기', B: '꺾어 가기', C: '둥글게 잇기' };
const NUM: Record<K, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };

const sub = (a: Mm, b: Mm): Mm => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Mm, b: Mm): Mm => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Mm, s: number): Mm => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Mm, b: Mm) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Mm): Mm => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/** A straight piece, or a circular arc p(α) = c + u cos α + w sin α for α in 0..φ. */
interface Piece {
  a: Mm;
  b: Mm;
  len: number;
  arc?: { c: Mm; u: Mm; w: Mm; phi: number };
}

/** The loop with each corner replaced by an arc that starts `r` mm before it (r = 0: sharp corners). */
function buildPath(r: number): Piece[] {
  const n = LOOP.length - 1;
  const cut = LOOP.map((p, i) => (i === 0 || i === n || r <= 0 ? 0 : Math.min(r, dist(LOOP[i - 1], p) / 2, dist(p, LOOP[i + 1]) / 2)));
  const out: Piece[] = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = LOOP[i];
    const p1 = LOOP[i + 1];
    const d = unit(sub(p1, p0));
    const a = add(p0, mul(d, cut[i]));
    const b = sub(p1, mul(d, cut[i + 1]));
    out.push({ a, b, len: dist(a, b) });
    if (cut[i + 1] > 0) {
      const d2 = unit(sub(LOOP[i + 2], p1));
      const phi = Math.acos(Math.min(1, Math.max(-1, dot(d, d2))));
      const rho = cut[i + 1] / Math.tan(phi / 2);
      const c = add(b, mul(unit(sub(d2, mul(d, dot(d, d2)))), rho));
      out.push({ a: b, b: add(p1, mul(d2, cut[i + 1])), len: rho * phi, arc: { c, u: sub(b, c), w: mul(d, rho), phi } });
    }
  }
  return out;
}

function onPiece(pc: Piece, f: number): Mm {
  if (!pc.arc) return add(pc.a, mul(sub(pc.b, pc.a), f));
  const al = f * pc.arc.phi;
  return add(pc.arc.c, add(mul(pc.arc.u, Math.cos(al)), mul(pc.arc.w, Math.sin(al))));
}

/** Direction of travel on a piece (unit vector). */
function heading(pc: Piece, f: number): Mm {
  if (!pc.arc) return unit(sub(pc.b, pc.a));
  const al = f * pc.arc.phi;
  return unit(add(mul(pc.arc.u, -Math.sin(al)), mul(pc.arc.w, Math.cos(al))));
}

/** Point and direction at arc length `s` (mm) along the path. */
function pointAt(path: readonly Piece[], s: number): { p: Mm; d: Mm } {
  let rest = s;
  for (let i = 0; i < path.length; i += 1) {
    const pc = path[i];
    // A point exactly at a corner already heads along the next side.
    if (rest < pc.len || i === path.length - 1) {
      const f = pc.len > 0 ? Math.min(1, Math.max(0, rest / pc.len)) : 0;
      return { p: onPiece(pc, f), d: heading(pc, f) };
    }
    rest -= pc.len;
  }
  return { p: LOOP[0], d: [1, 0, 0] };
}

/** How far the path passes from the corners it rounds, mm (the middle of each arc). */
function deviation(path: readonly Piece[]): number {
  return path.reduce((m, pc, i) => (pc.arc ? Math.max(m, dist(onPiece(pc, 0.5), LOOP[path.slice(0, i).filter((p) => !p.arc).length])) : m), 0);
}

/** Dense points along the path, for the dashed preview. */
function trace(path: readonly Piece[], stepMm = 3): Mm[] {
  return path.flatMap((pc) => {
    const n = Math.max(1, Math.ceil(pc.len / stepMm));
    return Array.from({ length: n + 1 }, (_, j) => onPiece(pc, j / n));
  });
}

interface Run {
  T: number;
  t: number[];
  /** Tool speed, mm/s. */
  speed: number[];
  /** Tool acceleration magnitude, m/s². */
  acc: number[];
  pts: Mm[];
  qs: number[][];
  maxAcc: number;
  dev: number;
  miss: number;
}

/** Time along the path: A — each side its own rest-to-rest trapezoid; B, C — one trapezoid over the whole length. */
function timeLaw(k: K, path: readonly Piece[]) {
  if (k === 'A') {
    const profs = path.map((pc) => trapezoid(pc.len, V_MAX, A_MAX));
    const T = profs.reduce((s, p) => s + p.durationS, 0);
    return {
      T,
      at(t: number) {
        let t0 = 0;
        let s0 = 0;
        for (let i = 0; i < profs.length; i += 1) {
          const D = profs[i].durationS;
          if (t <= t0 + D || i === profs.length - 1) {
            const smp = profs[i].sample(t - t0);
            return { s: s0 + smp.p, v: smp.v };
          }
          t0 += D;
          s0 += path[i].len;
        }
        return { s: 0, v: 0 };
      },
    };
  }
  const L = path.reduce((s, pc) => s + pc.len, 0);
  const prof = trapezoid(L, V_MAX, A_MAX);
  return {
    T: prof.durationS,
    at(t: number) {
      const smp = prof.sample(t);
      return { s: smp.p, v: smp.v };
    },
  };
}

/**
 * Sample the try every 1/60 s: tool point, speed, acceleration (change of the
 * velocity vector over one step — a sharp corner turns it within one step),
 * and the joint angles (IK seeded with the last solution).
 */
function computeRun(chain: TopicProps['chain'], k: K, blend: number, startQ: readonly number[]): Run {
  const path = buildPath(k === 'C' ? blend : 0);
  const law = timeLaw(k, path);
  const n = Math.max(2, Math.ceil(law.T / DT));
  const dt = law.T / n;
  const t: number[] = [];
  const speed: number[] = [];
  const pts: Mm[] = [];
  const vel: Mm[] = [];
  for (let i = 0; i <= n; i += 1) {
    const ti = i * dt;
    const { s, v } = law.at(ti);
    const at = pointAt(path, s);
    t.push(ti);
    speed.push(Math.abs(v));
    pts.push(at.p);
    vel.push(mul(at.d, v));
  }
  const acc = vel.map((_, i) => {
    const j = Math.max(1, i);
    const d = sub(vel[j], vel[j - 1]);
    return Math.hypot(d[0], d[1], d[2]) / dt / 1000;
  });
  let seed = startQ.slice();
  let miss = 0;
  const qs = pts.map((p) => {
    const a = reachFor(chain, p, seed, TCP);
    if (a) seed = a;
    else miss += 1;
    return seed.slice();
  });
  return { T: law.T, t, speed, acc, pts, qs, maxAcc: Math.max(...acc), dev: deviation(path), miss };
}

export default function C2ViaPoints({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [blend, setBlend] = useState(20);
  const [runs, setRuns] = useState<Partial<Record<K, Run>>>({});
  /** Sample shown while a try plays; null: the end of the last run. */
  const [cur, setCur] = useState<{ k: K; i: number } | null>(null);
  const { play, stop, running } = useAnimator();

  const startQ = useMemo(() => reachFor(chain, LOOP[0], HOME_POSE, TCP) ?? HOME_POSE.slice(), [chain]);
  const path = useMemo(() => buildPath(k === 'C' ? blend : 0), [k, blend]);
  const preview = useMemo(() => trace(path), [path]);
  const dev = useMemo(() => deviation(path), [path]);

  useEffect(() => {
    stop();
  }, [step, stop]);

  const run = step === 'cmp' ? undefined : runs[k];
  const i = run ? (cur && cur.k === k ? cur.i : run.qs.length - 1) : -1;
  const q = run && i >= 0 ? run.qs[i] : startQ;

  const go = () => {
    if (step === 'cmp') return;
    const key = step;
    const r = computeRun(chain, key, blend, startQ);
    setRuns((rs) => ({ ...rs, [key]: r }));
    setCur({ k: key, i: 0 });
    const last = r.qs.length - 1;
    play(
      r.T,
      (t) => setCur({ k: key, i: Math.min(last, Math.round((t / r.T) * last)) }),
      () => {
        setCur(null);
        record(key, {
          '걸린 시간': `${r.T.toFixed(2)} s`,
          '최대 가속도': `${fmt(r.maxAcc, 1)} m/s²`,
          '경유점에서 벗어남': `${r.dev.toFixed(1)} mm`,
        });
      },
    );
  };

  useEffect(() => {
    const keys: K[] = step === 'cmp' ? ['A', 'B', 'C'] : [k];
    const lift = { A: 0, B: 1.5, C: 3 };
    const tip = run && i >= 0 ? run.pts[i] : null;
    show({
      angles: q,
      tool: 'pen',
      frames: 'none',
      lines: [
        { key: 'via', points: dots(VIA, 6), color: LEARN_COLORS.bad, width: 2.5, segments: true },
        ...(step === 'cmp' ? [] : [{ key: 'plan', points: preview, color: LEARN_COLORS.ghost, width: 1.5, dashed: true }]),
        ...keys.flatMap((key) => {
          const r = runs[key];
          if (!r) return [];
          const n = step !== 'cmp' && cur && cur.k === key ? cur.i + 1 : r.pts.length;
          return [{ key: `run${key}`, points: r.pts.slice(0, n).map((p): Mm => [p[0], p[1], p[2] + lift[key]]), color: STEP_COLORS[key], width: 3 }];
        }),
      ],
      labels: [
        ...VIA.map((p, j) => ({ key: `v${j}`, mm: [p[0], p[1], p[2] + 16] as Mm, text: j === 0 ? '1 출발·도착' : String(j + 1), color: LEARN_COLORS.bad })),
        ...(tip && run ? [{ key: 'v', mm: [tip[0], tip[1], tip[2] + 60] as Mm, text: `${fmt(run.speed[i], 0)} mm/s`, color: STEP_COLORS[k] }] : []),
      ],
    });
  }, [q, step, k, runs, cur, i, run, preview, show]);

  if (step === 'cmp') {
    const done = (['A', 'B', 'C'] as K[]).filter((key) => runs[key]);
    const Tm = Math.max(0.1, ...done.map((key) => runs[key]!.T));
    const x = Array.from({ length: 241 }, (_, j) => (Tm * j) / 240);
    const at = (r: Run, t: number) => (t > r.T ? 0 : r.speed[Math.min(r.speed.length - 1, Math.round((t / r.T) * (r.speed.length - 1)))]);
    return (
      <section className={css.card}>
        <h3>세 방식 겹쳐 보기</h3>
        {done.length ? (
          <Graph title="손끝 속도" x={x} series={done.map((key) => ({ label: `${NUM[key]} ${BUTTON[key]}`, color: STEP_COLORS[key], values: x.map((t) => at(runs[key]!, t)) }))} unit="mm/s" height={130} />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 한 번씩 해 보면 여기에 겹쳐져요.</p>
        )}
        <div className={css.row3}>
          {(['A', 'B', 'C'] as K[]).map((key) => (
            <Readout key={key} label={`${NUM[key]} 걸린 시간`} value={runs[key] ? runs[key]!.T.toFixed(2) : '—'} unit="s" />
          ))}
        </div>
        <p className={css.note}>3D: 활동 1 · 2 는 네모 길 그대로, 활동 3 은 모서리를 깎은 길이에요.</p>
      </section>
    );
  }

  return (
    <section className={css.card}>
      <h3>{k === 'A' ? '점마다 멈추기' : k === 'B' ? '속도 그대로 꺾기' : '모서리 둥글게 잇기'}</h3>
      {k === 'C' && (
        <label className={css.slider}>
          <b>둥글기</b>
          <input type="range" min={5} max={40} step={1} value={blend} disabled={running} onChange={(e) => setBlend(Number(e.target.value))} aria-label="둥글기" />
          <span className={css.num}>{blend} mm</span>
        </label>
      )}
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={running} onClick={go}>
          {BUTTON[k]}
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="걸린 시간" value={run ? run.T.toFixed(2) : '—'} unit="s" />
        <Readout label="최대 가속도" value={run ? fmt(run.maxAcc, 1) : '—'} unit="m/s²" tone={run ? (run.maxAcc > 3 ? 'bad' : 'ok') : undefined} />
        <Readout label="경유점에서 벗어남" value={(run ? run.dev : dev).toFixed(1)} unit="mm" />
      </div>
      {run && (
        <div className={css.graphs}>
          <Graph title="손끝 속도" x={run.t} series={[{ label: '속도', color: STEP_COLORS[k], values: run.speed }]} unit="mm/s" cursor={run.t[i]} height={92} />
          <Graph title="손끝 가속도 (크기)" x={run.t} series={[{ label: '가속도', color: LEARN_COLORS.warn, values: run.acc }]} unit="m/s²" cursor={run.t[i]} height={92} />
        </div>
      )}
      {run && run.miss > 0 && <p className={css.warnNote}>몇 점은 팔이 닿지 않아 바로 앞 자세를 썼어요 ({run.miss}점).</p>}
      <p className={css.note}>
        {k === 'A'
          ? `빨간 점 4개를 네모로 돌아 1 로 돌아와요. 최고 속도 ${V_MAX} mm/s · 가속도 ${A_MAX / 1000} m/s² 는 셋 다 같아요.`
          : k === 'B'
            ? '모서리에서 방향만 확 바뀌어요. 아주 짧은 순간(1/60 초)에 속도 방향이 90° 꺾이니 가속도가 튀어요.'
            : '모서리 앞뒤 둥글기만큼을 원호로 바꿔요. 클수록 덜 꺾여 가속도가 작지만, 경유점에서 더 멀리 지나가요.'}
      </p>
    </section>
  );
}
