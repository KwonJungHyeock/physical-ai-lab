'use client';

/**
 * 디지털 트윈 관제센터의 차트 (hand-written SVG, no chart library): a scatter with its least-squares line,
 * a histogram, a sparkline, the 병목 bars and the twin's sim ↔ real plot. Each draws at its box's real
 * width (measured), so text stays at its set size; a hover shows the point's numbers.
 * The numbers come from engine/education/dataScience.ts.
 */

import { useCallback, useState, type ReactNode } from 'react';

import { fmtNum, niceTicks, stamp, withUnit, type Column, type Fit, type Histogram, type Point, type TwinPair } from '@/engine/education/dataScience';

import css from './data.module.css';

const PASS = '#1f9d55';
const FAIL = '#d92d20';
const ACCENT = '#0fa3b8';
const GRID = '#eaecf0';
const AXIS = '#98a2b3';
const TEXT = '#667085';

/** The element's content width, kept up to date (0 until measured). */
function useWidth(): [(el: HTMLElement | null) => (() => void) | undefined, number] {
  const [w, setW] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A small spread for 0/1 values so the points do not sit on each other (the same for the same index). */
const jitter = (i: number) => {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 0.36;
};

interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
  label(v: number): string;
}

function scaleOf(vs: readonly number[], col: Column): Scale {
  if (col.binary) {
    const yes = col.key === 'pass' ? '성공' : '켬';
    const no = col.key === 'pass' ? '실패' : '끔';
    return { lo: -0.35, hi: 1.35, ticks: [0, 1], label: (v) => (v ? yes : no) };
  }
  const t = niceTicks(vs.length ? Math.min(...vs) : 0, vs.length ? Math.max(...vs) : 1, 5);
  return { lo: t.lo, hi: t.hi, ticks: t.ticks, label: (v) => fmtNum(v) };
}

const unitOf = (c: Column) => (c.unit ? ` (${c.unit})` : '');

interface Tip {
  x: number;
  y: number;
  body: ReactNode;
}

function TipBox({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className={css.tip} style={{ left: tip.x, top: tip.y }} role="status">
      {tip.body}
    </div>
  );
}

/* --- scatter -------------------------------------------------------------------------------- */

