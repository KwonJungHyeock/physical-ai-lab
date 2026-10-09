'use client';

/**
 * 산업단지 · 스마트팜 — 방울토마토 선별 (myCobot 280 RDK X5 + 어댑티브 그리퍼 + USB 카메라, real
 * size). The same screen and six steps as the other sites (SitePanel; the lesson script is
 * content-markdown/sites/farm.md), the cell in the 교육 3D view (LearnStage, the real arm with the
 * official gripper), the engine's runs played back (FarmCell), and the camera's own picture beside it
 * (CamView: the photo, the program's mask, what it found):
 *
 *  ① 덜 익은 것도 딴다 — the hue range (문턱값);
 *  ② 카메라와 손끝이 안 맞는다 — the mm-per-pixel ratio after the camera was raised (카메라 보정);
 *  ③ 물러서 터진다 — how hard and how fast the fingers close (마찰 · 힘 제한과 안전 여유).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  CAM,
  FARM_DEFAULTS,
  FARM_FIXES,
  FARM_TOMATOES,
  GAP_OPEN,
  MARKER,
  OVERSHOOT_PER_SPEED,
  RATIO_NOW,
  RATIO_OLD,
  RIPE_RANGE,
  SAFE_SHARE,
  TOMATO,
  TRAY,
  cameraPicture,
  findTomatoes,
  gripPreview,
  hueMask,
  markerPixels,
  measuredHue,
  ratioPreview,
  runFarm,
  scoreFarm,
  toHsv,
  toPixel,
  tomatoGrams,
  type FarmProblem,
  type FarmRun,
  type FarmValues,
  type GripValues,
  type HsvPicture,
  type HueValues,
  type Picture,
  type RatioValues,
} from '@/engine/education/lab/farm';
import { FARM_TEXT } from '@/engine/education/lab/farmText';
import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import { siteStepIndex, SITE_STEPS, type SiteStepId } from '@/engine/education/lab/siteText';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import FarmCell, { FarmPlayback, type FarmMarker, type FarmOverlay } from './FarmCell';
import { FarmAround, LOOKS } from './ambient/Around';
import type { CellDim } from './CellKit';
import { ArrowDef, Knob, PROBS, RecordSheet, SitePanel, answeredUpTo, fmt, freshFlow, type FlowState, type MeasureRow } from './SiteFlow';
import css from './lab.module.css';
import lg from './site.module.css';

/** The cell from the front right, a little above (three.js metres, y up): camera, then target. */
const FARM_VIEW: ViewPose = [0.74, 0.6, 0.6, 0.13, 0.1, -0.02];
const SLOW = 0.35;
const SLOW_LEAD_S = 1.6;

interface Runs {
  before: FarmRun | null;
  latest: FarmRun | null;
}

interface ProbState extends FlowState {
  step: SiteStepId;
  values: FarmValues;
  runs: Runs;
}

const fresh = (p: FarmProblem): ProbState => ({ ...freshFlow(FARM_TEXT[p]), step: 'brief', values: FARM_DEFAULTS[p], runs: { before: null, latest: null } });

