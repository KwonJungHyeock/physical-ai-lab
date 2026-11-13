'use client';

/**
 * After a program ran in the simulator: the run as a bar with a mark for each line (block) it
 * went through — drag or play it back to see any moment again (the arm, the blocks, the pen) —
 * and, when the practice's goal was reached, a result card with [다시 보기] and [다음 과제].
 */

import { useEffect, useRef, useState } from 'react';

import type { WorldState } from '@/engine/simulator/sim';

import Icon from '../Icon';
import css from '../console.module.css';

export interface ReplayFrame {
  /** Simulated time, s. */
  t: number;
  angles: number[];
  blocks: WorldState['blocks'];
  held: WorldState['held'];
  /** Where the desk's objects were, and the one the tool carried. */
  objects: { id: string; x: number; y: number; z: number }[];
  carry: WorldState['carry'];
  gapMm: number;
  pump: boolean;
  /** How many points of the pen's strokes existed (the final strokes are cut to this). */
  trailPoints: number;
}

export interface Replay {
  frames: ReplayFrame[];
  /** When each program line (block) started, s. */
  marks: { t: number; line: number }[];
  duration: number;
  /** The pen strokes at the end of the run. */
  trail: WorldState['trail'];
}

export function snapshot(w: WorldState, t: number): ReplayFrame {
  return {
    t,
    angles: w.angles.slice(),
    blocks: w.blocks.map((b) => ({ ...b })),
    held: w.held,
    objects: w.objects.map(({ id, x, y, z }) => ({ id, x, y, z })),
    carry: w.carry,
    gapMm: w.gapMm,
    pump: w.pump,
    trailPoints: w.trail.reduce((n, s) => n + s.length, 0),
  };
}

/** Put the world back as it was at this frame. */
export function applyFrame(w: WorldState, f: ReplayFrame, trail: WorldState['trail']): void {
  w.angles = f.angles.slice();
  w.blocks = f.blocks.map((b) => ({ ...b }));
  w.held = f.held;
  // In place: the 3D objects and the physics keep their list.
  for (const p of f.objects) {
    const o = w.objects.find((k) => k.id === p.id);
    if (o) Object.assign(o, p);
  }
  w.carry = f.carry;
  w.gapMm = f.gapMm;
  w.pump = f.pump;
  let left = f.trailPoints;
  const cut: WorldState['trail'] = [];
  for (const s of trail) {
    if (left <= 0) break;
    cut.push(s.slice(0, left));
    left -= s.length;
  }
  w.trail = cut;
  w.version += 1;
}

