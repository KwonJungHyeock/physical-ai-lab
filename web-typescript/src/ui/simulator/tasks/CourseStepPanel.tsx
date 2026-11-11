'use client';

/**
 * 입문 과정 절의 조작판 (장별 가이드라인 v1): only the keys a 절 asks for, each marked with its
 * `data-step` (the '지금 할 일' rings the one to press now). 1-1: ▶ 시뮬레이션 · 손 다가가기 · 손 치우기.
 * 1-3: 작업 범위 보기 · ▶ 시뮬레이션 (정지 is the 정지 key below, as everywhere).
 */

import type { CourseStepId } from '@/engine/simulator/cell/courseSteps';

import { AssetSlot, type CourseSlot } from '../stage/CourseMarks';

import css from './courseStep.module.css';

interface Props {
  id: CourseStepId;
  busy: boolean;
  onRun(): void;
  /** 1-1. */
  hand?: { near: boolean; onIn(): void; onOut(): void };
  /** 1-3. */
  range?: { on: boolean; onToggle(): void };
}

export default function CourseStepPanel({ id, busy, onRun, hand, range }: Props) {
  return (
    <div className={css.panel} role="group" aria-label={`${id} 조작`}>
      {range && (
        <label className={css.switch} data-step="range">
          <input type="checkbox" checked={range.on} onChange={range.onToggle} />
          <i aria-hidden="true" />
          작업 범위 보기
        </label>
      )}
      <button type="button" className={css.run} data-step="run" disabled={busy} onClick={onRun}>
        ▶ 시뮬레이션
      </button>
      {hand && (
        <div className={css.pair}>
          <button type="button" data-step="hand-in" data-on={hand.near || undefined} onClick={hand.onIn}>
            손 다가가기
          </button>
          <button type="button" data-step="hand-out" onClick={hand.onOut}>
            손 치우기
          </button>
        </div>
      )}
    </div>
  );
}

/** An asset slot over the scene's corner (one that would be hidden by the camera close up, as 1-1's hand). */
export function SceneSlot({ slot }: { slot: CourseSlot }) {
  return (
    <div className={css.sceneSlot}>
      <AssetSlot slot={slot} />
    </div>
  );
}
