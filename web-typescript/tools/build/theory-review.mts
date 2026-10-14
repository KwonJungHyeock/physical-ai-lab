// 이론 검증 자료: everything the 교육 tab teaches as robotics, written out for a subject expert to check —
// the 28 차시 (정의 · 원리 · 자세히 · 수식 · 기호 · 활동의 예상과 정답 · 왜), the 21 site problems' 원리 and
// worked numbers, 마무리 평가, 로봇 실습 7, and (in a second file) the 560 questions with answers.
// Read from the same data the app shows, so it is what students see.
//   npx tsx tools/build/theory-review.mts   → docs/reports/education/32-theory-review{,-quiz}.md
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { CATEGORIES, TOPICS, topicsOf } from '../../src/engine/education/catalog';
import { QUESTIONS } from '../../src/engine/education/questions';
import { FINAL_ITEMS } from '../../src/engine/education/lab/final';
import { UNITS } from '../../src/engine/education/practice7';
import { AI_TEXT } from '../../src/engine/education/lab/aiText';
import { BIO_TEXT } from '../../src/engine/education/lab/bioText';
import { CAFE_TEXT } from '../../src/engine/education/lab/cafeText';
import { ENERGY_TEXT } from '../../src/engine/education/lab/energyText';
import { FACTORY_TEXT } from '../../src/engine/education/lab/factory';
import { FARM_TEXT } from '../../src/engine/education/lab/farmText';
import { LOGI_TEXT } from '../../src/engine/education/lab/logistics';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const out = path.join(repo, 'docs/reports/education');

/** The screen's marks as plain text: [[shown|term]] → shown, `x`* → `x`. */
const plain = (s: string | undefined) =>
  (s ?? '')
    .replace(/\[\[([^|\]]*)(\|[^\]]*)?\]\]/g, '$1')
    .replace(/`([^`]*)`\*/g, '`$1`')
    .trim();
const cell = (s: string | undefined) => plain(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const LEVEL = { 1: '기본', 2: '응용', 3: '대학' } as const;
const num = (v: unknown, tol?: number, unit?: string) => `${v}${unit ? ` ${unit}` : ''}${tol ? ` (±${tol})` : ''}`;

const L: string[] = [];
const p = (...lines: string[]) => L.push(...lines);

p(
  '# 보고 #32 — 이론 검증 자료: 교육에 들어가는 로봇공학 내용',
  '',
  `작성: 2026-10-14 · 앱 데이터에서 그대로 뽑음 (\`npx tsx tools/build/theory-review.mts\`)`,
  '',
  '교육 탭이 학생에게 가르치는 로봇공학 내용을 한곳에 모았습니다. 전문가가 내용이 맞는지 확인하는 데 씁니다.',
  '원고(`content-markdown/`)와 현장 실습 · 평가 데이터에서 그대로 뽑았으므로, 여기 적힌 것이 화면에 나오는 것입니다.',
  '',
  '**검토 방법**',
  '',
  '- 차시마다 **정의 · 원리 · 수식 · 기호** 가 맞는지, **활동의 정답(✅)** 과 **왜** 가 맞는지 봅니다.',
  '- 현장 실습 · 마무리 평가는 **원리의 식** 과 **계산 정답(허용 오차)** 이 맞는지 봅니다.',
  '- 확인 문항 560개(정답 · 풀이)는 따로 `32-theory-review-quiz.md` 에 있습니다.',
  '- 틀린 곳은 차시 번호(예: 2-3)와 항목 이름(예: 활동 2 · 왜)으로 알려 주시면 원고에서 고칩니다.',
  '',
  '## 차례',
  '',
  '1. 로봇공학 8개 단원 · 28차시',
  ...CATEGORIES.map((c, i) => `   - ${i + 1}단원 ${c.title}: ${topicsOf(c.id).map((t) => `${t.id} ${t.title}`).join(' · ')}`),
  '2. 현장 실습 7곳 · 21문제의 원리와 계산',
  '3. 대단원 마무리 평가 7문항',
  '4. 로봇 실습 7 (납품 검수 7가지)',
  '',
);

