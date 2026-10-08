'use client';

/**
 * 교육 · 문제 해결 실습 (시범) — 컨베이어 공정: one screen, no scrolling. A slim bar on top (← 교육
 * 홈, the chapter, problems ①②③ with ✓, the six steps as dots), the 3D cell on the left and one
 * panel on the right with what the current step needs (LabPanel). Students fix a working line
 * instead of reading theory first; the theory stays in the PDFs the last step links to.
 *
 * Every run is computed by the engine (engine/education/lab: FK, IK, trajectory timing, collision
 * checks) in one go, then played back here frame by frame (ConveyorCell).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { STEPS, type StepId } from '@/engine/education/lab/chapter';
import { BELT, HOME_Q, boxTop, type BoxSpec } from '@/engine/education/lab/cell';
import {
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
  p2DefaultValues,
  p2Plan,
  p2Readings,
  p2Sensors,
  p3Catch,
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
import { FRAME_STEP_S, toolPoseAt, type Frame, type LabRun } from '@/engine/education/lab/run';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import ConveyorCell, { type CellMarker, type CellOverlay } from './ConveyorCell';
import { Playback } from './playback';
import LabBar from './LabBar';
import LabPanel, { type Runs } from './LabPanel';
import css from './lab.module.css';

/** The cell from the front right, a little above (three.js metres, y up): camera, then target. */
const LAB_VIEW: ViewPose = [0.94, 0.63, 0.67, 0.1, 0.05, -0.08];

const NO_RUNS: Runs = { before: null, latest: null, previous: null };

declare global {
  interface Window {
    /** Open a problem at a step, optionally with the worked fix run, and the playback at a time or its end (guide pictures, tools/check). */
    __labOpen?: (p: ProblemId, step: StepId, opts?: { solve?: boolean; at?: number | 'end' }) => void;
  }
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  hidden?: boolean;
  onBack(): void;
}

const stepIndex = (s: StepId) => STEPS.findIndex((x) => x.id === s);

