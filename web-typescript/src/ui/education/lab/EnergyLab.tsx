'use client';

/**
 * 에너지 · 자원순환 — 재활용 선별 (myCobot 280 RDK X5 + 공식 AI 키트). The same screen and six steps as
 * the site labs (SitePanel; the lesson script is content-markdown/sites/energy.md), the kit set up as
 * a sorting cell in the 교육 3D view (LearnStage, the real arm with the suction pump), the engine's
 * runs played back (EnergyCell), and the kit camera's own picture beside it (the photo, what the
 * program calls each pixel, the blobs it found):
 *
 *  ① 투명 PET가 안 보인다 — a colourless piece found by brightness against the board;
 *  ② 빨리 하면 떨어진다 — the cup's hold, friction and speed², against pieces sorted per minute;
 *  ③ 겹쳐 놓인 쓰레기 — the pick order for pieces lying on each other (seen whole = on top).
 *
 * Every run of the student's own values is logged (runLog.ts) for the 관제센터's data screen.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { Mm } from '@/engine/education/lab/cell';
import {
  BIN_OF,
  ENERGY_DEFAULTS,
  ENERGY_FIXES,
  ENERGY_ITEMS,
  KINDS,
  KIND_NAME,
  ROI,
  TARGET_PM,
  VISION_FIX,
  boardV,
  carryPreview,
  findItems,
  footOf,
  fullArea,
  greyHistogram,
  labelPicture,
  measureItem,
  oneSpeed,
  perMinText,
  pickOrder,
  runEnergy,
  scoreEnergy,
  sideLimit,
  sortPicture,
  topOf,
  type EnergyProblem,
  type EnergyRun,
  type EnergyValues,
  type Found,
  type Item,
  type Kind,
  type OrderMode,
  type OrderValues,
  type SpeedValues,
  type VisionValues,
} from '@/engine/education/lab/energy';
import { ENERGY_TEXT } from '@/engine/education/lab/energyText';
import { siteStepIndex, SITE_STEPS, type SiteStepId } from '@/engine/education/lab/siteText';
import { logRun } from '@/engine/education/runLog';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { HOME_DEG } from '@/engine/simulator/board';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import EnergyCell, { EnergyPlayback, KIND_HEX, type EnergyMarker, type EnergyOverlay } from './EnergyCell';
import { ENERGY_LOOK, EnergyAround } from './ambient/Around';
import type { CellDim } from './CellKit';
import { ArrowDef, Knob, PROBS, ProbLock, RecordSheet, SitePanel, ValueLines, answeredUpTo, fmt, freshFlow, useLabStart, type FlowState, type MeasureRow } from './SiteFlow';
import RealUse from './RealUse';
import css from './lab.module.css';
import lg from './site.module.css';

/** The cell on its bench from the front right, a little above, the sorting hall behind it at real size (three.js metres, y up): camera, then target. */
export const ENERGY_VIEW: ViewPose = [2.1, 1.25, 1.7, -0.2, 0.35, 0.15];
const SLOW = 0.35;
const SLOW_LEAD_S = 1.6;
/** The site's colour (the screen's --site): a recycling teal. */
const TONE = { '--site': '#0b8a7a', '--site-soft': '#e6f4f1' } as CSSProperties;

interface Runs {
  before: EnergyRun | null;
  latest: EnergyRun | null;
}

interface ProbState extends FlowState {
  step: SiteStepId;
  values: EnergyValues;
  runs: Runs;
}

const fresh = (p: EnergyProblem): ProbState => ({ ...freshFlow(ENERGY_TEXT[p]), step: 'brief', values: ENERGY_DEFAULTS[p], runs: { before: null, latest: null } });

