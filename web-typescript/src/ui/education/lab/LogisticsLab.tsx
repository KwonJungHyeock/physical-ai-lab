'use client';

/**
 * 산업단지 · 물류 센터 — 팔레타이징 (myCobot 280 RDK X5 + 흡착 펌프, real size). One screen like
 * the conveyor lab: a slim bar (← 로봇 시티, the site, problems ①②③, the six steps), the cell in the
 * 교육 3D view (LearnStage, the real arm) with the line's board over it, and one panel with what
 * the step needs, as the lesson script has it (content-markdown/sites/logistics.md):
 *  작업 지시 (the day, the foreman, the goals) → 가동 · 문제 (the run; it slows down and closes in
 *  on the moment it goes wrong; questions to ask) → 원인 찾기 (measure — each value drawn in 3D —,
 *  pick the cause with a reply to each answer, complete the explanation) → 값 고치기 (work out the
 *  numbers first; then the operator panel, a prediction, hints) → 다시 가동 · 비교 (before and
 *  after; why a prediction missed) → 해결 · 원리 (the principle card with its figure, check
 *  questions, the university extension, the real robot, the student's record to print).
 *
 *  ① 쌓다가 무너진다 — the place height per layer (층 간격, 여유);
 *  ② 빨리 하니 미끄러진다 — speeds with and without a box against the suction cup's grip;
 *  ③ 팔레트 자리가 바뀐다 — teach the pallet's reference point again with the cup.
 *
 * Each run is computed by the engine with real rigid-body physics (engine/education/lab/pallet.ts)
 * in one go, then played back here (PalletCell).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import { LOGI_STEPS, LOGI_TEXT, type LogiStepId } from '@/engine/education/lab/logistics';
import {
  DEFAULTS,
  DROP_OK_MM,
  FEED,
  FIXES,
  G,
  HEAVY_G,
  MARK_OFF,
  N_BOXES,
  OK_TOL,
  PAL,
  PAL_HOME,
  PAL_MOVED,
  PBOX,
  PRESS_OK_MM,
  STACK_RANGE,
  SUCTION_N,
  TIME_LIMIT_S,
  accLimit,
  limitFor,
  placeZ,
  progFromRef,
  restZ,
  runStack,
  scoreStack,
  setupFor,
  slotCentre,
  type LogiProblem,
  type LogiValues,
  type PFrame,
  type PalletRun,
  type RefValues,
  type SpeedValues,
  type StackScore,
  type StackValues,
} from '@/engine/education/lab/pallet';
import { toolPoseAt } from '@/engine/education/lab/run';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { logRun } from '@/engine/education/runLog';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import { Lines } from '../lesson/Rich';
import PalletCell, { PalletPlayback, type PalletDim, type PalletOverlay } from './PalletCell';
import { LogisticsAround, LOOKS } from './ambient/Around';
import { ArrowDef, Knob, ProbLock, RecordSheet, SitePanel, answeredUpTo, fmt, freshFlow, useLabStart, type FlowState, type MeasureRow } from './SiteFlow';
import RealUse from './RealUse';
import css from './lab.module.css';
import lg from './site.module.css';

/** The cell on its bench from the front right, at a standing person's eye, the warehouse behind it (three.js metres, y up): camera, then target. */
export const LOGI_VIEW: ViewPose = [1.45, 0.7, 0.75, -0.15, 0.05, -0.05];
/** Playback speed of a run (they take 10 – 100 s of line time), and near the moment it goes wrong. */
const FAST = 3;
const SLOW = 0.35;
/** The slow motion starts this long before the failure. */
const SLOW_LEAD_S = 1.6;
const PROBS: readonly LogiProblem[] = [1, 2, 3];
/** ②: the largest cup acceleration with a box at full travel speed (measured by the engine), for the operator panel's rough guide. */
const ACC_AT_FULL = 7.3;

interface Runs {
  before: PalletRun | null;
  latest: PalletRun | null;
}

interface ProbState extends FlowState {
  step: LogiStepId;
  values: LogiValues;
  runs: Runs;
}

const fresh = (p: LogiProblem): ProbState => ({ ...freshFlow(LOGI_TEXT[p]), step: 'brief', values: DEFAULTS[p], runs: { before: null, latest: null } });

