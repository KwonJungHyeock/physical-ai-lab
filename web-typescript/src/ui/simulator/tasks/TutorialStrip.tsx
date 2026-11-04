'use client';

/**
 * 입문 튜토리얼 at the top of the right panel (engine/simulator/lifeTutorials.ts): the quest's three
 * steps as segments, the one to do now in one short line with its meter (12° / 30°), and the
 * control to press ringed in the panel below (the console's own "press here" ring, data-hint).
 * When all three are done: the idea in one line, and the next tutorial.
 */

import { useEffect, useRef, useState } from 'react';

import { lifeTutorialById, type TutCtx, type TutTarget } from '@/engine/simulator/lifeTutorials';

import css from './tutorial.module.css';

const squash = (s: string | null | undefined) => (s ?? '').replace(/[\s▶▷·+＋›]+/g, '');

/** Ring the step's controls while they are on screen (panels open and close under it: look again now and then). */
function useRing(targets: readonly TutTarget[] | null) {
  const key = targets ? JSON.stringify(targets) : '';
  useEffect(() => {
    if (!key) return;
    const want = JSON.parse(key) as TutTarget[];
    let marked: HTMLElement[] = [];
    const find = () =>
      want.flatMap((t) => {
        if ('sel' in t) return [...document.querySelectorAll<HTMLElement>(t.sel)].slice(0, 3);
        const w = squash(t.text);
        return [...document.querySelectorAll<HTMLElement>('button')].filter((el) => squash(el.textContent) === w).slice(0, 2);
      });
    const mark = () => {
      const next = find().filter((el) => el.getBoundingClientRect().width > 0);
      for (const el of marked) if (!next.includes(el)) el.removeAttribute('data-hint');
      for (const el of next) el.setAttribute('data-hint', 'on');
      marked = next;
    };
    mark();
    const t = window.setInterval(mark, 600);
    return () => {
      window.clearInterval(t);
      for (const el of marked) el.removeAttribute('data-hint');
    };
  }, [key]);
}

interface Props {
  id: string;
  /** The step being done (steps.length: all done). */
  step: number;
  /** The arm now (read a few times a second for the meter) and when the step began. */
  read(): TutCtx;
  start: TutCtx;
  /** The tutorial's place in the list (1-based) and how many there are. */
  n: number;
  of: number;
  onNext(): void;
  onClose(): void;
}

export default function TutorialStrip(p: Props) {
  const t = lifeTutorialById(p.id);
  const cur = t?.steps[p.step] ?? null;
  useRing(cur?.target ?? null);
  const readRef = useRef(p.read);
  useEffect(() => {
    readRef.current = p.read;
  });
  const [now, setNow] = useState<TutCtx | null>(null);
  const metered = !!cur?.meter;
  useEffect(() => {
    if (!metered) return;
    const id = window.setInterval(() => setNow(readRef.current()), 250);
    return () => window.clearInterval(id);
  }, [metered]);
  if (!t) return null;
  const over = p.step >= t.steps.length;
  const m = cur?.meter && now ? cur.meter(now, p.start) : null;
  return (
    <section className={css.strip} aria-label={`튜토리얼 ${p.n}: ${t.title}`} data-done={over || undefined}>
      <header>
        <em>TUTORIAL {p.n}</em>
        <b>{t.title}</b>
        <button type="button" className={css.close} onClick={p.onClose} aria-label="튜토리얼 그만하기" title="그만하기">
          ×
        </button>
      </header>
      <ol className={css.segs} aria-label={`${Math.min(p.step + 1, t.steps.length)} / ${t.steps.length}단계`}>
        {t.steps.map((s, k) => (
          <li key={s.short} data-on={k === p.step || undefined} data-done={k < p.step || undefined} />
        ))}
      </ol>
      {cur && (
        <div className={css.now}>
          <span className={css.n}>{p.step + 1}</span>
          <p>{cur.short}</p>
          {m && (
            <span className={css.meter}>
              <i>
                <i style={{ width: `${Math.min(100, (100 * m.v) / m.of)}%` }} />
              </i>
              <output>
                {Math.min(m.v, m.of).toFixed(0)}/{m.of}
                {m.unit}
              </output>
            </span>
          )}
        </div>
      )}
      {over && (
        <div className={css.end}>
          <p>
            <span className={css.ok}>✓ 완료</span> <b>{t.concept.term}</b> {t.concept.def}
          </p>
          {p.n < p.of && (
            <button type="button" className={css.next} onClick={p.onNext}>
              다음 튜토리얼 ›
            </button>
          )}
        </div>
      )}
    </section>
  );
}
