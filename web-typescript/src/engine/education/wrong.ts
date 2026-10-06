/**
 * 틀린 문제: the ids of the bank's questions (questions/) a student last answered
 * wrong, newest first, kept per browser. A question leaves the list as soon as it
 * is answered right (in a lesson's 평가 or again from the learn home).
 * A tiny store for useSyncExternalStore, so the home card follows the lesson live.
 */

import { QUESTIONS, type Question } from './questions';

const KEY = 'learn-wrong';
const BY_ID: ReadonlyMap<string, Question> = new Map(QUESTIONS.map((q) => [q.id, q]));
const EMPTY: readonly string[] = [];

let cache: readonly string[] | null = null;
const listeners = new Set<() => void>();

function load(): readonly string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    // Ids this question bank no longer has are dropped.
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** The wrong question ids, newest first (stable between changes). */
export function wrongIds(): readonly string[] {
  if (!cache) cache = load();
  return cache;
}
/** On the server and during hydration: none. */
export const noWrongIds = (): readonly string[] => EMPTY;

export function subscribeWrong(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Record an answer: a wrong one goes to the top of the list, a right one leaves it. */
export function recordAnswer(id: string, right: boolean) {
  const now = wrongIds();
  const next = right ? now.filter((x) => x !== id) : [id, ...now.filter((x) => x !== id)];
  if (next.length === now.length && next.every((x, i) => x === now[i])) return;
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private window: kept for this visit only */
  }
  listeners.forEach((l) => l());
}

export const questionById = (id: string) => BY_ID.get(id);

/** How a question is named to students: "OX 2-1-07", "객관식 3-2-03". */
export function questionLabel(q: Question): string {
  const n = Number(/(\d+)$/.exec(q.id)?.[1] ?? 0);
  return `${q.kind === 'ox' ? 'OX' : '객관식'} ${q.topic}-${String(n).padStart(2, '0')}`;
}
