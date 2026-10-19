'use client';

/**
 * 산업단지 · 바이오 실험실 — 시험관 옮기기 (myCobot 280 RDK X5 + 어댑티브 그리퍼, real size). The same
 * screen and six steps as the other sites (SitePanel; the lesson script is
 * content-markdown/sites/bio.md), the bench in the 교육 3D view (LearnStage, the real arm with the
 * official gripper) and the engine's runs played back (BioCell):
 *
 *  ① 시험관이 기울어 쏟아진다 — the place pose's orientation (rx · ry · rz);
 *  ② 먼 칸일수록 어긋난다 — a J1 zero error and its calibration;
 *  ③ 돌아가는 길에 부딪힌다 — a waypoint round the centrifuge (lifting over it is out of reach).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  BIO_DEFAULTS,
  BIO_FIXES,
  CENTRIFUGE,
  DST,
  HEADSPACE_MM,
  J1_ERR_DEG,
  LIFT_Z,
  READ_MM,
  CATCH_MM,
  ROW,
  SPILL_DEG,
  RACK,
  SRC,
  TUBE,
  BELOW,
  calibPreview,
  bioReach,
  poseAt,
  rowHole,
  runBio,
  runPath,
  scoreBio,
  toolAt,
  trayHole,
  SEAT_Z,
  type BioFrame,
  type BioProblem,
  type BioRun,
  type BioValues,
  type CalibValues,
  type PathValues,
  type PoseValues,
} from '@/engine/education/lab/bio';
import { BIO_TEXT } from '@/engine/education/lab/bioText';
import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import { siteStepIndex, SITE_STEPS, type SiteStepId } from '@/engine/education/lab/siteText';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import { toolRpyDeg } from '@/engine/robot/tool';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { logRun } from '@/engine/education/runLog';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import { Lines } from '../lesson/Rich';
import { bioBriefCards } from './BioCards';
import BioCell, { BioPlayback, type BioMarker, type BioOverlay } from './BioCell';
import { BioAround, LOOKS } from './ambient/Around';
import type { CellDim } from './CellKit';
import { ArrowDef, Knob, type DeckPlan, PROBS, ProbLock, RecordSheet, SitePanel, ValueLines, answeredUpTo, fmt, freshFlow, useLabStart, type FlowState, type MeasureRow } from './SiteFlow';
import RealUse from './RealUse';
import css from './lab.module.css';
import lg from './site.module.css';
import ViewHint from '../../simulator/ViewHint';

/** The bench from the front right, a little above (three.js metres, y up): camera, then target. */
export const BIO_VIEW: ViewPose = [1.4, 0.95, 0.4, -0.3, 0.2, 0.05];
/**
 * 카드 모드 (문제 ①): the whole bench, both racks and the arm, from in front of the arm — the first
 * view (LearnStage draws it in to 0.78 with the work cell alone).
 */
const BIO_BENCH: ViewPose = [0.98, 0.62, 0.38, 0.08, 0.06, 0];
const SLOW = 0.35;
const SLOW_LEAD_S = 1.6;

interface Runs {
  before: BioRun | null;
  latest: BioRun | null;
}

interface ProbState extends FlowState {
  step: SiteStepId;
  values: BioValues;
  runs: Runs;
}

const fresh = (p: BioProblem): ProbState => ({ ...freshFlow(BIO_TEXT[p]), step: 'brief', values: BIO_DEFAULTS[p], runs: { before: null, latest: null } });

