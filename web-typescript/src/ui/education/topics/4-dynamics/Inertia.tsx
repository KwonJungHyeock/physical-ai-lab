'use client';

/** D2 관성과 가속 토크: the same swing — A slow 2.5 s (quintic), B fast 0.8 s (quintic), C fast 0.8 s with a sharp trapezoid. */

import { useEffect, useMemo, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { inverseDynamics, torqueLimits } from '@/engine/physics/dynamics';
import { quinticProfile, trapezoid, type Profile } from '@/engine/physics/planning';

import css from '../../learn.module.css';
import { Graph, Readout } from '../../widgets';
import { LEARN_COLORS, STEP_COLORS, Verdict, fmt, tipOf, useAnimator, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const NUM: Record<K, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };

/** Arm reached out to one side, swung by J1 to the other side: J1 must speed up and stop the whole arm. */
const FROM = [-60, -60, -20, 0, 0, 0];
const TO = [60, -60, -20, 0, 0, 0];
/** The joint this motion loads most (graphs, record). */
const J = 0;
const TRIES: Record<K, { T: number; sharp: boolean; button: string }> = {
  A: { T: 2.5, sharp: false, button: '느리게 2.5 초' },
  B: { T: 0.8, sharp: false, button: '빠르게 0.8 초' },
  C: { T: 0.8, sharp: true, button: '빠르게 + 사다리꼴(급하게)' },
};
const N = 160;

interface Motion {
  T: number;
  t: number[];
  q: number[][];
  qd: number[][];
  tau: number[][];
  /** Peak |τ| per joint, N·m. */
  peak: number[];
  over: boolean;
}

/** Sample the move and its torques (inverse dynamics). Trapezoid: 12 % of the time speeding up, 12 % slowing down. */
function plan(chain: readonly ChainSegment[], k: K, limits: readonly number[]): Motion {
  const { T, sharp } = TRIES[k];
  const vMax = 1 / (T * 0.88);
  const prof: Profile = sharp ? trapezoid(1, vMax, vMax / (T * 0.12)) : quinticProfile(1, T);
  const dur = prof.durationS;
  const out: Motion = { T: dur, t: [], q: [], qd: [], tau: [], peak: new Array<number>(6).fill(0), over: false };
  for (let i = 0; i <= N; i += 1) {
    const t = (dur * i) / N;
    const s = prof.sample(t);
    const q = FROM.map((a, j) => a + (TO[j] - a) * s.p);
    const qd = FROM.map((a, j) => (TO[j] - a) * s.v);
    const qdd = FROM.map((a, j) => (TO[j] - a) * s.a);
    const tau = inverseDynamics(chain, q, qd, qdd);
    out.t.push(t);
    out.q.push(q);
    out.qd.push(qd);
    out.tau.push(tau);
    tau.forEach((x, j) => {
      out.peak[j] = Math.max(out.peak[j], Math.abs(x));
      if (Math.abs(x) > limits[j]) out.over = true;
    });
  }
  return out;
}

export default function D2Inertia({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const limits = useMemo(() => torqueLimits(chain), [chain]);
  const motions = useMemo(() => ({ A: plan(chain, 'A', limits), B: plan(chain, 'B', limits), C: plan(chain, 'C', limits) }), [chain, limits]);
  const [done, setDone] = useState<Partial<Record<K, boolean>>>({});
  /** Sample index while a try plays. */
  const [cur, setCur] = useState<{ k: K; i: number } | null>(null);
  const { play, stop, running } = useAnimator();

  useEffect(() => {
    stop();
  }, [step, stop]);

  const m = motions[k];
  const playing = cur && cur.k === k && step !== 'cmp' ? cur.i : null;
  const i = playing ?? (done[k] ? N : 0);
  const q = m.q[i];
  const tauNow = m.tau[i][J];
  const overNow = Math.abs(tauNow) > limits[J];
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  const path = useMemo(() => motions.A.q.filter((_, j) => j % 4 === 0).map((a) => tipOf(chain, a)), [chain, motions]);

  const go = () => {
    if (step === 'cmp') return;
    const key = step;
    const mm = motions[key];
    setDone((d) => ({ ...d, [key]: false }));
    play(
      mm.T,
      (t) => setCur({ k: key, i: Math.min(N, Math.round((t / mm.T) * N)) }),
      () => {
        setCur(null);
        setDone((d) => ({ ...d, [key]: true }));
        record(key, {
          '걸린 시간': `${mm.T.toFixed(2)} s`,
          '최대 토크': `${fmt(mm.peak[J], 2)} N·m (J${J + 1})`,
          '한계 넘음': mm.over ? '예' : '아니오',
        });
      },
    );
  };

  useEffect(() => {
    show({
      angles: step === 'cmp' ? TO : q,
      frames: 'none',
      ghosts: [{ key: 'to', angles: TO, color: LEARN_COLORS.ghost, opacity: 0.25 }],
      lines: [{ key: 'path', points: path, color: LEARN_COLORS.ghost, width: 1.5, dashed: true }],
      labels:
        step === 'cmp'
          ? []
          : [{ key: 'tau', mm: [tip[0], tip[1], tip[2] + 40] as Mm, text: `J1 ${fmt(Math.abs(tauNow), 2)} N·m${overNow ? ' — 한계 넘음' : ''}`, color: overNow ? LEARN_COLORS.bad : STEP_COLORS[k] }],
    });
  }, [q, step, k, tip, tauNow, overNow, path, show]);

  if (step === 'cmp') {
    const x = Array.from({ length: 251 }, (_, j) => (motions.A.T * j) / 250);
    const at = (mm: Motion, t: number) => (t >= mm.T ? mm.tau[N][J] : mm.tau[Math.round((t / mm.T) * N)][J]);
    return (
      <section className={css.card}>
        <h3>J1 토크 겹쳐 보기</h3>
        <Graph
          title="J1 토크 (점선 = 한계)"
          x={x}
          series={(['A', 'B', 'C'] as K[]).map((key) => ({ label: `${NUM[key]} ${TRIES[key].button}`, color: STEP_COLORS[key], values: x.map((t) => at(motions[key], t)) }))}
          unit="N·m"
          limit={limits[J]}
          height={140}
        />
        <div className={css.row3}>
          {(['A', 'B', 'C'] as K[]).map((key) => (
            <Readout key={key} label={`${NUM[key]} 최대 토크`} value={fmt(motions[key].peak[J], 2)} unit="N·m" tone={motions[key].over ? 'bad' : 'ok'} />
          ))}
        </div>
        <p className={css.note}>시간을 1/3 로 줄이면 가속도는 약 9 배 — 토크도 그만큼 튀어요. 급한 사다리꼴은 출발·정지 순간 가속도가 더 커서 한계를 넘어요.</p>
      </section>
    );
  }

  const pick = (rows: number[][]) => rows.map((r) => r[J]);
  return (
    <section className={css.card}>
      <h3>{k === 'A' ? '느리게' : k === 'B' ? '빠르게' : '빠르고 급하게'}</h3>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={running} onClick={go}>
          {TRIES[k].button}
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="걸린 시간" value={m.T.toFixed(2)} unit="s" />
        <Readout label="J1 최대 토크" value={done[k] || playing !== null ? fmt(m.peak[J], 2) : '—'} unit="N·m" tone={done[k] ? (m.over ? 'bad' : 'ok') : undefined} />
        <Readout label="J1 한계" value={fmt(limits[J], 2)} unit="N·m" />
      </div>
      {(done[k] || playing !== null) && (
        <>
          {done[k] && (m.over ? <Verdict tone="bad">토크가 한계(점선)를 넘어요 — 실제 로봇이면 따라가지 못해요.</Verdict> : <Verdict tone="ok">한계 안이에요.</Verdict>)}
          <div className={css.graphs}>
            <Graph title="J1 각도" x={m.t} series={[{ label: '각도', color: LEARN_COLORS.accent, values: pick(m.q) }]} unit="°" cursor={m.t[i]} height={80} />
            <Graph title="J1 속도" x={m.t} series={[{ label: '속도', color: LEARN_COLORS.ok, values: pick(m.qd) }]} unit="°/s" cursor={m.t[i]} height={80} />
            <Graph title="J1 토크 (점선 = 한계)" x={m.t} series={[{ label: '토크', color: m.over ? LEARN_COLORS.bad : STEP_COLORS[k], values: pick(m.tau) }]} unit="N·m" limit={limits[J]} cursor={m.t[i]} height={100} />
          </div>
        </>
      )}
      <p className={css.note}>
        {k === 'A'
          ? '팔을 옆으로 뻗은 채 J1 로 120° 돌려요. J1 은 세로축이라 중력 토크가 0 — 느리면 토크도 거의 0 이에요. (J2 는 팔 무게를 버티느라 늘 비슷한 토크를 써요.)'
          : k === 'B'
            ? '같은 길을 약 3 배 빨리. 출발할 때 밀고(+), 설 때 잡아요(−).'
            : '같은 0.8 초지만 가속을 짧게 몰아서 해요. 출발·정지 순간 가속도가 더 커요.'}
      </p>
    </section>
  );
}
