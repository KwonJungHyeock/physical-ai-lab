'use client';

/**
 * 산업단지 · 물류 센터 — 팔레타이징 (myCobot 280 RDK X5 + 흡착 펌프, real size). One screen like
 * the conveyor lab: a slim bar (← 산업단지, the site, problems ①②③, the six steps), the cell in the
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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import { LOGI_STEPS, LOGI_TEXT, type CheckQ, type LogiStepId } from '@/engine/education/lab/logistics';
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

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import PalletCell, { PalletPlayback, type PalletDim, type PalletOverlay } from './PalletCell';
import css from './lab.module.css';
import lg from './logistics.module.css';

/** The cell from the front right, a little above (three.js metres, y up): camera, then target. */
const LOGI_VIEW: ViewPose = [0.66, 0.46, 0.7, 0.1, 0.06, 0.1];
/** Playback speed of a run (they take 10 – 100 s of line time), and near the moment it goes wrong. */
const FAST = 3;
const SLOW = 0.35;
/** The slow motion starts this long before the failure. */
const SLOW_LEAD_S = 1.6;
const PROBS: readonly LogiProblem[] = [1, 2, 3];
/** ②: the largest cup acceleration with a box at full travel speed (measured by the engine), for the operator panel's rough guide. */
const ACC_AT_FULL = 7.3;
const NUM = ['①', '②', '③', '④'];

interface Runs {
  before: PalletRun | null;
  latest: PalletRun | null;
}

/** One 다시 가동, for the student's record. */
interface Attempt {
  time: string;
  values: LogiValues;
  pass: boolean;
  note: string;
}

interface ProbState {
  step: LogiStepId;
  reached: number;
  values: LogiValues;
  runs: Runs;
  /** 원인 찾기: how many of the measurements have been taken, the cause picked, the wrong ones tried before it, the explanation's gaps. */
  meas: number;
  pick: number | null;
  tried: number[];
  blanks: (number | null)[];
  /** 값 고치기: the numbers typed, and whether they have been checked. */
  calc: string[];
  calcChecked: boolean;
  pred: number | null;
  hints: number;
  tries: number;
  /** Why the prediction missed (the reason picked). */
  missed: number | null;
  /** 확인 문제: what was answered, and which have been checked. */
  answers: string[];
  shown: boolean[];
  log: Attempt[];
}

