'use client';

/**
 * Header of the open practice, one line over the 3D view: its check number,
 * title and goal, and its own action (camera search, API call, ...). The run
 * steps and the goal progress are in the run bar under the view.
 */

import type { Practice } from '@/engine/simulator/practices';

import css from '../console.module.css';

interface Props {
  practice: Practice;
  /** Label in front: the check number in check mode, the topic otherwise. */
  tag: string;
  /** Check mode (delivery demonstration): the tag is the accent badge. */
  check: boolean;
  action?: { label: string; run(): void; disabled?: boolean };
  busy: boolean;
  onReload(): void;
  /** A tool this practice needs that is not on yet: what it is, and fitting it. */
  need?: { text: string; fit(): void };
}

export default function MissionCard({ practice, tag, check, action, busy, onReload, need }: Props) {
  return (
    <section className={css.missionCard} aria-label="실습 목표" data-panel="mission">
      <div className={css.missionMain}>
        <span className={check ? css.missionTag : `${css.missionTag} ${css.missionTagTopic}`}>{tag}</span>
        <div className={css.missionText}>
          <h2>{practice.title}</h2>
          <p title={practice.goal}>{practice.goal}</p>
        </div>
      </div>
      <div className={css.missionActions}>
        {action && (
          <button type="button" className={css.btnAction} disabled={busy || action.disabled} onClick={action.run}>
            {action.label}
          </button>
        )}
        <button type="button" className={css.ghost} disabled={busy} onClick={onReload} title="편집기의 프로그램을 이 실습의 처음 예제로 되돌려요 (고친 내용은 사라져요)">
          예제 코드 처음으로
        </button>
      </div>
      {need && (
        <p className={css.missionNeed} role="status">
          <span>
            이 실습은 <b>{need.text}</b>이(가) 있어야 해요
          </span>
          <button type="button" disabled={busy} onClick={need.fit}>
            끼우기
          </button>
        </p>
      )}
    </section>
  );
}
