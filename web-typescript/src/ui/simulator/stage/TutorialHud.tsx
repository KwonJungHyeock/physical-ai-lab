'use client';

/**
 * 입문 튜토리얼 on the 3D view (engine/simulator/lifeTutorials.ts): the quest card where the 실습
 * 셀's mission card stands — the three steps, the one to do now with [열기] for its panel, ticks as
 * the arm shows each one done, then the idea (개념) and the way on.
 */

import { lifeTutorialById } from '@/engine/simulator/lifeTutorials';

import css from './cellHud.module.css';

const PANEL_NAME = { jog: '제어', pose: '자세', process: '공정 짜기' } as const;

interface Props {
  id: string;
  /** The step being done (steps.length: all done). */
  step: number;
  /** The tutorial's place in the list (1-based) and how many there are. */
  n: number;
  of: number;
  onOpen(panel: 'jog' | 'pose' | 'process'): void;
  onNext(): void;
  onClose(): void;
}

export default function TutorialHud(p: Props) {
  const t = lifeTutorialById(p.id);
  if (!t) return null;
  const cur = t.steps[p.step];
  const over = p.step >= t.steps.length;
  return (
    <div className={css.hud} aria-label="튜토리얼">
      <section className={css.card}>
        <header>
          <b>
            튜토리얼 {p.n} · {t.title}
          </b>
          <span>
            {Math.min(p.step + 1, t.steps.length)}/{t.steps.length}
          </span>
        </header>
        <h5 className={css.ghead} data-kind="goal">
          <em>STEPS</em> 단계
        </h5>
        <ul className={css.checks}>
          {t.steps.map((s, k) => (
            <li key={s.title} data-ok={k < p.step || undefined} data-cur={k === p.step || undefined}>
              <i aria-hidden="true">{k < p.step ? '✓' : k + 1}</i>
              <span>{s.title}</span>
            </li>
          ))}
        </ul>
        {cur && (
          <div className={css.gsec} data-kind="now" aria-label="지금 할 일">
            <h5>
              <em>NOW</em> 지금 할 일
            </h5>
            <p className={css.gdef}>{cur.text}</p>
            <button type="button" className={css.go} onClick={() => p.onOpen(cur.panel)}>
              {PANEL_NAME[cur.panel]} 열기
            </button>
          </div>
        )}
        {over && (
          <>
            <p className={css.result} data-ok>
              완료! 세 단계를 모두 해냈어요.
            </p>
            <div className={css.gsec} data-kind="concept" aria-label="개념">
              <h5>
                <em>CONCEPT</em> 개념
              </h5>
              <p className={css.gterm}>{t.concept.term}</p>
              <p className={css.gdef}>{t.concept.def}</p>
            </div>
          </>
        )}
        <div className={css.row}>
          {over && p.n < p.of && (
            <button type="button" className={css.link} onClick={p.onNext}>
              다음 튜토리얼
            </button>
          )}
          <button type="button" className={css.link} onClick={p.onClose}>
            {over ? '닫기' : '그만하기'}
          </button>
        </div>
      </section>
    </div>
  );
}