const fresh = (p: LogiProblem): ProbState => ({
  step: 'brief',
  reached: 0,
  values: DEFAULTS[p],
  runs: { before: null, latest: null },
  meas: 0,
  pick: null,
  tried: [],
  blanks: LOGI_TEXT[p].blanks.answer.map(() => null),
  calc: LOGI_TEXT[p].calc.fields.map(() => ''),
  calcChecked: false,
  pred: null,
  hints: 0,
  tries: 0,
  missed: null,
  answers: LOGI_TEXT[p].checks.map(() => ''),
  shown: LOGI_TEXT[p].checks.map(() => false),
  log: [],
});

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
const fmt = (v: number, d = 0) => v.toFixed(d).replace('-', '−');
/** A typed number (accepts the minus sign as printed, and a comma for the point). */
const num = (s: string): number | null => {
  const x = parseFloat(s.trim().replace(/[−–]/g, '-').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
const near = (s: string, answer: number, tol: number) => {
  const x = num(s);
  return x !== null && Math.abs(x - answer) <= tol;
};
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

interface MeasureRow {
  label: string;
  value: string;
  bad?: boolean;
  dim?: PalletDim;
}

const DIM_OK = '#3454d1';
const DIM_BAD = '#e5484d';

function measureRows(prob: LogiProblem, run: PalletRun | null): MeasureRow[] {
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
          log: which === 'latest' ? [...x.log, { time, values: v, pass: sc.pass, note: sc.pass ? `합격 · ${fmt(sc.timeS, 1)} s` : whyNotYet(p, sc) }] : x.log,
          step: then,
          reached: Math.max(x.reached, stepIndex(then)),
        }));
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
          log = [...log, { time: '—', values, pass: sc.pass, note: sc.pass ? `합격 · ${fmt(sc.timeS, 1)} s` : whyNotYet(p, sc) }];
          if (sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        }
        const past = stepIndex(step);
        setProb(p);
        patch(p, (x) => ({
          values,
          log,
          runs: { before, latest },
          step,
          reached: Math.max(x.reached, past),
          meas: past >= stepIndex('cause') ? measureRows(p, before).length : x.meas,
          pick: past > stepIndex('cause') ? T.choices.findIndex((c) => c.ok) : x.pick,
          blanks: past > stepIndex('cause') ? [...T.blanks.answer] : x.blanks,
          calc: past >= stepIndex('fix') && opts.solve ? T.calc.fields.map((f) => String(f.answer)) : x.calc,
          calcChecked: (past >= stepIndex('fix') && !!opts.solve) || x.calcChecked,
          pred: x.pred ?? 0,
          tries: opts.solve ? x.tries + 1 : x.tries,
        }));
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
          ← 산업단지
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
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={LOGI_VIEW} focus={focus} live={player.arm}>
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
      {record && <RecordSheet st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
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
  rows: MeasureRow[];
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

function Head({ eyebrow, title, solved }: { eyebrow: string; title: string; solved?: boolean }) {
  return (
    <div className={css.head}>
      <div>
        <small style={{ color: 'var(--site)' } as CSSProperties}>{eyebrow}</small>
        <b>{title}</b>
      </div>
      {solved && <span className={css.solved}>✓ 해결</span>}
    </div>
  );
}

const SiteBtn = ({ children, ...p }: { children: ReactNode; disabled?: boolean; title?: string; onClick(): void }) => (
  <button type="button" className={`${css.primary} ${lg.siteBtn}`} {...p}>
    {children}
  </button>
);

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
  return `팔레트 기준점 (${fmt(v.x)}, ${fmt(v.y)}) mm — 처음 설치할 때 잡은 자리`;
}

const blanksOk = (p: LogiProblem, b: readonly (number | null)[]) => LOGI_TEXT[p].blanks.answer.every((a, i) => b[i] === a);
const calcOk = (p: LogiProblem, c: readonly string[]) => LOGI_TEXT[p].calc.fields.every((f, i) => near(c[i] ?? '', f.answer, f.tol));
/** Did the prediction come true (null: nothing to compare yet). */
function predictionHit(st: ProbState, sl: StackScore | null): boolean | null {
  if (!sl || st.pred === null) return null;
  return sl.pass ? st.pred === 0 : sl.stopped || sl.slipped ? st.pred === 2 : st.pred === 1;
}

