'use client';

/**
 * 산업단지 · 물류 센터 — 팔레타이징 (myCobot 280 RDK X5 + 흡착 펌프, real size). One screen like
 * the conveyor lab: a slim bar (← 산업단지, the site, problems ①②③, the six steps), the cell in the
 * 교육 3D view (LearnStage, the real arm) with the line's board over it, and one panel with what
 * the step needs: 작업 지시 → 가동 · 문제 → 원인 찾기 → 값 고치기 (operator panel, a prediction,
 * hints) → 다시 가동 · 비교 → 해결 · 원리 (the principle card and the theory PDF).
 *
 *  ① 쌓다가 무너진다 — the place height per layer (층 간격, 여유);
 *  ② 빨리 하니 미끄러진다 — speeds with and without a box against the suction cup's grip;
 *  ③ 팔레트 자리가 바뀐다 — teach the pallet's reference point again with the cup.
 *
 * Each run is computed by the engine with real rigid-body physics (engine/education/lab/pallet.ts)
 * in one go, then played back here (PalletCell).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import { LOGI_STEPS, LOGI_TEXT, type LogiStepId } from '@/engine/education/lab/logistics';
import {
  DEFAULTS,
  DROP_OK_MM,
  FEED,
  FIXES,
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
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import PalletCell, { PalletPlayback, type PalletOverlay } from './PalletCell';
import css from './lab.module.css';
import lg from './logistics.module.css';

/** The cell from the front right, a little above (three.js metres, y up): camera, then target. */
const LOGI_VIEW: ViewPose = [0.66, 0.46, 0.7, 0.1, 0.06, 0.1];
/** Playback speed of a run (they take 10 – 100 s of line time). */
const FAST = 3;
const PROBS: readonly LogiProblem[] = [1, 2, 3];
/** ②: the largest cup acceleration with a box at full travel speed (measured by the engine), for the operator panel's rough guide. */
const ACC_AT_FULL = 7.3;

interface Runs {
  before: PalletRun | null;
  latest: PalletRun | null;
}

interface ProbState {
  step: LogiStepId;
  reached: number;
  values: LogiValues;
  runs: Runs;
  pick: number | null;
  pred: number | null;
  hints: number;
  tries: number;
}

const fresh = (p: LogiProblem): ProbState => ({ step: 'brief', reached: 0, values: DEFAULTS[p], runs: { before: null, latest: null }, pick: null, pred: null, hints: 0, tries: 0 });

declare global {
  interface Window {
    /** Open a problem of 물류 at a step, optionally with the worked fix run, and the playback at a time or its end (guide pictures, tools/check). */
    __logiOpen?: (step: LogiStepId, opts?: { prob?: LogiProblem; solve?: boolean; at?: number | 'end' }) => void;
  }
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  hidden?: boolean;
  saved?: Partial<Record<1 | 2 | 3, boolean>>;
  onSolved?(p: 1 | 2 | 3): void;
  onBack(): void;
}

const stepIndex = (s: LogiStepId) => LOGI_STEPS.findIndex((x) => x.id === s);
const fmt = (v: number, d = 0) => v.toFixed(d);

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

