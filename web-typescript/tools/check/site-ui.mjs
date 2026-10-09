// Layout and error check of the 산업단지 site labs and the 대단원 마무리 평가 as drawn: every lab ×
// every problem × every step, and the assessment's list and items, at two screen sizes. Reports the
// same problems as learn-ui.mjs (CLIPPED · WIDE · OFFCENTER · IMAGE), plus
//   ERROR     a page error or console error while the screen was open
//   MISSING   the screen did not open
// Needs the app running (npm run dev) and Playwright.
//   BASE=http://localhost:3000 node tools/check/site-ui.mjs [factory logistics bio farm cafe ai energy final]
import { chromiumPath, inspect, loadPlaywright } from './inspect.mjs';

const base = process.env.BASE ?? 'http://localhost:3000';
const SIZES = (process.env.SIZES ?? '1600x900,1366x768').split(',').map((s) => s.split('x').map(Number));
const ALL = ['factory', 'logistics', 'bio', 'farm', 'cafe', 'ai', 'energy', 'final'];
const want = process.argv.length > 2 ? process.argv.slice(2) : ALL;
const STEPS = ['brief', 'run', 'cause', 'fix', 'compare', 'done'];
/** How each lab is opened from the 교육 tab, and how a step of a problem is shown. */
const LABS = {
  factory: { learn: '__learnLab', open: (p, step, o) => window.__labOpen(p, step, o) },
  logistics: { learn: '__learnLogi', hook: '__logiOpen' },
  bio: { learn: '__learnBio', hook: '__bioOpen' },
  farm: { learn: '__learnFarm', hook: '__farmOpen' },
  cafe: { learn: '__learnCafe', hook: '__cafeOpen' },
  ai: { learn: '__learnAi', hook: '__aiOpen' },
  energy: { learn: '__learnEnergy', hook: '__energyOpen' },
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let total = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('robot-console-model', 'mycobot280-rdkx5');
      // Still pictures: the checks read the panels, not the ambient motion.
      localStorage.setItem('edu-ambient', 'off');
    } catch {
      /* private */
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('dialog', (d) => d.dismiss());
  await page.goto(`${base}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
  await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.getByRole('tab', { name: '교육' }).click();
  await page.waitForTimeout(1500);
  const seen = new Set();
  const report = (found, where) => {
    for (const [kind, what, detail] of found) {
      const key = `${w}|${kind}|${what}|${detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      console.log(`${w}×${h} ${where.padEnd(18)} ${kind.padEnd(9)} ${String(what).slice(0, 60)} — ${detail}`);
    }
  };
  const flushErrors = (where) => report(errors.splice(0).map((e) => ['ERROR', e.slice(0, 120), '']), where);
  const look = async (where, selectors) => {
    for (const sel of selectors) {
      const loc = page.locator(sel).filter({ visible: true }).first();
      if (!(await loc.count())) {
        report([['MISSING', sel, '화면에 없음']], where);
        continue;
      }
      report(await loc.evaluate(inspect), where);
    }
    flushErrors(where);
  };

  for (const lab of want.filter((x) => x !== 'final')) {
    const L = LABS[lab];
    await page.waitForFunction((n) => !!window[n], L.learn);
    await page.evaluate((n) => window[n](), L.learn);
    if (L.hook) await page.waitForFunction((n) => !!window[n], L.hook);
    else await page.waitForFunction(() => !!window.__labOpen);
    await page.waitForTimeout(3000);
    for (const prob of [1, 2, 3]) {
      for (const step of STEPS) {
        const opts = { prob, solve: step === 'compare' || step === 'done', at: 'end' };
        if (L.hook) await page.evaluate(([n, s, o]) => window[n](s, o), [L.hook, step, opts]);
        else await page.evaluate(([p, s, o]) => window.__labOpen(p, s, o), [prob, step, { solve: opts.solve, at: 'end' }]);
        // The runs are worked out when a step needs them (the palletising line's physics takes longest).
        await page.waitForTimeout(lab === 'logistics' && ['run', 'cause', 'compare', 'done'].includes(step) ? 9000 : 2500);
        await look(`${lab} ${prob} ${step}`, ['aside[aria-label="실습 안내"]', 'header:has(nav[aria-label="단계"])']);
      }
    }
  }

  if (want.includes('final')) {
    await page.waitForFunction(() => !!window.__learnFinal);
    await page.evaluate(() => window.__learnFinal());
    await page.waitForFunction(() => !!window.__finalOpen);
    await page.waitForTimeout(1500);
    await look('평가 목록', ['div[class*=hub]']);
    for (let k = 0; k < 6; k++) {
      await page.evaluate((i) => window.__finalOpen(i), k);
      const go = page.getByRole('button', { name: '▶ 지금 프로그램으로 가동' });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((x) => x.textContent?.includes('지금 프로그램으로 가동') && !x.disabled), null, { timeout: 240000 });
      await look(`평가 ${k + 1} 처음`, ['aside[aria-label="평가 문항"]', 'header:has(nav[aria-label="단계"])']);
      await go.click();
      await page.waitForTimeout(1500);
      await look(`평가 ${k + 1} 가동`, ['aside[aria-label="평가 문항"]']);
    }
    await page.evaluate(() => window.__finalOpen(null));
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /반 결과/ }).click();
    await page.waitForTimeout(600);
    await look('반 결과', ['[role=dialog][aria-label="반 결과"]']);
    await page.keyboard.press('Escape');
  }
  await ctx.close();
}
await browser.close();
console.log(total ? `site ui: ${total} problem(s)` : 'site ui: OK');
process.exit(total ? 1 : 0);
