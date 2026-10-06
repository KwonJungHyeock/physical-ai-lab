'use client';

/** 1-2 위치와 자세: x·y on the table grid, then height z above a block, then the same point at pitch 0° / 45° / 90°. */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Euler, Matrix4 } from 'three';

import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import { solveToolPose, type ToolOrientation } from '@/engine/robot/tool';
import type { Box } from '@/engine/physics/collide';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, TCP, fmt, tipOf, useGlide, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** Step C: pitch (tilt from straight down, toward the front) at one point. */
const HOLDS = [
  { name: '피치 0°', o: { yawDeg: 0, tiltDeg: 0 } },
  { name: '피치 45°', o: { yawDeg: 0, tiltDeg: 45 } },
  { name: '피치 90°', o: { yawDeg: 0, tiltDeg: 90 } },
];
const FIXED: Mm = [200, 0, 100];
/** Step A: a cell to try without clicking the table (the same as clicking it). */
const EXAMPLE: [number, number] = [200, 60];
/** Step B: a block 40 mm tall under the chosen spot; stop 20 mm above it. */
const BLOCK_H = 40;
const ABOVE = 20;
/**
 * IK for the tool point within 0.3 mm (the shared helper allows 1 mm): the panel then reads the
 * very numbers the 원고 promises — (200, 60, 40), (200, 60, 60), (200, 0, 100) — not 199 or 59.
 */
function reachFor(chain: readonly ChainSegment[], mm: Mm, seed: readonly number[], o: ToolOrientation) {
  const r = solveToolPose(chain, { x: mm[0], y: mm[1], z: mm[2] }, seed, { tcpMm: TCP, orientation: o, toleranceMm: 0.3 });
  return r.converged ? r.anglesDeg : null;
}

/** The tool point an answer really reaches, rounded to mm — what the result chips report. */
const at = (chain: TopicProps['chain'], a: readonly number[]) => tipOf(chain, a).map((v) => Math.round(v)).join(', ');

const AXES: { key: string; mm: Mm; text: string; color: string }[] = [
  { key: 'x', mm: [150, 0, 4], text: '+x 앞', color: '#e5484d' },
  { key: 'y', mm: [0, 150, 4], text: '+y 왼쪽', color: '#1fae66' },
  { key: 'z', mm: [0, 0, 330], text: '+z 위', color: '#3454d1' },
];

