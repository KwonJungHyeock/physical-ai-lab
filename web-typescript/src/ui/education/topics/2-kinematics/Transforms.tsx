'use client';

/** A3 좌표 변환 (순기구학): one joint's turn, two frames multiplied, then the product from the base to the tool. */

import { useEffect, useMemo, useState } from 'react';
import { Matrix4 } from 'three';

import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';

import css from '../../learn.module.css';
import { JointSliders, MatrixTable, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, dist, fmt, tipOf, usePose } from '../kit';
import type { TopicProps } from '../types';

/** Joint frames {0}..{6}: {0} the base, {k} the frame turned by joint k. */
export function jointFrames(chain: readonly ChainSegment[], q: readonly number[]): Matrix4[] {
  const frames = forwardKinematicsFrames(chain, q);
  const out: Matrix4[] = [new Matrix4()];
  chain.forEach((seg, i) => {
    if (seg.movableIndex >= 0) out[seg.movableIndex + 1] = frames[i];
  });
  return out;
}

const sub = (k: number) => '₀₁₂₃₄₅₆'[k];

export default function A3Transforms({ chain, show, step, record }: TopicProps) {
  const [q, setQ] = usePose(HOME_POSE);
  const [upTo, setUpTo] = useState(6);
  const frames = useMemo(() => jointFrames(chain, q), [chain, q]);
  const tip = useMemo(() => tipOf(chain, q, 0), [chain, q]);

  const k = step === 'A' ? 1 : step === 'B' ? 2 : upTo;
  const local = useMemo(() => (k > 0 ? frames[k - 1].clone().invert().multiply(frames[k]) : new Matrix4()), [frames, k]);
  // B: T01·T12 against the wrong order T12·T01.
  const t01 = frames[1];
  const t12 = useMemo(() => frames[1].clone().invert().multiply(frames[2]), [frames]);
  const wrong = useMemo(() => t12.clone().multiply(t01), [t01, t12]);
  const p = (m: Matrix4) => [m.elements[12] * 1000, m.elements[13] * 1000, m.elements[14] * 1000];

  // Each try starts from the same pose (the comparison keeps the last one).
  useEffect(() => {
    if (step !== 'cmp') setQ(HOME_POSE.slice());
  }, [step, setQ]);

  useEffect(() => {
    show({
      angles: q,
      frames: step === 'cmp' ? 'all' : k,
      labels: [{ key: 'tip', mm: [tip[0], tip[1], tip[2] + 26], text: `플랜지 {6} (${fmt(tip[0], 0)}, ${fmt(tip[1], 0)}, ${fmt(tip[2], 0)})`, color: LEARN_COLORS.accent }],
    });
  }, [q, k, step, tip, show]);

  const moved = (next: number[]) => {
    setQ(next);
    if (step === 'A' && Math.abs(next[0] - HOME_POSE[0]) > 20) record('A', { '곱한 행렬': '1개 (T₀¹)', '바뀐 것': '{1} 의 방향(회전 3×3)', 위치열: '그대로 (축 위)' });
    if (step === 'B' && Math.abs(next[1] - HOME_POSE[1]) > 20) record('B', { '곱한 행렬': '2개 (T₀¹·T₁²)', '바뀐 것': '{2} 와 그 뒤 전부', 위치열: '바뀜' });
  };

  if (step === 'cmp') {
    const d = dist(p(wrong), p(frames[2]));
    return (
      <section className={css.card}>
        <h3>곱하는 순서</h3>
        <p className={css.live}>
          T₀¹·T₁² 의 위치 = ({p(frames[2]).map((v) => fmt(v, 0)).join(', ')}) mm, 순서를 바꾼 T₁²·T₀¹ = ({p(wrong).map((v) => fmt(v, 0)).join(', ')}) mm — {fmt(d, 0)} mm 차이. 행렬 곱은 순서를 바꾸면 결과가 달라요.
        </p>
      </section>
    );
  }

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? 'J1 하나 돌리기 — T₀¹' : step === 'B' ? '두 좌표계 곱하기 — T₀² = T₀¹ · T₁²' : '바닥부터 손끝까지 — T₀⁶'}</h3>
      <JointSliders angles={q} onChange={moved} joints={step === 'A' ? [0] : step === 'B' ? [0, 1] : undefined} highlight={step === 'C' ? upTo - 1 : null} />
      {step === 'C' && (
        <div className={css.seg} role="group" aria-label="좌표계 단계">
          {Array.from({ length: 7 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={upTo === i}
              onClick={() => {
                setUpTo(i);
                if (i === 6) record('C', { '곱한 행렬': '6개 (T₀¹ … T₅⁶)', '바뀐 것': '6번 곱한 결과', 위치열: `플랜지 (${fmt(tip[0], 0)}, ${fmt(tip[1], 0)}, ${fmt(tip[2], 0)})` });
              }}
            >
              {i === 0 ? '{0}' : `×T${sub(i - 1)}${'⁰¹²³⁴⁵⁶'[i]}`}
            </button>
          ))}
        </div>
      )}
      <div className={css.matrices}>
        <MatrixTable
          m={frames[k].elements}
          caption={
            <>
              T<sub>0</sub>
              <sup>{k}</sup> = 바닥에서 본 {`{${k}}`}
            </>
          }
        />
        {step === 'B' ? (
          <MatrixTable
            m={t12.elements}
            caption={
              <>
                T<sub>1</sub>
                <sup>2</sup> = J2 한 관절
              </>
            }
          />
        ) : (
          k > 0 && (
            <MatrixTable
              m={local.elements}
              caption={
                <>
                  T<sub>{k - 1}</sub>
                  <sup>{k}</sup> = 한 관절
                </>
              }
            />
          )
        )}
      </div>
      <div className={css.row3}>
        <Readout label={`{${k}} 원점 x (앞)`} value={fmt(p(frames[k])[0], 0)} unit="mm" />
        <Readout label="y (왼쪽)" value={fmt(p(frames[k])[1], 0)} unit="mm" />
        <Readout label="z (위)" value={fmt(p(frames[k])[2], 0)} unit="mm" />
      </div>
      <p className={css.note}>
        {step === 'A'
          ? '왼쪽 3×3 = 방향(회전), 오른쪽 열 = 위치(mm). J1 을 돌리면 3×3 만 바뀌고, 위치 열은 그대로예요(J1 축 위에 있어서).'
          : step === 'B'
            ? 'J2 를 돌리면 {2} 뒤에 붙은 모든 것이 따라 돌아요. J1 을 돌리면 {1}·{2} 가 함께 돌아요 — 앞 관절이 뒤 관절을 싣고 다녀요.'
            : '{0} 부터 하나씩 눌러 곱해 보세요. ×T₅⁶ 까지 곱한 행렬의 위치 열 = 플랜지(그리퍼를 다는 면) 좌표. 그리퍼 끝은 여기서 도구 축으로 58 mm 더 나가요.'}
      </p>
    </section>
  );
}
