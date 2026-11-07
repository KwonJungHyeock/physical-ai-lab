'use client';

/**
 * 입문 튜토리얼 at the top of the right panel (engine/simulator/lifeTutorials.ts): the quest's three
 * steps as segments, the one to do now in one short line with its meter (12° / 30°), and the
 * control to press in a spotlight: ringed (the console's own "press here" ring, data-hint), a line
 * beside it, the rest of the screen dimmed until it is pressed. When all three are done: the idea in one line, and the next tutorial.
 */

import { useEffect, useRef, useState } from 'react';

import { lifeTutorialById, type TutCtx } from '@/engine/simulator/lifeTutorials';

import { Spotlight, useSpotlight } from './Spotlight';

import css from './tutorial.module.css';

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
  const stripRef = useRef<HTMLElement>(null);
  const { spot, dim } = useSpotlight(cur, p.read, stripRef);
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
    <section ref={stripRef} className={css.strip} aria-label={`${p.n ? `튜토리얼 ${p.n}` : '맛보기'}: ${t.title}`} data-done={over || undefined}>
      <header>
        <em>{p.n ? `TUTORIAL ${p.n}` : 'TASTE'}</em>
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
              {p.n ? '다음 튜토리얼 ›' : '1단계 튜토리얼 ›'}
            </button>
          )}
        </div>
      )}
      {spot && <Spotlight spot={spot} dim={dim} />}
    </section>
  );
}
