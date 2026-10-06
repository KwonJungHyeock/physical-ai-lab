'use client';

/**
 * The lesson's right column: one short card per step of the 차시 (도입 · 개념 · 활동 1–3 ·
 * 정리 · 평가). Each card leads with the one line to remember, then the figure (an activity
 * outlines its own panel), what the teacher asks, what the students do, and the answer folded
 * away. The long theory sits behind 자세히, and ← 이전 · 다음 → move along the steps.
 * The hands-on controls for the activities are in the 3D view (stage/ControlOverlay).
 */

import { STEP_NAME, lessonNo, nextTopicOf, type StepKey, type Topic } from '@/engine/education/catalog';
import { tryGif } from '@/engine/education/media';
import type { StudyLevel } from '@/engine/education/roadmap';
import { glossFirst } from '@/engine/education/symbols';

import { useEffect, useState, type ReactNode } from 'react';

import { TopicArt } from './TopicArt';
import { QuickCheck } from './QuickCheck';
import { Rich, SymbolTable, TermChips } from './Rich';
import type { ResultRow } from '../topics/types';
import lc from '../learn.module.css';
import wb from './workbook.module.css';
import css from './lesson.module.css';

const KEYS: StepKey[] = ['A', 'B', 'C'];

export type PageId = 'intro' | 'theory' | StepKey | 'cmp' | 'check';

/** Where the class was: the topic and the step last open. */
export interface ResumeSpot {
  topic: Topic['id'];
  page: PageId;
}

/** The seven steps of a 차시, in order. */
export const PAGES: readonly PageId[] = ['intro', 'theory', 'A', 'B', 'C', 'cmp', 'check'];
export const PAGE_LABEL: Record<PageId, string> = { intro: '도입', theory: '개념', A: '활동 1', B: '활동 2', C: '활동 3', cmp: '정리', check: '평가' };
/** What each activity does, in a few words (활동 1 as it is, then one thing changed, then once more). */
export const ACT_NAME: Record<StepKey, string> = { A: '그대로 해 보기', B: '하나 바꿔 보기', C: '한 번 더 바꾸기' };
/** Minutes per step: a 50-minute (고등) or 75-minute (대학) 차시. */
const MINUTES: Record<StudyLevel, Record<PageId, number>> = {
  hs: { intro: 5, theory: 10, A: 8, B: 8, C: 8, cmp: 6, check: 5 },
  uni: { intro: 5, theory: 20, A: 10, B: 10, C: 10, cmp: 10, check: 10 },
};
export const isActivity = (p: PageId): p is StepKey => p === 'A' || p === 'B' || p === 'C';

interface Props {
  topic: Topic;
  page: PageId;
  onPage(p: PageId): void;
  results: Partial<Record<StepKey, ResultRow>>;
  onChecked(): void;
  level: StudyLevel;
  /** Open another topic (the 평가 card's 다음 차시). */
  onTopic(id: Topic['id']): void;
}

