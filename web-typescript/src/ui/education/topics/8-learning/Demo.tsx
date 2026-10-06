'use client';

/** G4 시연으로 배우기: A record a pick-and-place demonstration (poses over time); B replay it after the block moved → grabs air; C record 3 demonstrations and blend them by inverse-distance weights for a new block position → hits inside the demonstrated area, misses outside (success map). */

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Quaternion, Vector3 } from 'three';

import { tcpFor } from '@/engine/simulator/effectors';
import type { BlockPose } from '@/engine/physics/physics';

import { Sym } from '../../lesson/Rich';
import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, STEP_COLORS, Verdict, dots, ease, fmt, lerpQ, reachFor, tipOf, useAnimator, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

const TCP = tcpFor('pump', false);
const BLOCK = 25;
const ABOVE_Z = 70;
const GRASP_Z = BLOCK + 1;
const PLACE: [number, number] = [140, 130];
/** Samples per move between two key poses, and samples per second. */
const PER_SEG = 12;
const RATE = 20;
/** Key pose 2 is the grasp, key 5 the release. */
const GRASP_IX = 2 * PER_SEG;
const PLACE_IX = 5 * PER_SEG;
/** The cup catches the block when its centre is this close (mm). */
const HIT_MM = 12;
const X1: [number, number] = [220, -30];
const MOVED: [number, number] = [175, 70];
const DEMOS: [number, number][] = [
  [180, -40],
  [240, 0],
  [180, 40],
];
const TEST: [number, number] = [205, 5];
const DEMO_COLORS = ['#f59a1b', '#e0457b', '#0ea5b7'];

/** A recorded demonstration: joint angles at RATE samples per second. */
type Traj = number[][];

const pumpAt = (i: number) => i > GRASP_IX && i <= PLACE_IX;

/** The demonstration for a block at `x`: home → above → down → (suck) → up → over the goal → down → (release) → up → home. */
function demoFor(chain: TopicProps['chain'], x: readonly number[]): Traj | null {
  const pts: Mm[] = [
    [x[0], x[1], ABOVE_Z],
    [x[0], x[1], GRASP_Z],
    [x[0], x[1], ABOVE_Z],
    [PLACE[0], PLACE[1], ABOVE_Z],
    [PLACE[0], PLACE[1], GRASP_Z],
    [PLACE[0], PLACE[1], ABOVE_Z],
  ];
  const keys: number[][] = [HOME_POSE.slice()];
  let seed: readonly number[] = HOME_POSE;
  for (const p of pts) {
    const a = reachFor(chain, p, seed, TCP);
    if (!a) return null;
    keys.push(a);
    seed = a;
  }
  keys.push(HOME_POSE.slice());
  const out: Traj = [keys[0]];
  for (let s = 0; s + 1 < keys.length; s += 1) for (let k = 1; k <= PER_SEG; k += 1) out.push(lerpQ(keys[s], keys[s + 1], ease(k / PER_SEG)));
  return out;
}

/** wᵢ ∝ 1 / |x − xᵢ|², the policy π(x) = Σ wᵢ θᵢ(t). */
function blend(demos: readonly { at: readonly number[]; traj: Traj }[], x: readonly number[]): { traj: Traj; w: number[] } {
  const raw = demos.map((d) => 1 / Math.max(1e-6, (x[0] - d.at[0]) ** 2 + (x[1] - d.at[1]) ** 2));
  const sum = raw.reduce((s, v) => s + v, 0);
  const w = raw.map((v) => v / sum);
  const traj = demos[0].traj.map((_, i) => demos[0].traj[i].map((_, j) => demos.reduce((s, d, k) => s + d.traj[i][j] * w[k], 0)));
  return { traj, w };
}

const blockPose = (at: Mm, held: boolean): BlockPose => ({ id: 'g4', color: '#e5484d', size: BLOCK, at: new Vector3(...at), q: new Quaternion(), held });
const onTable = (x: readonly number[]): Mm => [x[0], x[1], BLOCK / 2];
const xyText = (x: readonly number[]) => `(${fmt(x[0], 0)}, ${fmt(x[1], 0)})`;

interface Outcome {
  at: [number, number];
  hit: boolean;
  dist: number;
}

/** The table spots tested for a success map. */
const GRID: [number, number][] = [];
for (let x = 130; x <= 295; x += 15) for (let y = -110; y <= 115; y += 15) GRID.push([x, y]);

