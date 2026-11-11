'use client';

/**
 * 목록 (입문 트랙, the course picked: courses.ts): the 장 and their 절 in that course, each with its
 * 차시 and 교안 pages — the same numbers as the PDF the teacher shows. Pressing one opens its scene;
 * one not in the app yet is dimmed and cannot be pressed. The one open now (or, none open, the next
 * to do) is the one accent; 완료 is green, the rest plain.
 */

import { useEffect } from 'react';

import { pagesText, type CourseSub } from '@/engine/simulator/cell/course';
import { chaptersIn, lessonIn, pagesIn, subsIn, type CoursePlan } from '@/engine/simulator/cell/courses';

import css from './courseMap.module.css';

interface Props {
  plan: CoursePlan;
  /** The 절 open now. */
  now?: string;
  done(s: CourseSub): boolean;
  onPick(s: CourseSub): void;
  onClose(): void;
}

export default function CourseMap({ plan, now, done, onPick, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const runnable = subsIn(plan).filter((s) => s.run);
  const got = runnable.filter(done).length;
  // The accent: the one open now, or the first still to do.
  const lit = now ?? runnable.find((s) => !done(s))?.id;
  return (
    <div className={css.scrim} role="dialog" aria-label="목록">
      <div className={css.map}>
        <header className={css.head}>
          <span>
            <h2>{plan.title}</h2>
            <small>
              {plan.short} · 완료 {got} / {runnable.length}
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
                    <button key={s.id} type="button" className={css.row} data-state={state} data-lit={s.id === lit || undefined} data-soon={!s.run || undefined} disabled={!s.run} onClick={() => onPick(s)}>
                      <i>{s.id}</i>
                      <span>{s.test ? `[수행평가] O · X + 미션` : s.title}</span>
                      <small>
                        {lessonIn(plan, s.id)}차시 · {pagesText(pagesIn(plan, s))}
                      </small>
                      <em>{!s.run ? '' : state === 'now' ? '지금' : state === 'done' ? '✓ 완료' : '미완료'}</em>
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
