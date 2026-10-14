'use client';

/**
 * 디지털 트윈 관제센터: the students' lab runs as data (engine/education/runLog.ts, analysed by
 * engine/education/dataScience.ts). One screen, four tabs:
 *
 *  - 한눈에 보기: a tile per theme (runs, pass rate, mean job time, attempts over time), the 병목 bars and
 *    the pass rate of every problem;
 *  - 현장 분석: one lab problem — its numbers, a scatter of any two columns with the least-squares line and
 *    r read out in plain Korean, the job-time histogram, the runs themselves;
 *  - 디지털 트윈: the same program on the simulator and on the real robot, paired, and how far apart;
 *  - 데이터 탐구: three questions answered by looking at the right chart (checked from the data shown);
 *  - 반 결과 (teacher): the students' exported result files gathered into one class table (ClassResults).
 *
 * 실제 기록 (this browser's log) or 예시 데이터 (demoRuns: a made-up class, only in memory — never written to
 * the log). CSV download; the teacher can clear the log. Light, like the labs (Pretendard; place colour teal).
 */

import { useMemo, useState, useSyncExternalStore } from 'react';

import { useAccount } from '../../account/AccountProvider';

import {
  MM_BANDS,
  RUN_LABS,
  bottleneck,
  columnsOf,
  columnValue,
  describeR,
  fmtNum,
  histogram,
  labInfo,
  labOverview,
  labsIn,
  ofProblem,
  pairTwin,
  quizzes,
  regression,
  scatter,
  simOnly,
  stamp,
  summarize,
  toCsv,
  twinSummary,
  valueName,
  withUnit,
  demoRuns,
  type Column,
  type DataRecord,
  type Quiz,
  type QuizLook,
} from '@/engine/education/dataScience';
import { RUN_LOG_KEY, clearRuns, loadRuns, type RunLab } from '@/engine/education/runLog';

import { Lines } from '../lesson/Rich';
import { Bars, HistogramChart, Scatter, Sparkline, TwinPlot, type BarRow } from './charts';
import ClassResults, { NO_CLASS, type ClassLoad } from './ClassResults';
import css from './data.module.css';

/** The example class's seed (the same class every time). */
const DEMO_SEED = 7;

type Tab = 'overview' | 'lab' | 'twin' | 'quiz' | 'class';
const TABS: readonly [Tab, string][] = [
  ['overview', '한눈에 보기'],
  ['lab', '현장 분석'],
  ['twin', '디지털 트윈'],
  ['quiz', '데이터 탐구'],
  ['class', '반 결과'],
];

/* The log, read straight from localStorage (the raw text is the snapshot: equal text, same records). */
function subscribe(cb: () => void) {
  window.addEventListener(RUN_LOG_KEY, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(RUN_LOG_KEY, cb);
    window.removeEventListener('storage', cb);
  };
}
function rawLog(): string {
  try {
    return localStorage.getItem(RUN_LOG_KEY) ?? '';
  } catch {
    return '';
  }
}
const noLog = () => null;

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
const isRunLab = (lab: string): lab is RunLab => (RUN_LABS as readonly string[]).includes(lab);

