'use client';

/**
 * 로봇 시티 · 스마트시티 — 카페에서 음료 건네기(①②)와 돌봄 로봇의 물병 건네기(③) (myCobot 280 RDK X5 + 어댑티브 그리퍼, real size). The same
 * screen and six steps as the other sites (SitePanel; the lesson script is content-markdown/sites/
 * cafe.md), the café in the 교육 3D view (LearnStage, the real arm with the official gripper) and the
 * engine's runs played back (CafeCell):
 *
 *  ① 커피가 넘친다 — the carry's acceleration (궤적 프로파일);
 *  ② 손과 가까워진다 — the speed near the counter and the sensor's detection distance (보호 거리);
 *  ③ 물병이 무거워졌다 (돌봄: the arm on a myAGV, in a resident's room) — the turn's radius and time (관성과 가속 토크).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  BAR,
  BOTTLE,
  CAFE_DEFAULTS,
  CAFE_FIXES,
  CARE_J1_LIMIT,
  CARRY_MAX_S,
  CARRY_Z,
  CUP,
  FRIDGE,
  GRIP_Z,
  HAND,
  J1_MAX_SPEED,
  PICKUP,
  SPILL_ACC,
  SPILL_SLOPE,
  STOP_MARGIN_MM,
  ZONE_MM,
  j1Limit,
  protectiveDistance,
  runCafe,
  scoreCafe,
  trapezoid,
  turnPoses,
  turnTorque,
  type CafeProblem,
  type CafeRun,
  type CafeValues,
  type CarryValues,
  type GuardValues,
  type TurnValues,
} from '@/engine/education/lab/cafe';
import { CAFE_TEXT } from '@/engine/education/lab/cafeText';
import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import { siteStepIndex, SITE_STEPS, type SiteStepId } from '@/engine/education/lab/siteText';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { logRun } from '@/engine/education/runLog';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import CafeCell, { CafePlayback, type CafeMarker, type CafeOverlay } from './CafeCell';
import { CafeAround, CareAround, LOOKS } from './ambient/Around';
import type { CellDim } from './CellKit';
import { ArrowDef, Knob, PROBS, ProbLock, RecordSheet, SitePanel, answeredUpTo, fmt, freshFlow, useLabStart, type FlowState, type MeasureRow } from './SiteFlow';
import RealUse from './RealUse';
import css from './lab.module.css';
import lg from './site.module.css';

/** The café from the front right, a little above (three.js metres, y up): camera, then target. */
export const CAFE_VIEW: ViewPose = [1.3, 1.55, -1.35, 0.05, -0.15, 0.3];
/** ③ 돌봄: from the front left, over the table to the resident on the bed (the room is at real size). */
const CARE_VIEW: ViewPose = [-1.05, 1.45, 1.9, 0.42, 0.12, 0.16];
const SLOW = 0.35;
const SLOW_LEAD_S = 1.6;
const CARRY_LEN = Math.hypot(PICKUP[0] - BAR[0], PICKUP[1] - BAR[1]);

interface Runs {
  before: CafeRun | null;
  latest: CafeRun | null;
}

interface ProbState extends FlowState {
  step: SiteStepId;
  values: CafeValues;
  runs: Runs;
}

const fresh = (p: CafeProblem): ProbState => ({ ...freshFlow(CAFE_TEXT[p]), step: 'brief', values: CAFE_DEFAULTS[p], runs: { before: null, latest: null } });

declare global {
  interface Window {
    /** Open a problem of 스마트시티 at a step, optionally with the worked fix run (and everything before it answered), and the playback at a time or its end (guide pictures, tools/check). */
    __cafeOpen?: (step: SiteStepId, opts?: { prob?: CafeProblem; solve?: boolean; at?: number | 'end' }) => void;
  }
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  hidden?: boolean;
  level?: StudyLevel;
  saved?: Partial<Record<1 | 2 | 3, boolean>>;
  onSolved?(p: 1 | 2 | 3): void;
  onBack(): void;
}

const world = (p: Mm): [number, number, number] => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
const closeLook = (p: Mm): ViewPose => {
  const [x, y, z] = world(p);
  return [x + 0.28, y + 0.2, z + 0.3, x, y, z];
};

/** Where the drink stands before anything has run. */
const startDrink = (p: CafeProblem) => ({ drink: (p === 3 ? [FRIDGE[0], FRIDGE[1], 0] : [BAR[0], BAR[1], 0]) as Mm, mode: (p === 3 ? 'fridge' : 'bar') as 'fridge' | 'bar' });

/* --- 원인 찾기: what to measure, per problem, and how each is drawn in 3D ----------------------- */

interface CafeRow extends MeasureRow {
  dim?: CellDim;
  markers?: CafeMarker[];
}

