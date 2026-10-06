/**
 * Renders a topic figure (fig/kit.tsx): the whole 1600 × 900 picture, or — for
 * a try's page — just that try's panel (the viewBox cropped to it). `animate`
 * plays the data-anim marks once (screen only; print shows the final drawing).
 */

import { W, H, type FigureDef } from './kit';
import css from './fig.module.css';

export function Figure({
  def,
  step,
  focus,
  animate,
  className,
  replay = 0,
}: {
  def: FigureDef;
  /** Show only this try's panel (viewBox cropped to it). */
  step?: 'A' | 'B' | 'C';
  /** Show the whole figure with this try's panel outlined and the other tries' panels dimmed. */
  focus?: 'A' | 'B' | 'C';
  animate?: boolean;
  className?: string;
  replay?: number;
}) {
  const p = step ? def.panels.find((x) => x.step === step) : undefined;
  const [x, y, w, h] = p ? [p.x, p.y, p.w, p.h] : [0, 0, W, H];
  const f = focus ? def.panels.find((q) => q.step === focus) : undefined;
  const same = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const dim = f ? def.panels.filter((q) => q.step && !same(q, f)).filter((q, i, all) => all.findIndex((o) => same(o, q)) === i) : [];
  return (
    <svg
      key={replay}
      viewBox={`${x} ${y} ${w} ${h}`}
      role="img"
      aria-label={p?.title ? `${def.label} — ${p.title}` : def.label}
      className={[css.fig, animate ? css.anim : '', className ?? ''].join(' ')}
    >
      <rect x={x} y={y} width={w} height={h} fill="#ffffff" />
      {def.draw()}
      {dim.map((q) => (
        <rect key={`${q.x},${q.y}`} x={q.x} y={q.y} width={q.w} height={q.h} fill="#ffffff" fillOpacity={0.68} />
      ))}
      {f && <rect x={f.x + 8} y={f.y + 8} width={f.w - 16} height={f.h - 16} rx={22} fill="none" stroke="#2A78D6" strokeWidth={8} />}
    </svg>
  );
}

/** Whether a figure has a panel for this try. */
export const hasStep = (def: FigureDef, step: 'A' | 'B' | 'C') => def.panels.some((p) => p.step === step);
