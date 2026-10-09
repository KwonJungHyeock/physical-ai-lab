'use client';

/**
 * 산업단지 · 스마트 공장 — 컨베이어 픽 앤 플레이스 (myCobot 280 RDK X5 + 흡착 펌프, real size).
 * The same screen and six steps as the 물류 센터 (SiteFlow; the lesson script is
 * content-markdown/sites/factory.md): a slim bar (← 로봇 시티, the site, problems ①②③, the six
 * steps), the cell in the 교육 3D view (LearnStage, the real arm) with the line's board over it, and
 * one panel with what the step needs:
 *  작업 지시 → 가동 · 문제 (slows down and closes in on the moment it goes wrong) → 원인 찾기
 *  (measure — drawn in 3D —, the cause, the explanation) → 값 고치기 (the calculation first, then
 *  the operator panel with live FK / IK / time plan, a prediction, hints) → 다시 가동 · 비교 (before
 *  and after, the checklist, why a prediction missed) → 해결 · 원리 (principle card and figure,
 *  check questions, university card, the real robot, the record sheet).
 *
 *  ① 옆을 집는다 — joint angles put the tip beside the box (forward kinematics);
 *  ② 자리가 매번 바뀐다 — coordinates and inverse kinematics, and a place the arm cannot reach;
 *  ③ 움직이는 상자를 놓친다 — the time plan for a belt that never stops.
 *
 * Every run is computed by the engine (engine/education/lab/problems.ts: FK, IK, trajectory timing,
 * collision checks) in one go, then played back here frame by frame (ConveyorCell).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { BELT, HOME_Q, boxTop, type BoxSpec, type Mm } from '@/engine/education/lab/cell';
import { FACTORY_TEXT } from '@/engine/education/lab/factory';
import {
  GRIP_TOL_MM,
  P1_BOX,
  P1_DEFAULT,
  P1_STOP_Y,
  P1_TARGET,
  P2_BOXES,
  P3_BOXES,
  P3_DEFAULT,
  P3_PITCH_MM,
  P3_SENSOR_Y,
  p1Live,
  p1Miss,
  p2DefaultValues,
  p2Plan,
  p2Readings,
  p2Sensors,
  p3Catch,
  p3Offsets,
  p3Timing,
  p3Wait,
  reachAt,
  referenceFix,
  runP1,
  runP2,
  runP3,
  verdict,
  type P1Values,
  type P2Values,
  type P3Values,
  type ProblemId,
} from '@/engine/education/lab/problems';
import { FRAME_STEP_S, toolPoseAt, type Frame, type LabEvent, type LabRun } from '@/engine/education/lab/run';
import { SITE_STEPS, siteStepIndex, type SiteStepId } from '@/engine/education/lab/siteText';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { logRun } from '@/engine/education/runLog';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import type { CellDim } from './CellKit';
import ConveyorCell, { type CellMarker, type CellOverlay } from './ConveyorCell';
import { FactoryAround, LOOKS } from './ambient/Around';
import { BoxList, CompareView, EventLog, Fix1, Fix2, Fix3, Headline, P1Numbers, type Runs } from './FactoryParts';
import { Playback } from './playback';
import {
  answeredUpTo,
  ArrowDef,
  fmt,
  freshFlow,
  PROBS,
  RecordSheet,
  SitePanel,
  type FlowState,
  type MeasureRow,
} from './SiteFlow';
import css from './lab.module.css';
import lg from './site.module.css';

/** The cell from the front right, a little above (three.js metres, y up): camera, then target. */
export const LAB_VIEW: ViewPose = [0.94, 0.63, 0.67, 0.1, 0.05, -0.08];
/** Near the moment it goes wrong: this much slower, starting this long before. */
const SLOW = 0.35;
const SLOW_LEAD_S = 1.6;
const NO_RUNS: Runs = { before: null, latest: null, previous: null };

interface ProbState extends FlowState {
  step: SiteStepId;
  runs: Runs;
}

const fresh = (p: ProblemId): ProbState => ({ ...freshFlow(FACTORY_TEXT[p]), step: 'brief', runs: NO_RUNS });

declare global {
  interface Window {
    /** Open a problem at a step, optionally with the worked fix run (and everything before it answered), the playback at a time or its end (guide pictures, tools/check). */
    __labOpen?: (p: ProblemId, step: SiteStepId, opts?: { solve?: boolean; at?: number | 'end' }) => void;
  }
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  hidden?: boolean;
  level?: StudyLevel;
  /** Problems solved on an earlier visit (kept by the 교육 tab). */
  saved?: Partial<Record<ProblemId, boolean>>;
  /** A problem was solved (a run passed). */
  onSolved?(p: ProblemId): void;
  onBack(): void;
}

