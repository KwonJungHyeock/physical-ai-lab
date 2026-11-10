'use client';

/**
 * 커리큘럼 (입문 트랙: myCobot 280 협동로봇 1단계, course.ts): the 6 장 and their 서브챕터, each with
 * its 차시 and 교안 pages — the same numbers as the PDF the teacher shows. Pressing a 서브챕터 opens
 * its scene; one not in the app yet is listed as 만드는 중. The one open now (or, none open, the next
 * to do) is the one accent.
 */

import { useEffect } from 'react';

import { COURSE, COURSE_LESSONS, COURSE_NAME, COURSE_SUBS, pagesText, type CourseSub } from '@/engine/simulator/cell/course';

import css from './courseMap.module.css';

interface Props {
  /** The 서브챕터 open now. */
  now?: string;
  done(s: CourseSub): boolean;
  onPick(s: CourseSub): void;
  onClose(): void;
}

export default function CourseMap({ now, done, onPick, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const runnable = COURSE_SUBS.filter((s) => s.run);
  const got = runnable.filter(done).length;
  // The accent: the one open now, or the first still to do.
  const lit = now ?? runnable.find((s) => !done(s))?.id;
  return (
    <div className={css.scrim} role="dialog" aria-label="커리큘럼">
      <div className={css.map}>
        <header className={css.head}>
          <span>
            <h2>{COURSE_NAME}</h2>
            <small>
              {COURSE_LESSONS}차시 · {COURSE.length}장 · 서브챕터 {COURSE_SUBS.length}개 · 완료 {got} / {runnable.length}
            </small>
          </span>
          <button type="button" className={css.x} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <div className={css.chapters}>
          {COURSE.map((c) => {
            const ls = c.subs.map((s) => s.lesson);
            const from = Math.min(...ls);
            const to = Math.max(...ls);
            return (
              <section key={c.n} className={css.chapter}>
                <h3>
                  <b>{c.n}장</b> {c.title}
                  <small>{from === to ? `${from}차시` : `${from} ~ ${to}차시`}</small>
                </h3>
                {c.subs.map((s) => {
                  const state = s.id === now ? 'now' : done(s) ? 'done' : s.run ? 'todo' : 'soon';
                  return (
                    <button key={s.id} type="button" className={css.row} data-state={state} data-lit={s.id === lit || undefined} disabled={!s.run} onClick={() => onPick(s)}>
                      <i>{s.id}</i>
                      <span>{s.test ? `[수행평가] O · X + 미션` : s.title}</span>
                      <small>
                        {s.lesson}차시 · {pagesText(s.pages)}
                      </small>
                      <em>{state === 'now' ? '지금' : state === 'done' ? '✓ 완료' : state === 'soon' ? '만드는 중' : '미완료'}</em>
                    </button>
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
