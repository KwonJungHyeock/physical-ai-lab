'use client';

/**
 * 위치 줄 (입문 트랙, 학생 화면 맨 위): "N차시 · 3-4 · 교안 N쪽" and the 서브챕터's name, big enough to
 * read from the back of the classroom — the same numbers as the PDF 교안 the teacher shows (course.ts).
 * Pressed, it opens the 차시 · 서브챕터 list: a student who came late goes straight to the one the
 * teacher is on (one skipped stays 미완료; the record is kept as before).
 */

import { useEffect, useRef, useState } from 'react';

import { pagesText } from '@/engine/simulator/cell/course';

import css from './locationBar.module.css';

export interface LocStep {
  id: string;
  /** '3-4': the 교안's 장 · 절 number. */
  label: string;
  title: string;
  pages: readonly [number, number];
  state: 'done' | 'now' | 'todo';
  /** Not in the app yet (만드는 중): listed, not opened. */
  soon?: boolean;
}

export interface LocLesson {
  n: number;
  steps: LocStep[];
  /** The 차시's 확인 문제: answered / asked (none: no row). */
  checks?: { got: number; of: number };
}

export default function LocationBar({ lesson, step, lessons, onGo, onChecks }: { lesson: number; step: LocStep; lessons: LocLesson[]; onGo(id: string): void; onChecks?(n: number): void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  // Opened, the list starts at the one open now (a long course: 12차시).
  const drop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) drop.current?.querySelector('[data-state="now"]')?.scrollIntoView({ block: 'center' });
  }, [open]);
  return (
    <div className={css.loc} ref={root}>
      <button type="button" className={css.bar} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} title="차시 · 단계 목록: 눌러서 원하는 단계로 가요">
        {/* The 장 · 절 number biggest and brightest; the 차시 and the 교안 pages beside it as one piece. */}
        <b>{step.label}</b>
        <span>{step.title}</span>
        <small>
          {lesson ? `${lesson}차시 · ` : ''}
          {pagesText(step.pages)}
        </small>
        <i aria-hidden="true">목록 {open ? '▴' : '▾'}</i>
      </button>
      {open && (
        <div className={css.drop} ref={drop} role="menu" aria-label="차시 · 단계 목록">
          {lessons.map((l) => (
            <section key={l.n}>
              <h4>{l.n}차시</h4>
              {l.steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  className={css.row}
                  data-state={s.state}
                  disabled={s.soon}
                  onClick={() => {
                    setOpen(false);
                    if (s.state !== 'now') onGo(s.id);
                  }}
                >
                  <em>{s.soon ? '' : s.state === 'done' ? '✓ 완료' : s.state === 'now' ? '지금' : '미완료'}</em>
                  <span>
                    {s.label} {s.title}
                  </span>
                  <small>{pagesText(s.pages)}</small>
                </button>
              ))}
              {l.checks && onChecks && (
                <button
                  type="button"
                  role="menuitem"
                  className={css.row}
                  data-state={l.checks.got >= l.checks.of ? 'done' : 'todo'}
                  onClick={() => {
                    setOpen(false);
                    onChecks(l.n);
                  }}
                >
                  <em>{l.checks.got >= l.checks.of ? '✓ 완료' : '미완료'}</em>
                  <span>
                    {l.n}차시 확인 문제 {l.checks.of}문항
                  </span>
                  <small>
                    {l.checks.got} / {l.checks.of}
                  </small>
                </button>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
