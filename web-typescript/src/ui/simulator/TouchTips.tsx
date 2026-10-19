'use client';

/**
 * 길게 눌러 설명 보기: on a tablet a finger never hovers, so a button's title (its tooltip with a
 * mouse) is shown by holding the button for a moment. The tap that follows the hold is swallowed,
 * so reading a button's meaning never presses it. Controls that act while held (jog keys, the joint
 * dial, sliders: touch-action none) and the 3D view are left alone. Mounted once for the page.
 */

import { useEffect, useState } from 'react';

import css from './touchTips.module.css';

const HOLD_MS = 480;
const MOVE_PX = 10;

function tipOf(t: EventTarget | null): { el: HTMLElement; text: string } | null {
  if (!(t instanceof Element)) return null;
  const el = t.closest<HTMLElement>('[title], button[aria-label], [role="button"][aria-label]');
  if (!el || el.closest('canvas')) return null;
  // Held on purpose (a jog key moves the arm while held): not ours.
  for (let n: HTMLElement | null = t as HTMLElement; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).touchAction === 'none') return null;
    if (n === el) break;
  }
  const text = (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim();
  return text ? { el, text } : null;
}

export default function TouchTips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    let shown = false;
    const clear = () => {
      window.clearTimeout(timer);
      start = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      clear();
      shown = false;
      setTip(null);
      const hit = tipOf(e.target);
      if (!hit) return;
      start = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        const r = hit.el.getBoundingClientRect();
        const below = r.top < 90;
        shown = true;
        // Centred on the button, kept inside the screen (the bubble is at most 320 px wide).
        const half = Math.min(168, window.innerWidth / 2);
        const x = Math.min(window.innerWidth - half, Math.max(half, r.left + r.width / 2));
        setTip({ text: hit.text, x, y: below ? r.bottom + 10 : r.top - 10, below });
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) clear();
    };
    const up = () => {
      clear();
      if (shown) window.setTimeout(() => setTip(null), 1600);
    };
    // The tap that ends a hold only shows the meaning: it does not press the button.
    const click = (e: MouseEvent) => {
      if (!shown) return;
      shown = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // The long-press menu (copy, open link) would cover the bubble.
    const menu = (e: Event) => {
      if (shown || start) e.preventDefault();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('click', click, true);
    window.addEventListener('contextmenu', menu, true);
    return () => {
      clear();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('contextmenu', menu, true);
    };
  }, []);
  if (!tip) return null;
  return (
    <div className={css.tip} data-below={tip.below || undefined} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  );
}