const DIM_OK = '#3454d1';

function measureRows(chain: readonly ChainSegment[], prob: CafeProblem, run: CafeRun | null): CafeRow[] {
  const f = run?.failure ?? null;
  if (prob === 1) {
    const v = CAFE_DEFAULTS[1] as CarryValues;
    return [
      { label: '출발할 때 가속도 (프로그램)', value: `${fmt(v.acc, 1)} m/s²`, bad: true },
      { label: '그때 수면 기울기 (a ÷ g)', value: `${fmt(v.acc / 9.81, 2)} (${fmt((v.acc / 9.81) * 100)}%)`, bad: true },
      { label: '컵 안지름 · 위 여유', value: `${CUP.inner} mm · ${CUP.headspace} mm` },
      { label: '최고 속도 · 옮기는 시간', value: `${v.speed} mm/s · ${fmt(run?.carryS ?? 0, 2)} s` },
      { label: '넘친 때', value: f ? `${fmt(f.t, 2)} s (바를 떠나는 출발 순간)` : '—', bad: true, markers: f?.at ? [{ key: 'sp', mm: f.at, ok: false, text: '넘친 곳' }] : [] },
    ];
  }
  if (prob === 2) {
    const det = run?.events.find((e) => e.kind === 'detect') ?? null;
    const v = CAFE_DEFAULTS[2] as GuardValues;
    return [
      { label: '감지한 순간 컵과 손 사이', value: det ? `${fmt(det.value ?? 0)} mm` : '—', markers: det?.at ? [{ key: 'det', mm: det.at, ok: true, text: `감지 · ${fmt(det.value ?? 0)} mm` }] : [] },
      { label: '그때 로봇 속도 · 손 속도', value: `${v.zoneSpeed} mm/s · ${HAND.speed} mm/s`, bad: true },
      { label: '센서 반응 시간 · 로봇 감속도', value: `${HAND.react} s · ${HAND.brake} m/s² (커피가 넘치지 않게)` },
      { label: '부딪힌 속도', value: f?.kind === 'touch' ? `${fmt(f.value ?? 0)} mm/s` : '—', bad: true, markers: f?.at ? [{ key: 'hit', mm: f.at, ok: false, text: '부딪힌 곳' }] : [] },
      { label: '감지 거리 (설정)', value: `${v.detect} mm`, bad: true },
    ];
  }
  const v = CAFE_DEFAULTS[3] as TurnValues;
  const b = turnTorque(chain, v);
  const c = turnTorque(chain, v, CUP.kg);
  const P = turnPoses(chain, v.radius);
  const a = Math.atan2(FRIDGE[1], FRIDGE[0]);
  return [
    { label: '물병 · 아침 컵 무게', value: `${fmt(BOTTLE.kg * 1000)} g · ${fmt(CUP.kg * 1000)} g` },
    { label: 'J1에 필요한 최대 토크 (물병 · 컵)', value: `${fmt(b.tau, 3)} · ${fmt(c.tau, 3)} N·m`, bad: true },
    { label: 'J1 토크 제한 (돌봄 모드, 안전 설정)', value: `${fmt(CARE_J1_LIMIT, 2)} N·m (서보 자체는 약 ${fmt(j1Limit(chain), 2)})` },
    { label: '도는 각도 · 시간 · 최대 각가속도', value: `${fmt(Math.abs(b.dq))}° · ${v.time} s · ${fmt(b.alpha, 2)} rad/s² (최고 ${fmt(b.speed)}°/s, 서보 ${J1_MAX_SPEED}°/s까지)`, bad: true },
    {
      label: '몸통에서 물병까지 반지름',
      value: `${v.radius} mm`,
      dim: P ? { key: 'r', a: [0, 0, CARRY_Z - GRIP_Z + 4], b: [v.radius * Math.cos(a), v.radius * Math.sin(a), CARRY_Z - GRIP_Z + 4], text: `${v.radius} mm`, color: DIM_OK } : undefined,
    },
  ];
}

/** Which prediction a run bears out (the index into the problem's predictions). */
function predictionOf(prob: CafeProblem, run: CafeRun | null): number | null {
  if (!run) return null;
  const s = scoreCafe(prob, run);
  if (s.pass) return 0;
  const k = run.failure?.kind;
  if (prob === 1) return k === 'spill' ? 2 : 1;
  if (prob === 2) return k === 'touch' ? 2 : 1;
  return k === 'overload' || k === 'overspeed' ? 2 : 1;
}

