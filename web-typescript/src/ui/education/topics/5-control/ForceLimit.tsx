'use client';

/**
 * 5-4 힘 제한과 안전 여유: the shoulder (one-joint model, PID 4 · 6 · 0.4)
 * lifts to 60°, and a hand is in the way at 40°. The motor's torque limit is
 * the one thing that changes: 3 → 1.5 → 0.6 N·m. A lower limit presses the
 * hand less — and, with no hand there, the arm gets to 60° more slowly.
 */

import { useEffect, useMemo, useState } from 'react';

import { forwardKinematicsFrames } from '@/engine/robot/kinematics';
import type { Box } from '@/engine/physics/collide';
import { STEP_NAME } from '@/engine/education/catalog';

import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { STEP_COLORS, dist, fmt, tipOf, type Mm } from '../kit';
import { TARGET, TimeGraph, simulate, useJointModel, useJointScene, usePlayback, poseAt, type Run } from './joint1';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const GAINS = { kp: 4, ki: 6, kd: 0.4 };
const HAND_DEG = 40;
const T_END = 3;
const LIMIT: Record<K, number> = { A: 3, B: 1.5, C: 0.6 };
const SKIN = '#f2c3a0';

interface Try {
  limit: number;
  run: Run;
  /** The same limit with no hand: when it settles at 60° (s), or null if it never does. */
  freeS: number | null;
}

