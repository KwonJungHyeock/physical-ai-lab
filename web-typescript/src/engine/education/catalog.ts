/**
 * What the 교육 tab teaches: the robotics roadmap's 8 학문 (기초 로봇공학 →
 * 로봇 학습), each a few topics a student moves and watches in the simulator.
 * Every topic is the same frame: a question, a picture with a one-line
 * definition and the principle, the longer explanation, three tries of the same
 * motion with one thing changed (A → B → C), the comparison, the questions, and
 * the formulas for university.
 *
 * The text comes from content-markdown/<N>-<학문>.md, the files the content team
 * writes (read by tools/build/curriculum.mjs into curriculum.gen.ts). Here the
 * ids get their types and the topic's terms are marked [[보이는 말|용어]] where
 * they first appear, so a student can press them for the glossary bubble.
 */

import { SUBJECT_DATA, TOPIC_DATA, type CategoryId, type TopicId } from './curriculum.gen';
import type { CategoryData, StepData, StepKey, TopicData } from './curriculum-types';
import { findTerm } from './glossary';

export type { CategoryId, TopicId, StepKey };

/** One 학문. */
export interface Category extends CategoryData {
  id: CategoryId;
  prereq: CategoryId[];
}

export type Step = StepData;

export interface Topic extends Omit<TopicData, 'id' | 'cat' | 'steps'> {
  id: TopicId;
  cat: CategoryId;
  steps: readonly [Step, Step, Step];
}

/** Wrap the first appearance of each of `names` in `text` as [[shown|term]] (not inside a mark, a `symbol` or a [button]). */
export function markTerms(text: string, names: readonly string[]): string {
  const terms = names
    .map((n) => {
      const t = findTerm(n);
      if (!t) return null;
      const variants = [...new Set([n, n.replace(/\([^)]*\)/g, '').trim(), t.ko, ...(t.alias ?? [])])].filter((v) => v.length >= 2);
      return { key: t.ko, variants: variants.sort((a, b) => b.length - a.length) };
    })
    .filter((x): x is { key: string; variants: string[] } => !!x);
  // Longest names first so "회전 관절" is marked before "관절".
  terms.sort((a, b) => b.variants[0].length - a.variants[0].length);
  let out = text;
  for (const { key, variants } of terms) {
    for (const v of variants) {
      // Never inside a mark already there, a `symbol`, or an on-screen [button name].
      const parts = out.split(/(\[\[[^\]]*\]\]|`[^`]*`|\[[^[\]]*\])/);
      let done = false;
      for (let i = 0; i < parts.length && !done; i += 2) {
        const at = parts[i].indexOf(v);
        if (at < 0) continue;
        parts[i] = `${parts[i].slice(0, at)}[[${v}|${key}]]${parts[i].slice(at + v.length)}`;
        done = true;
      }
      if (done) {
        out = parts.join('');
        break;
      }
    }
  }
  return out;
}

export const CATEGORIES: readonly Category[] = SUBJECT_DATA.map((c) => ({ ...c, id: c.id as CategoryId, prereq: c.prereq as CategoryId[] }));

export const TOPICS: readonly Topic[] = TOPIC_DATA.map((t) => {
  const mark = (s: string) => markTerms(s, t.terms);
  const steps = t.steps.map((s) => ({ ...s, goal: mark(s.goal), predict: mark(s.predict), doIt: mark(s.doIt), observe: mark(s.observe), why: mark(s.why) }));
  return {
    ...t,
    id: t.id as TopicId,
    cat: t.cat as CategoryId,
    definition: mark(t.definition),
    theory: t.theory.map(mark),
    principle: t.principle.map(mark),
    takeaway: mark(t.takeaway),
    objectives: t.objectives.map(mark),
    field: mark(t.field),
    compare: mark(t.compare),
    steps: [steps[0], steps[1], steps[2]] as const,
  };
});

export const TOPIC_BY_ID: ReadonlyMap<TopicId, Topic> = new Map(TOPICS.map((t) => [t.id, t]));

/** The lesson number of a topic in the whole course (1차시 … 28차시), and the one after it. */
export const lessonNo = (id: TopicId) => TOPICS.findIndex((t) => t.id === id) + 1;
export const nextTopicOf = (id: TopicId): Topic | null => TOPICS[lessonNo(id)] ?? null;

/** How a try is named to students: 활동 1 · 2 · 3 (the lesson's order), never the internal key. */
export const STEP_NAME: Record<StepKey, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };
export const STEP_NO: Record<StepKey, number> = { A: 1, B: 2, C: 3 };

export const topicsOf = (cat: CategoryId) => TOPICS.filter((t) => t.cat === cat);

export const categoryOf = (id: TopicId) => CATEGORIES.find((c) => c.id === TOPIC_BY_ID.get(id)!.cat)!;

/** The 학문 that first lists a glossary term among its topics' 용어 (for the printed glossary). */
export function subjectOfTerm(ko: string): CategoryId | null {
  const t = TOPICS.find((x) => x.terms.some((n) => findTerm(n)?.ko === ko));
  return t ? t.cat : null;
}
