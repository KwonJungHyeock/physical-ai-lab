'use client';

/** C3 관절 동기화: one joint move — A each joint at its own top speed, B all in a fixed 2 s, C all stretched to the slowest joint's time. */

import { useEffect, useMemo, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { quinticProfile, trapezoid, type Profile } from '@/engine/physics/planning';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Bars, Graph, JointSliders, Readout } from '../../widgets';
import { LEARN_COLORS, RealButton, STEP_COLORS, fmt, tipOf, useAnimator, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

/** From P to Q: J1 turns 90°, J3 60°, J2 30°, the wrist a little. */
const P = [-45, 10, -80, -20, 0, 0];
const Q = [45, -20, -20, -10, 5, 0];
const DQ = Q.map((v, i) => v - P[i]);
const MOVING = [0, 1, 2, 3, 4];
/** Demo limits, the same for every joint. */
const V_MAX = 90; // °/s
const A_MAX = 300; // °/s²
const B_TIME = 2;
const JOINT_COLORS = ['#e5484d', '#f59a1b', '#1fae66', '#3454d1', '#7a5cf5', '#98a2b3'];
const BUTTON: Record<K, string> = { A: '따로', B: '같은 시간', C: '가장 느린 관절에 맞춤' };
const NUM: Record<K, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };

/** Each joint alone at full speed: its own trapezoid and time Tᵢ. */
const ALONE: Profile[] = DQ.map((d) => trapezoid(d, V_MAX, A_MAX));
const T_ALONE = ALONE.map((p) => p.durationS);
const REF = T_ALONE.reduce((b, t, i) => (t > T_ALONE[b] ? i : b), 0);

interface Plan {
  T: number;
  /** When each joint stops, s. */
  stops: number[];
  at(t: number): { q: number[]; v: number[] };
}

function makePlan(k: K): Plan {
  if (k === 'A') {
    return {
      T: T_ALONE[REF],
      stops: T_ALONE,
      at(t) {
        const s = ALONE.map((p) => p.sample(t));
        return { q: P.map((a, i) => a + s[i].p), v: s.map((x) => x.v) };
      },
    };
  }
  // One shared progress s(t) from 0 to 1: every joint is at the same fraction of its turn.
  const prof = k === 'B' ? quinticProfile(1, B_TIME) : trapezoid(1, V_MAX / Math.abs(DQ[REF]), A_MAX / Math.abs(DQ[REF]));
  return {
    T: prof.durationS,
    stops: DQ.map(() => prof.durationS),
    at(t) {
      const s = prof.sample(t);
      return { q: P.map((a, i) => a + DQ[i] * s.p), v: DQ.map((d) => d * s.v) };
    },
  };
}

const PLANS: Record<K, Plan> = { A: makePlan('A'), B: makePlan('B'), C: makePlan('C') };
const N = 150;

interface Sampled {
  t: number[];
  /** Joint speeds, °/s, per joint. */
  v: number[][];
  /** Tool (flange) points, mm. */
  pts: Mm[];
}

function sample(chain: readonly ChainSegment[], plan: Plan): Sampled {
  const t = Array.from({ length: N + 1 }, (_, j) => (plan.T * j) / N);
  const at = t.map((x) => plan.at(x));
  return { t, v: DQ.map((_, i) => at.map((a) => a.v[i])), pts: at.map((a) => tipOf(chain, a.q)) };
}

