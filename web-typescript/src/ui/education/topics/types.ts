import type { StepKey, TopicId } from '@/engine/education/catalog';

import type { UnitProps } from '../lessons';

/** Which part of a topic is open: one of the three tries, or the comparison. */
export type StepView = StepKey | 'cmp';

/** One row of the comparison table: label → value as shown ("1.20 s", "떨어짐"). */
export type ResultRow = Record<string, string>;

export interface TopicProps extends UnitProps {
  id: TopicId;
  step: StepView;
  /** Open another step (e.g. a button that says "B 로 해 보기"). */
  goStep(step: StepView): void;
  /** Keep this try's result for the comparison table. */
  record(step: StepKey, row: ResultRow): void;
  results: Partial<Record<StepKey, ResultRow>>;
}