export default function LabView({ robot, chain, gripperRobot, hidden, onBack }: Props) {
  const [prob, setProb] = useState<ProblemId>(1);
  const [step, setStepRaw] = useState<StepId>('situation');
  const [reached, setReached] = useState<Record<ProblemId, number>>({ 1: 0, 2: 0, 3: 0 });
  const [solved, setSolved] = useState<Record<ProblemId, boolean>>({ 1: false, 2: false, 3: false });
  const [answers, setAnswers] = useState<Record<ProblemId, number | null>>({ 1: null, 2: null, 3: null });
  const [v1, setV1] = useState<P1Values>(P1_DEFAULT);
  const [v2, setV2] = useState<P2Values>(() => p2DefaultValues(chain));
  const [v3, setV3] = useState<P3Values>(P3_DEFAULT);
  const [runs, setRuns] = useState<Record<ProblemId, Runs>>({ 1: NO_RUNS, 2: NO_RUNS, 3: NO_RUNS });
  const [busy, setBusy] = useState(false);
  /** Playback time (updated ~10 times a second) and whether it plays. */
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** ② · 좌표로 지정: the row being edited (the arm shows its IK pose). */
  const [focusRow, setFocusRow] = useState(0);

  const [player] = useState(() => new Playback());
  const r = runs[prob];

  const setStep = useCallback(
    (s: StepId) => {
      setStepRaw(s);
      setReached((x) => ({ ...x, [prob]: Math.max(x[prob], stepIndex(s)) }));
    },
    [prob],
  );

  /** Which run the 3D view plays in this step. */
  const shown: LabRun | null = step === 'situation' || step === 'cause' ? r.before : step === 'fix' ? null : (r.latest ?? r.before);

  // Start (or stop) playback when the shown run changes.
  const play = useCallback(
    (run: LabRun | null, at: number | 'end' = 0, rate = 1) => {
      player.start(run, at, rate);
      setPlayT(player.t);
      setPlaying(player.playing);
    },
    [player],
  );
  useEffect(() => {
    player.listen((t, done) => {
      setPlayT(t);
      if (done) setPlaying(false);
    });
    return () => player.listen(null);
  }, [player]);

  /** The run for some values (synchronous; up to ~0.5 s for ②, so it runs after the next paint). */
  const compute = useCallback(
    (p: ProblemId, values: P1Values | P2Values | P3Values): LabRun => (p === 1 ? runP1(chain, values as P1Values) : p === 2 ? runP2(chain, values as P2Values) : runP3(chain, values as P3Values)),
    [chain],
  );
  const startValues = useCallback((p: ProblemId) => (p === 1 ? P1_DEFAULT : p === 2 ? p2DefaultValues(chain) : P3_DEFAULT), [chain]);

  // A problem's starting run, the first time its 상황 is shown (after the screen has painted).
  useEffect(() => {
    if (hidden || r.before) return;
    const p = prob;
    const id = window.setTimeout(() => {
      const before = compute(p, startValues(p));
      setRuns((x) => (x[p].before ? x : { ...x, [p]: { ...x[p], before } }));
    }, 30);
    return () => window.clearTimeout(id);
  }, [prob, hidden, r.before, compute, startValues]);

  // Play the step's run whenever the run or the step changes.
  const lastShown = useRef<{ run: LabRun | null; step: StepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    // 원인 찾기 stops at the moment it went wrong; 확인 and 정리 show how the run ended.
    const key = step === 'cause' ? shown?.events.find((e) => e.kind === 'miss' || e.kind === 'hit' || e.kind === 'unreachable') : undefined;
    play(shown, key ? key.t + 0.05 : step === 'cause' || step === 'verify' || step === 'principle' ? 'end' : 0, prob === 2 ? 1.6 : 1);
  }, [shown, step, prob, play]);

  /** Run the student's values (값 고치기 → 다시 실행 · 비교). */
  const runFix = useCallback(() => {
    const p = prob;
    const values = p === 1 ? v1 : p === 2 ? v2 : v3;
    setBusy(true);
    window.setTimeout(() => {
      const latest = compute(p, values);
      setRuns((x) => ({ ...x, [p]: { before: x[p].before, previous: x[p].latest ?? x[p].before, latest } }));
      // Solved once a run passes (해결 확인 shows why).
      if (verdict(p, latest).pass) setSolved((x) => ({ ...x, [p]: true }));
      setBusy(false);
      setStep('compare');
    }, 30);
  }, [prob, v1, v2, v3, compute, setStep]);

  const openProblem = useCallback((p: ProblemId) => {
    setProb(p);
    setStepRaw('situation');
    lastShown.current = null;
  }, []);

  // Guide pictures and checks: jump to a problem and step (with the worked fix run), playback at a time.
  useEffect(() => {
    window.__labOpen = (p, s, opts = {}) => {
      setProb(p);
      if (opts.solve) {
        const fix = referenceFix(chain, p);
        if (p === 1) setV1(fix as P1Values);
        else if (p === 2) setV2(fix as P2Values);
        else setV3(fix as P3Values);
        const before = compute(p, startValues(p));
        const latest = compute(p, fix);
        setRuns((x) => ({ ...x, [p]: { before, previous: before, latest } }));
        if (verdict(p, latest).pass) setSolved((x) => ({ ...x, [p]: true }));
      }
      setStepRaw(s);
      setReached((x) => ({ ...x, [p]: Math.max(x[p], stepIndex(s)) }));
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
  }, [chain, compute, play, player, startValues]);

  /* --- what the 3D view shows ------------------------------------------------ */

  const specs: readonly BoxSpec[] = prob === 1 ? [P1_BOX] : prob === 2 ? P2_BOXES : P3_BOXES;
  const sensors = shown ? shown.sensors.map((s) => s.y) : prob === 1 ? [P1_STOP_Y] : prob === 2 ? p2Sensors(v2.s3) : [P3_SENSOR_Y];
  // ②: what IK makes of the targets (원인 찾기: of where the boxes stop at first). Deferred: typing stays quick.
  const v2Deferred = useDeferredValue(v2);
  const plan2 = useMemo(
    () => (prob === 2 && (step === 'fix' || step === 'cause') ? p2Plan(chain, step === 'cause' ? { ...p2DefaultValues(chain), mode: 'coords' } : v2Deferred) : null),
    [chain, prob, step, v2Deferred],
  );
  const live1 = useMemo(() => (prob === 1 ? p1Live(chain, v1) : null), [chain, prob, v1]);
  const reach = useMemo(() => (prob === 2 ? { r: reachAt(chain, boxTop(P2_BOXES[2]), 200), z: boxTop(P2_BOXES[2]) } : null), [chain, prob]);
  const wait3 = useMemo(() => (prob === 3 ? toolPoseAt(chain, p3Wait(v3)) : null), [chain, prob, v3]);

  // Boxes standing still while values are edited.
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
    if (prob === 1) return live1!.q;
    if (prob === 2) {
      const q = plan2?.[focusRow]?.q ?? plan2?.find((x) => x.q)?.q;
      return q ?? HOME_Q;
    }
    return wait3?.q ?? HOME_Q;
  }, [prob, live1, plan2, focusRow, wait3]);

  const overlay = useMemo<CellOverlay>(() => {
    const o: CellOverlay = { markers: [] };
    o.sensorNames = prob === 2 ? ['센서 1', '센서 2', '센서 3'] : prob === 3 ? ['센서'] : ['멈춤 센서'];
    if (step === 'fix') {
      if (prob === 1 && live1)
        o.miss = { from: live1.tip, to: live1.target, text: live1.missMm <= 3 ? `가운데에서 ${live1.missMm.toFixed(1)} mm` : `${live1.missMm.toFixed(1)} mm 떨어짐`, ok: live1.missMm <= 3 };
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
    if (prob === 2 && step === 'cause' && plan2) {
      o.reach = reach;
      plan2.forEach((p, k) => o.markers!.push({ key: `t${k}`, mm: p.target, ok: !!p.q, text: p.q ? `${Math.round(p.radiusMm)} mm` : `${Math.round(p.radiusMm)} mm · 닿을 수 없음` }));
    }
    if (!shown) return o;
    const i = Math.min(shown.tip.length - 1, Math.round(playT / FRAME_STEP_S));
    o.path = shown.tip.slice(0, i + 1).filter((_, j) => j % 2 === 0 || j === i);
    if (step === 'compare' && r.previous && r.previous !== shown) o.ghostPath = r.previous.tip.filter((_, j) => j % 3 === 0);
    for (const e of shown.events) {
      if (e.t > playT + 1e-6) break;
      if ((e.kind === 'miss' || e.kind === 'grip') && e.to && prob !== 3 && !(prob === 2 && step === 'cause'))
        o.miss = { from: e.at!, to: e.to, ok: e.kind === 'grip', text: e.kind === 'grip' ? `흡착 · 가운데에서 ${e.mm!.toFixed(1)} mm` : `빗나감 ${e.mm!.toFixed(1)} mm` };
      if (e.kind === 'grip' && prob === 3) o.markers!.push({ key: `g${e.t}`, mm: e.at!, ok: true });
      if (e.kind === 'miss' && prob === 3 && e.at) o.markers!.push({ key: `m${e.t}`, mm: e.at, ok: false, text: '놓침' });
      if (e.kind === 'unreachable' && e.at) o.markers!.push({ key: `u${e.t}`, mm: e.at, ok: false, text: '닿을 수 없음' });
      if (e.kind === 'hit' && e.at) o.markers!.push({ key: `h${e.t}`, mm: e.at, ok: false, text: '부딪힘' } satisfies CellMarker);
    }
    if (prob === 2 && step === 'situation' && !o.miss) o.reach = null;
    return o;
  }, [prob, step, live1, plan2, reach, v2.mode, v2.approach, v3, wait3, shown, playT, r.previous]);

  const scene = useMemo<LearnScene>(() => {
    const ghostOf = (run: LabRun | null) => {
      if (!run) return null;
      const e = run.events.find((x) => x.kind === 'grip' || x.kind === 'miss' || x.kind === 'hit');
      return run.frames[Math.min(run.frames.length - 1, Math.round((e?.t ?? run.durationS) / FRAME_STEP_S))].q;
    };
    const ghost = step === 'compare' && r.previous && r.previous !== shown ? ghostOf(r.previous) : null;
    return { angles, tool: 'pump', pumpOn: false, ghosts: ghost ? [{ key: 'prev', angles: ghost, opacity: 0.22 }] : undefined };
  }, [angles, step, r.previous, shown]);

  return (
    <div className={css.lab} hidden={hidden}>
      <LabBar prob={prob} step={step} reached={reached[prob]} solved={solved} onProblem={openProblem} onStep={setStep} onBack={onBack} />
      <section className={css.stage} aria-label="3D 공정 화면">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={LAB_VIEW} live={player.arm}>
          <ConveyorCell player={player} boxes={specs} sensors={sensors} overlay={overlay} />
        </LearnStage>
        <p className={css.hint}>끌어서 돌려 보기 · 휠로 확대{shown ? ` · ${playT.toFixed(1)} / ${shown.durationS.toFixed(1)} s` : ''}</p>
      </section>
      <LabPanel
        chain={chain}
        prob={prob}
        step={step}
        reached={reached[prob]}
        solved={solved[prob]}
        runs={r}
        busy={busy}
        playing={playing}
        playT={playT}
        answer={answers[prob]}
        onAnswer={(i) => setAnswers((a) => ({ ...a, [prob]: i }))}
        v1={v1}
        v2={v2}
        v3={v3}
        onV1={setV1}
        onV2={setV2}
        onV3={setV3}
        onFocusRow={setFocusRow}
        plan2={plan2}
        onStep={setStep}
        onRun={runFix}
        onReplay={() => play(shown, 0, prob === 2 ? 1.6 : 1)}
        onNext={() => openProblem((prob + 1) as ProblemId)}
      />
    </div>
  );
}
