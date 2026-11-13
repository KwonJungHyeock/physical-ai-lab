/**
 * 입문 과정의 화면 문구 (수정 지시서 v2 파트 G-1 · v3 파트 5): one file beside the 매칭 표,
 * public/course/mycobot-280-1.text.json — each 절's 지금 할 일 sentences (in their order), the one line
 * shown when it is done, the one line shown when a try fails, its 잠깐 퀴즈, its 관찰 말풍선; the names of
 * the buttons and switches (a sentence says `{run}` · `{zero}` and gets the very name the button shows);
 * the names of the 판정 lines; each 수행평가 (O · X answers, the mission's sentence); the words of the
 * 수행평가 window (testPanel) and of 6장's pages and its printed sheet (end) — 수정 지시서 v4 파트 6-10.
 * The 교안 is written against that file; a sentence or a name is changed there only.
 * The screens ask here by 절 number (and a key). No React.
 */

import TEXT from '../../../../public/course/mycobot-280-1.text.json';

interface SectionText {
  steps: readonly string[];
  done: string;
  quiz?: { q: string; options: string[]; answer: number; why: string };
  fails?: Readonly<Record<string, string>>;
  observe?: Readonly<Record<string, string>>;
  leads?: Readonly<Record<string, string>>;
}
const SECTIONS = TEXT.sections as Readonly<Record<string, SectionText>>;
const BUTTONS = TEXT.buttons as Readonly<Record<string, string>>;
const CHECKS = TEXT.checks as Readonly<Record<string, string>>;
const COMMON = TEXT.common as Readonly<Record<string, string>>;
const PANEL = TEXT.testPanel as Readonly<Record<string, string>>;
const END = TEXT.end as Readonly<Record<string, string>>;

type Vars = Readonly<Record<string, string | number>>;

/** `{name}` in a sentence: a button's name (buttons), else the app's own value (vars); left as it is when neither has it. */
const fill = (t: string, vars?: Vars) => t.replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : k in BUTTONS ? BUTTONS[k] : m));

/** A number as the screens write it: the minus sign '−', never the hyphen (수정 지시서 v3 파트 5-7). */
export const signed = (n: number): string => String(n).replace('-', '−');

/** A button's or a switch's name as its key shows it: `buttonName('zero')` = '영점 자세'. */
export const buttonName = (key: keyof typeof TEXT.buttons): string => BUTTONS[key];

/** The 지금 할 일 sentence of a 절's step (0-based; none: ''). */
export const stepText = (sub: string, i: number): string => fill(SECTIONS[sub]?.steps[i] ?? '');
/** Every 지금 할 일 sentence of a 절, in order. */
export const stepTexts = (sub: string): readonly string[] => (SECTIONS[sub]?.steps ?? []).map((s) => fill(s));

/** '다 했어요 · (한 줄 정리)': the line when a 절 is done (no 정리 written: '다 했어요'). */
export const doneLine = (sub: string): string => {
  const d = SECTIONS[sub]?.done;
  return d ? `${COMMON.done} · ${fill(d)}` : COMMON.done;
};

/** The one line of a failed try: `failLine('2-3', 'attachFirst')`, `failLine('3-4', 'slowFirst', { pct: 30 })`. */
export const failLine = (sub: string, key: string, vars?: Vars): string => fill(SECTIONS[sub]?.fails?.[key] ?? '', vars);

/** 잠깐 퀴즈 of a 절: the question, its choices, the right one (0-based here; the file counts from 1) and why. */
export const quizText = (sub: string): { q: string; options: string[]; answer: number; why: string } => {
  const z = SECTIONS[sub]?.quiz;
  return z ? { q: z.q, options: [...z.options], answer: z.answer - 1, why: z.why } : { q: '', options: [], answer: 0, why: '' };
};

/** A 관찰 말풍선's words (5-1 · 5-2 · 5-3): `observeText('5-1', 'card')`. */
export const observeText = (sub: string, key: string): string => fill(SECTIONS[sub]?.observe?.[key] ?? '');

/** The words put before a sentence to name the key to press (4-1): `leadText('4-1', 'key', { name: '앞', axis: 'X+' })`. */
export const leadText = (sub: string, key: string, vars?: Vars): string => fill(SECTIONS[sub]?.leads?.[key] ?? '', vars);

/** A 판정 line's or a measured value's name: `checkName('delivered', { n: 1, text: '사랑해' })`. */
export const checkName = (key: keyof typeof TEXT.checks, vars?: Vars): string => fill(CHECKS[key], vars);

/** A line several 절 share: `commonLine('notYet', { step: '…' })`, `commonLine('running')`. */
export const commonLine = (key: keyof typeof TEXT.common, vars?: Vars): string => fill(COMMON[key], vars);

/** 수행평가 (chapter n): the O · X answers, the mission's sentence and its failure line; `missionOnly`: the sentence where the course has the mission only (4차시: `{sub}` = the 절 it is judged by). */
export const testText = (n: number): { answers: readonly string[]; mission: string; fail?: string; missionOnly?: string } => {
  const t = (TEXT.tests as Readonly<Record<string, { answers: string[]; mission: string; fail?: string; missionOnly?: string }>>)[String(n)];
  return { answers: t.answers, mission: fill(t.mission), fail: t.fail ? fill(t.fail) : undefined, missionOnly: t.missionOnly };
};
/** A word or a line of the 수행평가 window: `panelText('score', { n: 4 })`. */
export const panelText = (key: keyof typeof TEXT.testPanel, vars?: Vars): string => fill(PANEL[key], vars);
/** A word or a line of 6장's pages and its printed sheet: `endText('count', { n: 3, max: 100 })`. */
export const endText = (key: keyof typeof TEXT.end, vars?: Vars): string => fill(END[key], vars);

/**
 * 입문 과정의 표기 (수정 지시서 v4 파트 6-9) for words the full version writes its own way: a particle right
 * after a bracket, Latin letters or a number ('[로봇 찾기]를', 'PC와'), a range's tilde closed up ('1~254'),
 * mm · cm after a space ('10 mm').
 */
export const tidy = (t: string): string =>
  t
    .replace(/([A-Za-z0-9\])]) (을|를|이|가|은|는|의|와|과|로|으로)(?=[\s,.]|$)/g, '$1$2')
    .replace(/(\d) ~ (\d)/g, '$1~$2')
    .replace(/(\d)(mm|cm)(?![A-Za-z])/g, '$1 $2');
/** The 수행평가's own line in 지금 할 일. */
export const testLine = (key: 'testAsk' | 'testDone', vars?: Vars): string => fill(COMMON[key], vars);
