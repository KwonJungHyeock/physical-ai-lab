'use client';

/**
 * 실제 현장에서는: over a site lab's 3D cell, how robot arms do this same job at real workplaces
 * (engine/education/lab/realUse.ts). Open at first; folded to a small pill once closed, remembered
 * in the browser.
 */

import { useState } from 'react';

import { REAL_USE, type RealUseSite } from '@/engine/education/lab/realUse';

import Icon from '../../simulator/Icon';
import lg from './site.module.css';

const KEY = 'edu-real-use';

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'closed';
  } catch {
    return true;
  }
}

/** `beside`: the lab shows its camera view at the top left, so the card stands to its right. */
export default function RealUse({ site, beside = false }: { site: RealUseSite; beside?: boolean }) {
  const [open, setOpen] = useState(readOpen);
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
      <p>{r.task}</p>
      <p className={lg.realScale}>
        <em>실제 규모</em>
        {r.scale}
      </p>
      <p className={lg.realSame}>
        <em>이 실습과 같은 점</em>
        {r.same}
      </p>
    </aside>
  );
}