function valuesText(p: CafeProblem, v: CafeValues): string {
  if (p === 1) {
    const a = v as CarryValues;
    return `최고 속도 ${fmt(a.speed)} mm/s · 가속도 ${fmt(a.acc, 1)} m/s²`;
  }
  if (p === 2) {
    const g = v as GuardValues;
    return `픽업대 구역 ${fmt(g.zoneSpeed)} mm/s · 감지 ${fmt(g.detect)} mm`;
  }
  const t = v as TurnValues;
  return `반지름 ${fmt(t.radius)} mm · 시간 ${fmt(t.time, 2)} s`;
}

export default function CafeLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<CafeProblem>(1);
  useLabStart('cafe', setProb);
  const [st, setSt] = useState<Record<CafeProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<CafeProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  const [player] = useState(() => new CafePlayback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step, runs } = s;
  const limit = CARE_J1_LIMIT;

  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);

  const patch = useCallback((p: CafeProblem, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
    setSt((all) => ({ ...all, [p]: { ...all[p], ...(typeof ch === 'function' ? ch(all[p]) : ch) } }));
  }, []);
  const setStep = useCallback((step: SiteStepId) => patch(prob, (x) => ({ step, reached: Math.max(x.reached, siteStepIndex(step)) })), [patch, prob]);

  useEffect(() => {
    player.listen((t, done) => {
      setPlayT(t);
      if (done) setPlaying(false);
      if (slowFrom.current !== null && t >= slowFrom.current) {
        slowFrom.current = null;
        player.setRate(SLOW);
        setSlow(true);
      }
    });
    return () => player.listen(null);
  }, [player]);

  const play = useCallback(
    (run: CafeRun | null, at: number | 'end' = 0, slowAt: number | null = null, hold = false) => {
      player.start(run, at, 1);
      if (hold) player.pause();
      slowFrom.current = slowAt !== null && slowAt > player.t ? slowAt : null;
      setSlow(false);
      setPlayT(player.t);
      setPlaying(player.playing);
    },
    [player],
  );

  /** 라인 가동 (the work program's values) or 다시 가동 (the student's). */
  const go = useCallback(
    (which: 'before' | 'latest') => {
      const p = prob;
      const v = which === 'before' ? CAFE_DEFAULTS[p] : st[p].values;
      setBusy(true);
      window.setTimeout(() => {
        const run = runCafe(chain, p, v);
        const sc = scoreCafe(p, run);
        const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const then: SiteStepId = which === 'before' ? 'run' : 'compare';
        patch(p, (x) => ({
          runs: { ...x.runs, [which]: run },
          tries: which === 'latest' ? x.tries + 1 : x.tries,
          missed: which === 'latest' ? null : x.missed,
          log: which === 'latest' ? [...x.log, { time, values: valuesText(p, v), pass: sc.pass, note: sc.headline }] : x.log,
          step: then,
          reached: Math.max(x.reached, siteStepIndex(then)),
        }));
        if (which === 'latest') logRun({ lab: 'cafe', problem: p, pass: sc.pass, durationS: run.durationS, values: v, checks: sc.checks });
        if (which === 'latest' && sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        setBusy(false);
      }, 30);
    },
    [chain, patch, prob, st],
  );

  /** Which run the 3D view plays in this step. */
  const shown = step === 'run' || step === 'cause' ? runs.before : step === 'compare' || step === 'done' ? runs.latest : null;
  const fail = shown?.failure ?? null;
  const lastShown = useRef<{ run: CafeRun | null; step: SiteStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    // ① does not stop the line when the coffee spills: 원인 찾기 holds the run at that moment.
    const hold = step === 'cause' && !!fail && fail.kind === 'spill';
    play(shown, step === 'cause' ? (fail ? fail.t + 0.02 : 'end') : step === 'done' ? 'end' : 0, step === 'run' && fail ? Math.max(0, fail.t - SLOW_LEAD_S) : null, hold);
  }, [shown, step, fail, play]);

  const failAt = fail?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => (failAt && ((step === 'run' && slow) || step === 'cause') ? closeLook(failAt) : null), [failAt, step, slow]);

  useEffect(() => {
    player.setStill(startDrink(prob));
  }, [player, prob]);

  const fi = shown ? Math.min(shown.frames.length - 1, Math.round(playT / 0.02)) : 0;
  const frame = shown ? shown.frames[fi] : null;
  const rows = useMemo(() => measureRows(chain, prob, runs.before), [chain, prob, runs.before]);

  // 값 고치기 previews (no run): ① the profile, ② the protective distance, ③ the turn's torque.
  const vDeferred = useDeferredValue(s.values);
  const turnPrev = useMemo(() => (prob === 3 && step === 'fix' ? turnTorque(chain, vDeferred as TurnValues) : null), [chain, prob, step, vDeferred]);

  const overlay = useMemo<CafeOverlay>(() => {
    const o: CafeOverlay = { markers: [], dims: [] };
    const v = step === 'fix' ? s.values : (shown?.values ?? CAFE_DEFAULTS[prob]);
    if (prob === 2) {
      o.zone = true;
      o.detect = (v as GuardValues).detect;
    }
    if (prob === 3) {
      const r = (v as TurnValues).radius;
      const ok = step === 'fix' ? !!turnPrev && turnPrev.tau <= limit && turnPrev.speed <= J1_MAX_SPEED : shown ? shown.failure?.kind !== 'overload' && shown.failure?.kind !== 'overspeed' : false;
      o.turn = { radius: r, ok };
    }
    if (step === 'fix') return o;
    if (step === 'cause') {
      for (const r of rows.slice(0, s.meas)) {
        if (r.markers) o.markers!.push(...r.markers);
        if (r.dim) o.dims!.push(r.dim);
      }
      return o;
    }
    if (!shown) return o;
    o.path = shown.tip.slice(Math.max(0, fi - 300), fi + 1).filter((_, j) => j % 2 === 0);
    return o;
  }, [prob, step, s.values, s.meas, rows, shown, fi, turnPrev, limit]);

  const scene = useMemo<LearnScene>(() => ({ angles: HOME_Q, tool: 'adaptive', pumpOn: false }), []);

  // Guide pictures and checks: jump to a problem and step (with the worked fix run, everything before it answered).
  useEffect(() => {
    window.__cafeOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      const T = CAFE_TEXT[p];
      const before = st[p].runs.before ?? runCafe(chain, p, CAFE_DEFAULTS[p]);
      let latest = st[p].runs.latest;
      let values = st[p].values;
      let log = st[p].log;
      if (opts.solve) {
        values = CAFE_FIXES[p];
        latest = runCafe(chain, p, values);
        const sc = scoreCafe(p, latest);
        log = [...log, { time: '—', values: valuesText(p, values), pass: sc.pass, note: sc.headline }];
        if (sc.pass) setSolved((x) => ({ ...x, [p]: true }));
      }
      setProb(p);
      patch(p, (x) => ({ ...answeredUpTo(T, x, siteStepIndex(step), measureRows(chain, p, before).length, !!opts.solve), values, log, runs: { before, latest }, step }));
      if (opts.at !== undefined) {
        const at = opts.at;
        window.setTimeout(() => {
          if (player.run) play(player.run, at);
        }, 120);
      }
    };
    return () => {
      delete window.__cafeOpen;
    };
  }, [chain, st, prob, patch, play, player]);

  const sb = runs.before ? scoreCafe(prob, runs.before) : null;
  const sl = runs.latest ? scoreCafe(prob, runs.latest) : null;
  const at = siteStepIndex(step);
  const T = CAFE_TEXT[prob];
  const servedNow = shown ? shown.events.some((e) => (e.kind === 'serve' || e.kind === 'handover') && e.t <= playT + 1e-6) : false;
  const slopeNow = frame ? Math.hypot(frame.slope[0], frame.slope[1]) : 0;
  const handGap = frame?.hand ? Math.max(0, frame.drink[1] - CUP.d / 2 - frame.hand[1]) : null;

  return (
    <div className={`${css.lab} ${lg.cafe}`} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 로봇 시티
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          스마트시티
          <small>{prob === 3 ? '돌봄' : '카페'}</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${CAFE_TEXT[p].title} · ${CAFE_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{CAFE_TEXT[p].title}</span>
              {solved[p] && <i aria-label="해결">✓</i>}
              <ProbLock lab="cafe" p={p} />
            </button>
          ))}
        </nav>
        <nav className={css.steps} aria-label="단계">
          {SITE_STEPS.map((x, i) => (
            <button
              key={x.id}
              type="button"
              data-st={i === at ? 'now' : i < at ? 'done' : i <= s.reached ? 'open' : undefined}
              aria-current={i === at ? 'step' : undefined}
              disabled={i > s.reached}
              onClick={() => setStep(x.id)}
            >
              <i>{i < at ? '✓' : i + 1}</i>
              <span>{x.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <section className={css.stage} aria-label="3D 카페">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={prob === 3 ? CARE_VIEW : CAFE_VIEW} focus={focus} live={player.arm} look={prob === 3 ? LOOKS.care : LOOKS.cafe}>
          {prob === 3 ? <CareAround /> : <CafeAround />}
          <CafeCell player={player} prob={prob} overlay={overlay} />
        </LearnStage>
        {fail && playT >= fail.t && <div className={lg.alarm}>⚠ {fail.text.replace(/ \(작업 중지\)$/, '')}</div>}
        {shown && !fail && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ {scoreCafe(prob, shown).headline}</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        {shown && (
          <div className={lg.board} aria-label="작업 현황">
            <div data-c={servedNow ? 'ok' : undefined}>
              <small>{prob === 3 ? '건넨 물병' : '건넨 음료'}</small>
              <b>{servedNow ? '1 / 1' : '0 / 1'}</b>
            </div>
            {prob === 1 && (
              <div data-c={slopeNow > SPILL_SLOPE ? 'bad' : undefined}>
                <small>수면 기울기 (넘침 {fmt(SPILL_SLOPE * 100)}%)</small>
                <b>{fmt(slopeNow * 100)}%</b>
              </div>
            )}
            {prob === 2 && (
              <div data-c={handGap !== null && handGap < STOP_MARGIN_MM ? 'bad' : undefined}>
                <small>컵과 손 사이</small>
                <b>{handGap === null ? '—' : `${fmt(handGap)} mm`}</b>
              </div>
            )}
            {prob === 3 && (
              <div data-c={(frame?.tau ?? 0) > limit ? 'bad' : undefined}>
                <small>J1 토크 (제한 {fmt(limit, 2)})</small>
                <b>{fmt(frame?.tau ?? 0, 2)} N·m</b>
              </div>
            )}
            <div data-c={frame?.alarm ? 'bad' : 'ok'}>
              <small>작업</small>
              <b>{frame?.alarm ? '중지' : '진행'}</b>
            </div>
            <div>
              <small>시간</small>
              <b>{fmt(playT, 1)} s</b>
            </div>
          </div>
        )}
        {shown && (
          <div className={lg.player}>
            <button
              type="button"
              onClick={() => {
                if (playing) player.pause();
                else if (player.t >= shown.durationS - 1e-6) play(shown, 0, step === 'run' && fail ? Math.max(0, fail.t - SLOW_LEAD_S) : null);
                else player.resume();
                setPlaying(player.playing);
              }}
            >
              {playing ? '❚❚ 멈춤' : '▶ 재생'}
            </button>
            <span>
              {fmt(playT, 1)} / {fmt(shown.durationS, 1)} s
            </span>
          </div>
        )}
        <RealUse site={prob === 3 ? 'care' : 'cafe'} />
        <p className={css.hint}>끌어서 돌려 보기 · 휠로 확대</p>
      </section>

      <aside className={css.panel} aria-label="실습 안내">
        <SitePanel
          T={T}
          lab="cafe"
          st={s}
          boss={prob === 3 ? '윤 요양보호사' : '정 점장'}
          level={level}
          solved={solved[prob]}
          busy={busy}
          order={
            <div className={lg.order}>
              <header>
                작업 기준 <span>{T.order}</span>
              </header>
              <dl>
                <dt>{prob === 3 ? '물병' : '음료'}</dt>
                <dd>{prob === 3 ? `물을 가득 채운 물병 Ø${BOTTLE.d} × ${BOTTLE.h} mm · ${fmt(BOTTLE.kg * 1000)} g` : `시음 컵 Ø${CUP.d} mm · 커피 입구 ${CUP.headspace} mm 아래까지`}</dd>
                <dt>옮기기</dt>
                <dd>{prob === 3 ? '미니 냉장고 위 쟁반 → 침대 옆 협탁 (AGV는 멈춘 채 J1로 돌기)' : '바 → 픽업대 (직선 이동)'}</dd>
                <dt>기준</dt>
                <dd>{prob === 1 ? `넘치지 않기 · ${CARRY_MAX_S} s 안` : prob === 2 ? `움직이는 컵이 손에 닿지 않기 · 손 앞 ${STOP_MARGIN_MM} mm 넘게 남기고 멈춤` : 'J1 과부하 없이 탁자에 놓기'}</dd>
                <dt>도구</dt>
                <dd>{prob === 3 ? 'myAGV 위 myCobot 280 (모바일 매니퓰레이터) · ' : ''}어댑티브 그리퍼{prob === 2 ? ' · 픽업대 거리 센서' : ''}</dd>
              </dl>
            </div>
          }
          program={programLine(prob)}
          runTitle={sb ? sb.headline : '계산 중…'}
          runResult={
            <>
              <p className={lg.secText}>기록에서 시각을 누르면 그 순간으로 가요.</p>
              <Events
                run={runs.before}
                onSeek={(t) => {
                  player.seek(t);
                  player.pause();
                  setPlaying(false);
                }}
              />
            </>
          }
          playing={playing && step === 'run'}
          rows={rows}
          fixTitle={prob === 1 ? '가속도를 고쳐요' : prob === 2 ? '속도와 감지 거리를 고쳐요' : '도는 반지름과 시간을 고쳐요'}
          hmi={
            <>
              {prob === 1 && <HmiCarry v={s.values as CarryValues} on={(values) => patch(prob, { values })} />}
              {prob === 2 && <HmiGuard v={s.values as GuardValues} on={(values) => patch(prob, { values })} />}
              {prob === 3 && <HmiTurn v={s.values as TurnValues} preview={turnPrev} limit={limit} on={(values) => patch(prob, { values })} />}
            </>
          }
          compare={sb && sl && <CompareTable before={sb} latest={sl} />}
          hit={playing ? null : predictionOf(prob, runs.latest)}
          pass={!!sl?.pass}
          notYet={sl && !sl.pass ? sl.headline + '.' : null}
          fig={<PrincipleFig prob={prob} />}
          nextLabel={prob < 3 ? `문제 ${prob + 1} · ${CAFE_TEXT[(prob + 1) as CafeProblem].title} →` : '로봇 시티로 →'}
          patch={(ch) => patch(prob, ch)}
          onRunBefore={() => go('before')}
          onRunFix={() => go('latest')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as CafeProblem) : onBack())}
        />
      </aside>
      {record && <RecordSheet site="스마트시티 (카페 · 돌봄)" tone={lg.cafe} texts={CAFE_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

function programLine(p: CafeProblem): string {
  if (p === 1) return '바 → 픽업대 직선 이동 · 최고 속도 250 mm/s · 가속도 4 m/s² · 빈 컵 회수 프로그램 그대로';
  if (p === 2) return `직선 이동 2 m/s² · 픽업대 구역(마지막 ${ZONE_MM} mm)에서도 250 mm/s · 센서 감지 50 mm → 정지`;
  return `냉장고에서 물병을 집어 팔을 230 mm 뻗은 채 J1만 1.4 s에 143° 돌기 · 돌봄 모드 J1 토크 제한 ${CARE_J1_LIMIT} N·m (아침 컵 때 그대로)`;
}

/* --- pieces ---------------------------------------------------------------------------------- */

function Events({ run, onSeek }: { run: CafeRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  return (
    <ol className={lg.events} aria-label="작업 기록">
      {run.events.map((e, i) => (
        <li key={i} data-k={['spill', 'touch', 'overload', 'overspeed', 'unreachable', 'hit'].includes(e.kind) ? 'bad' : e.kind === 'detect' ? 'warn' : undefined}>
          <button type="button" onClick={() => onSeek(Math.max(0, e.t - 0.6))}>
            <time>{e.t.toFixed(1)} s</time>
            <span>{e.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A short value stays on one line ("최대 0.40 N·m"). */
const keep = (v: string) => (v.length <= 14 ? v.replace(/ /g, ' ') : v);

function CompareTable({ before, latest }: { before: ReturnType<typeof scoreCafe>; latest: ReturnType<typeof scoreCafe> }) {
  return (
    <table className={lg.cmp}>
      <thead>
        <tr>
          <th />
          <th>처음</th>
          <th>지금</th>
        </tr>
      </thead>
      <tbody>
        {latest.checks.map((c, i) => (
          <tr key={c.label}>
            <td>{c.label}</td>
            <td data-c={before.checks[i]?.ok ? undefined : 'bad'}>{keep(before.checks[i]?.value ?? '')}</td>
            <td data-c={c.ok ? 'ok' : 'bad'}>{keep(c.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* --- 값 고치기: the operator panels ------------------------------------------------------------ */

function HmiCarry({ v, on }: { v: CarryValues; on(v: CarryValues): void }) {
  const slope = v.acc / 9.81;
  const T = trapezoid(CARRY_LEN, v.speed, v.acc * 1000).T;
  return (
    <div className={lg.hmi}>
      <header>
        <span>MOTION · 직선 이동</span>
        <i>● 사다리꼴 · 거리 {fmt(CARRY_LEN)} mm</i>
      </header>
      <Knob id="cafe-v" label="최고 속도" unit="mm/s" v={v.speed} min={100} max={300} step={10} note="등속 구간의 빠르기" on={(speed) => on({ ...v, speed })} />
      <Knob id="cafe-a" label="가속도 (출발 · 멈춤)" unit="m/s²" v={v.acc} min={0.5} max={6} step={0.1} note={`넘치는 가속도 ${fmt(SPILL_ACC, 2)} m/s²`} on={(acc) => on({ ...v, acc: Math.round(acc * 10) / 10 })} />
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>수면 기울기 a ÷ g (넘침 {fmt(SPILL_SLOPE, 2)})</td>
            <td data-c={slope > SPILL_SLOPE ? 'press' : slope > SPILL_SLOPE * 0.85 ? 'drop' : 'ok'}>
              {fmt(slope, 2)}
              {slope > SPILL_SLOPE ? ' · 넘침' : slope > SPILL_SLOPE * 0.85 ? ' · 아슬아슬' : ''}
            </td>
          </tr>
          <tr>
            <td>옮기는 시간 (기준 {CARRY_MAX_S} s)</td>
            <td data-c={T > CARRY_MAX_S ? 'press' : 'ok'}>{fmt(T, 2)} s</td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>그래프: 속도 (가속 · 등속 · 감속, 기울기가 가속도예요)</small>
      <ProfileGraph speed={v.speed} acc={v.acc} />
    </div>
  );
}

/** ①: the trapezoid speed profile for values. */
function ProfileGraph({ speed, acc }: { speed: number; acc: number }) {
  const tr = trapezoid(CARRY_LEN, speed, acc * 1000);
  const W = 280;
  const H = 70;
  const tMax = 2.5;
  const pts = Array.from({ length: 61 }, (_, k) => {
    const t = (k / 60) * tr.T;
    return `${(t / tMax) * W},${H - (tr.at(t).v / 300) * (H - 8)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 70, background: '#141a22', borderRadius: 8 }} role="img" aria-label="속도 그래프">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#3a4452" />
      <line x1={(CARRY_MAX_S / tMax) * W} x2={(CARRY_MAX_S / tMax) * W} y1={0} y2={H} stroke="#ff8a80" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke="#6fe3a5" strokeWidth={2} />
    </svg>
  );
}

function HmiGuard({ v, on }: { v: GuardValues; on(v: GuardValues): void }) {
  const S = protectiveDistance(v);
  const spare = v.detect - S.total;
  return (
    <div className={lg.hmi}>
      <header>
        <span>SAFETY · 픽업대</span>
        <i>● 손 {HAND.speed} mm/s · 반응 {HAND.react} s · 감속 {HAND.brake} m/s²</i>
      </header>
      <Knob id="cafe-zv" label={`픽업대 구역 속도 (마지막 ${ZONE_MM} mm)`} unit="mm/s" v={v.zoneSpeed} min={50} max={250} step={10} note="구역 밖은 250 mm/s 그대로" on={(zoneSpeed) => on({ ...v, zoneSpeed })} />
      <Knob id="cafe-det" label="센서 감지 거리" unit="mm" v={v.detect} min={30} max={150} step={5} note="컵 앞에서 손이 이 안에 들어오면 정지" on={(detect) => on({ ...v, detect })} />
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>반응하는 동안 (둘 다 다가옴)</td>
            <td>{fmt(S.react, 1)} mm</td>
          </tr>
          <tr>
            <td>로봇이 서는 거리 v² ÷ 2a</td>
            <td>{fmt(S.brake, 1)} mm</td>
          </tr>
          <tr>
            <td>서는 동안 손이 오는 거리</td>
            <td>{fmt(S.handWhileBraking, 1)} mm</td>
          </tr>
          <tr>
            <td>보호 거리 S</td>
            <td>{fmt(S.total, 1)} mm</td>
          </tr>
          <tr>
            <td>감지 거리 − S (30 mm 넘게)</td>
            <td data-c={spare < 0 ? 'press' : spare < 30 ? 'drop' : 'ok'}>
              {fmt(spare, 1)} mm{spare < 0 ? ' · 닿음' : spare < 30 ? ' · 여유 부족' : ''}
            </td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>3D 화면의 주황 상자가 감지 구역, 주황 점선부터가 픽업대 구역이에요.</small>
    </div>
  );
}

function HmiTurn({ v, preview, limit, on }: { v: TurnValues; preview: ReturnType<typeof turnTorque> | null; limit: number; on(v: TurnValues): void }) {
  const tau = preview?.tau ?? NaN;
  const speed = preview?.speed ?? NaN;
  return (
    <div className={lg.hmi}>
      <header>
        <span>MOTION · J1 돌기</span>
        <i>● 물병 {fmt(BOTTLE.kg * 1000)} g · 143°</i>
      </header>
      <Knob id="cafe-r" label="도는 동안 물병까지 반지름" unit="mm" v={v.radius} min={130} max={240} step={5} note="팔을 접을수록 작아져요" on={(radius) => on({ ...v, radius })} />
      <Knob id="cafe-t" label="도는 시간" unit="s" v={v.time} min={1} max={2.5} step={0.05} note="5차 궤적: 최대 각가속도 = 5.77 × 각도 ÷ 시간², 최고 속도 = 1.875 × 각도 ÷ 시간" on={(time) => on({ ...v, time: Math.round(time * 100) / 100 })} />
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>최대 각가속도</td>
            <td>{preview ? `${fmt(preview.alpha, 1)} rad/s²` : '…'}</td>
          </tr>
          <tr>
            <td>J1 최고 속도 (서보 {J1_MAX_SPEED}°/s까지)</td>
            <td data-c={!preview || !Number.isFinite(speed) ? undefined : speed > J1_MAX_SPEED ? 'press' : 'ok'}>{!preview ? '…' : Number.isFinite(speed) ? `${fmt(speed)}°/s${speed > J1_MAX_SPEED ? ' · 따라갈 수 없음' : ''}` : '—'}</td>
          </tr>
          <tr>
            <td>J1에 필요한 최대 토크 (돌봄 모드 제한 {fmt(limit, 2)})</td>
            <td data-c={!preview || !Number.isFinite(tau) ? undefined : tau > limit ? 'press' : tau > limit * 0.85 ? 'drop' : 'ok'}>
              {!preview ? '…' : Number.isFinite(tau) ? `${fmt(tau, 3)} N·m${tau > limit ? ' · 과부하' : tau > limit * 0.85 ? ' · 아슬아슬' : ''}` : '손이 닿지 않아요'}
            </td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>3D 화면의 점선 호가 물병이 지나갈 길이에요 (초록: 제한 안, 빨강: 과부하나 너무 빠름).</small>
    </div>
  );
}

/* --- 해결 · 원리: the principle figure, per problem --------------------------------------------- */

function PrincipleFig({ prob }: { prob: CafeProblem }) {
  if (prob === 1) {
    // A cup accelerating: the coffee leans back by a/g; past 2h/d it reaches the rim.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="가속하면 수면이 a ÷ g만큼 기운다">
        <path d="M70,20 L78,96 L132,96 L140,20" className={lg.figOld} />
        <polygon points="74,52 136,36 132,94 78,94" className={lg.figBox} />
        <line x1={50} x2={160} y1={58} y2={30} className={lg.figGuide} />
        <line x1={150} x2={200} y1={70} y2={70} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={160} y={64} className={lg.figTxt}>
          가속 a
        </text>
        <text x={186} y={30} className={lg.figStrong}>
          기울기 = a ÷ g
        </text>
        <text x={186} y={48} className={lg.figTxt}>
          넘침: 2h ÷ d (h 위 여유, d 안지름)
        </text>
        <text x={186} y={92} className={lg.figStrong}>
          a &lt; 2.72 m/s²
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    // A timeline: detect → react (both keep coming) → brake (robot slows, hand keeps coming) → rest.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="감지에서 멈춤까지 좁혀지는 거리가 보호 거리">
        <rect x={20} y={40} width={80} height={22} rx={4} className={lg.figOld} />
        <rect x={100} y={40} width={60} height={22} rx={4} className={lg.figBox} />
        <text x={30} y={55} className={lg.figTxt}>
          반응 0.1 s
        </text>
        <text x={106} y={55} className={lg.figTxt}>
          감속
        </text>
        <line x1={20} x2={20} y1={30} y2={72} className={lg.figUp} />
        <line x1={160} x2={160} y1={30} y2={72} className={lg.figUp} />
        <text x={8} y={24} className={lg.figTxt}>
          감지
        </text>
        <text x={150} y={24} className={lg.figTxt}>
          멈춤
        </text>
        <text x={176} y={46} className={lg.figStrong}>
          S = (v손 + v로봇) t
        </text>
        <text x={176} y={62} className={lg.figStrong}>
          + v² ÷ 2a + v손 v ÷ a
        </text>
        <text x={20} y={96} className={lg.figTxt}>
          감지 거리 &gt; S + 여유 · 사람 근처는 느리게
        </text>
        <ArrowDef />
      </svg>
    );
  }
  // Seen from above: the same turn with the bottle far out and folded in; τ = I α, I ≈ m r².
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="반지름이 작을수록, 시간이 길수록 토크가 작다">
      <circle cx={70} cy={60} r={8} className={lg.figCup} />
      <path d="M70,60 m-50,0 a50,50 0 0,1 100,0" className={lg.figArrow} fill="none" stroke="#e5484d" />
      <path d="M70,60 m-39,0 a39,39 0 0,1 78,0" className={lg.figUp} fill="none" />
      <circle cx={20} cy={60} r={5} fill="#f08c2e" />
      <circle cx={31} cy={60} r={5} fill="#1f9d55" />
      <text x={2} y={80} className={lg.figTxt}>
        230
      </text>
      <text x={28} y={80} className={lg.figTxt}>
        180
      </text>
      <text x={150} y={36} className={lg.figStrong}>
        τ = I α
      </text>
      <text x={150} y={54} className={lg.figTxt}>
        I ≈ m r² (+ 팔)
      </text>
      <text x={150} y={72} className={lg.figTxt}>
        α = 5.77 × 각도 ÷ T²
      </text>
      <text x={150} y={94} className={lg.figStrong}>
        가까이 · 천천히
      </text>
      <ArrowDef />
    </svg>
  );
}
