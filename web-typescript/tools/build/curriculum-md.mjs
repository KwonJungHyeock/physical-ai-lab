/**
 * Reads the curriculum the content team writes — one md file per 학문 in
 * content-markdown/ (N-이름.md), in the format of 1-기초로봇공학.md — into plain
 * data for the 교육 tab. Throws with file:line on anything it cannot read, so a
 * typo in a hand-written file stops the build instead of dropping content.
 *
 * Used by tools/build/curriculum.mjs (writes src/engine/education/curriculum.gen.ts)
 * and tests/education/content-check.mts (the generated file is up to date).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEVEL = { 기본: 1, 응용: 2, 대학: 3 };
const CIRCLED = ['①', '②', '③', '④'];

/** `- 키(설명): 값` → ['키', '값']; the part in brackets is a note for the writer. */
function keyed(line) {
  const m = /^- ([^:]+?)(?:\([^)]*\))?:\s*(.*)$/.exec(line);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/** "Kp | 케이 피 | 비례 게인 — 지금 오차에 곱하는 수 | 없음" → { sym, read, name, meaning, unit }. */
function symbolLine(text, bad) {
  const parts = text.split(' | ').map((s) => s.trim());
  if (parts.length !== 4 || parts.some((p) => !p)) bad();
  const [sym, read, mean, unit] = parts;
  if (sym.includes('`')) bad();
  const at = mean.indexOf(' — ');
  return { sym, read, name: at < 0 ? mean : mean.slice(0, at).trim(), meaning: at < 0 ? '' : mean.slice(at + 3).trim(), unit };
}

