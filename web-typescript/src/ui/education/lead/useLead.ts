'use client';

/**
 * A lesson the teacher leads on the projector (engine/education/leadState.ts), held in React: start it,
 * then the step, robots allowed, answer shown, stop all robots, end.
 */

import { useCallback, useState } from 'react';

import { applyLead, type Lead, type LeadSet } from '@/engine/education/leadState';

export interface HostState {
  /** The lesson going on (null: none). */
  lead: Lead | null;
  start(first: LeadSet): void;
  set(patch: Partial<LeadSet>): void;
  end(): void;
}

export function useLeadHost(): HostState {
  const [lead, setLead] = useState<Lead | null>(null);
  const start = useCallback((first: LeadSet) => setLead(applyLead(null, first, Date.now())), []);
  const set = useCallback((patch: Partial<LeadSet>) => {
    setLead((cur) => (cur ? applyLead(cur, { lesson: cur.lesson, step: cur.step, gate: cur.gate, reveal: cur.reveal, stop: cur.stop, ...patch }, Date.now()) : cur));
  }, []);
  const end = useCallback(() => setLead(null), []);
  return { lead, start, set, end };
}
