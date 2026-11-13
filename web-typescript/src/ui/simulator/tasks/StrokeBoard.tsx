'use client';

/**
 * 입문 과정 5-4 내 글자 쓰기: the 획 그리기 판, over the 3D scene while it is open (확정 B안). The board is
 * the card (120 × 80 mm) with its drawing area (100 × 60 mm, dashed) — press and drag for a stroke, let
 * go to end it; a tap is dropped. Each stroke carries its order number at its start and an arrow at its
 * end; a part that leaves the drawing area shows red with a tag where it went out. The list to rub
 * strokes out and the open / close key are in the right panel (CourseStepPanel). Card mm, y up.
 */

import { useRef, useState } from 'react';

import { MY_AREA, MY_CARD, inArea, thinStroke, type Pt } from '@/engine/simulator/cell/courseDraw';

import css from './strokeBoard.module.css';

/** Pixels per card mm (the card 720 × 480 px: room for it and its edge beside the panel at 1366 × 768). */
export const BOARD_PX_PER_MM = 6;
const S = BOARD_PX_PER_MM;
const W = MY_CARD.w * S;
const H = MY_CARD.h * S;
const px = ([u, v]: Pt) => [u * S, (MY_CARD.h - v) * S] as const;

/** A stroke's runs inside and outside the drawing area, for drawing them in their colours. */
function runsOf(s: readonly Pt[]): { out: boolean; pts: Pt[] }[] {
  const runs: { out: boolean; pts: Pt[] }[] = [];
  for (const p of s) {
    const out = !inArea(p);
    const last = runs[runs.length - 1];
    if (last && last.out === out) last.pts.push(p);
    else runs.push({ out, pts: last ? [last.pts[last.pts.length - 1], p] : [p] });
  }
  return runs;
}

const path = (pts: readonly Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p)[0].toFixed(1)},${px(p)[1].toFixed(1)}`).join(' ');

export default function StrokeBoard({ strokes, onAdd }: { strokes: readonly (readonly Pt[])[]; onAdd(stroke: Pt[]): void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<Pt[] | null>(null);
  const at = (e: React.PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    const u = Math.min(MY_CARD.w, Math.max(0, ((e.clientX - r.left) / r.width) * MY_CARD.w));
    const v = Math.min(MY_CARD.h, Math.max(0, MY_CARD.h - ((e.clientY - r.top) / r.height) * MY_CARD.h));
    return [Math.round(u * 10) / 10, Math.round(v * 10) / 10];
  };
  const end = () => {
    if (!live) return;
    const s = thinStroke(live);
    setLive(null);
    if (s) onAdd(s);
  };
  const outs = strokes.map((s, i) => ({ i, p: s.find((q) => !inArea(q)) })).filter((o) => o.p);
  return (
    <div className={css.board} data-board role="group" aria-label="획 그리기 판">
      <header className={css.head}>
        <b>획 그리기 판</b>
        <span>카드 120 × 80 mm · 점선 안(100 × 60 mm)에 한 획씩 그려요</span>
      </header>
      <div className={css.wrap}>
        <svg
          ref={svg}
          className={css.card}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setLive([at(e)]);
          }}
          onPointerMove={(e) => live && setLive([...live, at(e)])}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        >
          {/* 10 mm grid, the drawing area dashed. */}
          {Array.from({ length: MY_CARD.w / 10 - 1 }, (_, k) => (
            <line key={`gx${k}`} x1={(k + 1) * 10 * S} y1={0} x2={(k + 1) * 10 * S} y2={H} className={css.grid} />
          ))}
          {Array.from({ length: MY_CARD.h / 10 - 1 }, (_, k) => (
            <line key={`gy${k}`} x1={0} y1={(k + 1) * 10 * S} x2={W} y2={(k + 1) * 10 * S} className={css.grid} />
          ))}
          <rect x={MY_AREA.x0 * S} y={(MY_CARD.h - MY_AREA.y1) * S} width={(MY_AREA.x1 - MY_AREA.x0) * S} height={(MY_AREA.y1 - MY_AREA.y0) * S} className={css.area} />
          {strokes.map((s, i) => {
            const a = px(s[s.length - 2] ?? s[0]);
            const b = px(s[s.length - 1]);
            const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
            return (
              <g key={i}>
                {runsOf(s).map((r, k) => (
                  <path key={k} d={path(r.pts)} className={r.out ? css.out : css.stroke} />
                ))}
                {/* The direction: an arrowhead at the stroke's end. */}
                <polygon points="0,0 -13,-7 -13,7" transform={`translate(${b[0]},${b[1]}) rotate(${ang})`} className={css.arrow} />
              </g>
            );
          })}
          {live && live.length > 1 && <path d={path(live)} className={css.stroke} />}
        </svg>
        {/* The order numbers at each stroke's start (white, square-cornered: not the orange 'press here' badges). */}
        {strokes.map((s, i) => {
          const [x, y] = px(s[0]);
          return (
            <span key={i} className={css.num} style={{ left: x, top: y }}>
              {i + 1}
            </span>
          );
        })}
        {outs.map(({ i, p }) => {
          const [x, y] = px(p!);
          return (
            <span key={`o${i}`} className={css.outTag} data-flip={x > W - 150 ? '' : undefined} style={{ left: x, top: y }}>
              {i + 1}번 획 · 점선 밖
            </span>
          );
        })}
      </div>
    </div>
  );
}
