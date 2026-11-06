'use client';

/**
 * 입문 튜토리얼 at the top of the right panel (engine/simulator/lifeTutorials.ts): the quest's three
 * steps as segments, the one to do now in one short line with its meter (12° / 30°), and the
 * control to press in a spotlight: ringed (the console's own "press here" ring, data-hint), a line
 * beside it, the rest of the screen dimmed until it is pressed. When all three are done: the idea in one line, and the next tutorial.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { lifeTutorialById, type TutCtx, type TutStep, type TutTarget } from '@/engine/simulator/lifeTutorials';

import css from './tutorial.module.css';

const squash = (s: string | null | undefined) => (s ?? '').replace(/[\s▶▷·+＋›]+/g, '');

interface Spot {
  /** The hole round the control (px, viewport) and the strip's own (left lit, to be read). */
  hole: { x: number; y: number; w: number; h: number };
  strip: { x: number; y: number; w: number; h: number } | null;
  say: string;
  /** Which control (a new one dims the screen again). */
  key: string;
}

/** A pad wedge's box is the whole pad (its shape is clipped): the spotlight goes round its arrow and words. */
const boxesOf = (el: HTMLElement) => (el.dataset.kind === 'wedge' ? [...el.children].map((c) => c.getBoundingClientRect()) : [el.getBoundingClientRect()]);

const rectOf = (els: HTMLElement[], pad: number) => {
  const r = els.flatMap(boxesOf);
  const x = Math.min(...r.map((b) => b.left)) - pad;
  const y = Math.min(...r.map((b) => b.top)) - pad;
  return { x, y, w: Math.max(...r.map((b) => b.right)) + pad - x, h: Math.max(...r.map((b) => b.bottom)) + pad - y };
};

/**
 * The control to press now, as a game's quest shows it: ringed (the console's data-hint), a line
 * beside it, and the rest of the screen dimmed until it is pressed. A step with `lead` names it from
 * the arm (the first of its targets on screen); the others ring all their targets. Panels open and
 * close under it, and the arm moves: look again a few times a second.
 */
function useSpotlight(step: TutStep | null, read: () => TutCtx, strip: RefObject<HTMLElement | null>) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [dim, setDim] = useState(false);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  useEffect(() => {
    if (!step) {
      setSpot(null);
      return;
    }
    let marked: HTMLElement[] = [];
    let last = '';
    const shown = (el: HTMLElement) => el.getBoundingClientRect().width > 0;
    const find = (t: TutTarget) => {
      if ('sel' in t) return [...document.querySelectorAll<HTMLElement>(t.sel)].filter(shown).slice(0, 3);
      const w = squash(t.text);
      return [...document.querySelectorAll<HTMLElement>('button')].filter((el) => squash(el.textContent) === w && shown(el)).slice(0, 2);
    };
    const look = () => {
      let els: HTMLElement[] = [];
      let said = '';
      let key = '';
      if (step.lead) {
        for (const t of step.lead(readRef.current())) {
          const f = find(t);
          if (!f.length) continue;
          els = f.slice(0, 1);
          said = t.say ?? '';
          key = JSON.stringify(t);
          break;
        }
      } else {
        els = step.target.flatMap(find);
        said = step.target[0]?.say ?? '여기를 눌러요';
        key = JSON.stringify(step.target);
      }
      for (const el of marked) if (!els.includes(el)) el.removeAttribute('data-hint');
      for (const el of els) el.setAttribute('data-hint', 'on');
      marked = els;
      if (!els.length) {
        setSpot(null);
        return;
      }
      const s = strip.current;
      setSpot({ hole: rectOf(els, els[0].dataset.kind === 'wedge' ? 12 : 6), strip: s ? rectOf([s], 2) : null, say: said, key });
      if (key !== last) {
        last = key;
        setDim(true);
      }
    };
    look();
    const t = window.setInterval(look, 300);
    // Any press (the control, or anywhere else) lifts the dimming; the ring and the line stay.
    const lift = () => setDim(false);
    window.addEventListener('pointerdown', lift, true);
    window.addEventListener('keydown', lift, true);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pointerdown', lift, true);
      window.removeEventListener('keydown', lift, true);
      for (const el of marked) el.removeAttribute('data-hint');
    };
  }, [step, strip]);
  return { spot, dim };
}

