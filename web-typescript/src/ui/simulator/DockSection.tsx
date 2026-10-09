'use client';

/**
 * One collapsible section of the control dock. The dock decides which one is open (one at a time,
 * the choice kept in this browser by the console).
 */

import type { ReactNode } from 'react';

import Icon from './Icon';
import css from './console.module.css';

interface Props {
  id: string;
  icon: string;
  title: string;
  /** A few words after the title: what the section is for. */
  sub?: string;
  /** Shown on the right of the header (a value, a small control). */
  aside?: ReactNode;
  open: boolean;
  onToggle(): void;
  children: ReactNode;
}

export default function DockSection({ icon, title, sub, aside, open, onToggle, children }: Props) {
  return (
    <section className={css.dockSection} data-open={open} aria-label={title}>
      <header className={css.dockHead}>
        <button type="button" className={css.dockToggle} aria-expanded={open} onClick={onToggle}>
          <Icon name={icon} size={15} className={css.dockIcon} />
          <span>{title}</span>
          {sub && <small className={css.dockSub}>{sub}</small>}
          <Icon name="chevron" size={14} className={css.dockChevron} />
        </button>
        {aside && <span className={css.dockAside}>{aside}</span>}
      </header>
      {open && <div className={css.dockBody}>{children}</div>}
    </section>
  );
}
