// Layout check of the 교육 tab as drawn, every topic × every lesson page, at two
// screen sizes:
//   CLIPPED   text cut off by its box (overflow hidden / ellipsis)
//   WIDE      the page scrolls sideways
//   OFFCENTER text in a badge / key / chip / circle not centred in it
//   IMAGE     a picture that did not load
// Needs the app running (npm run dev) and Playwright.
//   BASE=http://localhost:3000 node tools/check/learn-ui.mjs [1-1 ...]   → prints problems, exit 1 if any
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { chromiumPath, inspect, loadPlaywright } from './inspect.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';

const all = JSON.parse(execFileSync('npx', ['tsx', '-e', "import('./src/engine/education/catalog.ts').then((m) => console.log(JSON.stringify((m.TOPICS ?? m.default.TOPICS).map((t) => t.id))))"], { cwd: web }).toString());
const ids = process.argv.length > 2 ? process.argv.slice(2) : all;
const SIZES = (process.env.SIZES ?? '1600x900,1366x768').split(',').map((s) => s.split('x').map(Number));

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let total = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('robot-console-model', 'mycobot280-rdkx5');
    } catch {
      /* private */
    }
  });
  const page = await ctx.newPage();
  // Slow software 3D (SwiftShader) can hold the page for a while: wait longer than Playwright's 30 s.
  page.setDefaultTimeout(90000);
  await page.goto(`${base}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
  // The intro's last frame waits for a choice: 시뮬레이터로 시작 (the robot's own console has none).
  await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.getByRole('button', { name: '시뮬레이션만 (로봇 없이)' }).click({ timeout: 90000 }).catch(() => {});
  // The app always opens on the simulator: go to 교육.
  await page.getByRole('tab', { name: '교육' }).click();
  await page.waitForTimeout(1500);
  const seen = new Set();
  const report = (found, where) => {
    for (const [kind, what, detail] of found) {
      // The same widget repeats on every page: report it once.
      const key = `${w}|${kind}|${what}|${detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      console.log(`${w}×${h} ${where.padEnd(14)} ${kind.padEnd(9)} ${String(what).slice(0, 50)} — ${detail}`);
    }
  };
  // The 교육 tab opens on the 로봇 시티: its bar and card, with nothing picked and with each place picked.
  const park = page.locator('section[aria-label="로봇 시티 3D 지도"]');
  if (await park.isVisible().catch(() => false)) {
    report(await page.locator('header:has(ol[aria-label="로드맵: 배우는 순서"])').evaluate(inspect), '로봇 시티 바');
    report(await park.locator('aside').evaluate(inspect), '로봇 시티 안내');
    for (const site of ['center', 'factory', 'logistics', 'ai', 'energy', 'data']) {
      await page.evaluate((x) => window.__parkSelect(x), site);
      await page.waitForTimeout(400);
      report(await park.locator('aside').evaluate(inspect), `현장 ${site}`);
    }
    await page.evaluate(() => window.__parkSelect(null));
    // 전체 차시: the course home (the roadmap and the 단원).
    await page.getByRole('button', { name: '전체 차시', exact: true }).click();
  } else report([['MISSING', '로봇 시티', '로봇 시티 지도가 안 보임']], '로봇 시티');
  // The course home, once per size: the page (after the roadmap has played), 장비 선택하기, a 단원 preview.
  await page.waitForTimeout(3000);
  const home = page.locator('section[aria-label="교육 홈"]');
  if (await home.isVisible().catch(() => false)) {
    report(await home.evaluate(inspect), '교육 홈');
    await home.getByRole('button', { name: '장비 선택하기', exact: true }).click();
    await page.waitForTimeout(700);
    report(await page.locator('[role=dialog][aria-labelledby="gear-title"]').evaluate(inspect), '장비 선택');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('button[data-card="1"]').click();
    await page.waitForTimeout(700);
    report(await page.locator('aside[aria-label$="단원 미리보기"]').evaluate(inspect), '단원 미리보기');
    await page.keyboard.press('Escape');
  } else report([['MISSING', '교육 홈', '교육 홈이 안 보임']], '교육 홈');
  await page.waitForFunction(() => !!window.__learnOpen, null, { timeout: 60000 });
  for (const id of ids) {
    await page.evaluate((t) => window.__learnOpen(t, 'intro'), id);
    await page.waitForTimeout(1200);
    const tabs = page.locator('nav[aria-label="수업 순서"] button');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(500);
      const label = (await tabs.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      report(
        [
          ...(await page.locator('aside[aria-label$="수업 카드"]').evaluate(inspect)),
          ...(await page.locator('section[aria-label="실습 제어판"]').evaluate(inspect)),
          ...(i === 0 ? await page.locator('nav[aria-label="수업 순서"]').evaluate(inspect) : []),
        ],
        `${id} ${label}`,
      );
    }
  }
  await ctx.close();
}
await browser.close();
console.log(total ? `learn ui: ${total} problem(s)` : 'learn ui: OK');
process.exit(total ? 1 : 0);
