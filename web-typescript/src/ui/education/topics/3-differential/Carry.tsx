'use client';

/**
 * C1 위치 → 속도 → 가속도: the arm carries a block on a tray sideways. A gives
 * only the position (there almost at once), B a constant speed, C a limited
 * acceleration — the block falls off, jolts, or stays put.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Quaternion, Vector3 } from 'three';

import { simulateTray, trayAt, G_MM, type TrayRun } from '@/engine/education/tray';
import { quinticProfile, trapezoid, type Profile } from '@/engine/physics/planning';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Graph, Readout } from '../../widgets';
import { STEP_COLORS, Verdict, fmt, reachFor, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';
const NUM: Record<K, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };
const D = 220;
const FROM: Mm = [200, -110, 120];
const MU_S = 0.5;
const BLOCK = 25;
const TRAY = { back: 20, front: 70, half: 40, thick: 5 };
const N = 44;

const PROFILES: Record<K, { name: string; make(shape: 'trap' | 's'): Profile }> = {
  A: { name: '위치만 (0.12 초에 도착)', make: () => quinticProfile(D, 0.12) },
  B: { name: '일정 속도', make: () => trapezoid(D, 282, 30000) },
  C: { name: '가속도 제한', make: (shape) => (shape === 's' ? quinticProfile(D, 1.0) : trapezoid(D, 300, 3000)) },
};

/** Each try's name in the graph legend. */
const BUTTON: Record<K, string> = { A: '위치만', B: '일정 속도', C: '가속도 제한' };
/** The move button of each try (the 원고 and tests/education/sim/s3.ts press it by this name). */
const GO: Record<K, string> = { A: '위치만으로 옮기기', B: '일정 속도로 옮기기', C: '가속도 제한으로 옮기기' };

const along = (p: number): Mm => [FROM[0], FROM[1] + p, FROM[2]];

