'use client';

/**
 * ③'s timeline: where each box is along the belt (y) over time, and where the cup is — the cup's
 * line is thick while it is down at box height, so "too early" (down before the box comes) and
 * "too late" (down after it has gone) read at a glance. The sensor line and the wait point are
 * dashed; 흡착 is a green dot, 빗나감 a red cross, a collision a red ring.
 */

import { BOX_A, BELT, boxTop } from '@/engine/education/lab/cell';
import { FRAME_STEP_S, type LabRun } from '@/engine/education/lab/run';

import css from './lab.module.css';

interface Props {
  run: LabRun;
  title: string;
  waitY: number;
  sensorY: number;
  /** Playback time, s (a cursor), or null. */
  cursor?: number | null;
  /** Shared time axis end, s (so two charts compare). */
  maxT: number;
}

const W = 360;
const H = 104;
const PAD = { l: 34, r: 6, t: 8, b: 16 };
const Y0 = -160;
const Y1 = 330;
const BOX_COLORS = ['#b07a3c', '#8a6a3f', '#c49254'];

export default function Timeline({ run, title, waitY, sensorY, cursor, maxT }: Props) {
  const x = (t: number) => PAD.l + (t / maxT) * (W - PAD.l - PAD.r);
  const y = (mm: number) => PAD.t + ((Y1 - Math.min(Y1, Math.max(Y0, mm))) / (Y1 - Y0)) * (H - PAD.t - PAD.b);
  const step = Math.max(1, Math.round(0.06 / FRAME_STEP_S));
  const boxLines = run.boxes.map((_, k) => {
    const pts: string[] = [];
    run.frames.forEach((f, i) => {
      const b = f.boxes[k];
      if (i % step || b.mode === 'wait' || b.mode === 'binned' || b.mode === 'placed') return;
      pts.push(`${x(f.t).toFixed(1)},${y(b.y).toFixed(1)}`);
    });
    return pts.join(' ');
  });
  // The cup: thin while up, thick while down at box height (its line split into runs).
  const low = boxTop(BOX_A) + 12;
  const segs: { d: string; down: boolean }[] = [];
  run.frames.forEach((f, i) => {
    if (i % step && i !== run.frames.length - 1) return;
    const tip = run.tip[i];
    const down = tip[2] < low && Math.abs(tip[0] - BELT.x) < 60;
    const p = `${x(f.t).toFixed(1)},${y(tip[1]).toFixed(1)}`;
    const last = segs[segs.length - 1];
    if (!last || last.down !== down) segs.push({ d: last ? `${last.d.split(' ').at(-1)} ${p}` : p, down });
    else last.d += ` ${p}`;
  });
  const marks = run.events.filter((e) => e.kind === 'grip' || e.kind === 'miss' || e.kind === 'hit');
  const ticks = Array.from({ length: Math.floor(maxT / 2) + 1 }, (_, i) => i * 2);
  return (
    <figure className={css.chart}>
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: 상자와 흡착 컵의 위치(벨트 방향)를 시간에 따라 그린 그래프`}>
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="#f8fafc" stroke="#e4e7ec" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} stroke="#eef1f5" />
            <text x={x(t)} y={H - 4} textAnchor="middle" className={css.axis}>
              {t}s
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(sensorY)} y2={y(sensorY)} stroke="#e5484d" strokeDasharray="3 3" />
        <text x={PAD.l - 3} y={y(sensorY) + 3} textAnchor="end" className={css.axis}>
          센서
        </text>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(waitY)} y2={y(waitY)} stroke="#3454d1" strokeDasharray="3 3" />
        <text x={PAD.l - 3} y={y(waitY) + 3} textAnchor="end" className={css.axis}>
          대기
        </text>
        {boxLines.map((d, k) => (d ? <polyline key={k} points={d} fill="none" stroke={BOX_COLORS[k % 3]} strokeWidth={6} strokeOpacity={0.28} strokeLinecap="round" /> : null))}
        {segs.map((s, i) => (
          <polyline key={i} points={s.d} fill="none" stroke="#f59e0b" strokeWidth={s.down ? 3.2 : 1.4} strokeLinejoin="round" />
        ))}
        {marks.map((e, i) => {
          const cx = x(e.t);
          const cy = y(e.at?.[1] ?? waitY);
          if (e.kind === 'grip') return <circle key={i} cx={cx} cy={cy} r={4} fill="#1f9d55" stroke="#fff" />;
          if (e.kind === 'hit') return <circle key={i} cx={cx} cy={cy} r={5} fill="none" stroke="#e5484d" strokeWidth={2} />;
          return <path key={i} d={`M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx + 4},${cy - 4}L${cx - 4},${cy + 4}`} stroke="#e5484d" strokeWidth={2} />;
        })}
        {cursor != null && cursor <= run.durationS && <line x1={x(cursor)} x2={x(cursor)} y1={PAD.t} y2={H - PAD.b} stroke="#101828" strokeWidth={1} strokeOpacity={0.5} />}
      </svg>
    </figure>
  );
}
