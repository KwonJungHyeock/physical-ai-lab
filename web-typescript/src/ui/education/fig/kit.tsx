/**
 * Drawing kit for the topic figures (그림 제작 요청서 §1): one 1600 × 900
 * picture per topic, 2–3 panels in the order of the tries (A → B → C) or
 * "쉬운 것 → 핵심 → 한계", four colours by meaning, labels and numbers only.
 *
 *   ink #2B2B2B  — the robot, outlines, labels
 *   blue #2A78D6 — command, goal, the right result ("그대로")
 *   orange #EB6834 — the real (measured) curve, a warning, 70–99 %
 *   red #D03B3B — failure, over the limit, collision
 *   gray #B0B0B0 — earlier state, dashed guides, grid
 * Axes: x red, y green, z blue. No gradients, shadows or photos.
 *
 * Plain SVG, no hooks: the same figure prints in the 자료실 PDF. A figure is a
 * draw function plus its panel rectangles; the 교육 screen can show one panel
 * (the current try) by cropping the viewBox. Elements marked data-anim animate
 * on screen (fig.module.css) and print as drawn.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';

export const W = 1600;
export const H = 900;

export const C = {
  ink: '#2B2B2B',
  blue: '#2A78D6',
  orange: '#EB6834',
  red: '#D03B3B',
  gray: '#B0B0B0',
  light: '#E6E6E6',
  axisX: '#D03B3B',
  axisY: '#2E9E4F',
  axisZ: '#2A78D6',
  white: '#FFFFFF',
} as const;
export type Color = keyof typeof C;

/**
 * A panel of a figure; `step` ties it to a try (the 실습 page shows that panel).
 * When the spec has fewer panels than tries, give the same rectangle twice with two steps.
 */
export interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
  step?: 'A' | 'B' | 'C';
  title?: string;
}

export interface FigureDef {
  /** What the picture shows, one line (alt text). */
  label: string;
  /** The caption under it, a few words: "그림 5-2  P · PI · PID 의 계단 응답". */
  caption?: string;
  /** The topic's 기호 that appear in the drawing (explained in a strip under it). */
  symbols?: string[];
  panels: Panel[];
  draw: () => ReactElement;
}

/** Layouts from the spec: 2 halves, 3 thirds, or top 6 : bottom 4. */
export const cols = (n: 2 | 3, y = 0, h = H, steps: ('A' | 'B' | 'C' | undefined)[] = ['A', 'B', 'C']): Panel[] =>
  Array.from({ length: n }, (_, i) => ({ x: (W / n) * i, y, w: W / n, h, step: steps[i] }));
export const TOP_H = 540;

const r = (n: number) => Math.round(n * 10) / 10;
export const rad = (d: number) => (d * Math.PI) / 180;

type Anim = 'draw' | 'pop' | 'fade' | 'pulse';
/** Animation attributes: kind and delay (s). Ignored in print. */
export const anim = (kind: Anim, delay = 0) => ({ 'data-anim': kind, style: { '--d': `${delay}s` } as CSSProperties });

/** A group that animates as one (pop by default). */
export function G({ an, kind = 'pop', children }: { an?: number; kind?: Anim; children: ReactNode }) {
  return <g {...(an !== undefined ? anim(kind, an) : {})}>{children}</g>;
}

/* ─────────────────────────── text and lines */

export function T({
  x,
  y,
  children,
  c = 'ink',
  s = 30,
  a = 'middle',
  b,
  delay,
}: {
  x: number;
  y: number;
  children: ReactNode;
  c?: Color;
  s?: number;
  a?: 'start' | 'middle' | 'end';
  b?: boolean;
  delay?: number;
}) {
  return (
    <text x={r(x)} y={r(y)} fontSize={s} fill={C[c]} textAnchor={a} fontWeight={b ? 700 : 500} fontFamily="Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" {...(delay !== undefined ? anim('fade', delay) : {})}>
      {children}
    </text>
  );
}

/** The activity a panel belongs to, written ①②③ (the lesson's 활동 1 · 2 · 3) in place of a leading A / B / C. */
const ACT: Record<string, string> = { A: '①', B: '②', C: '③' };
export const actTitle = (t: ReactNode): ReactNode => (typeof t === 'string' ? t.replace(/^([ABC])\s+/, (_, k: string) => `${ACT[k]} `) : t);

