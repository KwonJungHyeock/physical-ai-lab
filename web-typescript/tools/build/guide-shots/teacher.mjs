// Screenshots of manuals/course/teacher-guide.md (교사용 교육 가이드라인). Needs `npm run dev`.
//   node tools/build/guide-shots/teacher.mjs [name ...]   → ../manuals/course/img/*.jpg|png
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { launch, save, settle } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const OUT = path.join(web, '..', 'manuals', 'course', 'img');
const only = new Set(process.argv.slice(2));
const want = (n) => !only.size || only.has(n);
const out = (f) => path.join(OUT, f);
const TOPIC = '5-2';

const { browser, page } = await launch({ storage: { 'robot-console-model': 'mycobot280-rdkx5' } });
// Software 3D on a busy machine can hold the page for a while.
page.setDefaultTimeout(90000);
const btn = (name, exact = false) => page.getByRole('button', { name, exact });
const aside = () => page.locator('aside[aria-label$="수업 카드"]');
const scrollAside = (to) =>
  aside().evaluate((root, to) => {
    const el = [root, ...root.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY));
    if (el) el.scrollTop = to === 'end' ? el.scrollHeight : to;
  }, to);
const pageTab = (label) => page.locator('nav[aria-label="수업 순서"] button', { hasText: label }).first();
const panel = page.locator('section[aria-label="실습 제어판"]');

