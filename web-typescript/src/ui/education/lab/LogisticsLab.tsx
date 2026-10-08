'use client';

/**
 * 산업단지 · 물류 센터 — 팔레타이징 (myCobot 280 RDK X5 + 흡착 펌프, real size). One screen like
 * the conveyor lab: a slim bar (← 산업단지, the site, problems ①②③, the six steps), the cell in the
 * 교육 3D view (LearnStage, the real arm) with the line's board over it, and one panel with what
 * the step needs: 작업 지시 → 가동 · 문제 → 원인 찾기 → 값 고치기 (operator panel, a prediction,
 * hints) → 다시 가동 · 비교 → 해결 · 원리 (the principle card and the theory PDF).
 *
 * Each run is computed by the engine with real rigid-body physics (engine/education/lab/pallet.ts)
 * in one go, then played back here (PalletCell).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { LOGI_PROBLEMS, LOGI_STEPS, STACK_TEXT as T, type LogiStepId } from '@/engine/education/lab/logistics';
import { HOME_Q, type Mm } from '@/engine/education/lab/cell';
import {
  DROP_OK_MM,
  FEED,
  N_BOXES,
  OK_TOL,
  PBOX,
  PRESS_OK_MM,
  STACK_DEFAULT,
  STACK_FIX,
  STACK_RANGE,
  placeZ,
  restZ,
  runStack,
  scoreStack,
  slotCentre,
  type PFrame,
  type PalletRun,
  type StackScore,
  type StackValues,
} from '@/engine/education/lab/pallet';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import PalletCell, { PalletPlayback, type PalletOverlay } from './PalletCell';
import css from './lab.module.css';
import lg from './logistics.module.css';

/** The cell from the front right, a little above (three.js metres, y up): camera, then target. */
const LOGI_VIEW: ViewPose = [0.66, 0.46, 0.7, 0.1, 0.06, 0.1];
/** Playback speed of a run (they take 30 – 80 s of line time). */
const FAST = 3;

interface Runs {
  before: PalletRun | null;
  latest: PalletRun | null;
}