/** Three.js world (y up, metres) from the robot frame (z up, mm), and a close look at a point. */
const world = (p: Mm): [number, number, number] => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
const closeLook = (p: Mm): ViewPose => {
  const [x, y, z] = world(p);
  return [x + 0.36, y + 0.25, z + 0.39, x, y, z];
};
/** The moment a run goes wrong: the first miss, collision or place out of reach. */
const keyEvent = (run: LabRun | null): LabEvent | undefined => run?.events.find((e) => e.kind === 'miss' || e.kind === 'hit' || e.kind === 'unreachable');
const xyz = (p: readonly number[]) => `(${p.map((v) => fmt(v, 1)).join(', ')})`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmt(v, 1)}`;

/* --- 원인 찾기: what to measure, per problem, and how each is drawn in 3D ----------------------- */

interface FactoryRow extends MeasureRow {
  dim?: CellDim;
  marker?: CellMarker;
  /** Draw the cup → box line (①). */
  miss?: boolean;
  /** Draw the reach arc (②). */
  reach?: boolean;
}

const DIM_OK = '#3454d1';
const DIM_BAD = '#e5484d';

function measureRows(chain: readonly ChainSegment[], prob: ProblemId, run: LabRun | null): FactoryRow[] {
  if (prob === 1) {
    const l = p1Live(chain, P1_DEFAULT);
    const r = Math.hypot(l.target[0], l.target[1]);
    return [
      { label: '지시서 각도로 계산한 손끝 (순기구학)', value: xyz(l.tip), marker: { key: 'tip', mm: l.tip, ok: false, text: '손끝 (계산)' } },
      { label: '상자 A 윗면 가운데 (센서가 알려 줌)', value: xyz(l.target), marker: { key: 'box', mm: l.target, ok: true, text: '상자 가운데' } },
      { label: '차이 (손끝 − 상자)', value: `(${l.delta.map(signed).join(', ')}) mm`, bad: true },
      { label: '빗나간 거리', value: `${fmt(l.missMm, 1)} mm (기준 ${GRIP_TOL_MM} mm)`, bad: true, miss: true },
      { label: '몸통(J1 축)에서 상자까지', value: `${fmt(r)} mm`, dim: { key: 'r', a: [0, 0, l.target[2]], b: l.target, text: `${fmt(r)} mm`, color: DIM_OK } },
    ];
  }
  if (prob === 2) {
    const plan = p2Plan(chain, { ...p2DefaultValues(chain), mode: 'coords' });
    const c = plan[2].target;
    const zA = c[2] + 80;
    return [
      ...plan.map((p, k) => ({
        label: `${P2_BOXES[k].name} 자리 · 몸통에서`,
        value: `(${p.target.map((v) => fmt(v)).join(', ')}) · ${fmt(p.radiusMm)} mm`,
        bad: !p.q,
        marker: { key: `t${k}`, mm: p.target, ok: !!p.q, text: `${P2_BOXES[k].id} · ${fmt(p.radiusMm)} mm${p.q ? '' : ' · 닿지 않음'}` },
      })),
      { label: `높이 ${fmt(c[2])} mm에서 팔이 닿는 거리`, value: `약 ${fmt(reachAt(chain, c[2], 200))} mm`, reach: true },
      {
        label: '접근 높이 80 mm일 때 C 위 접근 자리 · 그 높이에서 닿는 거리',
        value: `${fmt(zA)} mm · 약 ${fmt(reachAt(chain, zA, 200))} mm`,
        bad: true,
        marker: { key: 'appr', mm: [c[0], c[1], zA], ok: false, text: `접근 자리 ${fmt(zA)} mm` },
      },
    ];
  }
  const t = p3Timing(chain, P3_DEFAULT);
  const v = P3_DEFAULT;
  const z = boxTop(P3_BOXES[0]) + 12;
  const late = run ? (p3Offsets(run)[0] ?? -t.offS * v.belt) : -t.offS * v.belt;
  const from = P3_SENSOR_Y + P3_BOXES[0].size[1] / 2;
  return [
    {
      label: '센서 후 상자가 대기 지점 아래에 오는 시간',
      value: `${fmt(t.boxS, 2)} s`,
      dim: { key: 'come', a: [BELT.x - 40, from, z], b: [BELT.x - 40, v.waitY, z], text: `${fmt(from - v.waitY)} mm ÷ ${v.belt} mm/s`, color: DIM_OK },
    },
    { label: `팔이 내려가는 시간 (${v.move === 'linear' ? '직선' : '관절'} · 속도 ${v.speed})`, value: `${fmt(t.downS, 2)} s` },
    { label: `팔 도착 = 지연 ${fmt(v.delayMs / 1000, 2)} + 내려가기 ${fmt(t.downS, 2)}`, value: `${fmt(v.delayMs / 1000 + t.downS, 2)} s`, bad: true },
    {
      label: '늦은 시간 · 그동안 상자가 간 거리',
      value: `${fmt(t.offS, 2)} s · ${fmt(-late)} mm`,
      bad: true,
      dim: { key: 'late', a: [BELT.x, v.waitY, z], b: [BELT.x, v.waitY + late, z], text: `${fmt(-late)} mm 지나감`, color: DIM_BAD, label: 'r' },
    },
    { label: '한 번 옮기고 돌아오기 · 상자 간격', value: `${fmt(t.cycleS, 1)} s · ${fmt(t.gapS, 1)} s`, bad: t.cycleS > t.gapS },
  ];
}

/** Which prediction a run bears out (the index into the problem's predictions). */
function predictionOf(prob: ProblemId, run: LabRun | null): number | null {
  if (!run) return null;
  const v = verdict(prob, run);
  if (prob === 1) {
    if (v.pass) return 0;
    const d = p1Miss(run);
    return d !== null && d < 15 ? 1 : 2;
  }
  const n = prob === 2 ? v.placed : run.events.filter((e) => e.kind === 'grip').length;
  return n === 3 ? 0 : n > 0 && (prob === 3 || n === 2) ? 1 : 2;
}

/** The values of a try, in words (the record). */
function valuesText(p: ProblemId, v: P1Values | P2Values | P3Values): string {
  if (p === 1) {
    const a = v as P1Values;
    return `J1 ${fmt(a.j1, 1)}° · J2 ${fmt(a.j2, 1)}° · J3 ${fmt(a.j3, 1)}°`;
  }
  if (p === 2) {
    const b = v as P2Values;
    return `${b.mode === 'coords' ? '좌표' : '각도'}로 지정 · 센서 3 y ${fmt(b.s3)} · 접근 ${fmt(b.approach)} mm`;
  }
  const c = v as P3Values;
  return `대기 y ${fmt(c.waitY)} · 지연 ${fmt(c.delayMs)} ms · ${c.move === 'joint' ? '관절' : '직선'} · 속도 ${c.speed}`;
}

export default function FactoryLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<ProblemId>(1);
  const [st, setSt] = useState<Record<ProblemId, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<ProblemId, boolean>>(() => ({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] }));
  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);
  const [v1, setV1] = useState<P1Values>(P1_DEFAULT);
  const [v2, setV2] = useState<P2Values>(() => p2DefaultValues(chain));
  const [v3, setV3] = useState<P3Values>(P3_DEFAULT);
  const [busy, setBusy] = useState(false);
  /** Playback time (updated ~10 times a second) and whether it plays; slowed down near the failure. */
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  /** ② · 좌표로 지정: the row being edited (the arm shows its IK pose). */
  const [focusRow, setFocusRow] = useState(0);
  const [player] = useState(() => new Playback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step } = s;
  const r = s.runs;

  const patch = useCallback((p: ProblemId, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
    setSt((all) => ({ ...all, [p]: { ...all[p], ...(typeof ch === 'function' ? ch(all[p]) : ch) } }));
  }, []);
  const setStep = useCallback((step: SiteStepId) => patch(prob, (x) => ({ step, reached: Math.max(x.reached, siteStepIndex(step)) })), [patch, prob]);

  /** Which run the 3D view plays in this step. */
  const shown: LabRun | null = step === 'run' || step === 'cause' ? r.before : step === 'compare' || step === 'done' ? (r.latest ?? r.before) : null;
  const baseRate = prob === 2 ? 1.6 : 1;

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
    (run: LabRun | null, at: number | 'end' = 0, rate = 1, slowAt: number | null = null) => {
      player.start(run, at, rate);
      slowFrom.current = slowAt !== null && slowAt > player.t ? slowAt : null;
      setSlow(false);
      setPlayT(player.t);
      setPlaying(player.playing);
    },
    [player],
  );

  /** The run for some values (synchronous; up to ~0.5 s for ②, so it runs after the next paint). */
  const compute = useCallback(
    (p: ProblemId, values: P1Values | P2Values | P3Values): LabRun => (p === 1 ? runP1(chain, values as P1Values) : p === 2 ? runP2(chain, values as P2Values) : runP3(chain, values as P3Values)),
    [chain],
  );
  const startValues = useCallback((p: ProblemId) => (p === 1 ? P1_DEFAULT : p === 2 ? p2DefaultValues(chain) : P3_DEFAULT), [chain]);

  // Play the step's run whenever the run or the step changes: 원인 찾기 stops at the moment it went
  // wrong, 해결 shows how it ended, 가동 slows down just before it goes wrong.
  const lastShown = useRef<{ run: LabRun | null; step: SiteStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    const key = keyEvent(shown);
    const at = step === 'cause' ? (key ? key.t + 0.05 : 'end') : step === 'done' ? 'end' : 0;
    play(shown, at, baseRate, step === 'run' && key ? Math.max(0, key.t - SLOW_LEAD_S) : null);
  }, [shown, step, baseRate, play]);

  /** 라인 가동 (the work sheet's values) or 다시 가동 (the student's). */
  const go = useCallback(
    (which: 'before' | 'latest') => {
      const p = prob;
      const values = which === 'before' ? startValues(p) : p === 1 ? v1 : p === 2 ? v2 : v3;
      setBusy(true);
      window.setTimeout(() => {
        const run = compute(p, values);
        const v = verdict(p, run);
        const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const then: SiteStepId = which === 'before' ? 'run' : 'compare';
        patch(p, (x) => ({
          runs: which === 'before' ? { before: run, latest: null, previous: null } : { before: x.runs.before, previous: x.runs.latest ?? x.runs.before, latest: run },
          tries: which === 'latest' ? x.tries + 1 : x.tries,
          missed: which === 'latest' ? null : x.missed,
          log: which === 'latest' ? [...x.log, { time, values: valuesText(p, values), pass: v.pass, note: v.headline }] : x.log,
          step: then,
          reached: Math.max(x.reached, siteStepIndex(then)),
        }));
        if (which === 'latest') logRun({ lab: 'factory', problem: p, pass: v.pass, durationS: run.durationS, values, checks: v.checks });
        if (which === 'latest' && v.pass) setSolved((x) => ({ ...x, [p]: true }));
        setBusy(false);
      }, 30);
    },
    [prob, v1, v2, v3, compute, startValues, patch],
  );

  // Guide pictures and checks: jump to a problem and step (with the worked fix run), playback at a time.
  useEffect(() => {
    window.__labOpen = (p, step, opts = {}) => {
      const before = st[p].runs.before ?? compute(p, startValues(p));
      let latest = st[p].runs.latest;
      let log = st[p].log;
      if (opts.solve) {
        const fix = referenceFix(chain, p);
        if (p === 1) setV1(fix as P1Values);
        else if (p === 2) setV2(fix as P2Values);
        else setV3(fix as P3Values);
        latest = compute(p, fix);
        const v = verdict(p, latest);
        log = [...log, { time: '—', values: valuesText(p, fix), pass: v.pass, note: v.headline }];
        if (v.pass) setSolved((x) => ({ ...x, [p]: true }));
      }
      setProb(p);
      patch(p, (x) => ({ ...answeredUpTo(FACTORY_TEXT[p], x, siteStepIndex(step), measureRows(chain, p, before).length, !!opts.solve), log, runs: { before, previous: before, latest }, step }));
      if (opts.at !== undefined) {
        const at = opts.at;
        // After the step's run has been put in the player.
        window.setTimeout(() => {
          if (player.run) play(player.run, at);
        }, 80);
      }
    };
    return () => {
      delete window.__labOpen;
    };
  }, [chain, st, compute, startValues, patch, play, player]);

  /* --- what the 3D view shows ------------------------------------------------ */

  const specs: readonly BoxSpec[] = prob === 1 ? [P1_BOX] : prob === 2 ? P2_BOXES : P3_BOXES;
  const sensors = shown ? shown.sensors.map((x) => x.y) : prob === 1 ? [P1_STOP_Y] : prob === 2 ? p2Sensors(v2.s3) : [P3_SENSOR_Y];
  // ②: what IK makes of the targets being edited. Deferred: typing stays quick.
  const v2Deferred = useDeferredValue(v2);
  const plan2 = useMemo(() => (prob === 2 && step === 'fix' ? p2Plan(chain, v2Deferred) : null), [chain, prob, step, v2Deferred]);
  const live1 = useMemo(() => (prob === 1 ? p1Live(chain, v1) : null), [chain, prob, v1]);
  const reach = useMemo(() => (prob === 2 ? { r: reachAt(chain, boxTop(P2_BOXES[2]), 200), z: boxTop(P2_BOXES[2]) } : null), [chain, prob]);
  const wait3 = useMemo(() => (prob === 3 ? toolPoseAt(chain, p3Wait(v3)) : null), [chain, prob, v3]);
  const rows = useMemo(() => measureRows(chain, prob, r.before), [chain, prob, r.before]);

  // Boxes standing still while values are edited (and before the first run).
  const still = useMemo<Frame['boxes']>(() => {
    const at = (b: BoxSpec, y: number) => ({ x: BELT.x, y, z: BELT.top + b.size[2] / 2, mode: 'belt' as const });
    if (prob === 1) return [at(P1_BOX, P1_TARGET[1])];
    if (prob === 2) return p2Readings(v2.s3).map((p, k) => at(P2_BOXES[k], p[1]));
    // ③: the first box where the cup should meet it, the next ones coming (those beyond the belt not shown).
    return P3_BOXES.map((b, k) => {
      const y = v3.waitY + k * P3_PITCH_MM * 0.3;
      return { ...at(b, y), mode: y < BELT.yIn - 40 ? ('belt' as const) : ('wait' as const) };
    });
  }, [prob, v2.s3, v3.waitY]);
  useEffect(() => {
    player.setStill(still);
  }, [player, still]);

  const angles = useMemo(() => {
    if (step !== 'fix') return HOME_Q;
    if (prob === 1) return live1!.q;
    if (prob === 2) return plan2?.[focusRow]?.q ?? plan2?.find((x) => x.q)?.q ?? HOME_Q;
    return wait3?.q ?? HOME_Q;
  }, [step, prob, live1, plan2, focusRow, wait3]);

  const overlay = useMemo<CellOverlay>(() => {
    const o: CellOverlay = { markers: [], dims: [] };
    o.sensorNames = prob === 2 ? ['센서 1', '센서 2', '센서 3'] : prob === 3 ? ['센서'] : ['멈춤 센서'];
    if (step === 'fix') {
      if (prob === 1 && live1)
        o.miss = { from: live1.tip, to: live1.target, text: live1.missMm <= GRIP_TOL_MM ? `가운데에서 ${live1.missMm.toFixed(1)} mm` : `${live1.missMm.toFixed(1)} mm 떨어짐`, ok: live1.missMm <= GRIP_TOL_MM };
      if (prob === 2 && plan2) {
        o.reach = reach;
        plan2.forEach((p, k) => {
          if (v2.mode === 'angles' && k > 0) return;
          o.markers!.push({ key: `t${k}`, mm: p.target, ok: !!p.q, text: !p.q ? '닿을 수 없음' : !p.approachQ ? '접근 자리 닿을 수 없음' : v2.mode === 'coords' ? P2_BOXES[k].name : undefined });
          if (p.q && !p.approachQ) o.markers!.push({ key: `a${k}`, mm: [p.target[0], p.target[1], p.target[2] + v2.approach], ok: false });
        });
      }
      if (prob === 3) {
        const c = p3Catch(v3);
        o.markers!.push({ key: 'catch', mm: [c[0], c[1], c[2] + 1], ok: !!wait3, text: wait3 ? '여기서 잡아요' : '닿을 수 없음' });
      }
      return o;
    }
    if (step === 'cause') {
      // What has been measured so far, drawn where it is.
      const l = prob === 1 ? p1Live(chain, P1_DEFAULT) : null;
      for (const row of rows.slice(0, s.meas)) {
        if (row.marker) o.markers!.push(row.marker);
        if (row.dim) o.dims!.push(row.dim);
        if (row.reach) o.reach = reach;
        if (row.miss && l) o.miss = { from: l.tip, to: l.target, ok: false, text: `빗나감 ${l.missMm.toFixed(1)} mm` };
      }
      return o;
    }
    if (!shown) return o;
    const i = Math.min(shown.tip.length - 1, Math.round(playT / FRAME_STEP_S));
    o.path = shown.tip.slice(0, i + 1).filter((_, j) => j % 2 === 0 || j === i);
    if (step === 'compare' && r.previous && r.previous !== shown) o.ghostPath = r.previous.tip.filter((_, j) => j % 3 === 0);
    for (const e of shown.events) {
      if (e.t > playT + 1e-6) break;
      if ((e.kind === 'miss' || e.kind === 'grip') && e.to && prob !== 3)
        o.miss = { from: e.at!, to: e.to, ok: e.kind === 'grip', text: e.kind === 'grip' ? `흡착 · 가운데에서 ${e.mm!.toFixed(1)} mm` : `빗나감 ${e.mm!.toFixed(1)} mm` };
      if (e.kind === 'grip' && prob === 3) o.markers!.push({ key: `g${e.t}`, mm: e.at!, ok: true });
      if (e.kind === 'miss' && prob === 3 && e.at) o.markers!.push({ key: `m${e.t}`, mm: e.at, ok: false, text: '놓침' });
      if (e.kind === 'unreachable' && e.at) o.markers!.push({ key: `u${e.t}`, mm: e.at, ok: false, text: '닿을 수 없음' });
      if (e.kind === 'hit' && e.at) o.markers!.push({ key: `h${e.t}`, mm: e.at, ok: false, text: '부딪힘' });
    }
    return o;
  }, [chain, prob, step, live1, plan2, reach, v2.mode, v2.approach, v3, wait3, rows, s.meas, shown, playT, r.previous]);

  const scene = useMemo<LearnScene>(() => {
    const ghostOf = (run: LabRun | null) => {
      if (!run) return null;
      const e = run.events.find((x) => x.kind === 'grip' || x.kind === 'miss' || x.kind === 'hit');
      return run.frames[Math.min(run.frames.length - 1, Math.round((e?.t ?? run.durationS) / FRAME_STEP_S))].q;
    };
    const ghost = step === 'compare' && r.previous && r.previous !== shown ? ghostOf(r.previous) : null;
    return { angles, tool: 'pump', pumpOn: false, ghosts: ghost ? [{ key: 'prev', angles: ghost, opacity: 0.22 }] : undefined };
  }, [angles, step, r.previous, shown]);

  // The close look: while the failure plays slowly, and while looking for the cause.
  const key = keyEvent(shown);
  const keyAt = key?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => (keyAt && ((step === 'run' && slow) || step === 'cause') ? closeLook(keyAt) : null), [keyAt, step, slow]);

  // The line's board: what has happened up to the playback time.
  const board = useMemo(() => {
    if (!shown) return null;
    const upTo = shown.events.filter((e) => e.t <= playT + 1e-6);
    const bad = upTo.find((e) => e.kind === 'miss' || e.kind === 'hit' || e.kind === 'unreachable') ?? null;
    return { placed: upTo.filter((e) => e.kind === 'place').length, of: specs.length, bad, t: playT };
  }, [shown, playT, specs.length]);
  const end = !!shown && playT >= shown.durationS - 1e-6;
  const pass = !!shown && verdict(prob, shown).pass;

  const at = siteStepIndex(step);
  return (
    <div className={`${css.lab} ${lg.factory}`} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 로봇 시티
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          스마트 공장
          <small>컨베이어 공정</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${FACTORY_TEXT[p].title} · ${FACTORY_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{FACTORY_TEXT[p].title}</span>
              {solved[p] && <i aria-label="해결">✓</i>}
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

      <section className={css.stage} aria-label="3D 공정 화면">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={LAB_VIEW} focus={focus} live={player.arm} look={LOOKS.factory}>
          <FactoryAround />
          <ConveyorCell player={player} boxes={specs} sensors={sensors} overlay={overlay} prob={prob} />
        </LearnStage>
        {board?.bad && !(end && pass) && <div className={lg.alarm}>⚠ {board.bad.text}</div>}
        {end && pass && <div className={lg.okPill}>✓ {verdict(prob, shown!).headline}</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        {board && (
          <div className={lg.board} aria-label="라인 현황">
            <div data-c={board.placed === board.of ? 'ok' : undefined}>
              <small>옮긴 상자</small>
              <b>
                {board.placed} / {board.of}
              </b>
            </div>
            <div data-c={board.bad ? 'bad' : 'ok'}>
              <small>공정</small>
              <b>{board.bad ? (board.bad.kind === 'hit' ? '정지' : '불량') : '정상'}</b>
            </div>
            <div>
              <small>시간</small>
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
                else if (player.t >= shown.durationS - 1e-6) play(shown, 0, baseRate, step === 'run' && key ? Math.max(0, key.t - SLOW_LEAD_S) : null);
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
        <p className={css.hint}>끌어서 돌려 보기 · 휠로 확대</p>
      </section>

      <aside className={css.panel} aria-label="실습 안내">
        <Panel
          chain={chain}
          prob={prob}
          st={s}
          busy={busy}
          solved={solved[prob]}
          level={level}
          rows={rows}
          playing={playing}
          playT={playT}
          v1={v1}
          v2={v2}
          v3={v3}
          onV1={setV1}
          onV2={setV2}
          onV3={setV3}
          onFocusRow={setFocusRow}
          plan2={plan2}
          patch={(ch) => patch(prob, ch)}
          onRunBefore={() => go('before')}
          onRunFix={() => go('latest')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as ProblemId) : onBack())}
        />
      </aside>
      {record && <RecordSheet site="스마트 공장 (컨베이어 공정)" tone={lg.factory} texts={FACTORY_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

/* --- the panel ------------------------------------------------------------------- */

interface PanelProps {
  chain: readonly ChainSegment[];
  prob: ProblemId;
  st: ProbState;
  busy: boolean;
  solved: boolean;
  level: StudyLevel;
  rows: FactoryRow[];
  playing: boolean;
  playT: number;
  v1: P1Values;
  v2: P2Values;
  v3: P3Values;
  onV1(v: P1Values): void;
  onV2(v: P2Values): void;
  onV3(v: P3Values): void;
  onFocusRow(k: number): void;
  plan2: ReturnType<typeof p2Plan> | null;
  patch(ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)): void;
  onRunBefore(): void;
  onRunFix(): void;
  onStep(s: SiteStepId): void;
  onRecord(): void;
  onNext(): void;
}

/** The work program as the line has it now (작업 지시). */
function programLine(chain: readonly ChainSegment[], p: ProblemId): string {
  if (p === 1) return `J1 ${P1_DEFAULT.j1}° · J2 ${P1_DEFAULT.j2}° · J3 ${P1_DEFAULT.j3}° (손목은 컵이 아래를 보도록 자동)`;
  if (p === 2) {
    const v = p2DefaultValues(chain);
    return `모든 상자에 같은 각도 J1 ${v.pose.j1}° · J2 ${v.pose.j2}° · J3 ${v.pose.j3}° (문제 1에서 맞춘 값), 접근 높이 ${v.approach} mm`;
  }
  const v = P3_DEFAULT;
  return `대기 y ${v.waitY} mm, 센서 후 ${v.delayMs} ms 기다렸다가 ${v.move === 'linear' ? '직선' : '관절'} 이동 · 속도 ${v.speed}, 벨트 ${v.belt} mm/s`;
}

function Panel(p: PanelProps) {
  const { chain, prob, st } = p;
  const T = FACTORY_TEXT[prob];
  const { before, latest } = st.runs;
  const v = latest ? verdict(prob, latest) : null;
  return (
    <SitePanel
      T={T}
      lab="factory"
      st={st}
      boss="김 주임"
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
            <dd>{prob === 2 ? 'A 60 · B 70 · C 50 mm 각 (높이 50 · 60 · 40)' : '60 × 60 × 50 mm'}</dd>
            <dt>옮기기</dt>
            <dd>{prob === 1 ? '1개' : prob === 2 ? 'A · B · C 3개' : '멈추지 않는 벨트에서 3개 연달아'} → 팔레트</dd>
            <dt>흡착</dt>
            <dd>상자 윗면 가운데에서 {GRIP_TOL_MM} mm 안</dd>
            <dt>안전</dt>
            <dd>벨트 · 센서 · 상자에 부딪히지 않기, 관절 범위 안</dd>
          </dl>
        </div>
      }
      program={programLine(chain, prob)}
      runTitle={before ? verdict(prob, before).headline : '계산 중…'}
      runResult={
        before && (
          <>
            <div className={css.card}>
              <Headline prob={prob} run={before} />
              {prob === 1 && <P1Numbers run={before} />}
              {prob === 2 && <BoxList run={before} />}
              {prob === 3 && <BoxList run={before} offsets={p3Offsets(before)} />}
            </div>
            <EventLog run={before} />
          </>
        )
      }
      playing={p.playing && st.step === 'run'}
      rows={p.rows}
      fixTitle={prob === 1 ? '관절 각도를 고쳐요' : prob === 2 ? '좌표로 지정하고 닿게 해요' : '시간 계획을 세워요'}
      hmi={
        <>
          {prob === 1 && <Fix1 chain={chain} v1={p.v1} onV1={p.onV1} />}
          {prob === 2 && <Fix2 chain={chain} v2={p.v2} onV2={p.onV2} onFocusRow={p.onFocusRow} plan2={p.plan2} />}
          {prob === 3 && <Fix3 chain={chain} v3={p.v3} onV3={p.onV3} />}
        </>
      }
      compare={before && latest && <CompareView prob={prob} before={before} latest={latest} playing={p.playing} playT={p.playT} waitY={p.v3.waitY} />}
      hit={p.playing ? null : predictionOf(prob, latest)}
      pass={!!v?.pass}
      notYet={v && !v.pass ? v.headline + '.' : null}
      fig={<PrincipleFig prob={prob} />}
      nextLabel={prob < 3 ? `문제 ${prob + 1} · ${FACTORY_TEXT[(prob + 1) as ProblemId].title} →` : '로봇 시티로 →'}
      patch={p.patch}
      onRunBefore={p.onRunBefore}
      onRunFix={p.onRunFix}
      onStep={p.onStep}
      onRecord={p.onRecord}
      onNext={p.onNext}
    />
  );
}

/* --- 해결 · 원리: the principle card's figure, per problem -------------------------------------- */

function PrincipleFig({ prob }: { prob: ProblemId }) {
  if (prob === 1) {
    // The arm seen from above: J1 turns it a little, the tip moves along an arc (r × angle).
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="J1이 1° 돌면 손끝은 반지름 × 각도만큼 옆으로 움직인다">
        <circle cx={40} cy={90} r={9} className={lg.figCup} />
        <line x1={40} x2={262} y1={90} y2={78} className={lg.figArrow} />
        <line x1={40} x2={256} y1={90} y2={38} className={lg.figArrow} strokeDasharray="4 3" />
        <path d="M262,78 A222,222 0 0 0 256,38" className={lg.figGuide} fill="none" />
        <circle cx={262} cy={78} r={5} className={lg.figMark} />
        <circle cx={256} cy={38} r={5} className={lg.figMarkOld} />
        <text x={268} y={62} className={lg.figStrong}>
          ≈ r × θ
        </text>
        <text x={120} y={102} className={lg.figTxt}>
          r = 221 mm (몸통 → 손끝)
        </text>
        <text x={56} y={24} className={lg.figTxt}>
          J1 · θ (1° = 0.0175 rad → 3.9 mm)
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    // Seen from above: the reach circle, A and B inside, C outside and moved in.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="몸통에서의 거리가 닿는 거리 안이어야 역기구학의 답이 있다">
        <circle cx={30} cy={100} r={8} className={lg.figCup} />
        <path d="M30,100 m-130,0 a130,130 0 0 1 260,0" className={lg.figOld} fill="none" />
        <rect x={120} y={66} width={16} height={16} className={lg.figBox} />
        <rect x={110} y={44} width={18} height={18} className={lg.figBox} />
        <rect x={176} y={6} width={14} height={14} className={lg.figBox} />
        <rect x={120} y={24} width={14} height={14} className={lg.figPalTop} />
        <line x1={175} x2={138} y1={14} y2={28} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={140} y={80} className={lg.figTxt}>
          A
        </text>
        <text x={98} y={56} className={lg.figTxt}>
          B
        </text>
        <text x={194} y={16} className={lg.figTxt}>
          C (372 mm)
        </text>
        <text x={102} y={36} className={lg.figTxt}>
          C′
        </text>
        <text x={206} y={70} className={lg.figStrong}>
          r ≤ 닿는 거리
        </text>
        <ArrowDef />
      </svg>
    );
  }
  // The time line: the box comes under the cup at t_box; the arm must arrive then (delay + way down).
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="출발 지연 더하기 내려가는 시간이 상자가 오는 시간과 같아야 한다">
      <line x1={20} x2={300} y1={88} y2={88} className={lg.figArrow} markerEnd="url(#siteArrow)" />
      <text x={290} y={104} className={lg.figTxt}>
        t
      </text>
      <text x={20} y={104} className={lg.figTxt}>
        센서
      </text>
      <rect x={20} y={20} width={180} height={14} rx={3} className={lg.figBox} />
      <text x={24} y={31} className={lg.figTxt}>
        상자가 오는 시간 2.0 s
      </text>
      <rect x={20} y={50} width={152} height={14} rx={3} className={lg.figOld} />
      <rect x={172} y={50} width={28} height={14} rx={3} className={lg.figPalTop} />
      <text x={24} y={61} className={lg.figTxt}>
        출발 지연 1.69 s
      </text>
      <text x={204} y={61} className={lg.figTxt}>
        내려가기 0.31 s
      </text>
      <line x1={200} x2={200} y1={14} y2={88} className={lg.figUp} strokeDasharray="3 3" />
      <text x={206} y={30} className={lg.figStrong}>
        같은 순간
      </text>
      <ArrowDef />
    </svg>
  );
}
