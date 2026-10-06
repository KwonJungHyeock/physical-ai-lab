'use client';

/** Small pieces shared by the lesson panels: joint sliders, bar meters, a time graph. */

import type { ReactNode } from 'react';

import { JOINT_ANGLE_MAX, JOINT_ANGLE_MIN } from '@/engine/robot/limits';

import css from './learn.module.css';

export function JointSliders({
  angles,
  onChange,
  disabled,
  highlight,
  joints,
}: {
  angles: readonly number[];
  onChange(next: number[]): void;
  disabled?: boolean;
  highlight?: number | null;
  /** Only these joints (0-based); the rest are held. */
  joints?: readonly number[];
}) {
  return (
    <div className={css.sliders}>
      {angles.map((a, i) => (joints && !joints.includes(i) ? null : (
        <label key={i} className={css.slider} data-on={highlight === i || undefined}>
          <b>J{i + 1}</b>
          <input
            type="range"
            min={JOINT_ANGLE_MIN[i]}
            max={JOINT_ANGLE_MAX[i]}
            step={0.5}
            value={a}
            disabled={disabled}
            onChange={(e) => {
              const next = angles.slice();
              next[i] = Number(e.target.value);
              onChange(next);
            }}
            aria-label={`J${i + 1} 각도`}
          />
          <span className={css.num}>{a.toFixed(1)}°</span>
        </label>
      )))}
    </div>
  );
}

/** One bar per joint with its limit; over the limit shows red. */
export function Bars({ values, limits, unit, digits = 2, labels }: { values: readonly number[]; limits: readonly number[]; unit: string; digits?: number; labels?: readonly string[] }) {
  return (
    <div className={css.bars}>
      {values.map((val, i) => {
        const lim = limits[i] || 1;
        const f = Math.min(1.25, Math.abs(val) / lim);
        const over = Math.abs(val) > lim;
        return (
          <div key={i} className={css.bar} data-over={over || undefined}>
            <b>{labels?.[i] ?? `J${i + 1}`}</b>
            <span className={css.barTrack}>
              <span className={css.barFill} style={{ width: `${(f / 1.25) * 100}%` }} />
              <span className={css.barLimit} style={{ left: `${(1 / 1.25) * 100}%` }} />
            </span>
            <span className={css.num}>
              {val.toFixed(digits)} {unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface Series {
  label: string;
  color: string;
  values: readonly number[];
}

/**
 * A line graph over a shared x axis. `limit` draws ± dashed lines; `cursor`
 * marks the current x; `log` plots log10 (for IK error).
 */
export function Graph({
  x,
  series,
  unit,
  xUnit = 's',
  limit,
  cursor,
  height = 120,
  log,
  title,
}: {
  x: readonly number[];
  series: readonly Series[];
  unit: string;
  xUnit?: string;
  limit?: number;
  cursor?: number;
  height?: number;
  log?: boolean;
  title?: ReactNode;
}) {
  const W = 320;
  const H = height;
  const pad = { l: 40, r: 8, t: 8, b: 18 };
  const tr = (val: number) => (log ? Math.log10(Math.max(1e-6, Math.abs(val))) : val);
  const all = series.flatMap((s) => s.values.map(tr));
  if (limit !== undefined && !log) all.push(limit, -limit);
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  if (!log) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (hi - lo < 1e-9) hi = lo + 1;
  const x0 = x[0] ?? 0;
  const x1 = x[x.length - 1] ?? 1;
  const sx = (t: number) => pad.l + ((t - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (val: number) => pad.t + (1 - (tr(val) - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const syRaw = (val: number) => pad.t + (1 - (val - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const fmt = (val: number) => (log ? `1e${Math.round(val)}` : Math.abs(val) >= 100 ? val.toFixed(0) : Math.abs(val) >= 10 ? val.toFixed(1) : val.toFixed(2));
  return (
    <figure className={css.graph}>
      {title && <figcaption>{title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={typeof title === 'string' ? title : '그래프'}>
        <line x1={pad.l} x2={W - pad.r} y1={syRaw(log ? lo : 0)} y2={syRaw(log ? lo : 0)} className={css.axis} />
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className={css.axis} />
        <text x={pad.l - 4} y={pad.t + 8} className={css.tick} textAnchor="end">
          {fmt(hi)}
        </text>
        <text x={pad.l - 4} y={H - pad.b} className={css.tick} textAnchor="end">
          {fmt(lo)}
        </text>
        <text x={W - pad.r} y={H - 4} className={css.tick} textAnchor="end">
          {x1.toFixed(xUnit === '회' ? 0 : 2)} {xUnit}
        </text>
        <text x={pad.l + 2} y={H - 4} className={css.tick}>
          {unit}
        </text>
        {limit !== undefined && !log && (
          <>
            <line x1={pad.l} x2={W - pad.r} y1={sy(limit)} y2={sy(limit)} className={css.limit} />
            <line x1={pad.l} x2={W - pad.r} y1={sy(-limit)} y2={sy(-limit)} className={css.limit} />
          </>
        )}
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            strokeLinejoin="round"
            points={s.values.map((val, i) => `${sx(x[i]).toFixed(1)},${sy(val).toFixed(1)}`).join(' ')}
          />
        ))}
        {cursor !== undefined && <line x1={sx(cursor)} x2={sx(cursor)} y1={pad.t} y2={H - pad.b} className={css.cursor} />}
      </svg>
      <div className={css.legend}>
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** A labelled number readout. */
/** A labelled number; the label may hold a <Sym> (Kp, μg …). */
export function Readout({ label, value, unit, tone }: { label: ReactNode; value: string; unit?: string; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className={css.readout} data-tone={tone}>
      <small>{label}</small>
      <b>
        {value}
        {unit && <em>{unit}</em>}
      </b>
    </div>
  );
}

/** 4x4 transform as a small table, translation in mm. */
export function MatrixTable({ m, caption }: { m: readonly number[]; caption?: ReactNode }) {
  // three.js Matrix4.elements is column-major.
  const cell = (r: number, c: number) => m[c * 4 + r];
  return (
    <table className={css.matrix}>
      {caption && <caption>{caption}</caption>}
      <tbody>
        {[0, 1, 2, 3].map((r) => (
          <tr key={r}>
            {[0, 1, 2, 3].map((c) => (
              <td key={c} data-col={c === 3 ? 't' : 'r'}>
                {c === 3 && r < 3 ? (cell(r, c) * 1000).toFixed(1) : cell(r, c).toFixed(3)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
