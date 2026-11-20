'use client';

/**
 * 입문 3-5 자세 미션 (QA 수정 지시서 B1): how near each joint is to the see-through robot's pose — J1 … J6 in one row, how
 * many degrees it still is off (measured, the arm's own angle against the goal), and ✓ once within the mission's
 * tolerance. It follows the arm as it moves.
 */

import { useLive, type Live } from '../liveStore';
import { jointLabels } from '../control/jointInfo';
import css from './courseStep.module.css';

export default function PoseCheck({ live, goal, tol }: { live: Live; goal: readonly number[]; tol: number }) {
  const angles = useLive(live, (v) => v.angles);
  const names = jointLabels();
  return (
    <div className={css.poseCheck} role="group" aria-label="목표 자세까지 관절별 차이" data-pose-check>
      {goal.map((g, i) => {
        const off = Math.abs((angles[i] ?? 0) - g);
        const ok = off <= tol;
        return (
          <span key={i} data-ok={ok || undefined} title={`${names[i].name} J${i + 1}`} aria-label={`${names[i].name} J${i + 1}: ${ok ? '맞음' : `${Math.round(off)}° 차이`}`}>
            <b>J{i + 1}</b>
            <output>{ok ? '✓' : `${Math.round(off)}°`}</output>
          </span>
        );
      })}
    </div>
  );
}
