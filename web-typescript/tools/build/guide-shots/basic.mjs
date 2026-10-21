// Screenshots of manuals/course/basic-training.md (로봇 기초교육 자료): the console as it is on a connected
// robot. Needs a robot server — the real one, or the demo server with two pictures for cameras:
//   python3 robot-python/server/server.py --demo --port 8090 --camera kit.jpg,hand.png
//   BASE=http://localhost:8090 node tools/build/guide-shots/basic.mjs [name ...]   → ../manuals/course/img/b-*.jpg|png
import path from 'node:path';

import { BASE, launch, save, settle } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const OUT = path.join(web, '..', 'manuals', 'course', 'img');
const only = new Set(process.argv.slice(2));
const want = (n) => !only.size || only.has(n);
const out = (f) => path.join(OUT, f);

const { browser, page } = await launch();
page.setDefaultTimeout(90000);
await page.addInitScript(() => {
  const st = window.setTimeout.bind(window);
  window.__hold = false;
  window.setTimeout = (fn, ms, ...a) => st(fn, window.__hold && ms >= 4000 && ms <= 20000 ? 3600000 : ms, ...a);
});
const hold = (on) => page.evaluate((v) => (window.__hold = v), on);
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

// The PC program's side (PC_BASE: the same pages without a robot server, e.g. a static server on the
// export): the intro's [연결하기] → 로봇 연결 → [ID 로 연결].
if (process.env.PC_BASE && want('connect')) {
  await page.goto(`${process.env.PC_BASE}/console.html`, { waitUntil: 'load', timeout: 240000 });
  await btn('연결하기', true).waitFor({ timeout: 240000 });
  await settle(page, 2000);
  await btn('연결하기', true).click();
  const dlg = page.locator('[role=dialog][aria-label="로봇 연결"] [class*=pickerBox]').first();
  await dlg.waitFor({ timeout: 240000 });
  await settle(page, 3000);
  await dlg.getByRole('tab', { name: /ID 로 연결/ }).click().catch(() => dlg.getByText('ID 로 연결').first().click());
  await page.getByLabel('로봇 ID').fill('107');
  await settle(page, 1200);
  await save(page, out('b-connect.jpg'), { crop: dlg, pad: 8 });
  if (only.size === 1) {
    await browser.close();
    process.exit(0);
  }
}

await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
await settle(page, 8000);
await btn('나중에').click({ timeout: 4000 }).catch(() => {});
await settle(page, 1500);

// 1 · 연결된 화면 한눈에
await shot('console', async () => {
  await btn('기본 자세').click();
  await settle(page, 6000);
  await save(page, out('b-console.jpg'), {
    marks: [
      { at: top.locator('nav[aria-label="화면"]'), n: 1, pos: 'b' },
      { at: page.locator('[class*=connChip], [class*=conn]').filter({ hasText: '연결됨' }).first(), n: 2, pos: 'b' },
      { at: top.getByRole('button', { name: /로봇 정지/ }), n: 3, pos: 'b' },
      { at: page.locator('button[title="로봇 상태 자세히 보기"]'), n: 4, pos: 'l' },
      { at: rail, n: 5, pos: 'r' },
      { at: btn('기본 자세'), n: 6, pos: 't' },
    ],
  });
});

// 2 · 로봇 상태 (연결 확인 · 손으로 움직이기 · 영점 맞추기)
await shot('status', async () => {
  await page.locator('button[title="로봇 상태 자세히 보기"]').click();
  await settle(page, 1500);
  const pop = page.getByRole('dialog', { name: '로봇 상태' });
  await pop.waitFor();
  // The buttons wait while the arm still moves (it goes to 기본 자세 when the page opens).
  await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog][aria-label="로봇 상태"] button')].some((b) => b.textContent?.includes('연결 확인') && !b.disabled), null, { timeout: 120000 });
  await settle(page, 600);
  await save(page, out('b-status.png'), { crop: [pop, page.locator('button[title="로봇 상태 자세히 보기"]')], pad: 12 });
  await page.keyboard.press('Escape');
  await page.locator('button[title="로봇 상태 자세히 보기"]').click().catch(() => {});
  await settle(page, 800);
});

// 3 · 수동 제어: 관절별로 · 좌표로
await shot('jog', async () => {
  await openScreen('조그');
  const jog = screen();
  await jog.locator('[class*=frameSeg]').getByRole('button', { name: '관절', exact: true }).click();
  await settle(page, 1200);
  await save(page, out('b-jog.png'), { crop: jog, pad: 10 });
});
await shot('jog-xyz', async () => {
  await openScreen('조그');
  const jog = screen();
  await jog.locator('[class*=frameSeg]').getByRole('button', { name: '좌표', exact: true }).click();
  await settle(page, 1500);
  await save(page, out('b-jog-xyz.png'), { crop: jog, pad: 10 });
});

// 4 · 도구 (그리퍼 · 흡착 펌프)
await shot('tools', async () => {
  await openScreen('도구');
  const sec = screen();
  await sec.getByRole('button', { name: /어댑티브 그리퍼/ }).first().click();
  await settle(page, 2500);
  await save(page, out('b-tools.png'), { crop: sec, pad: 10 });
});

// 5 · 자세 저장
await shot('poses', async () => {
  await openScreen('자세');
  const sec = screen();
  await sec.getByRole('button', { name: /지금 자세 저장하기/ }).click();
  await settle(page, 1500);
  await save(page, out('b-poses.png'), { crop: sec, pad: 10 });
});