/** The dimmed screen with its holes, and the line by the control (over everything, never in the way of a press). */
function Spotlight({ spot, dim }: { spot: Spot; dim: boolean }) {
  const { hole: h } = spot;
  const vw = window.innerWidth;
  // The line on the side of the control with more room.
  const left = h.x + h.w / 2 > vw / 2;
  const holes = [h, ...(spot.strip ? [spot.strip] : [])];
  return createPortal(
    <div className={css.spot} data-dim={dim || undefined} aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          <mask id="tut-spot">
            <rect width="100%" height="100%" fill="#fff" />
            {holes.map((r, k) => (
              <rect key={k} x={r.x} y={r.y} width={r.w} height={r.h} rx={12} fill="#000" />
            ))}
          </mask>
        </defs>
        <rect className={css.shade} width="100%" height="100%" mask="url(#tut-spot)" />
        <rect className={css.edge} x={h.x} y={h.y} width={h.w} height={h.h} rx={12} />
      </svg>
      {spot.say && (
        <p className={css.say} data-side={left ? 'l' : 'r'} style={left ? { right: vw - h.x + 14, top: h.y + h.h / 2 } : { left: h.x + h.w + 14, top: h.y + h.h / 2 }}>
          {spot.say}
        </p>
      )}
    </div>,
    document.body,
  );
}

interface Props {
  id: string;
  /** The step being done (steps.length: all done). */
  step: number;
  /** The arm now (read a few times a second for the meter) and when the step began. */
  read(): TutCtx;
  start: TutCtx;
  /** The tutorial's place in the list (1-based) and how many there are. */
  n: number;
  of: number;
  onNext(): void;
  onClose(): void;
}

export default function TutorialStrip(p: Props) {
  const t = lifeTutorialById(p.id);
  const cur = t?.steps[p.step] ?? null;
  const stripRef = useRef<HTMLElement>(null);
  const { spot, dim } = useSpotlight(cur, p.read, stripRef);
  const readRef = useRef(p.read);
  useEffect(() => {
    readRef.current = p.read;
  });
  const [now, setNow] = useState<TutCtx | null>(null);
  const metered = !!cur?.meter;
  useEffect(() => {
    if (!metered) return;
    const id = window.setInterval(() => setNow(readRef.current()), 250);
    return () => window.clearInterval(id);
  }, [metered]);
  if (!t) return null;
  const over = p.step >= t.steps.length;
  const m = cur?.meter && now ? cur.meter(now, p.start) : null;
  return (
    <section ref={stripRef} className={css.strip} aria-label={`${p.n ? `튜토리얼 ${p.n}` : '맛보기'}: ${t.title}`} data-done={over || undefined}>
      <header>
        <em>{p.n ? `TUTORIAL ${p.n}` : 'TASTE'}</em>
        <b>{t.title}</b>
        <button type="button" className={css.close} onClick={p.onClose} aria-label="튜토리얼 그만하기" title="그만하기">
          ×
        </button>
      </header>
      <ol className={css.segs} aria-label={`${Math.min(p.step + 1, t.steps.length)} / ${t.steps.length}단계`}>
        {t.steps.map((s, k) => (
          <li key={s.short} data-on={k === p.step || undefined} data-done={k < p.step || undefined} />
        ))}
      </ol>
      {cur && (
        <div className={css.now}>
          <span className={css.n}>{p.step + 1}</span>
          <p>{cur.short}</p>
          {m && (
            <span className={css.meter}>
              <i>
                <i style={{ width: `${Math.min(100, (100 * m.v) / m.of)}%` }} />
              </i>
              <output>
                {Math.min(m.v, m.of).toFixed(0)}/{m.of}
                {m.unit}
              </output>
            </span>
          )}
        </div>
      )}
      {over && (
        <div className={css.end}>
          <p>
            <span className={css.ok}>✓ 완료</span> <b>{t.concept.term}</b> {t.concept.def}
          </p>
          {p.n < p.of && (
            <button type="button" className={css.next} onClick={p.onNext}>
              {p.n ? '다음 튜토리얼 ›' : '1단계 튜토리얼 ›'}
            </button>
          )}
        </div>
      )}
      {spot && <Spotlight spot={spot} dim={dim} />}
    </section>
  );
}
