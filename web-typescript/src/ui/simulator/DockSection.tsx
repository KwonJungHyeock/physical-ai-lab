'use client';

/**
 * One collapsible section of the control dock; the open/closed choice is kept in this browser.
 * With `open` and `onToggle` the dock decides instead (one section open at a time).
 */

import { useEffect, useState, type ReactNode } from 'react';

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
  defaultOpen?: boolean;
  /** Controlled: open or not, and what a click on the header does. */
  open?: boolean;
  onToggle?(): void;
  children: ReactNode;
}

const key = (id: string) => `robot-console-dock-${id}`;

export default function DockSection({ id, icon, title, sub, aside, defaultOpen = true, open: openProp, onToggle, children }: Props) {
  const [openOwn, setOpen] = useState(defaultOpen);
  const open = openProp ?? openOwn;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key(id));
      // Read after hydration so the server-rendered HTML and the first client render agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === '0' || saved === '1') setOpen(saved === '1');
    } catch {
      /* storage blocked: keep the default */
    }
  }, [id]);
  const toggle = () => {
    if (onToggle) return onToggle();
    setOpen((o) => {
      try {
        localStorage.setItem(key(id), o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  return (
    <section className={css.dockSection} data-open={open} aria-label={title}>
      <header className={css.dockHead}>
        <button type="button" className={css.dockToggle} aria-expanded={open} onClick={toggle}>
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