/** Panel heading, centred at the top of the panel ("A 관절 보간" is shown "① 관절 보간"). */
export function Title({ p, children, c = 'ink' }: { p: Panel; children: ReactNode; c?: Color }) {
  return (
    <T x={p.x + p.w / 2} y={p.y + 52} s={36} b c={c}>
      {actTitle(children)}
    </T>
  );
}

/** Thin separators between panels. */
export function Dividers({ panels }: { panels: Panel[] }) {
  return (
    <g>
      {panels.slice(1).map((p, i) =>
        p.x > 0 ? <line key={`v${i}`} x1={p.x} x2={p.x} y1={p.y + 24} y2={p.y + p.h - 24} stroke={C.light} strokeWidth={3} /> : <line key={`h${i}`} x1={24} x2={W - 24} y1={p.y} y2={p.y} stroke={C.light} strokeWidth={3} />,
      )}
    </g>
  );
}

export function Ln({ x1, y1, x2, y2, c = 'ink', w = 4, dash, an }: { x1: number; y1: number; x2: number; y2: number; c?: Color; w?: number; dash?: boolean; an?: number }) {
  return (
    <line
      x1={r(x1)}
      y1={r(y1)}
      x2={r(x2)}
      y2={r(y2)}
      stroke={C[c]}
      strokeWidth={w}
      strokeLinecap="round"
      strokeDasharray={dash ? '14 12' : undefined}
      pathLength={an !== undefined && !dash ? 1 : undefined}
      {...(an !== undefined ? anim(dash ? 'fade' : 'draw', an) : {})}
    />
  );
}

/** An arrow (head at the end, or both ends). */
export function Arrow({ x1, y1, x2, y2, c = 'ink', w = 5, dash, both, an }: { x1: number; y1: number; x2: number; y2: number; c?: Color; w?: number; dash?: boolean; both?: boolean; an?: number }) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = 10 + w * 3;
  const head = (x: number, y: number, a: number) =>
    `M${r(x)} ${r(y)} L${r(x - hl * Math.cos(a - 0.42))} ${r(y - hl * Math.sin(a - 0.42))} L${r(x - hl * Math.cos(a + 0.42))} ${r(y - hl * Math.sin(a + 0.42))} Z`;
  const sx = both ? x1 + Math.cos(ang) * hl * 0.8 : x1;
  const sy = both ? y1 + Math.sin(ang) * hl * 0.8 : y1;
  return (
    <g {...(an !== undefined ? anim('fade', an) : {})}>
      <line x1={r(sx)} y1={r(sy)} x2={r(x2 - Math.cos(ang) * hl * 0.8)} y2={r(y2 - Math.sin(ang) * hl * 0.8)} stroke={C[c]} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash ? '14 12' : undefined} />
      <path d={head(x2, y2, ang)} fill={C[c]} />
      {both && <path d={head(x1, y1, ang + Math.PI)} fill={C[c]} />}
    </g>
  );
}

