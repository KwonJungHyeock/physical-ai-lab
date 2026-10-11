'use client';

/** 1-1 관절·링크·자유도: one joint draws a circle, two fill a plane, six fill space — 20 random poses point every which way. */

import { useEffect, useMemo, useState } from 'react';

import { forwardKinematicsFrames } from '@/engine/robot/kinematics';
import { solveToolPose } from '@/engine/robot/tool';
import { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN } from '@/engine/robot/limits';
import { mulberry32 } from '@/engine/physics/planning';

import css from '../../learn.module.css';
import { JointSliders, Readout } from '../../widgets';
import { STEP_COLORS, TCP, dist, dots, fmt, tipOf, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const JOINTS: Record<K, number[]> = { A: [0], B: [1, 2], C: [0, 1, 2, 3, 4, 5] };
const SHAPE: Record<K, string> = { A: '원 (선)', B: '면', C: '공간' };
const START: number[] = [0, -20, -60, -10, 0, 0];
const SWEEP_NAME: Record<K, string> = { A: 'J1 끝에서 끝까지', B: 'J2·J3 번갈아 훑기', C: '무작위 자세 20회' };
/** Step C: how many random poses, and the tool-axis stub drawn at each (mm). */
const RANDOM_POSES = 20;
const STUB = 28;

export default function A1Joints({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [q, setQ, qRef] = usePose(START);
  const [traces, setTraces] = useState<Record<K, Mm[]>>({ A: [], B: [], C: [] });
  const [turns, setTurns] = useState<number[][]>([]);
  /** Step C: where the tool pointed at each random pose (tip → tip + axis). */
  const [stubs, setStubs] = useState<Mm[]>([]);
  const anim = useAnimator();
  const { stop } = anim;
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);

  // Each try starts from the same pose.
  useEffect(() => {
    stop();
    if (step !== 'cmp') setQ(START.slice());
    // The step is a prop: a new try starts clean.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns([]);
  }, [step, stop, setQ]);

  const add = (key: K, p: Mm) =>
    setTraces((t) => {
      const last = t[key][t[key].length - 1];
      if (last && dist(last, p) < 2) return t;
      return { ...t, [key]: [...t[key], p] };
    });
  const move = (next: number[]) => {
    setQ(next);
    add(k, tipOf(chain, next));
  };

  const sweep = () => {
    setTraces((t) => ({ ...t, [k]: [] }));
    if (k === 'C') setTurns([]);
    const rng = mulberry32(7);
    const pts: Mm[] = [];
    const sticks: Mm[] = [];
    const D = k === 'C' ? 6 : 3;
    setStubs([]);
    anim.play(
      D,
      (t) => {
        const u = t / D;
        let next: number[];
        if (k === 'A') {
          next = START.slice();
          next[0] = JOINT_ANGLE_MIN[0] + (JOINT_ANGLE_MAX[0] - JOINT_ANGLE_MIN[0]) * u;
          pts.push(tipOf(chain, next));
        } else if (k === 'B') {
          // Raster: J3 in 8 rows, J2 back and forth.
          const rows = 8;
          const r = Math.min(rows - 1, Math.floor(u * rows));
          const f = u * rows - r;
          next = START.slice();
          next[2] = -140 + (r / (rows - 1)) * 150;
          next[1] = r % 2 ? 80 - f * 170 : -90 + f * 170;
          pts.push(tipOf(chain, next));
        } else {
          // One new random pose every D / 20 s (above the table only).
          next = qRef.current.slice();
          while (pts.length < Math.min(RANDOM_POSES, Math.floor(u * RANDOM_POSES) + 1)) {
            const cand = Array.from({ length: 6 }, (_, i) => JOINT_ANGLE_MIN[i] + rng() * (JOINT_ANGLE_MAX[i] - JOINT_ANGLE_MIN[i]));
            const p = tipOf(chain, cand);
            if (p[2] < 20) continue;
            const e = forwardKinematicsFrames(chain, cand).at(-1)!.elements;
            pts.push(p);
            sticks.push(p, [p[0] + e[8] * STUB, p[1] + e[9] * STUB, p[2] + e[10] * STUB]);
            next = cand;
          }
          setStubs(sticks.slice());
        }
        setQ(next);
        setTraces((tr) => ({ ...tr, [k]: pts.slice() }));
      },
      () => {
        setQ(START.slice());
        record(k, { '움직인 관절': JOINTS[k].map((j) => `J${j + 1}`).join('·'), 자유도: String(JOINTS[k].length), '손끝 자취': SHAPE[k], '같은 점에서 손끝 방향': k === 'C' ? '여러 개' : '1개' });
      },
    );
  };

  // Step C: the same tool point, three different directions.
  const turn = () => {
    const p = tipOf(chain, qRef.current);
    const outs = [
      { yawDeg: 0, tiltDeg: 0 },
      { yawDeg: 0, tiltDeg: 35 },
      { yawDeg: 90, tiltDeg: 25 },
    ]
      .map((o) => solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, qRef.current, { tcpMm: TCP, orientation: o, toleranceMm: 1 }))
      .filter((r) => r.converged)
      .map((r) => r.anglesDeg);
    setTurns(outs);
    // The result says how many directions the same point really took.
    record('C', { '움직인 관절': JOINTS.C.map((j) => `J${j + 1}`).join('·'), 자유도: '6', '손끝 자취': SHAPE.C, '같은 점에서 손끝 방향': `${outs.length > 1 ? '여러 개' : '1개'} (${outs.length}가지)` });
  };

  useEffect(() => {
    const keys: K[] = step === 'cmp' ? ['A', 'B', 'C'] : [k];
    show({
      angles: q,
      ghosts: turns.map((a, i) => ({ key: `t${i}`, angles: a, color: ['#3454d1', '#f59a1b', '#e0457b'][i], opacity: 0.3 })),
      lines: [
        ...keys.map((key) => ({
          key,
          points: key === 'C' ? dots(traces.C, 4) : traces[key],
          color: STEP_COLORS[key],
          width: key === 'C' ? 2.5 : 2.5,
          segments: key === 'C',
        })),
        ...(keys.includes('C') && stubs.length ? [{ key: 'stubs', points: stubs, color: '#ffffff', width: 2, segments: true }] : []),
      ],
      labels: [{ key: 'tip', mm: [tip[0], tip[1], tip[2] + 26], text: `손끝 (${fmt(tip[0], 0)}, ${fmt(tip[1], 0)}, ${fmt(tip[2], 0)})`, color: STEP_COLORS[k] }],
    });
  }, [q, traces, turns, stubs, tip, k, step, show]);

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>자취 겹쳐 보기</h3>
        <p className={css.note}>
          주황 = 관절 1개(원) · 하늘 = 관절 2개(면) · 초록 = 관절 6개(공간). 점 수: {traces.A.length} / {traces.B.length} / {traces.C.length}
        </p>
      </section>
    );

  return (
    <section className={css.card}>
      <h3>
        관절 {JOINTS[k].length}개 · 자유도 {JOINTS[k].length}
      </h3>
      <JointSliders angles={q} onChange={move} joints={JOINTS[k]} disabled={anim.running} />
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={anim.running} onClick={sweep}>
          {SWEEP_NAME[k]}
        </button>
        <button
          type="button"
          disabled={anim.running}
          onClick={() => {
            setTraces((t) => ({ ...t, [k]: [] }));
            if (k === 'C') setStubs([]);
          }}
        >
          자취 지우기
        </button>
        {k === 'C' && (
          <button type="button" disabled={anim.running} onClick={turn}>
            같은 점, 방향 바꾸기
          </button>
        )}
      </div>
      <div className={css.row3}>
        <Readout label="자취 점" value={String(traces[k].length)} />
        <Readout label="손끝 높이" value={fmt(tip[2], 0)} unit="mm" />
        <Readout label="바닥에서 거리" value={fmt(Math.hypot(tip[0], tip[1]), 0)} unit="mm" />
      </div>
      {k === 'C' && stubs.length > 0 && <p className={css.note}>초록 점 = 무작위 자세의 손끝, 흰 막대 = 그때 그리퍼가 향한 방향. 점이 공간에 흩어지고, 방향도 제각각이에요.</p>}
      {k === 'C' && turns.length > 0 && <p className={css.note}>반투명 팔 {turns.length}개: 손끝은 같은 점, 방향(아래 · 앞으로 35° · 옆으로 25° 기울임)만 달라요.</p>}
      {k === 'B' && <p className={css.note}>J2·J3 는 둘 다 옆으로 누운 축이라, 손끝이 한 세로 평면 안에서만 움직여요.</p>}
    </section>
  );
}
