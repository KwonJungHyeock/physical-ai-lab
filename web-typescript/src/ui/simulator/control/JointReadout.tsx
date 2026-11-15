'use client';

/**
 * 입문 2-2 (동결 뒤 고침 v6 파트 3): the six joints' names and angles as the 조작판 shows them (3장), read only —
 * no −5° · +5° keys, no dragging. The angles follow the arm as it moves (영점 자세: six rows at 0.0°).
 */

import { jointMax, jointMin } from '@/engine/robot/limits';

import { useLive, type Live } from '../liveStore';
import { jointLabels } from './jointInfo';
import css from './jog.module.css';

/** The angle as the 조작판 writes it ('+45.0', '−30.0'); 0 (within 0.05°) as '0.0'. */
const angleText = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);

export default function JointReadout({ live, dof = 6 }: { live: Live; dof?: number }) {
  const angles = useLive(live, (v) => v.angles);
  const names = jointLabels();
  const lo = jointMin();
  const hi = jointMax();
  return (
    <div className={css.rows} role="group" aria-label="관절 각도 (읽기만)" data-readout>
      {angles.slice(0, dof).map((a, i) => {
        const pos = ((a - lo[i]) / (hi[i] - lo[i])) * 100;
        const zero = ((0 - lo[i]) / (hi[i] - lo[i])) * 100;
        return (
          <div key={i} className={css.row} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div className={css.mid} style={{ cursor: 'default' }}>
              <span className={css.head}>
                <b>{names[i].name}</b>
                <em>J{i + 1}</em>
                <output aria-label={`${names[i].name} J${i + 1} 각도`}>{angleText(a)}°</output>
              </span>
              <span className={css.bar} aria-hidden="true">
                <span className={css.track}>
                  <span className={css.fill} style={{ left: `${Math.min(pos, zero)}%`, width: `${Math.abs(pos - zero)}%` }} />
                  <span className={css.zero} style={{ left: `${zero}%` }} />
                  <span className={css.knob} style={{ left: `${pos}%` }} />
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
