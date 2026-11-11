'use client';

/**
 * 목록 (입문 트랙, the course handed over or the default: courses.ts): the 장 and their 절 in that
 * course, each with its 차시 and 교안 pages — the same numbers as the 교안 the teacher shows — and its
 * kinds: [장면 보기] · [실습 하기], those it has (만드는 중: dimmed, not pressed; 없음: no button). A 절
 * not in the app yet is dimmed. The one open now (or, none open, the next to do) is the one accent;
 * 완료 is green, the rest plain. A 선택 절 (the real robot) says so.
 */

import { useEffect } from 'react';

import { kindsOf, pagesText, subById, topicMark, MODE_NAME, type CourseSub, type SubMode } from '@/engine/simulator/cell/course';
import { chaptersIn, countedIn, lessonIn, type CoursePlan } from '@/engine/simulator/cell/courses';

import css from './courseMap.module.css';

interface Props {
  plan: CoursePlan;
  /** The 절 open now. */
  now?: string;
  done(s: CourseSub): boolean;
  onPick(s: CourseSub, mode: SubMode): void;
  onClose(): void;
}

export default function CourseMap({ plan, now, done, onPick, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const counted = countedIn(plan);
  const got = counted.filter(done).length;
  // The accent: the one open now, or the first still to do.
  const lit = now ?? counted.find((s) => !done(s))?.id;
  return (
    <div className={css.scrim} role="dialog" aria-label="목록">
      <div className={css.map}>
        <header className={css.head}>
          <span>
            <h2>{plan.title}</h2>
            <small>
              {plan.short} · 완료 {got} / {counted.length}
            </small>
          </span>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.chapters}>
          {chaptersIn(plan).map((c) => {
            const ls = c.subs.map((s) => lessonIn(plan, s.id));
            const from = Math.min(...ls);
            const to = Math.max(...ls);
            return (
              <section key={c.n} className={css.chapter}>
                <h3>
                  <b>{c.n}장</b> {c.title}
                  <small>{from === to ? `${from}차시` : `${from} ~ ${to}차시`}</small>
                </h3>
                {c.subs.map((s) => {
                  const state = s.id === now ? 'now' : done(s) ? 'done' : 'todo';
                  return (
                    <div key={s.id} className={css.row} data-state={state} data-lit={s.id === lit || undefined} data-soon={!s.run || undefined}>
                      <i>{s.id}</i>
                      <span>
                        <b>
                          {s.title}
                          {s.optional && <u>선택</u>}
                        </b>
                        <small>
                          {lessonIn(plan, s.id)}차시 · {pagesText(s.pages)}
                        </small>
                      </span>
                      <span className={css.kinds}>
                        {kindsOf(s).map((m) => (
                          <button key={m} type="button" disabled={s.kinds[m] !== 'open' || !s.run} onClick={() => onPick(s, m)}>
                            {MODE_NAME[m]}
                          </button>
                        ))}
                      </span>
                      <em>{!s.run ? '' : state === 'now' ? '지금' : state === 'done' ? '✓ 완료' : '미완료'}</em>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** An address named a 절 that does not open: what it is, and the way to the list. */
export function CourseMissing({ id, onList }: { id: string; onList(): void }) {
  const s = subById(id);
  const say = !s ? `${id}라는 절은 없어요.` : s.status === 'unused' ? `${id}${topicMark(id)} 이번 과정에서 쓰지 않는 절이에요.` : `${id}${topicMark(id)} 아직 만드는 중이에요.`;
  return (
    <div className={css.scrim} role="alertdialog" aria-modal="true" aria-label="열 수 없는 절">
      <div className={`${css.map} ${css.missing}`}>
        <h2>{say}</h2>
        <p>목록에서 지금 열 수 있는 절을 골라요.</p>
        <button type="button" autoFocus onClick={onList}>
          목록 열기
        </button>
      </div>
    </div>
  );
}
