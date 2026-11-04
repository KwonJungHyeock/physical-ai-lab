'use client';

/**
 * 테마학습 (입문 트랙 ① 생활 로봇): what to learn with, in the side panel. 실생활 협동로봇 — the
 * places where cobots work in everyday life (the café, the calligraphy booth; the board-game robot
 * is coming), each a ladder of six steps — and three 튜토리얼 on the controls every step uses.
 * Picking a place opens it in the 3D view with its 작업 순서 cards; picking a tutorial leaves the
 * place for the desk and starts the quest card over the 3D view.
 */

import { CELL_BY_ID, type CellId } from '@/engine/simulator/cell/cells';
import { missionsOf } from '@/engine/simulator/cell/missions';
import { LIFE_TUTORIALS } from '@/engine/simulator/lifeTutorials';

import css from './theme.module.css';

/** The places, in the order they are taught, with what the robot does there. */
const SITES: { id: CellId; flow: string }[] = [
  { id: 'cafe', flow: '컵 → 얼음 → 샷 → 물 → 픽업' },
  { id: 'draw', flow: '카드 받기 → 글씨 쓰기 → 완성 알리기' },
];

interface Props {
  /** The place open now (null: the desk). */
  cell: CellId | null;
  /** Steps passed, by id. */
  passed: Readonly<Record<string, boolean>>;
  /** The tutorial running, and the ones finished. */
  tutorial: string | null;
  tutorialsDone: Readonly<Record<string, boolean>>;
  busy: boolean;
  onSite(id: CellId): void;
  onTutorial(id: string): void;
}

export default function ThemePanel(p: Props) {
  return (
    <div className={css.theme}>
      <section>
        <h4>
          실생활 협동로봇 <em>현장마다 6단계</em>
        </h4>
        <div className={css.sites}>
          {SITES.map((s) => {
            const steps = missionsOf(s.id);
            const done = steps.filter((m) => p.passed[m.id]).length;
            const info = CELL_BY_ID[s.id];
            return (
              <button key={s.id} type="button" className={css.site} aria-pressed={p.cell === s.id} disabled={p.busy} onClick={() => p.onSite(s.id)}>
                <i>{info.letter}</i>
                <b>{info.name}</b>
                <small>{s.flow}</small>
                <span className={css.bar} aria-label={`${done} / ${steps.length}단계 통과`}>
                  <span style={{ width: `${(100 * done) / steps.length}%` }} />
                </span>
                <em>
                  {done} / {steps.length}단계
                </em>
              </button>
            );
          })}
          <div className={css.site} data-soon>
            <i>H</i>
            <b>보드게임 로봇</b>
            <small>사람과 오목 두기 · 격자 좌표 · 차례 기다리기</small>
            <em className={css.soon}>준비 중</em>
          </div>
        </div>
      </section>
      <section>
        <h4>
          튜토리얼 <em>조작 익히기</em>
        </h4>
        <ol className={css.tuts}>
          {LIFE_TUTORIALS.map((t, k) => (
            <li key={t.id}>
              <button type="button" aria-pressed={p.tutorial === t.id} disabled={p.busy} onClick={() => p.onTutorial(t.id)}>
                <i data-done={p.tutorialsDone[t.id] || undefined}>{p.tutorialsDone[t.id] ? '✓' : k + 1}</i>
                <span>
                  <b>{t.title}</b>
                  <small>{t.note}</small>
                </span>
                <em>{t.steps.length}단계</em>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
