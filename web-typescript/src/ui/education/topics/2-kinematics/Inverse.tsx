'use client';

/** B1 역기구학: A matching the green ball by hand with joint sliders, B the iterative solver replayed, C several answers for the same target. */

import { useEffect, useMemo, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN } from '@/engine/robot/limits';
import { NATURAL_SEEDS } from '@/engine/robot/tool';
import { poseContact } from '@/engine/physics/collide';
import { insideProfile } from '@/engine/physics/workspace';

import css from '../../learn.module.css';
import { Sym } from '../../lesson/Rich';
import { Graph, JointSliders, Readout } from '../../widgets';
import { HOME_POSE, LEARN_COLORS, RealButton, TCP, Verdict, dist, fmt, solveTcpIk, tipOf, useGlide, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** Close enough by hand. */
const HAND_OK_MM = 12;
/** The solver stops below this (mm). */
const SOLVE_TOL_MM = 0.1;
/** Damping λ (mm) and the largest joint step per iteration (rad) of the replayed solver. */
const LAMBDA_MM = 10;
const MAX_STEP_RAD = 0.25;
const MAX_ITER = 150;
const D2R = Math.PI / 180;
const SOL_COLORS = ['#3454d1', '#e08a0b', '#d63d73', '#1592c9'];

/**
 * The iterative solve the 원고 writes, for the tool point itself: look at the error e, take the
 * damped least-squares step Δθ = Jᵀ(JJᵀ + λ²I)⁻¹ e (J by finite differences), repeat until |e| < 0.1 mm.
 * Every pose on the way is kept, so the error graph falls once per iteration.
 */
function solveTip(chain: readonly ChainSegment[], target: Mm, seed: readonly number[]) {
  let q = seed.slice();
  const path = [q.slice()];
  for (let it = 0; ; it++) {
    const p = tipOf(chain, q);
    const e = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
    const n = Math.hypot(e[0], e[1], e[2]);
    if (n < SOLVE_TOL_MM || it >= MAX_ITER) return { angles: q, path, iterations: it, errMm: n, ok: n < SOLVE_TOL_MM };
    // Jacobian (mm per rad), one column per joint.
    const J: number[][] = [[], [], []];
    for (let j = 0; j < 6; j++) {
      const qq = q.slice();
      qq[j] += 0.01;
      const pp = tipOf(chain, qq);
      for (let i = 0; i < 3; i++) J[i][j] = (pp[i] - p[i]) / (0.01 * D2R);
    }
    // A = JJᵀ + λ²I (3×3), y = A⁻¹ e, Δθ = Jᵀ y.
    const A = [0, 1, 2].map((i) => [0, 1, 2].map((k) => J[i].reduce((s, v, j) => s + v * J[k][j], 0) + (i === k ? LAMBDA_MM * LAMBDA_MM : 0)));
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const inv = [
      [A[1][1] * A[2][2] - A[1][2] * A[2][1], A[0][2] * A[2][1] - A[0][1] * A[2][2], A[0][1] * A[1][2] - A[0][2] * A[1][1]],
      [A[1][2] * A[2][0] - A[1][0] * A[2][2], A[0][0] * A[2][2] - A[0][2] * A[2][0], A[0][2] * A[1][0] - A[0][0] * A[1][2]],
      [A[1][0] * A[2][1] - A[1][1] * A[2][0], A[0][1] * A[2][0] - A[0][0] * A[2][1], A[0][0] * A[1][1] - A[0][1] * A[1][0]],
    ];
    const y = inv.map((row) => row.reduce((s, v, k) => s + (v / det) * e[k], 0));
    let dq = [0, 1, 2, 3, 4, 5].map((j) => J[0][j] * y[0] + J[1][j] * y[1] + J[2][j] * y[2]);
    const big = Math.max(...dq.map(Math.abs));
    if (big > MAX_STEP_RAD) dq = dq.map((v) => (v * MAX_STEP_RAD) / big);
    q = q.map((v, j) => Math.min(JOINT_ANGLE_MAX[j], Math.max(JOINT_ANGLE_MIN[j], v + dq[j] / D2R)));
    path.push(q.slice());
  }
}

interface Solved {
  ok: boolean;
  iterations: number;
  errMm: number;
  ms: number;
}
interface Found {
  angles: number[][];
  errMm: number[];
  tried: number;
  ms: number;
}

export default function B1Inverse({ chain, show, onPick, real, workspace, frontDeg, step, goStep, record, results }: TopicProps) {
  const [q, setQ, qRef] = usePose(HOME_POSE);
  const { glide, play, stop, running } = useGlide(setQ, qRef);
  const [target, setTarget] = useState<Mm>([180, 80, 100]);
  // A: the clock starts at the first slider move.
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [handDone, setHandDone] = useState<{ s: number; errMm: number; gaveUp: boolean } | null>(null);
  // B: the solver's path, replayed.
  const [trace, setTrace] = useState<number[][]>([]);
  const [shown, setShown] = useState(0);
  const [solved, setSolved] = useState<Solved | null>(null);
  // C: other answers.
  const [found, setFound] = useState<Found | null>(null);
  const [chosen, setChosen] = useState(-1);

  const tip = useMemo(() => tipOf(chain, q), [chain, q]);
  const err = dist(tip, target);
  const inside = workspace ? insideProfile(workspace, target[0], target[1], target[2]) : true;

  // Each try starts from the same folded pose.
  useEffect(() => {
    stop();
    if (step !== 'cmp') setQ(HOME_POSE.slice());
  }, [step, stop, setQ]);

  // A running clock while the hand try is on.
  useEffect(() => {
    if (startAt === null || handDone) return;
    const id = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(id);
  }, [startAt, handDone]);

  const changeTarget = (t: Mm) => {
    stop();
    setTarget(t);
    setStartAt(null);
    setHandDone(null);
    setTrace([]);
    setSolved(null);
    setFound(null);
    setChosen(-1);
  };

  useEffect(() => {
    if (step === 'cmp') {
      onPick(null);
      return;
    }
    onPick((mm) => {
      stop();
      setTarget((t) => [Math.round(mm[0]), Math.round(mm[1]), t[2]]);
      setStartAt(null);
      setHandDone(null);
      setTrace([]);
      setSolved(null);
      setFound(null);
      setChosen(-1);
    });
    return () => onPick(null);
  }, [step, onPick, stop]);

  // ── A: by hand
  const finishHand = (t0: number, t1: number, e: number, gaveUp: boolean) => {
    const s = (t1 - t0) / 1000;
    setHandDone({ s, errMm: e, gaveUp });
    record('A', { 방법: gaveUp ? '손 (포기)' : '손 (슬라이더)', '걸린 시간': `${fmt(s, 1)} s`, '남은 오차': `${fmt(e, 1)} mm`, '답 개수': gaveUp ? '0 개' : '1 개' });
  };
  const moveByHand = (next: number[]) => {
    setQ(next);
    const t1 = performance.now();
    const t0 = startAt ?? t1;
    if (startAt === null) setStartAt(t1);
    setNow(t1);
    const e = dist(tipOf(chain, next), target);
    if (e < HAND_OK_MM) finishHand(t0, t1, e, false);
  };
  const giveUp = () => {
    const t1 = performance.now();
    if (!handDone) finishHand(startAt ?? t1, t1, err, true);
    goStep('B');
  };
  const handAgain = () => {
    setQ(HOME_POSE.slice());
    setStartAt(null);
    setHandDone(null);
  };
  const elapsed = handDone ? handDone.s : startAt === null ? 0 : Math.max(0, (now - startAt) / 1000);

  // ── B: the iterative solver, replayed
  const solve = () => {
    const from = qRef.current.slice();
    const t0 = performance.now();
    let r = solveTip(chain, target, from);
    // Stuck against a joint limit although the target is inside: start again from other poses (no replay of those).
    if (!r.ok && inside) {
      const more = solveTcpIk(chain, target, from, { positionToleranceM: SOLVE_TOL_MM / 1000, restarts: 12 });
      if (more.converged) r = { ...r, angles: more.anglesDeg, path: [...r.path, more.anglesDeg], iterations: r.iterations + more.iterations, errMm: more.positionErrorM * 1000, ok: true };
    }
    const ms = performance.now() - t0;
    const steps = r.path;
    const every = Math.max(1, Math.ceil(steps.length / 90));
    const frames = steps.filter((_, i) => i % every === 0 || i === steps.length - 1);
    const res: Solved = { ok: r.ok, iterations: r.iterations, errMm: r.errMm, ms };
    setTrace(frames);
    setSolved(null);
    const n = frames.length;
    // At least half a second per iteration, so each step of the graph can be followed.
    const D = Math.min(5, Math.max(0.6 + n / 8, n * 0.5));
    play(
      D,
      (t) => {
        const k = Math.min(n - 1, Math.floor((t / D) * n));
        setShown(k);
        setQ(frames[k]);
      },
      () => {
        setSolved(res);
        record('B', {
          방법: `반복 ${res.iterations}회`,
          '걸린 시간': `${fmt(res.ms, 1)} ms`,
          '남은 오차': `${fmt(res.errMm, 2)} mm`,
          '답 개수': res.ok ? '1 개' : '0 개 (닿지 않음)',
        });
      },
    );
  };
  const errs = useMemo(() => trace.map((a) => Math.max(1e-3, dist(tipOf(chain, a), target))), [trace, chain, target]);

  // ── C: start from many seeds, keep the answers whose arm shape differs
  const findAll = () => {
    const cur = qRef.current;
    const seeds: number[][] = [cur.slice(), ...NATURAL_SEEDS];
    for (const j1 of [cur[0], cur[0] + 180, cur[0] - 180])
      for (const [j2, j3, j4] of [
        [40, -100, -30],
        [-40, 100, 30],
        [-30, -60, 0],
        [60, -130, 60],
        [0, 90, -100],
      ])
        seeds.push([Math.max(-165, Math.min(165, j1)), j2, j3, j4, 0, 0]);
    const t0 = performance.now();
    const angles: number[][] = [];
    const errMm: number[] = [];
    let tried = 0;
    for (const s of seeds) {
      tried += 1;
      const r = solveTcpIk(chain, target, s, { positionToleranceM: 0.0005, restarts: 0 });
      if (!r.converged || poseContact(chain, r.anglesDeg, [], TCP)) continue;
      // Different arm shape: J1..J4 apart by more than 20°.
      if (angles.every((f) => Math.max(...[0, 1, 2, 3].map((i) => Math.abs(f[i] - r.anglesDeg[i]))) > 20)) {
        angles.push(r.anglesDeg);
        errMm.push(r.positionErrorM * 1000);
      }
      if (angles.length >= 4) break;
    }
    const ms = performance.now() - t0;
    setFound({ angles, errMm, tried, ms });
    setChosen(-1);
    record('C', {
      방법: `출발 자세 ${tried}개`,
      '걸린 시간': `${fmt(ms, 1)} ms`,
      '남은 오차': angles.length ? `${fmt(Math.max(...errMm), 2)} mm 이하` : '—',
      '답 개수': `${angles.length} 개`,
    });
  };
  const adopt = (i: number) => {
    if (!found) return;
    setChosen(i);
    glide(found.angles[i], 1.2);
  };

  // ── 3D view
  useEffect(() => {
    const failed = solved !== null && !solved.ok;
    const ghostsC = found && (step === 'C' || step === 'cmp') ? found.angles.map((a, i) => ({ key: `sol${i}`, angles: a, color: SOL_COLORS[i], opacity: chosen === i ? 0.1 : 0.28 })) : [];
    const ghostsB =
      step === 'B' && running && trace.length > 1
        ? trace
            .filter((_, i) => i < shown && i % Math.max(1, Math.floor(trace.length / 5)) === 0)
            .slice(-4)
            .map((a, i) => ({ key: `tr${i}`, angles: a, color: LEARN_COLORS.ghost, opacity: 0.12 }))
        : [];
    const close = err < HAND_OK_MM;
    show({
      angles: q,
      frames: 'none',
      target: { mm: target, ok: inside && !failed, label: !inside || failed ? '닿지 않아요' : '목표' },
      workspace: workspace && (!inside || failed) ? { profile: workspace, frontDeg, shell: true, section: false } : null,
      ghosts: [...ghostsC, ...ghostsB],
      lines: err > 1 ? [{ key: 'err', points: [tip, target], color: close ? LEARN_COLORS.ok : LEARN_COLORS.warn, width: 1.5, dashed: true }] : [],
      labels:
        step === 'cmp'
          ? []
          : [{ key: 'e', mm: [(tip[0] + target[0]) / 2, (tip[1] + target[1]) / 2, (tip[2] + target[2]) / 2 + 14], text: `거리 ${fmt(err, err < 10 ? 1 : 0)} mm`, color: close ? LEARN_COLORS.ok : LEARN_COLORS.warn }],
    });
  }, [q, tip, err, target, inside, solved, found, chosen, trace, shown, running, step, workspace, frontDeg, show]);

  const axis = (i: 0 | 1 | 2, label: string, min: number, max: number) => (
    <label className={css.slider}>
      <b>
        <Sym s={label} />
      </b>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={target[i]}
        disabled={running}
        onChange={(e) => changeTarget(target.map((v, k) => (k === i ? Number(e.target.value) : v)) as Mm)}
        aria-label={`목표 ${label}`}
      />
      <span className={css.num}>{target[i]} mm</span>
    </label>
  );

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>손 vs 반복 풀이, 그리고 여러 답</h3>
        <div className={css.row3}>
          <Readout label="활동 1 손으로" value={results.A?.['걸린 시간'] ?? '—'} />
          <Readout label="활동 2 반복 풀이" value={results.B?.['걸린 시간'] ?? '—'} tone="ok" />
          <Readout label="활동 3 찾은 답" value={results.C?.['답 개수'] ?? '—'} />
        </div>
        <p className={css.note}>반투명 팔 = 활동 3에서 찾은 답들. 손끝은 모두 공에 있고 팔 모양만 달라요. 실제 로봇은 지금 자세에서 가장 덜 움직이는 답을 골라요.</p>
      </section>
    );

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '관절 슬라이더로 공에 넣기' : step === 'B' ? '반복 풀이로 다가가기' : '같은 목표, 다른 자세'}</h3>
      <div className={css.sliders}>
        {axis(0, 'x', -280, 300)}
        {axis(1, 'y', -280, 280)}
        {axis(2, 'z', 10, 400)}
      </div>
      <p className={css.live}>
        책상을 클릭해도 목표 x·y 가 바뀌어요. {inside ? '초록 공 = 작업 공간 안.' : '빨간 공 = 작업 공간 밖이라 닿을 수 없어요.'}
      </p>

      {step === 'A' && (
        <>
          <JointSliders angles={q} onChange={moveByHand} disabled={!!handDone} />
          <div className={css.row3}>
            <Readout label="손끝–공 거리" value={fmt(err, 1)} unit="mm" tone={err < HAND_OK_MM ? 'ok' : 'warn'} />
            <Readout label="걸린 시간" value={fmt(elapsed, 1)} unit="s" />
            <Readout label="성공 기준" value={`${HAND_OK_MM}`} unit="mm 안" />
          </div>
          <div className={css.btnRow}>
            <button type="button" className={css.primary} onClick={giveUp}>
              포기하고 반복 풀이로
            </button>
            <button type="button" onClick={handAgain}>
              다시
            </button>
          </div>
          {handDone && !handDone.gaveUp && <Verdict tone="ok">넣었어요! {fmt(handDone.s, 1)} 초 걸렸어요 (남은 거리 {fmt(handDone.errMm, 1)} mm).</Verdict>}
          {!handDone && <p className={css.note}>첫 슬라이더를 움직이면 시간을 재기 시작해요. 손끝이 공에서 {HAND_OK_MM} mm 안으로 들어오면 끝.</p>}
        </>
      )}

      {step === 'B' && (
        <>
          <div className={css.btnRow}>
            <button type="button" className={css.primary} disabled={running} onClick={solve}>
              풀기
            </button>
            <button type="button" disabled={running} onClick={() => setQ(HOME_POSE.slice())}>
              처음 자세
            </button>
          </div>
          {solved && (
            <div className={css.row3}>
              <Readout label="반복" value={String(solved.iterations)} unit="회" />
              <Readout label="남은 오차" value={fmt(solved.errMm, 2)} unit="mm" tone={solved.ok ? 'ok' : 'bad'} />
              <Readout label="계산 시간" value={fmt(solved.ms, 1)} unit="ms" />
            </div>
          )}
          {errs.length > 1 && (
            <Graph title="반복할수록 줄어드는 오차 (로그 눈금)" x={errs.map((_, i) => i)} xUnit="회" series={[{ label: '손끝–목표 거리', color: LEARN_COLORS.warn, values: errs }]} unit="mm" log cursor={shown} height={110} />
          )}
          {solved && !solved.ok && <Verdict tone="bad">답이 없어요. 목표가 작업 공간 밖이라 가장 가까운 곳에서 멈췄어요.</Verdict>}
          {solved?.ok && <RealButton real={real} chain={chain} angles={q} label="실물 로봇으로 이 답" />}
        </>
      )}

      {step === 'C' && (
        <>
          <div className={css.btnRow}>
            <button type="button" className={css.primary} disabled={running} onClick={findAll}>
              다른 답 찾기
            </button>
          </div>
          {found && (
            <div className={css.solutions}>
              <small>{found.angles.length ? `같은 목표의 답 ${found.angles.length}개 (반투명 팔). 눌러서 그 자세로:` : '답이 없어요. 목표를 작업 공간 안으로 옮겨 보세요.'}</small>
              {found.angles.map((s, i) => (
                <button key={i} type="button" aria-pressed={chosen === i} disabled={running} style={{ borderColor: SOL_COLORS[i], color: SOL_COLORS[i] }} onClick={() => adopt(i)}>
                  답 {i + 1} · J2 {fmt(s[1], 0)}° J3 {fmt(s[2], 0)}°
                </button>
              ))}
            </div>
          )}
          {chosen >= 0 && found && <RealButton real={real} chain={chain} angles={found.angles[chosen]} label="실물 로봇으로 이 답" />}
        </>
      )}
    </section>
  );
}
