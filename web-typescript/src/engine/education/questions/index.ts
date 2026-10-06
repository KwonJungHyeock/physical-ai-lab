/**
 * The question bank: 10 OX and 10 four-choice per topic (기본 4 · 응용 4 · 대학 2),
 * written with the topic in content-markdown/*.md. Students and teachers pick
 * what they want from the 자료실; the 교육 screen draws a round per topic.
 */

import type { CategoryId, TopicId } from '../catalog';
import { CATEGORIES, TOPIC_BY_ID } from '../catalog';
import { QUESTION_DATA } from '../curriculum.gen';
import type { Question } from './types';

export type { McQuestion, OxQuestion, QLevel, Question } from './types';

export const QUESTIONS: readonly Question[] = QUESTION_DATA;

export const QUESTIONS_BY_CATEGORY: Readonly<Record<CategoryId, readonly Question[]>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, QUESTIONS.filter((q) => TOPIC_BY_ID.get(q.topic)?.cat === c.id)]),
) as unknown as Record<CategoryId, readonly Question[]>;

export const questionsOf = (topic: TopicId) => QUESTIONS.filter((q) => q.topic === topic);