// A first visit: the 교육 home with the default equipment.
await page.addInitScript(() => {
  for (const k of ['learn-resume', 'learn-done', 'learn-owned', 'learn-level', 'learn-topic']) localStorage.removeItem(k);
});
await page.goto(`${process.env.BASE ?? 'http://localhost:3000'}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
// The intro's last frame waits for a choice: 시뮬레이터로 시작 (the robot's own console has none).
await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 }).catch(() => {});
await btn('시뮬레이션만 (로봇 없이)').click({ timeout: 20000 }).catch(() => {});
// The app always opens on the simulator: go to 교육.
await page.getByRole('tab', { name: '교육' }).click();
await settle(page, 4000);
// The 교육 tab opens on the 로봇 시티: the course home is behind 전체 차시.
await page.getByRole('button', { name: '전체 차시', exact: true }).click().catch(() => {});
await settle(page, 3000);

// 1 · 교육 홈 (히어로 · 로드맵) · 장비 선택 · 단원 목록 · 단원 미리보기
const home = page.locator('section[aria-label="교육 홈"]');
const scrollHome = (sel) =>
  home.evaluate((root, sel) => {
    const box = root.parentElement;
    const el = sel ? root.querySelector(sel) : null;
    box.scrollTop = el ? el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 : 0;
  }, sel);
if (want('home'))
  await save(page, out('01-home.jpg'), {
    marks: [
      { at: home.getByRole('combobox', { name: '수업 대상' }), n: 1, pos: 'tr' },
      { at: home.getByRole('button', { name: /처음 시작하기|이어서 수업하기/ }), n: 2, pos: 'bl' },
      { at: home.getByRole('button', { name: '장비 선택하기', exact: true }), n: 3, pos: 'br' },
      { at: home.locator('section[aria-label="학습 로드맵"]'), n: 4, pos: 'tl' },
    ],
  });
if (want('gear')) {
  await home.getByRole('button', { name: '장비 선택하기', exact: true }).click();
  await settle(page, 1500);
  await save(page, out('01b-gear.jpg'));
  await page.keyboard.press('Escape');
  await settle(page, 600);
}
if (want('map')) {
  await scrollHome('[data-part="I"]');
  await settle(page, 1200);
  await save(page, out('01c-map.jpg'), {
    marks: [
      { at: home.locator('[data-part="I"] aside'), n: 1, pos: 'tl' },
      { at: page.locator('button[data-card="1"]'), n: 2, pos: 'tr' },
      { at: home.locator('[data-unit="1"] ol'), n: 3, pos: 'l' },
    ],
  });
}
await page.locator('button[data-card="2"]').click();
await settle(page, 3000);
const drawer = page.locator('aside[aria-label$="단원 미리보기"]');
if (want('unit'))
  await save(page, out('02-unit.jpg'), {
    crop: drawer,
    pad: 34,
    marks: [
      { at: drawer.locator('header').first(), n: 1, pos: 'l' },
      { at: drawer.locator('[class*=facts]'), n: 2, pos: 'l' },
      { at: drawer.locator('button[aria-current="true"]'), n: 3, pos: 'l' },
      { at: drawer.getByRole('button', { name: /수업 시작/ }), n: 4, pos: 'l' },
    ],
  });
await page.keyboard.press('Escape');
await settle(page, 600);

// 2 · 수업 화면 (16차시 5-2 PID, 활동 2): the lesson in one rail on the left of the 3D view
await page.evaluate((t) => window.__learnOpen(t, 'B'), TOPIC);
await settle(page, 5000);
const teacherBtn = aside().locator('button[aria-pressed]', { hasText: '교사용' }).first();
const setTeacher = async (on) => {
  if ((await teacherBtn.getAttribute('aria-pressed')) !== String(on)) await teacherBtn.click();
  await settle(page, 800);
};
await setTeacher(false);
if (want('topic'))
  await save(page, out('03-topic.jpg'), {
    marks: [
      { at: page.locator('nav[aria-label="수업 순서"]'), n: 1, pos: 'tl' },
      { at: aside(), n: 2, pos: 'tr' },
      { at: { x: 860, y: 420, w: 0, h: 0 }, n: 3, box: false },
      { at: teacherBtn, n: 4, pos: 'b' },
      { at: aside().locator('footer'), n: 5, pos: 'tr' },
    ],
  });
// One try: the guess, then the topic's run button, then the result and the reason.
await panel.getByRole('group', { name: '예상 고르기' }).or(panel.getByRole('radiogroup', { name: '예상 고르기' })).getByRole('radio').first().click().catch(() => {});
await settle(page, 1500);
await panel.locator('[class*=guideControls] button[class*=primary]:not([disabled])').first().click().catch(() => {});
await page.waitForFunction(() => document.querySelector('section[aria-label="실습 제어판"] [data-kind="result"][data-st="now"]'), null, { timeout: 120000 }).catch(() => {});
await settle(page, 2500);
if (want('rail')) {
  // The rail scrolls: a tall window shows the activity's whole flow at once.
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 2000 });
  await settle(page, 4000);
  await scrollAside(0);
  await save(page, out('07-rail.png'), {
    // From the 지금 할 일 strip down, so the crop never cuts it in half.
    crop: [aside().locator('[aria-label="지금 할 일"]'), panel],
    pad: 34,
    marks: [
      { at: panel.locator('[class*=change]').first(), n: 1, pos: 'l' },
      { at: panel.locator('[data-kind="ask"]'), n: 2, pos: 'l' },
      { at: panel.locator('[data-kind="do"]'), n: 3, pos: 'l' },
      { at: panel.locator('[data-kind="result"]'), n: 4, pos: 'l' },
      { at: panel.locator('[data-kind="read"]').last(), n: 5, pos: 'l' },
    ],
  });
  await page.setViewportSize(vp);
  await settle(page, 3000);
}
if (want('activity')) {
  await setTeacher(true);
  await aside().locator('[data-kind="teacher"]').last().scrollIntoViewIfNeeded().catch(() => {});
  await settle(page, 1200);
  await save(page, out('06-activity.jpg'), { crop: aside(), pad: 6 });
}
await setTeacher(true);

const shootPage = async (label, file, opts = {}) => {
  await pageTab(label).click();
  await settle(page, 2600);
  await scrollAside(0);
  await save(page, out(file), { crop: aside(), pad: 6, ...opts });
};
if (want('intro')) await shootPage('도입', '04-intro.jpg');
if (want('concept')) await shootPage('개념', '05-concept.jpg');
if (want('wrapup')) await shootPage('정리', '09-wrapup.jpg');
if (want('check')) {
  await pageTab('평가').click();
  await settle(page, 2000);
  await aside().getByRole('button', { name: 'X', exact: true }).first().click().catch(() => {});
  await aside().getByRole('button', { name: 'O', exact: true }).nth(1).click().catch(() => {});
  await settle(page, 1200);
  await save(page, out('10-check.jpg'), { crop: aside(), pad: 6 });
}
if (want('symbol')) {
  await pageTab('개념').click();
  await settle(page, 2000);
  const chip = aside().locator('button[class*=sym]:visible').first();
  await chip.click();
  await settle(page, 900);
  // The bubble the chip opened (its aria-describedby), not any other tooltip on the page.
  const bubble = page.locator(`[id="${await chip.getAttribute('aria-describedby')}"]`);
  await save(page, out('11-symbol.png'), { crop: [chip, bubble], pad: 20 });
  await page.keyboard.press('Escape');
}
if (want('clip')) {
  await pageTab('활동 1').click();
  await settle(page, 1500);
  await aside().locator('details', { hasText: '그림 · 시연으로 다시 보기' }).locator('summary').click();
  await settle(page, 1200);
  await aside().getByRole('button', { name: '▶ 시연' }).first().click();
  await settle(page, 5000);
  await save(page, out('12-clip.jpg'));
  await page.keyboard.press('Escape');
  await settle(page, 800);
}
if (want('materials')) {
  // 자료실: a folder window — 교재 · 문항지 (단원 1).
  await page.getByRole('tab', { name: '자료실' }).click();
  await settle(page, 2500);
  const tree = page.locator('[role=tree][aria-label="폴더"]');
  const folder = (name) => tree.locator('[role=treeitem]', { hasText: name }).locator('button').filter({ hasText: name }).first();
  await folder('교재 · 문항지').click();
  await settle(page, 800);
  await folder('1. 기초 로봇공학').click();
  await settle(page, 1500);
  await page.locator('[aria-label$="안의 항목"] [role=option]').first().click().catch(() => {});
  await settle(page, 2000);
  await save(page, out('14-materials.jpg'));
}
await browser.close();

// 3 · 인쇄 교재 · 문항지 견본 (자료실 PDF 의 한 쪽)
if (want('pdf')) {
  const mat = path.join(web, 'public', 'materials');
  const pdf = (src, pageNo, file) => {
    execFileSync('pdftoppm', ['-r', '110', '-png', '-f', String(pageNo), '-l', String(pageNo), '-singlefile', path.join(mat, src), out(file).replace(/\.png$/, '')]);
    console.log(`  ${file}`);
  };
  pdf('theory-5.pdf', 1, '16-pdf-cover.png');
  pdf('theory-5.pdf', 6, '17-pdf-theory.png');
  pdf('theory-5.pdf', 7, '18-pdf-activity.png');
  pdf('ox-5.pdf', 1, '19-pdf-ox.png');
}