/* --- 1. the 28 차시 ------------------------------------------------------------------------------- */
p('---', '', '# 1. 로봇공학 8개 단원 · 28차시', '');
CATEGORIES.forEach((c, ci) => {
  p(`## ${ci + 1}단원 ${c.title} (${c.en})`, '', `- **이 단원을 마치면**: ${plain(c.goal)}`);
  if (c.prereq.length) p(`- **먼저 배울 단원**: ${c.prereq.map((id) => CATEGORIES.find((x) => x.id === id)?.title ?? id).join(', ')}`);
  if (c.refs.length) p(`- **참고**: ${c.refs.map(plain).join(' / ')}`);
  p('');
  for (const t of topicsOf(c.id)) {
    p(`### ${t.id} ${t.title} (${t.en})`, '');
    p(`- **질문**: ${plain(t.question)}`);
    p(`- **학습 목표**:`, ...t.objectives.map((o) => `  - ${plain(o)}`));
    p(`- **정의**: ${plain(t.definition)}`);
    p(`- **원리**:`, ...t.principle.map((x) => `  - ${plain(x)}`));
    if (t.theory.length) p('- **자세히**:', ...t.theory.map((x) => `  - ${plain(x)}`));
    if (t.formula.length) p('- **수식 (대학)**:', ...t.formula.map((x) => `  - \`${x.replace(/`/g, '')}\``));
    if (t.symbols.length) {
      p('', '| 기호 | 읽기 | 뜻 | 단위 |', '| --- | --- | --- | --- |');
      for (const s of t.symbols) p(`| ${cell(s.sym)} | ${cell(s.read)} | ${cell(s.name)}${s.meaning ? ` — ${cell(s.meaning)}` : ''} | ${cell(s.unit)} |`);
    }
    p('');
    for (const s of t.steps) {
      p(`**활동 ${s.n} · ${plain(s.title)}** — 바꾸는 것: ${plain(s.change.what)} (${plain(s.change.value)})`, '');
      p(`- 예상: ${plain(s.predict)}`);
      p(...s.choices.options.map((o, i) => `  - ${i === s.choices.answer ? '✅' : '◻️'} ${plain(o)}`));
      p(`- 핵심: ${plain(s.point)}`);
      p(`- 왜: ${plain(s.why)}`);
      p('');
    }
    p(`- **비교** (${plain(t.compareValues)}): ${plain(t.compare)}`);
    p(`- **기억할 것**: ${plain(t.takeaway)}`);
    p(`- **현장에서는**: ${plain(t.field)}`);
    p(`- **정리 질문**: ${plain(t.card.wrapAsk)} → ${plain(t.card.wrapAnswer)}`, '');
  }
});

/* --- 2. site labs --------------------------------------------------------------------------------- */
type Field = { label: string; answer: number; tol?: number; unit?: string };
type Check = { q: string; kind: string; answer?: number; tol?: number; unit?: string; choices?: string[]; explain?: string };
type SiteText = {
  title: string;
  about?: string;
  brief?: string;
  question?: string;
  choices?: { t: string; ok?: boolean }[];
  blanks?: { text: string; options: string[][]; answer: number[] };
  calc?: { prompt?: string; fields?: Field[] };
  principle?: { unit?: string; title?: string; formula?: string; lines?: string[] };
  checks?: Check[];
  uni?: { title?: string; lines?: string[] };
};
const SITES: [string, Record<number, unknown>][] = [
  ['스마트팩토리', FACTORY_TEXT],
  ['물류 허브', LOGI_TEXT],
  ['바이오 · 헬스케어', BIO_TEXT],
  ['스마트팜', FARM_TEXT],
  ['스마트시티 (서비스 · 돌봄)', CAFE_TEXT],
  ['피지컬 AI 연구소', AI_TEXT],
  ['에너지 · 자원순환', ENERGY_TEXT],
];
p('---', '', '# 2. 현장 실습 7곳 · 21문제의 원리와 계산', '');
p('문제마다: 상황 → 원인 고르기(정답 ✅) → 빈칸 → 계산(정답 · 허용 오차) → 원리 → 확인 문제 → 대학 심화.', '');
for (const [site, texts] of SITES) {
  p(`## ${site}`, '');
  for (const [no, raw] of Object.entries(texts)) {
    const x = raw as SiteText;
    p(`### ${site} ${no}. ${plain(x.title)}${x.about ? ` — ${plain(x.about)}` : ''}`, '');
    if (x.brief) p(`- **상황**: ${plain(x.brief)}`);
    if (x.question && x.choices?.length) {
      p(`- **원인**: ${plain(x.question)}`, ...x.choices.map((ch) => `  - ${(ch as { ok?: boolean }).ok ? '✅' : '◻️'} ${plain(ch.t)}`));
    }
    if (x.blanks) {
      let i = 0;
      const filled = plain(x.blanks.text).replace(/[①②③④⑤]/g, () => `**${x.blanks!.options[i]?.[x.blanks!.answer[i++]] ?? '?'}**`);
      p(`- **빈칸 (정답 채움)**: ${filled}`);
    }
    if (x.calc?.fields?.length) {
      if (x.calc.prompt) p(`- **계산**: ${plain(x.calc.prompt)}`);
      p(...x.calc.fields.map((f) => `  - ${plain(f.label)} = **${num(f.answer, f.tol, f.unit)}**`));
    }
    if (x.principle) {
      p(`- **원리 (${plain(x.principle.unit)} · ${plain(x.principle.title)})**`);
      if (x.principle.formula) p(`  - 식: \`${x.principle.formula}\``);
      p(...(x.principle.lines ?? []).map((l) => `  - ${plain(l)}`));
    }
    if (x.checks?.length) {
      p('- **확인 문제**:');
      for (const c of x.checks) {
        const ans = c.kind === 'num' ? num(c.answer, c.tol, c.unit) : c.kind === 'mc' && c.choices ? plain(c.choices[c.answer ?? 0]) : '(서술)';
        p(`  - ${plain(c.q)} → **${ans}**${c.explain ? ` · ${plain(c.explain)}` : ''}`);
      }
    }
    if (x.uni?.lines?.length) p(`- **대학 심화 (${plain(x.uni.title)})**:`, ...x.uni.lines.map((l) => `  - ${plain(l)}`));
    p('');
  }
}

