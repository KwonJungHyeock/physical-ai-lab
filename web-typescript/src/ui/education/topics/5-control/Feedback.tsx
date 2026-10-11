'use client';

/**
 * 5-1 피드백의 원리: the shoulder (one-joint model) from 0° to 60°.
 * A open loop, no load — the torque worked out for 60° gets there.
 * B the same torque with 250 g — it stops short. C P control (Kp 4) with 250 g —
 * it looks at the error and pushes harder, most of the way.
 */

import { useEffect, useState } from 'react';

import { STEP_NAME } from '@/engine/education/catalog';

import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { STEP_COLORS, fmt } from '../kit';
import { TARGET, TimeGraph, grams, simulate, useJointModel, useJointScene, usePlayback } from './joint1';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const T_END = 3;
const KP = 4;
const PAYLOADS = [0, 0.1, 0.25] as const;
/** Each try starts with its own load and controller. */
const PLAN: Record<K, { kg: number; open: boolean; button: string }> = {
  A: { kg: 0, open: true, button: '개루프' },
  B: { kg: 0.25, open: true, button: '개루프' },
  C: { kg: 0.25, open: false, button: 'P 제어' },
};
const MODE = (open: boolean) => (open ? '개루프' : `P (Kp ${KP})`);

export default function Feedback({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const model = useJointModel(chain);
  const [kg, setKg] = useState<number>(PLAN[k].kg);
  const pb = usePlayback(step);
  /** The load each try was last run with. */
  const [kgOf, setKgOf] = useState<Partial<Record<K, number>>>({});
  useEffect(() => {
    // Each try opens with the load it is about.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step !== 'cmp') setKg(PLAN[step].kg);
  }, [step]);

  const cur = pb.shown(k);
  const theta = cur ? cur.run.y[cur.i] : 0;
  useJointScene(chain, show, { thetaDeg: step === 'cmp' ? TARGET : theta, color: STEP_COLORS[k], kg: step === 'cmp' ? 0 : kg, run: step === 'cmp' ? null : cur?.run, upTo: cur?.i });

  const go = () => {
    const r = simulate(model, { kg, open: PLAN[k].open, gains: { kp: KP, ki: 0, kd: 0 }, T: T_END });
    setKgOf((m) => ({ ...m, [k]: kg }));
    pb.start(k, r, () =>
      record(k, { 짐: grams(kg), 제어: MODE(PLAN[k].open), '멈춘 각도': `${fmt(r.y.at(-1)!, 1)}°`, '남은 오차': `${fmt(r.errorDeg, 1)}°` }),
    );
  };

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as const).filter((key) => pb.runs[key]);
    return (
      <section className={css.card}>
        <h3>세 번 겹쳐 보기</h3>
        {keys.length ? (
          <TimeGraph
            title="어깨 각도 θ (3 초)"
            tEnd={T_END}
            marks={[{ v: TARGET, label: '60°', color: STEP_COLORS.C }]}
            series={keys.map((key) => ({ key, label: `${STEP_NAME[key]} ${MODE(PLAN[key].open)} · 짐 ${grams(kgOf[key] ?? PLAN[key].kg)}`, color: STEP_COLORS[key], y: pb.runs[key]!.y }))}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 해 보면 응답이 여기 겹쳐 보여요.</p>
        )}
        <p className={css.note}>개루프는 짐이 바뀌면 빗나가고, 피드백(P)은 오차를 보고 힘을 키워 훨씬 가까이 가요. 그래도 0 이 아닌 오차는 5-2 PID 에서 없애요.</p>
      </section>
    );
  }

  const done = cur && !cur.playing ? cur.run : null;
  const holdTorque = model.mgl * Math.sin((TARGET * Math.PI) / 180);
  return (
    <section className={css.card}>
      <h3>
        {PLAN[k].open ? '명령만 보내기 (개루프)' : `피드백: P 제어 (Kp ${KP})`} · 어깨 0° → 60°
      </h3>
      <div className={css.seg} role="group" aria-label="짐 무게">
        {PAYLOADS.map((p) => (
          <button key={p} type="button" aria-pressed={kg === p} disabled={pb.running} onClick={() => setKg(p)}>
            짐 {grams(p)}
          </button>
        ))}
      </div>
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={pb.running} onClick={go}>
          {PLAN[k].button}
        </button>
      </div>
      <TimeGraph
        title="어깨 각도 θ (3 초)"
        tEnd={T_END}
        marks={[{ v: TARGET, label: '60°', color: STEP_COLORS.C }]}
        series={cur ? [{ key: k, label: `${MODE(PLAN[k].open)} · 짐 ${grams(kg)}`, color: STEP_COLORS[k], y: cur.run.y.slice(0, cur.i + 1) }] : []}
        lo={0}
        hi={80}
      />
      <div className={css.row3}>
        <Readout label="멈춘 각도" value={done ? fmt(done.y.at(-1)!, 1) : '–'} unit="°" />
        <Readout label="남은 오차" value={done ? fmt(done.errorDeg, 1) : '–'} unit="°" tone={done ? (done.errorDeg > 2 ? 'bad' : 'ok') : undefined} />
        <Readout label="오버슈트" value={done ? fmt(done.overshootPct, 0) : '–'} unit="%" />
      </div>
      <p className={css.note}>
        {PLAN[k].open
          ? `개루프: 짐이 없을 때 60° 에서 버티는 토크 ${fmt(holdTorque, 2)} N·m 를 계산해 두고, 결과를 보지 않고 그대로 내요.`
          : `P 제어: 토크 = Kp(비례 게인) × 오차 (Kp ${KP}, 오차는 라디안). 목표에서 멀수록 세게 밀고, 가까워지면 약해져요. 그래서 짐의 무게와 균형이 맞는 곳에서 서요.`}
      </p>
      <p className={css.note}>단순화한 모델: 팔을 축에 매달린 막대 하나로 보고, 관성 + 마찰 + 중력 토크(m·g·l·sinθ) = 모터 토크 u 로 계산해요. θ = 어깨 각도(아래로 늘어진 자세가 0°). 그래프는 0.5배속으로 그려져요.</p>
    </section>
  );
}
