'use client';

/**
 * 5-2 PID 제어: the shoulder (one-joint model) from 0° to 60° holding 250 g.
 * A P only (try Kp 2 · 4 · 10), B PI (Ki on), C PID (Kd on). Each try unlocks
 * one more gain; the others stay where the step puts them.
 */

import { useEffect, useState } from 'react';

import { STEP_NAME } from '@/engine/education/catalog';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Readout } from '../../widgets';
import { STEP_COLORS, fmt } from '../kit';
import { TARGET, TimeGraph, grams, simulate, useJointModel, useJointScene, usePlayback, type Gains, type Run } from './joint1';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const T_END = 3;
const KG = 0.25;
/** The gains each try starts from, and which one the student moves. */
const PLAN: Record<K, { gains: Gains; free: keyof Gains; name: string }> = {
  A: { gains: { kp: 4, ki: 0, kd: 0 }, free: 'kp', name: 'P 만' },
  B: { gains: { kp: 4, ki: 6, kd: 0 }, free: 'ki', name: 'PI' },
  C: { gains: { kp: 4, ki: 6, kd: 0.4 }, free: 'kd', name: 'PID' },
};
const RANGE: Record<keyof Gains, { min: number; max: number; step: number }> = {
  kp: { min: 0.5, max: 10, step: 0.5 },
  ki: { min: 0, max: 15, step: 0.5 },
  kd: { min: 0, max: 1, step: 0.05 },
};
const LABEL: Record<keyof Gains, string> = { kp: 'Kp', ki: 'Ki', kd: 'Kd' };
const gainText = (g: Gains) => `Kp ${g.kp} · Ki ${g.ki} · Kd ${g.kd}`;
const settleText = (r: Run) => (r.settleS === null ? '못 섬' : `${fmt(r.settleS, 2)} s`);

export default function Pid({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const model = useJointModel(chain);
  const [gains, setGains] = useState<Gains>(PLAN[k].gains);
  const [gainsOf, setGainsOf] = useState<Partial<Record<K, Gains>>>({});
  /** Step A: the Kp values tried so far. */
  const [tried, setTried] = useState<{ kp: number; run: Run }[]>([]);
  const pb = usePlayback(step);
  useEffect(() => {
    // Each try opens with its own gains (one of them free).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step !== 'cmp') setGains(PLAN[step].gains);
  }, [step]);

  const cur = pb.shown(k);
  const theta = cur ? cur.run.y[cur.i] : 0;
  useJointScene(chain, show, { thetaDeg: step === 'cmp' ? TARGET : theta, color: STEP_COLORS[k], kg: KG, run: step === 'cmp' ? null : cur?.run, upTo: cur?.i });

  const go = () => {
    const g = { ...gains };
    const r = simulate(model, { kg: KG, gains: g, T: T_END });
    setGainsOf((m) => ({ ...m, [k]: g }));
    pb.start(k, r, () => {
      if (k === 'A') setTried((t) => [...t.filter((x) => x.kp !== g.kp), { kp: g.kp, run: r }].sort((a, b) => a.kp - b.kp));
      record(k, { 게인: gainText(g), 오버슈트: `${fmt(r.overshootPct, 0)} %`, '정착 시간': settleText(r), '남은 오차': `${fmt(r.errorDeg, 1)}°` });
    });
  };

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as const).filter((key) => pb.runs[key]);
    return (
      <section className={css.card}>
        <h3>P · PI · PID 겹쳐 보기 (짐 {grams(KG)})</h3>
        {keys.length ? (
          <TimeGraph
            title="어깨 각도 θ (3 초)"
            tEnd={T_END}
            band={{ from: TARGET * 0.98, to: TARGET * 1.02 }}
            marks={[{ v: TARGET, label: '60°', color: STEP_COLORS.C }]}
            series={keys.map((key) => ({ key, label: `${STEP_NAME[key]} ${PLAN[key].name} (${gainText(gainsOf[key] ?? PLAN[key].gains)})`, color: STEP_COLORS[key], y: pb.runs[key]!.y }))}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 해 보면 응답이 여기 겹쳐 보여요.</p>
        )}
        <p className={css.note}>P 는 오차가 남고, I 가 남은 오차를 밀어내지만 출렁이고, D 가 출렁임에 제동을 걸어요. 초록 띠 = 목표 ±2%.</p>
      </section>
    );
  }

  const done = cur && !cur.playing ? cur.run : null;
  return (
    <section className={css.card}>
      <h3>
        {PLAN[k].name} — 어깨 0° → 60° · 짐 {grams(KG)}
      </h3>
      {(Object.keys(RANGE) as (keyof Gains)[]).map((g) => {
        const locked = g !== PLAN[k].free;
        return (
          <label key={g} className={css.slider} data-locked={locked || undefined}>
            <b>
              <Sym s={LABEL[g]} />
            </b>
            <input
              type="range"
              min={RANGE[g].min}
              max={RANGE[g].max}
              step={RANGE[g].step}
              value={gains[g]}
              disabled={locked || pb.running}
              onChange={(e) => setGains((x) => ({ ...x, [g]: Number(e.target.value) }))}
              aria-label={LABEL[g]}
            />
            <span className={css.num}>{gains[g].toFixed(g === 'kd' ? 2 : 1)}</span>
          </label>
        );
      })}
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={pb.running} onClick={go}>
          실행
        </button>
      </div>
      <TimeGraph
        title="어깨 각도 θ (3 초)"
        tEnd={T_END}
        lo={0}
        hi={90}
        band={{ from: TARGET * 0.98, to: TARGET * 1.02 }}
        marks={[{ v: TARGET, label: '60°', color: STEP_COLORS.C }]}
        series={cur ? [{ key: k, label: gainText(gainsOf[k] ?? gains), color: STEP_COLORS[k], y: cur.run.y.slice(0, cur.i + 1) }] : []}
      />
      <div className={css.row3}>
        <Readout label="오버슈트" value={done ? fmt(done.overshootPct, 0) : '–'} unit="%" tone={done && done.overshootPct > 15 ? 'warn' : undefined} />
        <Readout label="정착 시간 (±2%)" value={done ? settleText(done) : '–'} tone={done ? (done.settleS === null ? 'bad' : 'ok') : undefined} />
        <Readout label="남은 오차" value={done ? fmt(done.errorDeg, 1) : '–'} unit="°" tone={done ? (done.errorDeg > 1.2 ? 'bad' : 'ok') : undefined} />
      </div>
      {k === 'A' && tried.length > 0 && (
        <table className={css.guideTable}>
          <tbody>
            {tried.map((t) => (
              <tr key={t.kp}>
                <th>Kp {t.kp}</th>
                <td>
                  남은 오차 {fmt(t.run.errorDeg, 1)}° · 오버슈트 {fmt(t.run.overshootPct, 0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={css.note}>
        {k === 'A'
          ? 'P: 토크 = Kp(비례 게인) × 오차. Kp 를 2 · 4 · 10 으로 바꿔 [실행] 해 보세요 — 남은 오차와 오버슈트가 어떻게 바뀌나요?'
          : k === 'B'
            ? 'I: 오차를 쌓아(적분) Ki(적분 게인)를 곱한 만큼 더 밀어요. 남은 오차는 줄지만 넘침이 커져요. Ki 만 움직일 수 있어요.'
            : 'D: 각도가 바뀌는 빠르기에 Kd(미분 게인)를 곱해 제동을 걸어 넘침을 잡아요. Kd 만 움직일 수 있어요.'}
      </p>
    </section>
  );
}
