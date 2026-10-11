'use client';

/**
 * B2 관절 이동과 직선 이동: the pen on the paper goes A → B three times, one thing changed each time —
 * A by joint interpolation (MOVJ: the tip curves), B by straight-line interpolation of the tip only
 * (MOVL, position IK per point: the line is straight but the pen leans more and more), C straight
 * and holding the pen upright (MOVL + 자세 유지: IK for position and orientation per point).
 */

import { useEffect, useMemo, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { forwardKinematicsFrames } from '@/engine/robot/kinematics';
import { quintic } from '@/engine/robot/motion';
import { tcpFor } from '@/engine/simulator/effectors';

import css from '../../learn.module.css';
import { Graph, Readout } from '../../widgets';
import { HOME_POSE, RealButton, Verdict, fmt, lerpQ, reachFor, solveTcpIk, tipOf, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** Pen tip on the paper (table top), 240 mm apart. */
const P_A: Mm = [180, -120, 0];
const P_B: Mm = [180, 120, 0];
const PEN_MM = tcpFor('pen', false);
const MOVE_S = 2.5;
const N = 80;
const JOINT_COLORS = ['#e5484d', '#e08a0b', '#1fae66', '#1592c9', '#6d4fe8', '#d63d73'];
const TRACE = { A: '#f08a24', B: '#3454d1', C: '#1fae66' } as const;

type K = 'A' | 'B' | 'C';
interface Metrics {
  lengthMm: number;
  devMm: number;
  tiltDeg: number;
}

const lerpP = (a: Mm, b: Mm, s: number): Mm => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];

/** How far the pen leans from straight down, degrees. */
function tiltOf(chain: readonly ChainSegment[], q: readonly number[]) {
  const e = forwardKinematicsFrames(chain, q).at(-1)!.elements;
  return (Math.acos(Math.max(-1, Math.min(1, -e[10]))) * 180) / Math.PI;
}

/** Closest distance from p to segment ab. */
function offLine(p: Mm, a: Mm, b: Mm) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  const s = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / L));
  const c = lerpP(a, b, s);
  return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
}

/** Trace length, worst distance from the line A–B, and the pen's largest lean. */
function measure(chain: readonly ChainSegment[], path: readonly (readonly number[])[]): Metrics {
  const pts = path.map((q) => tipOf(chain, q, PEN_MM));
  let lengthMm = 0;
  pts.forEach((p, i) => {
    if (i) lengthMm += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
  });
  return { lengthMm, devMm: Math.max(...pts.map((p) => offLine(p, P_A, P_B))), tiltDeg: Math.max(...path.map((q) => tiltOf(chain, q))) };
}

/** The three ways from A to B, sampled at the same N + 1 points of progress s. */
function planFor(chain: readonly ChainSegment[]) {
  const qA = reachFor(chain, P_A, HOME_POSE, PEN_MM);
  const qB = qA && reachFor(chain, P_B, qA, PEN_MM);
  if (!qA || !qB) return null;
  const joint = Array.from({ length: N + 1 }, (_, i) => lerpQ(qA, qB, i / N));
  // B: only the tip's position is asked for at each point (the pen's direction is left to the solver).
  const free: number[][] = [qA];
  // C: position and the pen held straight down at each point.
  const held: number[][] = [qA];
  for (let i = 1; i <= N; i++) {
    const p = lerpP(P_A, P_B, i / N);
    const f = solveTcpIk(chain, p, free[i - 1], { positionToleranceM: 0.0003 }, PEN_MM);
    const h = reachFor(chain, p, held[i - 1], PEN_MM);
    if (!f.converged || !h) return null;
    free.push(f.anglesDeg);
    held.push(h);
  }
  return { qA, A: joint, B: free, C: held };
}

const BUTTON: Record<K, string> = { A: '관절 이동 (MOVJ)', B: '직선 이동 (MOVL)', C: '직선 + 자세 유지' };
const TITLE: Record<K, string> = { A: 'A → B 관절 보간', B: 'A → B 직선 보간 (위치만)', C: 'A → B 직선 보간 + 자세 유지' };

