/** A question of the bank (written per topic in content-markdown/*.md, see index.ts). */

import type { TopicId } from '../curriculum.gen';

/** 1 = 기본(고등), 2 = 응용(고등 심화), 3 = 대학. */
export type QLevel = 1 | 2 | 3;

interface Base {
  /** `<topic>-ox<n>` or `<topic>-mc<n>`, unique. */
  id: string;
  topic: TopicId;
  level: QLevel;
  /** The question (plain text, no [[term]] marks). */
  q: string;
  /** Why the answer is right, one or two sentences. */
  why: string;
}

export interface OxQuestion extends Base {
  kind: 'ox';
  answer: boolean;
}

export interface McQuestion extends Base {
  kind: 'mc';
  choices: readonly [string, string, string, string];
  /** Index into choices. */
  answer: 0 | 1 | 2 | 3;
}

export type Question = OxQuestion | McQuestion;
