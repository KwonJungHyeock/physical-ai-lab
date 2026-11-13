/**
 * 입문 과정의 화면 문구 (수정 지시서 v2 파트 G-1): one file beside the 매칭 표,
 * public/course/mycobot-280-1.text.json — each 절's 지금 할 일 sentences (in their order), the one line
 * shown when it is done, the one line shown when a try fails, and each chapter's 수행평가 (O · X answers,
 * the mission's sentence). The 교안 is written against that file; a sentence is changed there only.
 * The screens ask here by 절 number (and a key for a failure). No React.
 */

import TEXT from '../../../../public/course/mycobot-280-1.text.json';

interface SectionText {
  steps: readonly string[];
  done: string;
  quiz?: { q: string; options: string[]; answer: number; why: string };
  fails?: Readonly<Record<string, string>>;
}
const SECTIONS = TEXT.sections as Readonly<Record<string, SectionText>>;

/** `{name}` in a sentence, filled with the app's own value. */
const fill = (t: string, vars?: Readonly<Record<string, string | number>>) => (vars ? t.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : t);

/** The 지금 할 일 sentence of a 절's step (0-based; none: ''). */
export const stepText = (sub: string, i: number): string => SECTIONS[sub]?.steps[i] ?? '';
/** Every 지금 할 일 sentence of a 절, in order. */
export const stepTexts = (sub: string): readonly string[] => SECTIONS[sub]?.steps ?? [];

/** '다 했어요 · (한 줄 정리)': the line when a 절 is done (no 정리 written: '다 했어요'). */
export const doneLine = (sub: string): string => {
  const d = SECTIONS[sub]?.done;
  return d ? `${TEXT.common.done} · ${d}` : TEXT.common.done;
};

/** The one line of a failed try: `failLine('2-4', 'attachFirst')`, `failLine('3-5', 'slowFirst', { pct: 30 })`. */
export const failLine = (sub: string, key: string, vars?: Readonly<Record<string, string | number>>): string => fill(SECTIONS[sub]?.fails?.[key] ?? '', vars);

/** 잠깐 퀴즈 of a 절: the question, its choices, the right one (0-based here; the file counts from 1) and why. */
export const quizText = (sub: string): { q: string; options: string[]; answer: number; why: string } => {
  const z = SECTIONS[sub]?.quiz;
  return z ? { q: z.q, options: [...z.options], answer: z.answer - 1, why: z.why } : { q: '', options: [], answer: 0, why: '' };
};

/** 수행평가 (chapter n): the O · X answers, the mission's sentence and its failure line. */
export const testText = (n: number): { answers: readonly string[]; mission: string; fail?: string } => (TEXT.tests as Readonly<Record<string, { answers: string[]; mission: string; fail?: string }>>)[String(n)];
/** The 수행평가's own line in 지금 할 일. */
export const testLine = (key: 'testAsk' | 'testDone', vars?: Readonly<Record<string, string | number>>): string => fill(TEXT.common[key], vars);