declare global {
  interface Window {
    /** Open a problem of 에너지 · 자원순환 at a step, optionally with the worked fix run (and everything before it answered), and the playback at a time or its end (guide pictures, tools/check). */
    __energyOpen?: (step: SiteStepId, opts?: { prob?: EnergyProblem; solve?: boolean; at?: number | 'end' }) => void;
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
  return [x + 0.26, y + 0.22, z + 0.26, x, y, z];
};

const startThings = (p: EnergyProblem) => ENERGY_ITEMS[p].map((t, k) => ({ c: [t.x, t.y, footOf(ENERGY_ITEMS[p], k)] as Mm, mode: 'board' as const }));
/** A piece's top centre, mm (where markers sit). */
const topAt = (list: readonly Item[], k: number, up = 8): Mm => [list[k].x, list[k].y, topOf(list, k) + up];

/** ②: one job at each single speed (the curve of sorted per minute), worked out once. */
const curves = new WeakMap<readonly ChainSegment[], { s: number; r: EnergyRun }[]>();
const SPEEDS = [30, 35, 40, 45, 50, 60, 70, 80, 90, 100];
function speedCurve(chain: readonly ChainSegment[]) {
  let c = curves.get(chain);
  if (!c) {
    c = SPEEDS.map((s) => ({ s, r: oneSpeed(chain, s) }));
    curves.set(chain, c);
  }
  return c;
}

/** ③: between the two stacks on the board (원인 찾기 looks here), mm. */
const STACKS_AT: Mm = [162, 0, 15];

const ORDER_NAME: Record<OrderMode, string> = { area: '큰 것부터', near: '가까운 것부터', visible: '다 보이는 것부터' };

/* --- 원인 찾기 --------------------------------------------------------------------------------- */

interface EnergyRow extends MeasureRow {
  dim?: CellDim;
  markers?: EnergyMarker[];
  misses?: { from: Mm; to: Mm }[];
}

function measureRows(prob: EnergyProblem, run: EnergyRun | null): EnergyRow[] {
  const list = ENERGY_ITEMS[prob];
  if (prob === 1) {
    const pic = sortPicture(list);
    const m = list.map((_, k) => measureItem(pic, list, k));
    const b = boardV();
    const mk = (k: number, ok: boolean, text: string): EnergyMarker => ({ key: `m${k}`, mm: topAt(list, k), ok, text });
    const clears = list.map((t, k) => ({ t, k })).filter(({ t }) => t.kind === 'clear');
    const found = run?.found.length ?? 0;
    return [
      { label: '채도 S: 캔 · 유색 PET · 종이팩', value: `${m[0].s} · ${m[2].s} · ${m[4].s}`, markers: [mk(0, true, `캔 S ${m[0].s} · V ${m[0].v}`), mk(2, true, `유색 PET S ${m[2].s}`), mk(4, true, `종이팩 S ${m[4].s}`)] },
      { label: '투명 PET: 채도 S · 밝기 V', value: `S ${m[1].s} · V ${m[1].vMin} ~ ${m[1].vMax}`, bad: true, markers: clears.map(({ k }) => mk(k, false, `투명 PET V ${m[k].v}`)) },
      { label: '빈 보정판의 밝기 V', value: `${b.min} ~ ${b.max}` },
      { label: '지금 규칙 (회색 픽셀, S < 43)', value: 'V < 200 캔 · ~ 210 PET · 그 위 판', bad: true },
      { label: '프로그램이 찾은 것', value: `${found} / ${list.length} (투명 PET ${list.length - found}개 없음)`, bad: true },
    ];
  }
  if (prob === 2) {
    const drops = run?.events.filter((e) => e.kind === 'drop') ?? [];
    const pk = (k: number) => run?.picks.find((x) => x.k === k);
    const wet = 5;
    const full = 3;
    const props = (k: number) => `${list[k].massG} g · ${fmt(list[k].holdN, 2)} N · ${list[k].mu}`;
    const need = (k: number) => {
      const p = pk(k);
      return p?.dropped ? `${fmt(p.needN, 2)} N` : '—';
    };
    return [
      { label: '음료 남은 캔 (무게 · F · μ)', value: props(full), bad: true, markers: [{ key: 'full', mm: topAt(list, full), ok: false, text: `${list[full].name} ${list[full].massG} g` }] },
      { label: '젖은 종이팩 (무게 · F · μ)', value: props(wet), bad: true, markers: [{ key: 'wet', mm: topAt(list, wet), ok: false, text: `${list[wet].name} ${list[wet].massG} g` }] },
      {
        label: '떨어진 순간 필요한 힘 (> F)',
        value: `종이팩 ${need(wet)} · 캔 ${need(full)}`,
        bad: true,
        markers: drops.filter((e) => e.at).map((e, i) => ({ key: `d${i}`, mm: [e.at![0], e.at![1], 8] as Mm, ok: false, text: `떨어진 곳 · ${fmt(e.value ?? 0, 1)} m/s²` })),
        misses: drops.filter((e) => e.at && e.thing !== undefined).map((e) => ({ from: topAt(list, e.thing!, 30), to: [e.at![0], e.at![1], 8] as Mm })),
      },
      { label: '버티는 옆 가속도 μ(F ÷ m − g)', value: `종이팩 ${fmt(sideLimit(list[wet]), 2)} · 캔 ${fmt(sideLimit(list[full]), 2)} · 나머지 ${fmt(Math.min(...[0, 1, 2, 4].map((k) => sideLimit(list[k]))), 0)}↑ m/s²` },
      { label: '처리량 (제 칸 ÷ 시간)', value: run ? `${run.right}개 ÷ ${fmt(run.durationS, 1)} s = ${perMinText(run)}` : '—', bad: true },
    ];
  }
  const found = findItems(sortPicture(list), VISION_FIX, list).found;
  const by = (k: number) => found.find((f) => f.k === k)!;
  const first = pickOrder(found, 'area')[0];
  const rider = list.findIndex((t) => t.on === first.k);
  const ks = [0, 1, 2, 3];
  return [
    { label: '보이는 넓이: 종이팩 · 캔 (mm²)', value: `${fmt(by(0).areaMm)} · ${fmt(by(1).areaMm)}` },
    { label: '보이는 넓이: 투명 PET · 유색 PET', value: `${fmt(by(2).areaMm)} · ${fmt(by(3).areaMm)}` },
    { label: '종류 표의 넓이 (같은 순서)', value: ks.map((k) => fmt(fullArea(list[k].kind))).join(' · ') },
    {
      label: '보이는 비율 (같은 순서)',
      value: ks.map((k) => fmt(by(k).visible, 2)).join(' · '),
      bad: true,
      markers: found.map((f) => ({ key: `v${f.k}`, mm: topAt(list, f.k, 10), ok: f.visible > 0.95, text: `${KIND_NAME[f.kind]} ${fmt(f.visible, 2)}` })),
    },
    {
      label: '처음 집은 것 · 그 위에 있던 것',
      value: rider >= 0 ? `${list[first.k].name} · ${list[rider].name} (함께 ${BIN_OF[list[first.k].kind]}로)` : `${list[first.k].name} · 없음`,
      bad: rider >= 0,
      markers: rider >= 0 ? [{ key: 'rider', mm: topAt(list, rider, 12), ok: false, text: `${list[rider].name} (위)` }] : [],
      dim: rider >= 0 ? { key: 'stack', a: [list[rider].x + 22, list[rider].y, 0], b: [list[rider].x + 22, list[rider].y, topOf(list, rider)], text: `${fmt(topOf(list, rider))} mm`, color: '#3454d1', label: 'r' } : undefined,
    },
  ];
}

function predictionOf(prob: EnergyProblem, run: EnergyRun | null): number | null {
  if (!run) return null;
  if (scoreEnergy(prob, run).pass) return 0;
  if (prob === 1) return run.tooBig ? 2 : 1;
  if (prob === 2) return run.dropped ? 2 : 1;
  return run.wrong ? 1 : 2;
}

function valuesText(p: EnergyProblem, v: EnergyValues): string {
  if (p === 1) {
    const a = v as VisionValues;
    return `캔 V < ${a.canV} · 투명 PET ${a.canV} ~ ${a.clearV}`;
  }
  if (p === 2) {
    const s = v as SpeedValues;
    return KINDS.map((k) => `${KIND_NAME[k]} ${s[k]}`).join(' · ');
  }
  return ORDER_NAME[(v as OrderValues).order];
}

export default function EnergyLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<EnergyProblem>(1);
  useLabStart('energy', setProb);
  const [st, setSt] = useState<Record<EnergyProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<EnergyProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  const [player] = useState(() => new EnergyPlayback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step, runs } = s;

  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);

  const patch = useCallback((p: EnergyProblem, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
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
    (run: EnergyRun | null, at: number | 'end' = 0, slowAt: number | null = null, hold = false) => {
      player.start(run, at, 1);
      if (hold) player.pause();
      slowFrom.current = slowAt !== null && slowAt > player.t ? slowAt : null;
      setSlow(false);
      setPlayT(player.t);
      setPlaying(player.playing);
    },
    [player],
  );

  const go = useCallback(
    (which: 'before' | 'latest') => {
      const p = prob;
      const v = which === 'before' ? ENERGY_DEFAULTS[p] : st[p].values;
      setBusy(true);
      window.setTimeout(() => {
        const run = runEnergy(chain, p, v);
        const sc = scoreEnergy(p, run);
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
        if (which === 'latest') {
          logRun({ lab: 'energy', problem: p, pass: sc.pass, durationS: run.durationS, values: v, checks: sc.checks.map((c) => ({ label: c.label, ok: c.ok, value: c.value })) });
          if (sc.pass) setSolved((x) => ({ ...x, [p]: true }));
        }
        setBusy(false);
      }, 30);
    },
    [chain, patch, prob, st],
  );

  const shown = step === 'run' || step === 'cause' ? runs.before : step === 'compare' || step === 'done' ? runs.latest : null;
  const fail = shown?.failure ?? null;
  const lastShown = useRef<{ run: EnergyRun | null; step: SiteStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    // The job runs on after a drop or a wrong bin: 원인 찾기 holds the run at that moment — for ③ before
    // the first pick, while the pieces still lie on each other.
    const hold = step === 'cause' && !!fail && !shown?.frames[shown.frames.length - 1].alarm;
    const causeT = prob === 3 ? 0 : fail ? fail.t + 0.02 : 'end';
    play(shown, step === 'cause' ? causeT : step === 'done' ? 'end' : 0, step === 'run' && fail ? Math.max(0, fail.t - SLOW_LEAD_S) : null, hold);
  }, [shown, step, fail, play, prob]);

  const failAt = fail?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => {
    if (step === 'cause' && prob === 3) return closeLook(STACKS_AT);
    return failAt && ((step === 'run' && slow) || step === 'cause') ? closeLook(failAt) : null;
  }, [failAt, step, slow, prob]);

  useEffect(() => {
    player.setStill(startThings(prob));
  }, [player, prob]);

  const fi = shown ? Math.min(shown.frames.length - 1, Math.round(playT / 0.02)) : 0;
  const frame = shown ? shown.frames[fi] : null;
  const rows = useMemo(() => measureRows(prob, runs.before), [prob, runs.before]);

  const vDeferred = useDeferredValue(s.values);
  const speedPrev = useMemo(() => (prob === 2 && step === 'fix' ? carryPreview(chain, vDeferred as SpeedValues) : null), [chain, prob, step, vDeferred]);
  const speedRun = useMemo(() => (prob === 2 && step === 'fix' ? runEnergy(chain, 2, vDeferred) : null), [chain, prob, step, vDeferred]);
  const curve = useMemo(() => (prob === 2 && ((step === 'cause' && s.meas >= 5) || step === 'fix') ? speedCurve(chain) : null), [chain, prob, step, s.meas]);
  const orderPrev = useMemo(() => (prob === 3 && step === 'fix' ? pickOrder(findItems(sortPicture(ENERGY_ITEMS[3]), VISION_FIX, ENERGY_ITEMS[3]).found, (vDeferred as OrderValues).order) : null), [prob, step, vDeferred]);

  const overlay = useMemo<EnergyOverlay>(() => {
    const o: EnergyOverlay = { markers: [], dims: [], misses: [] };
    const list = ENERGY_ITEMS[prob];
    if (step === 'fix') {
      if (prob === 2 && speedPrev)
        speedPrev.forEach((x) => o.markers!.push({ key: `s${x.k}`, mm: topAt(list, x.k), ok: x.ok, text: `${fmt(x.aXY, 1)} m/s²${x.ok ? '' : ' · 떨어짐'}` }));
      if (prob === 3 && orderPrev)
        orderPrev.forEach((f, i) => {
          // Red when something still lies on it at its turn (it would come along).
          const under = list.some((t, j) => t.on === f.k && orderPrev.findIndex((g) => g.k === j) > i);
          o.markers!.push({ key: `o${f.k}`, mm: topAt(list, f.k, 10), ok: !under, text: `${i + 1} · ${KIND_NAME[f.kind]}` });
        });
      return o;
    }
    if (step === 'cause') {
      for (const r of rows.slice(0, s.meas)) {
        if (r.markers) o.markers!.push(...r.markers);
        if (r.dim) o.dims!.push(r.dim);
        if (r.misses) o.misses!.push(...r.misses);
      }
      return o;
    }
    if (!shown) return o;
    o.path = shown.tip.slice(Math.max(0, fi - 300), fi + 1).filter((_, j) => j % 2 === 0);
    return o;
  }, [prob, step, s.meas, rows, shown, fi, speedPrev, orderPrev]);

  const scene = useMemo<LearnScene>(() => ({ angles: HOME_DEG, tool: 'pump', pumpOn: false }), []);

  useEffect(() => {
    window.__energyOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      const T = ENERGY_TEXT[p];
      const before = st[p].runs.before ?? runEnergy(chain, p, ENERGY_DEFAULTS[p]);
      let latest = st[p].runs.latest;
      let values = st[p].values;
      let log = st[p].log;
      if (opts.solve) {
        values = ENERGY_FIXES[p];
        latest = runEnergy(chain, p, values);
        const sc = scoreEnergy(p, latest);
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
      delete window.__energyOpen;
    };
  }, [chain, st, prob, patch, play, player]);

  const sb = runs.before ? scoreEnergy(prob, runs.before) : null;
  const sl = runs.latest ? scoreEnergy(prob, runs.latest) : null;
  const at = siteStepIndex(step);
  const T = ENERGY_TEXT[prob];
  const list = ENERGY_ITEMS[prob];
  const rightNow = frame ? frame.things.filter((x, k) => x.mode === 'binned' && x.bin === BIN_OF[list[k].kind]).length : 0;
  const camVision = prob === 1 ? ((step === 'fix' ? vDeferred : (shown?.values ?? ENERGY_DEFAULTS[1])) as VisionValues) : VISION_FIX;
  const camOrder = prob === 3 ? ((step === 'fix' ? vDeferred : (shown?.values ?? ENERGY_DEFAULTS[3])) as OrderValues).order : null;

  return (
    <div className={css.lab} style={TONE} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 로봇 시티
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          에너지 · 자원순환
          <small>재활용 선별</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${ENERGY_TEXT[p].title} · ${ENERGY_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{ENERGY_TEXT[p].title}</span>
              {solved[p] && <i aria-label="해결">✓</i>}
              <ProbLock lab="energy" p={p} />
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

      <section className={css.stage} aria-label="3D 재활용 선별 셀">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={ENERGY_VIEW} focus={focus} live={player.arm} look={ENERGY_LOOK}>
          <EnergyAround />
          <EnergyCell player={player} prob={prob} things={list} overlay={overlay} />
        </LearnStage>
        {fail && playT >= fail.t && <div className={lg.alarm}>⚠ {fail.text.replace(/ \(작업 중지\)$/, '')}</div>}
        {shown && !fail && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ {scoreEnergy(prob, shown).headline}</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        {prob !== 2 && <SortCam prob={prob as 1 | 3} vision={camVision} order={camOrder} />}
        {shown && (
          <div className={lg.board} aria-label="작업 현황">
            <div data-c={rightNow === list.length ? 'ok' : undefined}>
              <small>제 칸에 넣은 것</small>
              <b>
                {rightNow} / {list.length}
              </b>
            </div>
            <div data-c={frame?.pump ? 'ok' : undefined}>
              <small>흡착 펌프</small>
              <b>{frame?.pump ? '켬' : '끔'}</b>
            </div>
            <div data-c={playT >= shown.durationS - 1e-6 ? (shown.perMin >= TARGET_PM ? 'ok' : prob === 2 ? 'bad' : undefined) : undefined}>
              <small>처리량</small>
              <b>{playT > 1 ? `${fmt((rightNow / playT) * 60, 1)}개/분` : '—'}</b>
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
        <RealUse site="energy" beside />
        <p className={css.hint}>끌어서 돌려 보기 · 휠로 확대</p>
      </section>

      <aside className={css.panel} aria-label="실습 안내">
        <SitePanel
          T={T}
          lab="energy"
          st={s}
          boss="윤 팀장"
          level={level}
          solved={solved[prob]}
          busy={busy}
          order={
            <div className={lg.order}>
              <header>
                작업 기준 <span>{T.order}</span>
              </header>
              <dl>
                <dt>물건</dt>
                <dd>
                  <ValueLines
                    text={
                      prob === 1
                        ? '납작한 재활용 조각 6개 (캔 2 · 투명 PET 2 · 유색 PET 1 · 종이팩 1)'
                        : prob === 2
                          ? '6개: 빈 캔 · 음료 남은 캔(60 g) · 투명 PET · 유색 PET · 마른 종이팩 · 젖은 종이팩(30 g)'
                          : '4개, 두 더미 (종이팩 위에 캔 · 투명 PET 위에 유색 PET)'
                    }
                  />
                </dd>
                <dt>옮기기</dt>
                <dd>
                  <ValueLines text="보정판 → 분류함 (투명 PET A · 유색 PET B · 종이팩 C · 캔 D)" />
                </dd>
                <dt>기준</dt>
                <dd>{prob === 1 ? '모두 제 칸에 · 판에 남은 것 없음' : prob === 2 ? `모두 제 칸에 · 떨어뜨림 0 · 처리량 ${TARGET_PM}개/분 이상` : '모두 제 칸에 · 다른 칸에 섞인 것 0'}</dd>
                <dt>장비</dt>
                <dd>공식 AI 키트 (위 카메라 · 흡착 펌프(컵 Ø20) · 분류함 4개)</dd>
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
          measureExtra={
            prob === 2 && runs.before ? (
              <>
                {s.meas >= 3 && <AccGraph run={runs.before} />}
                {s.meas >= 5 && curve && <RateCurve curve={curve} />}
              </>
            ) : null
          }
          fixTitle={prob === 1 ? '밝기 띠를 고쳐요' : prob === 2 ? '종류마다 속도를 정해요' : '집는 순서를 바꿔요'}
          hmi={
            <>
              {prob === 1 && <HmiVision v={s.values as VisionValues} on={(values) => patch(prob, { values })} />}
              {prob === 2 && <HmiSpeed v={s.values as SpeedValues} preview={speedPrev} run={speedRun} curve={curve} on={(values) => patch(prob, { values })} />}
              {prob === 3 && <HmiOrder v={s.values as OrderValues} preview={orderPrev} on={(values) => patch(prob, { values })} />}
            </>
          }
          compare={sb && sl && <CompareTable before={sb} latest={sl} />}
          hit={playing ? null : predictionOf(prob, runs.latest)}
          pass={!!sl?.pass}
          notYet={sl && !sl.pass ? sl.headline + '.' : null}
          fig={<PrincipleFig prob={prob} />}
          nextLabel={prob < 3 ? `문제 ${prob + 1} · ${ENERGY_TEXT[(prob + 1) as EnergyProblem].title} →` : '로봇 시티로 →'}
          patch={(ch) => patch(prob, ch)}
          onRunBefore={() => go('before')}
          onRunFix={() => go('latest')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as EnergyProblem) : onBack())}
        />
      </aside>
      {/* The record sheet is drawn on the page's body: it takes the nearest site tone (green). */}
      {record && <RecordSheet site="에너지 · 자원순환 (재활용 선별)" tone={lg.energy} texts={ENERGY_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

function programLine(p: EnergyProblem): string {
  if (p === 1) return '색 있는 픽셀(S ≥ 43)은 색상으로 · 회색 픽셀은 밝기로: V < 200 캔 · 200 ~ 210 투명 PET · 그 위는 판';
  if (p === 2) return '들고 옮기는 속도: 모든 종류 100 (빈손 이동 100) · 찾기는 1번 문제에서 고친 그대로';
  return '큰 덩어리부터 집기 · 사진은 처음에 한 번 · 컵은 닿을 때까지 내려감 · 찾기는 1번 문제에서 고친 그대로';
}

/* --- the kit camera window -------------------------------------------------------------------- */

/** Short names for the camera window's labels. */
const SHORT: Record<Kind, string> = { can: '캔', clear: '투명', color: '유색', pack: '종이팩' };
/** The camera window draws the board's pixels this many times larger. */
const CAM_K = 2;
const KIND_RGB: Record<Kind, [number, number, number]> = { can: [141, 153, 166], clear: [56, 189, 248], color: [46, 158, 91], pack: [240, 138, 36] };

function SortCam({ prob, vision, order }: { prob: 1 | 3; vision: VisionValues; order: OrderMode | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'photo' | 'mask'>('mask');
  const [open, setOpen] = useState(true);
  const list = ENERGY_ITEMS[prob];
  const pic = sortPicture(list);
  const seen = useMemo(() => findItems(pic, vision, list), [pic, vision, list]);
  const labels = useMemo(() => labelPicture(pic, vision), [pic, vision]);
  const ranked = useMemo(() => (order ? pickOrder(seen.found, order) : null), [seen, order]);

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    // The board's pixels, drawn CAM_K times larger (crisp, unsmoothed), then the boxes and words at screen size.
    const w = ROI.u1 - ROI.u0 + 1;
    const h = ROI.v1 - ROI.v0 + 1;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const o = off.getContext('2d')!;
    const img = o.createImageData(w, h);
    for (let v = 0; v < h; v += 1)
      for (let u = 0; u < w; u += 1) {
        const i = (v + ROI.v0) * pic.width + u + ROI.u0;
        const j = (v * w + u) * 4;
        let r = pic.data[i * 4];
        let gg = pic.data[i * 4 + 1];
        let b = pic.data[i * 4 + 2];
        if (mode === 'mask') {
          // What the program calls each pixel: its kind's colour, the background dimmed.
          const l = labels[i];
          if (l) [r, gg, b] = KIND_RGB[KINDS[l - 1]];
          else {
            r *= 0.35;
            gg *= 0.35;
            b *= 0.35;
          }
        }
        img.data[j] = r;
        img.data[j + 1] = gg;
        img.data[j + 2] = b;
        img.data[j + 3] = 255;
      }
    o.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(off, 0, 0, w * CAM_K, h * CAM_K);
    const X = (u: number) => (u - ROI.u0) * CAM_K;
    const Y = (v: number) => (v - ROI.v0) * CAM_K;
    g.lineWidth = 2.5;
    g.textAlign = 'center';
    g.font = '800 11px system-ui, sans-serif';
    for (const f of seen.found) {
      g.strokeStyle = KIND_HEX[f.kind];
      g.strokeRect(X(f.u0) - 2, Y(f.v0) - 2, (f.u1 - f.u0 + 1) * CAM_K + 4, (f.v1 - f.v0 + 1) * CAM_K + 4);
      const n = ranked ? ranked.indexOf(f) + 1 : 0;
      const text = ranked ? `${n} · ${fmt(f.visible, 2)}` : `${SHORT[f.kind]}→${BIN_OF[f.kind]}`;
      g.fillStyle = 'rgba(16,20,26,.75)';
      const tw = g.measureText(text).width;
      g.fillRect(X(f.u) - tw / 2 - 3, Y(f.v) - 9, tw + 6, 17);
      g.fillStyle = '#ffffff';
      g.fillText(text, X(f.u), Y(f.v) + 4);
    }
    g.textAlign = 'start';
  }, [pic, seen, labels, mode, ranked]);

  return (
    <div className={lg.cam} data-open={open || undefined}>
      <header>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          📷 키트 카메라 {open ? '▾' : '▸'}
        </button>
        {open && (
          <span>
            <button type="button" aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>
              사진
            </button>
            <button type="button" aria-pressed={mode === 'mask'} onClick={() => setMode('mask')}>
              판정
            </button>
          </span>
        )}
      </header>
      {open && (
        <>
          <canvas ref={ref} width={(ROI.u1 - ROI.u0 + 1) * CAM_K} height={(ROI.v1 - ROI.v0 + 1) * CAM_K} aria-label="키트 카메라 사진과 판정" />
          <footer>
            보정판 · 찾은 덩어리 {seen.found.length}개{seen.tooBig ? ` (판만 한 덩어리 ${seen.tooBig}개 버림)` : ''} · {ranked ? '글자: 집는 순서 · 보이는 비율' : '글자: 프로그램이 정한 종류 → 분류함'}
            {mode === 'mask' ? ' · 색: 캔 회색, 투명 PET 하늘, 유색 PET 초록, 종이팩 주황, 어두운 곳은 판' : ''}
          </footer>
        </>
      )}
    </div>
  );
}

/* --- pieces ---------------------------------------------------------------------------------- */

function Events({ run, onSeek }: { run: EnergyRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  return (
    <ol className={lg.events} aria-label="작업 기록">
      {run.events.map((e, i) => (
        <li key={i} data-k={['wrong', 'miss', 'drop', 'left', 'unreachable'].includes(e.kind) ? 'bad' : e.kind === 'ride' ? 'warn' : undefined}>
          <button type="button" onClick={() => onSeek(Math.max(0, e.t - 0.6))}>
            <time>{e.t.toFixed(1)} s</time>
            <span>{e.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

const keep = (v: string) => (v.length <= 14 ? v.replace(/ /g, ' ') : v);

function CompareTable({ before, latest }: { before: ReturnType<typeof scoreEnergy>; latest: ReturnType<typeof scoreEnergy> }) {
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

/** ②: the cup's sideways acceleration over the run — thick while it holds a piece — and the two weak pieces' limits. */
function AccGraph({ run }: { run: EnergyRun }) {
  const W = 340;
  const H = 104;
  const pad = { l: 30, r: 6, t: 8, b: 16 };
  const list = ENERGY_ITEMS[2];
  const lims = [5, 3].map((k) => ({ k, a: sideLimit(list[k]) }));
  const top = Math.max(4, ...run.frames.map((f) => f.acc));
  const x = (t: number) => pad.l + (t / Math.max(1, run.durationS)) * (W - pad.l - pad.r);
  const y = (a: number) => pad.t + (1 - Math.min(a, top) / top) * (H - pad.t - pad.b);
  const seg = (held: boolean) =>
    run.frames
      .map((f, i) => ((f.held >= 0) === held ? `${i && (run.frames[i - 1].held >= 0) === held ? 'L' : 'M'}${x(f.t).toFixed(1)},${y(f.acc).toFixed(1)}` : ''))
      .join('');
  return (
    <svg className={lg.graph} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`흡착 컵의 옆 가속도 그래프, 젖은 종이팩 한계 ${fmt(lims[0].a, 2)} m/s², 음료 남은 캔 한계 ${fmt(lims[1].a, 2)} m/s²`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className={lg.axis} />
      {lims.map((l) => (
        <g key={l.k}>
          <line x1={pad.l} x2={W - pad.r} y1={y(l.a)} y2={y(l.a)} className={lg.limit} />
          <text x={W - pad.r} y={y(l.a) - 3} textAnchor="end" className={lg.limitTxt} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
            {list[l.k].name} 한계 {fmt(l.a, 2)}
          </text>
        </g>
      ))}
      <path d={seg(false)} className={lg.empty} />
      <path d={seg(true)} className={lg.carry} style={{ stroke: 'var(--site)' }} />
      <text x={2} y={y(top) + 8} className={lg.tick}>
        {fmt(top, 1)}
      </text>
      <text x={2} y={y(0)} className={lg.tick}>
        0
      </text>
      <text x={W - pad.r} y={H - 3} textAnchor="end" className={lg.tick}>
        {fmt(run.durationS, 0)} s
      </text>
      <text x={pad.l} y={H - 3} className={lg.tick}>
        굵은 선: 조각을 든 동안 · 옆 가속도 (m/s²)
      </text>
    </svg>
  );
}

/** ②: pieces sorted right per minute when every kind is carried at one speed — the target dashed; a red dot where something drops. */
function RateCurve({ curve, mark }: { curve: { s: number; r: EnergyRun }[]; mark?: number | null }) {
  const W = 340;
  const H = 110;
  const pad = { l: 30, r: 8, t: 10, b: 18 };
  const lo = 6;
  const hi = 14;
  const x = (s: number) => pad.l + ((s - 30) / 70) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const best = curve.reduce((a, b) => (b.r.perMin > a.r.perMin ? b : a));
  return (
    <svg className={lg.graph} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`한 속도로 옮길 때 속도별 처리량, 가장 많은 것은 속도 ${best.s}에서 ${perMinText(best.r)}`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(lo)} y2={y(lo)} className={lg.axis} />
      <line x1={pad.l} x2={W - pad.r} y1={y(TARGET_PM)} y2={y(TARGET_PM)} className={lg.limit} />
      <text x={W - pad.r} y={y(TARGET_PM) - 3} textAnchor="end" className={lg.limitTxt}>
        기준 {TARGET_PM}개/분
      </text>
      <path d={curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.s).toFixed(1)},${y(c.r.perMin).toFixed(1)}`).join('')} fill="none" stroke="var(--site)" strokeWidth={2} />
      {curve.map((c) => (
        <g key={c.s}>
          <circle cx={x(c.s)} cy={y(c.r.perMin)} r={3.2} fill={c.r.dropped ? '#e5484d' : 'var(--site)'} />
          <text x={x(c.s)} y={H - 5} textAnchor="middle" className={lg.tick}>
            {c.s}
          </text>
        </g>
      ))}
      <text x={x(best.s)} y={y(best.r.perMin) + 15} textAnchor="middle" className={lg.limitTxt} style={{ fill: 'var(--site)' }}>
        {perMinText(best.r)}
      </text>
      {typeof mark === 'number' && <line x1={pad.l} x2={W - pad.r} y1={y(mark)} y2={y(mark)} stroke="#1f9d55" strokeWidth={1.5} />}
      {typeof mark === 'number' && (
        <text x={x(70)} y={y(mark) - 3} textAnchor="middle" className={lg.limitTxt} style={{ fill: '#1f9d55' }}>
          지금 값 {fmt(mark, 1)}개/분
        </text>
      )}
      <text x={2} y={y(hi) + 6} className={lg.tick}>
        {hi}
      </text>
      <text x={2} y={y(lo)} className={lg.tick}>
        {lo}
      </text>
      <text x={pad.l} y={pad.t - 1} className={lg.tick}>
        한 속도로 모두 옮길 때 (가로: 속도 · 빨간 점: 떨어뜨림)
      </text>
    </svg>
  );
}

/* --- 값 고치기 ---------------------------------------------------------------------------------- */

function HmiVision({ v, on }: { v: VisionValues; on(v: VisionValues): void }) {
  const list = ENERGY_ITEMS[1];
  const pic = sortPicture(list);
  const hist = useMemo(() => greyHistogram(pic), [pic]);
  const board = useMemo(() => boardV(), []);
  const m = useMemo(() => list.map((_, k) => measureItem(pic, list, k)), [pic, list]);
  const found = useMemo(() => findItems(pic, v, list), [pic, v, list]);
  const V0 = 130;
  const V1 = 255;
  const W = 300;
  const H = 70;
  const x = (V: number) => ((V - V0) / (V1 - V0)) * W;
  const peak = Math.sqrt(Math.max(...hist.slice(V0)));
  const can = [0, 3].map((k) => m[k]);
  const clear = [1, 5].map((k) => m[k]);
  const band = (name: string, lo: number, hi: number, color: string) => ({ name, lo, hi, color });
  const bands = [
    band('캔', Math.min(...can.map((c) => c.vMin)), Math.max(...can.map((c) => c.vMax)), KIND_HEX.can),
    band('투명 PET', Math.min(...clear.map((c) => c.vMin)), Math.max(...clear.map((c) => c.vMax)), KIND_HEX.clear),
    band('판', board.min, board.max, '#98a2b3'),
  ];
  return (
    <div className={lg.hmi}>
      <header>
        <span>VISION · 회색 픽셀(S &lt; 43)의 밝기 V</span>
        <i>● 막대 높이 = 픽셀 수 (√)</i>
      </header>
      <svg viewBox={`-4 -14 ${W + 8} ${H + 44}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="회색 픽셀의 밝기 막대그래프와 경계">
        {hist.slice(V0).map((n, i) => {
          const V = V0 + i;
          const k = V < v.canV ? 'can' : V < v.clearV ? 'clear' : null;
          const h = (Math.sqrt(n) / peak) * H;
          return n ? <rect key={V} x={x(V)} y={H - h} width={Math.max(1, W / (V1 - V0) - 0.3)} height={h} fill={k ? KIND_HEX[k] : '#667085'} /> : null;
        })}
        {bands.map((b, i) => (
          <g key={b.name}>
            <line x1={x(b.lo)} x2={x(b.hi)} y1={H + 6} y2={H + 6} stroke={b.color} strokeWidth={4} />
            {/* The PET's words a row lower: its band sits close to the board's. */}
            <text x={(x(b.lo) + x(b.hi)) / 2} y={H + 18 + (i === 1 ? 11 : 0)} fontSize={9} fontWeight={800} textAnchor="middle" fill={b.color}>
              {b.name} {b.lo} ~ {b.hi}
            </text>
          </g>
        ))}
        {[
          { V: v.canV, t: `캔 | ${v.canV}` },
          { V: v.clearV, t: `${v.clearV} | 판` },
        ].map((l) => (
          <g key={l.t}>
            <line x1={x(l.V)} x2={x(l.V)} y1={-4} y2={H + 2} stroke="#ffffff" strokeWidth={1.5} strokeDasharray="3 2" />
            <text x={x(l.V)} y={-6} fontSize={9} fontWeight={800} textAnchor="middle" fill="#e6ebf2">
              {l.t}
            </text>
          </g>
        ))}
      </svg>
      <Knob id="en-cv" label="투명 PET 띠의 위 끝 (이보다 밝으면 판)" unit="" v={v.clearV} min={200} max={250} note="지금 프로그램 210. 투명 PET와 판의 밝기를 보세요" on={(clearV) => on({ ...v, clearV: Math.max(clearV, v.canV) })} />
      <Knob id="en-kv" label="캔 경계 (이보다 어두우면 캔)" unit="" v={v.canV} min={150} max={230} note="지금 프로그램 200" on={(canV) => on({ ...v, canV: Math.min(canV, v.clearV) })} />
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>조각</th>
            <th>판정 → 분류함</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t, k) => {
            const f = found.found.find((x) => x.k === k);
            const ok = !!f && f.kind === t.kind;
            return (
              <tr key={k}>
                <td>
                  {t.name} (V {m[k].v})
                </td>
                <td data-c={ok ? 'ok' : 'press'}>{f ? `${KIND_NAME[f.kind]} → ${BIN_OF[f.kind]}${ok ? '' : ` (제자리 ${BIN_OF[t.kind]})`}` : '못 찾음 (판에 남음)'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {found.tooBig > 0 && <small className={lg.hmiNote}>⚠ 판만 한 덩어리 {found.tooBig}개. 판의 어두운 픽셀까지 투명 PET로 봐서 버렸어요.</small>}
    </div>
  );
}

function HmiSpeed({ v, preview, run, curve, on }: { v: SpeedValues; preview: ReturnType<typeof carryPreview> | null; run: EnergyRun | null; curve: { s: number; r: EnergyRun }[] | null; on(v: SpeedValues): void }) {
  const list = ENERGY_ITEMS[2];
  return (
    <div className={lg.hmi}>
      <header>
        <span>MOTION · 들고 옮기는 속도 (종류마다)</span>
        <i>● 빈손 이동 100</i>
      </header>
      {KINDS.map((k) => (
        <Knob key={k} id={`en-s-${k}`} label={`${KIND_NAME[k]} → ${BIN_OF[k]}`} unit="" v={v[k]} min={10} max={100} step={5} note={k === 'can' ? '음료 남은 캔(60 g)도 있어요' : k === 'pack' ? '젖은 종이팩(30 g)도 있어요' : '가벼운 PET'} on={(x) => on({ ...v, [k]: x })} />
      ))}
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>조각</th>
            <th>최대 옆 가속도</th>
            <th>필요한 힘 / F</th>
          </tr>
        </thead>
        <tbody>
          {(preview ?? []).map((x) => (
            <tr key={x.k}>
              <td>{list[x.k].name}</td>
              <td>{fmt(x.aXY, 2)} m/s²</td>
              <td data-c={x.ok ? 'ok' : 'press'}>
                {fmt(x.needN, 2)} / {fmt(x.holdN, 2)} N{x.ok ? '' : ' 떨어짐'}
              </td>
            </tr>
          ))}
          <tr>
            <td>예상 처리량</td>
            <td>{run ? `${fmt(run.durationS, 1)} s` : '…'}</td>
            <td data-c={!run ? undefined : run.perMin >= TARGET_PM && !run.dropped ? 'ok' : 'press'}>{run ? `${perMinText(run)}${run.dropped ? ` · ${run.dropped}개 떨어짐` : ''}` : '…'}</td>
          </tr>
        </tbody>
      </table>
      {curve && <RateCurve curve={curve} mark={run && !run.dropped ? run.perMin : null} />}
      <small className={lg.hmiNote}>필요한 힘 = m(g + a_z) + m·a ÷ μ. 이 힘이 붙잡는 힘 F보다 크면 떨어져요. 기준: 떨어뜨림 0 · {TARGET_PM}개/분 이상.</small>
    </div>
  );
}

function HmiOrder({ v, preview, on }: { v: OrderValues; preview: Found[] | null; on(v: OrderValues): void }) {
  const list = ENERGY_ITEMS[3];
  return (
    <div className={lg.hmi}>
      <header>
        <span>PLAN · 집는 순서</span>
        <i>● 사진은 처음 한 번</i>
      </header>
      <div className={lg.jog}>
        {(['area', 'near', 'visible'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={v.order === m} onClick={() => on({ order: m })} style={v.order === m ? { borderColor: '#6fe3a5', color: '#6fe3a5' } : undefined}>
            {ORDER_NAME[m]}
          </button>
        ))}
      </div>
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>순서</th>
            <th>보이는 넓이</th>
            <th>보이는 비율</th>
            <th>로봇에서</th>
          </tr>
        </thead>
        <tbody>
          {(preview ?? []).map((f, i) => (
            <tr key={f.k}>
              <td>
                {i + 1} · {KIND_NAME[f.kind]}
              </td>
              <td>{fmt(f.areaMm)} mm²</td>
              <td data-c={f.visible > 0.95 ? 'ok' : 'drop'}>{fmt(f.visible, 2)}</td>
              <td>{fmt(Math.hypot(f.x, f.y))} mm</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className={lg.hmiNote}>
        보이는 비율 = 보이는 넓이 ÷ 종류 표의 넓이 ({KINDS.map((k) => `${KIND_NAME[k]} ${fmt(fullArea(k))}`).join(' · ')} mm²). 3D 화면의 번호가 집는 순서예요. 조각은 {list.length}개, 판 위 두 더미.
      </small>
    </div>
  );
}

/* --- 해결 · 원리 ---------------------------------------------------------------------------------- */

function PrincipleFig({ prob }: { prob: EnergyProblem }) {
  if (prob === 1) {
    const x = (V: number) => 20 + ((V - 140) / 115) * 280;
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="회색 픽셀은 밝기로: 캔, 투명 PET, 판, 경계 230">
        <rect x={x(147)} y={40} width={x(190) - x(147)} height={16} rx={3} fill={KIND_HEX.can} opacity={0.7} />
        <rect x={x(212)} y={40} width={x(220) - x(212)} height={16} rx={3} fill={KIND_HEX.clear} opacity={0.8} />
        <rect x={x(238)} y={40} width={x(246) - x(238)} height={16} rx={3} fill="#98a2b3" opacity={0.8} />
        <text x={x(150)} y={34} className={lg.figTxt}>
          캔 147 ~ 190
        </text>
        <text x={x(196)} y={74} className={lg.figTxt}>
          투명 PET 212 ~ 220
        </text>
        <text x={x(236)} y={34} className={lg.figTxt}>
          판 238 ~ 246
        </text>
        <line x1={x(200)} x2={x(200)} y1={20} y2={62} className={lg.figGuide} />
        <line x1={x(229)} x2={x(229)} y1={20} y2={62} stroke="#e5484d" strokeWidth={2} strokeDasharray="4 3" />
        <text x={x(229) - 30} y={16} className={lg.figStrong}>
          경계 ≈ 229
        </text>
        <text x={20} y={98} className={lg.figTxt}>
          밝기 V → (투명 PET ≈ 판 × 0.89, 색상으로는 못 나눔)
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="흡착 컵이 조각에 주는 힘: 위로 F, 아래로 무게, 옆으로 관성은 마찰로 버틴다">
        <rect x={70} y={14} width={30} height={14} rx={2} className={lg.figCup} />
        <rect x={56} y={30} width={58} height={12} rx={2} className={lg.figBox} />
        <line x1={85} x2={85} y1={30} y2={4} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={90} y={10} className={lg.figTxt}>
          F (붙잡는 힘)
        </text>
        <line x1={85} x2={85} y1={42} y2={74} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={90} y={72} className={lg.figTxt}>
          m(g + a_z)
        </text>
        <line x1={56} x2={22} y1={36} y2={36} className={lg.figArrow} markerEnd="url(#siteArrow)" />
        <text x={8} y={56} className={lg.figTxt}>
          m·a ÷ μ
        </text>
        <text x={150} y={30} className={lg.figStrong}>
          m(g + a_z) + m·a ÷ μ ≤ F
        </text>
        <text x={150} y={50} className={lg.figTxt}>
          속도 × 2 → 가속도 × 4
        </text>
        <text x={150} y={70} className={lg.figTxt}>
          약한 것만 천천히, 나머지는 빨리
        </text>
        <text x={150} y={92} className={lg.figTxt}>
          처리량 = 제 칸 개수 ÷ 시간
        </text>
        <ArrowDef />
      </svg>
    );
  }
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="겹친 것은 위에서부터: 보이는 비율이 1에 가까운 것이 위">
      <rect x={30} y={70} width={110} height={14} rx={2} fill={KIND_HEX.pack} opacity={0.8} />
      <rect x={90} y={54} width={60} height={16} rx={3} fill={KIND_HEX.can} />
      <line x1={20} x2={160} y1={84} y2={84} className={lg.figArrow} />
      <text x={100} y={48} className={lg.figStrong}>
        ① 캔 (1.10)
      </text>
      <text x={34} y={100} className={lg.figTxt}>
        ② 종이팩 (0.74)
      </text>
      <text x={180} y={30} className={lg.figStrong}>
        위에서부터 집는다
      </text>
      <text x={180} y={50} className={lg.figTxt}>
        보이는 비율 ≈ 1 → 위
      </text>
      <text x={180} y={68} className={lg.figTxt}>
        보이는 비율 &lt; 1 → 가려짐(아래)
      </text>
      <text x={180} y={86} className={lg.figTxt}>
        큰 순서 ≠ 위 순서
      </text>
      <ArrowDef />
    </svg>
  );
}
