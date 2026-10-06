'use client';

/**
 * The frame of the full-screen pages under the top bar (라이브러리 · 자료실): a column of sections on
 * the left, the open section's heading and its content on the right.
 */

import type { ReactNode } from 'react';

import Icon from '../Icon';
import css from './pages.module.css';

export interface PageSection<Id extends string> {
  id: Id;
  name: string;
  icon: string;
  /** How many things the section holds, shown beside its name. */
  count?: number;
}

interface Props<Id extends string> {
  /** Small capitals over the sections (LIBRARY, DOWNLOADS). */
  label: string;
  sections: readonly PageSection<Id>[];
  current: Id;
  onSection(id: Id): void;
  title: string;
  sub: ReactNode;
  /** A short note under the sections. */
  help: ReactNode;
  /** Beside the heading (e.g. actions for the open section). */
  aside?: ReactNode;
  children: ReactNode;
}

export default function PageShell<Id extends string>({ label, sections, current, onSection, title, sub, help, aside, children }: Props<Id>) {
  return (
    <div className={css.page}>
      <nav className={css.pageNav} aria-label={label}>
        <h5>{label}</h5>
        {sections.map((s) => (
          <button key={s.id} type="button" aria-current={s.id === current ? 'page' : undefined} onClick={() => onSection(s.id)}>
            <Icon name={s.icon} size={18} />
            <span>{s.name}</span>
            {s.count !== undefined && <em>{s.count}</em>}
          </button>
        ))}
        <p className={css.pageHelp}>{help}</p>
      </nav>
      <section className={css.pageMain} aria-label={title}>
        <header className={css.pageHead}>
          <div>
            <h1>{title}</h1>
            <p>{sub}</p>
          </div>
          {aside}
        </header>
        <div className={css.pageBody}>{children}</div>
      </section>
    </div>
  );
}