declare global {
  interface Window {
    /** Open a step of 물류 ①, optionally with the worked fix run, and the playback at a time or its end (guide pictures, tools/check). */
    __logiOpen?: (step: LogiStepId, opts?: { solve?: boolean; at?: number | 'end' }) => void;
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

/** A layer's place height against where the box would rest: pressed in, dropped, or right. */
function layerState(v: StackValues, layer: number): { d: number; state: 'press' | 'drop' | 'ok' } {
  const d = placeZ(v, layer) - restZ(layer);
  return { d, state: d < -PRESS_OK_MM ? 'press' : d > DROP_OK_MM ? 'drop' : 'ok' };
}

export default function LogisticsLab({ robot, chain, gripperRobot, hidden, saved, onSolved, onBack }: Props) {
  const [step, setStepRaw] = useState<LogiStepId>('brief');
  const [reached, setReached] = useState(0);
  const [solved, setSolved] = useState(!!saved?.[1]);
  const [values, setValues] = useState<StackValues>(STACK_DEFAULT);
  const [runs, setRuns] = useState<Runs>({ before: null, latest: null });
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [pred, setPred] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [tries, setTries] = useState(0);
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(true);
  const [player] = useState(() => new PalletPlayback());

  useEffect(() => {
    if (solved) onSolved?.(1);
  }, [solved, onSolved]);

  const setStep = useCallback((s: LogiStepId) => {
    setStepRaw(s);
    setReached((r) => Math.max(r, stepIndex(s)));
  }, []);

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
    (which: 'before' | 'latest', v: StackValues, then: LogiStepId) => {
      setBusy(true);
      void runStack(chain, v).then((run) => {
        setRuns((x) => ({ ...x, [which]: run }));
        if (which === 'latest') {
          setTries((n) => n + 1);
          if (scoreStack(run).pass) setSolved(true);
        }
        setBusy(false);
        setStep(then);
      });
    },
    [chain, setStep],
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

  // 값 고치기 and 작업 지시 show the cell standing still: before any run the first box at the stop;
  // while fixing, layer 1 as it was placed (the starting run's frame just before the first press).
  const still = useMemo<PFrame['boxes']>(() => {
    if (step === 'fix' && runs.before) {
      const f = runs.before.frames.find((fr) => fr.boxes[4]?.mode === 'held') ?? runs.before.frames[runs.before.frames.length - 1];
      return f.boxes.map((b, k) => (k < 4 ? b : { ...b, mode: 'wait' as const }));
    }
    return START_BOXES;
  }, [step, runs.before]);
  useEffect(() => {
    player.setStill(still);
  }, [player, still]);

  const frame = shown ? shown.frames[Math.min(shown.frames.length - 1, Math.round(playT / 0.02))] : null;

  const overlay = useMemo<PalletOverlay>(() => {
    if (step === 'fix') {
      const ghosts = [1, 2].map((layer) => {
        const c = slotCentre(layer * 4);
        const ls = layerState(values, layer);
        const z = placeZ(values, layer) - PBOX.h / 2;
        const text = ls.state === 'press' ? `${layer + 1}층 · ${fmt(-ls.d)} mm 눌러요` : ls.state === 'drop' ? `${layer + 1}층 · ${fmt(ls.d)} mm 위에서 떨어뜨려요` : `${layer + 1}층 · 딱 맞아요 (+${fmt(Math.max(0, ls.d))} mm)`;
        return { key: `g${layer}`, at: [c[0], c[1], z] as Mm, state: ls.state, text };
      });
      return { ghosts };
    }
    if (step === 'cause' && shown?.failure?.kind === 'press' && shown.failure.at) return { press: { at: shown.failure.at, mm: shown.failure.mm ?? 0 } };
    if (!shown) return {};
    const i = Math.min(shown.tip.length - 1, Math.round(playT / 0.02));
    return { path: shown.tip.slice(Math.max(0, i - 220), i + 1).filter((_, j) => j % 2 === 0) };
  }, [step, values, shown, playT]);

  const scene = useMemo<LearnScene>(() => ({ angles: HOME_Q, tool: 'pump', pumpOn: false }), []);

  // The line's board: what has happened up to the playback time.
  const board = useMemo(() => {
    if (!shown) return null;
    const upTo = shown.events.filter((e) => e.t <= playT + 1e-6);
    const placed = upTo.filter((e) => e.kind === 'place' || e.kind === 'drop').length;
    const crushed = Math.max(0, ...(frame?.crush ?? [0]));
    return { placed, crushed, t: playT, stopped: !!frame?.alarm };
  }, [shown, playT, frame]);

  // Guide pictures and checks: jump to a step (with the worked fix run).
  useEffect(() => {
    window.__logiOpen = (s, opts = {}) => {
      void (async () => {
        const before = runs.before ?? (await runStack(chain, STACK_DEFAULT));
        let latest = runs.latest;
        if (opts.solve) {
          setValues(STACK_FIX);
          latest = await runStack(chain, STACK_FIX);
          if (scoreStack(latest).pass) setSolved(true);
        }
        setRuns({ before, latest });
        setStepRaw(s);
        setReached((r) => Math.max(r, stepIndex(s)));
        if (opts.at !== undefined) {
          const at = opts.at;
          window.setTimeout(() => {
            if (player.run) play(player.run, at);
          }, 80);
        }
      })();
    };
    return () => {
      delete window.__logiOpen;
    };
  }, [chain, runs.before, runs.latest, play, player]);

  const sb = useMemo(() => (runs.before ? scoreStack(runs.before) : null), [runs.before]);
  const sl = useMemo(() => (runs.latest ? scoreStack(runs.latest) : null), [runs.latest]);
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
          {LOGI_PROBLEMS.map((p) => (
            <button key={p.id} type="button" aria-current={p.id === 1 || undefined} data-solved={(p.id === 1 && solved) || undefined} disabled={!p.ready} title={p.ready ? p.title : `${p.title} (준비 중)`}>
              <span className={css.num}>{p.id}</span>
              <span className={css.probName}>{p.title}</span>
              {p.id === 1 && solved && <i aria-label="해결">✓</i>}
              {!p.ready && <span className={lg.soon}>준비 중</span>}
            </button>
          ))}
        </nav>
        <nav className={css.steps} aria-label="단계">
          {LOGI_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              data-st={i === at ? 'now' : i < at ? 'done' : i <= reached ? 'open' : undefined}
              aria-current={i === at ? 'step' : undefined}
              disabled={i > reached}
              onClick={() => setStep(s.id)}
            >
              <i>{i < at ? '✓' : i + 1}</i>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <section className={css.stage} aria-label="3D 팔레타이징 셀">
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={LOGI_VIEW} live={player.arm}>
          <PalletCell player={player} overlay={overlay} />
        </LearnStage>
        {board?.stopped && <div className={lg.alarm}>⚠ {shown?.failure?.text ?? '라인 정지'}</div>}
        {shown && !board?.stopped && shown.failure === null && playT >= shown.durationS - 1e-6 && <div className={lg.okPill}>✓ 12개를 모두 쌓았어요</div>}
        {board && (
          <div className={lg.board} aria-label="라인 현황">
            <div data-c={board.placed === N_BOXES ? 'ok' : undefined}>
              <small>쌓은 상자</small>
              <b>
                {board.placed} / {N_BOXES}
              </b>
            </div>
            <div data-c={board.crushed > PRESS_OK_MM ? 'bad' : undefined}>
              <small>찌그러짐</small>
              <b>{board.crushed > 0.5 ? `${fmt(board.crushed)} mm` : '없음'}</b>
            </div>
            <div data-c={board.stopped ? 'bad' : 'ok'}>
              <small>라인</small>
              <b>{board.stopped ? '정지' : '가동'}</b>
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
          step={step}
          busy={busy}
          values={values}
          onValues={setValues}
          pick={pick}
          onPick={setPick}
          pred={pred}
          onPred={setPred}
          hints={hints}
          onHint={() => setHints((h) => Math.min(3, h + 1))}
          tries={tries}
          runs={runs}
          sb={sb}
          sl={sl}
          solved={solved}
          onSeek={(t) => {
            player.seek(t);
            player.pause();
            setPlaying(false);
          }}
          onRunBefore={() => go('before', STACK_DEFAULT, 'run')}
          onRunFix={() => go('latest', values, 'compare')}
          onStep={setStep}
          onBack={onBack}
        />
      </aside>
    </div>
  );
}

interface PanelProps {
  step: LogiStepId;
  busy: boolean;
  values: StackValues;
  onValues(v: StackValues): void;
  pick: number | null;
  onPick(i: number): void;
  pred: number | null;
  onPred(i: number): void;
  hints: number;
  onHint(): void;
  tries: number;
  runs: Runs;
  sb: StackScore | null;
  sl: StackScore | null;
  solved: boolean;
  onSeek(t: number): void;
  onRunBefore(): void;
  onRunFix(): void;
  onStep(s: LogiStepId): void;
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

function Panel(p: PanelProps) {
  const { step, busy, values, runs, sb, sl } = p;
  const failure = runs.before?.failure;
  switch (step) {
    case 'brief':
      return (
        <>
          <Head eyebrow="작업 지시서 · 물류 센터" title={`팔레트에 상자 ${N_BOXES}개를 3층으로`} solved={p.solved} />
          <div className={css.body}>
            <p className={css.story}>{T.brief}</p>
            <div className={lg.order}>
              <header>
                작업 기준 <span>{T.order}</span>
              </header>
              <dl>
                <dt>상자</dt>
                <dd>
                  {PBOX.sx} × {PBOX.sy} × {PBOX.h} mm, {PBOX.massG} g
                </dd>
                <dt>쌓기</dt>
                <dd>한 층 4개 × 3층 = {N_BOXES}개</dd>
                <dt>찌그러짐</dt>
                <dd>{PRESS_OK_MM} mm 넘게 누르면 안 됨</dd>
                <dt>떨어뜨림</dt>
                <dd>{DROP_OK_MM} mm 넘게 띄워 놓으면 안 됨</dd>
                <dt>위치</dt>
                <dd>
                  제자리에서 {OK_TOL.xyMm} mm, 기울기 {OK_TOL.tiltDeg}° 안
                </dd>
              </dl>
            </div>
            <p className={lg.note}>
              <b>작업 프로그램</b> · 1층 놓는 높이 {placeZ(STACK_DEFAULT, 0)} mm, 층 간격 {STACK_DEFAULT.pitch} mm, 여유 {STACK_DEFAULT.gap} mm
            </p>
            <p className={lg.note}>{T.tryFirst}</p>
          </div>
          <div className={css.foot}>
            <span />
            <button type="button" className={`${css.primary} ${lg.siteBtn}`} disabled={busy} onClick={p.onRunBefore}>
              {busy ? '계산 중…' : '▶ 라인 가동'}
            </button>
          </div>
        </>
      );
    case 'run':
      return (
        <>
          <Head eyebrow="가동 결과" title={failure ? `${(failure.box ?? 0) + 1}번 상자에서 멈췄어요` : '끝까지 쌓았어요'} solved={p.solved} />
          <div className={css.body}>
            <p className={css.story}>
              1층 {Math.min(4, sb?.placed ?? 0)}개는 잘 쌓였는데, 2층 첫 상자를 내려놓다가 라인이 멈췄어요. 경광등이 빨갛게 켜졌어요.
            </p>
            <p className={`${lg.note} ${lg.siteNote}`}>
              <b>찾아보기</b> · 아래 기록에서 시각을 누르면 그 순간으로 가요. 멈추기 직전에 무엇을 했나요?
            </p>
            <Events run={runs.before} onSeek={p.onSeek} />
          </div>
          <div className={css.foot}>
            <span />
            <button type="button" className={`${css.primary} ${lg.siteBtn}`} onClick={() => p.onStep('cause')}>
              원인 찾으러 가기 →
            </button>
          </div>
        </>
      );
    case 'cause': {
      const pressed = failure?.mm ?? 0;
      return (
        <>
          <Head eyebrow="원인 찾기 · 측정" title={T.question} solved={p.solved} />
          <div className={css.body}>
            <p className={css.story}>{T.look}</p>
            <dl className={lg.measure}>
              <dt>새 상자 높이 (실측)</dt>
              <dd>{PBOX.h} mm</dd>
              <dt>작업 지시서의 층 간격</dt>
              <dd data-c="bad">{STACK_DEFAULT.pitch} mm</dd>
              <dt>2층 놓는 높이 (컵)</dt>
              <dd data-c="bad">{placeZ(STACK_DEFAULT, 1)} mm</dd>
              <dt>2층 상자가 놓일 높이 (컵)</dt>
              <dd>{restZ(1)} mm</dd>
              <dt>아래 상자를 누른 깊이</dt>
              <dd data-c="bad">{fmt(pressed)} mm</dd>
            </dl>
            <div className={lg.choices}>
              {T.choices.map((c, i) => (
                <button key={i} type="button" data-r={p.pick === i ? (i === T.answer ? 'ok' : 'no') : undefined} onClick={() => p.onPick(i)}>
                  {c}
                </button>
              ))}
            </div>
            {p.pick !== null && (
              <p className={lg.note}>
                <b>{p.pick === T.answer ? '맞아요.' : '다시 보세요.'}</b> {p.pick === T.answer ? T.why : T.whyNot}
              </p>
            )}
          </div>
          <div className={css.foot}>
            <span />
            <button type="button" className={`${css.primary} ${lg.siteBtn}`} disabled={p.pick !== T.answer} onClick={() => p.onStep('fix')}>
              값 고치러 가기 →
            </button>
          </div>
        </>
      );
    }
    case 'fix':
      return (
        <>
          <Head eyebrow="조작반 · 이 문제에 필요한 값만" title="놓는 높이를 고쳐요" solved={p.solved} />
          <div className={css.body}>
            <div className={lg.hmi}>
              <header>
                <span>PALLETIZE · 팔레트 A</span>
                <i>● 준비</i>
              </header>
              <div className={lg.knob}>
                <label htmlFor="logi-pitch">
                  층 간격 <output>{values.pitch} mm</output>
                </label>
                <input
                  id="logi-pitch"
                  type="range"
                  min={STACK_RANGE.pitch[0]}
                  max={STACK_RANGE.pitch[1]}
                  step={1}
                  value={values.pitch}
                  onChange={(e) => p.onValues({ ...values, pitch: +e.target.value })}
                />
                <small>한 층 올라갈 때 놓는 높이를 얼마나 올릴지</small>
              </div>
              <div className={lg.knob}>
                <label htmlFor="logi-gap">
                  여유 <output>{values.gap} mm</output>
                </label>
                <input id="logi-gap" type="range" min={STACK_RANGE.gap[0]} max={STACK_RANGE.gap[1]} step={1} value={values.gap} onChange={(e) => p.onValues({ ...values, gap: +e.target.value })} />
                <small>놓을 때 상자를 아래 면보다 얼마나 띄울지</small>
              </div>
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
                    const ls = layerState(values, l);
                    return (
                      <tr key={l}>
                        <td>{l + 1}층</td>
                        <td>{placeZ(values, l)} mm</td>
                        <td>{restZ(l)} mm</td>
                        <td data-c={ls.state}>{ls.state === 'press' ? `${fmt(-ls.d)} mm 누름` : ls.state === 'drop' ? `${fmt(ls.d)} mm 떨어뜨림` : `+${fmt(Math.max(0, ls.d))} mm`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={lg.predict}>
              <b>가동 전에 예상해 보세요</b>
              <div>
                {T.predictions.map((t, i) => (
                  <button key={i} type="button" aria-pressed={p.pred === i} onClick={() => p.onPred(i)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className={lg.hints}>
              <button type="button" onClick={p.onHint} disabled={p.hints >= 3}>
                힌트 보기 ({p.hints}/3)
              </button>
              {T.hints.slice(0, p.hints).map((h) => (
                <p key={h.k} className={lg.hint}>
                  <em>{h.k}</em>
                  {h.t}
                </p>
              ))}
            </div>
          </div>
          <div className={css.foot}>
            <span />
            <button type="button" className={`${css.primary} ${lg.siteBtn}`} disabled={busy || p.pred === null} title={p.pred === null ? '먼저 결과를 예상해 보세요' : undefined} onClick={p.onRunFix}>
              {busy ? '계산 중…' : '▶ 다시 가동'}
            </button>
          </div>
        </>
      );
    case 'compare': {
      const predOk = sl && p.pred !== null ? (sl.pass ? p.pred === 0 : sl.placed > 4 && sl.placed < N_BOXES ? p.pred === 1 : p.pred === 2) : null;
      const row = (label: string, want: string, b: string, a: string, good: boolean, bad?: boolean) => (
        <tr>
          <td>{label}</td>
          <td>{want}</td>
          <td data-c={bad ? 'bad' : undefined}>{b}</td>
          <td data-c={good ? 'ok' : 'bad'}>{a}</td>
        </tr>
      );
      return (
        <>
          <Head eyebrow="다시 가동 · 전과 후" title={sl?.pass ? '기준을 모두 넘었어요' : '아직 기준에 못 미쳐요'} solved={p.solved} />
          <div className={css.body}>
            {sb && sl && (
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
                  {row('찌그러짐', `≤ ${PRESS_OK_MM} mm`, `${fmt(sb.pressed)} mm`, `${fmt(sl.pressed)} mm`, sl.pressed <= PRESS_OK_MM, sb.pressed > PRESS_OK_MM)}
                  {row('떨어뜨림', `≤ ${DROP_OK_MM} mm`, `${fmt(sb.maxDrop)} mm`, `${fmt(sl.maxDrop)} mm`, sl.maxDrop <= DROP_OK_MM, sb.maxDrop > DROP_OK_MM)}
                  {row('라인 정지', '0', sb.stopped ? '1' : '0', sl.stopped ? '1' : '0', !sl.stopped, !!sb.stopped)}
                  {row('걸린 시간', '—', `${fmt(sb.timeS)} s`, `${fmt(sl.timeS)} s`, true)}
                </tbody>
              </table>
            )}
            {predOk !== null && (
              <p className={lg.note}>
                <b>{predOk ? '예상 적중!' : '예상과 달랐어요.'}</b> {predOk ? '결과를 미리 맞혔어요.' : '왜 달랐는지 기록을 보며 생각해 보세요.'}
              </p>
            )}
            {sl && !sl.pass && <p className={`${lg.note} ${lg.siteNote}`}>{sl.stopped ?? (sl.maxDrop > DROP_OK_MM ? `상자를 ${fmt(sl.maxDrop)} mm 위에서 떨어뜨렸어요. 여유를 줄여 보세요.` : '위치가 기준을 벗어난 상자가 있어요.')}</p>}
            <Events run={runs.latest} onSeek={p.onSeek} />
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={() => p.onStep('fix')}>
              ← 값 다시 고치기
            </button>
            <button type="button" className={`${css.primary} ${lg.siteBtn}`} disabled={!sl?.pass} onClick={() => p.onStep('done')}>
              해결 확인 →
            </button>
          </div>
        </>
      );
    }
    case 'done': {
      const stars = 3 - (p.hints >= 2 ? 1 : 0) - (p.tries > 2 ? 1 : 0);
      return (
        <>
          <Head eyebrow="해결 · 원리 카드" title="쌓기 문제를 해결했어요" solved={p.solved} />
          <div className={css.body}>
            <div className={lg.stars}>
              {'★'.repeat(stars)}
              {'☆'.repeat(3 - stars)}
              <small>
                다시 가동 {p.tries}번 · 힌트 {p.hints}번
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
            <p className={lg.note}>실제 myCobot 280에서도 같은 상자와 높이로 해 볼 수 있어요. 놓는 높이를 1 mm씩 바꿔 가며 상자가 눌리는지 보세요.</p>
          </div>
          <div className={css.foot}>
            <button type="button" className={css.ghost} onClick={p.onBack}>
              산업단지로
            </button>
            <button type="button" className={css.primary} disabled title="준비 중">
              문제 2 (준비 중)
            </button>
          </div>
        </>
      );
    }
  }
}

/** The run's log: the moments that matter, each a button that jumps the playback there. */
function Events({ run, onSeek }: { run: PalletRun | null; onSeek(t: number): void }) {
  if (!run) return null;
  const list = run.events.filter((e) => e.kind !== 'arrive' && e.kind !== 'grip');
  const shown = list.length > 9 ? [...list.slice(0, 3), ...list.slice(-6)] : list;
  return (
    <ol className={lg.events} aria-label="가동 기록">
      {shown.map((e, i) => (
        <li key={i} data-k={e.kind === 'press' || e.kind === 'moved' || e.kind === 'hit' || e.kind === 'unreachable' ? 'bad' : e.kind === 'drop' ? 'warn' : undefined}>
          <button type="button" onClick={() => onSeek(Math.max(0, e.t - 0.6))}>
            <time>{e.t.toFixed(1)} s</time>
            <span>{e.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
