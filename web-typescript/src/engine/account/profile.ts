/**
 * One learner's progress per student on a shared PC. The 교육 screens keep progress in plain browser
 * keys (learn-done, lab-solved-…, final-exam, …). When a student logs in, the keys on this PC are put
 * aside under the profile they belong to and the student's own are put back; logging out does the
 * reverse. So the next student on the same PC starts from their own progress, never the last one's.
 *
 * Only learner keys move (LEARNER_KEY); settings stay with the PC (tone, 교사용 보기, the school's
 * equipment and level, the class login and its event queue).
 */

/** The part of Storage this needs (localStorage, or a test double). */
export interface KeyStore {
  readonly length: number;
  key(i: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The profile in use on this PC. */
export const PROFILE_MARK = 'learner-profile';
/** A profile's put-aside keys, as one JSON object. */
export const PROFILE_PREFIX = 'learner-profile:';
/** No one logged in as a student: the PC's own progress (free mode, teachers, 관리자). */
export const FREE_PROFILE = 'free';

/** Settings that look like learner keys but belong to the PC. */
const PC_KEYS = new Set(['learn-tone', 'learn-teacher', 'learn-overlay-notes', 'learn-owned', 'learn-level', 'final-exam-class']);

/** Whether a key is a learner's progress (moves with the student). */
export function LEARNER_KEY(key: string): boolean {
  if (PC_KEYS.has(key) || key.startsWith(PROFILE_PREFIX) || key === PROFILE_MARK) return false;
  return key.startsWith('learn-') || key.startsWith('lab-') || key === 'final-exam' || key === 'park-all-open' || key === 'student-name' || key === 'student-no';
}

/** The profile of a session: a student's own, else the PC's. */
export function profileOf(session: { role: string; student?: { classId: string; no: number } } | null): string {
  return session?.role === 'student' && session.student ? `student:${session.student.classId}:${session.student.no}` : FREE_PROFILE;
}

/**
 * Makes `profile` the one in use: the keys of the profile in use are put aside, the profile's own
 * are put back. Returns whether anything was switched (nothing when it already is in use).
 */
export function switchProfile(store: KeyStore, profile: string): boolean {
  const current = store.getItem(PROFILE_MARK) || FREE_PROFILE;
  if (current === profile) return false;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null && LEARNER_KEY(k)) keys.push(k);
  }
  const aside: Record<string, string> = {};
  for (const k of keys) {
    const v = store.getItem(k);
    if (v !== null) aside[k] = v;
  }
  store.setItem(PROFILE_PREFIX + current, JSON.stringify(aside));
  for (const k of keys) store.removeItem(k);
  let mine: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(store.getItem(PROFILE_PREFIX + profile) ?? '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) mine = raw as Record<string, unknown>;
  } catch {
    /* a broken profile starts empty */
  }
  for (const [k, v] of Object.entries(mine)) if (typeof v === 'string' && LEARNER_KEY(k)) store.setItem(k, v);
  store.removeItem(PROFILE_PREFIX + profile);
  store.setItem(PROFILE_MARK, profile);
  return true;
}
