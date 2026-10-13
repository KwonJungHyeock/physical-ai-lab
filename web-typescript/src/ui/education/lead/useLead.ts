'use client';

/**
 * The two ends of a lesson the teacher leads (engine/account/lead.ts), held in React:
 *  - useLeadHost: the teacher's screen. Reads the lead and the students' marks every 1.5 s and sets it
 *    (step, robots allowed, answer shown, stop all robots, end).
 *  - useStudentLead: a logged-in student's screen. Looks for a lead every few seconds (the 교육 tab shows
 *    "선생님이 수업을 시작했어요" when there is one); once joined, follows it every 1.5 s and sends the
 *    student's mark whenever it changes (or the server lost it).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ClassApiError, LEAD_POLL_MS, cleanMark, emptyMark, sameMark, type ClassServerClient, type Lead, type LeadHost, type LeadRole, type LeadSet, type Mark, type MarkIn, type Mate } from '@/engine/account';

export interface LeadSession {
  host: LeadHost;
  /** "2학년 3반", or null when leading on this PC alone. */
  className: string | null;
  classId: string | null;
  /** Students in the class (0 when on this PC alone). */
  total: number;
}

export interface HostState {
  lead: Lead | null;
  marks: Mark[];
  /** The last call failed (the class server is not answering). */
  error: string | null;
  set(patch: Partial<LeadSet>): void;
  end(): Promise<void>;
}

export function useLeadHost(sess: LeadSession | null, first: LeadSet | null): HostState {
  const [lead, setLead] = useState<Lead | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState<string | null>(null);
  const leadRef = useRef<Lead | null>(null);
  const host = sess?.host ?? null;

  const take = useCallback((v: { lead: Lead | null; marks: Mark[] }) => {
    leadRef.current = v.lead;
    setLead(v.lead);
    setMarks(v.marks);
    setError(null);
  }, []);
  const failed = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  // Start (or pick up a lead already going on in this class), then keep reading it.
  useEffect(() => {
    if (!host) return;
    let alive = true;
    void (async () => {
      try {
        const now = await host.get();
        if (!alive) return;
        if (!now.lead && first) take(await host.set(first));
        else take(now);
      } catch (e) {
        if (alive) failed(e);
      }
    })();
    const t = setInterval(() => {
      host.get().then((v) => alive && take(v), (e) => alive && failed(e));
    }, LEAD_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // `first` is read once, when the host starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, take, failed]);

  const set = useCallback(
    (patch: Partial<LeadSet>) => {
      const cur = leadRef.current;
      if (!host || !cur) return;
      const next: LeadSet = { lesson: cur.lesson, step: cur.step, gate: cur.gate, reveal: cur.reveal, stop: cur.stop, ...patch };
      // Shown at once; the server's answer replaces it.
      const optimistic = { ...cur, ...next };
      leadRef.current = optimistic;
      setLead(optimistic);
      host.set(next).then(take, failed);
    },
    [host, take, failed],
  );

  const end = useCallback(async () => {
    if (!host) return;
    try {
      await host.end();
    } catch {
      /* the server forgets it on its own after 30 minutes */
    }
    leadRef.current = null;
    setLead(null);
    setMarks([]);
  }, [host]);

  return { lead, marks, error, set, end };
}

/* --- the student's side ------------------------------------------------------------------------- */

export interface Joined {
  group: number;
  role: LeadRole;
}

/** What a student's screen did on one step of one lesson. */
export type Want = Pick<MarkIn, 'lesson' | 'step' | 'done' | 'help' | 'answer' | 'robot' | 'result'>;

export interface StudentLead {
  /** The lead going on in the student's class (null: none). */
  lead: Lead | null;
  /** The student has joined it (조 · 역할 picked). */
  joined: Joined | null;
  /** The group's robot PC (for a student following on screen). */
  mate: Mate | null;
  join(j: Joined): void;
  leave(): void;
  /** What this screen did on a step (group and role are added). */
  send(m: Want): void;
  /** The teacher ended the lead while the student was in it. */
  ended: boolean;
  dismissEnded(): void;
}

/** `client`: the logged-in student's (null: not a student, nothing is polled). */
export function useStudentLead(client: ClassServerClient | null): StudentLead {
  const [lead, setLead] = useState<Lead | null>(null);
  // Not kept over a reload: the banner asks again (the join dialog remembers the 조 and role).
  const [joined, setJoined] = useState<Joined | null>(null);
  const [mate, setMate] = useState<Mate | null>(null);
  const [ended, setEnded] = useState(false);
  const me = useRef<Mark | null>(null);
  const want = useRef<Want | null>(null);
  const sending = useRef(false);
  const leadRef = useRef<Lead | null>(null);
  const joinedRef = useRef(joined);
  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  /** The mark this screen should have on the server now (null: not joined or no lead). */
  const desired = useCallback((): MarkIn | null => {
    const l = leadRef.current;
    const j = joinedRef.current;
    if (!l || !j) return null;
    const w = want.current;
    // What the screen said about another step (the teacher has just moved on) is not this step's.
    const mine = w && w.lesson === l.lesson && w.step === l.step ? w : null;
    return cleanMark({ ...emptyMark(j.group, j.role), lesson: l.lesson, step: l.step, ...(mine ?? {}) });
  }, []);

  const push = useCallback(async () => {
    const d = desired();
    if (!client || !d || sending.current) return;
    if (me.current && sameMark(me.current, d)) return;
    sending.current = true;
    try {
      const r = await client.setMark(d);
      me.current = r.me;
      setMate(r.mate ?? null);
    } catch (e) {
      if (e instanceof ClassApiError && e.code === 'no_lead') {
        leadRef.current = null;
        setLead(null);
      }
    } finally {
      sending.current = false;
    }
  }, [client, desired]);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await client.myLead();
        if (!alive) return;
        const had = leadRef.current;
        leadRef.current = r.lead;
        setLead(r.lead);
        me.current = r.me;
        setMate(r.mate ?? null);
        if (had && !r.lead && joinedRef.current) {
          setEnded(true);
          joinedRef.current = null;
          setJoined(null);
        }
        if (r.lead && joinedRef.current) void push();
      } catch {
        /* offline for a moment: the next poll tries again */
      }
    };
    void poll();
    // Faster while in the lesson; slower while only looking for one.
    const t = setInterval(() => void poll(), joined ? LEAD_POLL_MS : 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [client, joined, push]);

  const join = useCallback(
    (j: Joined) => {
      joinedRef.current = j;
      setJoined(j);
      setEnded(false);
      want.current = null;
      void push();
    },
    [push],
  );
  const leave = useCallback(() => {
    joinedRef.current = null;
    setJoined(null);
  }, []);
  const send = useCallback(
    (m: Want) => {
      want.current = m;
      void push();
    },
    [push],
  );
  const dismissEnded = useCallback(() => setEnded(false), []);

  return { lead, joined: lead ? joined : null, mate, join, leave, send, ended, dismissEnded };
}
