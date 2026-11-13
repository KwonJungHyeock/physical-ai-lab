'use client';

/**
 * 목록 (입문 트랙, the course handed over or the default: courses.ts) — 수정 지시서 v4 파트 3, B안:
 * at the top the 절 to go on with (이어서 하기) and one big key; on the left the course's 장 (a picture
 * slot, its number and 차시, its name, how far it is done); on the right the 절 of the 장 picked, under
 * their 차시, each with its kinds — [장면 보기] · [실습 하기], those it has — or [평가 하기] for a 수행평가.
 * Opened, the 장 to go on with is the one picked; the 절 to do now is the one accent (an orange outline);
 * 완료 is a green check, the rest an empty ring (no word for not done). A 선택 절 (the real robot) says so
 * and is not counted. 6장 opens once the course's last step is done. No 교안 쪽 (파트 2-1).
 * The 장 pictures are asset slots: /course/assets/chapter-N.png (none yet: 준비 중).
 */

import { useEffect, useState } from 'react';

import { COURSE, kindsOf, subById, subName, topicMark, MODE_NAME, type CourseChapter, type CourseSub, type SubMode } from '@/engine/simulator/cell/course';
import { countedIn, lessonStepsIn, stepsIn, type CoursePlan, type CourseStep } from '@/engine/simulator/cell/courses';
import { commonLine } from '@/engine/simulator/cell/courseText';

import Icon from '../Icon';
import css from './courseMap.module.css';

interface Props {
  plan: CoursePlan;
  /** The 절 open now. */
  now?: string;
  done(s: CourseSub): boolean;
  onPick(s: CourseSub, mode: SubMode): void;
  onClose(): void;
  /** 6장 (과정 끝에 열림): whether it opens yet (the course's last step done), and opening one of its pages (0 · 1 · 2). */
  end?: { open: boolean; onOpen(page: number): void };
}

/** '3차시' or '3~4차시'. */
const span = (ns: readonly number[]) => (ns.length ? (Math.min(...ns) === Math.max(...ns) ? `${ns[0]}차시` : `${Math.min(...ns)}~${Math.max(...ns)}차시`) : '');

/** A 장's picture: the team's file, or its empty slot. */
function ChapterArt({ n }: { n: number }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className={css.art} data-missing={missing || undefined}>
      {!missing ? (
        // eslint-disable-next-line @next/next/no-img-element -- an asset slot: the team's picture, also in the static export
        <img src={`/course/assets/chapter-${n}.png`} alt="" onError={() => setMissing(true)} />
      ) : (
        '준비 중'
      )}
    </span>
  );
}