export default function G4Demo({ chain, show, onPick, step, record }: TopicProps) {
  const [q, setQ, qRef] = usePose(HOME_POSE);
  const anim = useAnimator();
  const { stop } = anim;
  const [block, setBlock] = useState<Mm>(onTable(X1));
  const [held, setHeld] = useState(false);
  const [pump, setPump] = useState(false);
  const [demo, setDemo] = useState<Traj | null>(null);
  const [path, setPath] = useState<Mm[]>([]);
  const [demos, setDemos] = useState<{ at: [number, number]; traj: Traj; path: Mm[] }[]>([]);
  const [outcome, setOutcome] = useState<Partial<Record<'A' | 'B' | 'C', Outcome>>>({});
  const [tests, setTests] = useState<Outcome[]>([]);
  const [weights, setWeights] = useState<number[] | null>(null);
  const [miss, setMiss] = useState<Mm | null>(null);
  const [mapOf, setMapOf] = useState<'replay' | 'learn'>('learn');
  const [msg, setMsg] = useState('');

  useEffect(() => () => stop(), [step, stop]);

  /** Play a trajectory with the block at `at`; the cup sucks at the grasp pose if the block is under it. */
  const exec = (traj: Traj, at: readonly number[], speed: number, onTrace: ((pts: Mm[]) => void) | null, done: (o: Outcome) => void) => {
    const trace: Mm[] = [];
    let tried = false;
    let lastI = -1;
    let grabbed = false;
    let dist = 0;
    let blk: Mm = onTable(at);
    setBlock(blk);
    setHeld(false);
    setMiss(null);
    const dur = (traj.length - 1) / RATE / speed;
    anim.play(
      dur,
      (t) => {
        const f = Math.min(traj.length - 1, t * RATE * speed);
        const i = Math.floor(f);
        const cur = i + 1 < traj.length ? lerpQ(traj[i], traj[i + 1], f - i) : traj[i];
        const tip = tipOf(chain, cur, TCP);
        if (!tried && i >= GRASP_IX) {
          tried = true;
          const g = tipOf(chain, traj[GRASP_IX], TCP);
          dist = Math.hypot(g[0] - at[0], g[1] - at[1]);
          grabbed = dist <= HIT_MM;
          if (!grabbed) setMiss(g);
        }
        const on = pumpAt(i);
        if (grabbed && on) blk = [tip[0], tip[1], tip[2] - BLOCK / 2 - 1];
        else if (grabbed && i > PLACE_IX) blk = [blk[0], blk[1], BLOCK / 2];
        setPump(on);
        setHeld(grabbed && on);
        setBlock(blk);
        setQ(cur);
        // One recorded pose per sample (0.05 s).
        if (onTrace && i !== lastI) {
          lastI = i;
          trace.push(tip);
          onTrace(trace.slice());
        }
      },
      () => {
        setPump(false);
        setHeld(false);
        done({ at: [at[0], at[1]], hit: grabbed, dist });
      },
    );
  };

  const autoDemo = () => {
    const d = demoFor(chain, X1);
    if (!d) return;
    setPath([]);
    exec(d, X1, 1, setPath, (o) => {
      setDemo(d);
      setOutcome((r) => ({ ...r, A: o }));
      record('A', { 방법: '시연 기록', '시연 수': '1', '블록 위치': xyText(X1), 결과: o.hit ? '집음' : '못 집음', '거리 오차': `${fmt(o.dist)} mm` });
    });
  };

  const moveBlock = (x: readonly number[]) => {
    setBlock(onTable(x));
    setMiss(null);
    setHeld(false);
  };

  const replay = () => {
    const d = demo ?? demoFor(chain, X1);
    if (!d) return;
    if (!demo) setDemo(d);
    const at: [number, number] = [block[0], block[1]];
    exec(d, at, 1, null, (o) => {
      setOutcome((r) => ({ ...r, B: o }));
      record('B', { 방법: '그대로 재생', '시연 수': '1', '블록 위치': xyText(at), 결과: o.hit ? '집음' : '못 집음 (허공)', '거리 오차': `${fmt(o.dist)} mm` });
    });
  };

  const recordThree = () => {
    const made = DEMOS.map((at) => ({ at, traj: demoFor(chain, at) }));
    if (made.some((m) => !m.traj)) return;
    const list: { at: [number, number]; traj: Traj; path: Mm[] }[] = [];
    setDemos([]);
    setTests([]);
    const next = (k: number) => {
      if (k >= made.length) {
        moveBlock(TEST);
        return;
      }
      let pts: Mm[] = [];
      const item = (p: Mm[]) => ({ at: made[k].at, traj: made[k].traj!, path: p });
      exec(
        made[k].traj!,
        made[k].at,
        2,
        (p) => {
          pts = p;
          setDemos([...list, item(p)]);
        },
        () => {
          list.push(item(pts));
          setDemos(list.slice());
          next(k + 1);
        },
      );
    };
    next(0);
  };

  const learnAt = (x: readonly number[]) => {
    if (demos.length < 3) {
      setMsg('먼저 [시연 3개 자동 기록] 을 누르세요.');
      return;
    }
    setMsg('');
    const { traj, w } = blend(demos, x);
    setWeights(w);
    exec(traj, x, 1, null, (o) => {
      setOutcome((r) => ({ ...r, C: o }));
      setTests((t) => [...t, o].slice(-12));
      record('C', { 방법: '시연 3개로 배운 대로', '시연 수': '3', '블록 위치': xyText(x), 결과: o.hit ? '집음' : '못 집음', '거리 오차': `${fmt(o.dist)} mm`, '섞은 비율': w.map((v, i) => `시연 ${i + 1} ${Math.round(v * 100)}%`).join(' · ') });
    });
  };

  // Table clicks: B moves the block, C moves it and tries there.
  const pickAt = useEffectEvent((mm: Mm) => {
    if (anim.running) return;
    const x: [number, number] = [Math.round(mm[0]), Math.round(mm[1])];
    if (!reachFor(chain, [x[0], x[1], GRASP_Z], qRef.current, TCP)) {
      setMsg('그 자리는 손이 닿지 않아요. 더 가까운 곳을 눌러 보세요.');
      return;
    }
    setMsg('');
    moveBlock(x);
    if (step === 'C' && demos.length >= 3) learnAt(x);
  });
  useEffect(() => {
    if (step !== 'B' && step !== 'C') {
      onPick(null);
      return;
    }
    onPick((mm) => pickAt(mm));
    return () => onPick(null);
  }, [step, onPick]);

  // Success maps for the comparison (and C's "everywhere" check): grasp error at each grid spot.
  const maps = useMemo(() => {
    if (step !== 'cmp' && step !== 'C') return null;
    const learned = DEMOS.map((at) => ({ at, traj: demoFor(chain, at) })).filter((d): d is { at: [number, number]; traj: Traj } => !!d.traj);
    const replayHit = GRID.map((x) => Math.hypot(x[0] - X1[0], x[1] - X1[1]) <= HIT_MM);
    const learnHit = GRID.map((x) => {
      if (learned.length < 3) return false;
      const { traj } = blend(learned, x);
      const g = tipOf(chain, traj[GRASP_IX], TCP);
      return Math.hypot(g[0] - x[0], g[1] - x[1]) <= HIT_MM;
    });
    return { replay: replayHit, learn: learnHit };
  }, [step, chain]);
  const [showGrid, setShowGrid] = useState(false);

  const gridLines = (hits: boolean[], key: string) => [
    { key: `${key}-ok`, points: dots(GRID.filter((_, i) => hits[i]).map((x) => [x[0], x[1], 1] as Mm), 4), color: LEARN_COLORS.ok, width: 3, segments: true },
    { key: `${key}-no`, points: dots(GRID.filter((_, i) => !hits[i]).map((x) => [x[0], x[1], 1] as Mm), 3), color: LEARN_COLORS.bad, width: 2, segments: true },
  ];

  useEffect(() => {
    const lines = [];
    if (step === 'A' || step === 'B') lines.push({ key: 'demo', points: dots(path, 2.5), color: STEP_COLORS.A, width: 2, segments: true });
    if (step === 'C') demos.forEach((d, i) => lines.push({ key: `d${i}`, points: dots(d.path, 2.5), color: DEMO_COLORS[i], width: 2, segments: true }));
    if (step === 'C' && showGrid && maps) lines.push(...gridLines(maps.learn, 'c'));
    if (step === 'cmp' && maps) lines.push(...gridLines(mapOf === 'replay' ? maps.replay : maps.learn, 'm'));
    const spots = [
      { key: 'place', mm: [PLACE[0], PLACE[1], 0] as Mm, color: '#667085', label: '놓는 곳' },
      ...(step === 'B' || step === 'cmp' ? [{ key: 'x1', mm: [X1[0], X1[1], 0] as Mm, color: STEP_COLORS.A, label: '시연한 자리' }] : []),
      ...(step === 'C' || (step === 'cmp' && mapOf === 'learn') ? DEMOS.map((d, i) => ({ key: `dm${i}`, mm: [d[0], d[1], 0] as Mm, color: DEMO_COLORS[i], label: `시연 ${i + 1}` })) : []),
      ...(step === 'C' ? tests.map((t, i) => ({ key: `t${i}`, mm: [t.at[0], t.at[1], 0] as Mm, color: t.hit ? LEARN_COLORS.ok : LEARN_COLORS.bad })) : []),
    ];
    show({
      angles: q,
      tool: 'pump',
      pumpOn: pump,
      blocks: step === 'cmp' ? [] : [blockPose(block, held)],
      lines,
      spots,
      contact: miss && step !== 'cmp' ? { mm: miss, text: `허공! ${fmt(Math.hypot(miss[0] - block[0], miss[1] - block[1]), 0)} mm 빗나감` } : null,
    });
  }, [show, q, pump, block, held, path, demos, tests, step, maps, mapOf, showGrid, miss]);

  const o = step === 'A' || step === 'B' || step === 'C' ? outcome[step] : undefined;

  if (step === 'cmp') {
    const hits = maps ? (mapOf === 'replay' ? maps.replay : maps.learn) : [];
    return (
      <section className={css.card}>
        <h3>어디서 성공할까 (성공 지도)</h3>
        <div className={css.seg} role="group" aria-label="지도">
          <button type="button" aria-pressed={mapOf === 'replay'} onClick={() => setMapOf('replay')}>
            그대로 재생 (활동 2)
          </button>
          <button type="button" aria-pressed={mapOf === 'learn'} onClick={() => setMapOf('learn')}>
            배운 대로 (활동 3)
          </button>
        </div>
        <div className={css.row3}>
          <Readout label="성공한 자리" value={`${hits.filter(Boolean).length} / ${GRID.length}`} tone={mapOf === 'learn' ? 'ok' : 'bad'} />
        </div>
        <p className={css.note}>책상 위 초록 = 집음, 빨강 = 빗나감. 그대로 재생은 시연한 그 자리에서만, 배운 대로는 시연 3곳이 둘러싼 범위 안에서 성공해요.</p>
      </section>
    );
  }

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '시연 기록' : step === 'B' ? '그대로 재생' : '여러 시연으로 일반화'}</h3>
      <div className={css.btnRow}>
        {step === 'A' && (
          <button type="button" className={css.primary} disabled={anim.running} onClick={autoDemo}>
            자동 시연
          </button>
        )}
        {step === 'B' && (
          <>
            <button type="button" disabled={anim.running} onClick={() => moveBlock(MOVED)}>
              블록 옮기기
            </button>
            <button type="button" className={css.primary} disabled={anim.running} onClick={replay}>
              재생
            </button>
          </>
        )}
        {step === 'C' && (
          <>
            <button type="button" disabled={anim.running} onClick={recordThree}>
              시연 3개 자동 기록
            </button>
            <button type="button" className={css.primary} disabled={anim.running || demos.length < 3} onClick={() => learnAt([block[0], block[1]])}>
              배운 대로 하기
            </button>
          </>
        )}
      </div>
      {step === 'C' && (
        <label className={css.check}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          여러 곳 한꺼번에 시험 (책상 위 성공 지도)
        </label>
      )}
      <div className={css.row3}>
        <Readout label={step === 'A' ? '기록한 자세' : '블록 위치'} value={step === 'A' ? String(path.length) : xyText(block)} unit={step === 'A' ? '개' : 'mm'} />
        <Readout label="결과" value={o ? (o.hit ? '집음' : '못 집음') : '—'} tone={o ? (o.hit ? 'ok' : 'bad') : undefined} />
        <Readout label="거리 오차" value={o ? fmt(o.dist) : '—'} unit={o ? 'mm' : undefined} />
      </div>
      {step === 'C' && weights && (
        <p className={css.live}>
          섞은 비율 <Sym s="w" name={false} />: {weights.map((w, i) => `시연 ${i + 1} ${Math.round(w * 100)}%`).join(' · ')}
        </p>
      )}
      {msg && <p className={css.warnNote}>{msg}</p>}
      {o && (
        <Verdict tone={o.hit ? 'ok' : 'bad'}>
          {o.hit ? `블록을 집었어요 (컵 중심이 ${fmt(o.dist)} mm 차이).` : `허공을 집었어요 — 블록에서 ${fmt(o.dist, 0)} mm 빗나감.`}
        </Verdict>
      )}
      <p className={css.note}>
        {step === 'A'
          ? '로봇이 블록을 집어 놓는 곳으로 옮겨요. 0.05 초마다 자세를 기록하고, 손끝 자리를 파란 점으로 남겨요.'
          : step === 'B'
            ? '[블록 옮기기] (또는 책상 클릭)로 블록을 다른 자리에 둔 뒤 [재생]. 기록한 자세를 그대로 따라 하니 예전 자리로 가요.'
            : '세 자리(주황·분홍·청록)에서 시연을 기록한 뒤, 책상을 눌러 블록을 새 자리에 두면 가까운 시연일수록 크게 섞어 움직여요(섞는 비율 w 는 거리의 제곱에 반비례). 초록 = 성공, 빨강 = 실패.'}
      </p>
    </section>
  );
}