/** The frame at time t (the last one not after it). */
function frameAt(frames: ReplayFrame[], t: number): ReplayFrame {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

interface TimelineProps {
  replay: Replay;
  /** A short name for a program line (the block's text). */
  lineLabel(line: number): string;
  /** Show this moment: the frame, and the line that was running then (-1 for none). */
  onSeek(frame: ReplayFrame, line: number): void;
  onClose(): void;
  /** Start playing at once (from the result card's [다시 보기]). */
  autoplay?: number;
  /** 입문 과정: the 절's number — the head's line then reads '5-1 · 건네기 · 102 / 102' (the 절, the card's name, how far). */
  head?: string;
}

export function RunTimeline({ replay, lineLabel, onSeek, onClose, autoplay, head }: TimelineProps) {
  const { frames, marks, duration } = replay;
  const [t, setT] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const track = useRef<HTMLDivElement>(null);
  const lineAt = (time: number) => {
    let line = -1;
    for (const m of marks) if (m.t <= time + 1e-6) line = m.line;
    return line;
  };
  const seek = (time: number) => {
    const c = Math.max(0, Math.min(duration, time));
    setT(c);
    onSeek(frameAt(frames, c), c >= duration ? -1 : lineAt(c));
  };
  const seekRef = useRef(seek);
  useEffect(() => {
    seekRef.current = seek;
  });
  // Play from where the head is (from the start when it is at the end).
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    let now = t >= duration ? 0 : t;
    const tick = (ms: number) => {
      now += ((ms - last) / 1000) * rate;
      last = ms;
      if (now >= duration) {
        seekRef.current(duration);
        setPlaying(false);
        return;
      }
      seekRef.current(now);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // t is read once when play starts; the loop keeps its own clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, duration]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- [다시 보기] starts playback from the beginning
    if (autoplay) setPlaying(true);
  }, [autoplay]);
  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    seek(((clientX - r.left) / r.width) * duration);
  };
  const pct = (x: number) => `${duration > 0 ? (x / duration) * 100 : 0}%`;
  const nowLine = lineAt(t);
  const step = marks.findIndex((m, i) => m.t <= t && (i === marks.length - 1 || marks[i + 1].t > t));
  return (
    <div className={css.timeline} role="group" aria-label="실행 다시 보기">
      <button type="button" className={css.tlPlay} onClick={() => setPlaying((p) => !p)} aria-label={playing ? '멈추기' : '다시 보기'} title={playing ? '멈추기' : '처음부터 다시 보기'}>
        <Icon name={playing ? 'stop' : 'play'} size={16} />
      </button>
      <div
        ref={track}
        className={css.tlTrack}
        role="slider"
        tabIndex={0}
        aria-label="실행 시간"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(t * 10) / 10}
        onPointerDown={(e) => {
          setPlaying(false);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons) fromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') seek(t - 0.5);
          if (e.key === 'ArrowRight') seek(t + 0.5);
        }}
      >
        <span className={css.tlLine} />
        <span className={css.tlDone} style={{ width: pct(t) }} />
        {marks.map((m, i) => (
          <span key={`${m.line}-${i}`} className={css.tlMark} data-past={m.t <= t || undefined} style={{ left: pct(m.t) }} title={`${m.line}번째 줄 · ${lineLabel(m.line)}`} />
        ))}
        <span className={css.tlHead} style={{ left: pct(t) }}>
          {head ? (
            <em>{[head, nowLine > 0 ? lineLabel(nowLine).split(' · ')[0] : '', `${step + 1} / ${marks.length}`].filter(Boolean).join(' · ')}</em>
          ) : (
            nowLine > 0 && (
              <em>
                {step + 1}/{marks.length} · {lineLabel(nowLine)}
              </em>
            )
          )}
        </span>
      </div>
      <span className={css.tlTime}>
        {t.toFixed(1)}s / {duration.toFixed(1)}s
      </span>
      <span className={css.tlRate} role="group" aria-label="다시 보기 배속">
        {[1, 2, 4].map((r) => (
          <button key={r} type="button" aria-pressed={rate === r} onClick={() => setRate(r)}>
            ×{r}
          </button>
        ))}
      </span>
      <button type="button" className={css.tlClose} onClick={onClose} aria-label="다시 보기 닫기" title="닫고 실습 환경 막대로">
        ×
      </button>
    </div>
  );
}

interface ResultProps {
  title: string;
  goal: string;
  done: number;
  total: number;
  /** Seconds the run took, when it was a program run. */
  seconds: number | null;
  onReplay?(): void;
  onNext?(): void;
  nextTitle?: string;
  onClose(): void;
}

/** The goal reached: what, how long, and where to go next. */
export function ResultCard({ title, goal, done, total, seconds, onReplay, onNext, nextTitle, onClose }: ResultProps) {
  useEffect(() => {
    const id = window.setTimeout(onClose, 15000);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <div className={css.resultCard} role="status">
      <span className={css.resultMedal} aria-hidden="true">
        <Icon name="check" size={22} />
      </span>
      <span className={css.resultText}>
        <b>목표 달성 · {title}</b>
        <small>{goal}</small>
      </span>
      {seconds !== null && (
        <span className={css.resultStat}>
          <em>{seconds.toFixed(1)}s</em>
          <small>걸린 시간</small>
        </span>
      )}
      <span className={css.resultStat}>
        <em>
          {done}/{total}
        </em>
        <small>목표</small>
      </span>
      {onReplay && (
        <button type="button" className={css.resultGhost} onClick={onReplay}>
          다시 보기
        </button>
      )}
      {onNext && (
        <button type="button" className={css.resultNext} onClick={onNext} title={nextTitle}>
          다음 과제 →
        </button>
      )}
      <button type="button" className={css.resultClose} onClick={onClose} aria-label="닫기">
        ×
      </button>
    </div>
  );
}
