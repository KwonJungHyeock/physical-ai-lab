// Text fit of what students read on screen: every sentence of the 28 차시, the 21 site problems and
// 로봇 실습 7, measured against one line of the lesson panel at its narrowest (1366 × 768, about
// 22 em of 14.5 px Pretendard). The panels set one sentence per line (lesson/Rich.tsx), so a sentence
// that fits never wraps, and one that does not wraps somewhere in the middle of a thought.
//   npx tsx tools/check/text-fit.mts            → a summary per source, exit 1 if a sentence takes 3+ lines
//   npx tsx tools/check/text-fit.mts --list 1   → also every sentence over one line (filter: source prefix)
//   npx tsx tools/check/text-fit.mts --md ../content-markdown/1-기초로봇공학.md --list
//                                               → one lesson file as it is now (before gen:curriculum)
// Widths are Pretendard's advance widths in em (measured in the app): 한글 0.864, digits 0.594,
// latin 0.517 (capitals 0.659), space 0.244, punctuation 0.318.
import { TOPICS } from '../../src/engine/education/catalog';
import { UNITS } from '../../src/engine/education/practice7';
import { AI_TEXT } from '../../src/engine/education/lab/aiText';
import { BIO_TEXT } from '../../src/engine/education/lab/bioText';
import { CAFE_TEXT } from '../../src/engine/education/lab/cafeText';
import { ENERGY_TEXT } from '../../src/engine/education/lab/energyText';
import { FACTORY_TEXT } from '../../src/engine/education/lab/factory';
import { FARM_TEXT } from '../../src/engine/education/lab/farmText';
import { LOGI_TEXT } from '../../src/engine/education/lab/logistics';
import { sentencesOf } from '../../src/engine/education/sentences';
import { glossFirst } from '../../src/engine/education/symbols';
import { QUESTIONS } from '../../src/engine/education/questions';
import type { TopicData } from '../../src/engine/education/curriculum-types';
import { readFileSync } from 'node:fs';
import { parseSubject } from '../build/curriculum-md.mjs';

/** One line of the panel, in em. */
export const LINE_EM = 22;

export function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[가-힣ㄱ-ㆎ]/.test(ch)) w += 0.864;
    else if (/[0-9]/.test(ch)) w += 0.594;
    else if (/[A-Z]/.test(ch)) w += 0.659;
    else if (/[a-z]/.test(ch)) w += 0.517;
    else if (ch === ' ') w += 0.244;
    else if (/[①-⑳→←↑↓×÷±°]/.test(ch)) w += 0.9;
    else w += 0.318;
  }
  return w;
}

/** What the screen shows of a marked text: [[shown|term]] → shown, `x`* → x, [버튼] keeps its brackets. */
const plain = (s: string) =>
  s
    .replace(/\[\[([^|\]]*)(\|[^\]]*)?\]\]/g, '$1')
    .replace(/`([^`]*)`\*?/g, '$1')
    .trim();

/**
 * The width of a marked sentence as the lesson panel draws it: a symbol is a small chip (padding,
 * border, margin ≈ 0.83 em) and, the first time a page shows it (`x`*), carries its name above in
 * 10.5 px type, the chip as wide as the wider of the two; an on-screen name ([실행]) is a key cap.
 */
function richEm(text: string, names: ReadonlyMap<string, string>): number {
  let w = 0;
  for (const part of text.split(/(`[^`]+`\*?|\[(?!\[)[^\]]+\](?!\]))/)) {
    const sym = /^`([^`]+)`(\*?)$/.exec(part);
    const ui = /^\[([^\]]+)\]$/.exec(part);
    if (sym) {
      const name = names.get(sym[1]);
      const base = emWidth(sym[1]) * 1.04;
      w += (sym[2] && name ? Math.max(base, emWidth(name) * (10.5 / 14.5)) : base) + (name ? 0.83 : 0);
    } else if (ui) w += emWidth(ui[1]) * 0.86 + 0.83;
    else w += emWidth(plain(part));
  }
  return w;
}

interface Item {
  src: string;
  where: string;
  text: string;
  em: number;
}
const items: Item[] = [];
const NONE = new Map<string, string>();
const add = (src: string, where: string, text: string | undefined, names: ReadonlyMap<string, string> = NONE) => {
  if (!text) return;
  for (const s of sentencesOf(text)) items.push({ src, where, text: plain(s.replace(/`\*/g, '`')), em: richEm(s, names) });
};

