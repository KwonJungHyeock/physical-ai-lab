'use client';

/**
 * 대단원 마무리 평가 · 산업단지 종합 점검 (engine/education/lab/final.ts): a list of seven items — one
 * problem from each site again, with new numbers — the score so far and the result sheet to print;
 * and one item at a time: the site's own 3D cell running the program as it is (last time's fix in
 * the new situation), then 원인 → 계산 → 고치기 in one column. The fix stays locked until the
 * calculation is right (or skipped, for no calculation points); hints cost 1 and then 2 points, said
 * on their buttons. What the student did is kept in the browser (one sheet per computer; the teacher
 * can start it again).
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { ROW } from '@/engine/education/lab/bio';
import { FARM_TOMATOES } from '@/engine/education/lab/farm';
import { partThings, type PartValues } from '@/engine/education/lab/ai';
import { progFromRef, type PalletPose, type RefValues } from '@/engine/education/lab/pallet';
import { P3_BOXES } from '@/engine/education/lab/problems';
import { speedItems } from '@/engine/education/lab/energy';
import { FINAL_ITEMS, HINT_COST, ITEM_MAX, freshRecord, runFinal, scoreFinal, scoreItem, type FinalItem, type FinalOutcome, type FinalRecord, type FinalValues } from '@/engine/education/lab/final';
import { SITES } from '@/engine/education/park';

import LearnStage, { type LiveArm, type ViewPose } from '../stage/LearnStage';
import AiCell, { AiPlayback } from './AiCell';
import { AI_VIEW } from './AiLab';
import { AiAround, BioAround, CafeAround, ENERGY_LOOK, EnergyAround, FactoryAround, FarmAround, LOOKS, LogisticsAround } from './ambient/Around';
import type { SiteLook } from './ambient/Ground';
import BioCell, { BioPlayback } from './BioCell';
import { BIO_VIEW } from './BioLab';
import CafeCell, { CafePlayback } from './CafeCell';
import { CAFE_VIEW } from './CafeLab';
import ConveyorCell from './ConveyorCell';
import EnergyCell, { EnergyPlayback } from './EnergyCell';
import { ENERGY_VIEW } from './EnergyLab';
import { LAB_VIEW } from './FactoryLab';
import FarmCell, { FarmPlayback } from './FarmCell';
import { FARM_VIEW } from './FarmLab';
import { LOGI_VIEW } from './LogisticsLab';
import PalletCell, { PalletPlayback } from './PalletCell';
import { Playback } from './playback';
import { Lines } from '../lesson/Rich';
import { fmt, near } from './SiteFlow';
import css from './lab.module.css';
import lg from './site.module.css';
import fx from './final.module.css';
import ViewHint from '../../simulator/ViewHint';

const KEY = 'final-exam';
/** Sheets handed in on this computer (one per student), for the teacher's class table. */
const CLASS_KEY = 'final-exam-class';

interface Submitted {
  name: string;
  date: string;
  records: Record<string, FinalRecord>;
}

const readClass = (): Submitted[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CLASS_KEY) ?? '[]') as Submitted[];
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string' && x.records) : [];
  } catch {
    return [];
  }
};
const writeClass = (list: Submitted[]) => {
  try {
    localStorage.setItem(CLASS_KEY, JSON.stringify(list));
  } catch {
    /* private window: for this visit only */
  }
};

interface Saved {
  name: string;
  records: Record<string, FinalRecord>;
}

const readSaved = (): Saved => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (v && typeof v === 'object' && v.records) return { name: v.name ?? '', records: v.records };
  } catch {
    /* none yet */
  }
  return { name: '', records: {} };
};

/** The playbacks of the seven cells share this much. */
interface Player {
  start(run: unknown, at?: number | 'end', rate?: number): void;
  listen(fn: ((t: number, done: boolean) => void) | null): void;
  pause(): void;
  resume(): void;
  playing: boolean;
  t: number;
  arm: { current: LiveArm | null };
}

const colorOf = (item: FinalItem) => SITES.find((s) => s.lab === item.lab)?.color ?? '#3454d1';

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  hidden: boolean;
  onBack(): void;
}