/* --- 3. 마무리 평가 ------------------------------------------------------------------------------- */
p('---', '', '# 3. 대단원 마무리 평가 7문항', '');
p('지난번에 고친 값 그대로인데 상황이 바뀐 문제입니다. 원리로 새 숫자를 계산해야 통과합니다.', '');
FINAL_ITEMS.forEach((f, i) => {
  p(`### 평가 ${i + 1}. ${f.site} — ${f.title}`, '');
  p(`- **상황**: ${plain(f.brief)}`);
  p(`- **조건**: ${f.spec.map(plain).join(' · ')}`);
  p(`- **주어진 값**: ${f.data.map((d) => `${plain(d.k)} = ${plain(d.v)}`).join(' · ')}`);
  p('- **원인**:', ...f.causes.map((c) => `  - ${c.ok ? '✅' : '◻️'} ${plain(c.t)}`));
  p(`- **계산**: ${plain(f.calc.prompt)}`, ...f.calc.fields.map((x) => `  - ${plain(x.label)} = **${num(x.answer, x.tol, x.unit)}**`));
  p(`- **힌트**: ${f.hints.map(plain).join(' / ')}`);
  p(`- **원리**: ${plain(f.principle)}`);
  p(`- **답**: ${plain(f.answer)}`, '');
});

/* --- 4. 로봇 실습 7 ------------------------------------------------------------------------------- */
p('---', '', '# 4. 로봇 실습 7 (납품 검수 7가지를 쉬운 실습으로)', '');
for (const u of UNITS as readonly { id: string; check: number; title: string; about: string; like: string; site: string; quiz: { q: string; options: string[]; answer: number; why: string }[]; real: { does: string; records: string } }[]) {
  p(`### 7-${u.check} ${plain(u.title)}`, '');
  p(`- **알아보기**: ${plain(u.about)}`, `- **비유**: ${plain(u.like)}`, `- **현장**: ${plain(u.site)}`);
  p('- **문제**:', ...u.quiz.map((q) => `  - ${plain(q.q)} → **${plain(q.options[q.answer])}** · ${plain(q.why)}`));
  p(`- **실물로**: ${plain(u.real.does)} (기록: ${plain(u.real.records)})`, '');
}

writeFileSync(path.join(out, '32-theory-review.md'), L.join('\n') + '\n');

/* --- the question bank ---------------------------------------------------------------------------- */
const Q: string[] = [
  '# 보고 #32 부록 — 확인 문항 560개 (정답 · 풀이)',
  '',
  '차시마다 OX 10 · 객관식 10 (기본 4 · 응용 4 · 대학 2). 자료실 문항지와 수업의 평가 단계에 쓰입니다.',
  '객관식은 정답 보기 앞에 ✅. 틀린 곳은 문항 번호(예: 2-3-mc4)로 알려 주세요.',
  '',
];
for (const t of TOPICS) {
  Q.push(`## ${t.id} ${t.title}`, '', '| 번호 | 수준 | 문제 | 정답 | 풀이 |', '| --- | --- | --- | --- | --- |');
  for (const q of QUESTIONS.filter((x) => x.topic === t.id)) {
    const ans = q.kind === 'ox' ? (q.answer ? 'O' : 'X') : q.choices.map((c, i) => `${i === q.answer ? '✅' : `${i + 1})`} ${cell(c)}`).join('<br>');
    Q.push(`| ${q.id.replace(/^.*?-(ox|mc)/, `${t.id}-$1`)} | ${LEVEL[q.level]} | ${cell(q.q)} | ${ans} | ${cell(q.why)} |`);
  }
  Q.push('');
}
writeFileSync(path.join(out, '32-theory-review-quiz.md'), Q.join('\n') + '\n');
console.log(`32-theory-review.md: ${L.length} lines · 32-theory-review-quiz.md: ${QUESTIONS.length} questions`);
