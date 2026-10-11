'use client';

/**
 * The lesson in one column on the left of the 3D view: everything a student reads, picks and
 * does, in order, in one place (it replaces the floating activity panel and the theory column).
 *
 * What a block is shows before its words do — each kind has its own colour, icon and tag:
 *   개념 (read)    white          the idea to remember, the principle, the long theory folded
 *   질문 (ask)     warm amber     something to pick: round choice rows, never buttons
 *   해 보기 (do)   blue           the topic's own controls: move, press, watch the 3D view
 *   결과 (result)  green          what came out, and whether the guess was right
 *   교사용 (teacher) dashed grey   what the teacher asks and the answers (only when switched on)
 * An activity goes 예상 → 해 보기 → 결과 → 왜, one block opening after the other: the block to do
 * now is outlined, the next ones wait folded. The one big button at the foot always names where it
 * goes. The topic's controls stay mounted on every page (switching steps must not reset a try).
 */

import { STEP_NAME, STEP_NO, lessonNo, nextTopicOf, type StepKey, type Topic } from '@/engine/education/catalog';
import { tryGif } from '@/engine/education/media';
import { problemsUsing, type SiteId } from '@/engine/education/park';
import type { StudyLevel } from '@/engine/education/roadmap';
import { glossFirst } from '@/engine/education/symbols';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { useAccount } from '../../account/AccountProvider';
import { QuickCheck } from './QuickCheck';
import { Rich, SymbolTable, TermChips } from './Rich';
import { TopicArt } from './TopicArt';
import { ACT_NAME, PAGES, PAGE_LABEL, isActivity, usedBy, type Onward, type PageId } from './LessonCards';
import type { ResultRow } from '../topics/types';
import lc from '../learn.module.css';
import wb from './workbook.module.css';
import css from './rail.module.css';

const KEYS: StepKey[] = ['A', 'B', 'C'];
const TEACHER_KEY = 'learn-teacher';
const NOTES_KEY = 'learn-overlay-notes';
const MINUTES: Record<StudyLevel, Record<PageId, number>> = {
  hs: { intro: 5, theory: 10, A: 8, B: 8, C: 8, cmp: 6, check: 5 },
  uni: { intro: 5, theory: 20, A: 10, B: 10, C: 10, cmp: 10, check: 10 },
};

type Kind = 'read' | 'ask' | 'do' | 'result' | 'teacher';
type St = 'now' | 'done' | 'todo';

const TAG: Record<Kind, string> = { read: '개념', ask: '질문 · 골라요', do: '해 보기 · 직접 움직여요', result: '결과', teacher: '교사용' };

/** The kind's mark: a small line icon (book, question, hand, check, person). */
function Mark({ kind }: { kind: Kind }) {
  const d: Record<Kind, ReactNode> = {
    read: <path d="M3 4.5C5 3.5 7 3.5 9 4.5v9c-2-1-4-1-6 0zM9 4.5c2-1 4-1 6 0v9c-2-1-4-1-6 0z" />,
    ask: (
      <>
        <circle cx="9" cy="9" r="6.5" />
        <path d="M7.2 7.2a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3M9 12.6v.1" />
      </>
    ),
    do: <path d="M6.5 9.5V4.2a1.2 1.2 0 0 1 2.4 0v4.3M8.9 8.5V7.4a1.2 1.2 0 0 1 2.4 0v1.6M11.3 9V8.3a1.2 1.2 0 0 1 2.4 0v3.2c0 2.6-1.8 4.5-4.3 4.5-1.8 0-2.8-.8-3.8-2.3L4.1 11a1.2 1.2 0 0 1 2-1.3l.4.6" />,
    result: (
      <>
        <circle cx="9" cy="9" r="6.5" />
        <path d="M6 9.2l2 2 4-4.2" />
      </>
    ),
    teacher: (
      <>
        <circle cx="9" cy="6" r="2.6" />
        <path d="M3.8 15c.6-2.8 2.6-4.3 5.2-4.3s4.6 1.5 5.2 4.3" />
      </>
    ),
  };
  return (
    <svg className={css.mark} viewBox="0 0 18 18" aria-hidden="true">
      {d[kind]}
    </svg>
  );
}

