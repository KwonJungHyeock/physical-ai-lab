'use client';

/** G5 오차와 보정: A the ideal arm reaches 4 table points (0 mm); B a J2 zero offset δ makes the real arm (orange ghost) miss, more at far points; C measure the misses, estimate δ by least squares and command with −δ̂ → back near 0 mm. */

import { useEffect, useMemo, useState } from 'react';

import { tcpFor } from '@/engine/simulator/effectors';
import { STRAIGHT_DOWN, solveToolPose } from '@/engine/robot/tool';
import { mulberry32 } from '@/engine/physics/planning';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Bars, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, RealButton, STEP_COLORS, Verdict, dist, ease, fmt, lerpQ, tipOf, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** Like reachFor, but solved to 0.05 mm (reachFor stops at 1 mm, which would show up as error here). */
function reachTight(chain: TopicProps['chain'], mm: Mm, seed: readonly number[], tcpMm = 0): number[] | null {
  const r = solveToolPose(chain, { x: mm[0], y: mm[1], z: mm[2] }, seed, { tcpMm, orientation: STRAIGHT_DOWN, toleranceMm: 0.05 });
  return r.converged ? r.anglesDeg : null;
}

type Try = 'A' | 'B' | 'C';

const TCP = tcpFor('pump', false);
const TIP_Z = 10;
const TARGETS: Mm[] = [
  [140, -70, TIP_Z],
  [185, 60, TIP_Z],
  [230, -30, TIP_Z],
  [265, 30, TIP_Z],
];
const MOVE_S = 0.8;
const HOLD_S = 0.35;
const J2 = 1;

const withJ2 = (q: readonly number[], d: number) => q.map((v, i) => (i === J2 ? v + d : v));

/** Least squares over δ (1-D search): measured tips vs the model's tips at the commanded angles + δ. */
function estimateDelta(chain: TopicProps['chain'], cmds: readonly number[][], measured: readonly Mm[]): number {
  const cost = (d: number) => cmds.reduce((s, q, i) => s + dist(tipOf(chain, withJ2(q, d), TCP), measured[i]) ** 2, 0);
  let best = 0;
  let bestC = Infinity;
  for (let d = -5; d <= 5.0001; d += 0.05) {
    const c = cost(d);
    if (c < bestC) [best, bestC] = [d, c];
  }
  const lo = best - 0.05;
  for (let d = lo; d <= best + 0.05; d += 0.001) {
    const c = cost(d);
    if (c < bestC) [best, bestC] = [d, c];
  }
  return best;
}

const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);

