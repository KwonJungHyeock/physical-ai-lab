'use client';

/** F2 집기와 놓기: A goes straight to the block (and knocks it), B approaches from above in four steps, C places from 0 / 10 / 40 mm. */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { tcpFor } from '@/engine/simulator/effectors';
import { createPhysics, type BlockPose, type BlockSpec, type PhysicsWorld } from '@/engine/physics/physics';
import { STEP_NAME } from '@/engine/education/catalog';

import css from '../../learn.module.css';
import { Graph, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, Verdict, ease, fmt, reachFor, tipOf, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

const TCP = tcpFor('pump', false);
const DT = 1 / 60;
const SIZE = 25;
const BLOCK_AT: Mm = [200, 20, SIZE / 2];
const PLACE: Mm = [170, -110, 0];
/** Where the arm waits: low, beside the block (as after an earlier job). */
const START_TIP: Mm = [140, 140, 15];
const APPROACH = 30;
/** B places with the block 2 mm above the table; C uses the slider. */
const B_GAP = 2;
const GAPS = [0, 10, 40];
const GAP_COLORS: Record<number, string> = { 0: STEP_COLORS.A, 10: STEP_COLORS.B, 40: STEP_COLORS.C };
const SPEC: BlockSpec = { id: 'blk', color: '#e5484d', at: BLOCK_AT, massG: 10 };

export interface Ctl {
  cmd: number[];
  pump: boolean;
  phase: string;
}

export interface PickResult {
  got: boolean;
  /** Block centre from the place spot (horizontal), mm; null when it was not carried. */
  errMm: number | null;
  tiltDeg: number;
  /** Speed when it reaches the table, √(2 g h) from the height it was released at, m/s (null: not released). */
  hitMs: number | null;
  /** How far the approach pushed the block before the grab, mm. */
  knockedMm: number;
  gap: number | null;
  /** Height of the block's bottom above the table at the release and every DT after it, mm. */
  drop: number[];
  final: BlockPose;
}

/** Angle between the block's nearest face axis and the vertical, degrees. */
export function tiltOf(b: BlockPose): number {
  const { x, y, z, w } = b.q;
  const zs = [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  return (Math.acos(Math.min(1, Math.max(...zs.map(Math.abs)))) * 180) / Math.PI;
}

const need = (q: number[] | null) => {
  if (!q) throw new Error('팔이 닿지 않는 자리예요.');
  return q;
};

/** Tool straight up/down/along: IK at `n` points of the line a → b. */
function lineTo(chain: readonly ChainSegment[], from: number[], a: Mm, b: Mm, n = 10): number[][] {
  const out = [from];
  let seed = from;
  for (let k = 1; k <= n; k += 1) {
    const p: Mm = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, a[2] + ((b[2] - a[2]) * k) / n];
    seed = need(reachFor(chain, p, seed, TCP));
    out.push(seed);
  }
  return out;
}

/** Move along joint poses `qs` in `T` seconds (smooth start and stop), one physics step per yield. */
function* glide(ctl: Ctl, qs: number[][], T: number, phase: string): Generator<void, void, void> {
  ctl.phase = phase;
  const n = Math.max(1, Math.round(T / DT));
  for (let k = 1; k <= n; k += 1) {
    const f = ease(k / n) * (qs.length - 1);
    const i = Math.min(qs.length - 2, Math.floor(f));
    const u = f - i;
    ctl.cmd = qs[i].map((a, j) => a + (qs[i + 1][j] - a) * u);
    yield;
  }
}

function* hold(ctl: Ctl, s: number, phase?: string): Generator<void, void, void> {
  if (phase) ctl.phase = phase;
  for (let k = 0; k < Math.round(s / DT); k += 1) yield;
}

export const startPose = (chain: readonly ChainSegment[]) => reachFor(chain, START_TIP, HOME_POSE, TCP);

/**
 * One try. A: joint-space straight to the grasp pose. B and C: up, over the block 30 mm above it,
 * straight down, pump on, straight up. Then (when the block is held) carry over the place spot,
 * down until the block's bottom is `gap` mm above the table, pump off, and up.
 */
export function* pickTry(w: PhysicsWorld, chain: readonly ChainSegment[], start: number[], mode: K, gapIn: number, ctl: Ctl): Generator<void, PickResult, void> {
  w.reset([SPEC], [], start);
  ctl.cmd = start;
  ctl.pump = false;
  yield* hold(ctl, 0.5, '준비');
  const b0 = w.blocks()[0].at.clone();
  const top = b0.z + SIZE / 2;
  const grasp: Mm = [b0.x, b0.y, top + 1.5];
  if (mode === 'A') {
    yield* glide(ctl, [start, need(reachFor(chain, grasp, start, TCP))], 1.4, '블록 위로 곧장');
  } else {
    const up: Mm = [START_TIP[0], START_TIP[1], 90];
    const qUp = need(reachFor(chain, up, start, TCP));
    const above: Mm = [grasp[0], grasp[1], top + APPROACH];
    const qAbove = need(reachFor(chain, above, qUp, TCP));
    yield* glide(ctl, [start, qUp], 0.6, '위로');
    yield* glide(ctl, [qUp, qAbove], 1, `접근: 블록 위 ${APPROACH} mm`);
    yield* glide(ctl, lineTo(chain, qAbove, above, grasp), 0.9, '수직으로 내려가기');
  }
  ctl.pump = true;
  yield* hold(ctl, 0.3, '펌프 켜기');
  const before = w.blocks()[0].at;
  const knockedMm = Math.hypot(before.x - b0.x, before.y - b0.y);
  const got = w.grab(8) !== null;
  if (!got) {
    ctl.phase = '못 집음: 블록이 밀려났어요';
    ctl.pump = false;
    yield* hold(ctl, 0.8);
    const f = w.blocks()[0];
    return { got, errMm: null, tiltDeg: tiltOf(f), hitMs: null, knockedMm, gap: null, drop: [], final: { ...f, at: f.at.clone(), q: f.q.clone() } };
  }
  // How far the block's top hangs below the tool point.
  const tip0 = tipOf(chain, ctl.cmd, TCP);
  const hb = w.blocks()[0].at;
  const hang = tip0[2] - (hb.z + SIZE / 2);
  const gap = mode === 'C' ? gapIn : B_GAP;
  const lift: Mm = [tip0[0], tip0[1], tip0[2] + 50];
  yield* glide(ctl, lineTo(chain, ctl.cmd, tip0, lift), 0.8, '수직으로 들기');
  const over: Mm = [PLACE[0], PLACE[1], SIZE + gap + hang + 50];
  const qOver = need(reachFor(chain, over, ctl.cmd, TCP));
  yield* glide(ctl, [ctl.cmd, qOver], 1.2, '놓을 곳으로 옮기기');
  const at: Mm = [PLACE[0], PLACE[1], SIZE + gap + hang];
  yield* glide(ctl, lineTo(chain, qOver, over, at), 0.9, `내려가기 (바닥 위 ${gap} mm)`);
  yield* hold(ctl, 0.2);
  // Free fall from the height the block's bottom is at now: v = √(2 g h).
  const h = Math.max(0, w.blocks()[0].at.z - SIZE / 2);
  const hit = Math.sqrt(2 * 9.81 * (h / 1000));
  w.release();
  ctl.pump = false;
  ctl.phase = '펌프 끄기 (놓기)';
  const drop: number[] = [h];
  for (let k = 0; k < 45; k += 1) {
    yield;
    drop.push(w.blocks()[0].at.z - SIZE / 2);
  }
  const away: Mm = [PLACE[0], PLACE[1], at[2] + 50];
  yield* glide(ctl, lineTo(chain, ctl.cmd, at, away, 6), 0.6, '위로 빠지기');
  yield* hold(ctl, 0.6);
  const f = w.blocks()[0];
  return {
    got,
    errMm: Math.hypot(f.at.x - PLACE[0], f.at.y - PLACE[1]),
    tiltDeg: tiltOf(f),
    hitMs: hit,
    knockedMm,
    gap,
    drop,
    final: { ...f, at: f.at.clone(), q: f.q.clone() },
  };
}

const rowOf = (r: PickResult) => ({
  집기: r.got ? (r.knockedMm > 3 ? `성공 (블록 ${fmt(r.knockedMm, 0)} mm 밀린 채)` : '성공') : `실패 (블록 ${fmt(r.knockedMm, 0)} mm 밀림)`,
  '놓은 위치 오차': r.errMm === null ? '— (못 옮김)' : `${fmt(r.errMm, 1)} mm`,
  '블록 기울기': `${fmt(r.tiltDeg, 1)}°`,
  '부딪는 속도': r.hitMs === null ? '—' : `${fmt(r.hitMs, 2)} m/s (${r.gap} mm)`,
});

export default function F2PickPlace({ chain, show, step, record }: TopicProps) {
  const k: K = step === 'cmp' ? 'C' : step;
  const start = useMemo(() => startPose(chain), [chain]);
  const [view, setView] = useState<{ q: number[]; blocks: BlockPose[]; pump: boolean; phase: string }>({ q: HOME_POSE.slice(), blocks: [], pump: false, phase: '' });
  const [res, setRes] = useState<Partial<Record<K, PickResult>>>({});
  const [drops, setDrops] = useState<Record<number, number[]>>({});
  const [gapIx, setGapIx] = useState(2);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const sim = useRef<{
    w: PhysicsWorld | null;
    prog: Generator<void, PickResult, void> | null;
    ctl: Ctl;
    done: ((r: PickResult) => void) | null;
    reset: boolean;
  }>({ w: null, prog: null, ctl: { cmd: HOME_POSE.slice(), pump: false, phase: '' }, done: null, reset: false });

  // A new step starts from the same scene: block in place, arm waiting beside it.
  /** The step the last run was started on: a step change resets the scene, but never a run already started on the new step. */
  const runStep = useRef<string | null>(null);
  useEffect(() => {
    if (runStep.current !== step) sim.current.reset = true;
  }, [step]);

  useEffect(() => {
    if (!start) return;
    let alive = true;
    let raf = 0;
    const s = sim.current;
    void createPhysics(chain, TCP, [SPEC], [], start).then((w) => {
      if (!alive) {
        w.dispose();
        return;
      }
      s.w = w;
      s.ctl.cmd = start;
      setReady(true);
      let last = -1;
      let acc = 0;
      const tick = (now: number) => {
        if (last < 0) last = now;
        // While a try runs, catch up to 0.25 s per frame so a slow PC still finishes it (same fixed steps, same result).
        acc = Math.min(acc + (now - last) / 1000, (s.prog ? 15 : 4) * DT);
        last = now;
        while (acc >= DT) {
          acc -= DT;
          if (s.reset) {
            s.reset = false;
            w.reset([SPEC], [], start);
            s.ctl = { cmd: start, pump: false, phase: '' };
            if (s.prog) {
              s.prog = null;
              s.done = null;
              setBusy(false);
            }
          }
          if (s.prog) {
            try {
              const r = s.prog.next();
              if (r.done) {
                s.prog = null;
                s.done?.(r.value);
              }
            } catch (e) {
              s.prog = null;
              setBusy(false);
              setError(e instanceof Error ? e.message : String(e));
            }
          }
          w.stepTo(s.ctl.cmd, DT);
        }
        setView({ q: s.ctl.cmd, blocks: w.blocks(), pump: s.ctl.pump, phase: s.ctl.phase });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      s.w?.dispose();
      s.w = null;
      s.prog = null;
    };
  }, [chain, start]);

  const go = () => {
    const s = sim.current;
    if (!s.w || !start || step === 'cmp') return;
    const key = k;
    // The try resets the world itself; a step change's pending reset must not cancel it on the next tick.
    runStep.current = step;
    s.reset = false;
    s.ctl = { cmd: start, pump: false, phase: '' };
    s.prog = pickTry(s.w, chain, start, key, GAPS[gapIx], s.ctl);
    s.done = (r) => {
      setBusy(false);
      setRes((old) => ({ ...old, [key]: r }));
      if (key === 'C' && r.gap !== null) setDrops((d) => ({ ...d, [r.gap!]: r.drop }));
      record(key, rowOf(r));
    };
    setError('');
    setBusy(true);
  };

  useEffect(() => {
    const spots = [{ key: 'place', mm: [PLACE[0], PLACE[1], 0.5] as Mm, color: LEARN_COLORS.accent, label: '놓을 곳' }];
    if (step === 'cmp') {
      const keys = (['A', 'B', 'C'] as K[]).filter((key) => res[key]);
      show({
        angles: view.q,
        tool: 'pump',
        frames: 'none',
        blocks: keys.map((key) => ({ ...res[key]!.final, id: `${key}-blk`, color: STEP_COLORS[key] })),
        spots: [...spots, { key: 'blk', mm: [BLOCK_AT[0], BLOCK_AT[1], 0.5], color: '#98a2b3', label: '블록 처음 자리' }],
        labels: keys.map((key, i) => ({ key, mm: [res[key]!.final.at.x, res[key]!.final.at.y, 45 + i * 16] as Mm, text: key, color: STEP_COLORS[key] })),
      });
      return;
    }
    const tip = tipOf(chain, view.q, TCP);
    show({
      angles: view.q,
      tool: 'pump',
      pumpOn: view.pump,
      frames: 'none',
      blocks: view.blocks,
      spots,
      labels: view.phase ? [{ key: 'phase', mm: [tip[0], tip[1], tip[2] + 45], text: view.phase, color: view.pump ? LEARN_COLORS.ok : LEARN_COLORS.accent }] : [],
    });
  }, [view, step, res, chain, show]);

  if (!start) return <p className={css.warnNote}>시작 자세를 만들 수 없어요.</p>;

  if (step === 'cmp') {
    const gaps = GAPS.filter((g) => drops[g]);
    const n = Math.max(1, ...gaps.map((g) => drops[g].length));
    return (
      <section className={css.card}>
        <h3>세 방법 한눈에</h3>
        <ul className={css.note}>
          {(['A', 'B', 'C'] as K[]).map((key) =>
            res[key] ? (
              <li key={key} style={{ color: STEP_COLORS[key] }}>
                {STEP_NAME[key]}: {res[key]!.got ? '집음' : '못 집음'}
                {res[key]!.errMm !== null && ` · 오차 ${fmt(res[key]!.errMm!, 1)} mm`} · 기울기 {fmt(res[key]!.tiltDeg, 1)}°
              </li>
            ) : null,
          )}
        </ul>
        {gaps.length > 0 && (
          <Graph
            title="놓은 뒤 블록 바닥 높이 (활동 3)"
            x={Array.from({ length: n }, (_, i) => i * DT)}
            series={gaps.map((g) => ({ label: `${g} mm 에서`, color: GAP_COLORS[g], values: drops[g] }))}
            unit="mm"
            height={90}
          />
        )}
        <p className={css.note}>책상 위 색 블록이 활동 1 · 2 · 3 이 끝난 자리예요 (파랑 점 = 놓을 곳).</p>
      </section>
    );
  }

  const r = res[k];
  const gap = GAPS[gapIx];
  return (
    <section className={css.card}>
      <h3>{k === 'A' ? '바로 집기' : k === 'B' ? '접근 → 내리기 → 잡기 → 들기' : '놓는 높이 바꾸기'}</h3>
      {k === 'C' && (
        <label className={css.slider}>
          <b>놓는 높이</b>
          <input type="range" min={0} max={2} step={1} value={gapIx} disabled={busy} onChange={(e) => setGapIx(Number(e.target.value))} aria-label="놓는 높이" />
          <span className={css.num}>{gap} mm</span>
        </label>
      )}
      <div className={css.btnRow}>
        <button type="button" className={css.primary} disabled={busy || !ready} onClick={go}>
          {k === 'A' ? '바로 집기' : k === 'B' ? '4단계로 집기' : '놓기'}
        </button>
      </div>
      <div className={css.row3}>
        <Readout label="집기" value={r ? (r.got ? '성공' : '실패') : '—'} tone={r ? (r.got ? 'ok' : 'bad') : undefined} />
        <Readout label="놓은 위치 오차" value={r && r.errMm !== null ? fmt(r.errMm, 1) : '—'} unit="mm" />
        <Readout label="블록 기울기" value={r ? fmt(r.tiltDeg, 1) : '—'} unit="°" tone={r && r.tiltDeg > 5 ? 'warn' : undefined} />
      </div>
      {error && <p className={css.warnNote}>{error}</p>}
      {r && (
        <Verdict tone={r.got ? (r.hitMs !== null && r.hitMs > 0.5 ? 'warn' : 'ok') : 'bad'}>
          {!r.got
            ? `낮게 옆으로 다가가다 블록을 ${fmt(r.knockedMm, 0)} mm 밀어 버려서, 흡착컵이 블록에 닿지 않았어요.`
            : k === 'C' && r.hitMs !== null
              ? `${r.gap} mm 위에서 놓아 ${fmt(r.hitMs, 2)} m/s 로 책상에 부딪혔어요 (높이 h 에서 떨어지면 v = √(2gh), g = 9.8 m/s²).`
              : `블록이 제자리에서 붙어 올라왔고, 놓을 곳에서 ${fmt(r.errMm ?? 0, 1)} mm 안에 놓였어요.`}
        </Verdict>
      )}
      {k === 'C' && drops[gap] && (
        <Graph title="놓은 뒤 블록 바닥 높이" x={drops[gap].map((_, i) => i * DT)} series={[{ label: `${gap} mm`, color: GAP_COLORS[gap], values: drops[gap] }]} unit="mm" height={80} />
      )}
      <p className={css.note}>
        {k === 'A'
          ? '책상 가까이 있던 팔이 관절을 한꺼번에 돌려 블록 위로 곧장 가요. 가는 길이 낮아요.'
          : k === 'B'
            ? `먼저 블록 ${APPROACH} mm 위로 가서, 손끝을 수직으로 내려 집고 수직으로 올려요.`
            : '흡착을 끄면 블록은 그 높이에서 자유 낙하해요. 시뮬레이션의 블록은 거의 튕기지 않게(반발 0.05) 되어 있어, 실물보다 얌전해요. 부딪는 속도를 보세요.'}
      </p>
    </section>
  );
}
