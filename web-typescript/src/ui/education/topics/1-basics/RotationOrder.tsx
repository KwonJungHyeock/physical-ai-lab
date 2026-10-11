'use client';

/**
 * 1-3 자세 표현 — 회전의 순서: a gripper model held in the air beside the arm.
 * A: roll, pitch and yaw one at a time (R = Rz(요)·Ry(피치)·Rx(롤), the URDF's
 * convention). B: the same two 90° turns about the fixed x and y axes in the
 * two orders — they end differently. C: pitch 90° — the roll axis lies on the
 * yaw axis, so roll and yaw make the same turn (only 요 − 롤 matters).
 */

import { useEffect, useMemo, useState } from 'react';
import { Euler, Quaternion, Vector3 } from 'three';

import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, Verdict, ease, fmt, useAnimator, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** Where the model floats: in front of the arm, to its right as the camera sees it. */
const AT: Mm = [140, -300, 190];
const D2R = Math.PI / 180;
type Quat = readonly [number, number, number, number];
const ID: Quat = [0, 0, 0, 1];
const AXIS_COLOR = { roll: '#ff5a4e', pitch: '#3ddc84', yaw: '#5b8cff' } as const;
type AxisKey = keyof typeof AXIS_COLOR;
const NAME: Record<AxisKey, string> = { roll: '롤', pitch: '피치', yaw: '요' };

const toArr = (q: Quaternion): Quat => [q.x, q.y, q.z, q.w];
const rpyQuat = (r: number, p: number, y: number) => new Quaternion().setFromEuler(new Euler(r * D2R, p * D2R, y * D2R, 'ZYX'));
const about = (axis: Vector3, deg: number) => new Quaternion().setFromAxisAngle(axis, deg * D2R);
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** A direction in words: the base axis it lies closest to. */
function word(d: Vector3) {
  const a = [
    [d.x, '앞', '뒤'],
    [d.y, '왼쪽', '오른쪽'],
    [d.z, '위', '아래'],
  ] as const;
  const [v, pos, neg] = a.reduce((m, c) => (Math.abs(c[0]) > Math.abs(m[0]) ? c : m));
  return v >= 0 ? pos : neg;
}
const along = (q: Quat, local: Vector3) => local.clone().applyQuaternion(new Quaternion(...q));
const line = (key: string, dir: Vector3, color: string, len = 95, width = 3) => ({
  key,
  points: [
    [AT[0] - dir.x * len, AT[1] - dir.y * len, AT[2] - dir.z * len],
    [AT[0] + dir.x * len, AT[1] + dir.y * len, AT[2] + dir.z * len],
  ] as Mm[],
  color,
  width,
  dashed: true,
});

const ORDERS = [
  { key: 'rp', label: '롤 90° 뒤 피치 90°', first: X, second: Y },
  { key: 'pr', label: '피치 90° 뒤 롤 90°', first: Y, second: X },
] as const;