/** One block: its kind's tag (and number, in an activity), a title, and what is inside. */
function Block({ kind, st, n, title, wait, children, label }: { kind: Kind; st?: St; n?: number; title?: ReactNode; wait?: string; children?: ReactNode; label?: string }) {
  const folded = st === 'todo';
  return (
    <section className={css.blk} data-kind={kind} data-st={st} aria-label={label}>
      <header className={css.blkHead}>
        {n !== undefined ? <i className={css.num}>{st === 'done' ? '✓' : n}</i> : <Mark kind={kind} />}
        <span className={css.tag}>{TAG[kind]}</span>
        {title && <b className={css.blkTitle}>{title}</b>}
      </header>
      {folded ? wait && <p className={css.wait}>{wait}</p> : children}
    </section>
  );
}

interface Props {
  topic: Topic;
  page: PageId;
  onPage(p: PageId): void;
  results: Partial<Record<StepKey, ResultRow>>;
  onChecked(): void;
  level: StudyLevel;
  onTopic(id: Topic['id']): void;
  onSite?(id: SiteId): void;
  onward?: Onward | null;
  /** The topic's hands-on controls (sliders, buttons, graphs): kept mounted on every page. */
  controls: ReactNode;
}

export default function LessonRail({ topic, page, onPage, results, onChecked, level, onTopic, onSite, onward, controls }: Props) {
  const i = PAGES.indexOf(page);
  const act = isActivity(page) ? topic.steps.find((s) => s.key === page)! : null;
  const [teacherOn, setTeacher] = useState(false);
  // 교사용 보기: free mode and teachers keep the switch; a student in class mode never sees teacher blocks.
  const teacherAllowed = useAccount().role !== 'student';
  const teacher = teacherOn && teacherAllowed;
  const [notes, setNotes] = useState(false);
  /** The guesses made in this lesson (index into the activity's 보기). */
  const [guess, setGuess] = useState<Partial<Record<StepKey, number>>>({});
  const [why, setWhy] = useState<0 | 1 | 2>(0);
  /** The figure or an activity's demo shown large over the screen. */
  const [zoom, setZoom] = useState<null | { focus?: StepKey; clip?: StepKey }>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      // Remembered per browser (read after hydration).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(TEACHER_KEY) === '1') setTeacher(true);
      if (localStorage.getItem(NOTES_KEY) === '1') setNotes(true);
    } catch {
      /* private window */
    }
  }, []);
  // A new step starts at the top, with the reason folded.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhy(0);
  }, [page, topic.id]);
  // A result just in: bring it into view (the class looks at the 3D view while trying).
  const done = act ? results[act.key] : undefined;
  useEffect(() => {
    if (done) scroll.current?.querySelector('[data-kind="result"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [done]);
  useEffect(() => {
    if (!zoom) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoom(null);
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [zoom]);
  const remember = (key: string, on: boolean) => {
    try {
      localStorage.setItem(key, on ? '1' : '0');
    } catch {
      /* this session only */
    }
  };

  const headline = act ? act.title : page === 'intro' ? topic.title : page === 'theory' ? '핵심 개념 익히기' : page === 'cmp' ? '세 활동을 모아 정리' : '배운 것을 문제로 확인';
  return (
    <aside className={css.rail} aria-label={`${topic.title} 수업 카드`} data-teacher={teacher || undefined}>
      <header className={css.head}>
        <div>
          <span className={css.kicker}>
            {PAGE_LABEL[page]}
            {act ? ` · ${ACT_NAME[act.key]}` : ''} · {MINUTES[level][page]}분
          </span>
          <h2>{headline}</h2>
        </div>
        {teacherAllowed && (
          <button
            type="button"
            className={css.teacherBtn}
            aria-pressed={teacher}
            onClick={() => {
              setTeacher(!teacher);
              remember(TEACHER_KEY, !teacher);
            }}
            title="선생님이 물어볼 것과 정답을 보여 줘요"
          >
            교사용 {teacher ? '켜짐' : '보기'}
          </button>
        )}
      </header>

      <div className={css.scroll} ref={scroll}>
      <div className={css.body} key={`${topic.id}-${page}`}>
        {page === 'intro' && <IntroPage topic={topic} teacher={teacher} fig={<Fig topic={topic} onZoom={setZoom} />} />}
        {page === 'theory' && <ConceptPage topic={topic} level={level} teacher={teacher} fig={<Fig topic={topic} onZoom={setZoom} />} />}
        {page === 'cmp' && <WrapPage topic={topic} results={results} teacher={teacher} onSite={onSite} />}
        {page === 'check' && <CheckPage topic={topic} level={level} onChecked={onChecked} onward={onward} onTopic={onTopic} />}
      </div>

      {/* The activity's own flow, with the topic's controls inside (mounted on every page). */}
      <section className={css.flow} aria-label="실습 제어판" hidden={!act} data-notes={notes || undefined}>
        {act && <ActivityHead topic={topic} page={act.key} results={results} onPage={onPage} />}
        {act && (
          <Block kind="ask" st={guess[act.key] === undefined ? 'now' : 'done'} n={1} title="예상">
            <p className={css.q}>
              <Rich text={act.ask} />
            </p>
            <div className={css.choices} role="radiogroup" aria-label="예상 고르기">
              {act.choices.options.map((o, k) => {
                const done = !!results[act.key];
                const mine = guess[act.key] === k;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={mine}
                    data-right={done && k === act.choices.answer ? true : undefined}
                    onClick={() => {
                      const first = guess[act.key] === undefined;
                      setGuess((x) => ({ ...x, [act.key]: k }));
                      // The first guess opens 해 보기: bring it up (on a short screen it is below the fold).
                      if (first) requestAnimationFrame(() => scroll.current?.querySelector('[data-kind="do"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
                    }}
                  >
                    <i aria-hidden="true" />
                    {o}
                  </button>
                );
              })}
            </div>
          </Block>
        )}
        <section className={css.blk} data-kind="do" data-st={act ? (results[act.key] ? 'done' : guess[act.key] !== undefined ? 'now' : 'todo') : undefined}>
          <header className={css.blkHead}>
            <i className={css.num}>{act && results[act.key] ? '✓' : 2}</i>
            <span className={css.tag}>{TAG.do}</span>
            <b className={css.blkTitle}>해 보기</b>
          </header>
          {act && guess[act.key] === undefined && <p className={css.wait}>먼저 위에서 예상을 골라요. 그다음 직접 움직여 봐요.</p>}
          {act && (
            <p className={css.doIt}>
              <Rich text={act.doIt} />
            </p>
          )}
          {/* Always mounted (hidden before the guess and off the activities): a try is not reset. */}
          <div className={`${lc.guideControls} ${css.controls}`} hidden={!act || guess[act.key] === undefined} data-notes={notes || undefined}>
            {controls}
          </div>
          {act && guess[act.key] !== undefined && (
            <button
              type="button"
              className={css.notesBtn}
              aria-pressed={notes}
              onClick={() => {
                setNotes(!notes);
                remember(NOTES_KEY, !notes);
              }}
            >
              ⓘ {notes ? '조작 설명 접기' : '조작 설명 보기'}
            </button>
          )}
        </section>
        {act && (
          <Block kind="result" st={results[act.key] ? 'now' : 'todo'} n={3} title="결과" wait="해 보면 결과가 여기에 나와요.">
            {(() => {
              const g = guess[act.key];
              if (!done) return null;
              return (
                <div className={`${lc.resultBox} ${css.result}`} data-state="done">
                  <p className={css.verdict} data-ok={g === undefined ? undefined : g === act.choices.answer}>
                    {g === undefined ? '정답' : g === act.choices.answer ? '✓ 예상이 맞았어요' : '예상과 달라요 — 정답은'} <b>{act.choices.options[act.choices.answer]}</b>
                  </p>
                  <p className={css.point}>
                    <Rich text={act.point} />
                  </p>
                  <ul className={css.vals}>
                    {Object.entries(done).map(([k, v]) => (
                      <li key={k}>
                        <small>{k}</small>
                        <b>{v}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </Block>
        )}
        {act && (
          <Block kind="read" st={results[act.key] ? 'now' : 'todo'} n={4} title="왜 그럴까?" wait="결과를 보고 나서 이유를 읽어요.">
            {results[act.key] && (
              <div className={css.why}>
                <p>
                  <Rich text={why === 2 ? act.why : act.whyShort} />
                </p>
                {why < 2 && (
                  <button type="button" className={css.more} onClick={() => setWhy(2)}>
                    더 자세히
                  </button>
                )}
              </div>
            )}
          </Block>
        )}
        {act && (
          <details className={css.figFold}>
            <summary>그림 · 시연으로 다시 보기</summary>
            <Fig topic={topic} focus={act.key} onZoom={setZoom} />
          </details>
        )}
        {act && teacher && (
          <Block kind="teacher" title="이 활동에서">
            <dl className={css.tdl}>
              <dt>발문</dt>
              <dd>
                <Rich text={act.predict} />
              </dd>
              <dt>볼 것</dt>
              <dd>
                <Rich text={act.observe} />
              </dd>
              <dt>정답</dt>
              <dd>
                {act.choices.answer + 1}번 {act.choices.options[act.choices.answer]} — <Rich text={act.point} />
              </dd>
            </dl>
          </Block>
        )}
      </section>
      </div>

      <footer className={css.foot}>
        <button type="button" className={css.prev} disabled={i === 0} onClick={() => onPage(PAGES[i - 1])}>
          ← {i > 0 ? PAGE_LABEL[PAGES[i - 1]] : '이전'}
        </button>
        {i < PAGES.length - 1 ? (
          <button type="button" className={css.next} data-ready={!act || results[act.key] ? true : undefined} onClick={() => onPage(PAGES[i + 1])}>
            <small>{act && !results[act.key] ? '결과를 본 뒤에 넘어가요' : '다음'}</small>
            <span>
              {PAGE_LABEL[PAGES[i + 1]]}
              {isActivity(PAGES[i + 1]) ? ` · ${topic.steps.find((s) => s.key === PAGES[i + 1])!.title}` : ''} →
            </span>
          </button>
        ) : onward ? (
          <button type="button" className={css.next} data-onward data-ready onClick={onward.go}>
            <small>{onward.kicker}</small>
            <span>{onward.title} →</span>
          </button>
        ) : (
          <button type="button" className={css.next} disabled>
            <span>마지막 차시예요</span>
          </button>
        )}
      </footer>

      {zoom && (
        <div className={lc.lightbox} role="dialog" aria-modal="true" aria-label={`${topic.title} ${zoom.clip ? '시연' : '그림'}`} onClick={() => setZoom(null)}>
          {zoom.clip ? (
            <figure className={wb.clip} onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a GIF made by tools/check/learn-sim.mjs, shown as is */}
              <img src={tryGif(topic.id, zoom.clip)} alt={`${topic.id} ${STEP_NAME[zoom.clip]} 시연: 원고의 할 일대로 누른 화면`} />
              <figcaption>
                <b>
                  시연 · {lessonNo(topic.id)}차시 {STEP_NAME[zoom.clip]}
                </b>{' '}
                {topic.steps.find((s) => s.key === zoom.clip)?.title} — 원고의 할 일대로 눌렀을 때의 화면이에요. 직접 해 보고 비교해 보세요.
              </figcaption>
            </figure>
          ) : (
            <TopicArt id={topic.id} focus={zoom.focus} animate className={lc.lightboxFig} />
          )}
          <small>누르거나 Esc 로 닫기</small>
        </div>
      )}
    </aside>
  );
}

/** The topic's figure in its dark frame: click to enlarge, replay, and an activity's demo. */
function Fig({ topic, focus, onZoom }: { topic: Topic; focus?: StepKey; onZoom(z: { focus?: StepKey; clip?: StepKey }): void }) {
  const [replay, setReplay] = useState(0);
  return (
    <figure className={css.fig}>
      <button type="button" className={css.figBtn} onClick={() => onZoom({ focus })} title="그림 크게 보기" aria-label="그림 크게 보기">
        <TopicArt id={topic.id} focus={focus} animate replay={replay} className={css.figure} />
      </button>
      <figcaption>
        <span>
          그림 {topic.id}
          {focus ? ` · ${STEP_NAME[focus]} 칸` : ''}
        </span>
        <button type="button" onClick={() => setReplay((r) => r + 1)}>
          ↻ 다시
        </button>
        <button type="button" onClick={() => onZoom({ focus })}>
          ⤢ 크게
        </button>
        {focus && (
          <button type="button" data-main onClick={() => onZoom({ clip: focus })} title="원고의 할 일대로 누른 화면 (GIF)">
            ▶ 시연
          </button>
        )}
      </figcaption>
    </figure>
  );
}

/** 활동 1 · 2 · 3 as a short row (where this one stands), and what this one changes. */
function ActivityHead({ topic, page, results, onPage }: { topic: Topic; page: StepKey; results: Partial<Record<StepKey, ResultRow>>; onPage(p: PageId): void }) {
  const act = topic.steps.find((s) => s.key === page)!;
  const [from, to] = act.change.value.includes(' → ') ? act.change.value.split(' → ') : [null, act.change.value];
  return (
    <>
      <ol className={css.acts} aria-label="실습 순서">
        {KEYS.map((k) => {
          const s = topic.steps.find((x) => x.key === k)!;
          return (
            <li key={k}>
              <button type="button" aria-current={page === k || undefined} data-done={results[k] ? true : undefined} onClick={() => onPage(k)} title={`${STEP_NO[k]} · ${s.title}`}>
                <i>{results[k] ? '✓' : s.n}</i>
                <span>{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className={css.change} data-first={!from || undefined}>
        <small>{from ? `이번에 바꾸는 것 · ${act.change.what}` : `처음 조건 · ${act.change.what}`}</small>
        <span>
          {from && (
            <>
              <s>{from}</s> →{' '}
            </>
          )}
          <b>{to}</b>
        </span>
      </p>
    </>
  );
}

function IntroPage({ topic, teacher, fig }: { topic: Topic; teacher: boolean; fig: ReactNode }) {
  const [q, ...goals] = glossFirst([topic.question, ...topic.objectives]);
  return (
    <>
      <p className={css.hook}>
        <small>오늘의 질문</small>
        <Rich text={q} />
      </p>
      {fig}
      <Block kind="read" title="오늘 배울 것">
        <ol className={css.goals}>
          {goals.map((g) => (
            <li key={g}>
              <Rich text={g} />
            </li>
          ))}
        </ol>
        <div className={css.terms}>
          <small>새로 나오는 말</small>
          <TermChips keys={topic.terms} />
        </div>
      </Block>
      {teacher && (
        <Block kind="teacher" title="도입에서">
          <dl className={css.tdl}>
            <dt>발문</dt>
            {topic.card.introAsk.map((l) => (
              <dd key={l}>
                <Rich text={l} />
              </dd>
            ))}
            <dt>학생 활동</dt>
            {topic.card.introDo.map((l) => (
              <dd key={l}>
                <Rich text={l} />
              </dd>
            ))}
          </dl>
        </Block>
      )}
    </>
  );
}

function ConceptPage({ topic, level, teacher, fig }: { topic: Topic; level: StudyLevel; teacher: boolean; fig: ReactNode }) {
  const texts = glossFirst([topic.definition, ...topic.principle, ...topic.theory]);
  const def = texts[0];
  const principle = texts.slice(1, 1 + topic.principle.length);
  const theory = texts.slice(1 + topic.principle.length);
  return (
    <>
      <Block kind="read" title="핵심 한 줄">
        <p className={css.key}>
          <Rich text={def} />
        </p>
      </Block>
      <Block kind="read" title="원리">
        <ol className={css.principle}>
          {principle.map((p) => (
            <li key={p}>
              <Rich text={p} />
            </li>
          ))}
        </ol>
      </Block>
      {fig}
      <details className={css.fold}>
        <summary>{level === 'uni' ? '자세히 · 수식 · 기호' : '자세히 · 기호'}</summary>
        {theory.map((p) => (
          <p key={p}>
            <Rich text={p} />
          </p>
        ))}
        {level === 'uni' && topic.formula.length > 0 && (
          <div className={css.formulas}>
            {topic.formula.map((f) => (
              <code key={f}>{f}</code>
            ))}
          </div>
        )}
        <SymbolTable symbols={topic.symbols} />
      </details>
      {teacher && (
        <Block kind="teacher" title="개념에서">
          <dl className={css.tdl}>
            <dt>발문</dt>
            <dd>
              <Rich text={topic.card.conceptAsk} />
            </dd>
          </dl>
        </Block>
      )}
    </>
  );
}

function WrapPage({ topic, results, teacher, onSite }: { topic: Topic; results: Partial<Record<StepKey, ResultRow>>; teacher: boolean; onSite?: Props['onSite'] }) {
  const [takeaway, field] = glossFirst([topic.takeaway, topic.field]);
  const cols = [...new Set(KEYS.flatMap((k) => Object.keys(results[k] ?? {})))];
  const n = KEYS.filter((k) => results[k]).length;
  return (
    <>
      <Block kind="result" title={`세 활동 결과 (${n} / 3)`}>
        {cols.length ? (
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th />
                  {cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topic.steps.map((s) => (
                  <tr key={s.key} data-done={results[s.key] ? true : undefined}>
                    <th>
                      <i>{s.n}</i> {s.title}
                    </th>
                    {cols.map((c) => (
                      <td key={c}>{results[s.key]?.[c] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={css.wait}>활동 1 · 2 · 3 을 해 보면 결과가 이 표에 모여요.</p>
        )}
      </Block>
      <Block kind="read" title="그래서 알게 된 것">
        <ul className={css.points}>
          {topic.steps.map((s) => (
            <li key={s.key} data-done={results[s.key] ? true : undefined}>
              <Rich text={s.point} inert />
            </li>
          ))}
        </ul>
        <p className={css.key}>
          <Rich text={takeaway} />
        </p>
      </Block>
      {field && (
        <Block kind="read" title="현장에서는">
          <p>
            <Rich text={field} />
          </p>
          {onSite && usedBy(topic).length > 0 && (
            <div className={css.sites}>
              <small>{problemsUsing(topic.id).length ? '이 차시를 배우면 풀 수 있는 로봇 시티 현장 문제' : '이 원리를 쓰는 로봇 시티 현장'}</small>
              {usedBy(topic).map((s) => (
                <button key={s.label} type="button" style={{ '--c': s.color } as CSSProperties} onClick={() => onSite(s.id)}>
                  {s.label} →
                </button>
              ))}
            </div>
          )}
        </Block>
      )}
      {teacher && (
        <Block kind="teacher" title="정리에서">
          <dl className={css.tdl}>
            <dt>발문</dt>
            <dd>
              <Rich text={topic.card.wrapAsk} />
            </dd>
            <dt>정답</dt>
            <dd>
              <Rich text={topic.card.wrapAnswer} />
            </dd>
          </dl>
        </Block>
      )}
    </>
  );
}

function CheckPage({ topic, level, onChecked, onward, onTopic }: { topic: Topic; level: StudyLevel; onChecked(): void; onward?: Onward | null; onTopic(id: Topic['id']): void }) {
  const next = nextTopicOf(topic.id);
  return (
    <>
      <Block kind="ask" title="확인 문제 — 하나씩 골라요">
        <QuickCheck topic={topic.id} level={level} onAllRight={onChecked} />
      </Block>
      {onward ? (
        <button type="button" className={css.onward} onClick={onward.go}>
          <small>{onward.kicker}</small>
          <b>{onward.title}</b>
          <span>아래 초록 버튼으로도 갈 수 있어요.</span>
        </button>
      ) : next ? (
        <button type="button" className={css.onward} onClick={() => onTopic(next.id)}>
          <small>다음 차시 · {lessonNo(next.id)}차시</small>
          <b>
            {next.id} {next.title}
          </b>
        </button>
      ) : (
        <p className={css.wait}>마지막 차시예요 — 로봇공학 8개 단원 28차시를 모두 마쳤어요.</p>
      )}
    </>
  );
}