export default function CourseMap({ plan, now, done, onPick, onClose, end }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const counted = countedIn(plan);
  const got = counted.filter(done).length;
  const lessons = lessonStepsIn(plan);
  const lessonOf = (id: string) => lessons.find((l) => l.steps.some((x) => x.sub.id === id))?.n ?? 0;
  // The 장 of the course (those it has 절 of), then 6장.
  const last = COURSE.find((c) => c.subs.some((s) => s.status === 'end'));
  const chapters: { c: CourseChapter; steps: CourseStep[] }[] = COURSE.filter((c) => c !== last)
    .map((c) => ({ c, steps: stepsIn(plan).filter((x) => x.sub.chapter === c.n) }))
    .filter((x) => x.steps.length);
  // 이어서 하기: the 절 open now while it is not done, else the first still to do (a 선택 절 is never asked for), else 6장.
  const open = now ? stepsIn(plan).find((x) => x.sub.id === now) : undefined;
  const next = open && !done(open.sub) ? open : stepsIn(plan).find((x) => x.sub.run && !x.sub.optional && !done(x.sub));
  const lit = next?.sub.id;
  const [picked, setPicked] = useState<number>(() => next?.sub.chapter ?? (now ? subById(now)?.chapter : undefined) ?? last?.n ?? chapters[0]?.c.n ?? 1);
  const at = chapters.find((x) => x.c.n === picked);
  const chapterName = (n: number) => `${n}장 ${COURSE.find((c) => c.n === n)?.title ?? ''}`;
  const mark = (ok: boolean) => (
    <span className={css.mark} data-done={ok || undefined} role="img" aria-label={ok ? '완료' : '아직'}>
      {ok && <Icon name="check" size={16} />}
    </span>
  );
  return (
    <div className={css.scrim} role="dialog" aria-label={commonLine('list')}>
      <div className={`${css.map} ${css.board}`}>
        <header className={css.top}>
          <span>
            <h2>{plan.title}</h2>
            <small>
              {plan.short}
              <i aria-hidden="true">
                <i style={{ width: `${counted.length ? (100 * got) / counted.length : 0}%` }} />
              </i>
              완료 {got} / {counted.length}
            </small>
          </span>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        {/* 이어서 하기: the 절 to do now, and the one big key. */}
        <div className={css.resume}>
          <em>{commonLine('resume')}</em>
          {next ? (
            <>
              <b>
                {next.sub.id} {next.sub.title}
              </b>
              <small>
                {lessonOf(next.sub.id)}차시 · {chapterName(next.sub.chapter)}
              </small>
              <button type="button" onClick={() => onPick(next.sub, 'practice')}>
                {next.kind === 'test' ? '평가 하기' : MODE_NAME.practice} →
              </button>
            </>
          ) : last && end ? (
            <>
              <b>
                {last.subs[0].id} {last.subs[0].title}
              </b>
              <small>{chapterName(last.n)}</small>
              <button type="button" disabled={!end.open} onClick={() => end.onOpen(0)}>
                열기 →
              </button>
            </>
          ) : (
            <b>다 했어요</b>
          )}
        </div>
        <div className={css.cols}>
          <nav className={css.chaps} aria-label="장">
            {chapters.map(({ c, steps }) => {
              const own = steps.filter((x) => !x.sub.optional);
              const ok = own.filter((x) => done(x.sub)).length;
              return (
                <button key={c.n} type="button" className={css.chap} aria-pressed={picked === c.n} onClick={() => setPicked(c.n)}>
                  <ChapterArt n={c.n} />
                  <span>
                    <small>
                      {c.n}장 · {span(steps.map((x) => lessonOf(x.sub.id)))}
                    </small>
                    <b>{c.title}</b>
                    {ok >= own.length ? (
                      <u>✓ 완료</u>
                    ) : (
                      <span className={css.bar}>
                        <i aria-hidden="true">
                          <i style={{ width: `${(100 * ok) / Math.max(1, own.length)}%` }} />
                        </i>
                        {ok} / {own.length}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {last && (
              <button type="button" className={css.chap} aria-pressed={picked === last.n} onClick={() => setPicked(last.n)}>
                <ChapterArt n={last.n} />
                <span>
                  <small>
                    {last.n}장 · {plan.lessons.length}차시 끝
                  </small>
                  <b>{last.title}</b>
                  <span className={css.bar}>{end?.open ? '열 수 있어요' : '과정을 마치면 열려요'}</span>
                </span>
              </button>
            )}
          </nav>
          <section className={css.subs} aria-label="절">
            {at ? (
              <>
                <h3>
                  {at.c.n}장 {at.c.title}
                  <small>
                    {span(at.steps.map((x) => lessonOf(x.sub.id)))} · 완료 {at.steps.filter((x) => !x.sub.optional && done(x.sub)).length} / {at.steps.filter((x) => !x.sub.optional).length}
                  </small>
                </h3>
                {lessons
                  .map((l) => ({ n: l.n, steps: l.steps.filter((x) => x.sub.chapter === at.c.n) }))
                  .filter((l) => l.steps.length)
                  .map((l) => (
                    <div key={l.n} className={css.lesson}>
                      <h4>
                        <span>{l.n}차시</span>
                      </h4>
                      {l.steps.map(({ kind, sub: s }) => (
                        <div key={s.id} className={css.item} data-lit={s.id === lit || undefined} data-soon={!s.run || undefined}>
                          <i>{s.id}</i>
                          <b>
                            {s.title}
                            {s.optional && <u>선택</u>}
                          </b>
                          <span className={css.kinds}>
                            {kind === 'test' ? (
                              <button type="button" disabled={!s.run} onClick={() => onPick(s, 'practice')}>
                                평가 하기
                              </button>
                            ) : (
                              kindsOf(s).map((m) => (
                                <button key={m} type="button" disabled={s.kinds[m] !== 'open' || !s.run} onClick={() => onPick(s, m)}>
                                  {MODE_NAME[m]}
                                </button>
                              ))
                            )}
                          </span>
                          {mark(done(s))}
                        </div>
                      ))}
                    </div>
                  ))}
              </>
            ) : last ? (
              <>
                <h3>
                  {last.n}장 {last.title}
                  <small>{end?.open ? `${plan.lessons.length}차시 끝` : '과정을 마치면 열려요'}</small>
                </h3>
                <div className={css.lesson}>
                  {last.subs.map((s, k) => (
                    <div key={s.id} className={css.item} data-soon={!end?.open || undefined}>
                      <i>{s.id}</i>
                      <b>{s.title}</b>
                      <span className={css.kinds}>
                        <button type="button" disabled={!end?.open} onClick={() => end?.onOpen(k)}>
                          열기
                        </button>
                      </span>
                      <span />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

/** An address named a 절 that does not open: what it is, and the way to the list. */
export function CourseMissing({ id, onList }: { id: string; onList(): void }) {
  const s = subById(id);
  const say = !s
    ? `${id}라는 절은 없어요`
    : s.status === 'end'
      ? `${id}${topicMark(id)} 과정을 마치면 열려요`
      : s.status === 'unused' || s.status === 'test'
        ? `${subName(s)}${topicMark(s.was ?? id)} 이번 과정에서 쓰지 않는 절이에요`
        : `${id}${topicMark(id)} 아직 만드는 중이에요`;
  return (
    <div className={css.scrim} role="alertdialog" aria-modal="true" aria-label="열 수 없는 절">
      <div className={`${css.map} ${css.missing}`}>
        <h2>{say}</h2>
        <p>목록에서 지금 열 수 있는 절을 골라요</p>
        <button type="button" autoFocus onClick={onList}>
          목록 열기
        </button>
      </div>
    </div>
  );
}

/** This user may not open the course (platform.ts mayOpen): no scene, only this. */
export function CourseDenied() {
  return (
    <div className={css.scrim} role="alertdialog" aria-modal="true" aria-label="열 수 없는 과정">
      <div className={`${css.map} ${css.missing}`}>
        <h2>이 과정을 열 수 없어요</h2>
        <p>로그인과 이용권을 확인해 주세요</p>
      </div>
    </div>
  );
}