export default function RotationOrder({ show, step, record }: TopicProps) {
  const [rpy, setRpy] = useState<[number, number, number]>([0, 0, 0]);
  const [last, setLast] = useState<AxisKey | null>(null);
  const [touched, setTouched] = useState<Record<AxisKey, boolean>>({ roll: false, pitch: false, yaw: false });
  const [seqQ, setSeqQ] = useState<Quat>(ID);
  const [ends, setEnds] = useState<Partial<Record<'rp' | 'pr', Quat>>>({});
  const [lastOrder, setLastOrder] = useState<'rp' | 'pr' | null>(null);
  /** Step C: how far roll and yaw have been moved (both must, at pitch 90°). */
  const [cMoved, setCMoved] = useState({ roll: 0, yaw: 0 });
  const anim = useAnimator(1);
  const { play, stop } = anim;

  // Each step starts from its own pose: A level, C with the pitch at 90°.
  useEffect(() => {
    stop();
    // A fresh start for the step the student opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRpy(step === 'C' ? [0, 90, 0] : [0, 0, 0]);
    setLast(step === 'C' ? 'pitch' : null);
    setCMoved({ roll: 0, yaw: 0 });
  }, [step, stop]);

  const quat = useMemo<Quat>(() => (step === 'B' ? seqQ : toArr(rpyQuat(...rpy))), [step, seqQ, rpy]);
  const point = along(quat, X);
  const fin = along(quat, Z);
  // Roll turns about the gripper's own x; pitch about y after the yaw; yaw about the base z.
  const axes = useMemo(() => {
    const qYaw = new Quaternion().setFromAxisAngle(Z, rpy[2] * D2R);
    return { roll: along(quat, X), pitch: Y.clone().applyQuaternion(qYaw), yaw: Z.clone() };
  }, [quat, rpy]);
  const locked = Math.abs(Math.abs(rpy[1]) - 90) < 1;

  useEffect(() => {
    const other = lastOrder === 'rp' ? ends.pr : lastOrder === 'pr' ? ends.rp : undefined;
    show({
      angles: HOME_POSE,
      orient: { mm: AT, quat, ghost: step === 'B' && other ? other : step === 'cmp' ? (ends.pr ?? null) : null },
      lines:
        step === 'A'
          ? (Object.keys(AXIS_COLOR) as AxisKey[]).map((k) => line(k, axes[k], AXIS_COLOR[k], 95, k === last ? 4 : 1.5))
          : step === 'B'
            ? [line('x', X, AXIS_COLOR.roll, 80, 2), line('y', Y, AXIS_COLOR.pitch, 80, 2)]
            : step === 'C'
              ? [line('roll', axes.roll, AXIS_COLOR.roll, 110, 4), line('yaw', axes.yaw, AXIS_COLOR.yaw, 90, 2)]
              : [],
      labels:
        step === 'C' && locked
          ? [{ key: 'lock', mm: [AT[0], AT[1], AT[2] + 120], text: '롤 축 = 요 축 (한 줄)', color: LEARN_COLORS.bad }]
          : step === 'B'
            ? [
                { key: 'x', mm: [AT[0] + 92, AT[1], AT[2]], text: '롤 축 (x)', color: AXIS_COLOR.roll },
                { key: 'y', mm: [AT[0], AT[1] + 92, AT[2]], text: '피치 축 (y)', color: AXIS_COLOR.pitch },
              ]
            : [],
    });
  }, [show, quat, axes, step, last, locked, ends, lastOrder]);

  const slide = (k: AxisKey, deg: number) => {
    const i = k === 'roll' ? 0 : k === 'pitch' ? 1 : 2;
    setRpy((r) => {
      const next = r.slice() as [number, number, number];
      next[i] = deg;
      return next;
    });
    setLast(k);
    if (step === 'A' && Math.abs(deg) >= 40 && !touched[k]) {
      const t = { ...touched, [k]: true };
      setTouched(t);
      if (t.roll && t.pitch && t.yaw) record('A', { '적용 순서': '한 축씩 (롤 → 피치 → 요)', '최종 손끝 방향': '축마다 한 가지 움직임', '독립 회전축': '3개' });
    }
    if (step === 'C' && (k === 'roll' || k === 'yaw')) {
      const moved = { ...cMoved, [k]: Math.max(cMoved[k], Math.abs(deg)) };
      setCMoved(moved);
      if (locked && moved.roll >= 20 && moved.yaw >= 20)
        record('C', { '적용 순서': '피치 90° 에서 롤·요', '최종 손끝 방향': '롤과 요가 같은 회전', '독립 회전축': '2개' });
    }
  };

  const runOrder = (o: (typeof ORDERS)[number]) => {
    setLastOrder(o.key);
    const T = 1.4;
    play(2 * T, (t) => {
      const a = ease(Math.min(1, t / T)) * 90;
      const b = ease(Math.max(0, (t - T) / T)) * 90;
      // Both turns about the fixed base axes: the second one multiplies from the left.
      setSeqQ(toArr(about(o.second, b).multiply(about(o.first, a))));
    }, () => {
      const end = toArr(about(o.second, 90).multiply(about(o.first, 90)));
      const next = { ...ends, [o.key]: end };
      setEnds(next);
      if (next.rp && next.pr) record('B', { '적용 순서': '롤→피치 / 피치→롤', '최종 손끝 방향': `다름 (${word(along(next.rp, X))} / ${word(along(next.pr, X))})`, '독립 회전축': '3개' });
    });
  };

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>순서와 피치 각이 바꾼 것</h3>
        <p className={css.note}>
          흰 모형은 [피치 90° 뒤 롤 90°] 의 끝 자세예요. 활동 2에서 본 두 끝 자세가 달랐고, 활동 3에서는 피치 90° 에서 롤과 요가 같은 회전이 됐어요. 그래서 계산은 회전행렬이나 쿼터니언으로 해요.
        </p>
      </section>
    );

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '롤 · 피치 · 요 를 하나씩' : step === 'B' ? '같은 두 회전, 순서만 바꾸기' : '피치 90° 에서 롤과 요'}</h3>

      {step === 'B' ? (
        <div className={css.btnRow}>
          {ORDERS.map((o) => (
            <button key={o.key} type="button" className={css.primary} disabled={anim.running} onClick={() => runOrder(o)} style={{ background: o.key === 'rp' ? STEP_COLORS.A : STEP_COLORS.B, color: '#101828' }}>
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        (['roll', 'pitch', 'yaw'] as AxisKey[]).map((k, i) => (
          <label key={k} className={css.slider}>
            <b style={{ color: AXIS_COLOR[k] }}>{NAME[k]}</b>
            <input
              type="range"
              min={-90}
              max={90}
              step={1}
              value={rpy[i]}
              onChange={(e) => slide(k, Number(e.target.value))}
              aria-label={NAME[k]}
            />
            <span className={css.num}>{fmt(rpy[i], 0)}°</span>
          </label>
        ))
      )}

      <div className={css.row3}>
        <Readout label="손끝이 가리키는 쪽" value={word(point)} unit="" />
        <Readout label="윗면(지느러미) 쪽" value={word(fin)} unit="" />
        {step === 'C' ? <Readout label="요 − 롤" value={fmt(rpy[2] - rpy[0], 0)} unit="°" /> : <Readout label="움직인 축" value={last ? NAME[last] : '—'} unit="" />}
      </div>

      {step === 'B' && ends.rp && ends.pr && (
        <Verdict tone="warn">
          같은 두 회전인데 끝이 달라요: 롤→피치 는 손끝이 {word(along(ends.rp, X))}, 피치→롤 은 {word(along(ends.pr, X))}.
        </Verdict>
      )}
      {step === 'C' && locked && (
        <Verdict tone="bad">피치 90°: 롤 축(빨강)과 요 축(파랑)이 한 줄이에요. 롤과 요는 &ldquo;요 − 롤&rdquo; 하나로만 작용해요.</Verdict>
      )}
      <p className={css.note}>
        {step === 'A'
          ? '자세 = 요(바닥 z 축 둘레) → 피치(숙이기) → 롤(손끝 축 비틀기) 순서로 적는 약속이에요. 세 각이 모두 0° 면 손끝이 앞을 수평으로 봐요(1-2 는 아래를 볼 때가 0° 예요. 0° 기준도 약속이에요). 굵은 점선이 지금 움직인 축이에요. 세 슬라이더를 모두 45° 쯤까지 움직여 보세요.'
          : step === 'B'
            ? '두 버튼 모두 바닥에 고정된 x 축(롤)과 y 축(피치)으로 90° 씩 돌려요. 하나를 누른 뒤 다른 것을 누르면, 앞의 끝 자세가 흐린 모형으로 남아요.'
            : '피치를 90° 에 둔 채 롤과 요를 번갈아 움직여 보세요. 피치를 60° 쯤으로 내리면 두 축이 다시 갈라져요.'}
      </p>
    </section>
  );
}