export default function G5Calibration({ chain, show, real, step, record }: TopicProps) {
  const [q, setQ, qRef] = usePose(HOME_POSE);
  const anim = useAnimator();
  const { stop } = anim;
  const [delta, setDelta] = useState(2);
  const [errs, setErrs] = useState<Partial<Record<Try, number[]>>>({});
  const [reached, setReached] = useState<{ step: Try; tips: Mm[] } | null>(null);
  const [measured, setMeasured] = useState<{ cmds: number[][]; tips: Mm[] } | null>(null);
  const [est, setEst] = useState<number | null>(null);

  useEffect(() => () => stop(), [step, stop]);

  const d = step === 'A' ? 0 : delta;
  const ghost = useMemo(() => withJ2(q, d), [q, d]);
  const realTip = useMemo(() => tipOf(chain, ghost, TCP), [chain, ghost]);

  /** Visit the four points with commands `cmds`; the real arm turns J2 by `trueDelta` more. */
  const visit = (cmds: number[][], trueDelta: number, s: Try, done: (tips: Mm[]) => void) => {
    const from = qRef.current.slice();
    const tips: Mm[] = [];
    const seg = MOVE_S + HOLD_S;
    anim.play(
      seg * cmds.length,
      (t) => {
        const k = Math.min(cmds.length - 1, Math.floor(t / seg));
        const u = Math.min(1, (t - k * seg) / MOVE_S);
        const a = k === 0 ? from : cmds[k - 1];
        setQ(lerpQ(a, cmds[k], ease(u)));
        // Each point reached (even if a slow frame skipped its pause): the real tip is where it is.
        const arrived = u >= 1 ? k + 1 : k;
        if (tips.length < arrived) {
          while (tips.length < arrived) tips.push(tipOf(chain, withJ2(cmds[tips.length], trueDelta), TCP));
          setReached({ step: s, tips: tips.slice() });
        }
      },
      () => {
        setQ(cmds[cmds.length - 1]);
        done(tips);
      },
    );
  };

  const commands = (): number[][] | null => {
    const out: number[][] = [];
    let seed: readonly number[] = qRef.current;
    for (const p of TARGETS) {
      const a = reachTight(chain, p, seed, TCP);
      if (!a) return null;
      out.push(a);
      seed = a;
    }
    return out;
  };

  const finish = (s: Try, tips: Mm[], estimate: string) => {
    const e = tips.map((p, i) => dist(p, TARGETS[i]));
    setErrs((x) => ({ ...x, [s]: e }));
    record(s, { '평균 오차': `${fmt(mean(e))} mm`, '최대 오차': `${fmt(Math.max(...e))} mm`, '추정한 영점 오차': estimate });
  };

  const sendFour = () => {
    const cmds = commands();
    if (!cmds) return;
    const s = step as Try;
    setReached({ step: s, tips: [] });
    visit(cmds, d, s, (tips) => finish(s, tips, s === 'A' ? '— (없음)' : '모름'));
  };

  const measure = () => {
    const cmds = commands();
    if (!cmds) return;
    setEst(null);
    setReached({ step: 'C', tips: [] });
    visit(cmds, delta, 'C', (tips) => {
      // A measuring tool reads the tip to about ±0.2 mm.
      const rnd = mulberry32(17);
      setMeasured({ cmds, tips: tips.map((p) => p.map((c) => c + (rnd() - 0.5) * 0.4) as Mm) });
    });
  };

  const correct = () => {
    if (!measured) return;
    const e = estimateDelta(chain, measured.cmds, measured.tips);
    setEst(e);
    const cmds = measured.cmds.map((c) => withJ2(c, -e));
    setReached({ step: 'C', tips: [] });
    visit(cmds, delta, 'C', (tips) => finish('C', tips, `${fmt(e, 2)}° (실제 ${fmt(delta, 1)}°)`));
  };

  const shown = useMemo(() => (reached && reached.step === step ? reached.tips : []), [reached, step]);

  useEffect(() => {
    const showErr = step !== 'cmp';
    show({
      angles: q,
      tool: 'pump',
      ghosts: d !== 0 && step !== 'cmp' ? [{ key: 'real', angles: ghost, color: LEARN_COLORS.warn, opacity: 0.45 }] : [],
      spots: TARGETS.map((p, i) => ({ key: `p${i}`, mm: [p[0], p[1], 0] as Mm, color: LEARN_COLORS.accent, label: `P${i + 1}` })),
      lines: showErr
        ? [
            ...shown.map((p, i) => ({ key: `e${i}`, points: [TARGETS[i], p] as Mm[], color: LEARN_COLORS.bad, width: 3 })),
            ...TARGETS.map((p, i) => ({ key: `drop${i}`, points: [[p[0], p[1], 0], p] as Mm[], color: '#98a2b3', dashed: true })),
          ]
        : [],
      labels: showErr
        ? [
            ...shown.map((p, i) => ({ key: `l${i}`, mm: [TARGETS[i][0], TARGETS[i][1], TARGETS[i][2] + 34] as Mm, text: `${fmt(dist(p, TARGETS[i]))} mm`, color: dist(p, TARGETS[i]) < 1 ? LEARN_COLORS.ok : LEARN_COLORS.bad })),
            ...(d !== 0 ? [{ key: 'real', mm: [realTip[0], realTip[1], realTip[2] + 60] as Mm, text: `실제 팔 (J2 ${d > 0 ? '+' : ''}${fmt(d, 1)}°)`, color: LEARN_COLORS.warn }] : []),
          ]
        : [],
    });
  }, [show, q, ghost, d, step, shown, realTip]);

  if (step === 'cmp') {
    const tries: Try[] = ['A', 'B', 'C'];
    const all = tries.flatMap((t) => errs[t] ?? []);
    const top = Math.max(1, ...all);
    const W = 320;
    const H = 150;
    const pad = { l: 34, b: 20, t: 10 };
    const gw = (W - pad.l - 6) / TARGETS.length;
    const bw = gw / 4;
    return (
      <section className={css.card}>
        <h3>점별 오차 (mm)</h3>
        <figure className={css.graph}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="점별 오차 막대">
            <line x1={pad.l} x2={W - 6} y1={H - pad.b} y2={H - pad.b} className={css.axis} />
            <text x={pad.l - 4} y={pad.t + 8} className={css.tick} textAnchor="end">
              {fmt(top)}
            </text>
            <text x={pad.l - 4} y={H - pad.b} className={css.tick} textAnchor="end">
              0
            </text>
            {TARGETS.map((_, i) => (
              <g key={i}>
                {tries.map((t, j) => {
                  const v = errs[t]?.[i];
                  if (v == null) return null;
                  const h = (v / top) * (H - pad.b - pad.t);
                  return <rect key={t} x={pad.l + i * gw + bw * (j + 0.5)} y={H - pad.b - h} width={bw * 0.9} height={Math.max(1, h)} fill={STEP_COLORS[t]} />;
                })}
                <text x={pad.l + i * gw + gw / 2} y={H - 5} className={css.tick} textAnchor="middle">
                  P{i + 1}
                </text>
              </g>
            ))}
          </svg>
          <div className={css.legend}>
            <span>
              <i style={{ background: STEP_COLORS.A }} />활동 1 이상적
            </span>
            <span>
              <i style={{ background: STEP_COLORS.B }} />활동 2 영점 오차
            </span>
            <span>
              <i style={{ background: STEP_COLORS.C }} />활동 3 보정 후
            </span>
          </div>
        </figure>
        <p className={css.note}>영점이 조금만 어긋나도 모든 점에서 빗나가고, 멀리 뻗은 P4 가 가장 많이 빗나가요. 측정해서 영점을 계산해 빼면 다시 0 에 가까워요.</p>
      </section>
    );
  }

  const e = errs[step];
  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '이상적인 로봇' : step === 'B' ? '영점이 어긋나면' : '측정해서 보정'}</h3>
      {step !== 'A' && (
        <label className={css.slider}>
          <b>
            J2 영점 오차 <Sym s="δθ" name={false} />
          </b>
          <input type="range" min={0} max={3} step={0.1} value={delta} disabled={anim.running} onChange={(ev) => {
              setDelta(Number(ev.target.value));
              setMeasured(null);
              setEst(null);
            }} aria-label="J2 영점 오차" />
          <span className={css.num}>{fmt(delta, 1)}°</span>
        </label>
      )}
      <div className={css.btnRow}>
        {step !== 'C' && (
          <button type="button" className={css.primary} disabled={anim.running} onClick={sendFour}>
            4곳으로 보내기
          </button>
        )}
        {step === 'C' && (
          <>
            <button type="button" className={measured ? undefined : css.primary} disabled={anim.running} onClick={measure}>
              측정
            </button>
            <button type="button" className={measured ? css.primary : undefined} disabled={anim.running || !measured} onClick={correct}>
              보정 계산
            </button>
          </>
        )}
      </div>
      {shown.length > 0 && <Bars values={shown.map((p, i) => dist(p, TARGETS[i]))} limits={TARGETS.map(() => 5)} unit="mm" digits={1} labels={TARGETS.map((_, i) => `P${i + 1}`)} />}
      <div className={css.row3}>
        <Readout label="평균 오차" value={e ? fmt(mean(e)) : '—'} unit={e ? 'mm' : undefined} tone={e ? (mean(e) < 1 ? 'ok' : 'bad') : undefined} />
        <Readout label="최대 오차" value={e ? fmt(Math.max(...e)) : '—'} unit={e ? 'mm' : undefined} />
        <Readout label="추정한 영점 오차" value={step === 'C' && est != null ? fmt(est, 2) : '—'} unit={step === 'C' && est != null ? '°' : undefined} />
      </div>
      {step === 'C' && measured && est == null && !anim.running && (
        <Verdict tone="warn">점 4곳에서 실제 손끝을 쟀어요(±0.2 mm). 이제 [보정 계산] 으로 영점 오차를 구해요.</Verdict>
      )}
      {step === 'C' && est != null && e && (
        <Verdict tone={mean(e) < 1 ? 'ok' : 'warn'}>
          계산한 영점 오차 {fmt(est, 2)}° (실제 {fmt(delta, 1)}°). J2 명령에서 {fmt(est, 2)}° 를 빼고 보내니 평균 {fmt(mean(e), 2)} mm.
        </Verdict>
      )}
      {step === 'B' && e && <Verdict tone="bad">영점 {fmt(delta, 1)}° 로 평균 {fmt(mean(e))} mm 빗나가요. 가장 먼 P4 가 가장 많이.</Verdict>}
      {step === 'A' && e && <RealButton real={real} chain={chain} angles={q} tcpMm={TCP} label="실물 로봇으로 P4 에 가기" />}
      <p className={css.note}>
        {step === 'A'
          ? '모델과 실제가 같다면 명령한 자리에 정확히 닿아요(파랑 점 P1~P4, 손끝은 10 mm 위).'
          : step === 'B'
            ? '주황 = 실제 팔: 명령한 각도 + 영점 오차(J2). 같은 명령인데 손끝이 빗나가요. 빨간 선 = 빗나간 거리.'
            : '[측정] 은 활동 2 처럼 보내서 실제 손끝 위치를 재요. [보정 계산] 은 영점 오차 δθ 를 −5°~5° 에서 바꿔 가며 측정과 모델의 차이(제곱합)가 가장 작은 값을 찾고, 그만큼 J2 명령에서 빼요.'}
      </p>
    </section>
  );
}
