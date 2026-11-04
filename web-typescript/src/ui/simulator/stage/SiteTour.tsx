'use client';

/**
 * 현장 둘러보기 (입문 트랙): opening a 생활 로봇 place, the view glides through a few shots of it
 * (engine/simulator/cell/shots.ts TOUR) with one line each, as a film's lower third — SCENE 01 / 05,
 * the shot's name, the line — then back to the place's home view. [건너뛰기] ends it at once.
 */

import { useEffect, useRef, useState } from 'react';

import type { CellId } from '@/engine/simulator/cell/cells';
import { TOUR } from '@/engine/simulator/cell/shots';

import type { StageApi } from './Stage';
import css from './siteTour.module.css';

const NONE: never[] = [];
/** How long each shot holds, ms. */
// (NEXT_PUBLIC_TOUR_HOLD_MS: a longer hold for screenshots on a slow software renderer.)
const HOLD_MS = Number(process.env.NEXT_PUBLIC_TOUR_HOLD_MS) || 3400;

export default function SiteTour({ cell, api, onDone }: { cell: CellId; api(): StageApi | null; onDone(): void }) {
  const shots = TOUR[cell] ?? NONE;
  const [k, setK] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const s = shots[k];
    if (!s) {
      api()?.view('home');
      done.current();
      return;
    }
    api()?.lookAt(s.eye, s.target, true);
    const t = window.setTimeout(() => setK((n) => n + 1), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [k, shots, api]);
  const s = shots[k];
  if (!s) return null;
  return (
    <div className={css.tour} role="status" aria-live="polite">
      <div className={css.third} key={k}>
        <em>
          SCENE {String(k + 1).padStart(2, '0')} / {String(shots.length).padStart(2, '0')}
        </em>
        <b>{s.name}</b>
        <p>{s.line}</p>
        <span className={css.dots} aria-hidden="true">
          {shots.map((x, i) => (
            <i key={x.name} data-on={i === k || undefined} data-done={i < k || undefined} />
          ))}
        </span>
      </div>
      <button type="button" className={css.skip} onClick={() => setK(shots.length)}>
        건너뛰기 ›
      </button>
    </div>
  );
}