export function parseSubject(text, file = 'md') {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const fail = (i, msg) => {
    throw new Error(`${file}:${i + 1}: ${msg}\n  ${lines[i] ?? ''}`);
  };
  const subject = { id: '', title: '', en: '', goal: '', prereq: [], topics: [], newTerms: [], refs: [] };
  let topic = null;
  /** '' (subject header) | 'topic' | 'steps' | 'questions' | 'terms' | 'refs' | 'skip' */
  let section = '';
  /** The multi-line field being read (원리 / 자세히 / 수식). */
  let field = null;
  let para = [];
  const flushPara = () => {
    if (field === 'theory' && para.length) topic.theory.push(para.join(' '));
    para = [];
  };
  const endField = () => {
    flushPara();
    field = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (field === 'card') {
      if (/^ {2,}- /.test(line)) {
        const cm = /^ {2,}- (도입 발문|도입 할 일|개념 발문|정리 발문|정리 답):\s*(.+)$/.exec(line);
        if (!cm) fail(i, '수업 카드 줄은 "  - 도입 발문: …" (도입 발문 · 도입 할 일 · 개념 발문 · 정리 발문 · 정리 답)');
        const v = cm[2].trim();
        if (cm[1] === '도입 발문') topic.card.introAsk = v.split(' / ').map((x) => x.trim()).filter(Boolean);
        else if (cm[1] === '도입 할 일') topic.card.introDo = v.split(' / ').map((x) => x.trim()).filter(Boolean);
        else if (cm[1] === '개념 발문') topic.card.conceptAsk = v;
        else if (cm[1] === '정리 발문') topic.card.wrapAsk = v;
        else topic.card.wrapAnswer = v;
        continue;
      }
      field = null;
    }
    if (field) {
      if (field === 'theory' && /^ {2,}\S/.test(line)) {
        para.push(line.trim());
        continue;
      }
      if (field === 'theory' && line === '') {
        flushPara();
        continue;
      }
      if (field === 'symbols' && /^ {2,}- /.test(line)) {
        topic.symbols.push(symbolLine(line.trim().slice(2).trim(), () => fail(i, '기호 줄은 "  - 기호 | 읽는 법 | 이름 — 뜻 | 단위" (단위가 없으면 없음)')));
        continue;
      }
      if (field !== 'theory' && /^ {2,}- /.test(line)) {
        topic[field].push(line.trim().slice(2).trim());
        continue;
      }
      endField();
    }
    if (line === '') continue;

    let m;
    if ((m = /^# (\d+) (.+)$/.exec(line))) {
      subject.id = m[1];
      subject.title = m[2].trim();
      section = '';
      continue;
    }
    if ((m = /^## (\d+)-(\d+) (.+)$/.exec(line))) {
      if (m[1] !== subject.id) fail(i, `주제 번호 ${m[1]}-${m[2]} 가 학문 ${subject.id} 와 다름`);
      topic = {
        id: `${m[1]}-${m[2]}`,
        cat: subject.id,
        title: m[3].trim(),
        en: '',
        question: '',
        definition: '',
        principle: [],
        theory: [],
        formula: [],
        terms: [],
        symbols: [],
        objectives: [],
        field: '',
        figure: { desc: '', file: '' },
        takeaway: '',
        steps: [],
        compareValues: '',
        compare: '',
        questions: [],
      };
      subject.topics.push(topic);
      section = 'topic';
      continue;
    }
    if (/^## 새 용어/.test(line)) {
      section = 'terms';
      continue;
    }
    if (/^## 참고/.test(line)) {
      section = 'refs';
      continue;
    }
    if (/^## /.test(line)) {
      section = 'skip';
      continue;
    }
    if (/^### (탐구 활동|실습)/.test(line)) {
      if (!topic) fail(i, '주제 밖의 실습');
      section = 'steps';
      continue;
    }
    if (/^### 문항/.test(line)) {
      if (!topic) fail(i, '주제 밖의 문항');
      section = 'questions';
      continue;
    }
    if (/^### /.test(line)) fail(i, '모르는 소제목 (### 탐구 활동 / ### 문항 만 씀)');
    if (section === 'skip') continue;
    if (section === 'steps' && /^ {2,}- /.test(line)) {
      const step = topic.steps[topic.steps.length - 1];
      const sm = /^ {2,}- (목표|예상|할 일|볼 것|왜|바꾸는 것|보기|핵심|발문)(\(한 줄\))?:\s*(.*)$/.exec(line);
      if (!step || !sm) fail(i, '활동 아래 줄은 "  - 목표: …" (목표 · 예상 · 할 일 · 볼 것 · 왜 · 바꾸는 것 · 보기 · 핵심 · 왜(한 줄) · 발문)');
      const key = sm[1] === '왜' && sm[2] ? 'whyShort' : { 목표: 'goal', 예상: 'predict', '할 일': 'doIt', '볼 것': 'observe', 왜: 'why', '바꾸는 것': 'change', 보기: 'choices', 핵심: 'point', 발문: 'ask' }[sm[1]];
      if (step[key]) fail(i, `활동 ${step.n} 의 ${sm[1]}${sm[2] ?? ''} 이(가) 두 번`);
      const v = sm[3].trim();
      if (!v) fail(i, `활동 ${step.n} 의 ${sm[1]} 이(가) 비어 있음`);
      if (key === 'change') {
        const parts = v.split(' | ').map((x) => x.trim());
        if (parts.length !== 2 || !parts[0] || !parts[1]) fail(i, '바꾸는 것 줄은 "  - 바꾸는 것: 이름 | 값" (활동 2·3 의 값은 "앞 → 뒤")');
        step.change = { what: parts[0], value: parts[1] };
      } else if (key === 'choices') {
        const cm = /^(.+?) \| 정답 ([1-4])$/.exec(v);
        if (!cm) fail(i, '보기 줄은 "  - 보기: 가 / 나 / 다 | 정답 2"');
        const options = cm[1].split(' / ').map((x) => x.trim()).filter(Boolean);
        const answer = Number(cm[2]) - 1;
        if (options.length < 2 || options.length > 4 || answer >= options.length) fail(i, '보기는 2~4 개, 정답 번호는 보기 안에서');
        step.choices = { options, answer };
      } else step[key] = v;
      continue;
    }
    if (!line.startsWith('- ')) fail(i, '"- " 로 시작하지 않는 줄');

    if (section === '') {
      const kv = keyed(line);
      if (!kv) fail(i, '학문 머리말 항목을 읽을 수 없음');
      const [k, v] = kv;
      if (k === '영문') subject.en = v;
      else if (k === '이 학문을 마치면') subject.goal = v;
      else if (k === '선수 학문') subject.prereq = v === '없음' ? [] : [...v.matchAll(/(?:^|,\s*)(\d+)/g)].map((x) => x[1]);
      else fail(i, `모르는 학문 항목 "${k}"`);
      continue;
    }

    if (section === 'topic') {
      const kv = keyed(line);
      if (!kv) fail(i, '주제 항목을 읽을 수 없음');
      const [k, v] = kv;
      const one = (key) => {
        if (!v) fail(i, `${k} 이(가) 비어 있음`);
        topic[key] = v;
      };
      if (k === '영문') one('en');
      else if (k === '질문') one('question');
      else if (k === '정의') one('definition');
      else if (k === '기억할 것') one('takeaway');
      else if (k === '원리') field = 'principle';
      else if (k === '학습 목표') field = 'objectives';
      else if (k === '현장에서는') one('field');
      else if (k === '자세히') field = 'theory';
      else if (k === '수업 카드') {
        topic.card = { introAsk: [], introDo: [], conceptAsk: '', wrapAsk: '', wrapAnswer: '' };
        field = 'card';
      }
      else if (k === '수식') field = 'formula';
      else if (k === '기호') {
        if (v === '없음') continue;
        field = 'symbols';
      }
      else if (k === '용어')
        topic.terms = v
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
      else if (k === '그림') {
        const f = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(v);
        topic.figure = f ? { desc: f[1].trim(), file: f[2].trim() } : { desc: v, file: '' };
      } else fail(i, `모르는 주제 항목 "${k}"`);
      if (field && v) fail(i, `${k} 은(는) 다음 줄부터 들여 써야 함`);
      continue;
    }

    if (section === 'steps') {
      if ((m = /^- 활동 ([123]) (.+)$/.exec(line))) {
        const n = Number(m[1]);
        if (n !== topic.steps.length + 1) fail(i, '활동 순서가 1, 2, 3 이 아님');
        topic.steps.push({ key: 'ABC'[n - 1], n, title: m[2].trim(), goal: '', predict: '', doIt: '', observe: '', why: '' });
        continue;
      }
      const kv = keyed(line);
      if (kv && kv[0] === '비교할 값') topic.compareValues = kv[1];
      else if (kv && kv[0] === '비교') topic.compare = kv[1];
      else fail(i, '탐구 활동은 "- 활동 1 이름" 아래에 "  - 할 일: …" 처럼');
      continue;
    }

    if (section === 'questions') {
      const parts = line.slice(2).split(' | ').map((s) => s.trim());
      const level = LEVEL[parts[1]];
      if (!level) fail(i, `수준은 기본·응용·대학 중 하나 ("${parts[1]}")`);
      const why = parts[parts.length - 1].replace(/^해설:\s*/, '');
      if (!parts[parts.length - 1].startsWith('해설:')) fail(i, '마지막 칸은 "해설: …"');
      const n = topic.questions.filter((q) => q.kind === (parts[0] === 'OX' ? 'ox' : 'mc')).length + 1;
      if (parts[0] === 'OX') {
        if (parts.length !== 5) fail(i, `OX 줄은 칸 5개 (지금 ${parts.length}개) — 본문에 " | " 를 쓰지 말 것`);
        if (parts[3] !== 'O' && parts[3] !== 'X') fail(i, '정답은 O 또는 X');
        topic.questions.push({ id: `${topic.id}-ox${n}`, topic: topic.id, kind: 'ox', level, q: parts[2], answer: parts[3] === 'O', why });
      } else if (parts[0] === '객관식') {
        if (parts.length !== 6) fail(i, `객관식 줄은 칸 6개 (지금 ${parts.length}개) — 본문에 " | " 를 쓰지 말 것`);
        const choices = parts[3]
          .split(/[①②③④]/)
          .slice(1)
          .map((s) => s.trim());
        if (choices.length !== 4 || !parts[3].startsWith('①')) fail(i, '보기는 ① ② ③ ④ 네 개');
        const a = CIRCLED.indexOf(parts[4].replace(/^정답\s*/, '').trim());
        if (a < 0) fail(i, '정답 칸은 "정답 ②" 형식');
        topic.questions.push({ id: `${topic.id}-mc${n}`, topic: topic.id, kind: 'mc', level, q: parts[2], choices, answer: a, why });
      } else fail(i, '문항 줄은 "- OX | …" 또는 "- 객관식 | …"');
      continue;
    }

    if (section === 'terms') {
      const parts = line.slice(2).split(' | ').map((s) => s.trim());
      if (parts.length !== 3) fail(i, '새 용어 줄은 "- 용어 | English | 뜻"');
      subject.newTerms.push({ ko: parts[0], en: parts[1], short: parts[2], subject: subject.id });
      continue;
    }

    if (section === 'refs') {
      subject.refs.push(line.slice(2).trim());
      continue;
    }
  }
  if (field) endField();

  if (!subject.id) throw new Error(`${file}: "# N 학문명" 머리줄이 없음`);
  for (const t of subject.topics) {
    for (const k of ['en', 'question', 'definition', 'takeaway', 'compare'])
      if (!t[k]) throw new Error(`${file}: ${t.id} 의 ${k} 가 비어 있음`);
    if (t.steps.length !== 3) throw new Error(`${file}: ${t.id} 탐구 활동은 1·2·3 세 개 (지금 ${t.steps.length}개)`);
    for (const st of t.steps) if (!st.doIt || !st.observe) throw new Error(`${file}: ${t.id} 활동 ${st.n} 에 할 일 · 볼 것이 없음`);
    if (t.principle.length < 2 || t.theory.length < 2) throw new Error(`${file}: ${t.id} 원리·자세히가 모자람`);
    const syms = t.symbols.map((s) => s.sym);
    const dup = syms.find((s, i) => syms.indexOf(s) !== i);
    if (dup) throw new Error(`${file}: ${t.id} 기호 ${dup} 가 두 번`);
  }
  return subject;
}

/** Every `N-*.md` in the folder, in 학문 order. */
export function readCurriculum(dir) {
  const files = readdirSync(dir)
    .filter((f) => /^\d+-.+\.md$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b));
  const subjects = files.map((f) => parseSubject(readFileSync(join(dir, f), 'utf8'), f));
  const seen = new Set();
  for (const s of subjects) {
    if (seen.has(s.id)) throw new Error(`학문 ${s.id} 파일이 둘 이상`);
    seen.add(s.id);
  }
  return subjects;
}

const q = (s) => `'${s}'`;
const json = (v) => JSON.stringify(v, null, 2);

/** The TypeScript module the app imports. */
export function renderModule(subjects) {
  const topics = subjects.flatMap((s) => s.topics);
  const omit = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
  return `/**
 * GENERATED by tools/build/curriculum.mjs from content-markdown/*.md — do not
 * edit here: change the md file and run \`npm run gen:curriculum\`.
 */

import type { CategoryData, TopicData } from './curriculum-types';
import type { Question } from './questions/types';

export type CategoryId = ${subjects.map((s) => q(s.id)).join(' | ')};

export type TopicId =
${subjects.map((s) => `  | ${s.topics.map((t) => q(t.id)).join(' | ')}`).join('\n')};

export const SUBJECT_DATA: readonly CategoryData[] = ${json(subjects.map((s) => omit(s, 'topics', 'newTerms')))};

export const TOPIC_DATA: readonly TopicData[] = ${json(topics.map((t) => omit(t, 'questions')))};

export const QUESTION_DATA: readonly Question[] = ${json(topics.flatMap((t) => t.questions))};

export const NEW_TERM_DATA: readonly { ko: string; en: string; short: string; subject: string }[] = ${json(subjects.flatMap((s) => s.newTerms))};
`;
}
