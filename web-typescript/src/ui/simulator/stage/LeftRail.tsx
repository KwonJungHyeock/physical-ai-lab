'use client';

/**
 * The menu bar down the left edge, top bar to bottom: every screen of the simulator in one place.
 * Work screens (조그 · 도구 · 자세 · 공정, then the three languages) open in the side panel, one at a
 * time; view items (실습 환경 · 물건 · 카메라 · 모니터) open one window next to the bar; 영점 sits at the
 * foot. Pressing the open item again closes it; Esc closes the window.
 */

import { useEffect, type ReactNode } from 'react';

import Icon from '../Icon';
import css from './rail.module.css';

export type RailItem = 'env' | 'objects' | 'camera' | 'monitor';

export interface BarItem {
  id: string;
  label: string;
  icon: string;
  title: string;
  on?: boolean;
  /** A small mark on the button (e.g. the number of objects). */
  badge?: string;
  disabled?: boolean;
  onClick(): void;
}

export default function LeftRail({ groups, foot, sheetOpen, onCloseSheet, children }: { groups: BarItem[][]; foot?: BarItem[]; sheetOpen: boolean; onCloseSheet(): void; children?: ReactNode }) {
  useEffect(() => {
    if (!sheetOpen) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseSheet();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sheetOpen, onCloseSheet]);
  const button = (e: BarItem) => (
    <button key={e.id} type="button" aria-pressed={!!e.on} disabled={e.disabled} title={e.title} onClick={e.onClick}>
      <Icon name={e.icon} size={18} />
      <span>{e.label}</span>
      {e.badge && <i>{e.badge}</i>}
    </button>
  );
  return (
    <>
      <nav className={css.rail} aria-label="메뉴">
        {groups.map((g, i) => (
          <div key={i} className={css.group}>
            {g.map(button)}
          </div>
        ))}
        {foot && <div className={`${css.group} ${css.foot}`}>{foot.map(button)}</div>}
      </nav>
      {children && <div className={css.sheet}>{children}</div>}
    </>
  );
}
