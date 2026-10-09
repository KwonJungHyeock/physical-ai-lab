'use client';

/**
 * The open task in the top bar, and the task gallery it opens.
 *
 * The chip shows the task with the language (tab) it is done in — a task belongs to a language,
 * so it stays put while the 수동 제어 tab is open — (a click on it opens the 라이브러리 to pick another),
 * its goal as it is reached (live, whichever panel tab is open: the first task
 * is done with direct control), and in the check demonstration the seven check
 * numbers, one click each. The gallery is a
 * window of cards: classes by topic or the seven checks, for any language
 * and work table.
 */

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';

import { THEMES, type Theme } from '@/engine/simulator/board';
import { CATEGORIES, CHECKS, categoryOf, checkState, levelsWithCheck, markKey, openCheck, type ConsoleMode, type Mark, type Progress, type Where } from '@/engine/simulator/modules';
import { LEVELS, practicesFor, type Level, type Practice, type PracticeId, type Session } from '@/engine/simulator/practices';
import type { WorldState } from '@/engine/simulator/sim';

import Icon from '../Icon';
import TaskIcon, { CHECK_ICON } from './TaskIcon';
import css from '../console.module.css';

export const LEVEL_TAB: Record<Level, { name: string; sub: string }> = {
  basic: { name: '블록 코딩', sub: '초급' },
  python: { name: 'Python', sub: '중급' },
  ros: { name: 'ROS 2', sub: '고급' },
};
const THEME_NOTE: Record<Theme, string> = {
  kit: '카메라·분류함',
  arm: '책상 위 매트',
};
const STATE_LABEL = ['아직', '시뮬레이션 완료', '실제 로봇 완료'];
const catOf = (id: PracticeId) => CATEGORIES.find((c) => c.ids.includes(id))?.id ?? 'free';

/** A card's picture band: the task's icon on a tile, its topic (or check number) beside it. */
function CardArt({ icon, label, big }: { icon: string; label: string; big?: string }) {
  return (
    <span className={css.taskArt}>
      <span className={css.taskArtTile}>
        <TaskIcon id={icon} size={34} />
      </span>
      {big ? <b className={css.taskArtNo}>{big}</b> : <span className={css.taskArtLabel}>{label}</span>}
    </span>
  );
}

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

interface GalleryProps {
  mode: ConsoleMode;
  onMode(mode: ConsoleMode): void;
  level: Level;
  theme: Theme;
  practiceId: PracticeId;
  progress: Progress;
  onOpen(where: Where): void;
  onClose(): void;
  /** Inside the 라이브러리 page: no window or header, just the filters and the cards. */
  embedded?: boolean;
}

