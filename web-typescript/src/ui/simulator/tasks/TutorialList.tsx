'use client';

/**
 * 입문 제어 (the 제어 screen's top): where the controls are learnt — 맛보기 first (three rings for the
 * tool tip, a quest to feel the keys), then the three tutorials in order. One plate, a row each: its
 * number (✓ when done), name and one line; the running one lit. While one runs the list folds to
 * one line, so the 제어 keys stay in sight; the quest card itself stands over the 3D view
 * (TutorialStrip.tsx).
 */

import { useState } from 'react';

import { LIFE_TASTE, LIFE_TUTORIALS } from '@/engine/simulator/lifeTutorials';

import css from './theme.module.css';

interface Props {
  /** The tutorial running now, and the ones finished. */
  running: string | null;
  done: Readonly<Record<string, boolean>>;
  busy: boolean;
  onStart(id: string): void;
}

export default function TutorialList({ running, done, busy, onStart }: Props) {
  const rows = [{ t: LIFE_TASTE, tag: '맛보기' }, ...LIFE_TUTORIALS.map((t, k) => ({ t, tag: `${k + 1}단계` }))];
  const [shown, setShown] = useState(false);
  const now = rows.find((r) => r.t.id === running);
  const folded = !!now && !shown;
  return (
    <section className={css.tutStart} aria-label="조작 튜토리얼">
      <h4>
        <em>TUTORIAL</em>
        <b>{folded ? `${now.tag} 진행 중` : '조작 익히기'}</b>
        {now ? (
          <button type="button" className={css.tutFold} aria-expanded={!folded} onClick={() => setShown((v) => !v)}>
            {folded ? '목록 ▾' : '접기 ▴'}
          </button>
        ) : (
          <small>맛보기 → 1 · 2 · 3단계</small>
        )}
      </h4>
      {!folded && (
        <ol className={css.tuts}>
          {rows.map(({ t, tag }) => (
            <li key={t.id}>
              <button type="button" aria-pressed={running === t.id} disabled={busy} onClick={() => onStart(t.id)}>
                <i data-done={done[t.id] || undefined}>{done[t.id] ? '✓' : tag === '맛보기' ? '00' : tag[0].padStart(2, '0')}</i>
                <span>
                  <b>{t.title}</b>
                  <small>{t.note}</small>
                </span>
                <em>{tag}</em>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
