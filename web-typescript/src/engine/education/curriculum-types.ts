/**
 * The shape of the curriculum as read from content-markdown/*.md (see
 * tools/build/curriculum-md.mjs). catalog.ts adds the typed ids and term marks.
 */

export type StepKey = 'A' | 'B' | 'C';

export interface StepData {
  /** Internal key (A · B · C); shown as 활동 1 · 2 · 3. */
  key: StepKey;
  /** 1 · 2 · 3 — the order the lesson goes in. */
  n: number;
  title: string;
  /** 목표 — what this activity is for, one line. */
  goal: string;
  /** 예상 — the question to guess before doing it. */
  predict: string;
  /** 할 일 — what to do on screen ([버튼] names in brackets). */
  doIt: string;
  /** 볼 것 — what to look at. */
  observe: string;
  /** 왜 — why it comes out so, read after doing it. */
  why: string;
  /** 바꾸는 것 — the one thing this activity changes: its name and the value (activity 1: the starting value, later ones "앞 → 뒤"). */
  change: { what: string; value: string };
  /** 보기 — the choices for the guess, and which one is right (0-based). */
  choices: { options: string[]; answer: number };
  /** 핵심 — the result in one line ("관절 2개 → 손끝이 면을 채운다"). */
  point: string;
  /** 왜(한 줄) — the reason in one sentence (the long one stays in why). */
  whyShort: string;
  /** 발문 — what the teacher asks during the activity. */
  ask: string;
}

/** 수업 카드 — what the teacher says and has the class do in the steps around the activities. */
export interface LessonCardData {
  /** 도입 발문 — one or two questions to open the lesson. */
  introAsk: string[];
  /** 도입 할 일 — what students do while the question is open. */
  introDo: string[];
  /** 개념 발문 — a question that checks the definition. */
  conceptAsk: string;
  /** 정리 발문 / 정리 답 — the closing question and its answer. */
  wrapAsk: string;
  wrapAnswer: string;
}

/** A letter that stands for a quantity (`- 기호:` line "Kp | 케이 피 | 비례 게인 — 지금 오차에 곱하는 수 | 없음"). */
export interface SymbolData {
  /** As written: Kp, μ, θ₁. */
  sym: string;
  /** How it is read aloud. */
  read: string;
  /** Short name (뜻 before " — "). */
  name: string;
  /** The rest of 뜻. */
  meaning: string;
  /** 단위, or 없음. */
  unit: string;
}

/** One 학문. */
export interface CategoryData {
  id: string;
  title: string;
  en: string;
  /** 이 학문을 마치면 — the ability it completes, one line. */
  goal: string;
  /** 선수 학문 ids. */
  prereq: string[];
  /** 참고 — books and standards. */
  refs: string[];
}

export interface TopicData {
  id: string;
  cat: string;
  title: string;
  en: string;
  question: string;
  definition: string;
  principle: string[];
  /** 자세히 — paragraphs. */
  theory: string[];
  /** 수식 (대학) — one per line, plain text. */
  formula: string[];
  /** 용어 — names as the writer wrote them (matched to the glossary loosely). */
  terms: string[];
  /** 기호 — the letters the topic uses (marked `X` in its text), see symbols.ts. */
  symbols: SymbolData[];
  /** 학습 목표 — "~할 수 있다", two or three. */
  objectives: string[];
  /** 현장에서는 — where this is used in real robots, one or two sentences. */
  field: string;
  /** 그림 — what the picture shows, and the image file the writer named. */
  figure: { desc: string; file: string };
  takeaway: string;
  steps: StepData[];
  /** 비교할 값 — the values the three tries are compared on. */
  compareValues: string;
  /** 비교 — what the comparison shows, one line. */
  compare: string;
  /** 수업 카드 (see LessonCardData). */
  card: LessonCardData;
}