/** The task gallery: a window of cards over the console, or (embedded) the cards on the library page. */
export function TaskGallery({ mode, onMode, level, theme, practiceId, progress, onOpen, onClose, embedded }: GalleryProps) {
  const [lv, setLv] = useState(level);
  const [th, setTh] = useState(theme);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[aria-current=true], button')?.focus();
  }, [mode]);
  const open = (w: Where) => {
    onOpen(w);
    onClose();
  };
  const list = practicesFor(lv, th);
  const done = CHECKS.filter((c) => checkState(progress, c.check) > 0).length;
  const body = (
    <>
      {!embedded && (
        <header className={css.galleryHead}>
          <span className={css.connectIcon}>
            <Icon name="gallery" size={20} />
          </span>
          <div>
            <h1>과제 고르기</h1>
            <p>{mode === 'check' ? `납품 검수 7종을 하나씩 열어 시연해요 · ${done}/7 완료` : '주제별 실습이에요. 고르면 그 언어 탭이 열려요.'}</p>
          </div>
          <span className={css.gallerySeg} role="tablist" aria-label="사용 방식">
            <button type="button" role="tab" aria-selected={mode === 'learn'} onClick={() => onMode('learn')}>
              실습
            </button>
            <button type="button" role="tab" aria-selected={mode === 'check'} onClick={() => onMode('check')}>
              검수 시연
            </button>
          </span>
          <button type="button" className={css.pickerClose} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
      )}

      <div className={css.galleryFilters}>
        <span className={css.galleryFilter} role="group" aria-label="언어">
          <small>언어</small>
          {LEVELS.map((l) => (
            <button key={l.id} type="button" aria-pressed={lv === l.id} onClick={() => setLv(l.id)}>
              {LEVEL_TAB[l.id].name}
              <i>{LEVEL_TAB[l.id].sub}</i>
            </button>
          ))}
        </span>
        <span className={css.galleryFilter} role="group" aria-label="실습 환경">
          <small>환경</small>
          {THEMES.map((t) => (
            <button key={t.id} type="button" aria-pressed={th === t.id} onClick={() => setTh(t.id)}>
              {t.name}
              <i>{THEME_NOTE[t.id]}</i>
            </button>
          ))}
        </span>
      </div>

      <div className={css.galleryBody}>
        {mode === 'learn' ? (
          CATEGORIES.map((cat) => {
            const items = list.filter((p) => cat.ids.includes(p.id));
            if (!items.length) return null;
            return (
              <section key={cat.id} className={css.galleryGroup} aria-label={cat.name}>
                <h2>{cat.name}</h2>
                <div className={css.galleryGrid}>
                  {items.map((p) => {
                    const m = progress[markKey({ level: lv, theme: th, id: p.id })];
                    const now = p.id === practiceId && lv === level && th === theme;
                    return (
                      <button key={p.id} type="button" className={css.taskCard} data-cat={cat.id} aria-current={now ? 'true' : undefined} onClick={() => open({ level: lv, theme: th, id: p.id })}>
                        <CardArt icon={p.id} label={cat.name} />
                        <span className={css.taskCardBody}>
                          <span className={css.taskCardTop}>
                            <b>{p.title}</b>
                            <i className={m?.robot ? css.stateRobot : m?.sim ? css.stateSim : undefined} title={STATE_LABEL[m?.robot ? 2 : m?.sim ? 1 : 0]} />
                          </span>
                          <small>{p.goal}</small>
                          {now && <em>지금 과제</em>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <div className={`${css.galleryGrid} ${css.galleryChecks}`}>
            {CHECKS.map((c) => {
              const state = checkState(progress, c.check);
              const levels = levelsWithCheck(c.check);
              const now = list.find((p) => p.id === practiceId)?.check === c.check && lv === level && th === theme;
              return (
                <button
                  key={c.check}
                  type="button"
                  className={css.taskCard}
                  data-cat="check"
                  aria-current={now ? 'true' : undefined}
                  onClick={() => {
                    const w = openCheck(c.check, lv, th);
                    if (w) open(w);
                  }}
                >
                  <CardArt icon={CHECK_ICON[c.check]} label="" big={`검수 ${c.check}`} />
                  <span className={css.taskCardBody}>
                    <span className={css.taskCardTop}>
                      <b>{c.title}</b>
                      <i className={state === 2 ? css.stateRobot : state === 1 ? css.stateSim : undefined} title={STATE_LABEL[state]} />
                    </span>
                    <small>{c.spec}</small>
                    <span className={css.taskLevels} aria-label="할 수 있는 언어">
                      {LEVELS.filter((l) => levels.some((x) => x.level === l.id)).map((l) => (
                        <i key={l.id} data-now={l.id === lv || undefined}>
                          {LEVEL_TAB[l.id].name}
                        </i>
                      ))}
                    </span>
                    {now && <em>지금 과제</em>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
  if (embedded)
    return (
      <div className={css.libGallery} ref={box}>
        {body}
      </div>
    );
  return (
    <div
      className={css.picker}
      role="dialog"
      aria-modal="true"
      aria-label="과제 고르기"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`${css.pickerBox} ${css.galleryBox}`} ref={box}>
        {body}
      </div>
    </div>
  );
}