/** An open path through points (data-anim draw makes it trace itself on screen). */
export function Poly({ pts, c = 'ink', w = 5, dash, fill, an, closed }: { pts: readonly (readonly [number, number])[]; c?: Color; w?: number; dash?: boolean; fill?: Color | 'none'; an?: number; closed?: boolean }) {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r(x)} ${r(y)}`).join(' ') + (closed ? ' Z' : '');
  return (
    <path
      d={d}
      fill={fill && fill !== 'none' ? C[fill] : 'none'}
      stroke={C[c]}
      strokeWidth={w}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dash ? '14 12' : undefined}
      pathLength={an !== undefined && !dash ? 1 : undefined}
      {...(an !== undefined ? anim(dash ? 'fade' : 'draw', an) : {})}
    />
  );
}

/** Any path d (same animation rules as Poly). */
export function P({ d, c = 'ink', w = 5, dash, fill, an }: { d: string; c?: Color; w?: number; dash?: boolean; fill?: Color; an?: number }) {
  return (
    <path
      d={d}
      fill={fill ? C[fill] : 'none'}
      stroke={C[c]}
      strokeWidth={w}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dash ? '14 12' : undefined}
      pathLength={an !== undefined && !dash ? 1 : undefined}
      {...(an !== undefined ? anim(dash ? 'fade' : 'draw', an) : {})}
    />
  );
}

/** A circular arc (centre, radius, from/to angles in degrees, y up), optionally with an arrow head. */
export function Arc({ cx, cy, rr, from, to, c = 'ink', w = 5, dash, head, an }: { cx: number; cy: number; rr: number; from: number; to: number; c?: Color; w?: number; dash?: boolean; head?: boolean; an?: number }) {
  const n = Math.max(8, Math.ceil(Math.abs(to - from) / 4));
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(from + ((to - from) * i) / n);
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)] as const;
  });
  const [ex, ey] = pts[n];
  const [px, py] = pts[n - 1];
  return (
    <g>
      <Poly pts={pts} c={c} w={w} dash={dash} an={an} />
      {head && <Arrow x1={px} y1={py} x2={ex} y2={ey} c={c} w={w} an={an === undefined ? undefined : an + 0.8} />}
    </g>
  );
}

export function Dot({ x, y, rr = 9, c = 'ink', hollow, an }: { x: number; y: number; rr?: number; c?: Color; hollow?: boolean; an?: number }) {
  return <circle cx={r(x)} cy={r(y)} r={rr} fill={hollow ? C.white : C[c]} stroke={C[c]} strokeWidth={hollow ? 4 : 0} {...(an !== undefined ? anim('pop', an) : {})} />;
}

export function Cross({ x, y, s = 18, c = 'red', an }: { x: number; y: number; s?: number; c?: Color; an?: number }) {
  return <path d={`M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}`} stroke={C[c]} strokeWidth={8} strokeLinecap="round" {...(an !== undefined ? anim('pop', an) : {})} />;
}

export function Check({ x, y, s = 18, c = 'blue', an }: { x: number; y: number; s?: number; c?: Color; an?: number }) {
  return <path d={`M${x - s} ${y} L${x - s / 3} ${y + s * 0.7} L${x + s} ${y - s * 0.7}`} fill="none" stroke={C[c]} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" {...(an !== undefined ? anim('pop', an) : {})} />;
}

/* ─────────────────────────── robot */

/** Floor: a thick line with a small base plate under (x, y). */
export function Floor({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <line x1={x1} x2={x2} y1={y} y2={y} stroke={C.ink} strokeWidth={7} strokeLinecap="round" />;
}

export function Base({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <path d={`M${x - 46 * s} ${y} L${x - 32 * s} ${y - 30 * s} L${x + 32 * s} ${y - 30 * s} L${x + 46 * s} ${y} Z`} fill={C.white} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />;
}

/** Points of a planar chain from (x, y): the first angle from +x (counter-clockwise, y up), the rest relative. */
export function chain(x: number, y: number, lengths: readonly number[], angles: readonly number[]): [number, number][] {
  const out: [number, number][] = [[x, y]];
  let a = 0;
  lengths.forEach((l, i) => {
    a += angles[i];
    const [px, py] = out[out.length - 1];
    out.push([px + l * Math.cos(rad(a)), py - l * Math.sin(rad(a))]);
  });
  return out;
}

/** Absolute angle of the last link (deg, y up). */
export const endAngle = (angles: readonly number[]) => angles.reduce((s, a) => s + a, 0);

/** A side-view arm: round-ended bars, hollow joints, optional gripper at the end. */
export function Arm({
  pts,
  c = 'ink',
  w = 22,
  dash,
  gripper = true,
  tipAngle,
  opacity,
  an,
}: {
  pts: readonly (readonly [number, number])[];
  c?: Color;
  w?: number;
  dash?: boolean;
  gripper?: boolean;
  /** Direction the gripper points (deg, y up); defaults to the last link. */
  tipAngle?: number;
  opacity?: number;
  an?: number;
}) {
  const [ex, ey] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const a = tipAngle ?? (Math.atan2(-(ey - py), ex - px) * 180) / Math.PI;
  const color = C[c];
  return (
    <g opacity={opacity} {...(an !== undefined ? anim('pop', an) : {})}>
      {pts.slice(1).map(([x, y], i) => (
        <line
          key={i}
          x1={r(pts[i][0])}
          y1={r(pts[i][1])}
          x2={r(x)}
          y2={r(y)}
          stroke={dash ? C.white : color}
          strokeWidth={w}
          strokeLinecap="round"
          {...(dash ? {} : {})}
        />
      ))}
      {dash &&
        pts.slice(1).map(([x, y], i) => (
          <line key={`d${i}`} x1={r(pts[i][0])} y1={r(pts[i][1])} x2={r(x)} y2={r(y)} stroke={color} strokeWidth={5} strokeDasharray="14 10" strokeLinecap="round" />
        ))}
      {pts.slice(0, -1).map(([x, y], i) => (
        <circle key={`j${i}`} cx={r(x)} cy={r(y)} r={w * 0.62} fill={C.white} stroke={color} strokeWidth={5} />
      ))}
      {gripper && <Gripper x={ex} y={ey} angle={a} c={c} />}
    </g>
  );
}

/** ㄷ-shaped two-finger gripper at (x, y), opening toward `angle` (deg, y up). */
export function Gripper({ x, y, angle, c = 'ink', s = 1, open = 1, opacity }: { x: number; y: number; angle: number; c?: Color; s?: number; open?: number; opacity?: number }) {
  const g = 18 * open;
  return (
    <g transform={`translate(${r(x)} ${r(y)}) rotate(${r(-angle)}) scale(${s})`} opacity={opacity}>
      <path d={`M0 ${-g - 6} L0 ${g + 6} M0 ${-g - 6} L34 ${-g - 6} M0 ${g + 6} L34 ${g + 6}`} fill="none" stroke={C[c]} strokeWidth={8} strokeLinecap="round" />
    </g>
  );
}

/** A cube block, front and top faces. */
export function Cube({ x, y, s = 60, c = 'blue', tilt = 0, dash }: { x: number; y: number; s?: number; c?: Color; tilt?: number; dash?: boolean }) {
  const d = s * 0.32;
  return (
    <g transform={tilt ? `rotate(${tilt} ${x + s / 2} ${y + s})` : undefined}>
      <path d={`M${x} ${y} L${x + d} ${y - d} L${x + s + d} ${y - d} L${x + s} ${y} Z`} fill={dash ? 'none' : C.white} stroke={C[c]} strokeWidth={4} strokeDasharray={dash ? '10 8' : undefined} />
      <rect x={x} y={y} width={s} height={s} fill={dash ? 'none' : C[c]} fillOpacity={dash ? 0 : 0.85} stroke={C[c]} strokeWidth={4} strokeDasharray={dash ? '10 8' : undefined} />
      <path d={`M${x + s} ${y} L${x + s + d} ${y - d} L${x + s + d} ${y + s - d} L${x + s} ${y + s}`} fill={dash ? 'none' : C[c]} fillOpacity={dash ? 0 : 0.6} stroke={C[c]} strokeWidth={4} strokeDasharray={dash ? '10 8' : undefined} />
    </g>
  );
}

/** A faint grid (the table). */
export function Grid({ x, y, w, h, step = 40 }: { x: number; y: number; w: number; h: number; step?: number }) {
  const lines: ReactElement[] = [];
  for (let i = 0; i <= w; i += step) lines.push(<line key={`v${i}`} x1={x + i} x2={x + i} y1={y} y2={y + h} />);
  for (let j = 0; j <= h; j += step) lines.push(<line key={`h${j}`} x1={x} x2={x + w} y1={y + j} y2={y + j} />);
  return (
    <g stroke={C.light} strokeWidth={2}>
      {lines}
    </g>
  );
}

/**
 * Oblique view of the table for robot scenes: robot x to the right, robot y into
 * the page (up-right), z up. `s` px per unit.
 */
export const oblique = (ox: number, oy: number, s = 1) => (x: number, y: number, z = 0): [number, number] => [ox + x * s + y * s * 0.55, oy - y * s * 0.4 - z * s];

/** x / y / z axes from (x, y): x to the right, y up-right (into the page), z up. */
export function Axes3({ x, y, len = 110, labels = ['x', 'y', 'z'] }: { x: number; y: number; len?: number; labels?: [string, string, string] }) {
  return (
    <g>
      <Arrow x1={x} y1={y} x2={x + len} y2={y} c="axisX" w={5} />
      <Arrow x1={x} y1={y} x2={x + len * 0.62} y2={y - len * 0.45} c="axisY" w={5} />
      <Arrow x1={x} y1={y} x2={x} y2={y - len} c="axisZ" w={5} />
      {/* Labels start just past the arrowheads, so a longer name ("x 앞") never covers its arrow. */}
      <T x={x + len + 12} y={y + 10} c="axisX" b a="start">
        {labels[0]}
      </T>
      <T x={x + len * 0.62 + 12} y={y - len * 0.45 - 4} c="axisY" b a="start">
        {labels[1]}
      </T>
      <T x={x} y={y - len - 14} c="axisZ" b>
        {labels[2]}
      </T>
    </g>
  );
}

/* ─────────────────────────── graphs */

export interface Scale {
  /** Data → SVG. */
  sx(v: number): number;
  sy(v: number): number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A graph box with labelled axes (name and unit) and a few ticks. Children get
 * the scale: draw curves with `curve(scale, f)` or `Poly`.
 */
export function Graph({
  x,
  y,
  w,
  h,
  xMax,
  yMax,
  yMin = 0,
  xLabel,
  yLabel,
  xTicks = [],
  yTicks = [],
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  xMax: number;
  yMax: number;
  yMin?: number;
  xLabel: string;
  yLabel: string;
  xTicks?: number[];
  yTicks?: number[];
  children: (s: Scale) => ReactNode;
}) {
  const s: Scale = { sx: (v) => x + (v / xMax) * w, sy: (v) => y + h - ((v - yMin) / (yMax - yMin)) * h, x, y, w, h };
  const zero = s.sy(Math.max(yMin, 0));
  return (
    <g>
      <Arrow x1={x} y1={y + h + 6} x2={x} y2={y - 26} w={4} c="ink" />
      <Arrow x1={x - 6} y1={zero} x2={x + w + 30} y2={zero} w={4} c="ink" />
      <T x={x + 10} y={y - 34} a="start" s={28}>
        {yLabel}
      </T>
      <T x={x + w + 30} y={zero + 44} a="end" s={28}>
        {xLabel}
      </T>
      {xTicks.map((t) => (
        <T key={`x${t}`} x={s.sx(t)} y={zero + 36} s={28} c="ink">
          {t}
        </T>
      ))}
      {yTicks.map((t) => (
        <T key={`y${t}`} x={x - 12} y={s.sy(t) + 10} a="end" s={28} c="ink">
          {t}
        </T>
      ))}
      {children(s)}
    </g>
  );
}

/** Sample f over [0, xMax] into graph points. */
export const curve = (s: Scale, f: (t: number) => number, xMax: number, n = 80): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (xMax * i) / n;
    return [s.sx(t), s.sy(f(t))];
  });

/** A horizontal dashed level across a graph (goal, limit) with its label at the right. */
export function Level({ s, v, label, c = 'blue' }: { s: Scale; v: number; label?: string; c?: Color }) {
  return (
    <g>
      <line x1={s.x} x2={s.x + s.w} y1={s.sy(v)} y2={s.sy(v)} stroke={C[c]} strokeWidth={4} strokeDasharray="14 12" />
      {label && (
        <T x={s.x + s.w} y={s.sy(v) - 12} a="end" s={28} c={c} b>
          {label}
        </T>
      )}
    </g>
  );
}

/** A vertical bar meter (0–100 % with a limit line), filled to pct. */
export function Meter({ x, y, h = 260, w = 54, pct, limitLabel = '모터 한계' }: { x: number; y: number; h?: number; w?: number; pct: number; limitLabel?: string }) {
  const fillC: Color = pct > 100 ? 'red' : pct >= 70 ? 'orange' : 'blue';
  const fh = Math.min(pct, 130) / 100;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.gray} strokeWidth={4} />
      <rect x={x + 4} y={y + h - fh * h} width={w - 8} height={fh * h - 4 > 0 ? fh * h - 4 : 0} fill={C[fillC]} {...anim('pop', 0.3)} />
      <line x1={x - 14} x2={x + w + 14} y1={y} y2={y} stroke={C.red} strokeWidth={4} strokeDasharray="10 8" />
      <T x={x + w / 2} y={y - 16} s={28} c="red">
        {limitLabel}
      </T>
      <T x={x + w / 2} y={y + h + 40} s={32} b c={fillC}>
        {pct}%
      </T>
    </g>
  );
}

/** A labelled box for block diagrams. */
export function Box({ x, y, w, h = 70, children, c = 'ink', fillC }: { x: number; y: number; w: number; h?: number; children: ReactNode; c?: Color; fillC?: Color }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={fillC ? C[fillC] : C.white} fillOpacity={fillC ? 0.12 : 1} stroke={C[c]} strokeWidth={4} />
      <T x={x + w / 2} y={y + h / 2 + 11} s={30} b c={c}>
        {children}
      </T>
    </g>
  );
}