const mdAt = process.argv.indexOf('--md');
const mdFile = mdAt >= 0 ? process.argv[mdAt + 1] : null;
// The md parser's topics and the catalog's share the fields read here.
const topics = (mdFile ? (parseSubject(readFileSync(mdFile, 'utf8'), mdFile) as { topics: unknown }).topics : TOPICS) as readonly TopicData[];
for (const t of topics) {
  const src = `차시 ${t.id}`;
  const n = new Map(t.symbols.map((x) => [x.sym, x.name]));
  // Each page glosses a symbol's first use on it (lesson/LessonRail.tsx).
  const [q, ...goals] = glossFirst([t.question, ...t.objectives]);
  add(src, '질문', q, n);
  goals.forEach((o, i) => add(src, `목표${i + 1}`, o, n));
  const [def, ...principle] = glossFirst([t.definition, ...t.principle]);
  add(src, '정의', def, n);
  principle.forEach((p, i) => add(src, `원리${i + 1}`, p, n));
  for (const s of t.steps) {
    const a = `활동${s.n}`;
    add(src, `${a} 예상`, s.ask, n);
    s.choices.options.forEach((o) => add(src, `${a} 보기`, o, n));
    add(src, `${a} 할 일`, s.doIt, n);
    add(src, `${a} 핵심`, s.point, n);
    add(src, `${a} 왜`, s.whyShort, n);
  }
  const [takeaway, field] = glossFirst([t.takeaway, t.field]);
  add(src, '기억할 것', takeaway, n);
  add(src, '현장에서는', field, n);
  add(src, '비교', t.compare, n);
}

// The 평가's 확인 문제 (shown on the lesson's last page): the question, the choices, the reason.
// Reported on their own rows and not failing the check (a question may take two lines).
const quizItems = (mdFile ? topics.flatMap((t) => (t as unknown as { questions: typeof QUESTIONS }).questions) : QUESTIONS) as typeof QUESTIONS;
for (const q of quizItems) {
    const src = `문항 ${q.topic.slice(0, 1)}단원`;
    add(src, '문제', q.q);
    if (q.kind === 'mc') q.choices.forEach((c) => add(src, '보기', c));
    add(src, '풀이', q.why);
  }

/** Every string a site problem shows (ids and links aside), walked as it is. */
function walk(src: string, where: string, v: unknown) {
  if (typeof v === 'string') {
    if (!/^(\/|https?:)/.test(v)) add(src, where, v);
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(src, `${where}[${i}]`, x));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (['id', 'href', 'pdf', 'answer', 'tol', 'unit', 'kind', 'ok', 'k', 'code', 'formula'].includes(k)) continue;
      walk(src, where ? `${where}.${k}` : k, x);
    }
}
const SITES: [string, Record<number, unknown>][] = mdFile ? [] : [
  ['현장 공장', FACTORY_TEXT],
  ['현장 물류', LOGI_TEXT],
  ['현장 바이오', BIO_TEXT],
  ['현장 팜', FARM_TEXT],
  ['현장 시티', CAFE_TEXT],
  ['현장 AI', AI_TEXT],
  ['현장 자원순환', ENERGY_TEXT],
];
for (const [name, texts] of SITES) for (const [p, t] of Object.entries(texts)) walk(`${name} ${p}`, '', t);

for (const u of mdFile ? [] : UNITS) {
  const src = `실습7 ${u.id}`;
  add(src, '알아보기', u.about);
  add(src, '비유', u.like);
  add(src, '현장', u.site);
  u.steps.forEach((s) => {
    add(src, '단계', s.label);
    add(src, '단계 설명', s.hint);
  });
  u.quiz.forEach((q) => {
    add(src, '문제', q.q);
    q.options.forEach((o) => add(src, '보기', o));
    add(src, '풀이', q.why);
  });
  add(src, '실물', u.real.does);
  add(src, '준비', u.real.ready);
  add(src, '기록', u.real.records);
}

const lines = (it: Item) => Math.max(1, Math.ceil(it.em / LINE_EM));
const group = (src: string) => src.replace(/ \d.*$|-\d$/, '').replace(/^(차시) (\d)-\d$/, '$1 $2');

const quiz = (src: string) => src.startsWith('문항');
const bySrc = new Map<string, { n: number; one: number; two: number; more: number }>();
for (const it of items) {
  const g = it.src.startsWith('차시') || quiz(it.src) ? it.src.replace(/^(차시) (\d)-\d$/, '$1 $2단원') : group(it.src);
  const r = bySrc.get(g) ?? { n: 0, one: 0, two: 0, more: 0 };
  const l = lines(it);
  r.n++;
  if (l === 1) r.one++;
  else if (l === 2) r.two++;
  else r.more++;
  bySrc.set(g, r);
}
let n = 0;
let one = 0;
let more = 0;
console.log('source          sentences  1 line   2 lines  3+ lines');
for (const [g, r] of bySrc) {
  if (!g.startsWith('문항')) {
    n += r.n;
    one += r.one;
    more += r.more;
  }
  console.log(`${g.padEnd(14)} ${String(r.n).padStart(9)}  ${String(Math.round((100 * r.one) / r.n)).padStart(5)}%  ${String(r.two).padStart(7)}  ${String(r.more).padStart(8)}`);
}
console.log(`all (문항 빼고) ${String(n).padStart(9)}  ${String(Math.round((100 * one) / n)).padStart(5)}%            ${String(more).padStart(8)}`);

const at = process.argv.indexOf('--list');
if (at >= 0) {
  const only = process.argv[at + 1] ?? '';
  for (const it of items) {
    const l = lines(it);
    if (l > 1 && it.src.startsWith(only)) console.log(`${l}줄 ${it.src} ${it.where}: ${it.text}`);
  }
}
process.exit(more ? 1 : 0);