declare global {
  interface Window {
    /** Open a problem of 스마트팜 at a step, optionally with the worked fix run (and everything before it answered), and the playback at a time or its end (guide pictures, tools/check). */
    __farmOpen?: (step: SiteStepId, opts?: { prob?: FarmProblem; solve?: boolean; at?: number | 'end' }) => void;
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
  return [x + 0.26, y + 0.2, z + 0.28, x, y, z];
};
const zOf = (d: number) => TRAY.top + d / 2;

/** The tomatoes before anything has run. */
const startTomatoes = (p: FarmProblem) => FARM_TOMATOES[p].map((t) => ({ c: [t.x, t.y, zOf(t.d)] as Mm, mode: 'tray' as const }));

/** The camera's picture of a problem's tray, and its HSV (made once). */
const pictures = new Map<FarmProblem, { pic: Picture; hsv: HsvPicture }>();
function pictureOf(p: FarmProblem) {
  let x = pictures.get(p);
  if (!x) {
    const pic = cameraPicture(FARM_TOMATOES[p]);
    x = { pic, hsv: toHsv(pic) };
    pictures.set(p, x);
  }
  return x;
}

/* --- 원인 찾기: what to measure, per problem, and how each is drawn in 3D ----------------------- */

interface FarmRow extends MeasureRow {
  dim?: CellDim;
  markers?: FarmMarker[];
}

const DIM_OK = '#3454d1';

function measureRows(prob: FarmProblem, run: FarmRun | null): FarmRow[] {
  const list = FARM_TOMATOES[prob];
  if (prob === 1) {
    const { hsv } = pictureOf(1);
    const hue = list.map((t) => measuredHue(hsv, t));
    const mk = (ks: number[], ok: boolean) => ks.map((k) => ({ key: `h${k}`, mm: [list[k].x, list[k].y, zOf(list[k].d) + 16] as Mm, ok, text: `${k + 1}번 · ${fmt(hue[k])}°` }));
    const ripe = list.map((t, k) => (t.ripe ? k : -1)).filter((k) => k >= 0);
    const turning = list.map((t, k) => (!t.ripe && t.hue < 60 ? k : -1)).filter((k) => k >= 0);
    const green = list.map((t, k) => (t.hue >= 60 ? k : -1)).filter((k) => k >= 0);
    const v = FARM_DEFAULTS[1] as HueValues;
    return [
      { label: `익은 토마토 색상 (${ripe.map((k) => `${k + 1}번`).join(' · ')})`, value: ripe.map((k) => `${fmt(hue[k])}°`).join(' · '), markers: mk(ripe, true) },
      { label: `주황빛 토마토 색상 (${turning.map((k) => `${k + 1}번`).join(' · ')})`, value: turning.map((k) => `${fmt(hue[k])}°`).join(' · '), bad: true, markers: mk(turning, false) },
      { label: `푸른 토마토 색상 (${green.map((k) => `${k + 1}번`).join(' · ')})`, value: green.map((k) => `${fmt(hue[k])}°`).join(' · '), markers: mk(green, true) },
      { label: '프로그램의 색상 범위 (파프리카용)', value: `${fmt(v.lo)}° ~ ${fmt(v.hi)}°`, bad: true },
      { label: '사진에서 찾은 덩어리 → 담은 것', value: run ? `${run.found.length}개 → 익은 것 ${run.ripePacked} · 덜 익은 것 ${run.unripePacked}` : '—', bad: true },
    ];
  }
  if (prob === 2) {
    const prev = ratioPreview((FARM_DEFAULTS[2] as RatioValues).ratio);
    const row = (k: number): FarmRow => {
      const t = list[k];
      const p = prev.find((x) => x.k === k);
      const pk = run?.picks.find((x) => x.k === k);
      const off = pk?.offset ?? p?.offset ?? NaN;
      const press = run?.failure?.kind === 'press' && run.failure.tomato === k;
      return { label: `${k + 1}번 (사진 가운데에서 ${fmt(p?.r ?? 0)} mm) 어긋남`, value: `${fmt(off, 1)} mm${press ? ' — 손가락이 토마토를 누름' : ''}`, bad: off > 3, markers: [{ key: `o${k}`, mm: [t.x, t.y, zOf(t.d) + 16], ok: off <= 3, text: `${k + 1}번 · ${fmt(off, 1)} mm` }] };
    };
    const [m1, m2] = markerPixels();
    return [
      row(0),
      row(1),
      row(3),
      {
        label: '카메라 높이 (책상에서)',
        value: `${CAM.z} mm — 어제 ${CAM.zOld} mm에서 올림`,
        bad: true,
        dim: { key: 'cz', a: [CAM.x - 50, CAM.y, TRAY.top], b: [CAM.x - 50, CAM.y, CAM.z], text: `트레이 면에서 ${CAM.z - TRAY.top} mm`, color: DIM_OK, label: 'l' },
      },
      { label: '마커 두 개: 실제 거리 · 사진에서 거리', value: `${MARKER.span} mm · ${fmt(Math.hypot(m2.u - m1.u, m2.v - m1.v))} px`, markers: [] },
    ];
  }
  const k0 = 0;
  const t = list[k0];
  const g = gripPreview(FARM_DEFAULTS[3] as GripValues).find((x) => x.k === k0)!;
  const v = FARM_DEFAULTS[3] as GripValues;
  return [
    { label: '1번 토마토 실제 지름 · 카메라가 잰 지름', value: `${fmt(t.d)} mm · ${fmt(g.dSeen, 1)} mm`, markers: [{ key: 'd', mm: [t.x, t.y, zOf(t.d) + 18], ok: true, text: `1번 · 지름 ${t.d} mm` }] },
    { label: `그리퍼가 닫는 목표 (카메라 지름 − ${v.squeeze})`, value: `${fmt(g.target, 1)} mm (실제로 누른 깊이 ${fmt(g.still, 1)} mm)` },
    { label: `넘쳐 닫힌 양 (속도 ${v.speed})`, value: `${fmt(g.over, 1)} mm`, bad: true },
    { label: '최대 힘 · 터지는 힘', value: `${fmt(g.peak, 1)} N · ${TOMATO.burst} N`, bad: true },
    { label: `들어 올리는 데 필요한 힘 (${fmt(tomatoGrams(t), 1)} g, μ ${TOMATO.mu}, 가속 ${TOMATO.liftAcc} m/s²)`, value: `${fmt(g.need, 2)} N` },
  ];
}

/** Which prediction a run bears out (the index into the problem's predictions). */
function predictionOf(prob: FarmProblem, run: FarmRun | null): number | null {
  if (!run) return null;
  const s = scoreFarm(prob, run);
  if (s.pass) return 0;
  if (prob === 1) return run.unripePacked > 0 ? 2 : 1;
  const k = run.events.find((e) => ['press', 'burst', 'slip'].includes(e.kind))?.kind;
  if (prob === 2) return k === 'press' ? 2 : 1;
  return k === 'burst' ? 2 : 1;
}

function valuesText(p: FarmProblem, v: FarmValues): string {
  if (p === 1) {
    const a = v as HueValues;
    return `색상 ${fmt(a.lo)}° ~ ${fmt(a.hi)}°`;
  }
  if (p === 2) return `비율 ${(v as RatioValues).ratio.toFixed(3)} mm/px`;
  const c = v as GripValues;
  return `누르기 ${fmt(c.squeeze, 1)} mm · 속도 ${fmt(c.speed)}`;
}

export default function FarmLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<FarmProblem>(1);
  const [st, setSt] = useState<Record<FarmProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<FarmProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  const [player] = useState(() => new FarmPlayback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step, runs } = s;

  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);

  const patch = useCallback((p: FarmProblem, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
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
    (run: FarmRun | null, at: number | 'end' = 0, slowAt: number | null = null, hold = false) => {
      player.start(run, at, run && run.durationS > 30 ? 2 : 1);
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
      const v = which === 'before' ? FARM_DEFAULTS[p] : st[p].values;
      setBusy(true);
      window.setTimeout(() => {
        const run = runFarm(chain, p, v);
        const sc = scoreFarm(p, run);
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
        if (which === 'latest' && sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        setBusy(false);
      }, 30);
    },
    [chain, patch, prob, st],
  );

  /** Which run the 3D view plays in this step. */
  const shown = step === 'run' || step === 'cause' ? runs.before : step === 'compare' || step === 'done' ? runs.latest : null;
  const fail = shown?.failure ?? null;
  const lastShown = useRef<{ run: FarmRun | null; step: SiteStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    // ① 원인 찾기 measures the tomatoes on the tray: the run held at its start.
    const hold = prob === 1 && step === 'cause';
    play(shown, step === 'cause' ? (hold ? 0 : fail ? fail.t + 0.02 : 'end') : step === 'done' ? 'end' : 0, step === 'run' && fail ? Math.max(0, fail.t - SLOW_LEAD_S) : null, hold);
  }, [shown, step, fail, play, prob]);

  const failAt = fail?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => (failAt && ((step === 'run' && slow) || step === 'cause') ? closeLook(failAt) : null), [failAt, step, slow]);

  useEffect(() => {
    player.setStill(startTomatoes(prob));
  }, [player, prob]);

  const fi = shown ? Math.min(shown.frames.length - 1, Math.round(playT / 0.02)) : 0;
  const frame = shown ? shown.frames[fi] : null;
  const rows = useMemo(() => measureRows(prob, runs.before), [prob, runs.before]);

  // 값 고치기 previews: ① the mask, ② where each tomato's fingers would land, ③ each tomato's grip.
  const vDeferred = useDeferredValue(s.values);
  const ratioPrev = useMemo(() => (prob === 2 && step === 'fix' ? ratioPreview((vDeferred as RatioValues).ratio) : null), [prob, step, vDeferred]);
  const gripPrev = useMemo(() => (prob === 3 && step === 'fix' ? gripPreview(vDeferred as GripValues) : null), [prob, step, vDeferred]);

  /** What the camera window shows: ① the range being set (or the run's), ②③ the program's. */
  const camRange: HueValues = prob === 1 ? (step === 'fix' ? (vDeferred as HueValues) : ((shown?.values as HueValues | undefined) ?? (FARM_DEFAULTS[1] as HueValues))) : RIPE_RANGE;

  const overlay = useMemo<FarmOverlay>(() => {
    const o: FarmOverlay = { markers: [], dims: [], view: true };
    const list = FARM_TOMATOES[prob];
    if (step === 'fix') {
      if (prob === 2 && ratioPrev)
        ratioPrev.forEach((c) => {
          const t = list[c.k];
          o.markers!.push({ key: `p${c.k}`, mm: [t.x, t.y, zOf(t.d) + 16], ok: c.offset <= 5, text: `${c.k + 1}번 · ${fmt(c.offset, 1)} mm` });
        });
      if (prob === 3 && gripPrev)
        gripPrev.forEach((g) => {
          const t = list[g.k];
          const ok = g.hold >= g.need && g.peak <= TOMATO.burst * SAFE_SHARE;
          o.markers!.push({ key: `g${g.k}`, mm: [t.x, t.y, zOf(t.d) + 16], ok, text: `${g.k + 1}번 · ${fmt(g.peak, 1)} N` });
        });
      return o;
    }
    if (step === 'cause') {
      for (const r of rows.slice(0, s.meas)) {
        if (r.markers) o.markers!.push(...r.markers);
        if (r.dim) o.dims!.push(r.dim);
      }
      if (fail?.at) o.markers!.push({ key: 'fail', mm: fail.at, ok: false });
      return o;
    }
    if (!shown) return o;
    o.path = shown.tip.slice(Math.max(0, fi - 300), fi + 1).filter((_, j) => j % 2 === 0);
    if (prob === 1)
      shown.events
        .filter((e) => e.kind === 'unripe' && e.t <= playT + 1e-6 && e.at)
        .forEach((e) => o.markers!.push({ key: `u${e.t}`, mm: [e.at![0], e.at![1], e.at![2] + 16], ok: false, text: `${(e.tomato ?? 0) + 1}번 · 덜 익음 ${fmt(e.value ?? 0)}°` }));
    if (prob === 2)
      shown.events
        .filter((e) => (e.kind === 'grip' || e.kind === 'press') && e.t <= playT + 1e-6 && e.at)
        .forEach((e) => o.markers!.push({ key: `e${e.t}`, mm: [e.at![0], e.at![1], e.at![2] + 16], ok: (e.value ?? 0) <= 5, text: `${(e.tomato ?? 0) + 1}번 · ${fmt(e.value ?? 0, 1)} mm` }));
    return o;
  }, [prob, step, s.meas, ratioPrev, gripPrev, rows, shown, fail, fi, playT]);

  const scene = useMemo<LearnScene>(() => ({ angles: HOME_Q, tool: 'adaptive', pumpOn: false }), []);

  // Guide pictures and checks: jump to a problem and step (with the worked fix run, everything before it answered).
  useEffect(() => {
    window.__farmOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      const T = FARM_TEXT[p];
      const before = st[p].runs.before ?? runFarm(chain, p, FARM_DEFAULTS[p]);
      let latest = st[p].runs.latest;
      let values = st[p].values;
      let log = st[p].log;
      if (opts.solve) {
        values = FARM_FIXES[p];
        latest = runFarm(chain, p, values);
        const sc = scoreFarm(p, latest);
        log = [...log, { time: '—', values: valuesText(p, values), pass: sc.pass, note: sc.headline }];
        if (sc.pass) setSolved((x) => ({ ...x, [p]: true }));
      }
      setProb(p);
      patch(p, (x) => ({ ...answeredUpTo(T, x, siteStepIndex(step), measureRows(p, before).length, !!opts.solve), values, log, runs: { before, latest }, step }));
      if (opts.at !== undefined) {
        const at = opts.at;
        window.setTimeout(() => {
          if (player.run) play(player.run, at);
        }, 120);
      }
    };
    return () => {
      delete window.__farmOpen;
    };
  }, [chain, st, prob, patch, play, player]);

  const sb = runs.before ? scoreFarm(prob, runs.before) : null;
  const sl = runs.latest ? scoreFarm(prob, runs.latest) : null;
  const at = siteStepIndex(step);
  const T = FARM_TEXT[prob];
  const placedNow = shown ? shown.events.filter((e) => e.kind === 'place' && e.t <= playT + 1e-6) : [];
  const packedNow = placedNow.length;
  const unripeNow = placedNow.filter((e) => !FARM_TOMATOES[prob][e.tomato ?? 0].ripe).length;
  const goal = prob === 1 ? FARM_TOMATOES[1].filter((t) => t.ripe).length : FARM_TOMATOES[prob].length;

  return (
    <div className={`${css.lab} ${lg.farm}`} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 산업단지
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          스마트팜
          <small>토마토 선별</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${FARM_TEXT[p].title} · ${FARM_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{FARM_TEXT[p].title}</span>
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

      <section className={css.stage} aria-label="3D 선별장">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={FARM_VIEW} focus={focus} live={player.arm} look={LOOKS.farm}>
          <FarmAround />
          <FarmCell player={player} prob={prob} tomatoes={FARM_TOMATOES[prob]} overlay={overlay} />
        </LearnStage>
        {frame?.alarm && fail && <div className={lg.alarm}>⚠ {fail.text.replace(/ — 작업 중지$/, '')}</div>}
        {!frame?.alarm && prob === 1 && shown && fail && playT >= fail.t && <div className={lg.alarm}>⚠ {fail.text}</div>}
        {shown && !fail && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ {scoreFarm(prob, shown).headline}</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        <CamView prob={prob} range={camRange} ratio={prob === 2 ? (step === 'fix' ? (vDeferred as RatioValues).ratio : ((shown?.values as RatioValues | undefined)?.ratio ?? RATIO_OLD)) : RATIO_NOW} markers={prob === 2} sizes={prob === 3} />
        {shown && (
          <div className={lg.board} aria-label="작업 현황">
            <div data-c={packedNow - unripeNow === goal ? 'ok' : undefined}>
              <small>{prob === 1 ? '담은 익은 토마토' : '담은 토마토'}</small>
              <b>
                {packedNow - unripeNow} / {goal}
              </b>
            </div>
            {prob === 1 && (
              <div data-c={unripeNow ? 'bad' : undefined}>
                <small>담은 덜 익은 것</small>
                <b>{unripeNow}</b>
              </div>
            )}
            {prob === 3 && (
              <div data-c={(frame?.force ?? 0) >= TOMATO.burst * SAFE_SHARE ? 'bad' : undefined}>
                <small>잡는 힘 (터짐 {TOMATO.burst} N)</small>
                <b>{fmt(frame?.force ?? 0, 1)} N</b>
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
        <p className={css.hint}>끌어서 돌려 보기 · 휠로 확대</p>
      </section>

      <aside className={css.panel} aria-label="실습 안내">
        <SitePanel
          T={T}
          st={s}
          boss="최 팀장"
          level={level}
          solved={solved[prob]}
          busy={busy}
          order={
            <div className={lg.order}>
              <header>
                작업 기준 <span>{T.order}</span>
              </header>
              <dl>
                <dt>토마토</dt>
                <dd>방울토마토 지름 25 ~ 29 mm{prob === 3 ? ' · 완숙 (6 N이면 터짐)' : ''}</dd>
                <dt>옮기기</dt>
                <dd>선별 트레이 → 포장 용기 (카메라로 찾아서)</dd>
                <dt>기준</dt>
                <dd>{prob === 1 ? '익은 것만 모두 담기' : prob === 2 ? '손가락 가운데로 잡기 (5 mm 안)' : `터뜨리지 않고 · 떨어뜨리지 않고 · 최대 힘 ${fmt(TOMATO.burst * SAFE_SHARE, 1)} N 이하`}</dd>
                <dt>장비</dt>
                <dd>어댑티브 그리퍼 (열림 {GAP_OPEN} mm) · USB 카메라 (트레이 위)</dd>
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
          fixTitle={prob === 1 ? '색상 범위를 고쳐요' : prob === 2 ? '비율을 다시 재서 넣어요' : '잡는 힘을 고쳐요'}
          hmi={
            <>
              {prob === 1 && <HmiHue v={s.values as HueValues} on={(values) => patch(prob, { values })} />}
              {prob === 2 && <HmiRatio v={s.values as RatioValues} preview={ratioPrev} on={(values) => patch(prob, { values })} />}
              {prob === 3 && <HmiGrip v={s.values as GripValues} preview={gripPrev} on={(values) => patch(prob, { values })} />}
            </>
          }
          compare={
            sb &&
            sl && (
              <>
                <CompareTable before={sb} latest={sl} />
                {prob === 3 && runs.latest && <ForceBars before={runs.before} latest={runs.latest} />}
              </>
            )
          }
          hit={playing ? null : predictionOf(prob, runs.latest)}
          pass={!!sl?.pass}
          notYet={sl && !sl.pass ? sl.headline + '.' : null}
          fig={<PrincipleFig prob={prob} />}
          nextLabel={prob < 3 ? `문제 ${prob + 1} · ${FARM_TEXT[(prob + 1) as FarmProblem].title} →` : '산업단지로 →'}
          patch={(ch) => patch(prob, ch)}
          onRunBefore={() => go('before')}
          onRunFix={() => go('latest')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as FarmProblem) : onBack())}
        />
      </aside>
      {record && <RecordSheet site="스마트팜 (토마토 선별)" tone={lg.farm} texts={FARM_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

function programLine(p: FarmProblem): string {
  if (p === 1) return '사진 → 색상 −10° ~ 40° 마스크 → 덩어리마다 집어 포장 — 지난 시즌 파프리카 프로그램 그대로';
  if (p === 2) return `x = (v − 240) × ${RATIO_OLD.toFixed(3)} + ${CAM.x} · y = (u − 320) × ${RATIO_OLD.toFixed(3)} + ${CAM.y} — 비율은 카메라 ${CAM.zOld} mm 때 잰 값`;
  return '닫는 목표 = 카메라 지름 − 3 mm · 그리퍼 속도 100';
}

/* --- the camera window -------------------------------------------------------------------------- */

/** The part of the picture the window shows: the tray and a margin, px (u right = +y, v down = +x). */
const ROI = (() => {
  const a = toPixel(TRAY.x - TRAY.sx / 2, TRAY.y - TRAY.sy / 2, TRAY.top);
  const b = toPixel(TRAY.x + TRAY.sx / 2, TRAY.y + TRAY.sy / 2, TRAY.top);
  const pad = 14;
  return { u0: Math.floor(a.u - pad), v0: Math.floor(a.v - pad), u1: Math.ceil(b.u + pad), v1: Math.ceil(b.v + pad) };
})();

/** The camera's picture, the program's mask over it, what it found (boxes, centres), ② the markers, ③ the diameters read. */
function CamView({ prob, range, ratio, markers, sizes }: { prob: FarmProblem; range: HueValues; ratio: number; markers: boolean; sizes: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'photo' | 'mask'>('mask');
  const [open, setOpen] = useState(true);
  const { pic, hsv } = pictureOf(prob);
  const found = useMemo(() => findTomatoes(hsv, range, ratio, FARM_TOMATOES[prob]), [hsv, range, ratio, prob]);

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.setTransform(1, 0, 0, 1, -ROI.u0, -ROI.v0);
    const img = g.createImageData(pic.width, pic.height);
    const mask = mode === 'mask' ? hueMask(hsv, range) : null;
    for (let i = 0; i < pic.width * pic.height; i += 1) {
      const k = mask && !mask[i] ? 0.28 : 1;
      img.data[i * 4] = pic.data[i * 4] * k;
      img.data[i * 4 + 1] = pic.data[i * 4 + 1] * k;
      img.data[i * 4 + 2] = pic.data[i * 4 + 2] * k;
      img.data[i * 4 + 3] = 255;
      if (mask && mask[i]) {
        img.data[i * 4] = 255;
        img.data[i * 4 + 1] = 255;
        img.data[i * 4 + 2] = 255;
      }
    }
    g.putImageData(img, -ROI.u0, -ROI.v0);
    g.lineWidth = 3;
    g.font = '800 22px system-ui, sans-serif';
    for (const f of found) {
      const r = f.region;
      const t = FARM_TOMATOES[prob][f.k];
      const ok = !!t && t.ripe;
      g.strokeStyle = ok ? '#32d583' : '#ff6b6b';
      g.strokeRect(r.u0 - 2, r.v0 - 2, r.u1 - r.u0 + 4, r.v1 - r.v0 + 4);
      g.beginPath();
      g.moveTo(r.u - 7, r.v);
      g.lineTo(r.u + 7, r.v);
      g.moveTo(r.u, r.v - 7);
      g.lineTo(r.u, r.v + 7);
      g.stroke();
      g.fillStyle = ok ? '#32d583' : '#ff6b6b';
      g.textAlign = 'center';
      g.font = '800 17px system-ui, sans-serif';
      g.fillText(`${f.k + 1}번`, r.u, r.v0 - 7);
      if (sizes) g.fillText(`⌀${f.dSeen.toFixed(1)}`, r.u, r.v1 + 21);
      g.textAlign = 'start';
    }
    if (markers) {
      const [a, b] = markerPixels();
      g.strokeStyle = '#ffd166';
      g.fillStyle = '#ffd166';
      g.setLineDash([10, 6]);
      const y = ROI.v1 - 26;
      g.beginPath();
      g.moveTo(a.u, a.v + 14);
      g.lineTo(a.u, y);
      g.lineTo(b.u, y);
      g.lineTo(b.u, b.v + 14);
      g.stroke();
      g.setLineDash([]);
      g.font = '800 19px system-ui, sans-serif';
      g.fillText(`마커 사이 ${fmt(Math.hypot(b.u - a.u, b.v - a.v))} px = ${MARKER.span} mm`, (a.u + b.u) / 2 - 118, ROI.v1 - 5);
    }
  }, [pic, hsv, range, mode, found, markers, sizes, prob]);

  return (
    <div className={lg.cam} data-open={open || undefined}>
      <header>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          📷 카메라 화면 {open ? '▾' : '▸'}
        </button>
        {open && (
          <span>
            <button type="button" aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>
              사진
            </button>
            <button type="button" aria-pressed={mode === 'mask'} onClick={() => setMode('mask')}>
              마스크
            </button>
          </span>
        )}
      </header>
      {open && (
        <>
          <canvas ref={ref} width={ROI.u1 - ROI.u0} height={ROI.v1 - ROI.v0} aria-label="카메라 사진과 마스크" />
          <footer>
            {mode === 'mask' ? `색상 ${fmt(range.lo)}° ~ ${fmt(range.hi)}° · S ≥ 0.45` : '위에서 내려다본 사진 (640 × 480 중 트레이 부분)'} · 찾은 덩어리 {found.length}개{prob === 2 ? ` · 비율 ${ratio.toFixed(3)}` : ''}{sizes ? ' · ⌀ = 카메라가 잰 지름 (mm)' : ''}
          </footer>
        </>
      )}
    </div>
  );
}

/* --- pieces ---------------------------------------------------------------------------------- */

function Events({ run, onSeek }: { run: FarmRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  return (
    <ol className={lg.events} aria-label="작업 기록">
      {run.events.map((e, i) => (
        <li key={i} data-k={['press', 'burst', 'slip', 'unreachable', 'hit', 'unripe', 'missed'].includes(e.kind) ? 'bad' : e.kind === 'grip' && (e.value ?? 0) > 4.2 && run.values && 'speed' in run.values ? 'warn' : undefined}>
          <button type="button" onClick={() => onSeek(Math.max(0, e.t - 0.6))}>
            <time>{e.t.toFixed(1)} s</time>
            <span>{e.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A short value stays on one line ("최대 3.2 N"). */
const keep = (v: string) => (v.length <= 12 ? v.replace(/ /g, '\u00a0') : v);

function CompareTable({ before, latest }: { before: ReturnType<typeof scoreFarm>; latest: ReturnType<typeof scoreFarm> }) {
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

/** ③: each tomato's peak force before and after, against the safe line and the burst force. */
function ForceBars({ before, latest }: { before: FarmRun | null; latest: FarmRun }) {
  const top = 8;
  const safe = TOMATO.burst * SAFE_SHARE;
  return (
    <div className={lg.measureBox}>
      {FARM_TOMATOES[3].map((_, k) => {
        const b = before?.picks.find((x) => x.k === k)?.peak ?? null;
        const o = latest.picks.find((x) => x.k === k)?.peak ?? null;
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 52px', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span>{k + 1}번</span>
            <div style={{ position: 'relative', height: 12, background: '#f2f4f7', borderRadius: 6 }}>
              {b !== null && <i style={{ position: 'absolute', left: 0, top: 0, bottom: 6, width: `${(Math.min(b, top) / top) * 100}%`, background: '#f4b4b0', borderRadius: 3 }} />}
              {o !== null && <i style={{ position: 'absolute', left: 0, top: 6, bottom: 0, width: `${(Math.min(o, top) / top) * 100}%`, background: o <= safe ? '#1f9d55' : '#e5484d', borderRadius: 3 }} />}
              <s style={{ position: 'absolute', left: `${(safe / top) * 100}%`, top: -2, bottom: -2, borderLeft: '2px dashed #1f7a45' }} />
              <s style={{ position: 'absolute', left: `${(TOMATO.burst / top) * 100}%`, top: -2, bottom: -2, borderLeft: '2px dashed #e5484d' }} />
            </div>
            <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o === null ? '—' : `${fmt(o, 1)} N`}</b>
          </div>
        );
      })}
      <small className={lg.hmiNote} style={{ color: 'var(--muted)' }}>
        위 칸 (분홍): 처음 (1번에서 멈춤) · 아래 칸: 지금 · 초록 점선 {fmt(safe, 1)} N (여유선) · 빨간 점선 {TOMATO.burst} N (터짐)
      </small>
    </div>
  );
}

/* --- 값 고치기: the operator panels ------------------------------------------------------------ */

function HmiHue({ v, on }: { v: HueValues; on(v: HueValues): void }) {
  const { hsv } = pictureOf(1);
  const list = FARM_TOMATOES[1];
  const hues = useMemo(() => list.map((t) => measuredHue(hsv, t)), [hsv, list]);
  const found = useMemo(() => findTomatoes(hsv, v, RATIO_NOW, list), [hsv, v, list]);
  const ripe = found.filter((f) => f.k >= 0 && list[f.k].ripe).length;
  const unripe = found.length - ripe;
  const ripeN = list.filter((t) => t.ripe).length;
  // A hue strip from −30° to 90° with the tomatoes' hues and the range.
  const x = (h: number) => ((h + 30) / 120) * 100;
  return (
    <div className={lg.hmi}>
      <header>
        <span>VISION · 색상 범위</span>
        <i>● S ≥ 0.45 · V ≥ 0.2 · 덩어리 150 px 이상</i>
      </header>
      <div style={{ position: 'relative', height: 30, margin: '6px 2px 18px', borderRadius: 6, background: 'linear-gradient(90deg, hsl(330 80% 50%), hsl(0 80% 50%) 25%, hsl(30 85% 50%) 50%, hsl(60 85% 50%) 75%, hsl(90 70% 45%))' }}>
        <i style={{ position: 'absolute', top: -3, bottom: -3, left: `${x(Math.max(-30, v.lo))}%`, width: `${x(Math.min(90, v.hi)) - x(Math.max(-30, v.lo))}%`, border: '2px solid #fff', borderRadius: 6, boxShadow: '0 0 0 2px rgba(0,0,0,.35)' }} />
        {hues.map((h, k) => (
          <span key={k} title={`${k + 1}번 ${fmt(h)}°`} style={{ position: 'absolute', left: `${x(Math.min(88, h))}%`, top: 32, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 800, color: list[k].ripe ? '#6fe3a5' : '#ff8a80', whiteSpace: 'nowrap' }}>
            ▲{k + 1}
          </span>
        ))}
      </div>
      <Knob id="farm-lo" label="범위 아래 끝" unit="°" v={v.lo} min={-30} max={10} note="빨강은 0°를 넘어 음수(분홍빛) 쪽으로 이어져요" on={(lo) => on({ ...v, lo: Math.min(lo, v.hi - 1) })} />
      <Knob id="farm-hi" label="범위 위 끝" unit="°" v={v.hi} min={0} max={60} note="클수록 주황 · 노랑 쪽까지 받아들여요" on={(hi) => on({ ...v, hi: Math.max(hi, v.lo + 1) })} />
      <table className={lg.layers}>
        <tbody>
          <tr>
            <td>찾을 덩어리</td>
            <td>{found.length}개</td>
          </tr>
          <tr>
            <td>익은 것 (모두 {ripeN}개)</td>
            <td data-c={ripe === ripeN ? 'ok' : 'drop'}>{ripe}개{ripe < ripeN ? ' · 놓침' : ''}</td>
          </tr>
          <tr>
            <td>덜 익은 것</td>
            <td data-c={unripe ? 'press' : 'ok'}>{unripe}개</td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>3D 화면 왼쪽 위 카메라 화면의 마스크가 바로 바뀌어요 (하양 = 범위 안).</small>
    </div>
  );
}

function HmiRatio({ v, preview, on }: { v: RatioValues; preview: { k: number; r: number; offset: number; limit: number }[] | null; on(v: RatioValues): void }) {
  return (
    <div className={lg.hmi}>
      <header>
        <span>CAMERA · 픽셀 → mm</span>
        <i>● x = (v − 240) × 비율 + {CAM.x}</i>
      </header>
      <Knob id="farm-ratio" label="비율 (1 픽셀 = ? mm)" unit="mm/px" v={v.ratio} min={0.6} max={1} step={0.005} note={`지금 프로그램 값 ${RATIO_OLD.toFixed(3)} (카메라 ${CAM.zOld} mm 때)`} on={(ratio) => on({ ratio: Math.round(ratio * 1000) / 1000 })} />
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>토마토</th>
            <th>가운데에서</th>
            <th>예상 어긋남</th>
          </tr>
        </thead>
        <tbody>
          {(preview ?? [])
            .slice()
            .sort((a, b) => a.r - b.r)
            .map((c) => (
              <tr key={c.k}>
                <td>{c.k + 1}번</td>
                <td>{fmt(c.r)} mm</td>
                <td data-c={c.offset > c.limit ? 'press' : c.offset > 5 ? 'drop' : 'ok'}>
                  {fmt(c.offset, 1)} mm{c.offset > c.limit ? ' · 누름' : c.offset > 5 ? ' · 기준 밖' : ''}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <small className={lg.hmiNote}>카메라 화면의 노란 점선이 두 마커 사이 거리(픽셀)예요.</small>
    </div>
  );
}

function HmiGrip({ v, preview, on }: { v: GripValues; preview: ReturnType<typeof gripPreview> | null; on(v: GripValues): void }) {
  const safe = TOMATO.burst * SAFE_SHARE;
  return (
    <div className={lg.hmi}>
      <header>
        <span>GRIPPER · 잡는 힘</span>
        <i>● 1 mm 누르면 {TOMATO.k} N · 넘침 {OVERSHOOT_PER_SPEED} mm × 속도</i>
      </header>
      <Knob id="farm-sq" label="누르기 (카메라 지름보다 좁게)" unit="mm" v={v.squeeze} min={0} max={4} step={0.1} note="닫는 목표 = 카메라가 잰 지름 − 누르기" on={(squeeze) => on({ ...v, squeeze: Math.round(squeeze * 10) / 10 })} />
      <Knob id="farm-sp" label="그리퍼 속도" unit="" v={v.speed} min={10} max={100} step={5} note={`넘쳐 닫힘 ${fmt(OVERSHOOT_PER_SPEED * v.speed, 1)} mm · 느릴수록 닫는 데 오래 걸려요`} on={(speed) => on({ ...v, speed })} />
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>토마토</th>
            <th>잡는 동안</th>
            <th>최대 힘</th>
          </tr>
        </thead>
        <tbody>
          {(preview ?? []).map((g) => (
            <tr key={g.k}>
              <td>
                {g.k + 1}번 ({g.d} mm)
              </td>
              <td data-c={g.hold < g.need ? 'press' : 'ok'}>
                {fmt(g.hold, 2)} N{g.hold < g.need ? ' · 미끄러짐' : ''}
              </td>
              <td data-c={g.peak >= TOMATO.burst ? 'press' : g.peak > safe ? 'drop' : 'ok'}>
                {fmt(g.peak, 1)} N{g.peak >= TOMATO.burst ? ' · 터짐' : g.peak > safe ? ' · 여유 부족' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className={lg.hmiNote}>
        필요한 힘 0.13 ~ 0.20 N (토마토마다) &lt; 잡는 힘 · 최대 힘 ≤ {fmt(safe, 1)} N (터지는 힘의 {Math.round(SAFE_SHARE * 100)}%)
      </small>
    </div>
  );
}

/* --- 해결 · 원리: the principle figure, per problem --------------------------------------------- */

function PrincipleFig({ prob }: { prob: FarmProblem }) {
  if (prob === 1) {
    // A hue line: ripe dots, turning dots, the old range and the new one.
    const x = (h: number) => 20 + ((h + 20) / 110) * 280;
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="익은 것과 주황빛 사이에 문턱값을 둔다">
        <line x1={20} x2={300} y1={60} y2={60} className={lg.figGuide} />
        <rect x={x(-10)} y={28} width={x(40) - x(-10)} height={12} rx={3} className={lg.figOld} />
        <text x={x(40) + 4} y={38} className={lg.figTxt}>
          처음 −10 ~ 40°
        </text>
        <rect x={x(-10)} y={44} width={x(15) - x(-10)} height={10} rx={3} className={lg.figBox} />
        {[2, -5, 8, 4].map((h) => (
          <circle key={h} cx={x(h)} cy={60} r={5} fill="#e5484d" />
        ))}
        {[24, 31].map((h) => (
          <circle key={h} cx={x(h)} cy={60} r={5} fill="#f08c2e" />
        ))}
        <circle cx={x(82)} cy={60} r={5} fill="#4c9a2a" />
        <line x1={x(16)} x2={x(16)} y1={20} y2={80} className={lg.figUp} strokeDasharray="4 3" />
        <text x={x(16) - 26} y={94} className={lg.figStrong}>
          문턱값 ≈ 16°
        </text>
        <text x={x(-10)} y={106} className={lg.figTxt}>
          익음 (−5 ~ 8°)
        </text>
        <text x={x(22)} y={106} className={lg.figTxt}>
          주황 (24 · 31°)
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    // Seen from the side: the camera at two heights, the same pixel covering more of the tray.
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="카메라가 높을수록 1 픽셀이 덮는 mm가 커진다">
        <line x1={20} x2={300} y1={96} y2={96} className={lg.figArrow} />
        <rect x={92} y={14} width={24} height={10} rx={2} className={lg.figCup} />
        <rect x={92} y={34} width={24} height={10} rx={2} className={lg.figOld} />
        <line x1={104} x2={60} y1={24} y2={96} className={lg.figUp} />
        <line x1={104} x2={148} y1={24} y2={96} className={lg.figUp} />
        <line x1={104} x2={70} y1={44} y2={96} className={lg.figGuide} />
        <line x1={104} x2={138} y1={44} y2={96} className={lg.figGuide} />
        <text x={124} y={22} className={lg.figTxt}>
          480 mm (지금)
        </text>
        <text x={124} y={44} className={lg.figTxt}>
          400 mm (전)
        </text>
        <text x={176} y={64} className={lg.figStrong}>
          비율 ≈ 깊이 ÷ f
        </text>
        <text x={176} y={82} className={lg.figTxt}>
          = 마커 220 mm ÷ 265 px
        </text>
        <ArrowDef />
      </svg>
    );
  }
  // Force against squeeze: the slip line, the safe line, the burst line, the window between.
  const y = (n: number) => 96 - (n / 7) * 84;
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="필요한 힘과 터지는 힘 사이, 여유를 두고 잡는다">
      <line x1={30} x2={300} y1={96} y2={96} className={lg.figArrow} />
      <line x1={30} x2={30} y1={96} y2={8} className={lg.figArrow} />
      <rect x={30} y={y(TOMATO.burst * SAFE_SHARE)} width={270} height={y(0.2) - y(TOMATO.burst * SAFE_SHARE)} className={lg.figBox} />
      <line x1={30} x2={300} y1={y(TOMATO.burst)} y2={y(TOMATO.burst)} stroke="#e5484d" strokeDasharray="5 3" />
      <line x1={30} x2={300} y1={y(TOMATO.burst * SAFE_SHARE)} y2={y(TOMATO.burst * SAFE_SHARE)} className={lg.figUp} strokeDasharray="4 3" />
      <text x={200} y={y(TOMATO.burst) - 3} className={lg.figTxt}>
        터짐 6 N
      </text>
      <text x={200} y={y(TOMATO.burst * SAFE_SHARE) + 12} className={lg.figTxt}>
        여유선 4.2 N
      </text>
      <text x={200} y={y(0.2) - 4} className={lg.figTxt}>
        필요 0.2 N
      </text>
      <text x={40} y={40} className={lg.figStrong}>
        1.2 × (누름 + 넘침)
      </text>
      <ArrowDef />
    </svg>
  );
}
