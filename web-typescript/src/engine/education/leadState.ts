/**
 * A lesson the teacher leads on the projector (로봇 실습 7 "선생님과 함께"), kept on this PC: which lesson
 * and step the class is on, whether the robots may move (gate), whether the answer is shown (reveal) and
 * when every robot must stop (stop: a counter that only goes up). The lesson content is lead.ts.
 *
 * Plain functions, no React or DOM: ui/education/lead/useLead.ts holds it in React state;
 * tests/education/lead-check.mts checks the rules.
 */

export interface Lead {
  /** "p7-1" … "p7-7" (lead.ts). */
  lesson: string;
  /** The step the teacher has opened. */
  step: number;
  /** Robots may move (the teacher's go for the real-robot step). */
  gate: boolean;
  /** The answer is shown. */
  reveal: boolean;
  /** Each increase: stop every robot now. */
  stop: number;
  /** ms: the lead started, this step started. */
  at: number;
  since: number;
}

/** What the teacher sets. */
export type LeadSet = Pick<Lead, 'lesson' | 'step' | 'gate' | 'reveal' | 'stop'>;

/** Lessons have at most this many steps (0 … LEAD_MAX_STEP). */
export const LEAD_MAX_STEP = 20;

/** The lead after the teacher sets `l` at `now` (`old`: the lead so far, null to start one). */
export function applyLead(old: Lead | null, l: LeadSet, now: number): Lead {
  const changed = !old || old.lesson !== l.lesson || old.step !== l.step;
  return { ...l, stop: Math.max(l.stop, old?.stop ?? 0), at: old?.at ?? now, since: changed ? now : old!.since };
}
