'use client';

/**
 * The left menu bar of the 3D view: what to look at and where the arm stands, one window at a
 * time (실습 환경 with each place's ▶ 데모 · 물건 · 카메라 · 모니터). Pressing the open one again,
 * or Esc, closes it; with none open the 3D view is whole. The work itself (control, process,
 * coding) stays in the side panel.
 */

import { useEffect, type ReactNode } from 'react';

import Icon from '../Icon';
import css from './rail.module.css';

export type RailItem = 'env' | 'objects' | 'camera' | 'monitor';

export interface RailEntry {
  id: RailItem;
  label: string;
  icon: string;
  title: string;
  /** A small mark on the button (e.g. the number of objects). */
  badge?: string;
  disabled?: boolean;
}

export default function LeftRail({ entries, open, onOpen, side, children }: { entries: RailEntry[]; open: RailItem | null; onOpen(item: RailItem | null): void; side: 'left' | 'right'; children?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpen(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onOpen]);
  return (
    <>
      <nav className={css.rail} data-side={side} aria-label="보기 · 환경 메뉴">
        {entries.map((e) => (
          <button key={e.id} type="button" aria-pressed={open === e.id} disabled={e.disabled} title={e.title} onClick={() => onOpen(open === e.id ? null : e.id)}>
            <Icon name={e.icon} size={19} />
            <span>{e.label}</span>
            {e.badge && <i>{e.badge}</i>}
          </button>
        ))}
      </nav>
      {children && (
        <div className={css.sheet} data-side={side} data-item={open ?? undefined}>
          {children}
        </div>
      )}
    </>
  );
}
