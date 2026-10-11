'use client';

/** D1 중력 토크: A upright → half bent (J2 torque 0 → large), B the same pose holding 0 → 250 g, C 250 g with the arm stretched out. */

import { useEffect, useMemo, useState } from 'react';

import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import { gravityTorques, torqueLimits } from '@/engine/physics/dynamics';

import css from '../../learn.module.css';
import { Bars, Readout } from '../../widgets';
import { LEARN_COLORS, RealButton, STEP_COLORS, fmt, tipOf, useGlide, usePose, type Mm, TCP } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

const UP = [0, 0, 0, 0, 0, 0];
const HALF = [0, -45, -45, 0, 0, 0];
const REACH = [0, -90, 0, 0, 0, 0];
const MAX_G = 250;
const START: Record<K, { q: number[]; g: number }> = { A: { q: UP, g: 0 }, B: { q: HALF, g: 0 }, C: { q: HALF, g: MAX_G } };
/** Bars for the joints gravity loads (J2–J4; J1, J5, J6 turn about upright axes here). */
const SHOWN = [1, 2, 3];

/**
 * The shoulder's lever arm: J2's origin (mm), the level direction across its axis, and how far the tool
 * point lies along it (mm) — the "수평 거리" a weight at the tool turns J2 with (an offset along the
 * axis itself adds no torque, so it is not counted).
 */
function shoulderLever(chain: readonly ChainSegment[], q: readonly number[]): { at: Mm; dir: Mm; d: number } {
  const frames = forwardKinematicsFrames(chain, q);
  const i = Math.max(0, chain.findIndex((seg) => seg.movableIndex === 1));
  const e = frames[i].elements;
  const at: Mm = [e[12] * 1000, e[13] * 1000, e[14] * 1000];
  const ax = chain[i].axis.clone().transformDirection(frames[i]);
  // Level, across the axis: axis × up.
  const n = Math.hypot(ax.y, ax.x) || 1;
  const dir: Mm = [ax.y / n, -ax.x / n, 0];
  const tip = tipOf(chain, q);
  const d = (tip[0] - at[0]) * dir[0] + (tip[1] - at[1]) * dir[1];
  return d < 0 ? { at, dir: [-dir[0], -dir[1], 0], d: -d } : { at, dir, d };
}