export default function LessonCards({ topic, page, onPage, results, onChecked, level, onTopic }: Props) {
  const i = PAGES.indexOf(page);
  /** The figure or an activity's demo shown large over the screen. */
  const [zoom, setZoom] = useState<null | { focus?: StepKey; clip?: StepKey }>(null);
  const [replay, setReplay] = useState(0);
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
  const step = isActivity(page) ? topic.steps.find((s) => s.key === page)! : null;
  const fig = (focus?: StepKey) => (
    <figure className={css.fig}>
      <button type="button" className={css.figBtn} onClick={() => setZoom({ focus })} title="그림 크게 보기" aria-label="그림 크게 보기">
        <TopicArt id={topic.id} focus={focus} animate replay={replay} className={lc.figure} />
      </button>
      <figcaption>
        <span>
          그림 {topic.id}
          {focus ? ` · ${STEP_NAME[focus]} 칸` : ''}
        </span>
        <button type="button" onClick={() => setReplay((r) => r + 1)}>
          ↻ 다시
        </button>
        <button type="button" onClick={() => setZoom({ focus })}>
          ⤢ 크게
        </button>
        {focus && (
          <button type="button" data-main onClick={() => setZoom({ clip: focus })} title="원고의 할 일대로 누른 화면 (GIF)">
            ▶ 시연
          </button>
        )}
      </figcaption>
    </figure>
  );
  return (
    <div className={css.cards}>
      <article className={css.card} key={`${topic.id}-${page}`}>
        <header className={css.mh}>
          <b>{PAGE_LABEL[page]}</b>
          {step && <span className={css.mhSub}>{ACT_NAME[step.key]}</span>}
          <small>{MINUTES[level][page]}분</small>
        </header>

        {page === 'intro' && <IntroCard topic={topic} fig={fig()} />}
        {page === 'theory' && <ConceptCard topic={topic} level={level} fig={fig()} />}
        {step && <ActivityCard step={step} fig={fig(step.key)} />}
        {page === 'cmp' && <WrapCard topic={topic} results={results} />}
        {page === 'check' && (
          <>
            <p className={css.key}>배운 것을 문제로 확인해요</p>
            <QuickCheck topic={topic.id} level={level} onAllRight={onChecked} />
            <NextLesson topic={topic} onTopic={onTopic} />
          </>
        )}
      </article>

      <footer className={css.nav}>
        <button type="button" disabled={i === 0} onClick={() => onPage(PAGES[i - 1])}>
          ← {i > 0 ? PAGE_LABEL[PAGES[i - 1]] : '이전'}
        </button>
        <button type="button" data-main disabled={i === PAGES.length - 1} onClick={() => onPage(PAGES[i + 1])}>
          {i < PAGES.length - 1 ? PAGE_LABEL[PAGES[i + 1]] : '다음'} →
        </button>
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
    </div>
  );
}

/** 선생님이 물어볼 것: speech bubbles. */
function Say({ lines }: { lines: readonly string[] }) {
  return (
    <section className={css.blk}>
      <span className={css.lab}>선생님이 물어볼 것</span>
      <div className={css.say}>
        {lines.map((l) => (
          <p key={l}>
            <Rich text={l} />
          </p>
        ))}
      </div>
    </section>
  );
}