export default function LogisticsLab({ robot, chain, gripperRobot, hidden, saved, onSolved, onBack }: Props) {
  const [prob, setProb] = useState<LogiProblem>(1);
  const [st, setSt] = useState<Record<LogiProblem, ProbState>>({ 1: fresh(1), 2: fresh(2), 3: fresh(3) });
  const [solved, setSolved] = useState<Record<LogiProblem, boolean>>({ 1: !!saved?.[1], 2: !!saved?.[2], 3: !!saved?.[3] });
  const [busy, setBusy] = useState(false);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(true);
  const [player] = useState(() => new PalletPlayback());
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
    });
    return () => player.listen(null);
  }, [player]);

  const play = useCallback(
    (run: PalletRun | null, at: number | 'end' = 0) => {
      player.start(run, at, fast ? FAST : 1);
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
        patch(p, (x) => ({ runs: { ...x.runs, [which]: run }, tries: which === 'latest' ? x.tries + 1 : x.tries, step: then, reached: Math.max(x.reached, stepIndex(then)) }));
        if (which === 'latest' && scoreStack(run, limitFor(p)).pass) setSolved((x) => ({ ...x, [p]: true }));
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
    play(shown, step === 'cause' ? (failT ?? 'end') : step === 'done' ? 'end' : 0);
  }, [shown, step, failT, play]);

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

  const frame = shown ? shown.frames[Math.min(shown.frames.length - 1, Math.round(playT / 0.02))] : null;
  const ref3 = prob === 3 ? (s.values as RefValues) : null;
  const refPose = useMemo(() => (ref3 && step === 'fix' ? toolPoseAt(chain, [ref3.x, ref3.y, PAL.top + 2]) : null), [chain, ref3, step]);

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
    if (prob === 1 && step === 'cause' && shown?.failure?.kind === 'press' && shown.failure.at) return { ...o, press: { at: shown.failure.at, mm: shown.failure.mm ?? 0 } };
    if (!shown) return o;
    const i = Math.min(shown.tip.length - 1, Math.round(playT / 0.02));
    return { ...o, path: shown.tip.slice(Math.max(0, i - 220), i + 1).filter((_, j) => j % 2 === 0) };
  }, [prob, step, s.values, runs.before, runs.latest, shown, playT]);

  const scene = useMemo<LearnScene>(() => ({ angles: refPose?.q ?? HOME_Q, tool: 'pump', pumpOn: false }), [refPose]);

  // The line's board: what has happened up to the playback time.
  const board = useMemo(() => {
    if (!shown) return null;
    const upTo = shown.events.filter((e) => e.t <= playT + 1e-6);
    const placed = upTo.filter((e) => e.kind === 'place' || e.kind === 'drop').length;
    const crushed = Math.max(0, ...(frame?.crush ?? [0]));
    return { placed, crushed, t: playT, acc: frame?.carrying ? frame.acc : 0, stopped: !!frame?.alarm };
  }, [shown, playT, frame]);

  // Guide pictures and checks: jump to a problem and step (with the worked fix run).
  useEffect(() => {
    window.__logiOpen = (step, opts = {}) => {
      const p = opts.prob ?? prob;
      void (async () => {
        const before = st[p].runs.before ?? (await runStack(chain, setupFor(p, DEFAULTS[p])));
        let latest = st[p].runs.latest;
        let values = st[p].values;
        if (opts.solve) {
          values = FIXES[p];
          latest = await runStack(chain, setupFor(p, values));
          if (scoreStack(latest, limitFor(p)).pass) setSolved((x) => ({ ...x, [p]: true }));
        }
        setProb(p);
        patch(p, (x) => ({ values, runs: { before, latest }, step, reached: Math.max(x.reached, stepIndex(step)), pick: step === 'cause' ? null : LOGI_TEXT[p].answer, pred: x.pred ?? 0 }));
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
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={LOGI_VIEW} live={player.arm}>
          <PalletCell player={player} overlay={overlay} pallet={prob === 3 ? PAL_MOVED : PAL_HOME} />
        </LearnStage>
        {board?.stopped && <div className={lg.alarm}>⚠ {shown?.failure?.text ?? '라인 정지'}</div>}
        {shown && !board?.stopped && shown.failure === null && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ 12개를 모두 쌓았어요 · {fmt(shown.durationS, 1)} s</div>}
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
                else if (player.t >= shown.durationS - 1e-6) player.start(shown, 0, fast ? FAST : 1);
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
                player.setRate(fast ? 1 : FAST);
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
          sb={sb}
          sl={sl}
          onValues={(values) => patch(prob, { values })}
          onPick={(pick) => patch(prob, { pick })}
          onPred={(pred) => patch(prob, { pred })}
          onHint={() => patch(prob, (x) => ({ hints: Math.min(3, x.hints + 1) }))}
          onSeek={(t) => {
            player.seek(t);
            player.pause();
            setPlaying(false);
          }}
          onRunBefore={() => go('before', DEFAULTS[prob], 'run')}
          onRunFix={() => go('latest', s.values, 'compare')}
          onStep={setStep}
          onNext={() => (prob < 3 ? setProb((prob + 1) as LogiProblem) : onBack())}
          onBack={onBack}
        />
      </aside>
    </div>
  );
}

/* --- the panel ------------------------------------------------------------------- */

interface PanelProps {
  prob: LogiProblem;
  st: ProbState;
  busy: boolean;
  solved: boolean;
  sb: StackScore | null;
  sl: StackScore | null;
  onValues(v: LogiValues): void;
  onPick(i: number): void;
  onPred(i: number): void;
  onHint(): void;
  onSeek(t: number): void;
  onRunBefore(): void;
  onRunFix(): void;
  onStep(s: LogiStepId): void;
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

function Panel(p: PanelProps) {
  const { prob, st, busy, sb, sl } = p;
  const T = LOGI_TEXT[prob];
  const { runs } = st;
  const failure = runs.before?.failure;
  switch (st.step) {
    case 'brief':
      return (
        <>
          <Head eyebrow={`작업 지시서 · ${T.order}`} title={T.orderTitle} solved={p.solved} />
          <div className={css.body}>
            <p className={css.story}>{T.brief}</p>
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
          <div className={css.body}>
            <p className={css.story}>{T.happened} 경광등이 빨갛게 켜졌어요.</p>
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
    case 'cause':
      return (
        <>
          <Head eyebrow="원인 찾기 · 측정" title={T.question} solved={p.solved} />
          <div className={css.body}>
            <p className={css.story}>{T.look}</p>
            <Measure prob={prob} run={runs.before} />
            <div className={lg.choices}>
              {T.choices.map((c, i) => (
                <button key={i} type="button" data-r={st.pick === i ? (i === T.answer ? 'ok' : 'no') : undefined} onClick={() => p.onPick(i)}>
                  {c}
                </button>
              ))}
            </div>
            {st.pick !== null && (
              <p className={lg.note}>
                <b>{st.pick === T.answer ? '맞아요.' : '다시 보세요.'}</b> {st.pick === T.answer ? T.why : T.whyNot}
              </p>
            )}
          </div>
          <div className={css.foot}>
            <span />
            <SiteBtn disabled={st.pick !== T.answer} onClick={() => p.onStep('fix')}>
              값 고치러 가기 →
            </SiteBtn>
          </div>
        </>
      );
    case 'fix':
      return (
        <>
          <Head eyebrow="조작반 · 이 문제에 필요한 값만" title={prob === 1 ? '놓는 높이를 고쳐요' : prob === 2 ? '속도를 나눠 정해요' : '기준점을 다시 잡아요'} solved={p.solved} />
          <div className={css.body}>
            {prob === 1 && <Hmi1 v={st.values as StackValues} on={p.onValues} />}
            {prob === 2 && <Hmi2 v={st.values as SpeedValues} on={p.onValues} />}
            {prob === 3 && <Hmi3 v={st.values as RefValues} on={p.onValues} />}
            <div className={lg.predict}>
              <b>가동 전에 예상해 보세요</b>
              <div>
                {T.predictions.map((t, i) => (
                  <button key={i} type="button" aria-pressed={st.pred === i} onClick={() => p.onPred(i)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className={lg.hints}>
              <button type="button" onClick={p.onHint} disabled={st.hints >= 3}>
                힌트 보기 ({st.hints}/3)
              </button>
              {T.hints.slice(0, st.hints).map((h) => (
                <p key={h.k} className={lg.hint}>
                  <em>{h.k}</em>
                  {h.t}
                </p>
              ))}
            </div>
          </div>
          <div className={css.foot}>
            <span />
            <SiteBtn disabled={busy || st.pred === null} title={st.pred === null ? '먼저 결과를 예상해 보세요' : undefined} onClick={p.onRunFix}>
              {busy ? '계산 중…' : '▶ 다시 가동'}
            </SiteBtn>
          </div>
        </>
      );
    case 'compare': {
      const predOk = sl && st.pred !== null ? (sl.pass ? st.pred === 0 : sl.stopped || sl.slipped ? st.pred === 2 : st.pred === 1) : null;
      return (
        <>
          <Head eyebrow="다시 가동 · 전과 후" title={sl?.pass ? '기준을 모두 넘었어요' : '아직 기준에 못 미쳐요'} solved={p.solved} />
          <div className={css.body}>
            {sb && sl && <Compare prob={prob} sb={sb} sl={sl} before={runs.before!} latest={runs.latest!} />}
            {predOk !== null && (
              <p className={lg.note}>
                <b>{predOk ? '예상 적중!' : '예상과 달랐어요.'}</b> {predOk ? '결과를 미리 맞혔어요.' : '왜 달랐는지 기록을 보며 생각해 보세요.'}
              </p>
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
          <div className={css.body}>
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
            <p className={lg.note}>{T.real}</p>
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={p.onBack}>
              산업단지로
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

/* --- 원인 찾기: what to look at, per problem ---------------------------------------- */

function Measure({ prob, run }: { prob: LogiProblem; run: PalletRun | null }) {
  const f = run?.failure;
  if (prob === 1)
    return (
      <dl className={lg.measure}>
        <dt>새 상자 높이 (실측)</dt>
        <dd>{PBOX.h} mm</dd>
        <dt>작업 지시서의 층 간격</dt>
        <dd data-c="bad">{(DEFAULTS[1] as StackValues).pitch} mm</dd>
        <dt>2층 놓는 높이 (컵)</dt>
        <dd data-c="bad">{placeZ(DEFAULTS[1] as StackValues, 1)} mm</dd>
        <dt>2층 상자가 놓일 높이 (컵)</dt>
        <dd>{restZ(1)} mm</dd>
        <dt>아래 상자를 누른 깊이</dt>
        <dd data-c="bad">{fmt(f?.mm ?? 0)} mm</dd>
      </dl>
    );
  if (prob === 2)
    return (
      <>
        <dl className={lg.measure}>
          <dt>상자 무게</dt>
          <dd>{HEAVY_G} g</dd>
          <dt>흡착 컵이 붙잡는 힘</dt>
          <dd>{SUCTION_N} N</dd>
          <dt>버틸 수 있는 가속도 (F ÷ m − g)</dt>
          <dd>{fmt(accLimit(HEAVY_G), 1)} m/s²</dd>
          <dt>떨어진 순간의 손끝 가속도</dt>
          <dd data-c="bad">{fmt(f?.mm ?? run?.maxCarryAcc ?? 0, 1)} m/s²</dd>
        </dl>
        {run && <AccGraph run={run} />}
      </>
    );
  // ③: the first box's place against the real pallet's edge.
  const prog = run?.values.prog ?? PAL_HOME;
  const c = slotCentre(0, prog);
  const edge = PAL_MOVED.y - PAL.sy / 2;
  return (
    <dl className={lg.measure}>
      <dt>프로그램의 기준점</dt>
      <dd>
        ({fmt(prog.x + MARK_OFF[0])}, {fmt(prog.y + MARK_OFF[1])}) mm
      </dd>
      <dt>첫 상자를 놓은 자리 (중심 y)</dt>
      <dd>{fmt(c[1])} mm</dd>
      <dt>실제 팔레트 끝 (y)</dt>
      <dd>{fmt(edge)} mm</dd>
      <dt>상자 중심이 팔레트 밖으로</dt>
      <dd data-c="bad">{fmt(edge - c[1])} mm</dd>
    </dl>
  );
}

/* --- 값 고치기: the operator panels -------------------------------------------------- */

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
              ({v.x}, {v.y}) mm
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