// 6 · 블록 코딩 → 시뮬레이션 → 로봇에서 실행
await shot('blocks', async () => {
  await railBtn('블록').click();
  await settle(page, 4000);
  await save(page, out('b-blocks.jpg'), {
    marks: [
      { at: page.locator('[data-panel=mission]'), n: 1, pos: 'tl' },
      { at: page.locator('[aria-label="블록 꾸러미"]'), n: 2, pos: 'tl' },
      { at: page.locator('[data-panel=run]'), n: 3, pos: 'tl' },
    ],
  });
});
await shot('run', async () => {
  await hold(true);
  await page.locator('[data-panel=run]').getByRole('button', { name: '시뮬레이션', exact: true }).click();
  await page.locator('[class*=resultCard]').waitFor({ timeout: 300000 });
  await settle(page, 4000);
  await page.screenshot({ type: 'jpeg', quality: 10, timeout: 120000 });
  await save(page, out('b-run.jpg'), {
    marks: [
      { at: page.locator('[class*=resultCard]'), n: 1, pos: 'tl' },
      { at: page.locator('[data-panel=run]'), n: 2, pos: 'tl' },
    ],
  });
  await hold(false);
  await page.locator('[class*=resultClose]').click().catch(() => {});
  await settle(page, 1000);
});

// 7 · 라이브러리 · 자료실 · 설정
await shot('library', async () => {
  await screenTab('라이브러리').click();
  await settle(page, 5000);
  await save(page, out('b-library.jpg'));
});
await shot('archive', async () => {
  await screenTab('자료실').click();
  await settle(page, 5000);
  await save(page, out('b-archive.jpg'));
});
await shot('settings', async () => {
  await screenTab('시뮬레이터').click();
  await settle(page, 3000);
  await page.locator('button[title="설정"]').click();
  await settle(page, 1000);
  await save(page, out('b-settings.png'), { crop: page.getByRole('menu'), pad: 1 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
});
await shot('checks', async () => {
  await page.locator('button[title="설정"]').click();
  await page.getByRole('menuitem', { name: /검수 시연 \(교사용\)/ }).click();
  await settle(page, 5000);
  await save(page, out('b-checks.jpg'), {
    marks: [
      { at: page.locator('[class*=pageActions]'), n: 1, pos: 'bl' },
      { at: page.locator('button[data-lib^="check-"]').first(), n: 2, pos: 'tl' },
    ],
  });
  await btn(/검수 준비 점검/).first().click();
  const dlg = page.getByRole('dialog', { name: '검수 준비 점검' });
  await dlg.getByText('그리퍼', { exact: true }).waitFor({ timeout: 60000 });
  await settle(page, 1500);
  await save(page, out('b-prep.jpg'), { crop: dlg.locator('[class*=pickerBox]'), pad: 8 });
  await dlg.getByRole('button', { name: '닫기' }).click();
  // Back to the students' screen.
  await page.locator('button[title="설정"]').click();
  await page.getByRole('menuitem', { name: /검수 시연 끝내기/ }).click().catch(() => {});
  await settle(page, 2000);
});

// 8 · 교육: 지도 · 수업 · 현장 실습 · 로봇 실습 7
await shot('map', async () => {
  await screenTab('교육').click();
  await page.waitForFunction(() => typeof window.__learnP7 === 'function', null, { timeout: 120000 });
  await settle(page, 9000);
  await save(page, out('b-map.jpg'), {
    marks: [
      { at: page.locator('ol[aria-label="로드맵: 배우는 순서"]'), n: 1, pos: 'b' },
      { at: page.locator('section[aria-label="로봇 시티 3D 지도"]'), n: 2, pos: 'tl' },
      { at: page.locator('nav[aria-label="기술 키워드로 찾기"]'), n: 3, pos: 'tl' },
    ],
  });
});
await shot('lesson', async () => {
  await page.evaluate(() => window.__learnOpen('1-1'));
  await settle(page, 9000);
  await save(page, out('b-lesson.jpg'), {
    marks: [
      { at: page.getByRole('button', { name: /전체 차시|지도/ }).first(), n: 1, pos: 'b' },
      { at: page.locator('[role=region][aria-label="실물 연동"]'), n: 2, pos: 't' },
    ],
  });
});
await shot('follow', async () => {
  const bar = page.locator('[role=region][aria-label="실물 연동"]');
  await bar.getByRole('button', { name: /실물 연동/ }).click();
  await settle(page, 3000);
  await save(page, out('b-follow.png'), { crop: bar, pad: 10 });
  await bar.getByRole('button', { name: /실물 멈춤/ }).click().catch(() => {});
  await settle(page, 1500);
});
await shot('site', async () => {
  await page.evaluate(() => window.__learnLab?.());
  await settle(page, 10000);
  await save(page, out('b-site.jpg'));
});
await shot('p7', async () => {
  await page.evaluate(() => window.__learnP7());
  await settle(page, 7000);
  const panel = page.locator('aside[aria-label]').filter({ has: page.locator('[role=tablist][aria-label="순서"]') });
  await save(page, out('b-p7.jpg'), {
    marks: [
      { at: page.locator('nav[aria-label="실습 고르기"]'), n: 1, pos: 'b' },
      { at: panel.locator('[role=tablist][aria-label="순서"]'), n: 2, pos: 'l' },
      { at: page.locator('section[aria-label="3D 실습 화면"]'), n: 3, pos: 'tl' },
    ],
  });
  await panel.getByRole('tab', { name: /실물로/ }).click();
  await settle(page, 1500);
  await panel.getByRole('button', { name: '실물로 6축 움직이기' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.includes('■ 멈추기') && b.offsetParent), null, { timeout: 240000 });
  await settle(page, 2000);
  await save(page, out('b-p7-real.jpg'), { crop: panel, pad: 8 });
});

await browser.close();
console.log(failed ? `\n${failed} 장을 찍지 못했어요.` : '\n모두 찍었어요.');
process.exit(failed ? 1 : 0);
