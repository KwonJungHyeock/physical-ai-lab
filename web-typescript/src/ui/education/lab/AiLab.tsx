'use client';

/**
 * 산업단지 · AI 연구소 — 종합 미션 (myCobot 280 RDK X5 + 공식 AI 키트). The same screen and six steps as
 * the other sites (SitePanel; the lesson script is content-markdown/sites/ai.md), the kit in the 교육 3D
 * view (LearnStage, the real arm with the suction pump), the engine's runs played back (AiCell), and the
 * kit camera's own picture beside it (the photo, the program's colour labels, what it found):
 *
 *  ① 색이 섞여 있다 — the overlapping official HSV ranges;
 *  ② 시연을 보고 따라 하기 — replaying a demonstration vs a policy;
 *  ③ 처음 보는 물건 — a part's height in the pipeline (pick height, parallax).
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  AI_DEFAULTS,
  AI_FIXES,
  AI_THINGS,
  BIN_OF,
  CAMERA,
  DEMOS,
  POST,
  ROI,
  SEAL_MM,
  TRIALS,
  findThings,
  kitPicture,
  measuredHue,
  officialRanges,
  partPreview,
  policy,
  runAi,
  scoreAi,
  toPixel,
  type AiProblem,
  type AiRun,
  type AiValues,
  type DemoMode,
  type DemoValues,
  type HsvValues,
  type PartValues,
  type Picture,
  type Range,
  type Thing,
} from '@/engine/education/lab/ai';
import { AI_TEXT } from '@/engine/education/lab/aiText';
import type { Mm } from '@/engine/education/lab/cell';
import { siteStepIndex, SITE_STEPS, type SiteStepId } from '@/engine/education/lab/siteText';
import type { StudyLevel } from '@/engine/education/roadmap';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { BLOCK_MM, CAL_BOARD, HOME_DEG } from '@/engine/simulator/board';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import AiCell, { AiPlayback, thingColor, type AiMarker, type AiOverlay } from './AiCell';
import { AiAround, LOOKS } from './ambient/Around';
import type { CellDim } from './CellKit';
import { ArrowDef, Knob, PROBS, RecordSheet, SitePanel, answeredUpTo, fmt, freshFlow, type FlowState, type MeasureRow } from './SiteFlow';
import css from './lab.module.css';
import lg from './site.module.css';

/** The kit from the front right, a little above (three.js metres, y up): camera, then target. */
export const AI_VIEW: ViewPose = [0.7, 0.55, 0.5, 0.14, 0.06, 0.0];
const SLOW = 0.35;
const SLOW_LEAD_S = 1.6;

interface Runs {
  before: AiRun | null;
  latest: AiRun | null;
}

interface ProbState extends FlowState {
  step: SiteStepId;
  values: AiValues;
  runs: Runs;
}

const fresh = (p: AiProblem): ProbState => ({ ...freshFlow(AI_TEXT[p]), step: 'brief', values: AI_DEFAULTS[p], runs: { before: null, latest: null } });

