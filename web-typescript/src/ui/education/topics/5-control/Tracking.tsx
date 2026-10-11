'use client';

/**
 * 5-3 궤적 추종: the shoulder (one-joint model, PID 4 · 6 · 0.4) follows a
 * moving command — a smooth 0° → 60° in T s — instead of a jump. A slowly (3 s),
 * B fast (1 s): it lags further behind. C fast with feedforward: the torque the
 * model says the motion needs is added up front, and it keeps up.
 */

import { useEffect, useState } from 'react';

import { STEP_NAME } from '@/engine/education/catalog';

import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { LEARN_COLORS, STEP_COLORS, fmt } from '../kit';
import { TARGET, TimeGraph, simulate, useJointModel, useJointScene, usePlayback, type Run } from './joint1';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const GAINS = { kp: 4, ki: 6, kd: 0.4 };
const PLAN: Record<K, { rampS: number; ff: boolean; button: string }> = {
  A: { rampS: 3, ff: false, button: '느리게 3 초' },
  B: { rampS: 1, ff: false, button: '빠르게 1 초' },
  C: { rampS: 1, ff: true, button: '빠르게 1 초' },
};
/** Every run lasts the ramp plus 2 s; graphs share 0–5 s in the comparison. */
const AFTER = 2;
const errorOf = (r: Run) => r.y.map((v, i) => r.r[i] - v);
const afterText = (r: Run) => (r.afterRampS === null ? '아직 밖' : `${fmt(r.afterRampS, 2)} s`);

export default function Tracking({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const model = useJointModel(chain);
  const [ff, setFf] = useState(PLAN[k].ff);
  const [ffOf, setFfOf] = useState<Partial<Record<K, boolean>>>({});
  const pb = usePlayback(step);
  useEffect(() => {
    // Feedforward is what step C is about: on there, off before.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step !== 'cmp') setFf(PLAN[step].ff);
  }, [step]);

  const cur = pb.shown(k);
  const theta = cur ? cur.run.y[cur.i] : 0;
  const cmd = cur ? cur.run.r[cur.i] : 0;
  useJointScene(chain, show, {
    thetaDeg: step === 'cmp' ? TARGET : theta,
    color: STEP_COLORS[k],
    run: step === 'cmp' ? null : cur?.run,
    upTo: cur?.i,
    // The ghost is the command at this moment: the arm should be there.
    ghostDeg: step === 'cmp' ? TARGET : cmd,
    ghostColor: LEARN_COLORS.ok,
  });

  const go = () => {
    const p = PLAN[k];
    const r = simulate(model, { kg: 0, gains: GAINS, rampS: p.rampS, feedforward: ff, T: p.rampS + AFTER });
    setFfOf((m) => ({ ...m, [k]: ff }));
    pb.start(k, r, () =>
      record(k, { '궤적 시간': `${p.rampS} s`, 피드포워드: ff ? '켬' : '끔', '최대 추종 오차': `${fmt(r.maxTrackDeg, 1)}°`, '끝난 뒤 ±1° 안까지': afterText(r) }),
    );
  };

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as const).filter((key) => pb.runs[key]);
    return (
      <section className={css.card}>
        <h3>추종 오차 겹쳐 보기</h3>
        {keys.length ? (
          <TimeGraph
            title="추종 오차 = 명령 − 실제 (°)"
            tEnd={PLAN.A.rampS + AFTER}
            marks={[{ v: 0, label: '0°', color: LEARN_COLORS.ok }]}
            series={keys.map((key) => ({ key, label: `${STEP_NAME[key]} ${PLAN[key].rampS} s${ffOf[key] ? ' + 피드포워드' : ''}`, color: STEP_COLORS[key], y: errorOf(pb.runs[key]!) }))}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 해 보면 오차가 여기 겹쳐 보여요.</p>
        )}
        <p className={css.note}>빠를수록 피드백만으로는 늦게 따라가요(오차가 생겨야 힘을 내니까). 피드포워드는 필요한 토크를 미리 내서 오차가 생기기 전에 따라가요.</p>
      </section>
    );
  }

  const done = cur && !cur.playing ? cur.run : null;
  const tEnd = PLAN[k].rampS + AFTER;
  return (
    <section className={css.card}>
      <h3>
        명령 궤적 따라가기: 0° → 60° 를 {PLAN[k].rampS} 초에
      </h3>
      {k === 'C' && (
        <label className={css.check}>
          <input type="checkbox" checked={ff} disabled={pb.running} onChange={(e) => setFf(e.target.checked)} /> 피드포워드 (관성 + 마찰 + 중력 토크를 미리 더하기)
        </label>
      )}
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={pb.running} onClick={go}>
          {PLAN[k].button}
        </button>
      </div>
      <TimeGraph
        title="어깨 각도: 명령(점선) · 실제(실선)"
        tEnd={tEnd}
        lo={0}
        hi={75}
        marks={[{ v: TARGET, label: '60°', color: STEP_COLORS.C }]}
        series={
          cur
            ? [
                { key: 'cmd', label: '명령', color: LEARN_COLORS.ok, y: cur.run.r.slice(0, cur.i + 1), dashed: true },
                { key: 'act', label: '실제', color: STEP_COLORS[k], y: cur.run.y.slice(0, cur.i + 1) },
              ]
            : []
        }
      />
      <div className={css.row3}>
        <Readout label="지금 오차" value={cur ? fmt(cmd - theta, 1) : '–'} unit="°" />
        <Readout label="최대 추종 오차" value={done ? fmt(done.maxTrackDeg, 1) : '–'} unit="°" tone={done ? (done.maxTrackDeg > 4 ? 'bad' : done.maxTrackDeg > 1 ? 'warn' : 'ok') : undefined} />
        <Readout label="끝난 뒤 ±1° 안까지" value={done ? afterText(done) : '–'} tone={done ? (done.afterRampS ? 'warn' : 'ok') : undefined} />
      </div>
      <p className={css.note}>
        초록 반투명 팔 = 지금 시각의 명령 각도, 실제 팔은 그 뒤를 따라가요. 제어기는 5-2 의 PID (Kp 4 · Ki 6 · Kd 0.4), 짐 없음.
        {k === 'C' ? ' 피드포워드를 끄고 다시 해 보면 활동 2와 같아져요.' : ''}
      </p>
    </section>
  );
}
