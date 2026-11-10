'use client';

/**
 * 누를 곳 번호 (지시서 v1 파트 3): the numbers of 지금 할 일 (1 · 2 · 3, the order to press) on the
 * controls themselves, at each one's top-left corner — the same numbers as the PDF's screen picture.
 * Found by the quest's lead selectors (quests.ts QUEST_LEAD) a few times a second, so a panel that
 * scrolls or opens keeps them in place.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import css from './questNumbers.module.css';

export default function QuestNumbers({ targets }: { targets: readonly string[] }) {
  const [at, setAt] = useState<({ x: number; y: number } | null)[]>([]);
  useEffect(() => {
    const look = () =>
      setAt(
        targets.map((sel) => {
          const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getBoundingClientRect().width > 0);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top };
        }),
      );
    look();
    const id = window.setInterval(look, 250);
    return () => window.clearInterval(id);
  }, [targets]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {at.map((p, k) =>
        p ? (
          <i key={k} className={css.n} style={{ left: p.x - 10, top: p.y - 10 }} aria-hidden="true">
            {k + 1}
          </i>
        ) : null,
      )}
    </>,
    document.body,
  );
}
