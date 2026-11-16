'use client';
// 입문 과정 (결정 회신 파트 9-1): when a run's results come out in the right panel (4-3's 잰 값, 5-2 · 5-3's 판정),
// the panel is moved down to them once — not while the student is moving the panel, and not again for the same results.
import { useEffect, useRef } from 'react';

/** The result lists in the panel (CourseStepPanel: VerdictLines and the measured values). */
const RESULTS = 'ul[aria-label="판정"], ul[aria-label="잰 값"]';
/** How long after the student's own scrolling the panel is left where it is (ms). */
const HANDS_OFF_MS = 1200;
/** The rows kept at the panel's foot (정지), over the box's end. */
const FOOT = '[data-foot], [class*="poseDock"]';
/** How long new results wait before the panel moves to them (ms): the step guide's own scroll comes first. */
const SETTLE_MS = 700;
/** Keys that scroll a box. */
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
/** Room kept under the results (layout px). */
const ROOM = 12;

/** The boxes that scroll the list, the nearest first (a block inside the panel, then the panel's pane). */
function scrollersOf(el: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let s = el.parentElement; s && s.tagName !== 'BODY'; s = s.parentElement) {
    const y = getComputedStyle(s).overflowY;
    if ((y === 'auto' || y === 'scroll') && s.scrollHeight > s.clientHeight + 1) out.push(s);
  }
  return out;
}

/** The part of the box the student sees: under its top, over the 정지 row kept at the panel's foot. */
function sightOf(box: HTMLElement) {
  const b = box.getBoundingClientRect();
  let bottom = b.bottom;
  for (const f of box.closest('aside')?.querySelectorAll(FOOT) ?? []) {
    const t = f.getBoundingClientRect().top;
    if (t > b.top && t < bottom) bottom = t;
  }
  return { top: b.top, bottom, height: b.height };
}

export function useRevealResults(on: boolean, busy: boolean) {
  /** Results already shown (or skipped) since the last run started. */
  const seen = useRef(new WeakSet<Element>());
  const busyRef = useRef(busy);
  /** The student's last scroll of the panel (wheel, touch, keys), and a press held in it now (a drag). The app's own
      scrolling (a step's guide, the panel's reset) is not the student's: scroll events are not counted. */
  const touched = useRef(0);
  const held = useRef(false);
  const reveal = useRef<() => void>(() => {});

  useEffect(() => {
    busyRef.current = busy;
    // A new run: its results are new ones.
    if (busy) seen.current = new WeakSet();
    else reveal.current();
  }, [busy]);

  useEffect(() => {
    if (!on) return;
    const inPanel = (t: EventTarget | null) => t instanceof Element && !!t.closest('aside');
    const mark = (e: Event) => {
      if (inPanel(e.target)) touched.current = performance.now();
    };
    // Keys that scroll the panel (not typing in a box, not pressing a button).
    const key = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.includes(e.key) && !(e.target instanceof Element && e.target.closest('input, textarea, select, button'))) mark(e);
    };
    const down = (e: PointerEvent) => {
      if (inPanel(e.target)) held.current = true;
    };
    const up = () => {
      held.current = false;
    };
    const run = () => {
      pending = 0;
      if (busyRef.current) return;
      for (const list of document.querySelectorAll(RESULTS)) {
        if (seen.current.has(list) || !list.getClientRects().length) continue;
        seen.current.add(list);
        // The student is moving the panel: leave it.
        if (held.current || performance.now() - touched.current < HANDS_OFF_MS) continue;
        // Each box around the results down as far as it goes, the nearest first — then the next one takes the rest.
        for (const box of scrollersOf(list)) {
          const r = list.getBoundingClientRect();
          const b = sightOf(box);
          // (The course zooms the page: rects are on screen, scrollTop in the box's own px.)
          const scale = b.height / box.clientHeight || 1;
          const room = ROOM * scale;
          if (r.bottom <= b.bottom - room / 2 && r.top >= b.top) break;
          // Down to the results' end, never past their start, never past the box's own end.
          const by = Math.min(r.bottom - (b.bottom - room), r.top - (b.top + room), (box.scrollHeight - box.clientHeight - box.scrollTop) * scale);
          if (by > 0) box.scrollTop += by / scale;
        }
      }
    };
    // New results: looked at a moment later, after the step's guide has brought its next control into sight
    // (Spotlight.tsx scrolls once, when the step changes) — the results are then the last thing scrolled to.
    let pending = 0;
    reveal.current = () => {
      if (busyRef.current || pending) return;
      if (![...document.querySelectorAll(RESULTS)].some((l) => !seen.current.has(l))) return;
      pending = window.setTimeout(run, SETTLE_MS);
    };
    const watch = new MutationObserver(() => reveal.current());
    watch.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('wheel', mark, { capture: true, passive: true });
    window.addEventListener('touchmove', mark, { capture: true, passive: true });
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    // (Set up again — the 절's step changed with the run's end: results already out are looked at now.)
    reveal.current();
    return () => {
      watch.disconnect();
      window.clearTimeout(pending);
      reveal.current = () => {};
      window.removeEventListener('wheel', mark, true);
      window.removeEventListener('touchmove', mark, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [on]);
}