function Panel(p: PanelProps) {
  const { prob, st, busy, sb, sl, rows } = p;
  const T = LOGI_TEXT[prob];
  const { runs } = st;
  const failure = runs.before?.failure;
  const body = `${css.body} ${lg.scroll}`;
  switch (st.step) {
    case 'brief':
      return (
        <>
          <Head eyebrow={`${T.day} · 작업 지시서 ${T.order}`} title={T.orderTitle} solved={p.solved} />
          <div className={body}>
            <p className={css.story}>{T.brief}</p>
            <p className={lg.boss}>
              <b>박 반장</b> {T.boss}
            </p>
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
            <p className={lg.note}>
              <b>작업 프로그램</b> · {programLine(prob)}
            </p>
            <details className={lg.goals}>
              <summary>이번 문제에서 배울 것</summary>
              <ol>
                {T.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ol>
            </details>
            <p className={lg.note}>지금 값 그대로 한 번 가동해 보세요. 무엇이 문제인지는 그다음에 찾아요.</p>
          </div>
          <div className={css.foot}>
            <span />
            <SiteBtn disabled={busy} onClick={p.onRunBefore}>
              {busy ? '계산 중…' : '▶ 라인 가동'}
            </SiteBtn>
          </div>
        </>
      );
    case 'run':
      return (
        <>
          <Head eyebrow="가동 결과" title={failure ? `${(failure.box ?? 0) + 1}번 상자에서 멈췄어요` : '끝까지 쌓았어요'} solved={p.solved} />
          <div className={body}>
            <p className={css.story}>{T.happened} 경광등이 빨갛게 켜졌어요.</p>
            <ul className={lg.ask}>
              {T.ask.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <p className={`${lg.note} ${lg.siteNote}`}>
              <b>찾아보기</b> · 아래 기록에서 시각을 누르면 그 순간으로 가요. 멈추기 직전에 무엇을 했나요?
            </p>
            <Events run={runs.before} onSeek={p.onSeek} />
          </div>
          <div className={css.foot}>
            <span />
            <SiteBtn onClick={() => p.onStep('cause')}>원인 찾으러 가기 →</SiteBtn>
          </div>
        </>
      );
    case 'cause': {
      const all = st.meas >= rows.length;
      const right = st.pick !== null && !!T.choices[st.pick]?.ok;
      const done = right && blanksOk(prob, st.blanks);
      return (
        <>
          <Head eyebrow="원인 찾기 · 측정" title={T.question} solved={p.solved} />
          <div className={body}>
            <p className={css.story}>{T.look}</p>
            <Measure rows={rows} meas={st.meas} onMeasure={() => p.patch((x) => ({ meas: Math.min(rows.length, x.meas + 1) }))} />
            {prob === 2 && st.meas >= 4 && runs.before && <AccGraph run={runs.before} />}
            {all && (
              <>
                <b className={lg.q}>{T.question}</b>
                <div className={lg.choices}>
                  {T.choices.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      data-r={st.pick === i ? (c.ok ? 'ok' : 'no') : st.tried.includes(i) ? 'tried' : undefined}
                      disabled={right}
                      onClick={() => p.patch((x) => ({ pick: i, tried: c.ok || x.tried.includes(i) ? x.tried : [...x.tried, i] }))}
                    >
                      {NUM[i]} {c.t}
                    </button>
                  ))}
                </div>
                {st.pick !== null && (
                  <p className={lg.note} data-r={right ? 'ok' : 'no'}>
                    <b>{right ? '맞아요.' : '다시 생각해 보세요.'}</b> {T.choices[st.pick].fb.replace(/^맞아요\.\s*/, '')}
                  </p>
                )}
                {right && <Blanks prob={prob} value={st.blanks} on={(blanks) => p.patch({ blanks })} />}
              </>
            )}
          </div>
          <div className={css.foot}>
            <span className={lg.footNote}>{!all ? `측정 ${st.meas} / ${rows.length}` : !right ? '원인을 골라 보세요' : !done ? '설명의 빈칸을 채워요' : ''}</span>
            <SiteBtn disabled={!done} onClick={() => p.onStep('fix')}>
              값 고치러 가기 →
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'fix': {
      const ok = st.calcChecked && calcOk(prob, st.calc);
      return (
        <>
          <Head eyebrow={ok ? '조작반 · 이 문제에 필요한 값만' : '값 고치기 · 먼저 계산'} title={prob === 1 ? '놓는 높이를 고쳐요' : prob === 2 ? '속도를 나눠 정해요' : '기준점을 다시 잡아요'} solved={p.solved} />
          <div className={body}>
            <Calc prob={prob} st={st} patch={p.patch} />
            {ok && (
              <>
                <p className={`${lg.note} ${lg.siteNote}`}>{T.calc.after}</p>
                {prob === 1 && <Hmi1 v={st.values as StackValues} on={(values) => p.patch({ values })} />}
                {prob === 2 && <Hmi2 v={st.values as SpeedValues} on={(values) => p.patch({ values })} />}
                {prob === 3 && <Hmi3 v={st.values as RefValues} on={(values) => p.patch({ values })} />}
                <div className={lg.predict}>
                  <b>가동 전에 예상해 보세요</b>
                  <div>
                    {T.predictions.map((t, i) => (
                      <button key={i} type="button" aria-pressed={st.pred === i} onClick={() => p.patch({ pred: i })}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={lg.hints}>
                  <button type="button" onClick={() => p.patch((x) => ({ hints: Math.min(3, x.hints + 1) }))} disabled={st.hints >= 3}>
                    힌트 보기 ({st.hints}/3)
                  </button>
                  {T.hints.slice(0, st.hints).map((h) => (
                    <p key={h.k} className={lg.hint}>
                      <em>{h.k}</em>
                      {h.t}
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className={css.foot}>
            <span className={lg.footNote}>{!ok ? '계산이 맞으면 조작반이 열려요' : st.pred === null ? '먼저 결과를 예상해 보세요' : ''}</span>
            <SiteBtn disabled={busy || !ok || st.pred === null} onClick={p.onRunFix}>
              {busy ? '계산 중…' : '▶ 다시 가동'}
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'compare': {
      const hit = predictionHit(st, sl);
      return (
        <>
          <Head eyebrow="다시 가동 · 전과 후" title={sl?.pass ? '기준을 모두 넘었어요' : '아직 기준에 못 미쳐요'} solved={p.solved} />
          <div className={body}>
            {sb && sl && <Compare prob={prob} sb={sb} sl={sl} before={runs.before!} latest={runs.latest!} />}
            {hit !== null && (
              <p className={lg.note} data-r={hit ? 'ok' : undefined}>
                <b>{hit ? '예상 적중!' : '예상과 달랐어요.'}</b> 내 예상: “{T.predictions[st.pred!]}”. {hit ? '결과를 미리 맞혔어요.' : '왜 달랐을까요? 가장 가까운 생각을 골라 보세요.'}
              </p>
            )}
            {hit === false && (
              <>
                <div className={lg.choices}>
                  {T.missed.map((c, i) => (
                    <button key={i} type="button" data-r={st.missed === i ? 'pick' : undefined} onClick={() => p.patch({ missed: i })}>
                      {c.t}
                    </button>
                  ))}
                </div>
                {st.missed !== null && <p className={lg.note}>{T.missed[st.missed].fb}</p>}
              </>
            )}
            {sl && !sl.pass && <p className={`${lg.note} ${lg.siteNote}`}>{whyNotYet(prob, sl)}</p>}
            {prob === 2 && runs.latest && <AccGraph run={runs.latest} />}
            {prob !== 2 && <Events run={runs.latest} onSeek={p.onSeek} />}
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={() => p.onStep('fix')}>
              ← 값 다시 고치기
            </button>
            <SiteBtn disabled={!sl?.pass} onClick={() => p.onStep('done')}>
              해결 확인 →
            </SiteBtn>
          </div>
        </>
      );
    }
    case 'done': {
      const stars = 3 - (st.hints >= 2 ? 1 : 0) - (st.tries > 2 ? 1 : 0);
      return (
        <>
          <Head eyebrow="해결 · 원리 카드" title={`${T.title} — 해결했어요`} solved={p.solved} />
          <div className={body}>
            <div className={lg.stars}>
              {'★'.repeat(stars)}
              {'☆'.repeat(3 - stars)}
              <small>
                다시 가동 {st.tries}번 · 힌트 {st.hints}번
              </small>
            </div>
            <div className={lg.principle}>
              <small>원리 카드 · {T.principle.unit}</small>
              <b>{T.principle.title}</b>
              <PrincipleFig prob={prob} />
              <p className={lg.formula}>{T.principle.formula}</p>
              {T.principle.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <div className={lg.pdfLinks}>
                {T.pdf.map((d) => (
                  <a key={d.href} href={d.href} target="_blank" rel="noreferrer">
                    PDF · {d.label}
                  </a>
                ))}
              </div>
            </div>
            <Checks prob={prob} st={st} patch={p.patch} />
            {p.level === 'uni' && (
              <div className={lg.uni}>
                <small>대학 · 더 깊이</small>
                <b>{T.uni.title}</b>
                {T.uni.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                {T.uni.code && <pre>{T.uni.code}</pre>}
              </div>
            )}
            <div className={lg.real}>
              <b>실제 로봇으로</b>
              <p>{T.real}</p>
              <p className={lg.safety}>
                <b>안전</b> {T.safety}
              </p>
            </div>
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={p.onRecord}>
              실습 기록 · 인쇄
            </button>
            <SiteBtn onClick={p.onNext}>{prob < 3 ? `문제 ${prob + 1} · ${LOGI_TEXT[(prob + 1) as LogiProblem].title} →` : '산업단지로 →'}</SiteBtn>
          </div>
        </>
      );
    }
  }
}

function whyNotYet(prob: LogiProblem, s: StackScore): string {
  if (s.stopped) return s.stopped;
  if (prob === 2 && s.timeS > TIME_LIMIT_S) return `떨어뜨리지는 않았지만 ${fmt(s.timeS, 1)} s 걸렸어요. 목표는 ${TIME_LIMIT_S} s예요. 상자가 없을 때나 짧게 움직일 때를 빠르게 해 보세요.`;
  if (s.maxDrop > DROP_OK_MM) return `상자를 ${fmt(s.maxDrop)} mm 위에서 떨어뜨렸어요. 여유를 줄여 보세요.`;
  return '팔레트 제자리를 벗어난 상자가 있어요.';
}

/* --- 원인 찾기 ------------------------------------------------------------------------- */

/** The measurements, taken one at a time (each 재기 shows the next value, and draws it in 3D). */
function Measure({ rows, meas, onMeasure }: { rows: MeasureRow[]; meas: number; onMeasure(): void }) {
  return (
    <div className={lg.measureBox}>
      <dl className={lg.measure}>
        {rows.map((r, i) => (
          <div key={r.label} data-on={i < meas || undefined}>
            <dt>{r.label}</dt>
            <dd data-c={i < meas && r.bad ? 'bad' : undefined}>{i < meas ? r.value : '?'}</dd>
          </div>
        ))}
      </dl>
      {meas < rows.length && (
        <button type="button" className={lg.measureBtn} onClick={onMeasure}>
          📏 재기 — {rows[meas].label}
        </button>
      )}
    </div>
  );
}

/** The explanation to complete: the text with a choice in each gap. */
function Blanks({ prob, value, on }: { prob: LogiProblem; value: readonly (number | null)[]; on(v: (number | null)[]): void }) {
  const B = LOGI_TEXT[prob].blanks;
  const parts = B.text.split(/([①②③④])/);
  return (
    <div className={lg.blanks}>
      <b>설명을 완성해 보세요</b>
      <p>
        {parts.map((t, k) => {
          const g = NUM.indexOf(t);
          if (g < 0) return <span key={k}>{t}</span>;
          const v = value[g];
          return (
            <select
              key={k}
              aria-label={`빈칸 ${t}`}
              value={v ?? ''}
              data-r={v === null ? undefined : v === B.answer[g] ? 'ok' : 'no'}
              onChange={(e) => on(value.map((x, i) => (i === g ? (e.target.value === '' ? null : +e.target.value) : x)))}
            >
              <option value="">{t} 고르기</option>
              {B.options[g].map((o, i) => (
                <option key={o} value={i}>
                  {o}
                </option>
              ))}
            </select>
          );
        })}
      </p>
    </div>
  );
}

/* --- 값 고치기 ------------------------------------------------------------------------- */

/** The numbers to work out before the operator panel opens. */
function Calc({ prob, st, patch }: { prob: LogiProblem; st: ProbState; patch: PanelProps['patch'] }) {
  const C = LOGI_TEXT[prob].calc;
  const ok = st.calcChecked && calcOk(prob, st.calc);
  return (
    <div className={lg.calc} data-ok={ok || undefined}>
      <b>계산해 보세요</b>
      <p>{C.prompt}</p>
      {C.fields.map((f, i) => {
        const r = st.calcChecked && st.calc[i] !== '' ? near(st.calc[i], f.answer, f.tol) : null;
        return (
          <label key={f.label} data-r={r === null ? undefined : r ? 'ok' : 'no'}>
            <span>{f.label} =</span>
            <input
              inputMode="decimal"
              value={st.calc[i]}
              disabled={ok}
              onChange={(e) => patch((x) => ({ calc: x.calc.map((c, j) => (j === i ? e.target.value : c)), calcChecked: false }))}
            />
            <em>{f.unit}</em>
            {r !== null && <i>{r ? '✓' : '✗'}</i>}
          </label>
        );
      })}
      {!ok && (
        <button type="button" className={css.small} disabled={st.calc.some((c) => c.trim() === '')} onClick={() => patch({ calcChecked: true })}>
          확인
        </button>
      )}
      {st.calcChecked && !ok && <small className={lg.calcNo}>✗ 표시된 칸을 다시 계산해 보세요.</small>}
    </div>
  );
}

function Knob({ id, label, unit, v, min, max, step = 1, note, on }: { id: string; label: string; unit: string; v: number; min: number; max: number; step?: number; note: string; on(v: number): void }) {
  return (
    <div className={lg.knob}>
      <label htmlFor={id}>
        {label}{' '}
        <output>
          {v} {unit}
        </output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(+e.target.value)} />
      <small>{note}</small>
    </div>
  );
}

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
            <span>{e.text}</span>
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
            <line x1={140 + 14 * k} x2={140 + 14 * k} y1={104} y2={68 - 26 * k} className={lg.figArrow} markerEnd="url(#lgArrow)" />
            <text x={200} y={70 - 26 * k} className={lg.figTxt}>
              {k + 1}층 = z₁ + {k} × h
            </text>
          </g>
        ))}
        <line x1={50} x2={50} y1={64} y2={42} className={lg.figArrow} markerStart="url(#lgArrow)" markerEnd="url(#lgArrow)" />
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
        <line x1={120} x2={120} y1={34} y2={6} className={lg.figUp} markerEnd="url(#lgArrow)" />
        <text x={126} y={12} className={lg.figTxt}>
          흡착력 F
        </text>
        <line x1={112} x2={112} y1={76} y2={104} className={lg.figArrow} markerEnd="url(#lgArrow)" />
        <text x={40} y={102} className={lg.figTxt}>
          무게 m·g
        </text>
        <line x1={144} x2={196} y1={56} y2={56} className={lg.figArrow} markerEnd="url(#lgArrow)" />
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
      <line x1={36} x2={134} y1={96} y2={80} className={lg.figArrow} markerEnd="url(#lgArrow)" />
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

function ArrowDef() {
  return (
    <defs>
      <marker id="lgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
      </marker>
    </defs>
  );
}

/** Three check questions: a number, a choice (both marked), and one to write (the model answer after). */
function Checks({ prob, st, patch }: { prob: LogiProblem; st: ProbState; patch: PanelProps['patch'] }) {
  const Q = LOGI_TEXT[prob].checks;
  const set = (i: number, a: string, show = false) => patch((x) => ({ answers: x.answers.map((v, j) => (j === i ? a : v)), shown: x.shown.map((v, j) => (j === i ? show || (v && x.answers[i] === a) : v)) }));
  const show = (i: number) => patch((x) => ({ shown: x.shown.map((v, j) => (j === i ? true : v)) }));
  return (
    <div className={lg.checks}>
      <b>확인 문제</b>
      {Q.map((q, i) => {
        const a = st.answers[i];
        const res = st.shown[i] ? checkResult(q, a) : null;
        return (
          <div key={q.q} className={lg.check} data-r={res === null ? undefined : res ? 'ok' : 'no'}>
            <p>
              <b>{i + 1}.</b> {q.q}
            </p>
            {q.kind === 'num' && (
              <div className={lg.checkRow}>
                <input inputMode="decimal" value={a} aria-label={`${i + 1}번 답`} onChange={(e) => set(i, e.target.value)} />
                <em>{q.unit}</em>
                <button type="button" className={css.tiny} disabled={a.trim() === ''} onClick={() => show(i)}>
                  확인
                </button>
              </div>
            )}
            {q.kind === 'mc' && (
              <div className={lg.checkMc}>
                {q.choices!.map((c, k) => (
                  <button key={c} type="button" aria-pressed={a === String(k)} onClick={() => set(i, String(k), true)}>
                    {NUM[k]} {c}
                  </button>
                ))}
              </div>
            )}
            {q.kind === 'open' && (
              <>
                <textarea rows={2} value={a} aria-label={`${i + 1}번 답`} placeholder="내 생각을 적어 보세요" onChange={(e) => set(i, e.target.value)} />
                {!st.shown[i] && (
                  <button type="button" className={css.tiny} disabled={a.trim() === ''} onClick={() => show(i)}>
                    모범 답 보기
                  </button>
                )}
              </>
            )}
            {st.shown[i] && (
              <small>
                {res === null ? '모범 답 · ' : res ? '✓ 맞아요 · ' : '✗ 다시 보세요 · '}
                {q.explain}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A check question's answer: right, wrong, or null for one written in words. */
function checkResult(q: CheckQ, a: string): boolean | null {
  if (q.kind === 'num') return near(a, q.answer!, q.tol ?? 0.5);
  if (q.kind === 'mc') return a === String(q.answer);
  return null;
}

/* --- 실습 기록: everything the student did, on one page to print ------------------------ */

function RecordSheet({ st, solved, level, onClose }: { st: Record<LogiProblem, ProbState>; solved: Record<LogiProblem, boolean>; level: StudyLevel; onClose(): void }) {
  const date = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), []);
  return createPortal(
    <div className={`${lg.recordBack} logi-record`} role="dialog" aria-modal="true" aria-label="실습 기록">
      <div className={lg.record}>
        <header className={lg.recordHead}>
          <div>
            <small>산업단지 · 물류 센터 (팔레타이징) · myCobot 280</small>
            <b>실습 기록지</b>
          </div>
          <div className={lg.recordWho}>
            <span>날짜 {date}</span>
            <span>과정 {level === 'uni' ? '대학' : '고등'}</span>
            <span>학번 · 이름 ____________________</span>
          </div>
        </header>
        {PROBS.map((p) => {
          const T = LOGI_TEXT[p];
          const s = st[p];
          const right = T.choices.findIndex((c) => c.ok);
          const firstPick = s.tried[0] ?? (s.pick === right ? right : null);
          return (
            <section key={p} className={lg.recordProb}>
              <h3>
                문제 {p} · {T.title} <small>{solved[p] ? '✓ 해결' : s.reached > 0 ? '진행 중' : '아직'}</small>
              </h3>
              <dl>
                <dt>처음 고른 원인</dt>
                <dd>{firstPick === null ? '—' : `${NUM[firstPick]} ${T.choices[firstPick].t}${firstPick === right ? ' (정답)' : ''}`}</dd>
                <dt>원인 고르기</dt>
                <dd>{s.pick === right ? `${s.tried.length + 1}번 만에 찾음` : '—'}</dd>
                <dt>계산</dt>
                <dd>{s.calcChecked ? T.calc.fields.map((f, i) => `${f.label} = ${s.calc[i] || '—'} ${f.unit}`).join(' / ') : '—'}</dd>
                <dt>예상</dt>
                <dd>
                  {s.pred === null ? '—' : T.predictions[s.pred]}
                  {s.missed !== null && ` → 다른 이유: ${T.missed[s.missed].t}`}
                </dd>
                <dt>힌트</dt>
                <dd>{s.hints}번</dd>
              </dl>
              {s.log.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>다시 가동</th>
                      <th>넣은 값</th>
                      <th>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.log.map((a, i) => (
                      <tr key={i}>
                        <td>
                          {i + 1} · {a.time}
                        </td>
                        <td>{valuesText(p, a.values)}</td>
                        <td>{a.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <ol className={lg.recordChecks}>
                {T.checks.map((q, i) => {
                  const a = s.answers[i];
                  const r = s.shown[i] ? checkResult(q, a) : null;
                  const shownA = q.kind === 'mc' && a !== '' ? `${NUM[+a]} ${q.choices![+a]}` : a;
                  return (
                    <li key={q.q}>
                      {q.q}
                      <span>
                        {shownA ? `답: ${shownA}${q.kind === 'num' ? ` ${q.unit}` : ''}` : '답: ____________'}
                        {r !== null && (r ? ' ✓' : ' ✗')}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <footer className={lg.recordFoot}>
          <span>오늘 알게 된 것 한 줄: ______________________________________________</span>
          <span>선생님 확인 ________</span>
        </footer>
        <div className={lg.recordBtns}>
          <button type="button" className={css.ghost} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={`${css.primary} ${lg.siteBtn}`} onClick={() => window.print()}>
            인쇄 · PDF로 저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