declare global {
  interface Window {
    /** Open a problem of 물류 at a step, optionally with the worked fix run (and everything before it answered), and the playback at a time or its end (guide pictures, tools/check). */
    __logiOpen?: (step: LogiStepId, opts?: { prob?: LogiProblem; solve?: boolean; at?: number | 'end' }) => void;
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

const stepIndex = (s: LogiStepId) => LOGI_STEPS.findIndex((x) => x.id === s);
/** Three.js world (y up, metres) from the robot frame (z up, mm). */
const world = (p: Mm): [number, number, number] => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
/** A close look at a point of the cell: from the same side as the usual view, nearer. */
const closeLook = (p: Mm): ViewPose => {
  const [x, y, z] = world(p);
  return [x + 0.36, y + 0.25, z + 0.39, x, y, z];
};

/** Boxes before anything has run: the first one standing at the stop, the others not come yet. */
const START_BOXES: PFrame['boxes'] = Array.from({ length: N_BOXES }, (_, k) => ({
  at: [FEED.x, FEED.yStop + PBOX.sy / 2, FEED.top + PBOX.h / 2] as Mm,
  q: [0, 0, 0, 1] as [number, number, number, number],
  mode: k === 0 ? ('belt' as const) : ('wait' as const),
}));

/** ①: a layer's place height against where the box would rest: pressed in, dropped, or right. */
function layerState(v: StackValues, layer: number): { d: number; state: 'press' | 'drop' | 'ok' } {
  const d = placeZ(v, layer) - restZ(layer);
  return { d, state: d < -PRESS_OK_MM ? 'press' : d > DROP_OK_MM ? 'drop' : 'ok' };
}

/** The values of a try, in words (the record, the compare table). */
function valuesText(p: LogiProblem, v: LogiValues): string {
  if (p === 1) {
    const s = v as StackValues;
    return `층 간격 ${s.pitch} mm · 여유 ${s.gap} mm`;
  }
  if (p === 2) {
    const s = v as SpeedValues;
    return `들고 ${s.carry} · 빈손 ${s.empty} · 위아래 ${s.vert}`;
  }
  const r = v as RefValues;
  return `기준점 (${fmt(r.x)}, ${fmt(r.y)}) mm`;
}

/* --- 원인 찾기: what to measure, per problem (each value drawn in 3D where it has a place) --- */

interface LogiRow extends MeasureRow {
  dim?: PalletDim;
}

const DIM_OK = '#3454d1';
const DIM_BAD = '#e5484d';

function measureRows(prob: LogiProblem, run: PalletRun | null): LogiRow[] {
  const f = run?.failure;
  if (prob === 1) {
    const v = DEFAULTS[1] as StackValues;
    const [x, y] = slotCentre(0);
    // In front of box 1, side by side across the view (labels at the top end, apart).
    const fx = x + PBOX.sx / 2 + 8;
    return [
      { label: '새 상자 높이 (자로 잰 값)', value: `${PBOX.h} mm`, dim: { key: 'h', a: [fx, y - 16, PAL.top], b: [fx, y - 16, PAL.top + PBOX.h], text: `상자 ${PBOX.h} mm`, color: DIM_OK, label: 'l' } },
      { label: '작업 프로그램의 층 간격', value: `${v.pitch} mm`, bad: true },
      { label: '2층에서 컵이 내려간 높이', value: `${placeZ(v, 1)} mm`, bad: true, dim: { key: 'z2', a: [fx, y, 0], b: [fx, y, placeZ(v, 1)], text: `컵 ${placeZ(v, 1)} mm`, color: DIM_BAD, label: 'l' } },
      { label: '2층 상자 윗면이 와야 할 높이', value: `${restZ(1)} mm`, dim: { key: 'r2', a: [fx, y + 16, 0], b: [fx, y + 16, restZ(1)], text: `놓일 곳 ${restZ(1)} mm`, color: DIM_OK, label: 'r' } },
      { label: '아래 상자를 누른 깊이', value: `${fmt(f?.mm ?? 0)} mm`, bad: true },
    ];
  }
  if (prob === 2) {
    const a = f?.kind === 'slip' ? (f.mm ?? 0) : (run?.maxCarryAcc ?? 0);
    const m = HEAVY_G / 1000;
    return [
      { label: '상자 무게 (저울)', value: `${HEAVY_G} g` },
      { label: '흡착 컵이 붙잡는 힘 (펌프 사양)', value: `${SUCTION_N} N` },
      { label: '가만히 들 때 필요한 힘 (m × g)', value: `${fmt(m * G, 2)} N` },
      { label: '떨어진 순간의 손끝 가속도', value: `${fmt(a, 1)} m/s²`, bad: true },
      { label: '그때 필요한 힘 m × (g + a)', value: `${fmt(m * (G + a), 2)} N`, bad: true },
    ];
  }
  const prog = run?.values.prog ?? PAL_HOME;
  const c = slotCentre(0, prog);
  const edge = PAL_MOVED.y - PAL.sy / 2;
  const dx = PAL_MOVED.x - PAL_HOME.x;
  const dy = PAL_MOVED.y - PAL_HOME.y;
  return [
    { label: '프로그램이 기억하는 기준점', value: `(${fmt(prog.x + MARK_OFF[0])}, ${fmt(prog.y + MARK_OFF[1])}) mm` },
    {
      label: '팔레트가 옮겨진 거리 (표시선 → 팔레트)',
      value: `앞 +${fmt(dx)} · 로봇 쪽 +${fmt(dy)} mm`,
      bad: true,
      // From where the reference mark was to where it is.
      // From the taped corner to the pallet's corner (the back corner, away from the first box).
      dim: { key: 'mv', a: [PAL_HOME.x - PAL.sx / 2, PAL_HOME.y + PAL.sy / 2, 1], b: [PAL_MOVED.x - PAL.sx / 2, PAL_MOVED.y + PAL.sy / 2, 1], text: `+${fmt(dx)}, +${fmt(dy)} mm`, color: DIM_BAD, label: 'l' },
    },
    { label: '첫 상자를 놓은 자리 (중심 y)', value: `${fmt(c[1])} mm` },
    { label: '실제 팔레트 오른쪽 끝 (y)', value: `${fmt(edge)} mm`, dim: { key: 'edge', a: [c[0] - 40, edge, PAL.top + 1], b: [c[0] + 70, edge, PAL.top + 1], text: `팔레트 끝 ${fmt(edge)}`, color: DIM_OK, label: 'r' } },
    { label: '상자 중심이 팔레트 밖으로', value: `${fmt(edge - c[1])} mm`, bad: true, dim: { key: 'out', a: [c[0] - 40, edge, PAL.top + 1], b: [c[0] - 40, c[1], PAL.top + 1], text: `밖으로 ${fmt(edge - c[1])} mm`, color: DIM_BAD, label: 'l' } },
  ];
}

/** ②: the cup's acceleration at frame i (finite differences of the tool path), mm/s² direction and m/s². */
function accAt(run: PalletRun, i: number): { dir: Mm; mag: number } | null {
  const p = run.tip;
  if (i < 2 || i + 2 >= p.length) return null;
  const a = [0, 1, 2].map((k) => (p[i + 2][k] - 2 * p[i][k] + p[i - 2][k]) / 0.0016 / 1000) as Mm;
  const n = Math.hypot(...a);
  return n < 0.3 ? null : { dir: [a[0] / n, a[1] / n, a[2] / n], mag: n };
}

export default function LogisticsLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<LogiProblem>(1);
  useLabStart('logistics', setProb);
  const [st, setSt] = useState<Record<LogiProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<LogiProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(true);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  const [player] = useState(() => new PalletPlayback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step, runs } = s;

  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);

  const patch = useCallback((p: LogiProblem, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
    setSt((all) => ({ ...all, [p]: { ...all[p], ...(typeof ch === 'function' ? ch(all[p]) : ch) } }));
  }, []);
  const setStep = useCallback((step: LogiStepId) => patch(prob, (x) => ({ step, reached: Math.max(x.reached, stepIndex(step)) })), [patch, prob]);

  useEffect(() => {
    player.listen((t, done) => {
      setPlayT(t);
      if (done) setPlaying(false);
      // Near the moment it goes wrong: slow down (and the camera closes in, below).
      if (slowFrom.current !== null && t >= slowFrom.current) {
        slowFrom.current = null;
        player.setRate(SLOW);
        setSlow(true);
      }
    });
    return () => player.listen(null);
  }, [player]);

  const play = useCallback(
    (run: PalletRun | null, at: number | 'end' = 0, slowAt: number | null = null) => {
      player.start(run, at, fast ? FAST : 1);
      slowFrom.current = slowAt !== null && slowAt > player.t ? slowAt : null;
      setSlow(false);
      setPlayT(player.t);
      setPlaying(player.playing);
    },
    [player, fast],
  );

  /** Run the line (the starting values for 가동, the student's for 다시 가동). */
  const go = useCallback(
    (which: 'before' | 'latest', v: LogiValues, then: LogiStepId) => {
      const p = prob;
      setBusy(true);
      void runStack(chain, setupFor(p, v)).then((run) => {
        const sc = scoreStack(run, limitFor(p));
        const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        patch(p, (x) => ({
          runs: { ...x.runs, [which]: run },
          tries: which === 'latest' ? x.tries + 1 : x.tries,
          missed: which === 'latest' ? null : x.missed,
          log: which === 'latest' ? [...x.log, { time, values: valuesText(p, v), pass: sc.pass, note: sc.pass ? `합격 · ${fmt(sc.timeS, 1)} s` : whyNotYet(p, sc) }] : x.log,
          step: then,
          reached: Math.max(x.reached, stepIndex(then)),
        }));
        if (which === 'latest')
          logRun({
            lab: 'logistics',
            problem: p,
            pass: sc.pass,
            durationS: run.durationS,
            values: v,
            checks: [
              { label: '바르게 놓은 상자', ok: sc.ok === sc.placed && sc.placed > 0, value: `${sc.ok} / ${sc.placed}` },
              { label: '무너진 상자', ok: sc.fallen === 0, value: `${sc.fallen}개` },
              { label: '놓을 때 높이', ok: !sc.slipped, value: `최대 ${fmt(sc.maxDrop, 1)} mm` },
              { label: '작업 시간', ok: sc.pass, value: `${fmt(sc.timeS, 1)} s` },
            ],
          });
        if (which === 'latest' && sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        setBusy(false);
      });
    },
    [chain, patch, prob],
  );

  /** Which run the 3D view plays in this step. */
  const shown = step === 'run' || step === 'cause' ? runs.before : step === 'compare' || step === 'done' ? (runs.latest ?? null) : null;
  const failT = shown?.failure?.t ?? null;
  const lastShown = useRef<{ run: PalletRun | null; step: LogiStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    play(shown, step === 'cause' ? (failT ?? 'end') : step === 'done' ? 'end' : 0, step === 'run' && failT !== null ? Math.max(0, failT - SLOW_LEAD_S) : null);
  }, [shown, step, failT, play]);

  // The close look: while the failure plays slowly, and while looking for the cause.
  const failAt = shown?.failure?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => (failAt && ((step === 'run' && slow) || step === 'cause') ? closeLook(failAt) : null), [failAt, step, slow]);

  // Standing still (작업 지시, 값 고치기): before any run the first box at the stop; while fixing ①,
  // layer 1 as it was placed (the starting run's frame just before the first press).
  const still = useMemo<PFrame['boxes']>(() => {
    if (prob === 1 && step === 'fix' && runs.before) {
      const f = runs.before.frames.find((fr) => fr.boxes[4]?.mode === 'held') ?? runs.before.frames[runs.before.frames.length - 1];
      return f.boxes.map((b, k) => (k < 4 ? b : { ...b, mode: 'wait' as const }));
    }
    return START_BOXES;
  }, [prob, step, runs.before]);
  useEffect(() => {
    player.setStill(still);
  }, [player, still]);

  const fi = shown ? Math.min(shown.frames.length - 1, Math.round(playT / 0.02)) : 0;
  const frame = shown ? shown.frames[fi] : null;
  const ref3 = prob === 3 ? (s.values as RefValues) : null;
  const refPose = useMemo(() => (ref3 && step === 'fix' ? toolPoseAt(chain, [ref3.x, ref3.y, PAL.top + 2]) : null), [chain, ref3, step]);
  const rows = useMemo(() => measureRows(prob, runs.before), [prob, runs.before]);

  const overlay = useMemo<PalletOverlay>(() => {
    const o: PalletOverlay = {};
    if (prob === 3) {
      const ran = step === 'compare' || step === 'done' ? runs.latest : runs.before;
      o.progPallet = step === 'fix' ? progFromRef(s.values as RefValues) : (ran?.values.prog ?? PAL_HOME);
      if (step === 'fix') o.refCursor = [(s.values as RefValues).x, (s.values as RefValues).y, PAL.top + 1];
    }
    if (prob === 1 && step === 'fix') {
      const v = s.values as StackValues;
      o.ghosts = [1, 2].map((layer) => {
        const c = slotCentre(layer * 4);
        const ls = layerState(v, layer);
        const text = ls.state === 'press' ? `${layer + 1}층 · ${fmt(-ls.d)} mm 눌러요` : ls.state === 'drop' ? `${layer + 1}층 · ${fmt(ls.d)} mm 위에서 떨어뜨려요` : `${layer + 1}층 · 딱 맞아요 (+${fmt(Math.max(0, ls.d))} mm)`;
        return { key: `g${layer}`, at: [c[0], c[1], placeZ(v, layer) - PBOX.h / 2] as Mm, state: ls.state, text };
      });
      return o;
    }
    if (step === 'cause') {
      // What has been measured so far, drawn where it is.
      o.dims = rows.slice(0, s.meas).flatMap((r) => (r.dim ? [r.dim] : []));
      if (prob === 1 && s.meas >= rows.length && shown?.failure?.kind === 'press' && shown.failure.at) o.press = { at: shown.failure.at, mm: shown.failure.mm ?? 0 };
    }
    if (!shown) return o;
    // ②: the cup's acceleration while it carries (원인 찾기: at the last moment it still held the box).
    let ai = frame?.carrying ? fi : -1;
    if (prob === 2 && step === 'cause' && shown.failure) for (let k = fi; k >= 0 && ai < 0; k -= 1) if (shown.frames[k].carrying) ai = k;
    if (prob === 2 && ai >= 0) {
      const a = accAt(shown, ai);
      // 원인 찾기: the value the slip was logged with (the step it came off).
      const mag = step === 'cause' && shown.failure?.kind === 'slip' ? (shown.failure.mm ?? 0) : shown.frames[ai].acc;
      if (a) o.acc = { at: shown.tip[ai], dir: a.dir, mag, over: mag > accLimit(HEAVY_G) };
    }
    if (step === 'cause' && prob === 1) return o;
    return { ...o, path: shown.tip.slice(Math.max(0, fi - 220), fi + 1).filter((_, j) => j % 2 === 0) };
  }, [prob, step, s.values, s.meas, rows, runs.before, runs.latest, shown, frame, fi]);

  const scene = useMemo<LearnScene>(() => ({ angles: refPose?.q ?? HOME_Q, tool: 'pump', pumpOn: false }), [refPose]);

  // The line's board: what has happened up to the playback time.
  const board = useMemo(() => {
    if (!shown) return null;
    const upTo = shown.events.filter((e) => e.t <= playT + 1e-6);
    const placed = upTo.filter((e) => e.kind === 'place' || e.kind === 'drop').length;
    const crushed = Math.max(0, ...(frame?.crush ?? [0]));
    return { placed, crushed, t: playT, acc: frame?.carrying ? frame.acc : 0, stopped: !!frame?.alarm };
  }, [shown, playT, frame]);

  // Guide pictures and checks: jump to a problem and step (with the worked fix run, everything before it answered).
  useEffect(() => {
    window.__logiOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      const T = LOGI_TEXT[p];
      void (async () => {
        const before = st[p].runs.before ?? (await runStack(chain, setupFor(p, DEFAULTS[p])));
        let latest = st[p].runs.latest;
        let values = st[p].values;
        let log = st[p].log;
        if (opts.solve) {
          values = FIXES[p];
          latest = await runStack(chain, setupFor(p, values));
          const sc = scoreStack(latest, limitFor(p));
          log = [...log, { time: '—', values: valuesText(p, values), pass: sc.pass, note: sc.pass ? `합격 · ${fmt(sc.timeS, 1)} s` : whyNotYet(p, sc) }];
          if (sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        }
        setProb(p);
        patch(p, (x) => ({ ...answeredUpTo(T, x, stepIndex(step), measureRows(p, before).length, !!opts.solve), values, log, runs: { before, latest }, step }));
        if (opts.at !== undefined) {
          const at = opts.at;
          window.setTimeout(() => {
            if (player.run) play(player.run, at);
          }, 120);
        }
      })();
    };
    return () => {
      delete window.__logiOpen;
    };
  }, [chain, st, prob, patch, play, player]);

  const lim = limitFor(prob);
  const sb = useMemo(() => (runs.before ? scoreStack(runs.before, lim) : null), [runs.before, lim]);
  const sl = useMemo(() => (runs.latest ? scoreStack(runs.latest, lim) : null), [runs.latest, lim]);
  const at = stepIndex(step);

  return (
    <div className={`${css.lab} ${lg.site}`} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 로봇 시티
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          물류 센터
          <small>팔레타이징</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${LOGI_TEXT[p].title} · ${LOGI_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{LOGI_TEXT[p].title}</span>
              {solved[p] && <i aria-label="해결">✓</i>}
              <ProbLock lab="logistics" p={p} />
            </button>
          ))}
        </nav>
        <nav className={css.steps} aria-label="단계">
          {LOGI_STEPS.map((x, i) => (
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

      <section className={css.stage} aria-label="3D 팔레타이징 셀">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={LOGI_VIEW} focus={focus} live={player.arm} look={LOOKS.logistics}>
          <LogisticsAround />
          <PalletCell player={player} overlay={overlay} prob={prob} pallet={prob === 3 ? PAL_MOVED : PAL_HOME} />
        </LearnStage>
        {board?.stopped && <div className={lg.alarm}>⚠ {shown?.failure?.text ?? '라인 정지'}</div>}
        {shown && !board?.stopped && shown.failure === null && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ 12개를 모두 쌓았어요 · {fmt(shown.durationS, 1)} s</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        {board && (
          <div className={lg.board} aria-label="라인 현황">
            <div data-c={board.placed === N_BOXES ? 'ok' : undefined}>
              <small>쌓은 상자</small>
              <b>
                {board.placed} / {N_BOXES}
              </b>
            </div>
            {prob === 1 && (
              <div data-c={board.crushed > PRESS_OK_MM ? 'bad' : undefined}>
                <small>찌그러짐</small>
                <b>{board.crushed > 0.5 ? `${fmt(board.crushed)} mm` : '없음'}</b>
              </div>
            )}
            {prob === 2 && (
              <div data-c={board.acc > accLimit(HEAVY_G) ? 'bad' : undefined}>
                <small>손끝 가속도 (들고)</small>
                <b>{board.acc > 0 ? `${fmt(board.acc, 1)} m/s²` : '—'}</b>
              </div>
            )}
            <div data-c={board.stopped ? 'bad' : 'ok'}>
              <small>라인</small>
              <b>{board.stopped ? '정지' : '가동'}</b>
            </div>
            <div data-c={prob === 2 && board.t > TIME_LIMIT_S ? 'bad' : undefined}>
              <small>시간{prob === 2 ? ` (≤ ${TIME_LIMIT_S} s)` : ''}</small>
              <b>{fmt(board.t, 1)} s</b>
            </div>
          </div>
        )}
        {shown && (
          <div className={lg.player}>
            <button
              type="button"
              onClick={() => {
                if (playing) player.pause();
                else if (player.t >= shown.durationS - 1e-6) play(shown, 0, step === 'run' && failT !== null ? Math.max(0, failT - SLOW_LEAD_S) : null);
                else player.resume();
                setPlaying(player.playing);
              }}
            >
              {playing ? '❚❚ 멈춤' : '▶ 재생'}
            </button>
            <button
              type="button"
              aria-pressed={fast}
              onClick={() => {
                setFast((f) => !f);
                if (!slow) player.setRate(fast ? 1 : FAST);
              }}
            >
              {FAST}× 빠르게
            </button>
            <span>
              {fmt(playT, 1)} / {fmt(shown.durationS, 1)} s
            </span>
          </div>
        )}
        <RealUse site="logistics" />
        <p className={css.hint}>끌어서 돌려 보기 · 휠로 확대</p>
      </section>

      <aside className={css.panel} aria-label="실습 안내">
        <Panel
          prob={prob}
          st={s}
          busy={busy}
          solved={solved[prob]}
          level={level}
          rows={rows}
          sb={sb}
          sl={sl}
          patch={(ch) => patch(prob, ch)}
          onSeek={(t) => {
            player.seek(t);
            player.pause();
            setPlaying(false);
          }}
          onRunBefore={() => go('before', DEFAULTS[prob], 'run')}
          onRunFix={() => go('latest', s.values, 'compare')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as LogiProblem) : onBack())}
          onBack={onBack}
        />
      </aside>
      {record && <RecordSheet site="물류 센터 (팔레타이징)" tone={lg.site} texts={LOGI_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

/* --- the panel ------------------------------------------------------------------- */

interface PanelProps {
  prob: LogiProblem;
  st: ProbState;
  busy: boolean;
  solved: boolean;
  level: StudyLevel;
  rows: LogiRow[];
  sb: StackScore | null;
  sl: StackScore | null;
  patch(ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)): void;
  onSeek(t: number): void;
  onRunBefore(): void;
  onRunFix(): void;
  onStep(s: LogiStepId): void;
  onRecord(): void;
  onNext(): void;
  onBack(): void;
}

/** The work program as the line has it now (작업 지시). */
function programLine(p: LogiProblem): string {
  if (p === 1) {
    const v = DEFAULTS[1] as StackValues;
    return `1층 놓는 높이 ${placeZ(v, 0)} mm, 층 간격 ${v.pitch} mm, 여유 ${v.gap} mm`;
  }
  if (p === 2) {
    const v = DEFAULTS[2] as SpeedValues;
    return `들고 이동 ${v.carry}, 빈손 이동 ${v.empty}, 위아래 이동 ${v.vert} (속도 1 ~ 100)`;
  }
  const v = DEFAULTS[3] as RefValues;
  return `팔레트 기준점 (${fmt(v.x)}, ${fmt(v.y)}) mm (처음 설치할 때 잡은 자리)`;
}

/** Which prediction the run bears out: all done, stopped (or dropped), or done but not to the standard. */
const predictionOf = (sl: StackScore | null) => (!sl ? null : sl.pass ? 0 : sl.stopped || sl.slipped ? 2 : 1);

function Panel(p: PanelProps) {
  const { prob, st, sb, sl, rows } = p;
  const T = LOGI_TEXT[prob];
  const { runs } = st;
  const failure = runs.before?.failure;
  return (
    <SitePanel
      T={T}
      lab="logistics"
      st={st}
      boss="박 반장"
      level={p.level}
      solved={p.solved}
      busy={p.busy}
      order={
        <div className={lg.order}>
          <header>
            작업 기준 <span>{T.order}</span>
          </header>
          <dl>
            <dt>상자</dt>
            <dd>
              {PBOX.sx} × {PBOX.sy} × {PBOX.h} mm, {prob === 2 ? HEAVY_G : PBOX.massG} g
            </dd>
            <dt>쌓기</dt>
            <dd>한 층 4개 × 3층 = {N_BOXES}개</dd>
            {prob === 2 && (
              <>
                <dt>시간</dt>
                <dd>{TIME_LIMIT_S} s 안에</dd>
              </>
            )}
            <dt>상자 상태</dt>
            <dd>
              찌그러짐 {PRESS_OK_MM} mm · 떨어뜨림 {DROP_OK_MM} mm 이하
            </dd>
            <dt>위치</dt>
            <dd>
              팔레트 제자리에서 {OK_TOL.xyMm} mm, 기울기 {OK_TOL.tiltDeg}° 안
            </dd>
          </dl>
        </div>
      }
      program={programLine(prob)}
      runTitle={failure ? `${(failure.box ?? 0) + 1}번 상자에서 멈췄어요` : '끝까지 쌓았어요'}
      runResult={
        <>
          <p className={lg.secText}>기록에서 시각을 누르면 그 순간으로 가요. 멈추기 직전에 무엇을 했나요?</p>
          <Events run={runs.before} onSeek={p.onSeek} />
        </>
      }
      playing={false}
      rows={rows}
      measureExtra={prob === 2 && st.meas >= 4 && runs.before ? <AccGraph run={runs.before} /> : null}
      fixTitle={prob === 1 ? '놓는 높이를 고쳐요' : prob === 2 ? '속도를 나눠 정해요' : '기준점을 다시 잡아요'}
      hmi={
        <>
          {prob === 1 && <Hmi1 v={st.values as StackValues} on={(values) => p.patch({ values })} />}
          {prob === 2 && <Hmi2 v={st.values as SpeedValues} on={(values) => p.patch({ values })} />}
          {prob === 3 && <Hmi3 v={st.values as RefValues} on={(values) => p.patch({ values })} />}
        </>
      }
      compare={
        <>
          {sb && sl && <Compare prob={prob} sb={sb} sl={sl} before={runs.before!} latest={runs.latest!} />}
          {prob === 2 && runs.latest && <AccGraph run={runs.latest} />}
          {prob !== 2 && <Events run={runs.latest} onSeek={p.onSeek} />}
        </>
      }
      hit={predictionOf(sl)}
      pass={!!sl?.pass}
      notYet={sl && !sl.pass ? whyNotYet(prob, sl) : null}
      fig={<PrincipleFig prob={prob} />}
      nextLabel={prob < 3 ? `문제 ${prob + 1} · ${LOGI_TEXT[(prob + 1) as LogiProblem].title} →` : '로봇 시티로 →'}
      patch={p.patch}
      onRunBefore={p.onRunBefore}
      onRunFix={p.onRunFix}
      onStep={p.onStep}
      onRecord={p.onRecord}
      onNext={p.onNext}
    />
  );
}

function whyNotYet(prob: LogiProblem, s: StackScore): string {
  if (s.stopped) return s.stopped;
  if (prob === 2 && s.timeS > TIME_LIMIT_S) return `떨어뜨리지는 않았지만 ${fmt(s.timeS, 1)} s 걸렸어요. 목표는 ${TIME_LIMIT_S} s예요. 상자가 없을 때나 짧게 움직일 때를 빠르게 해 보세요.`;
  if (s.maxDrop > DROP_OK_MM) return `상자를 ${fmt(s.maxDrop)} mm 위에서 떨어뜨렸어요. 여유를 줄여 보세요.`;
  return '팔레트 제자리를 벗어난 상자가 있어요.';
}

/* --- 값 고치기: the operator panels -------------------------------------------------- */


function Hmi1({ v, on }: { v: StackValues; on(v: StackValues): void }) {
  return (
    <div className={lg.hmi}>
      <header>
        <span>PALLETIZE · 놓는 높이</span>
        <i>● 준비</i>
      </header>
      <Knob id="logi-pitch" label="층 간격" unit="mm" v={v.pitch} min={STACK_RANGE.pitch[0]} max={STACK_RANGE.pitch[1]} note="한 층 올라갈 때 놓는 높이를 얼마나 올릴지" on={(pitch) => on({ ...v, pitch })} />
      <Knob id="logi-gap" label="여유" unit="mm" v={v.gap} min={STACK_RANGE.gap[0]} max={STACK_RANGE.gap[1]} note="놓을 때 상자를 아래 면보다 얼마나 띄울지" on={(gap) => on({ ...v, gap })} />
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>층</th>
            <th>놓는 높이</th>
            <th>놓일 높이</th>
            <th>차이</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((l) => {
            const ls = layerState(v, l);
            return (
              <tr key={l}>
                <td>{l + 1}층</td>
                <td>{placeZ(v, l)} mm</td>
                <td>{restZ(l)} mm</td>
                <td data-c={ls.state}>{ls.state === 'press' ? `${fmt(-ls.d)} mm 누름` : ls.state === 'drop' ? `${fmt(ls.d)} mm 떨어뜨림` : `+${fmt(Math.max(0, ls.d))} mm`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Hmi2({ v, on }: { v: SpeedValues; on(v: SpeedValues): void }) {
  const lim = accLimit(HEAVY_G);
  const guess = ACC_AT_FULL * (v.carry / 100) ** 2;
  return (
    <div className={lg.hmi}>
      <header>
        <span>PALLETIZE · 속도</span>
        <i>● 준비</i>
      </header>
      <Knob id="logi-carry" label="들고 이동" unit="" v={v.carry} min={10} max={100} note="상자를 들고 팔레트까지 옮기는 속도" on={(carry) => on({ ...v, carry })} />
      <Knob id="logi-empty" label="빈손 이동" unit="" v={v.empty} min={10} max={100} note="상자를 놓고 컨베이어로 돌아가는 속도" on={(empty) => on({ ...v, empty })} />
      <Knob id="logi-vert" label="위아래 이동" unit="" v={v.vert} min={10} max={100} note="상자 위로 내려가고, 들어 올리고, 놓는 짧은 이동" on={(vert) => on({ ...v, vert })} />
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>들고 이동 최대 가속도 (어림)</td>
            <td data-c={guess > lim ? 'press' : 'ok'}>{fmt(guess, 1)} m/s²</td>
          </tr>
          <tr>
            <td>흡착 컵이 버티는 한계</td>
            <td>{fmt(lim, 1)} m/s²</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Hmi3({ v, on }: { v: RefValues; on(v: RefValues): void }) {
  const nudge = (dx: number, dy: number) => on({ x: v.x + dx, y: v.y + dy });
  const prog = progFromRef(v);
  return (
    <div className={lg.hmi}>
      <header>
        <span>TEACH · 팔레트 기준점</span>
        <i>● 손끝 높이 {PAL.top + 2} mm</i>
      </header>
      <Knob id="logi-rx" label="손끝 x" unit="mm" v={v.x} min={100} max={200} note="앞(+) · 뒤(−)" on={(x) => on({ ...v, x })} />
      <Knob id="logi-ry" label="손끝 y" unit="mm" v={v.y} min={-240} max={-130} note="왼쪽(+) · 오른쪽(−)" on={(y) => on({ ...v, y })} />
      <div className={lg.jog}>
        {(
          [
            ['x −1', -1, 0],
            ['x +1', 1, 0],
            ['y −1', 0, -1],
            ['y +1', 0, 1],
          ] as const
        ).map(([t, dx, dy]) => (
          <button key={t} type="button" onClick={() => nudge(dx, dy)}>
            {t}
          </button>
        ))}
      </div>
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>저장될 기준점</td>
            <td>
              ({fmt(v.x)}, {fmt(v.y)}) mm
            </td>
          </tr>
          <tr>
            <td>프로그램 팔레트 중심</td>
            <td>
              ({fmt(prog.x)}, {fmt(prog.y)}) mm
            </td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>3D 화면을 확대해서 노란 십자를 팔레트 모서리의 빨간 표시에 맞추세요.</small>
    </div>
  );
}

/* --- 비교 ------------------------------------------------------------------------------ */

function Compare({ prob, sb, sl, before, latest }: { prob: LogiProblem; sb: StackScore; sl: StackScore; before: PalletRun; latest: PalletRun }) {
  const row = (label: string, want: string, b: string, a: string, good: boolean, bad?: boolean) => (
    <tr key={label}>
      <td>{label}</td>
      <td>{want}</td>
      <td data-c={bad ? 'bad' : undefined}>{b}</td>
      <td data-c={good ? 'ok' : 'bad'}>{a}</td>
    </tr>
  );
  const worst = (r: PalletRun) => Math.max(0, ...r.boxes.filter((b) => b.placed).map((b) => b.xyErr));
  const lim = accLimit(HEAVY_G);
  return (
    <table className={lg.cmp}>
      <thead>
        <tr>
          <th />
          <th>기준</th>
          <th>전</th>
          <th>후</th>
        </tr>
      </thead>
      <tbody>
        {row('쌓은 상자', `${N_BOXES}`, `${sb.placed}`, `${sl.placed}`, sl.placed === N_BOXES, sb.placed < N_BOXES)}
        {row('제자리에 쌓임', `${N_BOXES}`, `${sb.ok}`, `${sl.ok}`, sl.ok === N_BOXES, sb.ok < N_BOXES)}
        {prob === 1 && row('찌그러짐', `≤ ${PRESS_OK_MM} mm`, `${fmt(sb.pressed)} mm`, `${fmt(sl.pressed)} mm`, sl.pressed <= PRESS_OK_MM, sb.pressed > PRESS_OK_MM)}
        {prob === 1 && row('떨어뜨림', `≤ ${DROP_OK_MM} mm`, `${fmt(sb.maxDrop)} mm`, `${fmt(sl.maxDrop)} mm`, sl.maxDrop <= DROP_OK_MM, sb.maxDrop > DROP_OK_MM)}
        {prob === 2 && row('컵에서 떨어짐', '0', sb.slipped ? '1' : '0', sl.slipped ? '1' : '0', !sl.slipped, sb.slipped)}
        {prob === 2 && row('들고 최대 가속도', `≤ ${fmt(lim, 1)}`, `${fmt(before.maxCarryAcc, 1)}`, `${fmt(latest.maxCarryAcc, 1)}`, latest.maxCarryAcc <= lim, before.maxCarryAcc > lim)}
        {prob === 3 && row('위치 오차 (최대)', `≤ ${OK_TOL.xyMm} mm`, `${fmt(worst(before), 0)} mm`, `${fmt(worst(latest), 1)} mm`, worst(latest) <= OK_TOL.xyMm, worst(before) > OK_TOL.xyMm)}
        {row('라인 정지', '0', sb.stopped ? '1' : '0', sl.stopped ? '1' : '0', !sl.stopped, !!sb.stopped)}
        {row('걸린 시간', prob === 2 ? `≤ ${TIME_LIMIT_S} s` : '—', `${fmt(sb.timeS)} s`, `${fmt(sl.timeS)} s`, prob !== 2 || sl.timeS <= TIME_LIMIT_S, prob === 2 && sb.timeS > TIME_LIMIT_S)}
      </tbody>
    </table>
  );
}

/** ②: the cup's acceleration over the run — thick while it carries a box — and the cup's limit. */
function AccGraph({ run }: { run: PalletRun }) {
  const W = 340;
  const H = 96;
  const pad = { l: 30, r: 6, t: 8, b: 16 };
  const lim = accLimit(HEAVY_G);
  const top = Math.max(lim * 1.6, ...run.frames.map((f) => f.acc));
  const x = (t: number) => pad.l + (t / Math.max(1, run.durationS)) * (W - pad.l - pad.r);
  const y = (a: number) => pad.t + (1 - Math.min(a, top) / top) * (H - pad.t - pad.b);
  const seg = (carry: boolean) =>
    run.frames
      .map((f, i) => (f.carrying === carry ? `${i && run.frames[i - 1].carrying === carry ? 'L' : 'M'}${x(f.t).toFixed(1)},${y(f.acc).toFixed(1)}` : ''))
      .join('');
  return (
    <svg className={lg.graph} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`손끝 가속도 그래프, 한계 ${fmt(lim, 1)} m/s²`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className={lg.axis} />
      <line x1={pad.l} x2={W - pad.r} y1={y(lim)} y2={y(lim)} className={lg.limit} />
      <text x={W - pad.r} y={y(lim) - 3} textAnchor="end" className={lg.limitTxt}>
        흡착 한계 {fmt(lim, 1)}
      </text>
      <path d={seg(false)} className={lg.empty} />
      <path d={seg(true)} className={lg.carry} />
      <text x={2} y={y(top) + 8} className={lg.tick}>
        {fmt(top, 0)}
      </text>
      <text x={2} y={y(0)} className={lg.tick}>
        0
      </text>
      <text x={W - pad.r} y={H - 3} textAnchor="end" className={lg.tick}>
        {fmt(run.durationS, 0)} s
      </text>
      <text x={pad.l} y={H - 3} className={lg.tick}>
        굵은 선: 상자를 든 동안 · 얇은 선: 빈손 (m/s²)
      </text>
    </svg>
  );
}

/** The run's log: the moments that matter, each a button that jumps the playback there. */
function Events({ run, onSeek }: { run: PalletRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  const list = run.events.filter((e) => e.kind !== 'arrive' && e.kind !== 'grip');
  const shown = list.length > 9 ? [...list.slice(0, 3), ...list.slice(-6)] : list;
  return (
    <ol className={lg.events} aria-label="가동 기록">
      {shown.map((e, i) => (
        <li key={i} data-k={e.kind === 'press' || e.kind === 'moved' || e.kind === 'slip' || e.kind === 'hit' || e.kind === 'unreachable' ? 'bad' : e.kind === 'drop' ? 'warn' : undefined}>
          <button type="button" onClick={() => onSeek(Math.max(0, e.t - 0.6))}>
            <time>{e.t.toFixed(1)} s</time>
            <span>
              <Lines text={e.text} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* --- 해결 · 원리 ------------------------------------------------------------------------ */

/** The principle card's figure, per problem. */
function PrincipleFig({ prob }: { prob: LogiProblem }) {
  if (prob === 1) {
    // Three boxes stacked on a pallet; the place height of each layer measured from the floor.
    const box = (k: number) => <rect key={k} x={70} y={92 - (k + 1) * 26} width={40} height={26} rx={2} className={lg.figBox} />;
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="층마다 놓는 높이: 1층 높이에 상자 높이를 층 수만큼 더한다">
        <rect x={60} y={92} width={60} height={10} className={lg.figPal} />
        {[0, 1, 2].map(box)}
        {[0, 1, 2].map((k) => (
          <g key={k}>
            <line x1={112} x2={196} y1={66 - 26 * k} y2={66 - 26 * k} className={lg.figGuide} />
            <line x1={140 + 14 * k} x2={140 + 14 * k} y1={104} y2={68 - 26 * k} className={lg.figArrow} markerEnd="url(#siteArrow)" />
            <text x={200} y={70 - 26 * k} className={lg.figTxt}>
              {k + 1}층 = z₁ + {k} × h
            </text>
          </g>
        ))}
        <line x1={50} x2={50} y1={64} y2={42} className={lg.figArrow} markerStart="url(#siteArrow)" markerEnd="url(#siteArrow)" />
        <text x={36} y={57} className={lg.figTxt}>
          h
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    // The cup holds the box against its weight and the force to accelerate it.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="흡착력은 무게와 가속에 필요한 힘을 함께 버틴다">
        <rect x={112} y={14} width={16} height={22} rx={3} className={lg.figCup} />
        <rect x={96} y={36} width={48} height={40} rx={3} className={lg.figBox} />
        <line x1={120} x2={120} y1={34} y2={6} className={lg.figUp} markerEnd="url(#siteArrow)" />
        <text x={126} y={12} className={lg.figTxt}>
          흡착력 F
        </text>
        <line x1={112} x2={112} y1={76} y2={104} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={40} y={102} className={lg.figTxt}>
          무게 m·g
        </text>
        <line x1={144} x2={196} y1={56} y2={56} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={150} y={50} className={lg.figTxt}>
          가속 a → 필요한 힘 m·a
        </text>
        <text x={206} y={84} className={lg.figStrong}>
          F ≥ m(g + a)
        </text>
        <ArrowDef />
      </svg>
    );
  }
  // The pallet moved: the reference point moves with it, and the twelve places with the point.
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="기준점이 옮겨지면 기준점에서 잰 자리도 함께 옮겨진다">
      <rect x={30} y={34} width={90} height={64} className={lg.figOld} />
      <rect x={140} y={14} width={90} height={64} className={lg.figPalTop} />
      <circle cx={30} cy={98} r={5} className={lg.figMarkOld} />
      <circle cx={140} cy={78} r={5} className={lg.figMark} />
      <line x1={36} x2={134} y1={96} y2={80} className={lg.figArrow} markerEnd="url(#siteArrow)" />
      {[
        [158, 32],
        [194, 32],
        [158, 56],
        [194, 56],
      ].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x} y={y} width={22} height={18} rx={2} className={lg.figBox} />
      ))}
      <text x={34} y={28} className={lg.figTxt}>
        예전 자리
      </text>
      <text x={238} y={30} className={lg.figTxt}>
        새 자리
      </text>
      <text x={140} y={100} className={lg.figStrong}>
        자리 = 기준점 + 상대 좌표
      </text>
      <ArrowDef />
    </svg>
  );
}
