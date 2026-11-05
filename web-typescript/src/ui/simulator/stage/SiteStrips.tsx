'use client';

/**
 * 공정 띠 for the 캘리그라피 부스 and the 보드게임 로봇 (입문 트랙), as the café's (CafeStrip.tsx):
 * over the scene, what the place is doing and the values the step is about, read off the run every
 * few frames — the pen's height over the paper and the strokes written (the 보정, the lifts), the
 * turn, the hand, each side's longest row and how far the last white stone stands off its point.
 * The cause and its effect are seen where they happen.
 */

import { useEffect, useState, type RefObject } from 'react';

import { phraseStrokes } from '@/engine/simulator/cell/draw';
import { G_ANSWER } from '@/engine/simulator/cell/drawRecipe';
import { longest, robotStones } from '@/engine/simulator/cell/board';
import type { WorldState } from '@/engine/simulator/sim';

import css from './cafeStrip.module.css';

/** Keep a snapshot of the world, a few times a second. */
function useSnap<T>(world: RefObject<WorldState | null>, of: (w: WorldState | null) => T | null): T | null {
  const [snap, setSnap] = useState<T | null>(() => of(world.current));
  useEffect(() => {
    const id = window.setInterval(() => setSnap(of(world.current)), 150);
    return () => window.clearInterval(id);
  }, [world, of]);
  return snap;
}

interface DrawSnap {
  phrase: string;
  strokes: number;
  done: number;
  of: number;
  card: boolean;
  hand: boolean;
  /** The pen tip over the paper, mm (null: not known yet). */
  pen: number | null;
  down: boolean;
  /** Strokes drawn on the card now (pieces of ink). */
  inked: number;
  lamp: boolean;
}

function drawSnap(w: WorldState | null): DrawSnap | null {
  const run = w?.cell;
  const d = run?.draw;
  if (!w || !run || !d) return null;
  const write = (run.mission ? G_ANSWER[run.mission] : undefined)?.cards.find((c) => c.k === 'write');
  const phrase = write?.k === 'write' ? write.phrase : null;
  return {
    phrase: phrase ?? '자유',
    strokes: phrase ? phraseStrokes(phrase).strokes.length : 0,
    done: d.done.length,
    of: d.done.length + d.orders,
    card: !!run.line.in['카드 있음'],
    hand: !!run.line.in['손 감지'],
    pen: run.lastTip ? Math.max(0, run.lastTip.z) : null,
    down: w.penDown,
    inked: w.trail.filter((s) => s.length > 1).length,
    lamp: !!run.line.out['완성 램프'],
  };
}

const DRAW_OF = (w: WorldState | null) => drawSnap(w);

export function DrawStrip({ world }: { world: RefObject<WorldState | null> }) {
  const s = useSnap(world, DRAW_OF);
  if (!s) return null;
  return (
    <div className={css.strip} aria-label="공정 띠">
      <span className={css.order}>
        <em>ORDER</em>
        <b>&apos;{s.phrase}&apos;</b>
        <small>
          손님 {s.done} / {s.of}명
        </small>
      </span>
      <ol className={css.flow}>
        <li data-state={s.hand ? 'on' : s.card ? 'done' : undefined}>
          <b>카드</b>
          <small>{s.hand ? '손님 손' : s.card ? '매트 위' : '—'}</small>
        </li>
        <li data-state={s.down ? 'on' : s.pen !== null && s.pen < 15 && !s.down ? 'short' : undefined}>
          <b>펜 끝</b>
          <small>{s.pen === null ? '—' : s.down ? '종이에 닿음' : `종이 위 ${s.pen.toFixed(1)} mm`}</small>
        </li>
        <li data-state={s.strokes && s.inked >= s.strokes ? 'done' : s.inked ? (s.down ? 'on' : 'short') : undefined}>
          <b>획</b>
          <small>
            {s.inked} / {s.strokes || '—'}
          </small>
        </li>
        <li data-state={s.lamp ? 'on' : s.done ? 'done' : undefined}>
          <b>건네기</b>
          <small>{s.lamp ? '완성 램프' : s.done ? `${s.done}장 건넴` : '—'}</small>
        </li>
      </ol>
    </div>
  );
}

interface BoardSnap {
  turn: 'person' | 'robot';
  hand: boolean;
  black: number;
  white: number;
  blackRow: number;
  whiteRow: number;
  winner: 1 | 2 | null;
  /** How far the last white stone stands off its point, mm. */
  off: number | null;
}

function boardSnap(w: WorldState | null): BoardSnap | null {
  const b = w?.cell?.board;
  const run = w?.cell;
  if (!b || !run) return null;
  const mine = robotStones(b);
  const last = mine[mine.length - 1];
  return {
    turn: b.turn,
    hand: !!run.line.in['손 감지'],
    black: b.stones.filter((k) => k.who === 1).length,
    white: mine.length,
    blackRow: longest(b.grid, 1),
    whiteRow: longest(b.grid, 2),
    winner: b.winner,
    off: last ? last.off : null,
  };
}

const BOARD_OF = (w: WorldState | null) => boardSnap(w);

export function BoardStrip({ world }: { world: RefObject<WorldState | null> }) {
  const s = useSnap(world, BOARD_OF);
  if (!s) return null;
  return (
    <div className={css.strip} aria-label="공정 띠">
      <span className={css.order}>
        <em>GAME</em>
        <b>오목 9 × 9</b>
        <small>{s.winner ? (s.winner === 2 ? '로봇(흰 돌) 승' : '사람(검은 돌) 승') : '다섯 개를 먼저 이으면 승'}</small>
      </span>
      <ol className={css.flow}>
        <li data-state={s.turn === 'robot' ? 'on' : undefined}>
          <b>차례</b>
          <small>{s.turn === 'robot' ? '로봇' : '사람'}</small>
        </li>
        <li data-state={s.hand ? 'over' : undefined}>
          <b>손 감지</b>
          <small>{s.hand ? '판 위에 손' : '없음'}</small>
        </li>
        <li data-state={s.blackRow >= 4 ? 'over' : undefined}>
          <b>사람 ●</b>
          <small>
            {s.black}개 · 줄 {s.blackRow}
          </small>
        </li>
        <li data-state={s.whiteRow >= 5 ? 'done' : undefined}>
          <b>로봇 ○</b>
          <small>
            {s.white}개 · 줄 {s.whiteRow}
          </small>
        </li>
        <li data-state={s.off === null ? undefined : s.off > 3 ? 'short' : 'done'}>
          <b>마지막 흰 돌</b>
          <small>{s.off === null ? '—' : `교차점에서 ${s.off.toFixed(1)} mm`}</small>
        </li>
      </ol>
    </div>
  );
}
