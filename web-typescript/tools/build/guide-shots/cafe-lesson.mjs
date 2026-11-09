// The 로봇 카페 교안 · 학습지 pictures (tools/build/cafe-lesson.mts): each quest's screen as the
// student sees it, the screen guide with numbered badges, the 학습 기록, the 교사 열쇠 and the
// projector screen. Into manuals/course/img/cafe/.
//   BASE=http://localhost:3123 node tools/build/guide-shots/cafe-lesson.mjs
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

import { BASE, mark, save, settle, unmark } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const out = (f) => path.join(path.dirname(web), 'manuals', 'course', 'img', 'cafe', f);

const now = Date.UTC(2026, 10, 9, 1, 0);
const record = {
  kind: 'robot-cafe-record',
  name: '김하나',
  no: '7',
  plan: 4,
  at: now,
  quests: { F1: { tries: 1, passed: true, openedAt: now - 9 * 60000, passedAt: now - 4 * 60000 }, F2: { tries: 2, passed: true, openedAt: now - 4 * 60000, passedAt: now - 60000 } },
  checks: { 'F1.1': { chosen: 1, ok: true }, 'F2.1': { chosen: 1, ok: true }, 'F1.2': { chosen: 1, ok: false } },
};

// Not lib.launch: its saved start state keeps the 입문 intro on screen; this page starts as a class does.
const { chromium } = createRequire(path.join(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.5 });
// Swiftshader draws the café slowly: every wait gets time.
page.setDefaultTimeout(180000);
await page.addInitScript(
  (s) => {
    try {
      if (sessionStorage.getItem('shot')) return;
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      sessionStorage.setItem('shot', '1');
    } catch {
      /* private */
    }
  },
  {
    'life-cafe-teacher': JSON.stringify({ plan: 4, lesson: 1, allOpen: true }),
    'life-cafe-record': JSON.stringify(record),
    'robot-console-cell-passed': JSON.stringify({ F1: true, F2: true }),
  },
);
// The spotlight's dimming is for the first look on a screen; a printed page keeps the pointer only.
// The headless browser's software 3D trips the app's draw check (a false '3D 화면을 그리지 못했어요'): not shown.
const quiet = () => page.addStyleTag({ content: '[class*=__shade]{opacity:0!important} [data-panel=log] [data-kind=err]{display:none!important}' });
await page.goto(`${BASE}/track/life?plan=4&lesson=1`, { waitUntil: 'load', timeout: 240000 });
await page.waitForFunction(() => /THEME/.test(document.body.innerText), null, { timeout: 240000 });
await page.waitForTimeout(3000);
await page.getByText('THEME', { exact: true }).first().click();
await settle(page, 6000);
if (process.env.DEBUG) {
  await page.screenshot({ path: process.env.DEBUG });
  console.log(
    await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label]')]
        .map((b) => b.getAttribute('aria-label'))
        .slice(0, 40)
        .join(' | '),
    ),
  );
}

const openQuest = async (n) => {
  // The café opens on quest 1 running (주문 한 잔 따라가기): stop it, past its O · X, until the panel is back.
  for (let k = 0; k < 30 && !(await page.evaluate((n) => !!document.querySelector(`button[aria-label^="퀘스트 ${n} "]:not(:disabled)`), n)); k += 1) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('답하지 않고'))?.click());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
  }
  await page.evaluate((n) => document.querySelector(`button[aria-label^="퀘스트 ${n} "]`)?.click(), n);
  await settle(page, 5000);
  await quiet();
};

for (let n = 1; n <= 8; n += 1) {
  await openQuest(n);
  await save(page, out(`F${n}.jpg`));
  console.log(`  F${n}.jpg`);
}

// The screen guide (교안 3쪽): quest 5 (a short panel: the 차시 판 in sight), its parts numbered.
await openQuest(5);
await mark(page, [
  { at: page.locator('[class*=qPage]'), n: 1, pos: 'l' },
  { at: page.locator('[class*=qTrack]'), n: 2, pos: 'l' },
  { at: page.locator('[data-panel="run"]').first(), n: 3, pos: 'l' },
  { at: page.locator('section[aria-label$="오늘 배울 것"]'), n: 4, pos: 'l' },
  { at: page.locator('button[title^="학습 기록"]'), n: 5, pos: 'b' },
  { at: page.locator('[title="설정"]').first(), n: 6, pos: 'b' },
]);
await save(page, out('screen.jpg'));
await unmark(page);
console.log('  screen.jpg');

await page.locator('button[title^="학습 기록"]').click();
await settle(page, 800);
await save(page, out('record.jpg'), { crop: page.locator('[role=dialog][aria-label="학습 기록"]') });
await page.locator('[role=dialog][aria-label="학습 기록"] button[aria-label="닫기"]').click();
console.log('  record.jpg');

await page.locator('[title="설정"]').first().click();
await page.waitForTimeout(500);
await page.getByRole('menuitem', { name: /교사 열쇠/ }).click();
await settle(page, 800);
await save(page, out('teacher.jpg'), { crop: page.locator('[role=dialog][aria-label="교사 열쇠"]') });
console.log('  teacher.jpg');
await page.getByRole('button', { name: '수업 화면 띄우기 (프로젝터)' }).click();
await settle(page, 800);
await page.getByRole('button', { name: '정답 보기' }).click();
await save(page, out('projector.jpg'));
console.log('  projector.jpg');
await browser.close();
