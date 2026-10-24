// Screenshots of the two basic manuals (manuals/basic/teacher.md · student.md): the PC program without a
// robot, and the same screens connected to a robot. Needs two servers:
//   PC_BASE   the pages without a robot server, e.g. `python3 -m http.server 3001 -d robot-python/server/static`
//   BASE      a robot server — the real one, or the demo server with two pictures for cameras:
//             python3 robot-python/server/server.py --demo --port 8090 --camera kit.png,hand.png
//   PC_BASE=http://localhost:3001 BASE=http://localhost:8090 node tools/build/guide-shots/manual.mjs [name ...]
//   → ../manuals/basic/img/{s,c,r}-*.jpg|png (the 로봇 USB 만들기 pictures u-*.png come from tools/check/usb-maker.mjs)
import path from 'node:path';

import { BASE, launch, save, settle } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const OUT = path.join(web, '..', 'manuals', 'basic', 'img');
const PC = process.env.PC_BASE ?? 'http://localhost:3001';
const only = new Set(process.argv.slice(2));
const want = (n) => !only.size || only.has(n);
const out = (f) => path.join(OUT, f);

const { browser, page } = await launch();
page.setDefaultTimeout(90000);
const btn = (name, exact = false) => page.getByRole('button', { name, exact });
const screenTab = (name) => page.locator('nav[aria-label="화면"]').getByRole('tab', { name });
const rail = page.locator('nav[aria-label="메뉴"]');
const railBtn = (name) => rail.getByRole('button', { name: new RegExp(`^${name}`) });
/** The side panel's one screen (opened from the menu bar). */
const screen = () => page.locator('aside[aria-label="작업 패널"] [role=region]');
const openScreen = async (name) => {
  const b = railBtn(name);
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  await settle(page, 1200);
};
const top = page.locator('header[data-panel=topbar]');
const dlg = page.locator('[role=dialog][aria-label="로봇 연결"] [class*=pickerBox]').first();
let failed = 0;
const shot = async (name, f) => {
  if (!want(name)) return;
  try {
    await f();
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${String(e.message ?? e).split('\n')[0]}`);
  }
};

// ---------- 1 · PC 프로그램 (로봇 없이) ----------
await page.goto(`${PC}/console.html`, { waitUntil: 'load', timeout: 240000 });
await btn('연결하기', true).waitFor({ timeout: 240000 });
await settle(page, 2500);
await shot('intro', () =>
  save(page, out('s-intro.jpg'), {
    marks: [
      { at: btn('연결하기', true), n: 1, pos: 'l' },
      { at: btn('시뮬레이터로 시작'), n: 2, pos: 'r' },
    ],
  }),
);
await btn('연결하기', true).click();
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 }).catch(() => {});
await dlg.waitFor({ timeout: 240000 });
await settle(page, 3000);
const tabBtn = (name) => dlg.getByRole('tab', { name: new RegExp(name) });
await shot('connect', () =>
  save(page, out('c-find.jpg'), {
    crop: dlg,
    pad: 24,
    marks: [
      { at: tabBtn('로봇 찾기'), n: 1, pos: 'tl' },
      { at: tabBtn('ID 로 연결'), n: 2, pos: 'tl' },
      { at: tabBtn('유선 직결'), n: 3, pos: 'tr' },
      { at: dlg.locator('input[aria-label="찾을 네트워크"]'), n: 4, pos: 'l' },
      { at: btn('시뮬레이션만 (로봇 없이)'), n: 5, pos: 'l' },
    ],
  }),
);
await shot('connect-id', async () => {
  await tabBtn('ID 로 연결').click();
  await page.getByLabel('로봇 ID').fill('107');
  await settle(page, 1000);
  await save(page, out('c-id.jpg'), { crop: dlg, pad: 8 });
});
await shot('connect-direct', async () => {
  await tabBtn('유선 직결').click();
  await settle(page, 1000);
  await save(page, out('c-direct.jpg'), { crop: dlg, pad: 8 });
});
await btn('시뮬레이션만 (로봇 없이)').click();
await settle(page, 12000);

await shot('overview', () =>
  save(page, out('s-overview.jpg'), {
    marks: [
      { at: page.locator('nav[aria-label="화면"]'), n: 1, pos: 'bl' },
      { at: page.locator('[class*=connPill]'), n: 2, pos: 'bl' },
      { at: page.locator('button[title="설정"]'), n: 3, pos: 'bl' },
      { at: rail, n: 4, pos: 'r' },
      { at: { x: 560, y: 470, w: 0, h: 0 }, n: 5, box: false },
      { at: page.locator('[data-panel=viewtools]'), n: 6, pos: 'l' },
      { at: page.locator('[aria-label="관절 각도와 손끝 위치"]'), n: 7, pos: 'tr' },
      { at: page.locator('aside[aria-label="작업 패널"]'), n: 8, pos: 'tl' },
      { at: btn('기본 자세'), n: 9, pos: 'tl' },
    ],
  }),
);
await shot('viewtools', () => {
  const tools = page.locator('[data-panel=viewtools]');
  return save(page, out('s-viewtools.png'), {
    crop: tools,
    pad: 34,
    marks: [{ at: page.locator('[class*=viewCube]'), n: 1, pos: 'l' }, ...['처음 시점', '전체 맞춤', '확대', '축소'].map((name, i) => ({ at: tools.getByRole('button', { name }), n: i + 2, pos: 'l', box: false }))],
  });
});
await shot('jog', async () => {
  await openScreen('조그');
  await screen().getByRole('group', { name: '움직이는 방법' }).getByRole('button', { name: /^관절/ }).click();
  await settle(page, 1200);
  await save(page, out('s-jog.png'), { crop: screen(), pad: 10 });
});
await shot('jog-xyz', async () => {
  await openScreen('조그');
  await screen().getByRole('group', { name: '움직이는 방법' }).getByRole('button', { name: /^좌표/ }).click();
  await settle(page, 1500);
  await save(page, out('s-jog-xyz.png'), { crop: screen(), pad: 10 });
  await screen().getByRole('group', { name: '움직이는 방법' }).getByRole('button', { name: /^관절/ }).click();
});
await shot('tools', async () => {
  await openScreen('도구');
  await screen()
    .getByRole('button', { name: /어댑티브 그리퍼/ })
    .first()
    .click();
  await settle(page, 2500);
  await save(page, out('s-tools.png'), { crop: screen(), pad: 10 });
});
await shot('poses', async () => {
  await openScreen('자세');
  await screen()
    .getByRole('button', { name: /지금 자세 저장하기/ })
    .click();
  await settle(page, 1500);
  await save(page, out('s-poses.png'), { crop: [screen().getByRole('button', { name: /지금 자세 저장하기/ }), screen().getByText(/에서도 이 이름으로/)], pad: 14 });
});
await shot('library', async () => {
  await screenTab('라이브러리').click();
  await settle(page, 5000);
  await save(page, out('s-library.jpg'));
});
await shot('archive', async () => {
  await screenTab('자료실').click();
  await settle(page, 5000);
  await save(page, out('s-archive.jpg'));
  await screenTab('시뮬레이터').click();
  await settle(page, 3000);
});

// ---------- 2 · 로봇에 연결한 화면 ----------
// The demo robot's flange (demo server only): no gripper, as the screen's 도구 없음.
const fit = (gripper) => page.evaluate((g) => fetch('/api/demo/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gripper: g }) }).catch(() => {}), gripper);
await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
await settle(page, 8000);
await btn('나중에')
  .click({ timeout: 4000 })
  .catch(() => {});
await fit(false);
await btn('기본 자세').click();
await settle(page, 6000);
await btn('나중에')
  .click({ timeout: 2000 })
  .catch(() => {});
// The demo arm answers with no gripper after fit(false); a notice left from before closes here.
await btn('닫기', true)
  .first()
  .click({ timeout: 3000 })
  .catch(() => {});
await settle(page, 800);

await shot('robot', () =>
  save(page, out('r-console.jpg'), {
    marks: [
      { at: page.locator('[class*=connPill]'), n: 1, pos: 'bl' },
      { at: top.getByRole('button', { name: /로봇 정지/ }), n: 2, pos: 'bl' },
      { at: page.locator('button[title*="로봇 상태 자세히"]'), n: 3, pos: 'l' },
      { at: railBtn('영점'), n: 4, pos: 'r' },
      { at: btn('기본 자세'), n: 5, pos: 'tl' },
    ],
  }),
);
await shot('status', async () => {
  await page.locator('button[title*="로봇 상태 자세히"]').click();
  const pop = page.getByRole('dialog', { name: '로봇 상태' });
  await pop.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog][aria-label="로봇 상태"] button')].some((b) => b.textContent?.includes('연결 확인') && !b.disabled), null, { timeout: 120000 });
  await settle(page, 600);
  await save(page, out('r-status.png'), { crop: [pop, page.locator('button[title*="로봇 상태 자세히"]')], pad: 12 });
  await page.keyboard.press('Escape');
  await settle(page, 800);
});
await shot('zero', async () => {
  await openScreen('영점');
  await settle(page, 1500);
  const zeroCrop = () => [screen().getByText('6축 맞추기'), screen().getByRole('button', { name: '닫기', exact: true })];
  await save(page, out('r-zero-1.png'), { crop: zeroCrop(), pad: 14 });
  await screen()
    .getByRole('button', { name: /준비됐어요/ })
    .click();
  await settle(page, 1500);
  await save(page, out('r-zero-2.png'), { crop: zeroCrop(), pad: 14 });
  await screen()
    .getByRole('button', { name: /0° 자세로/ })
    .first()
    .click();
  await page.waitForFunction(() => [...document.querySelectorAll('aside[aria-label="작업 패널"] button')].some((b) => /맞음/.test(b.textContent ?? '')), null, { timeout: 120000 });
  await settle(page, 2500);
  await save(page, out('r-zero-3.png'), { crop: zeroCrop(), pad: 14 });
  await screen()
    .getByRole('button', { name: /닫기|그만/ })
    .first()
    .click()
    .catch(() => {});
  await settle(page, 1000);
});
await shot('wifi', async () => {
  await page.locator('[class*=connPill]').click();
  await dlg.waitFor();
  await dlg.getByRole('tab', { name: /로봇 Wi-Fi/ }).click();
  await settle(page, 3000);
  await save(page, out('r-wifi.jpg'), { crop: dlg, pad: 8 });
  await page.keyboard.press('Escape');
  await settle(page, 1000);
});
await shot('settings', async () => {
  await page.locator('button[title="설정"]').click();
  await settle(page, 1000);
  await save(page, out('r-settings.png'), { crop: [page.locator('button[title="설정"]'), page.locator('[class*=menuPop]')], pad: 12 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
});
await shot('prep', async () => {
  await page.locator('button[title="설정"]').click();
  await page.getByRole('menuitem', { name: /검수 시연 \(교사용\)/ }).click();
  await settle(page, 5000);
  await btn(/검수 준비 점검/)
    .first()
    .click();
  const d = page.getByRole('dialog', { name: '검수 준비 점검' });
  await d.getByText('그리퍼', { exact: true }).waitFor({ timeout: 60000 });
  await settle(page, 1500);
  await save(page, out('r-prep.jpg'), { crop: d.locator('[class*=pickerBox]'), pad: 8 });
  await d.getByRole('button', { name: '닫기' }).click();
  await page.locator('button[title="설정"]').click();
  await page
    .getByRole('menuitem', { name: /검수 시연 끝내기/ })
    .click()
    .catch(() => {});
  await settle(page, 2000);
});

await fit(true);
await browser.close();
console.log(failed ? `\n${failed} 장을 찍지 못했어요.` : '\n모두 찍었어요.');
process.exit(failed ? 1 : 0);