export default function B2JointLinear({ chain, show, real, step, record, results }: TopicProps) {
  const [q, setQ] = usePose(HOME_POSE);
  const anim = useAnimator();
  const [traces, setTraces] = useState<Record<K, Mm[]>>({ A: [], B: [], C: [] });
  const [cursor, setCursor] = useState(-1);
  const [fail, setFail] = useState('');

  const plan = useMemo(() => planFor(chain), [chain]);

  const k: K = step === 'cmp' ? 'C' : step;
  const frames = step === 'cmp' ? null : plan?.[step];

  // Each try starts with the pen down at A.
  const { stop } = anim;
  useEffect(() => {
    stop();
    if (plan) setQ(plan.qA.slice());
  }, [step, plan, stop, setQ]);

  const run = (key: K) => {
    const path = plan?.[key];
    if (!path) {
      setFail('이 길은 중간에 펜이 닿지 않아요.');
      return;
    }
    setFail('');
    const pts = path.map((a) => tipOf(chain, a, PEN_MM));
    anim.play(
      MOVE_S,
      (t) => {
        const i = Math.round(quintic(t / MOVE_S) * N);
        setQ(path[i]);
        setCursor(i / N);
        setTraces((tr) => ({ ...tr, [key]: pts.slice(0, i + 1) }));
      },
      () => {
        const m = measure(chain, path);
        record(key, {
          '자취 길이': `${fmt(m.lengthMm, 0)} mm`,
          '직선에서 최대 벗어남': `${fmt(m.devMm, 1)} mm`,
          '펜 최대 기울기': `${fmt(m.tiltDeg, 1)}°`,
        });
      },
    );
  };

  // Joint angles against progress (0 → 1): straight for A, curved for B and C.
  const graph = useMemo(() => {
    if (!frames) return null;
    const x = frames.map((_, i) => i / N);
    return { x, series: [0, 1, 2, 3, 4].map((j) => ({ label: `J${j + 1}`, color: JOINT_COLORS[j], values: frames.map((a) => a[j]) })) };
  }, [frames]);

  const tip = useMemo(() => tipOf(chain, q, PEN_MM), [chain, q]);
  const tilt = useMemo(() => tiltOf(chain, q), [chain, q]);

  useEffect(() => {
    const ink = (key: K) => ({ key, points: traces[key].map((p) => [p[0], p[1], 0.6] as Mm), color: TRACE[key], width: 3.5 });
    const ref = { key: 'ab', points: [P_A, P_B], color: '#98a2b3', width: 1.5, dashed: true };
    show({
      angles: q,
      tool: 'pen',
      frames: 'none',
      lines: step === 'cmp' ? [ref, ink('A'), ink('B'), ink('C')] : [ref, ink(step)],
      labels: [
        { key: 'a', mm: [P_A[0], P_A[1], 22], text: 'A', color: '#475467' },
        { key: 'b', mm: [P_B[0], P_B[1], 22], text: 'B', color: '#475467' },
        ...(step === 'cmp' ? [] : [{ key: 'pen', mm: [tip[0], tip[1], tip[2] + 120] as Mm, text: `펜 기울기 ${fmt(tilt, 1)}°`, color: TRACE[step] }]),
      ],
    });
  }, [q, tip, tilt, step, traces, show]);

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>세 자취 겹쳐 보기</h3>
        <p className={css.note}>주황 = 관절 이동(휘어짐) · 파랑 = 직선 이동(곧지만 펜이 기욺) · 초록 = 직선 + 자세 유지(곧고 펜이 섬).</p>
        <div className={css.row3}>
          <Readout label="관절 이동 벗어남" value={results.A?.['직선에서 최대 벗어남'] ?? '—'} tone="warn" />
          <Readout label="직선 이동 기울기" value={results.B?.['펜 최대 기울기'] ?? '—'} tone="warn" />
          <Readout label="자세 유지 기울기" value={results.C?.['펜 최대 기울기'] ?? '—'} tone="ok" />
        </div>
      </section>
    );

  const m = traces[k].length > 1 && frames ? measure(chain, frames.slice(0, traces[k].length)) : null;

  return (
    <section className={css.card}>
      <h3>{TITLE[k]}</h3>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={anim.running || !plan} onClick={() => run(k)}>
          {BUTTON[k]}
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="자취 길이" value={m ? fmt(m.lengthMm, 0) : '—'} unit="mm" />
        <Readout label="직선에서 최대 벗어남" value={m ? fmt(m.devMm, 1) : '—'} unit="mm" tone={m ? (m.devMm < 2 ? 'ok' : 'warn') : undefined} />
        <Readout label="펜 기울기 (지금)" value={fmt(tilt, 1)} unit="°" tone={tilt < 1 ? 'ok' : 'warn'} />
      </div>
      {graph && (
        <Graph title="관절 각도 (진행 0 → 1)" x={graph.x} xUnit="진행" series={graph.series} unit="°" cursor={cursor >= 0 ? cursor : undefined} height={130} />
      )}
      {fail && <Verdict tone="bad">{fail}</Verdict>}
      <p className={css.note}>
        {step === 'A'
          ? '각 관절이 시작 각도에서 끝 각도로 고르게 돌아요. 그래프는 곧은 선이고, 펜 자취(주황)는 바깥으로 휘어요.'
          : step === 'B'
            ? '점마다 펜 끝 "위치만" 맞추도록 역기구학을 풀어요. 자취(파랑)는 곧지만, 방향은 정하지 않아 펜이 점점 기울어요.'
            : '점마다 위치와 함께 "펜은 아래로" 라는 방향까지 맞춰요. 자취(초록)도 곧고 펜도 끝까지 서 있어요.'}
      </p>
      {plan && <RealButton real={real} chain={chain} angles={plan.qA} label="실물 로봇을 A 자세로" />}
    </section>
  );
}
