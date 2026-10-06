/**
 * A topic's picture: its 1600 × 900 figure (fig/), whole or with one try's
 * panel outlined. Every topic has one (npm run check:learn).
 * Server-safe (no hooks): also used by the printed theory sheets.
 */

import type { TopicId } from '@/engine/education/catalog';

import { Figure, hasStep } from '../fig/Figure';
import { FIGURES } from '../fig';

export function TopicArt({
  id,
  focus,
  animate,
  replay,
  className,
}: {
  id: TopicId;
  /** Outline this try's panel and dim the others. */
  focus?: 'A' | 'B' | 'C';
  animate?: boolean;
  replay?: number;
  className?: string;
}) {
  const def = FIGURES[id];
  if (!def) return null;
  return <Figure def={def} focus={focus && hasStep(def, focus) ? focus : undefined} animate={animate} replay={replay} className={className} />;
}

/** Whether the topic has a drawing for this try (the 실습 page shows it). */
export const hasStepArt = (id: TopicId, step: 'A' | 'B' | 'C') => !!FIGURES[id] && hasStep(FIGURES[id], step);