export function Scatter({ points, x, y, fit, height = 300 }: { points: readonly Point[]; x: Column; y: Column; fit: Fit | null; height?: number }) {
  const [ref, w] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const m = { l: 56, r: 18, t: 22, b: 42 };
  const W = Math.max(200, w);
  const H = height;
  const sx = scaleOf(
    points.map((p) => p.x),
    x,
  );
  const sy = scaleOf(
    points.map((p) => p.y),
    y,
  );
  const px = (v: number) => m.l + ((v - sx.lo) / (sx.hi - sx.lo || 1)) * (W - m.l - m.r);
  const py = (v: number) => H - m.b - ((v - sy.lo) / (sy.hi - sy.lo || 1)) * (H - m.t - m.b);
  const robot = points.some((p) => p.source === 'robot');
  return (
    <div className={css.chart} ref={ref}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label={`${x.name}에 따른 ${y.name}, 점 ${points.length}개`}>
          <defs>
            <clipPath id="dc-plot">
              <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} />
            </clipPath>
          </defs>
          {sy.ticks.map((v) => (
            <g key={`y${v}`}>
              <line x1={m.l} x2={W - m.r} y1={py(v)} y2={py(v)} stroke={GRID} />
              <text x={m.l - 8} y={py(v)} dy="0.32em" textAnchor="end" className={css.tick}>
                {sy.label(v)}
              </text>
            </g>
          ))}
          {sx.ticks.map((v) => (
            <g key={`x${v}`}>
              <line x1={px(v)} x2={px(v)} y1={H - m.b} y2={H - m.b + 4} stroke={AXIS} />
              <text x={px(v)} y={H - m.b + 16} textAnchor="middle" className={css.tick}>
                {sx.label(v)}
              </text>
            </g>
          ))}
          <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke={AXIS} />
          <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className={css.axisName}>
            {x.name + unitOf(x)} →
          </text>
          <text x={m.l - 44} y={12} className={css.axisName}>
            ↑ {y.name + unitOf(y)}
          </text>
          {fit && (
            <line
              clipPath="url(#dc-plot)"
              x1={px(sx.lo)}
              x2={px(sx.hi)}
              y1={py(fit.intercept + fit.slope * sx.lo)}
              y2={py(fit.intercept + fit.slope * sx.hi)}
              stroke={ACCENT}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )}
          {points.map((p, i) => {
            const cx = px(p.x + (x.binary ? jitter(i) : 0));
            const cy = py(p.y + (y.binary ? jitter(i + 7) : 0));
            const c = p.pass ? PASS : FAIL;
            const show = () =>
              setTip({
                x: cx,
                y: cy,
                body: (
                  <>
                    <b>
                      {p.r.who ? `${p.r.who} · ` : ''}
                      {p.pass ? '성공' : '실패'}
                      {p.source === 'robot' ? ' · 실제 로봇' : ''}
                    </b>
                    <span>
                      {x.name}: {withUnit(fmtNum(p.x), x.unit)}
                    </span>
                    <span>
                      {y.name}: {y.binary ? sy.label(p.y) : withUnit(fmtNum(p.y), y.unit)}
                    </span>
                    <small>{stamp(p.r.t)}</small>
                  </>
                ),
              });
            return (
              <g key={i} onPointerEnter={show} onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}>
                <circle cx={cx} cy={cy} r={9} fill="transparent" />
                {p.source === 'robot' ? (
                  <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} transform={`rotate(45 ${cx} ${cy})`} fill={c} stroke="#fff" strokeWidth={1.5} />
                ) : p.pass ? (
                  <circle cx={cx} cy={cy} r={4.5} fill={c} fillOpacity={0.8} stroke="#fff" strokeWidth={1.5} />
                ) : (
                  <path
                    d={`M${cx - 4} ${cy - 4}L${cx + 4} ${cy + 4}M${cx + 4} ${cy - 4}L${cx - 4} ${cy + 4}`}
                    stroke={c}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeOpacity={0.85}
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} />
      <div className={css.legend}>
        <span>
          <svg width="12" height="12" aria-hidden>
            <circle cx="6" cy="6" r="4.5" fill={PASS} />
          </svg>
          성공
        </span>
        <span>
          <svg width="12" height="12" aria-hidden>
            <path d="M2 2L10 10M10 2L2 10" stroke={FAIL} strokeWidth="2" strokeLinecap="round" />
          </svg>
          실패
        </span>
        {robot && (
          <span>
            <svg width="12" height="12" aria-hidden>
              <rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill={TEXT} />
            </svg>
            실제 로봇
          </span>
        )}
        {fit && (
          <span>
            <svg width="18" height="12" aria-hidden>
              <line x1="1" x2="17" y1="6" y2="6" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            추세선 (최소제곱)
          </span>
        )}
        {(x.binary || y.binary) && <span className={css.legendNote}>예 · 아니오 값은 겹치지 않게 조금 흩어 그렸어요</span>}
      </div>
    </div>
  );
}

/* --- histogram ------------------------------------------------------------------------------ */

export function HistogramChart({ h, unit, mean, height = 200 }: { h: Histogram; unit: string; mean: number; height?: number }) {
  const [ref, w] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const m = { l: 34, r: 12, t: 18, b: 36 };
  const W = Math.max(160, w);
  const H = height;
  const k = h.counts.length;
  const top = niceTicks(0, Math.max(1, ...h.counts), 3);
  const bw = (W - m.l - m.r) / Math.max(1, k);
  const px = (v: number) => m.l + ((v - h.lo) / (h.step * Math.max(1, k))) * (W - m.l - m.r);
  const py = (c: number) => H - m.b - (c / top.hi) * (H - m.t - m.b);
  const labelEvery = Math.max(1, Math.ceil(k / Math.max(1, Math.floor((W - m.l - m.r) / 44))));
  return (
    <div className={css.chart} ref={ref}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label={`작업 시간 분포, ${h.n}번`}>
          {top.ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={py(v)} y2={py(v)} stroke={GRID} />
              <text x={m.l - 6} y={py(v)} dy="0.32em" textAnchor="end" className={css.tick}>
                {v}
              </text>
            </g>
          ))}
          {h.counts.map((c, i) => {
            const x0 = m.l + i * bw + 1;
            const bh = H - m.b - py(c);
            const wdt = Math.max(1, bw - 2);
            const r = Math.min(4, wdt / 2, bh);
            const y0 = py(c);
            const lo = h.lo + i * h.step;
            return (
              <g
                key={i}
                onPointerEnter={() =>
                  setTip({
                    x: x0 + wdt / 2,
                    y: y0,
                    body: (
                      <>
                        <b>{c}번</b>
                        <span>
                          {fmtNum(lo)} ~ {fmtNum(lo + h.step)} {unit}
                        </span>
                      </>
                    ),
                  })
                }
                onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}
              >
                <rect x={x0} y={m.t} width={wdt} height={H - m.t - m.b} fill="transparent" />
                {c > 0 && (
                  <path
                    d={`M${x0} ${H - m.b}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}H${x0 + wdt - r}Q${x0 + wdt} ${y0} ${x0 + wdt} ${y0 + r}V${H - m.b}Z`}
                    fill={ACCENT}
                  />
                )}
              </g>
            );
          })}
          <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke={AXIS} />
          {Array.from({ length: k + 1 }, (_, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={m.l + i * bw} y={H - m.b + 15} textAnchor="middle" className={css.tick}>
                {fmtNum(h.lo + i * h.step)}
              </text>
            ) : null,
          )}
          {Number.isFinite(mean) && (
            <g>
              <line x1={px(mean)} x2={px(mean)} y1={m.t - 4} y2={H - m.b} stroke="#344054" strokeWidth={1.5} />
              <text x={px(mean)} y={m.t - 7} textAnchor={px(mean) > W - 80 ? 'end' : 'middle'} className={css.markText}>
                평균 {fmtNum(mean)} {unit}
              </text>
            </g>
          )}
          <text x={W - m.r} y={H - 4} textAnchor="end" className={css.axisName}>
            작업 시간 ({unit}) →
          </text>
        </svg>
      )}
      <TipBox tip={tip} />
    </div>
  );
}

