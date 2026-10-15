'use client';

/**
 * 실제 현장에서는: over a site lab's 3D cell, how robot arms do this same job at real workplaces
 * (engine/education/lab/realUse.ts). Open the first time a site is entered, folded to a small pill
 * after that (it sits over the 3D cell, so it must not cover the work on every step), and folded for
 * good once closed. Remembered in the browser.
 */

import { useState } from 'react';

import { REAL_USE, type RealUseSite } from '@/engine/education/lab/realUse';

import Icon from '../../simulator/Icon';
import { Lines } from '../lesson/Rich';
import lg from './site.module.css';

const KEY = 'edu-real-use';
/** The sites whose card has been shown open once. */
const SEEN_KEY = 'edu-real-use-seen';

function readOpen(site: RealUseSite): boolean {
  try {
    if (localStorage.getItem(KEY) === 'closed') return false;
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    if (seen.includes(site)) return false;
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, site]));
    return true;
  } catch {
    return true;
  }
}

/**
 * `beside`: the lab shows its camera view at the top left, so the card stands to its right.
 * `folded`: starts as the small pill even the first time (카드 모드: the first card points at the bench).
 */
export default function RealUse({ site, beside = false, folded = false }: { site: RealUseSite; beside?: boolean; folded?: boolean }) {
  const [open, setOpen] = useState(() => !folded && readOpen(site));
  const r = REAL_USE[site];
  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(KEY, v ? 'open' : 'closed');
    } catch {
      /* private window: for this visit only */
    }
  };
  if (!open)
    return (
      <button type="button" className={lg.realPill} data-beside={beside || undefined} onClick={() => toggle(true)}>
        <Icon name="factory" size={14} /> 실제 현장에서는?
      </button>
    );
  return (
    <aside className={lg.real} data-beside={beside || undefined} aria-label="실제 현장 적용 예">
      <header>
        <Icon name="factory" size={15} />
        <span>
          <small>실제 현장 적용 예</small>
          <b>{r.where}</b>
        </span>
        <button type="button" onClick={() => toggle(false)} aria-label="접기" title="접기">
          ×
        </button>
      </header>
      <p>
        <Lines text={r.task} />
      </p>
      <p className={lg.realScale}>
        <em>실제 규모</em>
        <Lines text={r.scale} />
      </p>
      <p className={lg.realSame}>
        <em>이 실습과 같은 점</em>
        <Lines text={r.same} />
      </p>
    </aside>
  );
}