declare global {
  interface Window {
    /** Open a problem of AI 연구소 at a step, optionally with the worked fix run (and everything before it answered), and the playback at a time or its end (guide pictures, tools/check). */
    __aiOpen?: (step: SiteStepId, opts?: { prob?: AiProblem; solve?: boolean; at?: number | 'end' }) => void;
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

/** The things of a problem (② the red block's three spots). */
const thingsOf = (p: AiProblem): readonly Thing[] => (p === 2 ? TRIALS.map(([x, y]) => ({ color: '빨강' as const, hue: 4, sat: 0.78, val: 0.82, x, y, h: BLOCK_MM, shape: 'cube' as const, bin: 'D' as const })) : AI_THINGS[p]);
const startThings = (p: AiProblem) => thingsOf(p).map((t, k) => ({ c: [t.x, t.y, p === 2 && k > 0 ? -999 : 0] as Mm, mode: 'board' as const }));

/** The kit camera's picture of a problem (made once). */
const pictures = new Map<AiProblem, Picture>();
function pictureOf(p: 1 | 3): Picture {
  let x = pictures.get(p);
  if (!x) {
    x = kitPicture(AI_THINGS[p]);
    pictures.set(p, x);
  }
  return x;
}

/* --- 원인 찾기 --------------------------------------------------------------------------------- */

interface AiRow extends MeasureRow {
  dim?: CellDim;
  markers?: AiMarker[];
  misses?: { from: Mm; to: Mm }[];
}

function measureRows(chain: readonly ChainSegment[], prob: AiProblem, run: AiRun | null): AiRow[] {
  if (prob === 1) {
    const list = AI_THINGS[1];
    const pic = pictureOf(1);
    const hue = list.map((t) => measuredHue(pic, t));
    const mk = (k: number, ok: boolean): AiMarker => ({ key: `h${k}`, mm: [list[k].x, list[k].y, BLOCK_MM + 14], ok, text: `${list[k].color} · H ${hue[k]}` });
    const g = run?.found.find((f) => f.k === 2);
    return [
      { label: '블록 색상 H (빨강 · 노랑 · 파랑)', value: `${hue[0]} · ${hue[1]} · ${hue[3]}`, markers: [mk(0, true), mk(1, true), mk(3, true)] },
      { label: '연두색 초록 블록의 색상 H', value: `${hue[2]}`, bad: true, markers: [mk(2, false)] },
      { label: '노랑 범위 · 초록 범위 (H)', value: '11 ~ 59 · 35 ~ 90 — 35 ~ 59 겹침', bad: true },
      { label: '검사 순서', value: '노랑 → 빨강 → 초록 → 파랑' },
      { label: '프로그램이 정한 초록 블록의 색 → 분류함', value: g ? `${g.color} → ${BIN_OF[g.color]}` : '—', bad: true },
    ];
  }
  if (prob === 2) {
    const v = AI_DEFAULTS[2] as DemoValues;
    const pols = TRIALS.map((t) => policy(chain, v, t));
    const miss = TRIALS.map((t, i) => Math.hypot(pols[i].at[0] - t[0], pols[i].at[1] - t[1]));
    return [
      { label: '시연 1 자리 (지금 프로그램)', value: `(${DEMOS[0][0]}, ${DEMOS[0][1]})`, markers: [{ key: 'd0', mm: [DEMOS[0][0], DEMOS[0][1], 30], ok: true, text: '시연 1' }] },
      { label: '오늘 블록 자리 (1 · 2 · 3회)', value: TRIALS.map(([x, y]) => `(${x}, ${y})`).join(' · '), markers: TRIALS.map(([x, y], i) => ({ key: `t${i}`, mm: [x, y, BLOCK_MM + 14] as Mm, ok: false, text: `${i + 1}회` })) },
      { label: '로봇이 내려간 곳', value: `세 번 모두 (${fmt(pols[0].at[0])}, ${fmt(pols[0].at[1])})`, bad: true },
      { label: '빗나간 거리 (1 · 2 · 3회)', value: miss.map((x) => `${fmt(x, 1)} mm`).join(' · '), bad: true, misses: TRIALS.map(([x, y], i) => ({ from: [pols[i].at[0], pols[i].at[1], 30] as Mm, to: [x, y, 30] as Mm })) },
      { label: '기록해 둔 시연 수 · 지금 쓰는 시연', value: `${DEMOS.length}개 · 시연 1 하나 (그대로 재생)` },
    ];
  }
  const prev = partPreview(AI_DEFAULTS[3] as PartValues);
  const list = AI_THINGS[3];
  const red = prev.find((x) => x.k === 0)!;
  const press = run?.events.find((e) => e.kind === 'press');
  return [
    { label: '부품 높이 · 프로그램이 아는 높이', value: `${POST.h} mm · ${BLOCK_MM} mm`, bad: true, dim: { key: 'h', a: [list[0].x - 26, list[0].y, 0], b: [list[0].x - 26, list[0].y, POST.h], text: `${POST.h} mm`, color: '#3454d1', label: 'l' } },
    { label: '컵이 누른 깊이', value: press ? `${fmt((press.value ?? 0) + 3)} mm — 작업 중지` : '—', bad: true, markers: press?.at ? [{ key: 'press', mm: press.at, ok: false, text: '누른 곳' }] : [] },
    { label: '카메라 높이 (판에서)', value: `${CAMERA.z} mm` },
    {
      label: '빨강 부품: 카메라 아래에서 · 빗나간 거리',
      value: `${fmt(red.r)} mm · ${fmt(red.miss, 1)} mm`,
      bad: true,
      misses: [{ from: [red.x, red.y, POST.h + 2], to: [list[0].x, list[0].y, POST.h + 2] }],
      markers: [{ key: 'aim', mm: [red.x, red.y, POST.h + 2], ok: false, text: '프로그램이 간 곳' }],
    },
    { label: '나머지 부품 빗나간 거리', value: prev.filter((x) => x.k !== 0).map((x) => `${fmt(x.miss, 1)}`).join(' · ') + ' mm', bad: true },
  ];
}

function predictionOf(prob: AiProblem, run: AiRun | null): number | null {
  if (!run) return null;
  const s = scoreAi(prob, run);
  if (s.pass) return 0;
  if (prob === 1) return run.events.some((e) => e.kind === 'wrong') ? 2 : 1;
  if (prob === 2) return run.picks.length && run.picks.every((x) => x.offset > BLOCK_MM) ? 2 : 1;
  return run.events.some((e) => e.kind === 'press') ? 2 : 1;
}

const MODE_NAME: Record<DemoMode, string> = { replay: '그대로 재생', blend: '시연 섞기', relative: '블록 기준' };

function valuesText(p: AiProblem, v: AiValues): string {
  if (p === 1) {
    const a = v as HsvValues;
    return `노랑 11 ~ ${a.yellowHi} · 초록 ${a.greenLo} ~ 90`;
  }
  if (p === 2) {
    const d = v as DemoValues;
    return d.mode === 'blend' ? `시연 10개 섞기 · p ${d.power}` : MODE_NAME[d.mode];
  }
  const t = v as PartValues;
  return `물체 높이 ${t.height} mm · 시차 보정 ${t.parallax ? '켬' : '끔'}`;
}

export default function AiLab({ robot, chain, gripperRobot, hidden, level = 'hs', saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<AiProblem>(1);
  const [st, setSt] = useState<Record<AiProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<AiProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [record, setRecord] = useState(false);
  const [player] = useState(() => new AiPlayback());
  const slowFrom = useRef<number | null>(null);
  const s = st[prob];
  const { step, runs } = s;

  useEffect(() => {
    for (const p of PROBS) if (solved[p]) onSolved?.(p);
  }, [solved, onSolved]);

  const patch = useCallback((p: AiProblem, ch: Partial<ProbState> | ((x: ProbState) => Partial<ProbState>)) => {
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
    (run: AiRun | null, at: number | 'end' = 0, slowAt: number | null = null, hold = false) => {
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
      const v = which === 'before' ? AI_DEFAULTS[p] : st[p].values;
      setBusy(true);
      window.setTimeout(() => {
        const run = runAi(chain, p, v);
        const sc = scoreAi(p, run);
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

  const shown = step === 'run' || step === 'cause' ? runs.before : step === 'compare' || step === 'done' ? runs.latest : null;
  const fail = shown?.failure ?? null;
  const lastShown = useRef<{ run: AiRun | null; step: SiteStepId } | null>(null);
  useEffect(() => {
    const last = lastShown.current;
    if (last && last.run === shown && last.step === step) return;
    lastShown.current = { run: shown, step };
    // The line runs on after a wrong bin or a miss: 원인 찾기 holds the run at that moment.
    const hold = step === 'cause' && !!fail && !shown?.frames[shown.frames.length - 1].alarm;
    play(shown, step === 'cause' ? (fail ? fail.t + 0.02 : 'end') : step === 'done' ? 'end' : 0, step === 'run' && fail ? Math.max(0, fail.t - SLOW_LEAD_S) : null, hold);
  }, [shown, step, fail, play]);

  const failAt = fail?.at ?? null;
  const focus = useMemo<ViewPose | null>(() => (failAt && ((step === 'run' && slow) || step === 'cause') ? closeLook(failAt) : null), [failAt, step, slow]);

  useEffect(() => {
    player.setStill(startThings(prob));
  }, [player, prob]);

  const fi = shown ? Math.min(shown.frames.length - 1, Math.round(playT / 0.02)) : 0;
  const frame = shown ? shown.frames[fi] : null;
  const rows = useMemo(() => measureRows(chain, prob, runs.before), [chain, prob, runs.before]);

  const vDeferred = useDeferredValue(s.values);
  const demoPrev = useMemo(() => (prob === 2 && step === 'fix' ? TRIALS.map((t) => policy(chain, vDeferred as DemoValues, t)) : null), [chain, prob, step, vDeferred]);
  const partPrev = useMemo(() => (prob === 3 && step === 'fix' ? partPreview(vDeferred as PartValues) : null), [prob, step, vDeferred]);

  const overlay = useMemo<AiOverlay>(() => {
    const o: AiOverlay = { markers: [], dims: [], misses: [], demos: prob === 2 };
    if (step === 'fix') {
      if (prob === 2 && demoPrev)
        demoPrev.forEach((pol, i) => {
          const [x, y] = TRIALS[i];
          const miss = Math.hypot(pol.at[0] - x, pol.at[1] - y);
          o.markers!.push({ key: `p${i}`, mm: [pol.at[0], pol.at[1], 30], ok: miss <= SEAL_MM, text: `${i + 1}회 · ${fmt(miss, 1)} mm` });
          if (miss > 1) o.misses!.push({ from: [pol.at[0], pol.at[1], 30], to: [x, y, 30] });
        });
      if (prob === 3 && partPrev)
        partPrev.forEach((g) => {
          const t = AI_THINGS[3][g.k];
          o.markers!.push({ key: `g${g.k}`, mm: [g.x, g.y, POST.h + 2], ok: g.miss <= SEAL_MM, text: `${fmt(g.miss, 1)} mm` });
          if (g.miss > 1) o.misses!.push({ from: [g.x, g.y, POST.h + 2], to: [t.x, t.y, POST.h + 2] });
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
  }, [prob, step, s.meas, rows, shown, fi, demoPrev, partPrev]);

  const scene = useMemo<LearnScene>(() => ({ angles: HOME_DEG, tool: 'pump', pumpOn: false }), []);

  useEffect(() => {
    window.__aiOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      const T = AI_TEXT[p];
      const before = st[p].runs.before ?? runAi(chain, p, AI_DEFAULTS[p]);
      let latest = st[p].runs.latest;
      let values = st[p].values;
      let log = st[p].log;
      if (opts.solve) {
        values = AI_FIXES[p];
        latest = runAi(chain, p, values);
        const sc = scoreAi(p, latest);
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
      delete window.__aiOpen;
    };
  }, [chain, st, prob, patch, play, player]);

  const sb = runs.before ? scoreAi(prob, runs.before) : null;
  const sl = runs.latest ? scoreAi(prob, runs.latest) : null;
  const at = siteStepIndex(step);
  const T = AI_TEXT[prob];
  const list = thingsOf(prob);
  const rightNow = frame ? frame.things.filter((x, k) => x.mode === 'binned' && x.bin === list[k]?.bin).length : 0;
  const camRanges = prob === 1 ? (step === 'fix' ? officialRanges((vDeferred as HsvValues).yellowHi, (vDeferred as HsvValues).greenLo) : officialRanges((shown?.values as HsvValues | undefined)?.yellowHi ?? 59, (shown?.values as HsvValues | undefined)?.greenLo ?? 35)) : officialRanges();
  const camPart = prob === 3 ? (step === 'fix' ? (vDeferred as PartValues) : ((shown?.values as PartValues | undefined) ?? (AI_DEFAULTS[3] as PartValues))) : null;

  return (
    <div className={`${css.lab} ${lg.ai}`} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 산업단지
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          AI 연구소
          <small>종합 미션</small>
        </b>
        <nav className={css.probs} aria-label="문제">
          {PROBS.map((p) => (
            <button key={p} type="button" aria-current={p === prob || undefined} data-solved={solved[p] || undefined} onClick={() => setProb(p)} title={`${p} ${AI_TEXT[p].title} · ${AI_TEXT[p].about}`}>
              <span className={css.num}>{p}</span>
              <span className={css.probName}>{AI_TEXT[p].title}</span>
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

      <section className={css.stage} aria-label="3D AI 키트">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={AI_VIEW} focus={focus} live={player.arm} look={LOOKS.ai}>
          <AiAround />
          <AiCell player={player} prob={prob} things={list} overlay={overlay} />
        </LearnStage>
        {fail && playT >= fail.t && <div className={lg.alarm}>⚠ {fail.text.replace(/ — 작업 중지$/, '')}</div>}
        {shown && !fail && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ {scoreAi(prob, shown).headline}</div>}
        {slow && playing && <div className={lg.slowPill}>느린 재생 · 문제가 생기는 순간</div>}
        {prob !== 2 && <KitCam prob={prob as 1 | 3} ranges={camRanges} part={camPart} />}
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
          boss="한 박사"
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
                <dd>{prob === 3 ? `원기둥 부품 Ø${POST.d} × ${POST.h} mm 4개` : prob === 2 ? '빨간 블록 25 mm (세 번, 매번 다른 자리)' : '블록 25 mm 4개 (새 세트)'}</dd>
                <dt>옮기기</dt>
                <dd>보정판 → 색깔별 분류함 (빨강 D · 초록 C · 파랑 A · 노랑 B)</dd>
                <dt>기준</dt>
                <dd>{prob === 1 ? '모두 제 색 분류함에' : `흡착 컵이 윗면 가운데에서 ${SEAL_MM} mm 안 · 제 분류함에`}</dd>
                <dt>장비</dt>
                <dd>공식 AI 키트 — 위 카메라 · 흡착 펌프 · 분류함 4개</dd>
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
          fixTitle={prob === 1 ? '색 범위를 고쳐요' : prob === 2 ? '시연을 쓰는 방법을 바꿔요' : '물체 높이를 파이프라인에 넣어요'}
          hmi={
            <>
              {prob === 1 && <HmiHsv v={s.values as HsvValues} on={(values) => patch(prob, { values })} />}
              {prob === 2 && <HmiDemo v={s.values as DemoValues} preview={demoPrev} on={(values) => patch(prob, { values })} />}
              {prob === 3 && <HmiPart v={s.values as PartValues} preview={partPrev} on={(values) => patch(prob, { values })} />}
            </>
          }
          compare={sb && sl && <CompareTable before={sb} latest={sl} />}
          hit={playing ? null : predictionOf(prob, runs.latest)}
          pass={!!sl?.pass}
          notYet={sl && !sl.pass ? sl.headline + '.' : null}
          fig={<PrincipleFig prob={prob} />}
          nextLabel={prob < 3 ? `문제 ${prob + 1} · ${AI_TEXT[(prob + 1) as AiProblem].title} →` : '산업단지로 →'}
          patch={(ch) => patch(prob, ch)}
          onRunBefore={() => go('before')}
          onRunFix={() => go('latest')}
          onStep={setStep}
          onRecord={() => setRecord(true)}
          onNext={() => (prob < 3 ? setProb((prob + 1) as AiProblem) : onBack())}
        />
      </aside>
      {record && <RecordSheet site="AI 연구소 (종합 미션)" tone={lg.ai} texts={AI_TEXT} st={st} solved={solved} level={level} onClose={() => setRecord(false)} />}
    </div>
  );
}

function programLine(p: AiProblem): string {
  if (p === 1) return 'aikit_color.py 그대로 — 노랑 11 ~ 59 · 빨강 0 ~ 8 · 초록 35 ~ 90 · 파랑 100 ~ 124 순서로 검사';
  if (p === 2) return '시연 1 (135, −25)에서 기록한 관절 각을 그대로 재생 → D 분류함';
  return `물체 윗면 = ${BLOCK_MM} mm (블록용) · 픽셀 → mm는 보정판(높이 0) 기준 비율 그대로`;
}

/* --- the kit camera window -------------------------------------------------------------------- */

const LABEL_HEX: Record<string, string> = { yellow: '#f2c230', red: '#ff5a4a', green: '#32d583', blue: '#5b8cff', cyan: '#5b8cff' };

function KitCam({ prob, ranges, part }: { prob: 1 | 3; ranges: Range[]; part: PartValues | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'photo' | 'mask'>('mask');
  const [open, setOpen] = useState(true);
  const pic = pictureOf(prob);
  const things = AI_THINGS[prob];
  const found = useMemo(() => findThings(pic, ranges, things), [pic, ranges, things]);

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.setTransform(1, 0, 0, 1, -ROI.u0, -ROI.v0);
    const img = g.createImageData(pic.width, pic.height);
    const boxes = found.map((f) => ({ f, hex: LABEL_HEX[f.range] }));
    for (let i = 0; i < pic.width * pic.height; i += 1) {
      const u = i % pic.width;
      const v = (i - u) / pic.width;
      let r = pic.data[i * 4];
      let gg = pic.data[i * 4 + 1];
      let b = pic.data[i * 4 + 2];
      if (mode === 'mask') {
        const inBox = boxes.find(({ f }) => u >= f.u0 && u <= f.u1 && v >= f.v0 && v <= f.v1);
        if (!inBox) {
          r *= 0.3;
          gg *= 0.3;
          b *= 0.3;
        }
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, -ROI.u0, -ROI.v0);
    g.lineWidth = 3;
    g.textAlign = 'center';
    g.font = '800 12px system-ui, sans-serif';
    for (const { f, hex } of boxes) {
      g.strokeStyle = hex;
      g.strokeRect(f.u0 - 2, f.v0 - 2, f.u1 - f.u0 + 4, f.v1 - f.v0 + 4);
      g.fillStyle = hex;
      g.fillText(`${f.color}→${BIN_OF[f.color]}`, f.u, f.v1 + 13);
    }
    if (part) {
      // ③: where the program sends the cup (cross) vs the top's real centre (dot), in the picture.
      for (const f of found) {
        const t = things[f.k];
        if (!t) continue;
        const [x, y] = part.parallax ? [CAMERA.x + (f.x - CAMERA.x) * ((CAMERA.z - part.height) / CAMERA.z), CAMERA.y + (f.y - CAMERA.y) * ((CAMERA.z - part.height) / CAMERA.z)] : [f.x, f.y];
        const aim = toPixel(x, y, part.height);
        const top = toPixel(t.x, t.y, t.h);
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.arc(top.u, top.v, 3, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = '#ff6b6b';
        g.beginPath();
        g.moveTo(aim.u - 6, aim.v);
        g.lineTo(aim.u + 6, aim.v);
        g.moveTo(aim.u, aim.v - 6);
        g.lineTo(aim.u, aim.v + 6);
        g.stroke();
      }
    }
    g.textAlign = 'start';
  }, [pic, found, mode, part, things]);

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
          <canvas ref={ref} width={ROI.u1 - ROI.u0} height={ROI.v1 - ROI.v0} aria-label="키트 카메라 사진과 색 판정" />
          <footer>
            보정판 부분 · 찾은 덩어리 {found.length}개 — 상자 위 글자: 프로그램이 정한 색 → 분류함{part ? ' · 흰 원: 윗면 가운데, 빨간 +: 프로그램이 보내는 곳' : ''}
          </footer>
        </>
      )}
    </div>
  );
}

/* --- pieces ---------------------------------------------------------------------------------- */

function Events({ run, onSeek }: { run: AiRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  return (
    <ol className={lg.events} aria-label="작업 기록">
      {run.events.map((e, i) => (
        <li key={i} data-k={['wrong', 'miss', 'press', 'left', 'unreachable'].includes(e.kind) ? 'bad' : undefined}>
          <button type="button" onClick={() => onSeek(Math.max(0, e.t - 0.6))}>
            <time>{e.t.toFixed(1)} s</time>
            <span>{e.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

const keep = (v: string) => (v.length <= 14 ? v.replace(/ /g, ' ') : v);

function CompareTable({ before, latest }: { before: ReturnType<typeof scoreAi>; latest: ReturnType<typeof scoreAi> }) {
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

/* --- 값 고치기 ---------------------------------------------------------------------------------- */

function HmiHsv({ v, on }: { v: HsvValues; on(v: HsvValues): void }) {
  const pic = pictureOf(1);
  const list = AI_THINGS[1];
  const hues = useMemo(() => list.map((t) => measuredHue(pic, t)), [pic, list]);
  const found = useMemo(() => findThings(pic, officialRanges(v.yellowHi, v.greenLo), list), [pic, v, list]);
  const x = (h: number) => (h / 130) * 100;
  const bars: { name: string; lo: number; hi: number; hex: string; row: number }[] = [
    { name: '노랑 (1)', lo: 11, hi: v.yellowHi, hex: '#f2c230', row: 0 },
    { name: '빨강 (2)', lo: 0, hi: 8, hex: '#ff5a4a', row: 1 },
    { name: '초록 (3)', lo: v.greenLo, hi: 90, hex: '#32d583', row: 2 },
    { name: '파랑 (4)', lo: 100, hi: 124, hex: '#5b8cff', row: 3 },
  ];
  return (
    <div className={lg.hmi}>
      <header>
        <span>VISION · 색 범위 (H 0 ~ 180)</span>
        <i>● 위에서부터 차례로 검사</i>
      </header>
      <div style={{ position: 'relative', height: 92, margin: '4px 2px 16px' }}>
        {bars.map((b) => (
          <div key={b.name} style={{ position: 'absolute', left: `${x(b.lo)}%`, width: `${Math.max(0.5, x(b.hi) - x(b.lo))}%`, top: b.row * 19, height: 14, background: b.hex, borderRadius: 4, opacity: 0.85 }}>
            <span style={{ position: 'absolute', left: b.hi - b.lo < 15 ? 'calc(100% + 4px)' : 4, top: -1, fontSize: 10, fontWeight: 800, color: b.hi - b.lo < 15 ? b.hex : '#141a22', whiteSpace: 'nowrap' }}>{b.name}</span>
          </div>
        ))}
        {hues.map((h, k) => (
          <span key={k} style={{ position: 'absolute', left: `${x(h)}%`, top: 78, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 800, color: thingColor(list[k]), whiteSpace: 'nowrap' }}>
            ▲{list[k].color} {h}
          </span>
        ))}
      </div>
      <Knob id="ai-yh" label="노랑 범위 위 끝" unit="" v={v.yellowHi} min={20} max={70} note="공식 값 59 — 초록 범위(35부터)와 겹치는지 보세요" on={(yellowHi) => on({ ...v, yellowHi })} />
      <Knob id="ai-gl" label="초록 범위 아래 끝" unit="" v={v.greenLo} min={25} max={60} note="공식 값 35" on={(greenLo) => on({ ...v, greenLo })} />
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>블록</th>
            <th>판정 → 분류함</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t, k) => {
            const f = found.find((x) => x.k === k);
            const ok = !!f && BIN_OF[f.color] === t.bin;
            return (
              <tr key={k}>
                <td>
                  {t.color} (H {hues[k]})
                </td>
                <td data-c={ok ? 'ok' : 'press'}>{f ? `${f.color} → ${BIN_OF[f.color]}${ok ? '' : ` (제자리 ${t.bin})`}` : '못 찾음'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HmiDemo({ v, preview, on }: { v: DemoValues; preview: ReturnType<typeof policy>[] | null; on(v: DemoValues): void }) {
  // A map of the board: demonstrations (grey, the first orange), today's blocks (red squares), where the cup goes (×).
  const S = 1.2;
  const px = (y: number) => 90 + (y - CAL_BOARD.y) * S;
  const py = (x: number) => 20 + (x - (CAL_BOARD.x - 75)) * S;
  return (
    <div className={lg.hmi}>
      <header>
        <span>POLICY · 시연을 쓰는 방법</span>
        <i>● 시연 {DEMOS.length}개 기록됨</i>
      </header>
      <div className={lg.jog}>
        {(['replay', 'blend', 'relative'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={v.mode === m} onClick={() => on({ ...v, mode: m })} style={v.mode === m ? { borderColor: '#6fe3a5', color: '#6fe3a5' } : undefined}>
            {MODE_NAME[m]}
          </button>
        ))}
      </div>
      {v.mode === 'blend' && <Knob id="ai-p" label="섞는 지수 p (비율 ∝ 1 ÷ 거리ᵖ)" unit="" v={v.power} min={1} max={4} step={1} note="클수록 가까운 시연에 쏠려요" on={(power) => on({ ...v, power })} />}
      <svg viewBox="0 0 180 210" style={{ width: '100%', maxWidth: 260, display: 'block', margin: '6px auto', background: '#f7f8f8', borderRadius: 8 }} role="img" aria-label="보정판 위 시연 자리와 오늘 블록 자리">
        <text x={6} y={12} fontSize={8} fill="#667085">
          로봇 쪽 ↑ · 왼쪽 = +y
        </text>
        {DEMOS.map(([x, y], i) => (
          <g key={i}>
            <circle cx={180 - px(y)} cy={py(x)} r={6} fill="none" stroke={i === 0 ? '#f08c2e' : '#98a2b3'} strokeWidth={2} />
            <text x={180 - px(y)} y={py(x) + 3} fontSize={7} textAnchor="middle" fill="#344054">
              {i + 1}
            </text>
          </g>
        ))}
        {TRIALS.map(([x, y], i) => {
          const at = preview?.[i]?.at;
          return (
            <g key={i}>
              <rect x={180 - px(y) - 7.5} y={py(x) - 7.5} width={15} height={15} rx={2} fill="#d63a26" opacity={0.85} />
              <text x={180 - px(y)} y={py(x) + 3} fontSize={8} textAnchor="middle" fill="#fff" fontWeight={800}>
                {i + 1}회
              </text>
              {at && (
                <>
                  <line x1={180 - px(at[1])} y1={py(at[0])} x2={180 - px(y)} y2={py(x)} stroke="#e5484d" strokeWidth={1} strokeDasharray="2 2" />
                  <text x={180 - px(at[1])} y={py(at[0]) + 3} fontSize={11} textAnchor="middle" fill="#141a22" fontWeight={800}>
                    ×
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>회</th>
            <th>블록 자리</th>
            <th>빗나감</th>
          </tr>
        </thead>
        <tbody>
          {TRIALS.map(([x, y], i) => {
            const at = preview?.[i]?.at;
            const miss = at ? Math.hypot(at[0] - x, at[1] - y) : NaN;
            return (
              <tr key={i}>
                <td>{i + 1}회</td>
                <td>
                  ({x}, {y})
                </td>
                <td data-c={!at ? undefined : miss <= SEAL_MM ? 'ok' : miss > BLOCK_MM ? 'press' : 'drop'}>{at ? `${fmt(miss, 1)} mm${miss > BLOCK_MM ? ' · 허공' : miss > SEAL_MM ? ' · 가장자리' : ''}` : '…'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small className={lg.hmiNote}>지도: 동그라미 = 시연 자리, 빨간 네모 = 오늘 블록, × = 컵이 내려갈 곳.</small>
    </div>
  );
}

function HmiPart({ v, preview, on }: { v: PartValues; preview: ReturnType<typeof partPreview> | null; on(v: PartValues): void }) {
  const press = v.height < POST.h - 2;
  return (
    <div className={lg.hmi}>
      <header>
        <span>PIPELINE · 물체 정보</span>
        <i>● 카메라 {CAMERA.z} mm · 부품 {POST.h} mm</i>
      </header>
      <Knob id="ai-h" label="물체 윗면 높이 (프로그램이 쓰는 값)" unit="mm" v={v.height} min={20} max={80} step={5} note="집는 높이 = 이 값 · 시차 보정에도 써요" on={(height) => on({ ...v, height })} />
      <div className={lg.jog}>
        <button type="button" aria-pressed={v.parallax} onClick={() => on({ ...v, parallax: !v.parallax })} style={v.parallax ? { borderColor: '#6fe3a5', color: '#6fe3a5' } : undefined}>
          {v.parallax ? '✓ 시차 보정 켬 — 카메라 축 쪽으로 (Z − h) ÷ Z배' : '시차 보정 꺼짐 (누르면 켜기)'}
        </button>
      </div>
      <table className={lg.layers}>
        <thead>
          <tr>
            <th>부품</th>
            <th>카메라 아래에서</th>
            <th>빗나감</th>
          </tr>
        </thead>
        <tbody>
          {(preview ?? []).map((g) => (
            <tr key={g.k}>
              <td>{AI_THINGS[3][g.k].color}</td>
              <td>{fmt(g.r)} mm</td>
              <td data-c={g.miss <= SEAL_MM ? 'ok' : 'press'}>{fmt(g.miss, 1)} mm</td>
            </tr>
          ))}
          <tr>
            <td>집는 높이</td>
            <td />
            <td data-c={press ? 'press' : 'ok'}>{press ? `${POST.h - v.height + 3} mm 누름` : '맞음'}</td>
          </tr>
        </tbody>
      </table>
      <small className={lg.hmiNote}>카메라 창의 흰 원은 윗면 가운데, 빨간 +는 프로그램이 컵을 보내는 곳이에요.</small>
    </div>
  );
}

/* --- 해결 · 원리 ---------------------------------------------------------------------------------- */

function PrincipleFig({ prob }: { prob: AiProblem }) {
  if (prob === 1) {
    const x = (h: number) => 20 + (h / 130) * 280;
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="겹친 범위는 먼저 검사한 색이 가져간다">
        <rect x={x(11)} y={20} width={x(59) - x(11)} height={14} rx={3} fill="#f2c230" opacity={0.6} />
        <rect x={x(35)} y={40} width={x(90) - x(35)} height={14} rx={3} fill="#32d583" opacity={0.6} />
        <rect x={x(35)} y={16} width={x(59) - x(35)} height={42} fill="none" stroke="#e5484d" strokeDasharray="4 3" />
        <text x={x(11)} y={14} className={lg.figTxt}>
          노랑 11 ~ 59 (먼저)
        </text>
        <text x={x(62)} y={52} className={lg.figTxt}>
          초록 35 ~ 90
        </text>
        <line x1={x(50)} x2={x(50)} y1={62} y2={74} className={lg.figArrow} />
        <text x={x(50) - 20} y={86} className={lg.figStrong}>
          연두 50 → 노랑?
        </text>
        <text x={x(80)} y={100} className={lg.figTxt}>
          겹치지 않게: 노랑 위 끝 34
        </text>
        <ArrowDef />
      </svg>
    );
  }
  if (prob === 2) {
    return (
      <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="그대로 재생, 섞기, 블록 기준">
        <circle cx={40} cy={50} r={8} className={lg.figMarkOld} />
        <rect x={90} y={30} width={14} height={14} fill="#d63a26" />
        <line x1={40} y1={50} x2={92} y2={36} stroke="#e5484d" strokeDasharray="3 2" />
        <text x={14} y={80} className={lg.figTxt}>
          그대로 재생
        </text>
        <circle cx={150} cy={30} r={5} className={lg.figMarkOld} />
        <circle cx={190} cy={30} r={5} className={lg.figMarkOld} />
        <circle cx={150} cy={70} r={5} className={lg.figMarkOld} />
        <circle cx={190} cy={70} r={5} className={lg.figMarkOld} />
        <rect x={163} y={43} width={14} height={14} fill="#d63a26" />
        <text x={168} y={54} fontSize={10}>
          ×
        </text>
        <text x={140} y={94} className={lg.figTxt}>
          섞기 (몇 mm 남음)
        </text>
        <rect x={250} y={43} width={14} height={14} fill="#d63a26" />
        <circle cx={257} cy={50} r={3} className={lg.figMark} />
        <text x={226} y={80} className={lg.figTxt}>
          블록 기준 + 카메라
        </text>
        <text x={226} y={20} className={lg.figStrong}>
          정책 = 상황 → 동작
        </text>
        <ArrowDef />
      </svg>
    );
  }
  return (
    <svg className={lg.fig} viewBox="0 0 320 110" role="img" aria-label="높은 윗면은 카메라에서 바깥으로 보인다">
      <rect x={60} y={6} width={30} height={10} rx={2} className={lg.figCup} />
      <line x1={75} x2={75} y1={16} y2={100} className={lg.figGuide} />
      <line x1={20} x2={300} y1={100} y2={100} className={lg.figArrow} />
      <rect x={150} y={60} width={24} height={40} className={lg.figOld} />
      <line x1={75} y1={16} x2={162} y2={60} className={lg.figUp} />
      <line x1={162} y1={60} x2={196} y2={100} className={lg.figUp} strokeDasharray="4 3" />
      <circle cx={196} cy={100} r={3} fill="#e5484d" />
      <text x={200} y={96} className={lg.figTxt}>
        사진이 말하는 자리
      </text>
      <text x={200} y={40} className={lg.figStrong}>
        시차 = r × h ÷ (Z − h)
      </text>
      <text x={200} y={58} className={lg.figTxt}>
        높이 h → 집는 높이 · 좌표 둘 다
      </text>
      <ArrowDef />
    </svg>
  );
}