export default function FinalExam({ robot, chain, gripperRobot, hidden, onBack }: Props) {
  const [saved, setSaved] = useState<Saved>({ name: '', records: {} });
  const [open, setOpen] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [klass, setKlass] = useState<Submitted[]>([]);
  const [classOpen, setClassOpen] = useState(false);
  // What was kept on this computer, read after hydration (the page is a static export).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readSaved());
    setKlass(readClass());
  }, []);
  const save = useCallback((fn: (s: Saved) => Saved) => {
    setSaved((s) => {
      const next = fn(s);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private window: for this visit only */
      }
      return next;
    });
  }, []);
  const setRecord = useCallback((id: string, fn: (r: FinalRecord) => FinalRecord) => save((s) => ({ ...s, records: { ...s.records, [id]: fn(s.records[id] ?? freshRecord()) } })), [save]);

  // For tools/check scripts: open an item by number (0 … 6), or the list.
  useEffect(() => {
    window.__finalOpen = (k: number | null) => setOpen(k);
    return () => {
      delete window.__finalOpen;
    };
  }, []);

  const total = scoreFinal(saved.records);
  const item = open === null ? null : FINAL_ITEMS[open];

  return (
    <>
      {item ? (
        <ItemScreen
          key={item.id}
          item={item}
          no={open! + 1}
          robot={robot}
          chain={chain}
          gripperRobot={gripperRobot}
          hidden={hidden}
          record={saved.records[item.id] ?? freshRecord()}
          setRecord={(fn) => setRecord(item.id, fn)}
          onList={() => setOpen(null)}
          onNext={open! + 1 < FINAL_ITEMS.length ? () => setOpen(open! + 1) : null}
        />
      ) : (
        <div className={fx.hub} hidden={hidden}>
          <header className={fx.hubBar}>
            <button type="button" className={css.back} onClick={onBack}>
              ← 로봇 시티
            </button>
            <b>대단원 마무리 평가</b>
            <span>현장 종합 점검 · myCobot 280</span>
          </header>
          <div className={fx.hubBody}>
            <section className={fx.intro}>
              <h2>일곱 현장에 다시 문제가 생겼어요</h2>
              <p>
                <Lines text="현장마다 프로그램은 지난번에 고친 그대로예요. 그런데 상황이 조금 바뀌었어요. 센서도, 팔레트도, 로봇도 바뀌었어요. 외운 답은 통하지 않아요. 원리로 새 숫자를 다시 계산해 고쳐요." />
              </p>
              <ul className={fx.rules}>
                <li>
                  <b>원인</b> 처음에 맞히면 4점, 두 번째 2점
                </li>
                <li>
                  <b>계산</b> 처음 확인에 맞으면 3점, 나중에 맞으면 1점. 맞혀야 고치기가 열려요 (건너뛰면 0점)
                </li>
                <li>
                  <b>고치기</b> 다시 가동해서 통과하면 3점
                </li>
                <li>
                  <b>힌트</b> 첫 힌트 1점, 둘째 힌트 2점 빼기
                </li>
              </ul>
              <label className={fx.name}>
                이름
                <input value={saved.name} onChange={(e) => save((s) => ({ ...s, name: e.target.value }))} placeholder="이름을 적어요" />
              </label>
            </section>
            <ol className={fx.items}>
              {FINAL_ITEMS.map((it, k) => {
                const r = saved.records[it.id];
                const sc = r ? scoreItem(it, r) : null;
                const state = r?.done ? 'done' : r && (r.runs > 0 || r.picks.length > 0) ? 'going' : 'new';
                return (
                  <li key={it.id} style={{ '--c': colorOf(it) } as CSSProperties} data-state={state}>
                    <span className={fx.no}>{k + 1}</span>
                    <div>
                      <small>{it.site}</small>
                      <b>{it.title}</b>
                    </div>
                    <span className={fx.pts}>{sc ? `${sc.total} / ${ITEM_MAX}` : `— / ${ITEM_MAX}`}</span>
                    <button type="button" className={css.primary} onClick={() => setOpen(k)}>
                      {state === 'done' ? '다시 보기' : state === 'going' ? '이어서' : '시작'}
                    </button>
                  </li>
                );
              })}
            </ol>
            <section className={fx.total}>
              <div>
                <small>점수</small>
                <b>
                  {total.score}
                  <i> / 100</i>
                </b>
              </div>
              <div>
                <small>성취 수준</small>
                <b>{total.grade}</b>
              </div>
              <div>
                <small>마친 문항</small>
                <b>
                  {FINAL_ITEMS.filter((x) => saved.records[x.id]?.done).length}
                  <i> / {FINAL_ITEMS.length}</i>
                </b>
              </div>
              <div className={fx.totalBtns}>
                <button type="button" className={css.primary} onClick={() => setSheet(true)}>
                  결과지 보기 · 인쇄
                </button>
                {/* 반 기록 (several students on one PC): the teacher's. */}
                <button
                  type="button"
                  className={css.primary}
                  title="이 학생의 결과를 반 기록에 넣고, 다음 학생이 새로 시작해요"
                  onClick={() => {
                    const who = saved.name.trim();
                    if (!who) {
                      window.alert('이름을 먼저 적어 주세요.');
                      return;
                    }
                    if (!window.confirm(`${who} 학생의 결과(${total.score}점)를 반 기록에 저장하고 다음 학생을 시작할까요?`)) return;
                    const next = [...klass, { name: who, date: new Date().toISOString(), records: saved.records }];
                    writeClass(next);
                    setKlass(next);
                    save(() => ({ name: '', records: {} }));
                  }}
                >
                  제출하고 다음 학생
                </button>
                <button type="button" className={fx.reset} onClick={() => setClassOpen(true)} title="교사용: 이 컴퓨터에서 제출한 학생들의 점수">
                  반 결과 ({klass.length}명)
                </button>
                <button
                  type="button"
                  className={fx.reset}
                  onClick={() => {
                    if (window.confirm('지금 학생의 기록을 지우고 처음부터 할까요? (반 기록은 그대로)')) save(() => ({ name: '', records: {} }));
                  }}
                >
                  처음부터 다시
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
      {sheet && <ResultSheet saved={saved} onClose={() => setSheet(false)} />}
      {classOpen && (
        <ClassSheet
          list={klass}
          onClear={() => {
            writeClass([]);
            setKlass([]);
          }}
          onClose={() => setClassOpen(false)}
        />
      )}
    </>
  );
}

declare global {
  interface Window {
    __finalOpen?: (k: number | null) => void;
  }
}

/* --- one item ------------------------------------------------------------------------------ */

interface ItemProps {
  item: FinalItem;
  no: number;
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  hidden: boolean;
  record: FinalRecord;
  setRecord(fn: (r: FinalRecord) => FinalRecord): void;
  onList(): void;
  onNext: (() => void) | null;
}

const VIEWS: Record<FinalItem['lab'], ViewPose> = { factory: LAB_VIEW, logistics: LOGI_VIEW, bio: BIO_VIEW, farm: FARM_VIEW, cafe: CAFE_VIEW, ai: AI_VIEW, energy: ENERGY_VIEW };
const SITE_LOOKS: Record<FinalItem['lab'], SiteLook> = { ...LOOKS, energy: ENERGY_LOOK };

function makePlayer(lab: FinalItem['lab']): Player {
  const p = lab === 'factory' ? new Playback() : lab === 'logistics' ? new PalletPlayback() : lab === 'bio' ? new BioPlayback() : lab === 'farm' ? new FarmPlayback() : lab === 'cafe' ? new CafePlayback() : lab === 'energy' ? new EnergyPlayback() : new AiPlayback();
  return p as unknown as Player;
}

/** Values in words, for the record: each field's label and value. */
function valuesText(item: FinalItem, v: FinalValues): string {
  return item.fields
    .map((f) => {
      const x = v[f.key];
      if (f.kind === 'choice') return `${f.label} ${f.options.find((o) => o.value === x)?.label ?? String(x)}`;
      return `${f.label} ${fmt(Number(x), f.step < 0.01 ? 3 : f.step < 1 ? (f.step < 0.1 ? 2 : 1) : 0)} ${f.unit}`;
    })
    .join(' · ');
}

function ItemScreen({ item, no, robot, chain, gripperRobot, hidden, record, setRecord, onList, onNext }: ItemProps) {
  const player = useMemo(() => makePlayer(item.lab), [item.lab]);
  const [values, setValues] = useState<FinalValues>(item.start);
  const [shown, setShown] = useState<FinalOutcome | null>(null);
  const [before, setBefore] = useState<FinalOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [calc, setCalc] = useState<string[]>(() => item.calc.fields.map(() => ''));
  const right = item.causes.findIndex((c) => c.ok);
  const causeFound = record.picks.includes(right);
  const calcRight = record.calcChecks.includes(true);
  const skipped = !!record.calcSkipped && !calcRight;
  // The fix opens once the calculation is right — or skipped, for no calculation points.
  const calcDone = calcRight || skipped;
  const ran = record.runs > 0 || before !== null;
  const done = record.done;

  useEffect(() => {
    player.listen((_, d) => {
      setEnded(d);
      setPlaying(player.playing);
    });
    return () => player.listen(null);
  }, [player]);

  const play = useCallback(
    (o: FinalOutcome) => {
      setShown(o);
      setEnded(false);
      player.start(o.run, 0, rate);
      setPlaying(true);
    },
    [player, rate],
  );

  // The program as it is, worked out once (and shown still at its start).
  useEffect(() => {
    let live = true;
    void runFinal(chain, item, item.start).then((o) => {
      if (!live) return;
      setBefore(o);
      setShown(o);
      player.start(o.run, 0);
      player.pause();
    });
    return () => {
      live = false;
    };
  }, [chain, item, player]);

  const runNow = async (v: FinalValues, counted: boolean) => {
    setBusy(true);
    try {
      const o = v === item.start && before ? before : await runFinal(chain, item, v);
      play(o);
      if (counted) setRecord((r) => ({ ...r, runs: r.runs + 1, pass: r.pass || o.pass, last: valuesText(item, v) }));
    } finally {
      setBusy(false);
    }
  };

  const showFail = shown && ended && !shown.pass;
  const showPass = shown && ended && shown.pass;
  const steps = [
    { label: '가동', ok: ran },
    { label: '원인', ok: causeFound },
    { label: '계산', ok: calcDone },
    { label: '고치기', ok: record.pass },
  ];
  const now = steps.findIndex((s) => !s.ok);

  return (
    <div className={css.lab} hidden={hidden} style={{ '--site': colorOf(item), '--site-soft': '#f3f5fa' } as CSSProperties}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onList}>
          ← 평가 목록
        </button>
        <b className={css.chapter}>
          <i className={lg.dot} aria-hidden />
          평가 {no} / {FINAL_ITEMS.length} · {item.site}
          <small>{item.title}</small>
        </b>
        <nav className={css.steps} aria-label="단계">
          {steps.map((s, i) => (
            <button key={s.label} type="button" disabled data-st={s.ok ? 'done' : i === now ? 'now' : undefined}>
              <i>{s.ok ? '✓' : i + 1}</i>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <section className={css.stage} aria-label={`3D ${item.site}`}>
        <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={{ angles: [0, 0, 0, 0, 0, 0] }} paused={hidden} home={VIEWS[item.lab]} live={player.arm} look={SITE_LOOKS[item.lab]}>
          <ItemCell item={item} player={player} values={values} />
        </LearnStage>
        {showFail && <div className={lg.alarm}>⚠ {shown.headline}</div>}
        {showPass && <div className={lg.okPill}>✓ {shown.headline}</div>}
        {shown && (
          <div className={lg.player}>
            <button
              type="button"
              onClick={() => {
                if (player.playing) player.pause();
                else if (ended) play(shown);
                else player.resume();
                setPlaying(player.playing);
              }}
            >
              {playing ? '❚❚ 멈춤' : '▶ 재생'}
            </button>
            <button
              type="button"
              title="끝으로 건너뛰어 결과 보기"
              onClick={() => {
                player.start(shown.run, 'end');
                setEnded(true);
                setPlaying(false);
              }}
            >
              ⏭ 끝으로
            </button>
            <span>{shown === before ? '지금 프로그램' : '고친 값'}</span>
            <span className={fx.rates} role="group" aria-label="재생 속도">
              {[1, 2, 4].map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rate === r}
                  onClick={() => {
                    setRate(r);
                    (player as Player & { setRate?(x: number): void }).setRate?.(r);
                  }}
                >
                  ×{r}
                </button>
              ))}
            </span>
          </div>
        )}
        <ViewHint className={css.hint} />
      </section>

      <aside className={css.panel} aria-label="평가 문항">
        <div className={`${css.body} ${fx.col}`}>
          <section className={fx.card}>
            <h3>
              <span>1</span> 상황
            </h3>
            <p className={fx.line}>
              <b>{item.boss}</b>
              <Lines text={`“${item.line}”`} />
            </p>
            <p>
              <Lines text={item.brief} />
            </p>
            <ul className={fx.spec}>
              {item.spec.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <button type="button" className={css.primary} disabled={busy || !before} onClick={() => before && void runNow(item.start, false).then(() => setRecord((r) => (r.runs || r.picks.length ? r : { ...r, last: valuesText(item, item.start) })))}>
              ▶ 지금 프로그램으로 가동
            </button>
          </section>

          {ran && (
            <section className={fx.card} data-done={causeFound || undefined}>
              <h3>
                <span>2</span> 원인: 무엇이 문제일까요?
              </h3>
              <div className={fx.choices}>
                {item.causes.map((c, k) => {
                  const picked = record.picks.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      data-r={picked ? (c.ok ? 'ok' : 'no') : undefined}
                      disabled={causeFound || picked || done}
                      onClick={() => setRecord((r) => ({ ...r, picks: [...r.picks, k] }))}
                    >
                      {c.t}
                    </button>
                  );
                })}
              </div>
              {record.picks.length > 0 && !causeFound && <p className={fx.no}>아니에요. 바뀐 상황(숫자)을 다시 읽어 봐요.</p>}
            </section>
          )}

          {causeFound && (
            <section className={fx.card} data-done={calcRight || undefined}>
              <h3>
                <span>3</span> 계산: 새 숫자로
              </h3>
              <table className={fx.data}>
                <tbody>
                  {item.data.map((d) => (
                    <tr key={d.k}>
                      <th>{d.k}</th>
                      <td>{d.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={fx.prompt}>
                <Lines text={item.calc.prompt} />
              </p>
              {item.calc.fields.map((f, i) => (
                <label key={f.label} className={fx.calcRow}>
                  <span>{f.label}</span>
                  <input
                    inputMode="decimal"
                    value={calc[i]}
                    disabled={calcDone || done}
                    onChange={(e) => setCalc((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <em>{f.unit}</em>
                </label>
              ))}
              {!calcDone && !done && (
                <button
                  type="button"
                  className={css.primary}
                  disabled={calc.some((x) => !x.trim())}
                  onClick={() => setRecord((r) => ({ ...r, calcChecks: [...r.calcChecks, item.calc.fields.every((f, i) => near(calc[i], f.answer, f.tol))] }))}
                >
                  확인
                </button>
              )}
              {skipped ? (
                <p className={fx.no}>계산을 건너뛰었어요 (계산 0점).</p>
              ) : (
                record.calcChecks.length > 0 && <p className={calcRight ? fx.yes : fx.no}>{calcRight ? '맞았어요.' : record.calcChecks.length >= 2 ? '아직 달라요. 식에 숫자를 하나씩 넣어 봐요. 힌트도 있어요.' : '다시 계산해 봐요.'}</p>
              )}
            </section>
          )}

          {causeFound && (
            <section className={fx.card} data-done={record.pass || undefined} data-locked={!calcDone || undefined}>
              <h3>
                <span>4</span> 고치기: 값을 바꿔 다시 가동
              </h3>
              {!calcDone && !done && (
                <div className={fx.lock}>
                  <p>🔒 계산을 맞히면 열려요. 먼저 새 숫자로 계산해 봐요.</p>
                  <button
                    type="button"
                    className={fx.reset}
                    onClick={() => {
                      if (window.confirm('계산을 건너뛰고 고치기로 갈까요? 이 문항의 계산 점수는 0점이 돼요.')) setRecord((r) => ({ ...r, calcSkipped: true }));
                    }}
                  >
                    계산 건너뛰고 고치기 (계산 0점)
                  </button>
                </div>
              )}
              <div className={fx.fields}>
                {item.fields.map((f) =>
                  f.kind === 'num' ? (
                    <label key={f.key} className={fx.field}>
                      <span>{f.label}</span>
                      <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={Number(values[f.key])}
                        disabled={done || !calcDone}
                        onChange={(e) => {
                          const x = Number(e.target.value);
                          if (Number.isFinite(x)) setValues((v) => ({ ...v, [f.key]: Math.min(f.max, Math.max(f.min, x)) }));
                        }}
                      />
                      <em>{f.unit}</em>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={Number(values[f.key])} disabled={done || !calcDone} onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))} />
                    </label>
                  ) : (
                    <div key={f.key} className={fx.field}>
                      <span>{f.label}</span>
                      <div className={fx.seg}>
                        {f.options.map((o) => (
                          <button key={String(o.value)} type="button" aria-pressed={values[f.key] === o.value} disabled={done || !calcDone} onClick={() => setValues((v) => ({ ...v, [f.key]: o.value }))}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
              {!done && (
                <button type="button" className={css.primary} disabled={busy || !calcDone} onClick={() => void runNow(values, true)}>
                  {busy ? '계산 중…' : '▶ 다시 가동'}
                </button>
              )}
              {record.runs > 0 && (
                <p className={record.pass ? fx.yes : fx.no}>
                  {record.pass ? '통과했어요.' : `${record.runs}번 가동 · 아직 기준에 못 미쳐요.`} 마지막 값: {record.last}
                </p>
              )}
            </section>
          )}

          {(ran && !done) && (
            <section className={fx.hints}>
              {item.hints.slice(0, record.hints).map((h, i) => (
                <p key={i}>
                  <b>힌트 {i + 1}</b> <Lines text={h} />
                </p>
              ))}
              {record.hints < item.hints.length && (
                <button type="button" onClick={() => setRecord((r) => ({ ...r, hints: r.hints + 1 }))}>
                  {record.hints === 0 ? '힌트 보기' : '힌트 하나 더'} (−{HINT_COST[record.hints]}점)
                </button>
              )}
            </section>
          )}

          {(record.pass || done) && (
            <section className={fx.principle}>
              <b>원리</b>
              <p>
                <Lines text={item.principle} />
              </p>
            </section>
          )}

          <div className={fx.foot}>
            <span className={fx.score}>
              이 문항 {scoreItem(item, record).total} / {ITEM_MAX}
            </span>
            {!done ? (
              <button
                type="button"
                className={record.pass ? css.primary : fx.reset}
                disabled={!ran}
                onClick={() => {
                  if (record.pass || window.confirm('아직 통과하지 못했어요. 이 문항을 이대로 마칠까요? (점수는 지금까지만)')) setRecord((r) => ({ ...r, done: true }));
                }}
              >
                이 문항 마치기
              </button>
            ) : onNext ? (
              <button type="button" className={css.primary} onClick={onNext}>
                다음 문항 →
              </button>
            ) : (
              <button type="button" className={css.primary} onClick={onList}>
                평가 목록으로
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The site's cell, its surroundings and the situation drawn in it (the moved pallet, the raised camera, the shorter parts, the heavier can …). */
function ItemCell({ item, player, values }: { item: FinalItem; player: Player; values: FinalValues }) {
  switch (item.lab) {
    case 'factory':
      return (
        <>
          <FactoryAround />
          <ConveyorCell player={player as unknown as Playback} boxes={P3_BOXES} sensors={[Number(values.sensorY)]} overlay={{}} prob={3} />
        </>
      );
    case 'logistics':
      return (
        <>
          <LogisticsAround />
          <PalletCell player={player as unknown as PalletPlayback} overlay={{ progPallet: progFromRef(values as unknown as RefValues) }} prob={3} pallet={values.moved as PalletPose} />
        </>
      );
    case 'bio':
      return (
        <>
          <BioAround />
          <BioCell player={player as unknown as BioPlayback} prob={2} overlay={{}} tubes={ROW.n} />
        </>
      );
    case 'farm':
      return (
        <>
          <FarmAround />
          <FarmCell player={player as unknown as FarmPlayback} prob={2} tomatoes={FARM_TOMATOES[2]} overlay={{}} camZ={Number(values.camZ)} />
        </>
      );
    case 'cafe':
      return (
        <>
          <CafeAround />
          <CafeCell player={player as unknown as CafePlayback} prob={2} overlay={{ detect: Number(values.detect), zone: true }} />
        </>
      );
    case 'energy':
      return (
        <>
          <EnergyAround />
          <EnergyCell player={player as unknown as EnergyPlayback} prob={2} things={speedItems(Number(values.canG))} overlay={{}} />
        </>
      );
    default:
      return (
        <>
          <AiAround />
          <AiCell player={player as unknown as AiPlayback} prob={3} things={partThings(values as unknown as PartValues)} overlay={{}} />
        </>
      );
  }
}

/** The sheets' buttons take the site colour; the sheets are the whole park's, so the app's own blue. */
const SHEET_TONE = { '--site': '#3454d1', '--site-soft': '#edf2ff' } as CSSProperties;

/* --- the result sheet ---------------------------------------------------------------------- */

function ResultSheet({ saved, onClose }: { saved: Saved; onClose(): void }) {
  const date = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), []);
  const total = scoreFinal(saved.records);
  return createPortal(
    <div className={`${lg.recordBack} logi-record`} style={SHEET_TONE} role="dialog" aria-modal="true" aria-label="평가 결과지">
      <div className={lg.record}>
        <header className={lg.recordHead}>
          <div>
            <small>로봇 시티 · myCobot 280</small>
            <b>대단원 마무리 평가 결과지</b>
          </div>
          <div className={lg.recordWho}>
            <span>날짜 {date}</span>
            <span>이름 {saved.name || '________'}</span>
          </div>
        </header>
        <table className={fx.sheet}>
          <thead>
            <tr>
              <th>문항</th>
              <th>원인 (4)</th>
              <th>계산 (3)</th>
              <th>고치기 (3)</th>
              <th>힌트</th>
              <th>점수</th>
              <th>마지막 값 · 가동</th>
            </tr>
          </thead>
          <tbody>
            {FINAL_ITEMS.map((it, k) => {
              const r = saved.records[it.id] ?? freshRecord();
              const s = scoreItem(it, r);
              return (
                <tr key={it.id}>
                  <td>
                    {k + 1}. {it.site}
                    <small>{it.title}</small>
                  </td>
                  <td>
                    {s.cause}
                    {r.picks.includes(it.causes.findIndex((c) => c.ok)) && <small>{r.picks.length}번 만에</small>}
                  </td>
                  <td>
                    {s.calc}
                    {calcNote(r).map((x) => (
                      <small key={x}>{x}</small>
                    ))}
                  </td>
                  <td>{s.fix}</td>
                  <td>
                    {s.hintOff ? `−${s.hintOff}` : '0'}
                    {r.hints > 0 && <small>{r.hints}개</small>}
                  </td>
                  <td>
                    <b>{s.total}</b>
                  </td>
                  <td>
                    {r.last || '—'}
                    <small>
                      {r.runs}번 가동 · {r.pass ? '통과' : r.done ? '마침 (통과 못 함)' : '진행 중'}
                    </small>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>합계 {total.points} / {total.of}</td>
              <td colSpan={2}>
                <b>
                  {total.score} / 100 · 성취 수준 {total.grade}
                </b>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className={fx.sheetNote}>
          성취 수준: A 90 이상 · B 80 이상 · C 70 이상 · D 60 이상 · E 60 미만. 힌트는 첫째 1점, 둘째 2점을 빼요. 문항마다 원인 · 계산 · 고치기를 따로 봐요. 어느 단계에서 점수를 잃었는지가 다음 공부의 출발점이에요. 계산을 건너뛴 문항은 그 단원의 식부터 다시 봐요.
        </p>
        <div className={lg.recordBtns}>
          <button type="button" className={`${css.primary} ${lg.siteBtn}`} onClick={() => window.print()}>
            인쇄 · PDF로 저장
          </button>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The calculation in words, a line each: how many checks, and whether it was skipped. */
function calcNote(r: FinalRecord): string[] {
  const n = r.calcChecks.length;
  return [...(n ? [`${n}번 확인`] : []), ...(r.calcSkipped && !r.calcChecks.includes(true) ? ['건너뜀'] : [])];
}

/* --- the class table (teacher) -------------------------------------------------------------- */

const SHORT: Record<string, string> = { factory: '공장', logistics: '물류', bio: '바이오', farm: '스마트팜', cafe: '시티', ai: 'AI', energy: '자원순환' };

/** The class as rows: name, date, each item's points, the total, the score and the grade. */
function classRows(list: readonly Submitted[]) {
  return list.map((x) => {
    const t = scoreFinal(x.records);
    return {
      name: x.name,
      date: new Date(x.date).toLocaleDateString('ko-KR'),
      items: FINAL_ITEMS.map((it) => (x.records[it.id] ? scoreItem(it, x.records[it.id]).total : 0)),
      /** Hints opened and calculations skipped, over all items. */
      hints: FINAL_ITEMS.reduce((n, it) => n + (x.records[it.id]?.hints ?? 0), 0),
      skips: FINAL_ITEMS.filter((it) => x.records[it.id]?.calcSkipped && !x.records[it.id].calcChecks.includes(true)).length,
      ...t,
    };
  });
}

/** A CSV file (Excel opens it: UTF-8 with its byte-order mark) saved by the browser. */
function downloadCsv(list: readonly Submitted[]) {
  const rows = classRows(list);
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['이름', '날짜', ...FINAL_ITEMS.map((it) => `${SHORT[it.id]} (${ITEM_MAX})`), `합계 (${FINAL_ITEMS.length * ITEM_MAX})`, '점수 (100)', '성취 수준', '힌트 (개)', '계산 건너뜀 (문항)'];
  const body = rows.map((r) => [r.name, r.date, ...r.items, r.points, r.score, r.grade, r.hints, r.skips]);
  const csv = '\ufeff' + [head, ...body].map((l) => l.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `final-exam-class-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 60000); // an iPad asks before saving: the link must outlive the question
}

function ClassSheet({ list, onClear, onClose }: { list: readonly Submitted[]; onClear(): void; onClose(): void }) {
  const rows = classRows(list);
  const avg = (k: number) => (rows.length ? rows.reduce((s, r) => s + r.items[k], 0) / rows.length : 0);
  const avgScore = rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : 0;
  return createPortal(
    <div className={`${lg.recordBack} logi-record`} style={SHEET_TONE} role="dialog" aria-modal="true" aria-label="반 결과">
      <div className={lg.record}>
        <header className={lg.recordHead}>
          <div>
            <small>대단원 마무리 평가 · 이 컴퓨터에서 제출한 학생</small>
            <b>반 결과</b>
          </div>
          <div className={lg.recordWho}>
            <span>{rows.length}명</span>
            <span>평균 {fmt(avgScore, 1)}점</span>
          </div>
        </header>
        {rows.length === 0 ? (
          <p className={fx.sheetNote}>아직 제출한 학생이 없어요. 학생이 평가를 마치면 목록에서 [제출하고 다음 학생]을 눌러요.</p>
        ) : (
          <table className={fx.sheet}>
            <thead>
              <tr>
                <th>이름</th>
                <th>날짜</th>
                {FINAL_ITEMS.map((it) => (
                  <th key={it.id}>{SHORT[it.id]}</th>
                ))}
                <th>점수</th>
                <th>수준</th>
                <th>힌트 · 건너뜀</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>{r.date}</td>
                  {r.items.map((v, k) => (
                    <td key={k}>{v}</td>
                  ))}
                  <td>
                    <b>{r.score}</b>
                  </td>
                  <td>{r.grade}</td>
                  <td>
                    {r.hints} · {r.skips}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>문항 평균 (10점 만점)</td>
                {FINAL_ITEMS.map((it, k) => (
                  <td key={it.id}>{fmt(avg(k), 1)}</td>
                ))}
                <td colSpan={3}>{fmt(avgScore, 1)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className={fx.sheetNote}>문항 평균이 낮은 현장이 반 전체가 다시 볼 곳이에요. 힌트 · 건너뜀은 본 힌트 수와 계산을 건너뛴 문항 수예요. CSV는 엑셀에서 바로 열려요.</p>
        <div className={lg.recordBtns}>
          <button type="button" className={`${css.primary} ${lg.siteBtn}`} disabled={!rows.length} onClick={() => downloadCsv(list)}>
            CSV로 저장 (엑셀)
          </button>
          <button type="button" disabled={!rows.length} onClick={() => window.print()}>
            인쇄 · PDF
          </button>
          <button
            type="button"
            disabled={!rows.length}
            onClick={() => {
              if (window.confirm('이 컴퓨터의 반 기록을 모두 지울까요? 먼저 CSV로 저장해 두세요.')) onClear();
            }}
          >
            반 기록 지우기
          </button>
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
