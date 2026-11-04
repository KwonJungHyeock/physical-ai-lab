/**
 * The row of five ticks that stands for the five 학습 분야 (engine/simulator/lifeFields.ts): the
 * intro's scene ticks, one per field in a fixed order, lit where that field is taught. The same
 * row on the 학습 로드맵's plate, its pictures and the 테마학습 panel, so a place reads at a glance.
 */

import { FIELD_KEYS, type Field } from '@/engine/simulator/lifeFields';

import css from './fieldTicks.module.css';

interface Props {
  on(f: Field): boolean;
  /** The field pointed at (it glows harder where lit). */
  hot?: Field | null;
  className?: string;
}

export default function FieldTicks({ on, hot = null, className }: Props) {
  return (
    <span className={className ? `${css.ticks} ${className}` : css.ticks} aria-hidden="true">
      {FIELD_KEYS.map((f) => (
        <i key={f} data-on={on(f) || undefined} data-hot={(hot === f && on(f)) || undefined} />
      ))}
    </span>
  );
}
