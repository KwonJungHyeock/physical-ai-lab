/**
 * The 교육 tab's content: the generated curriculum matches content-markdown/*.md,
 * every 학문 and topic is well formed, every term the writer names is in the
 * glossary, and every topic has 10 OX + 10 four-choice questions at levels
 * 기본 4 · 응용 4 · 대학 2 with balanced answers, and every topic has its
 * 1600 × 900 figure with one panel for each try A · B · C, its symbols are
 * explained, and its figure GIF and still and three try GIFs exist (and each 단원's picture).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCurriculum, renderModule } from '../../tools/build/curriculum-md.mjs';
import { CATEGORIES, TOPICS, type Topic } from '../../src/engine/education/catalog';
import { GLOSSARY, findTerm } from '../../src/engine/education/glossary';
import { QUESTIONS, QUESTIONS_BY_CATEGORY } from '../../src/engine/education/questions';
import { FIGURES } from '../../src/ui/education/fig';
import { symbolsIn } from '../../src/engine/education/symbols';
import { figureGif, figureStill, tryGif, unitPicture } from '../../src/engine/education/media';

let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
};

// The generated module is what the md files say.
const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fresh = renderModule(readCurriculum(join(web, '..', 'content-markdown')));
check(fresh === readFileSync(join(web, 'src', 'engine', 'education', 'curriculum.gen.ts'), 'utf8'), 'curriculum.gen.ts is up to date (run npm run gen:curriculum)');

// Glossary.
check(new Set(GLOSSARY.map((t) => t.ko)).size === GLOSSARY.length, 'glossary terms are unique');
for (const t of GLOSSARY) check(t.short.length > 5 && t.en.length > 1, `glossary ${t.ko} has a meaning`);

// 학문.
check(CATEGORIES.map((c) => c.id).join(',') === '1,2,3,4,5,6,7,8', `학문 1–8 in order (got ${CATEGORIES.map((c) => c.id).join(',')})`);
for (const c of CATEGORIES) {
  check(!!c.en && !!c.goal, `학문 ${c.id} has 영문 and 이 학문을 마치면`);
  check(c.prereq.every((p) => Number(p) < Number(c.id) && CATEGORIES.some((x) => x.id === p)), `학문 ${c.id} 선수 학문 come before it`);
  check(c.refs.length > 0, `학문 ${c.id} has 참고`);
  const ts = TOPICS.filter((t) => t.cat === c.id);
  check(ts.length >= 2, `학문 ${c.id} has topics`);
  check(ts.every((t, i) => t.id === `${c.id}-${i + 1}`), `학문 ${c.id} topics are numbered ${c.id}-1, ${c.id}-2, …`);
}

// Topics.
const marks = (s: string) => [...s.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map((m) => (m[2] ?? m[1]).trim());
const textOf = (t: Topic) => [t.definition, ...t.principle, t.compare, t.takeaway, ...t.steps.flatMap((s) => [s.doIt, s.observe])];
check(new Set(TOPICS.map((t) => t.id)).size === TOPICS.length, 'topic ids are unique');
for (const t of TOPICS) {
  check(t.steps.map((s) => s.key).join('') === 'ABC', `${t.id} steps are A, B, C`);
  check(t.principle.length >= 2 && t.principle.length <= 4, `${t.id} has 2–3 principle lines (got ${t.principle.length})`);
  check(t.theory.length >= 2 && t.theory.length <= 5, `${t.id} has 2–4 paragraphs (got ${t.theory.length})`);
  check(t.formula.length >= 1, `${t.id} has formulas`);
  check(t.terms.length >= 3, `${t.id} has terms`);
  check(!!t.figure.desc, `${t.id} describes its picture`);
  check(!!t.compareValues, `${t.id} names the values to compare`);
  for (const k of t.terms) check(!!findTerm(k), `${t.id} term ${k} is in the glossary (add it to 새 용어)`);
  const c = t.card;
  check(!!c && c.introAsk.length > 0 && c.introDo.length > 0 && !!c.conceptAsk && !!c.wrapAsk && !!c.wrapAnswer, `${t.id} has a 수업 카드 with all five lines`);
  for (const s of t.steps) {
    check(!!s.change?.what && !!s.change.value, `${t.id} ${s.key} has 바꾸는 것`);
    check(!!s.choices && s.choices.options.length >= 2 && s.choices.answer >= 0 && s.choices.answer < s.choices.options.length, `${t.id} ${s.key} has 보기 with a valid 정답`);
    check(!!s.point && !!s.whyShort && !!s.ask, `${t.id} ${s.key} has 핵심 · 왜(한 줄) · 발문`);
  }
  for (const s of textOf(t)) for (const k of marks(s)) check(!!findTerm(k), `${t.id} mark [[${k}]] is in the glossary`);
}

// Questions.
const ids = new Set<string>();
const topicIds = new Set(TOPICS.map((t) => t.id));
for (const q of QUESTIONS) {
  check(!ids.has(q.id), `question id ${q.id} is unique`);
  ids.add(q.id);
  check(topicIds.has(q.topic), `${q.id} topic ${q.topic} exists`);
  check(q.q.length >= 8 && q.why.length >= 4, `${q.id} has a question and an explanation`);
  if (q.kind === 'mc') check(new Set(q.choices).size === 4 && q.choices.every((c) => c.length > 0), `${q.id} has 4 distinct choices`);
}
const LEVELS = '1111222233';
for (const t of TOPICS) {
  const qs = QUESTIONS.filter((q) => q.topic === t.id);
  for (const kind of ['ox', 'mc'] as const) {
    const k = qs.filter((q) => q.kind === kind);
    check(k.length === 10, `${t.id} has 10 ${kind === 'ox' ? 'OX' : '객관식'} (got ${k.length})`);
    check(k.map((q) => q.level).join('') === LEVELS, `${t.id} ${kind === 'ox' ? 'OX' : '객관식'} levels are 기본 4 · 응용 4 · 대학 2 (got ${k.map((q) => q.level).join('')})`);
  }
  const ox = qs.filter((q) => q.kind === 'ox');
  const o = ox.filter((q) => q.answer).length;
  check(o >= 3 && o <= 7, `${t.id} OX answers are balanced (O ${o}/${ox.length})`);
}
for (const c of CATEGORIES) {
  const mc = QUESTIONS_BY_CATEGORY[c.id].filter((q) => q.kind === 'mc');
  const spread = [0, 1, 2, 3].map((i) => mc.filter((q) => q.answer === i).length);
  check(mc.length === 0 || Math.min(...spread) >= mc.length * 0.15, `학문 ${c.id} 객관식 answers spread over ①–④ (${spread.join('/')})`);
}

// The lesson (one topic = one 50-minute 차시): 학습 목표, 현장에서는, and each 활동's 목표 · 예상 · 왜 are written,
// and the old try names (실습 A / B / C) are gone — students meet 활동 1 · 2 · 3.
for (const t of TOPICS) {
  check(t.objectives.length >= 2 && t.objectives.length <= 4, `${t.id} has 2–4 학습 목표 (has ${t.objectives.length})`);
  check(t.field.length > 10, `${t.id} has 현장에서는`);
  for (const st of t.steps) {
    check(!!st.goal && !!st.predict && !!st.why, `${t.id} 활동 ${st.n} has 목표 · 예상 · 왜`);
  }
  const qs = QUESTIONS.filter((q) => q.topic === t.id);
  const all = [t.question, t.definition, ...t.objectives, ...t.principle, ...t.theory, t.takeaway, t.field, t.compare, t.compareValues, ...t.steps.flatMap((s) => [s.title, s.goal, s.predict, s.doIt, s.observe, s.why]), ...qs.flatMap((q) => [q.q, q.why, ...(q.kind === 'mc' ? q.choices : [])])];
  for (const x of all) check(!/실습 [ABC](?![A-Za-z])|[ABC] ?· ?[ABC] ?· ?[ABC]/.test(x), `${t.id} says 활동 1 · 2 · 3, not A · B · C: "${x.slice(0, 60)}"`);
}

// Symbols: every `X` the text marks is in that topic's 기호, and every 기호 is explained.
for (const t of TOPICS) {
  const qs = QUESTIONS.filter((q) => q.topic === t.id);
  const texts = [
    t.question,
    t.definition,
    ...t.objectives,
    ...t.principle,
    ...t.theory,
    t.takeaway,
    t.field,
    t.compare,
    t.compareValues,
    ...t.steps.flatMap((s) => [s.goal, s.predict, s.doIt, s.observe, s.why]),
    ...qs.flatMap((q) => [q.q, q.why, ...(q.kind === 'mc' ? q.choices : [])]),
  ];
  const known = new Set(t.symbols.map((s) => s.sym));
  for (const sym of new Set(texts.flatMap(symbolsIn))) check(known.has(sym), `${t.id} \`${sym}\` is listed under 기호`);
  for (const s of t.symbols) check(!!s.read && !!s.name && !!s.unit, `${t.id} 기호 ${s.sym} has 읽기 · 뜻 · 단위`);
  for (const s of FIGURES[t.id]?.symbols ?? []) check(known.has(s), `${t.id} figure symbol ${s} is listed under 기호`);
}

// Figures (fig/): one per topic, a panel per try, inside the 1600 × 900 frame.
for (const t of TOPICS) {
  const f = FIGURES[t.id];
  check(!!f, `${t.id} has a figure`);
  if (!f) continue;
  for (const k of ['A', 'B', 'C'] as const) check(f.panels.some((p) => p.step === k), `${t.id} figure has a panel for 실습 ${k}`);
  check(f.panels.every((p) => p.x >= 0 && p.y >= 0 && p.x + p.w <= 1600 && p.y + p.h <= 900), `${t.id} figure panels fit 1600 × 900`);
}
check(Object.keys(FIGURES).every((id) => TOPICS.some((t) => t.id === id)), 'every figure belongs to a topic');

// Pictures (engine/education/media.ts): the figure's animation and its still, the three tries, made by the tools,
// and the 교육 home's picture of each 단원.
for (const t of TOPICS)
  for (const f of [figureGif(t.id), figureStill(t.id), ...(['A', 'B', 'C'] as const).map((k) => tryGif(t.id, k))])
    check(existsSync(join(web, 'public', f)), `${f} exists (tools/build/figure-gifs.mjs · tools/check/learn-sim.mjs --clips)`);
for (const c of CATEGORIES) check(existsSync(join(web, 'public', unitPicture(c.id))), `${unitPicture(c.id)} exists`);

const ox = QUESTIONS.filter((q) => q.kind === 'ox').length;
console.log(`learn content: 학문 ${CATEGORIES.length}, ${TOPICS.length} topics, ${GLOSSARY.length} terms, ${QUESTIONS.length} questions (OX ${ox}, 객관식 ${QUESTIONS.length - ox})`);
if (failed) {
  console.error(`learn content: ${failed} problem(s)`);
  process.exit(1);
}
console.log('learn content: OK');