export default function ForceLimit({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const model = useJointModel(chain);
  const [limit, setLimit] = useState(LIMIT[k]);
  const [tries, setTries] = useState<Partial<Record<K, Try>>>({});
  const pb = usePlayback(step);
  useEffect(() => {
    // Each try opens with its own limit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step !== 'cmp') setLimit(LIMIT[step]);
  }, [step]);

  // Where the hand is: the gripper tip at θ = 40°, and the lever from J2 to it.
  const hand = useMemo(() => {
    const q = poseAt(HAND_DEG);
    const tip = tipOf(chain, q);
    const frames = forwardKinematicsFrames(chain, q);
    const i = chain.findIndex((s) => s.movableIndex === 1);
    const e = frames[i].elements;
    const lever = dist([e[12] * 1000, e[13] * 1000, e[14] * 1000], tip);
    const box: Box & { color: string } = { min: [tip[0] - 20, tip[1] - 30, tip[2] + 4], max: [tip[0] + 20, tip[1] + 30, tip[2] + 24], name: '손', color: SKIN };
    return { tip, lever, box };
  }, [chain]);
  const gravity40 = model.mgl * Math.sin((HAND_DEG * Math.PI) / 180);
  const hold60 = model.mgl * Math.sin((TARGET * Math.PI) / 180);

  const cur = pb.shown(k);
  const theta = cur ? cur.run.y[cur.i] : 0;
  const push = cur ? cur.run.c[cur.i] : 0;
  // Rebuilt each render (a render is a new sample of the run anyway).
  const extra = {
    boxes: [hand.box],
    contact: push > 0.05 ? { mm: hand.tip as Mm, text: `손을 누름 ${fmt(push, 2)} N·m · ${fmt(push / (hand.lever / 1000), 1)} N` } : null,
    labels: [{ key: 'hand', mm: [hand.tip[0], hand.tip[1], hand.tip[2] + 50] as Mm, text: `손 (어깨 ${HAND_DEG}° 자리)`, color: '#b5562a' }],
  };
  useJointScene(chain, show, { thetaDeg: step === 'cmp' ? HAND_DEG : theta, color: STEP_COLORS[k], run: step === 'cmp' ? null : cur?.run, upTo: cur?.i, extra });

  const go = () => {
    const lim = limit;
    const r = simulate(model, { kg: 0, gains: GAINS, uMax: lim, handDeg: HAND_DEG, T: T_END });
    const free = simulate(model, { kg: 0, gains: GAINS, uMax: lim, T: 4 });
    const t: Try = { limit: lim, run: r, freeS: free.settleS };
    setTries((m) => ({ ...m, [k]: t }));
    pb.start(k, r, () =>
      record(k, {
        '토크 제한': `${lim} N·m`,
        '누르는 토크': `${fmt(r.pushNm, 2)} N·m`,
        '누르는 힘': `${fmt(r.pushNm / (hand.lever / 1000), 1)} N`,
        '손 없을 때 도착': t.freeS === null ? '60° 못 감' : `${fmt(t.freeS, 2)} s`,
      }),
    );
  };

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as const).filter((key) => tries[key]);
    return (
      <section className={css.card}>
        <h3>토크 제한과 손을 누르는 토크</h3>
        {keys.length ? (
          <TimeGraph
            title="손을 누르는 토크 (N·m, 3 초)"
            tEnd={T_END}
            lo={0}
            series={keys.map((key) => ({ key, label: `${STEP_NAME[key]} 제한 ${tries[key]!.limit} N·m`, color: STEP_COLORS[key], y: tries[key]!.run.c }))}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 해 보면 여기 겹쳐 보여요.</p>
        )}
        <p className={css.note}>
          계속 누르는 토크 ≈ 토크 제한 − 40° 에서 팔 무게를 버티는 토크({fmt(gravity40, 2)} N·m). 제한을 낮추면 덜 누르지만, 60° 에서 버티는 데 {fmt(hold60, 2)} N·m 가 필요하니 너무 낮추면 일을 못 해요 — 안전 여유와 작업 능력의 균형.
        </p>
      </section>
    );
  }

  const t = tries[k];
  const done = cur && !cur.playing ? cur.run : null;
  return (
    <section className={css.card}>
      <h3>손이 있는 길로 올리기 — 토크 제한 {limit} N·m</h3>
      <label className={css.slider}>
        <b>토크 제한</b>
        <input type="range" min={0.3} max={3} step={0.1} value={limit} disabled={pb.running} onChange={(e) => setLimit(Number(e.target.value))} aria-label="토크 제한" />
        <span className={css.num}>{limit.toFixed(1)} N·m</span>
      </label>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={pb.running} onClick={go}>
          올리기
        </button>
      </div>
      <TimeGraph
        title="어깨 각도 θ (3 초) — 40° 에 손"
        tEnd={T_END}
        lo={0}
        hi={75}
        marks={[
          { v: TARGET, label: '60°', color: STEP_COLORS.C },
          { v: HAND_DEG, label: '손 40°', color: '#b5562a' },
        ]}
        series={cur ? [{ key: k, label: `제한 ${t?.limit ?? limit} N·m`, color: STEP_COLORS[k], y: cur.run.y.slice(0, cur.i + 1) }] : []}
      />
      <div className={css.row3}>
        <Readout label="손을 누르는 토크" value={cur ? fmt(push, 2) : '–'} unit="N·m" tone={done ? (done.pushNm > 1.5 ? 'bad' : done.pushNm > 0.5 ? 'warn' : 'ok') : undefined} />
        <Readout label="누르는 힘" value={cur ? fmt(push / (hand.lever / 1000), 1) : '–'} unit="N" />
        <Readout label="손 없을 때 60° 도착" value={done && t ? (t.freeS === null ? '못 감' : fmt(t.freeS, 2)) : '–'} unit={done && t && t.freeS !== null ? 's' : ''} />
      </div>
      <p className={css.note}>
        모터 토크를 [토크 제한] 에서 잘라요. 손은 부드러운 용수철로 흉내 냈고, 누르는 힘 = 토크 ÷ 팔 길이({fmt(hand.lever, 0)} mm). 60° 에서 버티려면 {fmt(hold60, 2)} N·m 가 필요해요. 협동 로봇은 이런 제한(힘·파워 제한)으로 사람과 같이 일해요.
      </p>
    </section>
  );
}
