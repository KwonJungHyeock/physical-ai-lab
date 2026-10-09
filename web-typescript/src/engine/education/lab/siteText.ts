/**
 * 산업단지 현장 실습의 글 틀: every site lab (스마트 공장, 물류 센터, …) tells each problem the same
 * way, from its lesson script in content-markdown/sites/ — the story (day, a line from the person in
 * charge), learning goals, the run's questions, what to measure, the cause question with a reply to
 * each answer, the explanation to complete, the calculation that opens the operator panel, hints,
 * predictions and why a prediction missed, the principle card, the check questions, the university
 * extension, the real robot and safety. The six steps are the same everywhere.
 */

export interface Pdf {
  label: string;
  href: string;
}

export const SITE_STEPS = [
  { id: 'brief', label: '작업 지시' },
  { id: 'run', label: '가동 · 문제' },
  { id: 'cause', label: '원인 찾기' },
  { id: 'fix', label: '값 고치기' },
  { id: 'compare', label: '다시 가동 · 비교' },
  { id: 'done', label: '해결 · 원리' },
] as const;

export type SiteStepId = (typeof SITE_STEPS)[number]['id'];

export const siteStepIndex = (s: SiteStepId) => SITE_STEPS.findIndex((x) => x.id === s);

export interface Choice {
  t: string;
  ok?: boolean;
  /** What the screen says back when this one is picked. */
  fb: string;
}

/** A number to work out (계산 칸): within `tol` of `answer` is right. */
export interface CalcField {
  label: string;
  answer: number;
  tol: number;
  unit: string;
}

export interface CheckQ {
  q: string;
  kind: 'num' | 'mc' | 'open';
  /** num: the answer (and tolerance); mc: the right choice's index. */
  answer?: number;
  tol?: number;
  unit?: string;
  choices?: readonly string[];
  /** Shown after answering (the model answer for open questions). */
  explain: string;
}

export type SiteProblem = 1 | 2 | 3;

export interface SiteText {
  id: SiteProblem;
  title: string;
  about: string;
  day: string;
  order: string;
  orderTitle: string;
  goals: readonly string[];
  /** The scene, read before running. */
  brief: string;
  /** The person in charge (the site's own: 김 주임, 박 반장 …). */
  boss: string;
  happened: string;
  /** Questions the teacher (and the panel) asks right after the run. */
  ask: readonly string[];
  look: string;
  question: string;
  choices: readonly Choice[];
  /** The explanation to complete: the text with ①②③ gaps, the options per gap and the right ones. */
  blanks: { text: string; options: readonly (readonly string[])[]; answer: readonly number[] };
  calc: { prompt: string; fields: readonly CalcField[]; after: string };
  hints: readonly { k: string; t: string }[];
  predictions: readonly string[];
  /** Why a prediction that missed may have missed: pick one, read the reply. */
  missed: readonly Choice[];
  principle: { unit: string; title: string; formula: string; lines: readonly string[] };
  pdf: readonly Pdf[];
  checks: readonly CheckQ[];
  uni: { title: string; lines: readonly string[]; code?: string };
  real: string;
  safety: string;
}