export default function C3Sync({ chain, show, real, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [done, setDone] = useState<Partial<Record<K, boolean>>>({});
  /** Time in the current try while it plays; null: not playing. */
  const [cur, setCur] = useState<{ k: K; t: number } | null>(null);
  const { play, stop, running } = useAnimator();
  const runs = useMemo(() => ({ A: sample(chain, PLANS.A), B: sample(chain, PLANS.B), C: sample(chain, PLANS.C) }), [chain]);

  useEffect(() => {
    stop();
  }, [step, stop]);

  const plan = PLANS[k];
  const playing = cur && cur.k === k && step !== 'cmp' ? cur.t : null;
  const t = playing ?? (done[k] ? plan.T : 0);
  const q = useMemo(() => plan.at(t).q, [plan, t]);
  const vNow = useMemo(() => plan.at(t).v, [plan, t]);

  const go = () => {
    if (step === 'cmp') return;
    const key = step;
    const p = PLANS[key];
    setDone((d) => ({ ...d, [key]: false }));
    play(
      p.T,
      (x) => setCur({ k: key, t: x }),
      () => {
        setCur(null);
        setDone((d) => ({ ...d, [key]: true }));
        const first = Math.min(...MOVING.map((j) => p.stops[j]));
        record(key, {
          '걸린 시간': `${p.T.toFixed(2)} s`,
          '관절이 멈춘 시각': key === 'A' ? `제각각 (${first.toFixed(2)}~${p.T.toFixed(2)} s)` : `동시에 (${p.T.toFixed(2)} s)`,
          '손끝 자취': key === 'A' ? '꺾임' : '매끄러움',
        });
      },
    );
  };

  // A: where the tool is when each joint stops — the kinks in its trace.
  const stopMarks = useMemo(
    () =>
      MOVING.filter((j) => T_ALONE[j] < PLANS.A.T - 1e-6).map((j) => {
        const p = tipOf(chain, PLANS.A.at(T_ALONE[j]).q);
        return { key: `s${j}`, at: p, text: `J${j + 1} 멈춤`, j };
      }),
    [chain],
  );

  useEffect(() => {
    const keys: K[] = step === 'cmp' ? ['A', 'B', 'C'] : [k];
    const lift = { A: 0, B: 0, C: 3 };
    const visible = (key: K) => {
      const r = runs[key];
      if (step === 'cmp') return done[key] ? r.pts : [];
      if (playing !== null) return r.pts.filter((_, j) => r.t[j] <= playing + 1e-9);
      return done[key] ? r.pts : [];
    };
    const marks = k === 'A' && step !== 'cmp' ? stopMarks.filter((m) => (playing ?? (done.A ? Infinity : -1)) >= T_ALONE[m.j]) : [];
    show({
      angles: step === 'cmp' ? Q : q,
      frames: 'none',
      ghosts: [
        { key: 'P', angles: P, color: LEARN_COLORS.ghost, opacity: 0.18 },
        { key: 'Q', angles: Q, color: LEARN_COLORS.ghost, opacity: 0.28 },
      ],
      lines: [
        ...keys.map((key) => ({ key: `tr${key}`, points: visible(key).map((p): Mm => [p[0], p[1], p[2] + lift[key]]), color: STEP_COLORS[key], width: 3 })),
        ...(marks.length ? [{ key: 'marks', points: marks.flatMap((m) => [[m.at[0], m.at[1], m.at[2] - 6], [m.at[0], m.at[1], m.at[2] + 6]] as Mm[]), color: LEARN_COLORS.bad, width: 3, segments: true }] : []),
      ],
      labels: [
        ...marks.map((m) => ({ key: m.key, mm: [m.at[0], m.at[1], m.at[2] + 18] as Mm, text: m.text, color: JOINT_COLORS[m.j] })),
        ...(k === 'C' && step !== 'cmp' ? [{ key: 'ref', mm: [0, 0, 330] as Mm, text: `기준: J${REF + 1} (혼자 ${T_ALONE[REF].toFixed(2)} s)`, color: STEP_COLORS.C }] : []),
      ],
    });
  }, [q, step, k, runs, done, playing, stopMarks, show]);

  if (step === 'cmp') {
    const Tm = Math.max(...(['A', 'B', 'C'] as K[]).map((key) => PLANS[key].T));
    const x = Array.from({ length: 201 }, (_, j) => (Tm * j) / 200);
    const J = 2; // J3: stops early in A, slow in B
    return (
      <section className={css.card}>
        <h3>걸린 시간과 손끝 자취</h3>
        <div className={css.row3}>
          {(['A', 'B', 'C'] as K[]).map((key) => (
            <Readout key={key} label={`${NUM[key]} ${BUTTON[key]}`} value={PLANS[key].T.toFixed(2)} unit="s" />
          ))}
        </div>
        <Graph
          title={`J${J + 1} 속도`}
          x={x}
          series={(['A', 'B', 'C'] as K[]).map((key) => ({ label: `${NUM[key]} ${BUTTON[key]}`, color: STEP_COLORS[key], values: x.map((tt) => (tt > PLANS[key].T ? 0 : PLANS[key].at(tt).v[J])) }))}
          unit="°/s"
          limit={V_MAX}
          height={120}
        />
        <p className={css.note}>3D: 해 본 자취만 보여요. 활동 2 와 3 은 같은 길(초록이 하늘색 위에 겹침)이고 시간만 달라요. 활동 1 은 관절이 하나씩 멈출 때마다 꺾여요.</p>
      </section>
    );
  }

  const r = runs[k];
  const show2 = done[k] || playing !== null;
  return (
    <section className={css.card}>
      <h3>{k === 'A' ? '관절마다 최고 속도로 따로' : k === 'B' ? '모두 2 초에 끝나게' : '가장 느린 관절에 맞춰 함께'}</h3>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={running} onClick={go}>
          {BUTTON[k]}
        </button>
      </div>
      <JointSliders angles={q} onChange={() => undefined} disabled joints={MOVING} highlight={k === 'C' ? REF : null} />
      {k === 'C' && (
        <>
          <p className={css.live}>
            관절마다 혼자 최고 속도로 돌 때 걸리는 시간 <Sym s="Tᵢ" /> (세로선 = 그중 가장 긴 시간 = 모두 함께 걸릴 시간 <Sym s="T" name={false} />):
          </p>
          <Bars values={MOVING.map((j) => T_ALONE[j])} limits={MOVING.map(() => T_ALONE[REF])} unit="s" labels={MOVING.map((j) => (j === REF ? `J${j + 1} 기준` : `J${j + 1}`))} />
        </>
      )}
      {show2 && (
        <Graph
          title="관절 속도 (점선 = 최고 속도 90°/s)"
          x={r.t}
          series={MOVING.map((j) => ({ label: k === 'C' && j === REF ? `J${j + 1} (기준)` : `J${j + 1}`, color: JOINT_COLORS[j], values: r.v[j] }))}
          unit="°/s"
          limit={V_MAX}
          cursor={t}
          height={130}
        />
      )}
      <div className={css.row3}>
        <Readout label="시간" value={`${t.toFixed(2)} / ${plan.T.toFixed(2)}`} unit="s" />
        <Readout label="J1 속도" value={fmt(vNow[0], 0)} unit="°/s" />
        <Readout label="J3 속도" value={fmt(vNow[2], 0)} unit="°/s" />
      </div>
      <p className={css.note}>
        {k === 'A'
          ? `관절 한계(시연용): 최고 속도 ${V_MAX}°/s, 가속도 ${A_MAX}°/s². 많이 도는 J1 이 가장 늦게 서요.`
          : k === 'B'
            ? '모두 같은 비율로 돌아 함께 서요. 모든 관절이 「전체의 몇 %」 를 같이 지나가요.'
            : `J${REF + 1} 이 혼자 ${T_ALONE[REF].toFixed(2)} 초 걸려요. 나머지 관절은 그 시간에 맞춰 천천히 돌아요.`}
      </p>
      {k === 'C' && (
        <>
          <RealButton real={real} chain={chain} angles={P} label="실물: 시작 자세로" />
          <RealButton real={real} chain={chain} angles={Q} label="실물: 끝 자세로 (myCobot 은 관절을 맞춰 움직여요)" />
        </>
      )}
    </section>
  );
}