export default function D1Gravity({ chain, show, real, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const [q, setQ, qRef] = usePose(UP);
  const { glide, running, stop } = useGlide(setQ, qRef);
  const [payloadG, setPayloadG] = useState(0);
  const [bG, setBG] = useState(MAX_G);

  const limits = useMemo(() => torqueLimits(chain), [chain]);
  const tau = useMemo(() => gravityTorques(chain, q, { payloadKg: payloadG / 1000, tcpMm: TCP }), [chain, q, payloadG]);
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  const arm = useMemo(() => shoulderLever(chain, q), [chain, q]);
  const j2 = arm.at;
  const pct = (v: number) => Math.round((Math.abs(v) / limits[1]) * 100);
  const j2Of = (pose: readonly number[], g: number) => gravityTorques(chain, pose, { payloadKg: g / 1000, tcpMm: TCP })[1];
  /** Level distance from the shoulder (J2) to the tool in a pose, mm. */
  const leverOf = (pose: readonly number[]) => shoulderLever(chain, pose).d;

  // Each try starts from its own pose and weight.
  useEffect(() => {
    stop();
    if (step === 'cmp') return;
    setQ(START[step].q.slice());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the step tabs pick the starting weight; the panel is not remounted per step
    setPayloadG(START[step].g);
  }, [step, stop, setQ]);

  const pose = (to: number[], done?: () => void) => glide(to, 1.4, done);

  const bend = () =>
    pose(HALF, () => {
      const a = j2Of(UP, 0);
      const b = j2Of(HALF, 0);
      record('A', { 자세: '세움 → 반쯤 숙임', 무게: '0 g', 'J2 토크': `${fmt(Math.abs(a), 2)} → ${fmt(Math.abs(b), 2)} N·m`, '한계 대비': `${pct(a)} → ${pct(b)} %` });
    });

  const weigh = (g: number) => {
    setPayloadG(g);
    if (g > 0) {
      setBG(g);
      const v = j2Of(HALF, g);
      record('B', { 자세: '반쯤 숙임', 무게: `${g} g`, 'J2 토크': `${fmt(Math.abs(v), 2)} N·m`, '한계 대비': `${pct(v)} %`, '어깨~손끝 수평 거리': `${fmt(leverOf(HALF), 0)} mm` });
    }
  };

  const stretch = () =>
    pose(REACH, () => {
      const v = j2Of(REACH, MAX_G);
      record('C', { 자세: '앞으로 뻗음', 무게: `${MAX_G} g`, 'J2 토크': `${fmt(Math.abs(v), 2)} N·m`, '한계 대비': `${pct(v)} %`, '어깨~손끝 수평 거리': `${fmt(leverOf(HALF), 0)} → ${fmt(leverOf(REACH), 0)} mm` });
    });

  const over = Math.abs(tau[1]) > limits[1];
  const j2Pct = pct(tau[1]);
  const lever = arm.d;
  const foot = useMemo((): Mm => [arm.at[0] + arm.dir[0] * arm.d, arm.at[1] + arm.dir[1] * arm.d, arm.at[2]], [arm]);

  useEffect(() => {
    const cmp = step === 'cmp';
    show({
      angles: cmp ? REACH : q,
      frames: 'none',
      ghosts: cmp
        ? [
            { key: 'up', angles: UP, color: LEARN_COLORS.ghost, opacity: 0.2 },
            { key: 'half', angles: HALF, color: STEP_COLORS.A, opacity: 0.3 },
          ]
        : [],
      payload: !cmp && payloadG > 0 ? { mm: tip, kg: payloadG / 1000 } : cmp ? { mm: tipOf(chain, REACH), kg: MAX_G / 1000 } : null,
      lines: cmp
        ? []
        : [
            // Lever arm: level distance from the shoulder (J2) to the tool, and the weight's line of action.
            { key: 'r', points: [j2, foot], color: LEARN_COLORS.warn, width: 3 },
            { key: 'g', points: [[tip[0], tip[1], Math.max(tip[2], j2[2]) + 10], [tip[0], tip[1], 0]], color: LEARN_COLORS.ghost, width: 1.5, dashed: true },
          ],
      labels: cmp
        ? []
        : [
            { key: 'j2', mm: [j2[0], j2[1], j2[2] + 40], text: `J2 ${fmt(Math.abs(tau[1]), 2)} N·m (${j2Pct}%)`, color: over ? LEARN_COLORS.bad : LEARN_COLORS.accent },
            { key: 'r', mm: [(j2[0] + foot[0]) / 2, (j2[1] + foot[1]) / 2, j2[2] - 18], text: `수평 거리 ${fmt(lever, 0)} mm`, color: LEARN_COLORS.warn },
          ],
    });
  }, [q, step, payloadG, tip, j2, foot, tau, over, j2Pct, lever, chain, show]);

  if (step === 'cmp') {
    const rows = [
      { label: '세움 0 g', v: j2Of(UP, 0) },
      { label: '활동 1 숙임 0 g', v: j2Of(HALF, 0) },
      { label: `활동 2 숙임 ${bG} g`, v: j2Of(HALF, bG) },
      { label: `활동 3 뻗음 ${MAX_G} g`, v: j2Of(REACH, MAX_G) },
    ];
    return (
      <section className={css.card}>
        <h3>J2 토크 모아 보기</h3>
        <Bars values={rows.map((r) => Math.abs(r.v))} limits={rows.map(() => limits[1])} labels={rows.map((r) => r.label)} unit="N·m" />
        <p className={css.note}>세로선 = J2 모터 한계 ({fmt(limits[1], 2)} N·m). 무게가 같아도 멀리 뻗을수록, 같은 자세라도 무거울수록 커져요.</p>
      </section>
    );
  }

  return (
    <section className={css.card}>
      <h3>{k === 'A' ? '버티는 자세' : k === 'B' ? '무게 들기' : '팔 뻗기'}</h3>
      {k === 'A' && (
        <div className={css.btnRow}>
          <button type="button" disabled={running} onClick={() => pose(UP)}>
            세운 자세
          </button>
          <button type="button" className={css.primary} disabled={running} onClick={bend}>
            반쯤 숙인 자세
          </button>
        </div>
      )}
      {k === 'B' && (
        <label className={css.slider}>
          <b>무게</b>
          <input type="range" min={0} max={MAX_G} step={10} value={payloadG} onChange={(e) => weigh(Number(e.target.value))} aria-label="무게" />
          <span className={css.num}>{payloadG} g</span>
        </label>
      )}
      {k === 'C' && (
        <div className={css.btnRow}>
          <button type="button" className={css.primary} disabled={running} onClick={stretch}>
            팔 뻗기
          </button>
          <button type="button" disabled={running} onClick={() => pose(HALF)}>
            반쯤 숙인 자세로
          </button>
        </div>
      )}
      <Bars values={SHOWN.map((j) => tau[j])} limits={SHOWN.map((j) => limits[j])} labels={SHOWN.map((j) => `J${j + 1}`)} unit="N·m" />
      <div className={css.row3}>
        <Readout label="J2 토크" value={fmt(Math.abs(tau[1]), 2)} unit="N·m" tone={over ? 'bad' : j2Pct > 75 ? 'warn' : 'ok'} />
        <Readout label="한계 대비" value={String(j2Pct)} unit="%" tone={over ? 'bad' : j2Pct > 75 ? 'warn' : 'ok'} />
        <Readout label="어깨~손끝 수평 거리" value={fmt(lever, 0)} unit="mm" />
      </div>
      <p className={css.note}>
        {k === 'A'
          ? '세우면 팔 무게가 J2 축 바로 위를 지나 토크가 거의 0. 숙이면 팔이 앞으로 나가 토크가 커져요. 주황 선 = 어깨에서 손끝까지의 수평 거리(짐을 들면 이 거리가 토크를 정해요).'
          : k === 'B'
            ? '무게는 손끝(공)에 달려요. J2 가 가장 많이 늘어요. 축에서 가장 멀기 때문이에요.'
            : '막대의 세로선이 모터 한계예요 (250 g 을 다 뻗어 버티는 데 필요한 토크 + 20%, 근사값).'}
      </p>
      {k !== 'B' && <RealButton real={real} chain={chain} angles={q} />}
    </section>
  );
}