export default function C1Carry({ chain, show, step, record }: TopicProps) {
  const [q, setQ] = usePose([0, 0, 0, 0, 0, 0]);
  const [shape, setShape] = useState<'trap' | 's'>('trap');
  const [runs, setRuns] = useState<Partial<Record<K, TrayRun>>>({});
  const [t, setT] = useState(0);
  const [block, setBlock] = useState<{ y: number; z: number; tilt: number }>({ y: FROM[1], z: FROM[2] - 5 + BLOCK / 2, tilt: 0 });
  const [tray, setTray] = useState(0);
  const anim = useAnimator();
  const k: K = step === 'cmp' ? 'C' : step;

  // Arm poses along the line, tool straight down (solved once).
  const line = useMemo(() => {
    const out: number[][] = [];
    let seed = [-40, -10, -90, 10, 0, 0];
    for (let i = 0; i <= N; i++) {
      const a = reachFor(chain, along((D * i) / N), seed) ?? seed;
      out.push(a);
      seed = a;
    }
    return out;
  }, [chain]);
  const poseAt = (p: number) => {
    const f = Math.min(N, Math.max(0, (p / D) * N));
    const i = Math.min(N - 1, Math.floor(f));
    return line[i].map((v, j) => v + (line[i + 1][j] - v) * (f - i));
  };

  // Each try starts back at the left end with the block centred on the tray.
  const { stop } = anim;
  const restart = useCallback(() => {
    stop();
    setQ(line[0]);
    setTray(0);
    setT(0);
    setBlock({ y: FROM[1], z: FROM[2] - 5 + BLOCK / 2, tilt: 0 });
  }, [stop, setQ, line]);
  useEffect(() => {
    // A new step (a prop) puts the tray back at the start.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    restart();
  }, [step, restart]);

  const go = () => {
    restart();
    const run = simulateTray(PROFILES[k].make(shape), { muS: MU_S, muK: 0.4, marginMm: TRAY.half - BLOCK / 2 });
    setRuns((r) => ({ ...r, [k]: run }));
    const total = run.durationS + 0.6;
    anim.play(
      total,
      (time) => {
        const s = trayAt(run, Math.min(time, run.durationS + 0.3));
        setT(time);
        setTray(s.tray);
        setQ(poseAt(s.tray));
        if (run.fell && time >= run.fell.t) {
          const dt = Math.min(time - run.fell.t, Math.sqrt((2 * (FROM[2] - 5)) / G_MM));
          const fallZ = FROM[2] - 5 + BLOCK / 2 - 0.5 * G_MM * dt * dt;
          setBlock({ y: FROM[1] + run.fell.at + run.fell.v * dt, z: Math.max(BLOCK / 2, fallZ), tilt: Math.min(1, dt * 6) });
        } else setBlock({ y: FROM[1] + s.tray + s.rel, z: FROM[2] - 5 + BLOCK / 2, tilt: 0 });
      },
      () => {
        const slide = run.maxSlideMm;
        record(k, {
          '걸린 시간': `${fmt(run.durationS, 2)} s`,
          '최대 가속도': `${fmt(run.peakAccel / 1000, 1)} m/s²`,
          블록: run.fell ? '떨어짐' : slide > 2 ? `밀림 (최대 ${fmt(slide, 0)} mm)` : '그대로',
        });
      },
    );
  };

  const run = runs[k];
  const cur = run ? trayAt(run, Math.min(t, run.durationS + 0.3)) : null;
  useEffect(() => {
    const tip = along(tray);
    const top = FROM[2] - 5;
    show({
      angles: q,
      boxes: [{ min: [tip[0] - TRAY.back, tip[1] - TRAY.half, top - TRAY.thick], max: [tip[0] + TRAY.front, tip[1] + TRAY.half, top], color: '#98a2b3' }],
      blocks: [
        {
          id: 'b',
          color: '#e5484d',
          size: BLOCK,
          at: new Vector3(tip[0] + 40, block.y, block.z),
          q: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), block.tilt * 0.8),
          held: false,
        },
      ],
      lines: [{ key: 'path', points: [along(0), along(D)], color: STEP_COLORS[k], dashed: true }],
      labels: [{ key: 'v', mm: [tip[0] + 40, tip[1], top + 50], text: cur ? `속도 ${fmt(Math.abs(cur.trayV) / 1000, 2)} m/s · 가속도 ${fmt(Math.abs(cur.trayA) / 1000, 1)} m/s²` : '판 위의 블록', color: STEP_COLORS[k] }],
    });
  }, [q, tray, block, k, cur, show]);

  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as K[]).filter((x) => runs[x]);
    const T = Math.max(1, ...keys.map((x) => runs[x]!.durationS));
    const xs = Array.from({ length: 121 }, (_, i) => (i / 120) * T);
    return (
      <section className={css.card}>
        <h3>세 방법의 속도</h3>
        {keys.length ? (
          <Graph
            x={xs}
            unit="m/s"
            title="판의 속도"
            series={keys.map((x) => ({ label: `${NUM[x]} ${BUTTON[x]}`, color: STEP_COLORS[x], values: xs.map((tt) => (tt <= runs[x]!.durationS ? trayAt(runs[x]!, tt).trayV / 1000 : 0)) }))}
          />
        ) : (
          <p className={css.note}>활동 1 · 2 · 3 을 한 번씩 해 보면 여기에 겹쳐져요.</p>
        )}
        <p className={css.note}>활동 1 은 순간에 속도가 치솟고, 활동 2 는 출발·정지 순간 속도가 계단처럼 바뀌고, 활동 3 은 비스듬히 오르내려요(가속도 제한).</p>
      </section>
    );
  }

  const xs = run ? run.samples.map((s) => s.t) : [];
  return (
    <section className={css.card}>
      <h3>판 위 블록 나르기: {PROFILES[k].name}</h3>
      {k === 'C' && (
        <div className={css.seg} role="group" aria-label="속도 모양">
          <button type="button" aria-pressed={shape === 'trap'} onClick={() => setShape('trap')}>
            사다리꼴
          </button>
          <button type="button" aria-pressed={shape === 's'} onClick={() => setShape('s')}>
            S자 (5차)
          </button>
        </div>
      )}
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={anim.running} onClick={go}>
          {GO[k]}
        </button>
        <button type="button" disabled={anim.running} onClick={restart}>
          처음으로
        </button>
      </div>
      {run && !anim.running && (
        <Verdict tone={run.fell ? 'bad' : run.maxSlideMm > 2 ? 'warn' : 'ok'}>
          {run.fell ? '블록이 미끄러져 떨어졌어요.' : run.maxSlideMm > 2 ? `블록이 출발·정지할 때 ${fmt(run.maxSlideMm, 0)} mm 밀렸어요.` : '블록이 판 위에 그대로 있어요.'}
        </Verdict>
      )}
      <div className={css.row3}>
        <Readout label="걸린 시간" value={run ? fmt(run.durationS, 2) : '—'} unit="s" />
        <Readout label="최대 가속도" value={run ? fmt(run.peakAccel / 1000, 1) : '—'} unit="m/s²" tone={run ? (run.peakAccel > MU_S * G_MM ? 'bad' : 'ok') : undefined} />
        <Readout label="미끄러지는 경계 μg" value={fmt((MU_S * G_MM) / 1000, 1)} unit="m/s²" />
      </div>
      {run && (
        <div className={css.graphs}>
          <Graph x={xs} unit="m/s" title="속도" cursor={t} series={[{ label: '판의 속도', color: STEP_COLORS[k], values: run.samples.map((s) => s.trayV / 1000) }]} />
          <Graph
            x={xs}
            unit="m/s²"
            title="가속도 (점선 = 블록이 미끄러지는 경계)"
            limit={(MU_S * G_MM) / 1000}
            cursor={t}
            series={[{ label: '판의 가속도', color: STEP_COLORS[k], values: run.samples.map((s) => Math.max(-12, Math.min(12, s.trayA / 1000))) }]}
          />
        </div>
      )}
      <p className={css.note}>
        판이 경계 <Sym s="μ" name={false} />
        <Sym s="g" name={false} /> (마찰 계수 0.5 × 중력가속도 9.8 ≈ 4.9 m/s²)보다 세게 가속하면 마찰이 블록을 붙잡지 못해 미끄러져요. 가속도 그래프는 ±12 에서 잘라 보여요.
      </p>
    </section>
  );
}
