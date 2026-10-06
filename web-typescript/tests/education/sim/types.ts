/**
 * Scenarios for the browser check of the 교육 tab (tools/check/learn-sim.mjs): for
 * each topic, what to press in its 실습 제어판 for tries A · B · C — the same
 * as the 원고's 할 일 — and what the result chips must then say, the numbers
 * its 볼 것 promises. This is how the simulator and the theory are kept in
 * agreement: change one, and the check names the step that no longer matches.
 */

import type { StepKey, TopicId } from '../../../src/engine/education/catalog';

export type Action =
  /** A button in the 실습 제어판, by its accessible name (text or aria-label). Exact match unless it starts with "~". */
  | { click: string }
  /** A slider (input type=range) in the panel, by its aria-label. */
  | { slider: string; value: number }
  /** A <select> in the panel, by its aria-label; value = the option's text. */
  | { select: string; option: string }
  /** A checkbox / toggle in the panel, by its aria-label or label text. */
  | { check: string; on: boolean }
  /** A click on the 3D table at this point (mm, robot base frame), for tries that say "책상을 클릭". */
  | { pick: [number, number, number] }
  /** Pause (ms) — only for a motion that must finish before the next press. */
  | { wait: number };

export interface SimStep {
  do: Action[];
  /**
   * Result chips after the try: chip name → what its value must contain, or a
   * regular expression written "/…/". Use the numbers of the 볼 것.
   */
  expect: Record<string, string>;
  /** Longest wait for the result after the last action, ms (default 30 000). */
  timeout?: number;
}

export type TopicScenario = { topic: TopicId; note?: string } & Record<StepKey, SimStep>;
