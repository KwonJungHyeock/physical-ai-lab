'use client';

/**
 * 위치 줄 (입문 트랙, 학생 화면 맨 위): "N차시 · N단계 · 교안 N쪽" and the step's name, big enough to read
 * from the back of the classroom — the same numbers as the PDF 수업자료 the teacher shows. Pressed, it
 * opens the 차시 · 단계 list: a student who came late goes straight to the step the teacher is on (a
 * step skipped stays 미완료; the record is kept as before).
 */

import { useEffect, useRef, useState } from 'react';

import css from './locationBar.module.css';

export interface LocStep {
  id: string;
  /** 단계 number in its place. */
  n: number;
  title: string;
  pages: readonly [number, number];
  state: 'done' | 'now' | 'todo';
  /** Shut by the teacher's 차시 (교사 열쇠). */
  locked?: boolean;
}

export interface LocLesson {
  n: number;
  steps: LocStep[];
  /** The 차시's 확인 문제: answered / asked. */
  checks: { got: number; of: number };
}

const pagesText = (p: readonly [number, number]) => (p[0] === p[1] ? `교안 ${p[0]}쪽` : `교안 ${p[0]}~${p[1]}쪽`);

export default function LocationBar({ lesson, step, lessons, onGo, onChecks }: { lesson: number; step: LocStep; lessons: LocLesson[]; onGo(id: string): void; onChecks(n: number): void }) {
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
  return (
    <div className={css.loc} ref={root}>
      <button type="button" className={css.bar} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} title="차시 · 단계 목록: 눌러서 원하는 단계로 가요">
        <b>
          {lesson}차시 · {step.n}단계 · {pagesText(step.pages)}
        </b>
        <span>{step.title}</span>
        <i aria-hidden="true">{open ? '▴' : '▾'}</i>
      </button>
      {open && (
        <div className={css.drop} role="menu" aria-label="차시 · 단계 목록">
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
                  disabled={s.locked}
                  onClick={() => {
                    setOpen(false);
                    if (s.state !== 'now') onGo(s.id);
                  }}
                >
                  <em>{s.state === 'done' ? '✓ 완료' : s.state === 'now' ? '지금' : s.locked ? '잠김' : '미완료'}</em>
                  <span>
                    {s.n}단계 · {s.title}
                  </span>
                  <small>{pagesText(s.pages)}</small>
                </button>
              ))}
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
