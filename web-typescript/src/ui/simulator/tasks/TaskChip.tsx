'use client';

/**
 * The open task in the top bar, with the language (tab) it is done in — a task belongs to a
 * language, so it stays put while the 수동 제어 tab is open. A click on it opens the 라이브러리 to
 * pick another; beside it, its goal as it is reached (live, whichever panel tab is open: the first
 * task is done with direct control), and in the check demonstration the seven check numbers, one
 * click each.
 */

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';

import type { Theme } from '@/engine/simulator/board';
import { CATEGORIES, CHECKS, categoryOf, checkState, markKey, openCheck, type ConsoleMode, type Mark, type Progress, type Where } from '@/engine/simulator/modules';
import type { Level, Practice, PracticeId, Session } from '@/engine/simulator/practices';
import type { WorldState } from '@/engine/simulator/sim';

import Icon from '../Icon';
import TaskIcon from './TaskIcon';
import css from '../console.module.css';

export const LEVEL_TAB: Record<Level, { name: string; sub: string }> = {
  basic: { name: '블록 코딩', sub: '초급' },
  python: { name: 'Python', sub: '중급' },
  ros: { name: 'ROS 2', sub: '고급' },
};
const catOf = (id: PracticeId) => CATEGORIES.find((c) => c.ids.includes(id))?.id ?? 'free';

/** The goal of the open task as it is reached; calls onGoal once each time it is reached. */
function GoalProgress({ practice, world, session, mark, paused, onGoal }: { practice: Practice; world: RefObject<WorldState>; session: RefObject<Session>; mark?: Mark; paused?: boolean; onGoal(): void }) {
  const [m, setM] = useState(() => practice.progress(world.current, session.current));
  const goal = useEffectEvent(onGoal);
  // A ▶ 데모 playing is not the student's work: the goal stands still meanwhile.
  const still = useEffectEvent(() => !!paused);
  // Kept across the effect's re-runs (the practice object is new on every render of the console):
  // the goal is reported once each time it is reached, not on every render after.
  const reached = useRef(false);
  useEffect(() => {
    const tick = () => {
      if (still()) return;
      const next = practice.progress(world.current, session.current);
      setM((prev) => (prev.done === next.done && prev.title === next.title && prev.total === next.total ? prev : next));
      const done = next.total > 0 && next.done >= next.total;
      if (done && !reached.current) goal();
      reached.current = done;
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [world, practice, session]);
  const total = m.total || 0;
  const done = total > 0 && m.done >= total;
  const pct = total ? Math.min(100, (m.done / total) * 100) : 0;
  const unit = total === 200 ? 'mm' : '';
  return (
    <span className={css.goal} data-done={done || undefined} title={`목표: ${m.title}${mark?.robot ? ' · 실제 로봇에서도 했어요' : mark?.sim ? ' · 시뮬레이션에서 했어요' : ''}`}>
      <span className={css.goalText}>
        {done ? (
          <>
            <Icon name="check" size={13} /> 목표 달성
          </>
        ) : total ? (
          `${m.done}/${total}${unit}`
        ) : (
          '목표'
        )}
        {mark?.robot && <i className={css.goalRobot}>로봇 ✓</i>}
      </span>
      <span className={css.goalTrack}>
        <span style={{ width: `${done ? 100 : pct}%` }} />
      </span>
    </span>
  );
}

interface ChipProps {
  mode: ConsoleMode;
  practice: Practice;
  level: Level;
  theme: Theme;
  progress: Progress;
  busy: boolean;
  world: RefObject<WorldState>;
  session: RefObject<Session>;
  /** A ▶ 데모 is playing: the goal does not move. */
  demo?: boolean;
  onGoal(): void;
  onOpen(where: Where): void;
  onGallery(): void;
}

export function TaskChip({ mode, practice, level, theme, progress, busy, world, session, demo, onGoal, onOpen, onGallery }: ChipProps) {
  const here: Where = { level, theme, id: practice.id };
  return (
    <div className={css.taskChip} data-mode={mode}>
      <button
        type="button"
        className={css.taskPick}
        data-cat={mode === 'check' && practice.check ? 'check' : catOf(practice.id)}
        disabled={busy}
        onClick={onGallery}
        title={`${LEVEL_TAB[level].name} 과제 · ${categoryOf(practice.id)} — 누르면 라이브러리에서 다른 과제 고르기`}
        aria-label={`${LEVEL_TAB[level].name} 과제: ${practice.title} — 라이브러리 열기`}
      >
        <span className={css.taskGlyph}>
          <TaskIcon id={practice.id} size={20} />
        </span>
        <span className={css.taskTag} data-check={mode === 'check' && practice.check ? true : undefined}>
          {mode === 'check' && practice.check ? `검수 ${practice.check}` : LEVEL_TAB[level].name}
        </span>
        <b className={css.taskTitle}>{practice.title}</b>
      </button>
      <GoalProgress key={markKey(here)} practice={practice} world={world} session={session} mark={progress[markKey(here)]} paused={demo} onGoal={onGoal} />
      {mode === 'check' && (
        <span className={css.checkChips} role="group" aria-label="검수 항목">
          {CHECKS.map((c) => {
            const state = checkState(progress, c.check);
            return (
              <button
                key={c.check}
                type="button"
                className={state === 2 ? css.chipRobot : state === 1 ? css.chipSim : undefined}
                aria-current={practice.check === c.check ? 'true' : undefined}
                disabled={busy}
                title={`검수 ${c.check} · ${c.title} — ${c.spec}`}
                onClick={() => {
                  const w = openCheck(c.check, level, theme);
                  if (w) onOpen(w);
                }}
              >
                {c.check}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}