/* --- sparkline ------------------------------------------------------------------------------ */

export function Sparkline({ values, color, width = 120, height = 28 }: { values: readonly number[]; color: string; width?: number; height?: number }) {
  if (!values.length) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={`시간에 따른 실행 횟수: ${values.join(', ')}`}>
      <path d={`${line}L${width} ${height}L0 ${height}Z`} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

/* --- 병목 bars --------------------------------------------------------------------------------- */

export interface BarRow {
  key: string;
  label: string;
  color: string;
  value: number;
  note: string;
  hot?: boolean;
}

/** Horizontal bars from one baseline; the hot one in the accent, the rest grey; the value at the tip. */
export function Bars({ rows, unit }: { rows: readonly BarRow[]; unit: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value).filter(Number.isFinite));
  return (
    <ul className={css.bars}>
      {rows.map((r) => (
        <li key={r.key} data-hot={r.hot || undefined}>
          <span className={css.barLabel}>
            <i style={{ background: r.color }} />
            {r.label}
          </span>
          <span className={css.barTrack}>
            <span className={css.barFill} style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
            <b>
              {fmtNum(r.value, 1)} {unit}
            </b>
            {r.hot && <em>병목</em>}
          </span>
          <span className={css.barNote}>{r.note}</span>
        </li>
      ))}
    </ul>
  );
}

/* --- the twin: sim value against the robot's -------------------------------------------------- */

export function TwinPlot({ pairs, label, unit, height = 300 }: { pairs: readonly TwinPair[]; label: string; unit: string; height?: number }) {
  const [ref, w] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const pts = pairs.flatMap((p) => p.checks.filter((c) => c.label === label).map((c) => ({ p, c })));
  const all = pts.flatMap(({ c }) => [c.sim, c.robot]);
  const t = niceTicks(all.length ? Math.min(...all) : 0, all.length ? Math.max(...all) : 1, 5);
  const m = { l: 56, r: 18, t: 22, b: 42 };
  const W = Math.max(200, w);
  const H = height;
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const px = (v: number) => m.l + ((v - t.lo) / (t.hi - t.lo || 1)) * pw;
  const py = (v: number) => m.t + ph - ((v - t.lo) / (t.hi - t.lo || 1)) * ph;
  return (
    <div className={css.chart} ref={ref}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label={`${label}: 시뮬레이터 값과 실제 로봇 값, ${pts.length}쌍`}>
          {t.ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + pw} y1={py(v)} y2={py(v)} stroke={GRID} />
              <line x1={px(v)} x2={px(v)} y1={m.t} y2={m.t + ph} stroke={GRID} />
              <text x={m.l - 8} y={py(v)} dy="0.32em" textAnchor="end" className={css.tick}>
                {fmtNum(v)}
              </text>
              <text x={px(v)} y={m.t + ph + 16} textAnchor="middle" className={css.tick}>
                {fmtNum(v)}
              </text>
            </g>
          ))}
          <line x1={px(t.lo)} y1={py(t.lo)} x2={px(t.hi)} y2={py(t.hi)} stroke={AXIS} strokeWidth={1.5} />
          <text x={px(t.lo + (t.hi - t.lo) * 0.8)} y={py(t.lo + (t.hi - t.lo) * 0.8) + 18} textAnchor="middle" className={css.tick}>
            똑같으면 이 선 위
          </text>
          <text x={m.l + pw / 2} y={H - 6} textAnchor="middle" className={css.axisName}>
            시뮬레이터 ({unit}) →
          </text>
          <text x={m.l - 44} y={12} className={css.axisName}>
            ↑ 실제 로봇 ({unit})
          </text>
          {pts.map(({ p, c }, i) => {
            const cx = px(c.sim);
            const cy = py(c.robot);
            return (
              <g
                key={i}
                onPointerEnter={() =>
                  setTip({
                    x: cx,
                    y: cy,
                    body: (
                      <>
                        <b>{p.robot.who ?? '실제 로봇 실행'}</b>
                        <span>
                          시뮬 {fmtNum(c.sim)} → 실제 {withUnit(fmtNum(c.robot), unit)}
                        </span>
                        <span>
                          차이 {c.diff > 0 ? '+' : ''}
                          {withUnit(fmtNum(c.diff), unit)}
                        </span>
                        <small>{stamp(p.robot.t)}</small>
                      </>
                    ),
                  })
                }
                onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}
              >
                <circle cx={cx} cy={cy} r={9} fill="transparent" />
                <line x1={cx} y1={py(c.sim)} x2={cx} y2={cy} stroke={ACCENT} strokeOpacity={0.35} strokeWidth={1.5} />
                <circle cx={cx} cy={cy} r={4.5} fill={ACCENT} stroke="#fff" strokeWidth={1.5} />
              </g>
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} />
    </div>
  );
}