/** Columns that change in these runs (a constant one makes no scatter). */
function varying(rs: readonly DataRecord[], cols: readonly Column[]) {
  return cols.filter((c) => {
    const vs = new Set(rs.map((r) => columnValue(r, c.key)).filter((v) => v !== null));
    return vs.size > 1;
  });
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataCenter({ hidden, onBack, onOpenLab }: { hidden?: boolean; onBack(): void; onOpenLab(lab: RunLab): void }) {
  const raw = useSyncExternalStore(subscribe, rawLog, noLog);
  // A student in class mode: no 반 결과 tab and no 기록 지우기 (the teacher's, on the class server).
  const student = useAccount().role === 'student';
  const tabs = student ? TABS.filter(([id]) => id !== 'class') : TABS;
  const real = useMemo<DataRecord[]>(() => (raw ? loadRuns() : []), [raw]);
  const demo = useMemo(() => demoRuns(DEMO_SEED), []);
  const [mode, setMode] = useState<'real' | 'demo'>('real');
  const [tab, setTab] = useState<Tab>('overview');
  const [pick, setPick] = useState<{ lab: string; problem: 1 | 2 | 3 } | null>(null);
  const [axes, setAxes] = useState<{ x: string | null; y: string | null }>({ x: null, y: null });
  const [twinKey, setTwinKey] = useState<string | null>(null);
  const [askClear, setAskClear] = useState(false);
  const [fromQuiz, setFromQuiz] = useState<Quiz | null>(null);
  const [chosen, setChosen] = useState<Partial<Record<Quiz['id'], number>>>({});
  const [checked, setChecked] = useState<Partial<Record<Quiz['id'], boolean>>>({});
  /** 반 결과: the students' files loaded so far (kept across tabs, in memory only). */
  const [klass, setKlass] = useState<ClassLoad>(NO_CLASS);

  const isDemo = mode === 'demo';
  const data = isDemo ? demo : real;
  const robotHere = data.some((r) => r.source === 'robot');
  /** The twin tab shows this data's pairs, or the example's while there are no robot runs. */
  const twinData = robotHere ? data : demo;
  const twinFromDemo = !robotHere && !isDemo;

  const overview = useMemo(() => labOverview(data), [data]);
  const neck = useMemo(() => bottleneck(data), [data]);
  const pairs = useMemo(() => pairTwin(twinData), [twinData]);
  const twin = useMemo(() => twinSummary(pairs), [pairs]);
  const qs = useMemo(() => quizzes(data, twinData), [data, twinData]);

  const firstLab = overview.find((o) => o.all.runs > 0)?.lab ?? 'factory';
  const lab = pick?.lab ?? firstLab;
  const problem = pick?.problem ?? 1;
  const sim = useMemo(() => simOnly(data), [data]);
  const runs = useMemo(() => ofProblem(sim, lab, problem), [sim, lab, problem]);
  const cols = useMemo(() => varying(runs, columnsOf(runs)), [runs]);
  const xCol = cols.find((c) => c.key === axes.x) ?? cols.find((c) => c.kind === 'value') ?? cols[0];
  const yCol = cols.find((c) => c.key === axes.y) ?? cols.find((c) => c.kind === 'check' && c.key !== xCol?.key) ?? cols.find((c) => c.key === 'pass');
  const pts = useMemo(() => (xCol && yCol ? scatter(runs, xCol.key, yCol.key) : []), [runs, xCol, yCol]);
  const fit = useMemo(() => regression(pts), [pts]);
  const sum = useMemo(() => summarize(runs), [runs]);
  const hist = useMemo(() => histogram(runs.map((r) => r.durationS)), [runs]);

  const empty = !isDemo && raw !== null && real.length === 0;

  const goLook = (v: QuizLook, q: Quiz | null) => {
    setFromQuiz(q);
    if (v.tab === 'lab') {
      setPick({ lab: v.lab, problem: v.problem });
      setAxes({ x: v.x, y: v.y });
    }
    setTab(v.tab);
  };
  const openLab = (l: string, p: 1 | 2 | 3 = 1) => {
    setPick({ lab: l, problem: p });
    setAxes({ x: null, y: null });
    setFromQuiz(null);
    setTab('lab');
  };
  const switchMode = (m: 'real' | 'demo') => {
    setMode(m);
    setPick(null);
    setAxes({ x: null, y: null });
    setTwinKey(null);
    setChosen({});
    setChecked({});
    setAskClear(false);
  };
  const exportCsv = () => {
    const d = new Date();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    download(isDemo ? '예시-실습기록.csv' : `실습기록-${day}.csv`, toCsv(data));
  };

  return (
    <section className={css.dc} hidden={hidden} aria-label="디지털 트윈 관제센터">
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 지도
        </button>
        <h1 className={css.title}>
          <i aria-hidden />
          디지털 트윈 관제센터
          <small>실습 기록으로 하는 데이터 과학</small>
        </h1>
        <nav className={css.tabs} aria-label="화면">
          {tabs.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              disabled={empty && id !== 'class'}
              title={id === 'class' ? '교사용: 학생들이 낸 결과 파일을 모아 반 전체를 봐요' : undefined}
              onClick={() => {
                setFromQuiz(null);
                setTab(id);
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className={css.tools} hidden={tab === 'class'}>
          <div className={css.seg} role="group" aria-label="데이터">
            <button type="button" aria-pressed={!isDemo} onClick={() => switchMode('real')}>
              실제 기록 <b>{real.length}</b>
            </button>
            <button type="button" aria-pressed={isDemo} onClick={() => switchMode('demo')}>
              예시 데이터
            </button>
          </div>
          <button type="button" className={css.tool} onClick={exportCsv} disabled={!data.length}>
            CSV 내보내기
          </button>
          {student ? null : askClear ? (
            <span className={css.confirm}>
              기록 {real.length}개를 지울까요?
              <button
                type="button"
                className={css.danger}
                onClick={() => {
                  clearRuns();
                  setAskClear(false);
                  setPick(null);
                }}
              >
                지우기
              </button>
              <button type="button" className={css.tool} onClick={() => setAskClear(false)}>
                취소
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={css.tool}
              disabled={isDemo || !real.length}
              title={isDemo ? '예시 데이터는 저장되지 않아 지울 것이 없어요' : '교사용: 이 브라우저의 실습 기록을 모두 지워요'}
              onClick={() => setAskClear(true)}
            >
              교사용 기록 지우기
            </button>
          )}
        </div>
      </header>

      <div className={css.body} key={tab}>
        {raw === null ? null : tab === 'class' ? (
          <ClassResults load={klass} setLoad={setKlass} />
        ) : empty ? (
          <Empty onDemo={() => switchMode('demo')} onOpenLab={onOpenLab} onClass={student ? undefined : () => setTab('class')} />
        ) : (
          <>
            {isDemo && (
              <p className={css.demoNote}>
                <b>예시 데이터</b> 가상의 25명 반이 6개 현장을 실습한 기록이에요. 화면을 미리 보여 주는 용도이고, 실제 기록과 섞이지 않으며 저장되지 않아요.
              </p>
            )}
            {fromQuiz && (
              <p className={css.quizBack}>
                <span>
                  탐구 {qs.findIndex((q) => q.id === fromQuiz.id) + 1} · {fromQuiz.q}
                </span>
                <span className={css.quizLook}>{fromQuiz.look}</span>
                <button type="button" onClick={() => setTab('quiz')}>
                  탐구로 돌아가기
                </button>
              </p>
            )}

            {tab === 'overview' && (
              <>
                <div className={css.tiles}>
                  {overview.map((o) => (
                    <article key={o.lab} className={css.tile} data-empty={o.all.runs === 0 || undefined} style={{ ['--lab' as string]: o.info.color }}>
                      <header>
                        <i aria-hidden />
                        <b>{o.info.name}</b>
                        {o.robot > 0 && <small title="실제 로봇 실행">로봇 {o.robot}</small>}
                      </header>
                      {o.all.runs > 0 ? (
                        <button type="button" onClick={() => openLab(o.lab)} aria-label={`${o.info.name} 분석 보기`}>
                          <span className={css.big}>
                            {pct(o.all.passRate)}
                            <small>성공률</small>
                          </span>
                          <span className={css.meta}>
                            실행 {o.all.runs}회 · 평균 {fmtNum(o.all.duration.mean, 1)} s
                          </span>
                          <Sparkline values={o.spark} color={o.info.color} width={130} />
                          <span className={css.sparkNote}>시간에 따른 실행 수</span>
                        </button>
                      ) : (
                        <div className={css.tileEmpty}>
                          <span>아직 기록이 없어요</span>
                          {isRunLab(o.lab) && !isDemo && (
                            <button type="button" className={css.tool} onClick={() => onOpenLab(o.lab as RunLab)}>
                              실습하러 가기
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                <div className={css.row2}>
                  <div className={css.side}>
                    <article className={css.card} data-flash={fromQuiz?.id === 'bottleneck' || undefined}>
                      <h2>병목 찾기: 현장마다 평균 작업 시간</h2>
                      <p className={css.lead}>로봇 한 번의 작업이 가장 오래 걸리는 곳이 줄 전체를 늦춰요. 그곳이 병목이에요.</p>
                      {neck.labs.length ? (
                        <>
                          <Bars
                            unit="s"
                            rows={neck.labs.map(
                              (l): BarRow => ({
                                key: l.lab,
                                label: l.name,
                                color: labInfo(l.lab).color,
                                value: l.meanS,
                                note: `성공률 ${pct(l.passRate)} · ${l.runs}회`,
                                hot: neck.slowest?.lab === l.lab,
                              }),
                            )}
                          />
                          <p className={css.reading}>
                            {neck.slowest && (
                              <>
                                <b>{neck.slowest.name}</b>의 작업이 평균 {fmtNum(neck.slowest.meanS, 1)} s로 가장 길어요.{' '}
                              </>
                            )}
                            {neck.hardest && (
                              <>
                                가장 자주 실패하는 문제는{' '}
                                <button type="button" className={css.link} onClick={() => openLab(neck.hardest!.lab, neck.hardest!.problem as 1 | 2 | 3)}>
                                  {labInfo(neck.hardest.lab).name} {neck.hardest.problem}번 ‘{neck.hardest.title}’
                                </button>{' '}
                                (성공률 {pct(neck.hardest.passRate)})이에요.
                              </>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className={css.muted}>한 현장에서 세 번 넘게 실행하면 여기에 나와요.</p>
                      )}
                    </article>
                    <Recent rs={data} onOpen={openLab} />
                  </div>

                  <article className={css.card}>
                    <h2>문제별 성공률</h2>
                    <p className={css.lead}>칸이 진할수록 잘 풀린 문제예요. 칸을 누르면 그 문제를 분석해요.</p>
                    <table className={css.matrix}>
                      <thead>
                        <tr>
                          <th>현장</th>
                          {([1, 2, 3] as const).map((m) => (
                            <th key={m}>
                              <Num n={m} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {overview.map((o) => (
                          <tr key={o.lab}>
                            <th>
                              <i style={{ background: o.info.color }} aria-hidden />
                              {o.info.name}
                            </th>
                            {o.problems.map((p) => (
                              <td key={p.problem}>
                                {p.summary.runs ? (
                                  <button
                                    type="button"
                                    title={`문제 ${p.problem} ${p.title}`}
                                    style={{ background: `color-mix(in srgb, #0fa3b8 ${Math.round(8 + p.summary.passRate * 42)}%, #fff)` }}
                                    onClick={() => openLab(o.lab, p.problem)}
                                  >
                                    <b>{pct(p.summary.passRate)}</b>
                                    <small>{p.summary.triesToPass ? `첫 성공 ${fmtNum(p.summary.triesToPass, 1)}번째` : '아직 성공 없음'}</small>
                                  </button>
                                ) : (
                                  <span className={css.muted}>—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </article>
                </div>
              </>
            )}

            {tab === 'lab' && (
              <>
                <div className={css.picker}>
                  <div className={css.labChips} role="group" aria-label="현장">
                    {labsIn(data).map((l) => {
                      const info = labInfo(l);
                      const n = ofProblem(sim, l).length;
                      return (
                        <button key={l} type="button" aria-pressed={l === lab} disabled={!n} onClick={() => openLab(l)}>
                          <i style={{ background: info.color }} aria-hidden />
                          {info.name}
                          <small>{n}</small>
                        </button>
                      );
                    })}
                  </div>
                  <div className={css.probChips} role="group" aria-label="문제">
                    {([1, 2, 3] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={p === problem}
                        onClick={() => {
                          setPick({ lab, problem: p });
                          setAxes({ x: null, y: null });
                          setFromQuiz(null);
                        }}
                      >
                        <Num n={p} /> {labInfo(lab).problems[p - 1]}
                      </button>
                    ))}
                  </div>
                </div>

                <dl className={css.stats}>
                  <div>
                    <dt>실행</dt>
                    <dd>{sum.runs}회</dd>
                  </div>
                  <div>
                    <dt>성공률</dt>
                    <dd>{pct(sum.passRate)}</dd>
                  </div>
                  <div>
                    <dt>작업 시간 평균</dt>
                    <dd>{fmtNum(sum.duration.mean, 1)} s</dd>
                  </div>
                  <div>
                    <dt>중앙값</dt>
                    <dd>{fmtNum(sum.duration.median, 1)} s</dd>
                  </div>
                  <div>
                    <dt>표준편차</dt>
                    <dd>{fmtNum(sum.duration.std, 2)} s</dd>
                  </div>
                  <div>
                    <dt>첫 성공까지</dt>
                    <dd>{sum.triesToPass ? `평균 ${fmtNum(sum.triesToPass, 1)}번` : '—'}</dd>
                  </div>
                  <div>
                    <dt>{data.some((r) => r.who) ? '아직 못 푼 학생' : '아직 못 풀었나요'}</dt>
                    <dd>{data.some((r) => r.who) ? `${sum.notYet}명` : sum.runs ? (sum.notYet ? '예' : '아니요') : '—'}</dd>
                  </div>
                </dl>

                {runs.length === 0 ? (
                  <p className={css.cardNote}>이 문제는 아직 실행 기록이 없어요.</p>
                ) : (
                  <>
                    <div className={css.row3}>
                      <article className={css.card} data-flash={fromQuiz?.id === 'speed' || undefined}>
                        <div className={css.cardHead}>
                          <h2>산점도: 두 값의 관계</h2>
                          {xCol && yCol && (
                            <div className={css.selects}>
                              <label>
                                X
                                <select
                                  value={xCol.key}
                                  onChange={(e) =>
                                    setAxes((a) => ({
                                      ...a,
                                      x: e.target.value,
                                      y: yCol.key,
                                    }))
                                  }
                                >
                                  {cols.map((c) => (
                                    <option key={c.key} value={c.key} title={c.label}>
                                      {c.name}
                                      {c.unit && ` (${c.unit})`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Y
                                <select
                                  value={yCol.key}
                                  onChange={(e) =>
                                    setAxes((a) => ({
                                      ...a,
                                      y: e.target.value,
                                      x: xCol.key,
                                    }))
                                  }
                                >
                                  {cols.map((c) => (
                                    <option key={c.key} value={c.key} title={c.label}>
                                      {c.name}
                                      {c.unit && ` (${c.unit})`}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          )}
                        </div>
                        {xCol && yCol ? (
                          <>
                            <Scatter points={pts} x={xCol} y={yCol} fit={fit} height={330} />
                            <p className={css.reading}>
                              <b className={css.readLabel}>읽기</b> {describeR(fit, xCol, yCol)}
                              {fit && fit.r !== null && !xCol.binary && !yCol.binary && (
                                <span className={css.muted}>
                                  {' '}
                                  · 추세선: {xCol.name} {withUnit('1', xCol.unit)}마다 {yCol.name} {withUnit(fmtNum(fit.slope), yCol.unit)}
                                </span>
                              )}
                            </p>
                          </>
                        ) : (
                          <p className={css.muted}>값을 바꿔 가며 두 번 넘게 실행하면 관계를 그릴 수 있어요.</p>
                        )}
                      </article>

                      <div className={css.side}>
                        <article className={css.card}>
                          <h2>작업 시간 분포</h2>
                          <HistogramChart h={hist} unit="s" mean={sum.duration.mean} height={210} />
                          <p className={css.small}>
                            <Lines text={`막대 높이는 그 시간대에 끝난 실행 수예요. 평균 ${fmtNum(sum.duration.mean, 1)} s, 표준편차 ${fmtNum(sum.duration.std, 2)} s예요. 표준편차가 작을수록 매번 비슷하게 움직여요.`} />
                          </p>
                        </article>
                        <article className={css.card}>
                          <h2>r 읽는 법</h2>
                          <ul className={css.rGuide}>
                            <li>
                              <b>+1에 가까움</b> X가 커지면 Y도 커져요
                            </li>
                            <li>
                              <b>−1에 가까움</b> X가 커지면 Y는 작아져요
                            </li>
                            <li>
                              <b>0 근처</b> 둘은 거의 관계가 없어요
                            </li>
                          </ul>
                          <p className={css.small}>관계가 있다고 꼭 원인은 아니에요. 다른 값이 함께 바뀌었는지도 봐요.</p>
                        </article>
                      </div>
                    </div>

                    <RunsTable runs={runs} showWho={runs.some((r) => r.who)} />
                  </>
                )}
              </>
            )}

            {tab === 'twin' && (
              <TwinTab pairs={pairs} twin={twin} fromDemo={twinFromDemo} pickKey={twinKey} onPick={setTwinKey} flash={fromQuiz?.id === 'twin'} />
            )}

            {tab === 'quiz' && (
              <div className={css.quizzes}>
                {qs.map((q, i) => {
                  const c = chosen[q.id];
                  const done = checked[q.id];
                  const right = done && c === q.answer;
                  return (
                    <article key={q.id} className={css.quiz}>
                      <span className={css.qNum}>탐구 {i + 1}</span>
                      <h2>{q.q}</h2>
                      <div className={css.qLook}>
                        <span>
                          <b>어디를 볼까요</b> {q.look}
                        </span>
                        {q.view && (
                          <button type="button" className={css.tool} onClick={() => goLook(q.view!, q)}>
                            차트 보러 가기 →
                          </button>
                        )}
                      </div>
                      {q.id === 'twin' && twinFromDemo && <p className={css.small}>실제 로봇 기록이 아직 없어서 예시 데이터의 비교로 답해요.</p>}
                      {q.answer === null ? (
                        <p className={css.cardNote}>
                          {q.why}
                          {!isDemo && (
                            <button type="button" className={css.link} onClick={() => switchMode('demo')}>
                              예시 데이터로 해 보기
                            </button>
                          )}
                        </p>
                      ) : (
                        <>
                          <div className={css.choices} role="radiogroup" aria-label="답">
                            {q.choices.map((ch, k) => (
                              <button
                                key={ch}
                                type="button"
                                role="radio"
                                aria-checked={c === k}
                                data-state={done && c === k ? (k === q.answer ? 'right' : 'wrong') : undefined}
                                onClick={() => {
                                  setChosen((o) => ({ ...o, [q.id]: k }));
                                  setChecked((o) => ({ ...o, [q.id]: false }));
                                }}
                              >
                                {ch}
                              </button>
                            ))}
                          </div>
                          <div className={css.qFoot}>
                            <button
                              type="button"
                              className={css.primary}
                              disabled={c === undefined}
                              onClick={() => setChecked((o) => ({ ...o, [q.id]: true }))}
                            >
                              확인
                            </button>
                            {done && (
                              <p className={right ? css.good : css.bad} role="status">
                                {right ? `맞아요! ${q.why}` : '다시 생각해 봐요. 차트를 보러 가서 확인해 봐요.'}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
                <p className={css.quizNote}>
                  답은 지금 보고 있는 {isDemo ? '예시 데이터' : '실제 기록'}에서 계산해요. 기록이 바뀌면 답도 바뀔 수 있어요. 데이터가 말하는 것을 읽는
                  연습이에요.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* --- pieces --------------------------------------------------------------------------------- */

/** A problem's number in a circle (drawn, not the ① glyph: the UI font has none). */
function Num({ n }: { n: number }) {
  return (
    <span className={css.pnum} aria-label={`문제 ${n}`}>
      {n}
    </span>
  );
}

/** The newest runs, one line each. */
function Recent({ rs, onOpen }: { rs: readonly DataRecord[]; onOpen(lab: string, p: 1 | 2 | 3): void }) {
  const latest = [...rs].sort((a, b) => b.t - a.t).slice(0, 6);
  return (
    <article className={css.card}>
      <h2>최근 실행</h2>
      <ul className={css.recent}>
        {latest.map((r, i) => (
          <li key={`${r.t}-${i}`}>
            <button type="button" onClick={() => onOpen(r.lab, r.problem)}>
              <span className={css.num}>{stamp(r.t).slice(5, 16)}</span>
              <span className={css.recentWhat}>
                <i style={{ background: labInfo(r.lab).color }} aria-hidden />
                {labInfo(r.lab).name} <Num n={r.problem} /> {labInfo(r.lab).problems[r.problem - 1]}
              </span>
              {r.who && <span className={css.muted}>{r.who}</span>}
              {r.source === 'robot' && <span className={css.robotTag}>실제 로봇</span>}
              <span className={r.pass ? css.passTag : css.failTag}>{r.pass ? '성공' : '실패'}</span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Empty({ onDemo, onOpenLab, onClass }: { onDemo(): void; onOpenLab(lab: RunLab): void; onClass?: () => void }) {
  return (
    <div className={css.empty}>
      <div className={css.emptyCard}>
        <h2>아직 실습 기록이 없어요</h2>
        <p>
          현장 실습에서 [▶ 다시 가동]을 누를 때마다 값, 결과, 작업 시간이 여기에 쌓여요. 기록이 모이면 어느 현장이 병목인지, 어떤 값이 성공을 좌우하는지 그래프로
          찾아볼 수 있어요.
        </p>
        <button type="button" className={css.primary} onClick={onDemo}>
          예시 데이터로 둘러보기
        </button>
        <p className={css.small}>예시 데이터는 가상의 25명 반 기록이에요. 실제 기록과 섞이지 않아요.</p>
        <h3>실습하러 가기</h3>
        <div className={css.emptyLabs}>
          {RUN_LABS.map((l) => {
            const info = labInfo(l);
            return (
              <button key={l} type="button" onClick={() => onOpenLab(l)}>
                <i style={{ background: info.color }} aria-hidden />
                {info.name}
              </button>
            );
          })}
        </div>
        {onClass && (
          <p className={css.small}>
            선생님이라면: 학생들이 낸 결과 파일을
            <button type="button" className={css.link} onClick={onClass}>
              반 결과
            </button>
            에서 모아 볼 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}

const RUN_ROWS = 40;

function RunsTable({ runs, showWho }: { runs: readonly DataRecord[]; showWho: boolean }) {
  const valueKeys = [...new Set(runs.flatMap((r) => Object.keys(r.values)))];
  const checkLabels = [...new Set(runs.flatMap((r) => r.checks.map((c) => c.label)))];
  const latest = [...runs].sort((a, b) => b.t - a.t).slice(0, RUN_ROWS);
  return (
    <article className={css.card}>
      <h2>
        실행 기록{' '}
        <small>
          최근 {latest.length}개{runs.length > RUN_ROWS ? ` / 전체 ${runs.length}개 (전체는 CSV로 받아요)` : ''}
        </small>
      </h2>
      <div className={css.tableWrap}>
        <table className={css.runs}>
          <thead>
            <tr>
              <th>시각</th>
              {showWho && <th>학생</th>}
              <th>결과</th>
              <th>작업 시간</th>
              {valueKeys.map((k) => (
                <th key={k} className={css.valCol} title={k}>
                  {valueName(runs[0]?.lab ?? '', k)[0]}
                </th>
              ))}
              {checkLabels.map((c) => (
                <th key={c} title={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {latest.map((r, i) => (
              <tr key={`${r.t}-${i}`}>
                <td className={css.num}>{stamp(r.t).slice(5, 16)}</td>
                {showWho && <td>{r.who}</td>}
                <td>
                  <span className={r.pass ? css.passTag : css.failTag}>{r.pass ? '성공' : '실패'}</span>
                </td>
                <td className={css.num}>{fmtNum(r.durationS, 1)} s</td>
                {valueKeys.map((k) => (
                  <td key={k} className={`${css.num} ${css.valCol}`}>
                    {typeof r.values[k] === 'number' ? fmtNum(r.values[k] as number) : String(r.values[k] ?? '')}
                  </td>
                ))}
                {checkLabels.map((c) => {
                  const x = r.checks.find((y) => y.label === c);
                  return (
                    <td key={c} className={x && !x.ok ? css.badCell : undefined}>
                      {x ? `${x.ok ? '✓' : '✗'} ${x.value}` : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TwinTab({
  pairs,
  twin,
  fromDemo,
  pickKey,
  onPick,
  flash,
}: {
  pairs: ReturnType<typeof pairTwin>;
  twin: ReturnType<typeof twinSummary>;
  fromDemo: boolean;
  pickKey: string | null;
  onPick(k: string): void;
  flash: boolean;
}) {
  // The measured checks (mm, °, %, s, N …), mm first; counts ("3 / 4") say little about the gap.
  const checks = [...twin.byCheck]
    .filter((c) => c.unit && c.unit !== '개' && c.unit !== '곳')
    .sort((a, b) => (a.unit === 'mm' ? 0 : 1) - (b.unit === 'mm' ? 0 : 1) || b.n - a.n);
  const keyOf = (c: (typeof checks)[number]) => `${c.lab}|${c.problem}|${c.label}`;
  const cur = checks.find((c) => keyOf(c) === pickKey) ?? checks[0];
  const curPairs = cur ? pairs.filter((p) => p.lab === cur.lab && p.problem === cur.problem) : [];
  const slower = Number.isFinite(twin.durationRatio) ? Math.round((twin.durationRatio - 1) * 100) : null;
  return (
    <>
      <article className={css.card}>
        <h2>디지털 트윈: 시뮬레이터와 실제 로봇 비교</h2>
        <p className={css.lead}>
          디지털 트윈은 실제 로봇과 똑같이 움직이는 가상의 로봇이에요. 같은 문제를 같은 값으로 시뮬레이터와 실제 로봇에서 돌려, 결과가 얼마나 같은지 봐요.
          차이가 작을수록 시뮬레이터를 믿고 미리 시험할 수 있어요.
        </p>
        {fromDemo && (
          <p className={css.twinNote}>
            <b>아직 실제 로봇 기록이 없어요.</b> 현장 실습에서 고친 값 그대로 실제 로봇을 돌리고, [해결] 단계의 ‘실제 로봇 결과 적기’에 잰 값을 적어 저장하면
            ‘실제’로 기록돼요. 같은 문제 · 같은 값의 시뮬레이터 실행과 자동으로 짝지어 여기에 나와요. 아래는 예시 데이터의 비교예요.
          </p>
        )}
      </article>
      {pairs.length === 0 ? (
        <p className={css.cardNote}>짝 지을 실행이 아직 없어요. 시뮬레이터와 같은 값으로 실제 로봇에서 실행해 보세요.</p>
      ) : (
        <>
          <div className={css.kpis}>
            <div>
              <small>짝 지은 실행</small>
              <b>{twin.pairs}쌍</b>
              <span>같은 문제 · 같은 값</span>
            </div>
            <div data-flash={flash || undefined}>
              <small>위치 오차 (mm 항목 평균)</small>
              <b>{twin.mmMae === null ? '—' : `${fmtNum(twin.mmMae, 2)} mm`}</b>
              <span>
                {twin.mmMae === null
                  ? 'mm로 재는 항목이 없어요'
                  : `${MM_BANDS[twin.mmMae < 1 ? 0 : twin.mmMae < 3 ? 1 : twin.mmMae < 10 ? 2 : 3]} (|실제 − 시뮬|의 평균)`}
              </span>
            </div>
            <div>
              <small>작업 시간 차이</small>
              <b>
                {twin.durationBias > 0 ? '+' : ''}
                {fmtNum(twin.durationBias, 1)} s
              </b>
              <span>{slower === null ? '—' : slower >= 0 ? `실제가 평균 ${slower}% 느려요` : `실제가 평균 ${-slower}% 빨라요`}</span>
            </div>
            <div>
              <small>결과 일치</small>
              <b>{pct(twin.passAgree)}</b>
              <span>둘 다 성공 또는 둘 다 실패</span>
            </div>
          </div>
          <div className={css.row3}>
            <article className={css.card} data-flash={flash || undefined}>
              <div className={css.cardHead}>
                <h2>시뮬 ↔ 실제</h2>
                {cur && (
                  <div className={css.selects}>
                    <label>
                      항목
                      <select value={keyOf(cur)} onChange={(e) => onPick(e.target.value)}>
                        {checks.map((c) => (
                          <option key={keyOf(c)} value={keyOf(c)}>
                            {labInfo(c.lab).name} {c.problem}번 · {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
              {cur && (
                <div className={css.twinPlot}>
                  <TwinPlot pairs={curPairs} label={cur.label} unit={cur.unit} height={320} />
                  <p className={css.reading}>
                    점이 대각선 <b>위</b>에 있으면 실제 값이 더 커요. 이 항목은 평균 {withUnit(fmtNum(cur.mae, 2), cur.unit)} 차이 나고, 실제가 대체로{' '}
                    {withUnit(fmtNum(Math.abs(cur.bias), 2), cur.unit)} {cur.bias >= 0 ? '더 커요' : '더 작아요'}. 늘 한쪽으로 차이 나면 보정(캘리브레이션)으로
                    줄일 수 있어요.
                  </p>
                </div>
              )}
            </article>
            <article className={css.card}>
              <h2>항목별 평균 오차</h2>
              <table className={css.errTable}>
                <thead>
                  <tr>
                    <th>항목</th>
                    <th>쌍</th>
                    <th>평균 오차</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={keyOf(c)} aria-current={c === cur || undefined} onClick={() => onPick(keyOf(c))}>
                      <td>
                        <i style={{ background: labInfo(c.lab).color }} aria-hidden />
                        <Num n={c.problem} /> {c.label}
                      </td>
                      <td className={css.num}>{c.n}</td>
                      <td className={css.num}>{withUnit(fmtNum(c.mae, 2), c.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          </div>
          <PairTable pairs={pairs} />
        </>
      )}
    </>
  );
}

function PairTable({ pairs }: { pairs: ReturnType<typeof pairTwin> }) {
  const rows = [...pairs].sort((a, b) => b.robot.t - a.robot.t).slice(0, 12);
  return (
    <article className={css.card}>
      <h2>
        짝 지은 실행 <small>최근 {rows.length}쌍</small>
      </h2>
      <div className={css.tableWrap}>
        <table className={css.runs}>
          <thead>
            <tr>
              <th>실제 실행 시각</th>
              <th>학생</th>
              <th>현장 · 문제</th>
              <th>작업 시간 (시뮬 → 실제)</th>
              <th>결과 (시뮬 → 실제)</th>
              <th>잰 값 (시뮬 → 실제)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const c = p.checks.find((x) => x.unit === 'mm') ?? p.checks.find((x) => x.diff !== 0) ?? p.checks[0];
              return (
                <tr key={i}>
                  <td className={css.num}>{stamp(p.robot.t).slice(5, 16)}</td>
                  <td>{p.robot.who ?? '—'}</td>
                  <td>
                    {labInfo(p.lab).name} <Num n={p.problem} />
                  </td>
                  <td className={css.num}>
                    {fmtNum(p.sim.durationS, 1)} → {fmtNum(p.robot.durationS, 1)} s
                  </td>
                  <td>
                    <span className={p.sim.pass ? css.passTag : css.failTag}>{p.sim.pass ? '성공' : '실패'}</span> →{' '}
                    <span className={p.robot.pass ? css.passTag : css.failTag}>{p.robot.pass ? '성공' : '실패'}</span>
                  </td>
                  <td>
                    {c ? (
                      <>
                        {c.label}: {fmtNum(c.sim)} → {withUnit(fmtNum(c.robot), c.unit)}{' '}
                        <span className={css.muted}>
                          ({c.diff > 0 ? '+' : ''}
                          {fmtNum(c.diff)})
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