export default function A2Pose({ chain, show, onPick, step, record }: TopicProps) {
  const [q, setQ, qRef] = usePose(HOME_POSE);
  const { glide, running } = useGlide(setQ, qRef);
  const [xy, setXy] = useState<[number, number]>([200, 60]);
  const [z, setZ] = useState(BLOCK_H + ABOVE + 40);
  const [hold, setHold] = useState(0);
  const [miss, setMiss] = useState(false);
  const [held, setHeld] = useState<number[][]>([]);
  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  // Step C reads roll · pitch · yaw from the gripper looking straight down (피치 0° = 아래를 봄), as the buttons name them.
  const down = useMemo(() => {
    const a = reachFor(chain, FIXED, HOME_POSE, HOLDS[0].o);
    return a ? new Matrix4().extractRotation(forwardKinematicsFrames(chain, a).at(-1)!).invert() : null;
  }, [chain]);
  const rpy = useMemo(() => {
    if (!down) return [0, 0, 0];
    const rel = down.clone().multiply(new Matrix4().extractRotation(forwardKinematicsFrames(chain, q).at(-1)!));
    const e = new Euler().setFromRotationMatrix(rel, 'ZYX');
    return [e.x, e.y, e.z].map((v) => (v * 180) / Math.PI);
  }, [chain, q, down]);

  const target = useMemo<Mm>(() => (step === 'A' ? [xy[0], xy[1], 0] : step === 'B' ? [xy[0], xy[1], z] : FIXED), [step, xy, z]);
  const block = useMemo<Box>(() => ({ min: [xy[0] - 15, xy[1] - 15, 0], max: [xy[0] + 15, xy[1] + 15, BLOCK_H], name: '블록' }), [xy]);

  const goTo = useCallback(
    (mm: Mm, holdIx = 0) => {
      // Step A points at the table spot from 40 mm above it.
      const aim: Mm = mm[2] < 1 ? [mm[0], mm[1], 40] : mm;
      // From the current pose first (a short move), else from home.
      const a = reachFor(chain, aim, qRef.current, HOLDS[holdIx].o) ?? reachFor(chain, aim, HOME_POSE, HOLDS[holdIx].o);
      setMiss(!a);
      if (a) glide(a, 1);
      return a;
    },
    [chain, qRef, glide],
  );

  const pickCell = useCallback(
    (mx: number, my: number) => {
      // The centre of the 10 mm grid cell that was clicked.
      const x = Math.round(mx / 10) * 10;
      const y = Math.round(my / 10) * 10;
      setXy([x, y]);
      const a = goTo(step === 'A' ? [x, y, 0] : [x, y, z]);
      if (a && step === 'A') record('A', { '손끝 x·y·z': at(chain, a), '피치': '0°', '바뀐 숫자': '2개 (x, y)' });
    },
    [chain, step, z, goTo, record],
  );

  useEffect(() => {
    if (step !== 'A' && step !== 'B') {
      onPick(null);
      return;
    }
    onPick((mm) => pickCell(mm[0], mm[1]));
    return () => onPick(null);
  }, [step, onPick, pickCell]);

  useEffect(() => {
    show({
      angles: q,
      frames: step === 'C' ? 6 : 0,
      ghosts: step === 'cmp' ? held.map((a, i) => ({ key: `h${i}`, angles: a, color: ['#3454d1', '#f59a1b', '#e0457b'][i], opacity: 0.3 })) : [],
      target: { mm: target, ok: !miss, label: step === 'C' || step === 'cmp' ? '같은 위치' : `(${fmt(target[0], 0)}, ${fmt(target[1], 0)}${step === 'B' ? `, ${fmt(target[2], 0)}` : ''})` },
      boxes: step === 'B' ? [{ ...block, color: '#e5484d' }] : [],
      lines: [
        { key: 'x', points: [[0, 0, 1], [150, 0, 1]], color: '#e5484d', width: 3 },
        { key: 'y', points: [[0, 0, 1], [0, 150, 1]], color: '#1fae66', width: 3 },
        { key: 'z', points: [[0, 0, 0], [0, 0, 320]], color: '#3454d1', width: 3 },
        ...(step === 'B' ? [{ key: 'drop', points: [[target[0], target[1], 0], [target[0], target[1], target[2]]] as Mm[], color: LEARN_COLORS.accent, dashed: true }] : []),
        ...(step === 'A' || step === 'B' ? [{ key: 'px', points: [[target[0], 0, 1], [target[0], target[1], 1], [0, target[1], 1]] as Mm[], color: '#98a2b3', dashed: true }] : []),
      ],
      labels: step === 'B' ? [...AXES, { key: 'blk', mm: [xy[0], xy[1] - 40, BLOCK_H], text: `블록 윗면 ${BLOCK_H} mm`, color: '#e5484d' }] : AXES,
    });
  }, [q, step, target, miss, held, block, xy, show]);

  const turn = (i: number) => {
    setHold(i);
    const a = goTo(FIXED, i);
    if (!a) return;
    const next = held.slice();
    next[i] = a;
    setHeld(next);
    // The same point at all three pitches: report it only if the three answers really share it.
    const pts = next.filter(Boolean).map((b) => at(chain, b));
    if (pts.length >= 3) record('C', { '손끝 x·y·z': new Set(pts).size === 1 ? `${pts[0]} (그대로)` : pts.join(' / '), '피치': '0° → 45° → 90°', '바뀐 숫자': '1개 (피치)' });
  };

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>같은 위치, 세 피치</h3>
        <p className={css.note}>활동 3에서 만든 피치 0° · 45° · 90° 자세가 반투명으로 겹쳐 보여요. 손끝 위치는 같고, 그리퍼가 바라보는 방향과 팔 모양이 달라요.</p>
      </section>
    );

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '책상 격자에서 목표 칸 고르기' : step === 'B' ? `높이 z — 블록 위 ${ABOVE} mm 에 멈추기` : '같은 위치에서 피치 바꾸기'}</h3>
      {step === 'A' && (
        <div className={css.btnRow}>
          <button type="button" className={css.primary} disabled={running} onClick={() => pickCell(EXAMPLE[0], EXAMPLE[1])}>
            예시 칸 (200, 60)
          </button>
        </div>
      )}
      {step === 'B' && (
        <label className={css.slider}>
          <b>
            <Sym s="z" />
          </b>
          <input type="range" min={BLOCK_H + 10} max={250} step={5} value={z} onChange={(e) => setZ(Number(e.target.value))} aria-label="높이" />
          <span className={css.num}>{z} mm</span>
        </label>
      )}
      {step === 'B' && (
        <div className={css.btnRow}>
          <button
            type="button"
            className={css.primary}
            disabled={running}
            onClick={() => {
              const a = goTo([xy[0], xy[1], z]);
              if (a && z === BLOCK_H + ABOVE) record('B', { '손끝 x·y·z': at(chain, a), '피치': '0°', '바뀐 숫자': '1개 (z)' });
            }}
          >
            이 높이로 가기
          </button>
        </div>
      )}
      {step === 'C' && (
        <div className={css.seg} role="group" aria-label="자세">
          {HOLDS.map((h, i) => (
            <button key={h.name} type="button" aria-pressed={hold === i} disabled={running} onClick={() => turn(i)}>
              {h.name}
            </button>
          ))}
        </div>
      )}
      <div className={css.row3}>
        <Readout label="x (앞)" value={fmt(tip[0], 0)} unit="mm" />
        <Readout label="y (왼쪽)" value={fmt(tip[1], 0)} unit="mm" />
        <Readout label="z (위)" value={fmt(tip[2], 0)} unit="mm" />
      </div>
      {step === 'C' && (
        <div className={css.row3}>
          <Readout label="롤 (비틀기)" value={fmt(rpy[0], 0)} unit="°" />
          <Readout label="피치 (숙이기)" value={fmt(rpy[1], 0)} unit="°" />
          <Readout label="요 (좌우 돌리기)" value={fmt(rpy[2], 0)} unit="°" />
        </div>
      )}
      {step === 'B' && (
        <p className={css.live}>
          블록 윗면 {BLOCK_H} mm + {ABOVE} mm = 목표 z {BLOCK_H + ABOVE} mm. 지금 z = {z} mm{z === BLOCK_H + ABOVE ? ' ✓' : ''}
        </p>
      )}
      {miss && <p className={css.warnNote}>그 점은 손이 닿지 않아요(작업 공간 밖). 더 가까운 곳을 골라 보세요.</p>}
      <p className={css.note}>
        {step === 'A'
          ? '책상 격자의 칸을 클릭하거나 [예시 칸] 을 누르세요. 빨강 = +x(앞), 초록 = +y(왼쪽). 점선이 x·y 를 읽는 법이에요. 손끝은 그 칸 40 mm 위로 가요.'
          : step === 'B'
            ? '활동 1에서 고른 칸(또는 책상을 클릭한 곳)에 블록이 있어요. 높이 슬라이더로 z 만 바꿔 보세요 — x·y 는 그대로예요.'
            : '위치(x·y·z)는 그대로, 피치(아래를 보는 자세에서 앞으로 숙인 각)와 팔 모양이 바뀌어요. 롤·피치·요는 피치 0°(아래를 봄) 자세를 0 으로 재요. 세 버튼을 모두 눌러 보세요.'}
      </p>
    </section>
  );
}
