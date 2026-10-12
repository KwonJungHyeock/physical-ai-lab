// How the lesson and site-lab panels' text lines up as drawn, every 차시 page and every site problem ×
// every step, at 1366 × 768 (the narrowest screen the course is taught on):
//   WRAP     one sentence (a line of its own, lesson/Rich.tsx) running over 2 lines
//   ORPHAN   a paragraph whose last line holds 3 characters or fewer
// The panels set one sentence per line; a sentence that fits never wraps. Results that only appear
// after an activity (결과 · 왜) are measured by text-fit.mts from the content itself.
// Needs the app running (npm run dev) and Playwright:
//   BASE=http://localhost:3000 node tools/check/text-lines.mjs [1-1 ... | labs]   → prints problems and a summary
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { chromiumPath, loadPlaywright } from './inspect.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';
const all = JSON.parse(execFileSync('npx', ['tsx', '-e', "import('./src/engine/education/catalog.ts').then((m) => console.log(JSON.stringify((m.TOPICS ?? m.default.TOPICS).map((t) => t.id))))"], { cwd: web }).toString());
const ids = process.argv[2] === 'labs' ? [] : process.argv.length > 2 ? process.argv.slice(2) : all;
const [W, H] = (process.env.SIZE ?? '1366x768').split('x').map(Number);

/** Runs in the page: every text block inside `root`, its sentences' line counts and orphans. */
function measure(root) {
  const out = [];
  // Lines as drawn: the distinct line boxes of the block's text, leaving out what sits on lines of
  // its own by design (a <small> label over its value, a symbol's name over the symbol in <rt>).
  const lineOf = (el) => {
    const tops = [];
    // A label set on a line of its own (small · em · b shown as a block) above its text.
    const first = el.firstElementChild;
    const label = first && first.matches('small, em, b') && getComputedStyle(first).display === 'block' ? first : el.querySelector(':scope > small');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('rt') || label?.contains(n)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.width > 1 && !tops.some((t) => Math.abs(t - b.bottom) < 6)) tops.push(b.bottom);
    }
    return Math.max(1, tops.length);
  };
  // A block of running text: a sentence line, or a paragraph / list item with no block inside.
  const blocks = [...root.querySelectorAll('p, li, dd, span[class*=line]')].filter((el) => {
    if (!el.offsetParent || el.closest('[hidden]') || el.closest('button') || el.closest('[role=radiogroup]')) return false;
    // A run's event log: each entry is a button (time · what happened), not running text.
    if (el.querySelector(':scope > button')) return false;
    if (el.querySelector('p, li, dd, span[class*=line], div')) return false;
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    return t.length >= 6;
  });
  for (const el of blocks) {
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    const n = lineOf(el);
    if (n >= 2) out.push(['WRAP', n, t]);
    if (n >= 2) {
      // The last line: the text after the last line break the browser chose.
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const last = rects.length ? Math.max(...rects.map((r) => r.top)) : 0;
      const tail = rects.filter((r) => Math.abs(r.top - last) < 2).reduce((w, r) => w + r.width, 0);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (tail < fs * 3.2) out.push(['ORPHAN', n, t]);
    }
  }
  return { n: blocks.length, out };
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('robot-console-model', 'mycobot280-rdkx5');
    localStorage.setItem('park-all-open', 'true');
  } catch {
    /* private */
  }
});
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
await page.goto(`${base}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 });
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await page.getByRole('button', { name: '시뮬레이션만 (로봇 없이)' }).click({ timeout: 90000 }).catch(() => {});
await page.getByRole('tab', { name: '교육' }).click();
await page.waitForFunction(() => !!window.__learnOpen, null, { timeout: 120000 });

let blocks = 0;
let wraps = 0;
let orphans = 0;
const report = (where, r) => {
  blocks += r.n;
  for (const [kind, n, t] of r.out) {
    if (kind === 'WRAP') wraps++;
    else orphans++;
    console.log(`${where.padEnd(16)} ${kind.padEnd(6)} ${n}줄  ${t.slice(0, 70)}`);
  }
};
for (const id of ids) {
  for (const p of ['intro', 'theory', 'A', 'B', 'C', 'cmp', 'check']) {
    await page.evaluate(([t, at]) => window.__learnOpen(t, at), [id, p]);
    await page.waitForTimeout(700);
    report(`${id} ${p}`, await page.locator('aside[aria-label$="수업 카드"]').evaluate(measure));
  }
}
// Site labs: every problem × every step (as tools/check/site-ui.mjs opens them). `labs` checks only
// these and 로봇 실습 7.
const LABS = [
  ['공장', '__learnLab', null],
  ['물류', '__learnLogi', '__logiOpen'],
  ['바이오', '__learnBio', '__bioOpen'],
  ['팜', '__learnFarm', '__farmOpen'],
  ['시티', '__learnCafe', '__cafeOpen'],
  ['AI', '__learnAi', '__aiOpen'],
  ['자원순환', '__learnEnergy', '__energyOpen'],
];
const STEPS = ['brief', 'run', 'cause', 'fix', 'compare', 'done'];
if (process.argv.length <= 2 || ids.length === 0) {
  for (const [lab, learn, hook] of LABS) {
    await page.evaluate((f) => window[f](), learn);
    await page.waitForFunction((n) => !!window[n], hook ?? '__labOpen');
    await page.waitForTimeout(3000);
    for (const prob of [1, 2, 3]) {
      for (const step of STEPS) {
        const opts = { prob, solve: step === 'compare' || step === 'done', at: 'end' };
        if (hook) await page.evaluate(([n, s, o]) => window[n](s, o), [hook, step, opts]);
        else await page.evaluate(([p, s, o]) => window.__labOpen(p, s, o), [prob, step, { solve: opts.solve, at: 'end' }]);
        await page.waitForTimeout(lab === '물류' && ['run', 'cause', 'compare', 'done'].includes(step) ? 9000 : 2500);
        const panel = page.locator('aside[aria-label="실습 안내"]:visible').first();
        if (await panel.count()) report(`현장 ${lab} ${prob} ${step}`, await panel.evaluate(measure));
      }
    }
  }
}
// 로봇 실습 7: each unit's panel with every part opened in turn (알아보기 · 해 보기 · 문제 · 실물).
if (process.argv.length <= 2 || ids.length === 0) {
  await page.evaluate(() => window.__learnP7());
  await page.waitForTimeout(4000);
  const units = page.locator('nav[aria-label="실습 고르기"] button');
  for (let u = 0; u < (await units.count()); u++) {
    await units.nth(u).click();
    await page.waitForTimeout(800);
    const parts = page.locator('[role=tablist][aria-label="순서"] [role=tab]');
    for (let k = 0; k < (await parts.count()); k++) {
      await parts.nth(k).click();
      await page.waitForTimeout(400);
      const panel = page.locator('aside:has([aria-label="순서"])').first();
      report(`실습7 ${u + 1} ${k + 1}`, await panel.evaluate(measure));
    }
  }
}
await browser.close();
console.log(`text lines @${W}×${H}: ${blocks} text blocks, ${wraps} wrap (${Math.round((100 * wraps) / Math.max(1, blocks))}%), ${orphans} orphan`);