declare global {
  interface Window {
    /** Open a problem of 바이오 at a step, optionally with the worked fix run (and everything before it answered), and the playback at a time or its end (guide pictures, tools/check). */
    __bioOpen?: (step: SiteStepId, opts?: { prob?: BioProblem; solve?: boolean; at?: number | 'end' }) => void;
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
  return [x + 0.3, y + 0.22, z + 0.33, x, y, z];
};
const up = (p: readonly number[], z = LIFT_Z): Mm => [p[0], p[1], z];
/** A tight look at a small thing (the tube): nearer than closeLook. */
const nearLook = (p: Mm): ViewPose => {
  const [x, y, z] = world(p);
  return [x + 0.19, y + 0.11, z + 0.2, x, y, z];
};
/** 카드 모드 · 작업 지시: the same numbers on the cards and in 3D (① 시료 랙 · ② 분석 랙 · ③ 시험관). */
const TUBE_TOP: Mm = [SRC[0], SRC[1], SEAT_Z + TUBE.above];
const BRIEF_TAGS: Record<'src' | 'dst' | 'tube', BioMarker> = {
  src: { key: 'b-src', mm: [SRC[0], SRC[1] + 40, RACK.top], ok: true, text: '① 시료 랙' },
  dst: { key: 'b-dst', mm: [DST[0], DST[1], RACK.top], ok: true, text: '② 분석 랙' },
  tube: { key: 'b-tube', mm: TUBE_TOP, ok: true, text: '③ 시험관' },
};
/** Per brief card: its 3D tags and where the camera looks (null: the first view, the whole bench). */
const BRIEF_CARDS: { tags: (keyof typeof BRIEF_TAGS)[]; view: ViewPose | null }[] = [
  { tags: ['src', 'dst', 'tube'], view: null },
  { tags: ['tube'], view: nearLook(TUBE_TOP) },
  { tags: ['dst'], view: closeLook([DST[0], DST[1], RACK.top]) },
  { tags: [], view: null },
];
const poseText = (x: number, y: number, z: number, o: { yawDeg: number; tiltDeg: number }) => {
  const [rx, ry, rz] = toolRpyDeg(x, y, o);
  return `x ${fmt(x)} · y ${fmt(y)} · z ${fmt(z)} · rx ${fmt(rx)} · ry ${fmt(ry + 0)} · rz ${fmt(rz, 1)}`;
};

/** The tubes before anything has run. */
function startTubes(p: BioProblem): BioFrame['tubes'] {
  const at = (h: Mm) => ({ top: [h[0], h[1], SEAT_Z + TUBE.above] as Mm, bottom: [h[0], h[1], SEAT_Z - BELOW] as Mm, mode: 'rack' as const, left: 1 });
  if (p === 2) return Array.from({ length: ROW.n }, (_, k) => at(trayHole(k)));
  return [at([SRC[0], SRC[1], SEAT_Z])];
}

/* --- 원인 찾기: what to measure, per problem, and how each is drawn in 3D ----------------------- */

interface BioRow extends MeasureRow {
  dim?: CellDim;
  marker?: BioMarker;
  tilt?: boolean;
}

const DIM_OK = '#3454d1';
const DIM_BAD = '#e5484d';

function measureRows(chain: readonly ChainSegment[], prob: BioProblem, run: BioRun | null): BioRow[] {
  const f = run?.failure ?? null;
  if (prob === 1) {
    const v = BIO_DEFAULTS[1] as PoseValues;
    return [
      { label: '집는 자세 (시료 랙)', value: poseText(SRC[0], SRC[1], LIFT_Z, { yawDeg: 0, tiltDeg: 0 }), marker: { key: 'src', mm: up(SRC), ok: true, text: '집는 자세 · ry 0' } },
      { label: '놓는 자세 (작업 프로그램)', value: poseText(DST[0], DST[1], LIFT_Z, { yawDeg: v.yaw, tiltDeg: v.tilt }), bad: true, marker: { key: 'dst', mm: up(DST), ok: false, text: `놓는 자세 · ry −${v.tilt}` } },
      { label: '옮기는 동안 가장 크게 기운 각도', value: `${fmt(run?.maxTilt ?? 0, 1)}°`, bad: true, tilt: true },
      { label: '시료 위 여유 · 시험관 안지름', value: `${HEADSPACE_MM} mm · ${TUBE.inner} mm` },
      { label: '쏟아진 때', value: f ? `${fmt(f.t, 1)} s (옮기는 길의 끝 무렵)` : '—', bad: true },
    ];
  }
  if (prob === 2) {
    const offs = run?.offsets ?? [];
    const row = (k: number): BioRow => {
      const h = rowHole(k);
      const r = Math.hypot(h[0], h[1]);
      const o = offs[k];
      return { label: `${k + 1}번 칸 (몸통에서 ${fmt(r)} mm) 빗나감`, value: o == null ? '—' : `${fmt(o, 2)} mm`, bad: true, marker: { key: `h${k}`, mm: [h[0], h[1], 46], ok: false, text: o == null ? undefined : `${k + 1}번 · ${fmt(o, 1)} mm` } };
    };
    return [
      row(0),
      row(2),
      row(3),
      { label: '빗나간 방향', value: '모두 같은 쪽 (몸통이 시킨 것보다 더 돈 쪽)' },
      { label: '랙 위치 (자로 잰 값) · 같은 칸에 5번 넣은 흩어짐', value: '설계와 같음 · ±0.2 mm' },
    ];
  }
  const at = f?.at ?? null;
  const reach = bioReach(chain, 172);
  return [
    { label: '원심분리기 높이', value: `${CENTRIFUGE.max[2]} mm`, dim: { key: 'cf', a: [CENTRIFUGE.min[0] - 4, CENTRIFUGE.max[1] + 4, 0], b: [CENTRIFUGE.min[0] - 4, CENTRIFUGE.max[1] + 4, CENTRIFUGE.max[2]], text: `${CENTRIFUGE.max[2]} mm`, color: DIM_OK, label: 'l' } },
    {
      label: '들고 가는 높이 (잡는 점) · 그때 시험관 바닥',
      value: `${LIFT_Z} mm · ${LIFT_Z - BELOW} mm`,
      bad: true,
      dim: at ? { key: 'tb', a: [at[0] + 14, at[1], 0], b: [at[0] + 14, at[1], LIFT_Z - BELOW], text: `바닥 ${LIFT_Z - BELOW} mm`, color: DIM_BAD, label: 'r' } : undefined,
    },
    { label: '부딪힌 곳 · 때', value: at && f ? `원심분리기 모서리 (x ${fmt(at[0])}, y ${fmt(at[1])}) · ${fmt(f.t, 1)} s` : '—', bad: true, marker: at ? { key: 'hit', mm: at, ok: false, text: '부딪힌 곳' } : undefined },
    { label: '몸통에서 랙까지', value: `${fmt(Math.hypot(DST[0], DST[1]))} mm`, dim: { key: 'r', a: [0, 0, LIFT_Z], b: up(DST), text: `${fmt(Math.hypot(DST[0], DST[1]))} mm`, color: DIM_OK } },
    { label: '잡는 점 높이 172 mm에서 팔이 닿는 거리', value: `약 ${fmt(reach)} mm`, bad: reach < Math.hypot(DST[0], DST[1]) },
  ];
}

/** Which prediction a run bears out (the index into the problem's predictions). */
function predictionOf(prob: BioProblem, run: BioRun | null): number | null {
  if (!run) return null;
  const s = scoreBio(prob, run);
  if (s.pass) return 0;
  const k = run.failure?.kind;
  if (prob === 1) return k === 'spill' ? 2 : 1;
  if (prob === 2) return k === 'catch' ? 2 : 1;
  return k === 'hit' ? 2 : 1;
}

function valuesText(p: BioProblem, v: BioValues): string {
  if (p === 1) {
    const a = v as PoseValues;
    return `ry −${fmt(a.tilt)} · rz +${fmt(a.yaw)}`;
  }
  if (p === 2) return `J1 영점 보정 ${fmt((v as CalibValues).zero, 1)}°`;
  const c = v as PathValues;
  return `높이 ${fmt(c.lift)}${c.via ? ` · 경유점 (${fmt(c.vx)}, ${fmt(c.vy)}, ${fmt(c.vz)})` : ' · 경유점 없음'}`;
}

export default function BioLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<BioProblem>(1);
  useLabStart('bio', setProb);
  const [st, setSt] = useState<Record<BioProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<BioProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  const [player] = useState(() => new BioPlayback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step, runs } = s;
  // 카드 모드 (시범: 문제 ①만): which card of the step is on screen, so the 3D view shows the same thing.
  const [card, setCard] = useState<{ step: SiteStepId; i: number }>({ step: 'brief', i: 0 });
  const onCard = useCallback((step: SiteStepId, i: number) => setCard({ step, i }), []);
  const deck = useMemo<DeckPlan | undefined>(() => (prob === 1 ? { brief: bioBriefCards(BIO_TEXT[1], '이 연구원'), onCard } : undefined), [prob, onCard]);
  const briefCard = deck && step === 'brief' ? BRIEF_CARDS[card.step === 'brief' ? card.i : 0] : null;

  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);

  const patch = useCallback((p: BioProblem, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
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
    (run: BioRun | null, at: number | 'end' = 0, slowAt: number | null = null) => {
      player.start(run, at, run && run.durationS > 30 ? 2 : 1);
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
      const v = which === 'before' ? BIO_DEFAULTS[p] : st[p].values;
      setBusy(true);
      window.setTimeout(() => {
        const run = runBio(chain, p, v);
        const sc = scoreBio(p, run);
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
        if (which === 'latest') logRun({ lab: 'bio', problem: p, pass: sc.pass, durationS: run.durationS, values: v, checks: sc.checks });
        if (which === 'latest' && sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        setBusy(false);
      }, 30);
    },
    [chain, patch, prob, st],
  );

  /** Which run the 3D view plays in this step. */
  const shown = step === 'run' || step === 'cause' ? runs.before : step === 'compare' || step === 'done' ? runs.latest : null;
  const fail = shown?.failure ?? null;
  const lastShown = useRef<{ run: BioRun | null; step: SiteStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    play(shown, step === 'cause' ? (fail ? fail.t + 0.02 : 'end') : step === 'done' ? 'end' : 0, step === 'run' && fail ? Math.max(0, fail.t - SLOW_LEAD_S) : null);
  }, [shown, step, fail, play]);

  const failAt = fail?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => {
    if (failAt && ((step === 'run' && slow) || step === 'cause')) return closeLook(failAt);
    if (briefCard) return briefCard.view;
    // 카드 모드: the place pose being fixed, up close.
    if (deck && step === 'fix') return closeLook(up(DST));
    return null;
  }, [failAt, step, slow, briefCard, deck]);

  useEffect(() => {
    player.setStill(startTubes(prob));
  }, [player, prob]);

  const fi = shown ? Math.min(shown.frames.length - 1, Math.round(playT / 0.02)) : 0;
  const frame = shown ? shown.frames[fi] : null;
  const rows = useMemo(() => measureRows(chain, prob, runs.before), [chain, prob, runs.before]);

  // 값 고치기 previews: ① the place pose, ② where each tube would land, ③ the route (a dry run).
  const vDeferred = useDeferredValue(s.values);
  const pose1 = useMemo(() => {
    if (prob !== 1 || step !== 'fix') return null;
    const v = vDeferred as PoseValues;
    const q = poseAt(chain, up(DST), { yawDeg: v.yaw, tiltDeg: v.tilt });
    return q ? { q, ...toolAt(chain, q) } : null;
  }, [chain, prob, step, vDeferred]);
  const calib = useMemo(() => (prob === 2 && step === 'fix' ? calibPreview(chain, vDeferred as CalibValues) : null), [chain, prob, step, vDeferred]);
  const route = useMemo(() => (prob === 3 && step === 'fix' ? runPath(chain, vDeferred as PathValues) : null), [chain, prob, step, vDeferred]);

  const overlay = useMemo<BioOverlay>(() => {
    const o: BioOverlay = { markers: [], dims: [] };
    if (briefCard) {
      o.markers = briefCard.tags.map((k) => BRIEF_TAGS[k]);
      return o;
    }
    if (step === 'fix') {
      if (prob === 1 && pose1) {
        const v = s.values as PoseValues;
        const top: Mm = [pose1.tip[0] - pose1.axis[0] * TUBE.above, pose1.tip[1] - pose1.axis[1] * TUBE.above, pose1.tip[2] - pose1.axis[2] * TUBE.above];
        o.tilt = { at: top, axis: pose1.axis, deg: v.tilt, bad: v.tilt >= SPILL_DEG || v.tilt > 3 };
      }
      if (prob === 2 && calib)
        calib.forEach((c, k) => {
          const h = rowHole(k);
          o.markers!.push({ key: `p${k}`, mm: [h[0], h[1], 46], ok: c.offset <= READ_MM, text: `${k + 1}번 · ${fmt(c.offset, 1)} mm` });
        });
      if (prob === 3 && route) o.route = { points: route.tip.filter((_, j) => j % 3 === 0), ok: !route.failure };
      return o;
    }
    if (step === 'cause') {
      for (const r of rows.slice(0, s.meas)) {
        if (r.marker) o.markers!.push(r.marker);
        if (r.dim) o.dims!.push(r.dim);
        if (r.tilt && shown && fail) {
          const fr = shown.frames[Math.min(shown.frames.length - 1, Math.round(fail.t / 0.02))];
          const tb = fr.tubes[0];
          const ax: Mm = [tb.bottom[0] - tb.top[0], tb.bottom[1] - tb.top[1], tb.bottom[2] - tb.top[2]];
          const n = Math.hypot(...ax);
          o.tilt = { at: tb.top, axis: [ax[0] / n, ax[1] / n, ax[2] / n], deg: fr.tilt, bad: true };
        }
      }
      return o;
    }
    if (!shown) return o;
    o.path = shown.tip.slice(Math.max(0, fi - 300), fi + 1).filter((_, j) => j % 2 === 0);
    if (prob === 1 && frame?.tubes[0] && frame.tubes[0].mode === 'held') {
      const tb = frame.tubes[0];
      const ax: Mm = [tb.bottom[0] - tb.top[0], tb.bottom[1] - tb.top[1], tb.bottom[2] - tb.top[2]];
      const n = Math.hypot(...ax);
      o.tilt = { at: tb.top, axis: [ax[0] / n, ax[1] / n, ax[2] / n], deg: frame.tilt, bad: frame.tilt >= SPILL_DEG };
    }
    if (prob === 2)
      shown.events
        .filter((e) => (e.kind === 'place' || e.kind === 'catch') && e.t <= playT + 1e-6 && e.at)
        .forEach((e) => o.markers!.push({ key: `e${e.t}`, mm: [e.at![0], e.at![1], 46], ok: (e.value ?? 0) <= READ_MM, text: `${(e.tube ?? 0) + 1}번 · ${fmt(e.value ?? 0, 1)} mm` }));
    return o;
  }, [prob, step, s.values, s.meas, pose1, calib, route, rows, shown, fail, frame, fi, playT, briefCard]);

  // The arm at rest shows what is being set: ① the place pose, ③ nothing special.
  const scene = useMemo<LearnScene>(() => ({ angles: pose1?.q ?? HOME_Q, tool: 'adaptive', pumpOn: false }), [pose1]);

  const spill = useMemo<Mm | null>(() => {
    if (!shown || shown.failure?.kind !== 'spill' || playT < shown.failure.t) return null;
    const tb = shown.frames[Math.min(shown.frames.length - 1, Math.round(shown.failure.t / 0.02))].tubes[0];
    return [tb.top[0] + 10, tb.top[1], 0];
  }, [shown, playT]);

  // Guide pictures and checks: jump to a problem and step (with the worked fix run, everything before it answered).
  useEffect(() => {
    window.__bioOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      const T = BIO_TEXT[p];
      const before = st[p].runs.before ?? runBio(chain, p, BIO_DEFAULTS[p]);
      let latest = st[p].runs.latest;
      let values = st[p].values;
      let log = st[p].log;
      if (opts.solve) {
        values = BIO_FIXES[p];
        latest = runBio(chain, p, values);
        const sc = scoreBio(p, latest);
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
      delete window.__bioOpen;
    };
  }, [chain, st, prob, patch, play, player]);

  const sb = runs.before ? scoreBio(prob, runs.before) : null;
  const sl = runs.latest ? scoreBio(prob, runs.latest) : null;
  const at = siteStepIndex(step);
  const T = BIO_TEXT[prob];
  const placedNow = shown ? shown.events.filter((e) => e.kind === 'place' && e.t <= playT + 1e-6).length : 0;
  const nTubes = prob === 2 ? ROW.n : 1;

  return (
    <div className={`${css.lab} ${lg.bio}`} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 로봇 시티
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          바이오·헬스케어
          <small>시험관 옮기기</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${BIO_TEXT[p].title} · ${BIO_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{BIO_TEXT[p].title}</span>
              {solved[p] && <i aria-label="해결">✓</i>}
              <ProbLock lab="bio" p={p} />
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

      <section className={css.stage} aria-label="3D 실험대">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={deck ? BIO_BENCH : BIO_VIEW} focus={focus} live={player.arm} look={LOOKS.bio}>
          <BioAround />
          <BioCell player={player} prob={prob} overlay={overlay} tubes={nTubes} spill={spill} />
        </LearnStage>
        {frame?.alarm && fail && <div className={lg.alarm}>⚠ {fail.text}</div>}
        {shown && !shown.failure && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ {scoreBio(prob, shown).headline}</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        {shown && (
          <div className={lg.board} aria-label="작업 현황">
            <div data-c={placedNow === nTubes ? 'ok' : undefined}>
              <small>꽂은 시험관</small>
              <b>
                {placedNow} / {nTubes}
              </b>
            </div>
            {prob === 1 && (
              <div data-c={(frame?.tilt ?? 0) >= SPILL_DEG ? 'bad' : undefined}>
                <small>기울기 (쏟아짐 {fmt(SPILL_DEG)}°)</small>
                <b>{fmt(frame?.tilt ?? 0, 1)}°</b>
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
        <RealUse site="bio" folded={!!deck} />
        <ViewHint className={css.hint} />
      </section>

      <aside className={css.panel} aria-label="실습 안내">
        <SitePanel
          T={T}
          lab="bio"
          st={s}
          boss="이 연구원"
          deck={deck}
          level={level}
          solved={solved[prob]}
          busy={busy}
          order={
            <div className={lg.order}>
              <header>
                작업 기준 <span>{T.order}</span>
              </header>
              <dl>
                <dt>시험관</dt>
                <dd>
                  유리 {TUBE.d} × {TUBE.len} mm{prob === 1 ? ' · 시료 가득 (입구에서 3 mm 아래)' : ''}
                </dd>
                <dt>옮기기</dt>
                <dd>{prob === 2 ? `트레이 → 분석 랙 한 줄 ${ROW.n}칸` : '시료 랙 → 분석 랙 1개'}</dd>
                <dt>기준</dt>
                <dd>{prob === 1 ? '시료를 쏟지 않기' : prob === 2 ? `칸 가운데에서 ${READ_MM} mm 안 (분석기가 읽음)` : '원심분리기 · 랙에 부딪히지 않기'}</dd>
                <dt>도구</dt>
                <dd>
                  <ValueLines text="어댑티브 그리퍼 (손가락 끝까지 112 mm)" />
                </dd>
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
          fixTitle={prob === 1 ? '놓는 자세의 방향을 고쳐요' : prob === 2 ? 'J1 영점을 보정해요' : '길을 바꿔요'}
          hmi={
            <>
              {prob === 1 && <HmiPose v={s.values as PoseValues} on={(values) => patch(prob, { values })} />}
              {prob === 2 && <HmiCalib v={s.values as CalibValues} preview={calib} on={(values) => patch(prob, { values })} />}
              {prob === 3 && <HmiPath v={s.values as PathValues} preview={route} reach172={bioReach(chain, 172)} on={(values) => patch(prob, { values })} />}
            </>
          }
          compare={
            sb &&
            sl && (
              <>
                <CompareTable before={sb} latest={sl} />
                {prob === 2 && runs.latest && <OffsetBars before={runs.before} latest={runs.latest} />}
              </>
            )
          }
          hit={playing ? null : predictionOf(prob, runs.latest)}
          pass={!!sl?.pass}
          notYet={sl && !sl.pass ? sl.headline + '.' : null}
          fig={<PrincipleFig prob={prob} />}
          nextLabel={prob < 3 ? `문제 ${prob + 1} · ${BIO_TEXT[(prob + 1) as BioProblem].title} →` : '로봇 시티로 →'}
          patch={(ch) => patch(prob, ch)}
          onRunBefore={() => go('before')}
          onRunFix={() => go('latest')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as BioProblem) : onBack())}
        />
      </aside>
      {record && <RecordSheet site="바이오·헬스케어 (시험관 옮기기)" tone={lg.bio} texts={BIO_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

function programLine(p: BioProblem): string {
  if (p === 1) return '놓는 자세 [150, −100, 125, −180, −35, −33.7] (붓기 프로그램에서 복사)';
  if (p === 2) return `시료 6개를 몸통에서 ${ROW.r0} ~ ${ROW.r0 + (ROW.n - 1) * ROW.pitch} mm 칸에 차례로 · J1 영점 보정 없음`;
  return `시료 랙에서 집어 ${LIFT_Z} mm 높이로 분석 랙까지 한 번에 관절 이동 · 경유점 없음`;
}

/* --- pieces ---------------------------------------------------------------------------------- */

function Events({ run, onSeek }: { run: BioRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  return (
    <ol className={lg.events} aria-label="작업 기록">
      {run.events.map((e, i) => (
        <li key={i} data-k={e.kind === 'spill' || e.kind === 'hit' || e.kind === 'catch' || e.kind === 'unreachable' ? 'bad' : e.kind === 'place' && (e.value ?? 0) > READ_MM ? 'warn' : undefined}>
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

function CompareTable({ before, latest }: { before: ReturnType<typeof scoreBio>; latest: ReturnType<typeof scoreBio> }) {
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
            <td data-c={before.checks[i]?.ok ? undefined : 'bad'}>{before.checks[i]?.value}</td>
            <td data-c={c.ok ? 'ok' : 'bad'}>{c.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ②: each hole's offset before and after, against the reader's 1 mm and the rim's 3 mm. */
function OffsetBars({ before, latest }: { before: BioRun | null; latest: BioRun }) {
  const top = 4;
  return (
    <div className={lg.measureBox}>
      {latest.offsets.map((o, k) => {
        const b = before?.offsets[k] ?? null;
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 64px', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span>{k + 1}번 칸</span>
            <div style={{ position: 'relative', height: 12, background: '#f2f4f7', borderRadius: 6 }}>
              {b !== null && <i style={{ position: 'absolute', left: 0, top: 0, bottom: 6, width: `${(Math.min(b, top) / top) * 100}%`, background: '#f4b4b0', borderRadius: 3 }} />}
              {o !== null && <i style={{ position: 'absolute', left: 0, top: 6, bottom: 0, width: `${(Math.min(o, top) / top) * 100}%`, background: o <= READ_MM ? '#1f9d55' : '#e5484d', borderRadius: 3 }} />}
              <s style={{ position: 'absolute', left: `${(READ_MM / top) * 100}%`, top: -2, bottom: -2, borderLeft: '2px dashed #1f7a45' }} />
              <s style={{ position: 'absolute', left: `${(CATCH_MM / top) * 100}%`, top: -2, bottom: -2, borderLeft: '2px dashed #e5484d' }} />
            </div>
            <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o === null ? '—' : `${fmt(o, 1)} mm`}</b>
          </div>
        );
      })}
      <small className={lg.hmiNote} style={{ color: 'var(--muted)' }}>
        위 칸 (분홍): 처음 · 아래 칸: 지금 · 초록 점선 1 mm (분석기) · 빨간 점선 3 mm (걸림)
      </small>
    </div>
  );
}

/* --- 값 고치기: the operator panels ------------------------------------------------------------ */

function HmiPose({ v, on }: { v: PoseValues; on(v: PoseValues): void }) {
  const [rx, ry, rz] = toolRpyDeg(DST[0], DST[1], { yawDeg: v.yaw, tiltDeg: v.tilt });
  const spill = v.tilt >= SPILL_DEG;
  const fits = v.tilt <= 3;
  return (
    <div className={lg.hmi}>
      <header>
        <span>PLACE POSE · 놓는 자세</span>
        <i>● 위치 고정 ({DST[0]}, {DST[1]}, {LIFT_Z})</i>
      </header>
      <Knob id="bio-ry" label="ry (앞뒤로 기울기)" unit="°" v={-v.tilt} min={-45} max={0} note="시험관이 몸통 반대쪽으로 기우는 정도 (0 = 곧게)" on={(x) => on({ ...v, tilt: -x })} />
      <Knob id="bio-rz" label="rz 더 돌리기" unit="°" v={v.yaw} min={-90} max={90} step={5} note="시험관 축 둘레로 돌리기" on={(yaw) => on({ ...v, yaw })} />
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>보낼 좌표</td>
            <td>
              [{DST[0]}, {DST[1]}, {LIFT_Z}, {fmt(rx)}, {fmt(ry + 0)}, {fmt(rz, 1)}]
            </td>
          </tr>
          <tr>
            <td>쏟아지는 각도 {fmt(SPILL_DEG)}°와 비교</td>
            <td data-c={spill ? 'press' : 'ok'}>{spill ? '쏟아요' : '쏟지 않아요'}</td>
          </tr>
          <tr>
            <td>랙 구멍에 들어가나 (곧게)</td>
            <td data-c={fits ? 'ok' : 'press'}>{fits ? '들어가요' : '안 들어가요'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function HmiCalib({ v, preview, on }: { v: CalibValues; preview: { r: number; offset: number }[] | null; on(v: CalibValues): void }) {
  return (
    <div className={lg.hmi}>
      <header>
        <span>CALIBRATION · J1 영점</span>
        <i>● 명령 = 원하는 각도 − 보정</i>
      </header>
      <Knob id="bio-zero" label="J1 영점 보정" unit="°" v={v.zero} min={-2} max={2} step={0.1} note="J1에 보내는 모든 각도에서 이만큼 빼요" on={(zero) => on({ zero: Math.round(zero * 10) / 10 })} />
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>칸</th>
            <th>몸통에서</th>
            <th>예상 빗나감</th>
          </tr>
        </thead>
        <tbody>
          {(preview ?? []).map((c, k) => (
            <tr key={k}>
              <td>{k + 1}번</td>
              <td>{fmt(c.r)} mm</td>
              <td data-c={c.offset <= READ_MM ? 'ok' : c.offset > CATCH_MM ? 'press' : 'drop'}>
                {fmt(c.offset, 1)} mm{c.offset > CATCH_MM ? ' · 걸림' : c.offset > READ_MM ? ' · 기준 밖' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className={lg.hmiNote}>실제 J1은 시킨 것보다 {J1_ERR_DEG > 0 ? '더' : '덜'} 돌아요. 얼마나인지는 원인 찾기의 숫자로 계산해요.</small>
    </div>
  );
}

function HmiPath({ v, preview, reach172, on }: { v: PathValues; preview: BioRun | null; reach172: number; on(v: PathValues): void }) {
  const f = preview?.failure ?? null;
  const set = (k: keyof PathValues) => (x: number) => on({ ...v, [k]: x });
  return (
    <div className={lg.hmi}>
      <header>
        <span>PATH · 들고 가는 길</span>
        <i>● 원심분리기 높이 {CENTRIFUGE.max[2]}</i>
      </header>
      <Knob id="bio-lift" label="들고 가는 높이 (잡는 점)" unit="mm" v={v.lift} min={100} max={180} note={`시험관 바닥 = 높이 − ${BELOW} · 172 mm에서 닿는 거리 약 ${fmt(reach172)} mm`} on={set('lift')} />
      <div className={lg.jog}>
        <button type="button" aria-pressed={v.via} onClick={() => on({ ...v, via: !v.via })} style={v.via ? { borderColor: '#6fe3a5', color: '#6fe3a5' } : undefined}>
          {v.via ? '✓ 경유점 사용' : '경유점 없음 (누르면 사용)'}
        </button>
      </div>
      {v.via && (
        <>
          <Knob id="bio-vx" label="경유점 x (앞)" unit="mm" v={v.vx} min={40} max={180} note="원심분리기는 x 150부터" on={set('vx')} />
          <Knob id="bio-vy" label="경유점 y (왼쪽 +)" unit="mm" v={v.vy} min={-80} max={80} note="두 랙 사이 가운데가 y 0" on={set('vy')} />
          <Knob id="bio-vz" label="경유점 z (높이)" unit="mm" v={v.vz} min={100} max={180} note="잡는 점의 높이" on={set('vz')} />
        </>
      )}
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>미리 보기 (길 전체 검사)</td>
            <td data-c={f ? 'press' : 'ok'}>{!preview ? '…' : f ? (f.kind === 'unreachable' ? '손이 닿지 않아요' : '부딪혀요') : '부딪히지 않아요'}</td>
          </tr>
          <tr>
            <td>원심분리기와 가장 가까운 거리</td>
            <td data-c={preview && Number.isFinite(preview.minClear) && preview.minClear < 10 ? 'drop' : undefined}>{preview && Number.isFinite(preview.minClear) ? `${fmt(Math.max(0, preview.minClear), 1)} mm` : '—'}</td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>3D 화면의 점선이 잡는 점이 지나갈 길이에요 (초록: 괜찮음, 빨강: 문제).</small>
    </div>
  );
}

/* --- 해결 · 원리: the principle figure, per problem --------------------------------------------- */

function PrincipleFig({ prob }: { prob: BioProblem }) {
  if (prob === 1) {
    // A straight tube and a tube tilted past its spill angle: the surface stays level, reaches the rim.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="기울기가 쏟아지는 각도를 넘으면 수면이 입구에 닿는다">
        <rect x={40} y={14} width={20} height={84} rx={8} className={lg.figOld} />
        <rect x={42} y={22} width={16} height={74} rx={6} className={lg.figBox} />
        <text x={30} y={108} className={lg.figTxt}>
          곧게 (0°)
        </text>
        <g transform="rotate(35 170 96)">
          <rect x={160} y={14} width={20} height={84} rx={8} className={lg.figOld} />
        </g>
        <polygon points="150,92 186,92 196,48 140,74" className={lg.figBox} />
        <line x1={128} x2={210} y1={50} y2={50} className={lg.figGuide} />
        <text x={210} y={46} className={lg.figTxt}>
          수면은 수평
        </text>
        <text x={150} y={108} className={lg.figTxt}>
          35° → 넘침
        </text>
        <text x={226} y={88} className={lg.figStrong}>
          tan θ = 2h ÷ d
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    // The same small angle error, seen at a near hole and a far one.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="같은 각도 오차가 먼 칸에서 더 큰 거리 오차가 된다">
        <circle cx={24} cy={90} r={8} className={lg.figCup} />
        <line x1={24} x2={290} y1={90} y2={90} className={lg.figArrow} />
        <line x1={24} x2={288} y1={90} y2={62} className={lg.figUp} strokeDasharray="4 3" />
        {[120, 200, 280].map((x) => (
          <g key={x}>
            <circle cx={x} cy={90} r={6} className={lg.figMarkOld} />
            <line x1={x} x2={x} y1={90} y2={90 - ((x - 24) * 28) / 264} className={lg.figArrow} />
          </g>
        ))}
        <text x={96} y={106} className={lg.figTxt}>
          가까운 칸
        </text>
        <text x={256} y={106} className={lg.figTxt}>
          먼 칸
        </text>
        <text x={40} y={40} className={lg.figStrong}>
          빗나감 = r × δθ
        </text>
        <text x={40} y={56} className={lg.figTxt}>
          명령 (실선) · 실제 (점선, J1 1° 더)
        </text>
        <ArrowDef />
      </svg>
    );
  }
  // Seen from above: the two racks, the centrifuge, the swing that hits it and the way round.
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="관절 이동의 호가 원심분리기를 지나고, 경유점으로 돌아가면 피한다">
      <circle cx={30} cy={55} r={9} className={lg.figCup} />
      <rect x={150} y={8} width={26} height={22} rx={3} className={lg.figPalTop} />
      <rect x={150} y={80} width={26} height={22} rx={3} className={lg.figPalTop} />
      <rect x={168} y={42} width={44} height={26} rx={5} className={lg.figOld} />
      <path d="M163,19 Q 215,55 163,91" className={lg.figArrow} fill="none" stroke="#e5484d" />
      <path d="M163,19 L 95,55 L 163,91" className={lg.figUp} fill="none" />
      <circle cx={95} cy={55} r={4} className={lg.figMark} />
      <text x={186} y={58} className={lg.figTxt}>
        원심분리기
      </text>
      <text x={60} y={74} className={lg.figTxt}>
        경유점
      </text>
      <text x={222} y={30} className={lg.figStrong}>
        길 전체를 검사
      </text>
      <ArrowDef />
    </svg>
  );
}