/** 학생이 할 것: a checklist. */
function Todo({ items }: { items: readonly ReactNode[] }) {
  return (
    <section className={css.blk}>
      <span className={css.lab}>학생이 할 것</span>
      <ul className={css.todo}>
        {items.map((t, n) => (
          <li key={n}>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fold({ label, children, open }: { label: string; children: ReactNode; open?: boolean }) {
  return (
    <details className={css.ans} open={open}>
      <summary>{label}</summary>
      <div>{children}</div>
    </details>
  );
}

function IntroCard({ topic, fig }: { topic: Topic; fig: ReactNode }) {
  const [q, def, ...goals] = glossFirst([topic.question, topic.definition, ...topic.objectives]);
  return (
    <>
      <p className={css.key}>
        <Rich text={q} />
      </p>
      {fig}
      <Say lines={topic.card.introAsk} />
      <Todo items={topic.card.introDo.map((t) => <Rich key={t} text={t} />)} />
      <Fold label="학습 목표 · 핵심 정의">
        <ol className={css.goals}>
          {goals.map((g) => (
            <li key={g}>
              <Rich text={g} />
            </li>
          ))}
        </ol>
        <p>
          <Rich text={def} />
        </p>
      </Fold>
      <div className={css.terms}>
        <small>용어</small>
        <TermChips keys={topic.terms} />
      </div>
    </>
  );
}

function ConceptCard({ topic, level, fig }: { topic: Topic; level: StudyLevel; fig: ReactNode }) {
  const texts = glossFirst([topic.definition, ...topic.principle, ...topic.theory]);
  const def = texts[0];
  const principle = texts.slice(1, 1 + topic.principle.length);
  const theory = texts.slice(1 + topic.principle.length);
  return (
    <>
      <p className={css.key}>
        <Rich text={def} />
      </p>
      <ol className={css.principle}>
        {principle.map((p) => (
          <li key={p}>
            <span>
              <Rich text={p} />
            </span>
          </li>
        ))}
      </ol>
      {fig}
      <Say lines={[topic.card.conceptAsk]} />
      <Fold label={level === 'uni' ? '자세히 · 수식 · 기호' : '자세히 · 기호'}>
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
      </Fold>
      <div className={css.terms}>
        <small>용어</small>
        <TermChips keys={topic.terms} />
      </div>
    </>
  );
}

function ActivityCard({ step, fig }: { step: Topic['steps'][number]; fig: ReactNode }) {
  const [point, predict, doIt, observe, why] = glossFirst([step.point, step.predict, step.doIt, step.observe, step.why]);
  return (
    <>
      <p className={css.actTitle}>
        <i>{step.n}</i>
        {step.title}
      </p>
      <p className={css.key}>
        <Rich text={point} />
      </p>
      {fig}
      <Say lines={[predict]} />
      <Todo
        items={[
          '왼쪽 패널에서 먼저 예상을 고른다',
          <Rich key="do" text={doIt} />,
          '결과가 예상과 같은지 확인하고, 왜 그런지 말해 본다',
        ]}
      />
      <Fold label="정답 · 설명 보기">
        <p>
          <b>볼 것 </b>
          <Rich text={observe} />
        </p>
        <p>
          <b>왜 </b>
          <Rich text={why} />
        </p>
      </Fold>
    </>
  );
}

function WrapCard({ topic, results }: { topic: Topic; results: Partial<Record<StepKey, ResultRow>> }) {
  const [takeaway, field, ...goals] = glossFirst([topic.takeaway, topic.field, ...topic.objectives]);
  const done = KEYS.filter((k) => results[k]).length;
  return (
    <>
      <p className={css.key}>
        <Rich text={takeaway} />
      </p>
      <section className={css.sum} aria-label="세 활동 한눈에">
        {topic.steps.map((s) => (
          <div key={s.key} data-done={results[s.key] ? true : undefined}>
            <i>{s.n}</i>
            <span>
              <small>
                {s.change.what} · {s.change.value.split(' → ').pop()}
              </small>
              <b>
                <Rich text={s.point} inert />
              </b>
            </span>
          </div>
        ))}
      </section>
      <CompareTable results={results} steps={topic.steps} />
      <Say lines={[topic.card.wrapAsk]} />
      <Fold label="정답 보기">
        <p>
          <Rich text={topic.card.wrapAnswer} />
        </p>
      </Fold>
      {field && (
        <div className={css.field}>
          <small>현장에서는</small>
          <p>
            <Rich text={field} />
          </p>
        </div>
      )}
      {goals.length > 0 && (
        <section className={wb.goalCheck} aria-label="학습 목표 확인">
          <h3>
            학습 목표 확인 <span>활동 {done} / 3 완료</span>
          </h3>
          <ul>
            {goals.map((g) => (
              <li key={g} data-done={done === 3 || undefined}>
                <Rich text={g} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CompareTable({ results, steps }: { results: Partial<Record<StepKey, ResultRow>>; steps: Topic['steps'] }) {
  const cols = [...new Set(KEYS.flatMap((k) => Object.keys(results[k] ?? {})))];
  if (!cols.length) return <p className={css.note}>활동 1 · 2 · 3 을 해 보면 결과가 표로 모여요.</p>;
  return (
    <table className={lc.compare}>
      <thead>
        <tr>
          <th />
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {steps.map((s) => (
          <tr key={s.key}>
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
  );
}

/** 다음 차시: the next topic's number, title and question (or the end of the course). */
function NextLesson({ topic, onTopic }: { topic: Topic; onTopic(id: Topic['id']): void }) {
  const next = nextTopicOf(topic.id);
  if (!next) return <p className={wb.nextEnd}>마지막 차시예요 — 로봇공학 8개 단원 28차시를 모두 마쳤어요.</p>;
  return (
    <button type="button" className={wb.next} onClick={() => onTopic(next.id)}>
      <small>다음 차시 · {lessonNo(next.id)}차시</small>
      <b>
        {next.id} {next.title}
      </b>
      <span>
        <Rich text={next.question} inert />
      </span>
    </button>
  );
}
