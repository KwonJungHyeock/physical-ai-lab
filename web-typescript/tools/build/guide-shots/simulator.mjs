// Screenshots of the simulator guide (manuals/simulator/guide.md): the PC program without a robot, from
// the first screen through 제어 · 도구 · 자세 · 공정 · 코딩 · 손 따라하기. One server, the static pages:
//   python3 -m http.server 3001 -d robot-python/server/static     (or the program's own pages)
//   BASE=http://localhost:3001 HAND_Y4M=<a .y4m of a hand> node tools/build/guide-shots/simulator.mjs [name ...]
//   → ../manuals/simulator/img/g-*.jpg|png
// 손 따라하기 needs a picture of a hand as the camera (HAND_Y4M, 640×480 .y4m); without it those shots are skipped.
import path from 'node:path';

import { BASE, launch, save, settle } from './lib.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const OUT = path.join(web, '..', 'manuals', 'simulator', 'img');
const only = new Set(process.argv.slice(2));
const want = (n) => !only.size || only.has(n);
const out = (f) => path.join(OUT, f);
const HAND = process.env.HAND_Y4M;

// The 처음 시작 card open, nothing done yet (the first open on a PC).
const { browser, page } = await launch({ storage: { 'robot-console-start': JSON.stringify({ done: [], folded: false }) }, camera: HAND });
page.setDefaultTimeout(90000);
const btn = (name, exact = false) => page.getByRole('button', { name, exact });
const rail = page.locator('nav[aria-label="메뉴"]');
const railBtn = (name) => rail.getByRole('button', { name: new RegExp(`^${name}`) });
const panel = page.locator('aside[aria-label="작업 패널"]');
/** The side panel's one screen (opened from the menu bar). */
const screen = () => panel.locator('[role=region]').first();
const openScreen = async (name) => {
  const b = railBtn(name);
  if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
  await settle(page, 1500);
};
const runGroup = page.locator('[role=group][aria-label="실행"]').first();
const simBtn = runGroup.locator('button[aria-label="시뮬레이션"]');
/** ▶ 시뮬레이션 and wait until the run is over (the button comes back). */
const simulate = async () => {
  await simBtn.click();
  await page.waitForTimeout(1500);
  // The work panel (with the button) folds while a program runs and comes back when it is over.
  await page.waitForFunction(
    () => {
      const b = document.querySelector('[role=group][aria-label="실행"] button[aria-label="시뮬레이션"]');
      return b && !b.disabled;
    },
    null,
    { timeout: 400000, polling: 500 },
  );
  await settle(page, 2000);
};
const fastest = async () => {
  for (let i = 0; i < 4; i++) {
    const t = await page.locator('button[aria-label^="시뮬레이션 빠르기"]').first().innerText().catch(() => '');
    if (t.includes('×4')) return;
    await page.locator('button[aria-label^="시뮬레이션 빠르기"]').first().click();
    await page.waitForTimeout(200);
  }
};
let failed = 0;
const shot = async (name, f) => {
  if (!want(name)) return;
  try {
    await f();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${String(e.message ?? e).split('\n')[0]}`);
  }
};

// ---------- 1 · 시작하기 ----------
await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
const simStart = btn('시뮬레이터로 시작');
await simStart.waitFor({ timeout: 240000 });
await settle(page, 2500);
await shot('intro', () => save(page, out('g-intro.jpg'), { marks: [{ at: simStart, n: 1, pos: 'r' }] }));
await simStart.click();
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(1500);
const model = page.getByRole('button', { name: /myCobot 280 RDK X5/ });
if (await model.isVisible().catch(() => false)) await model.click();
await page.waitForTimeout(1500);
const simOnly = btn('시뮬레이션만 (로봇 없이)');
if (await simOnly.isVisible().catch(() => false)) await simOnly.click();
await settle(page, 9000);

const startCard = page.locator('section[aria-label="처음 시작"]');
await shot('first', () =>
  save(page, out('g-first.jpg'), {
    marks: [
      { at: startCard, n: 1, pos: 'r' },
      { at: startCard.locator('li').first(), n: 2, pos: 'l' },
      { at: startCard.getByRole('button', { name: '처음 시작 안내 접기' }), n: 3, pos: 'r', box: false },
      { at: panel, n: 4, pos: 'tl' },
    ],
  }),
);
await shot('start-chip', async () => {
  await startCard.getByRole('button', { name: '처음 시작 안내 접기' }).click();
  await settle(page, 800);
  const chip = page.locator('button[title="처음 시작 안내 펼치기"]');
  await save(page, out('g-start-chip.png'), { crop: chip, pad: 20 });
  await chip.click();
  await settle(page, 800);
});

// ---------- 2 · 화면 둘러보기 ----------
await shot('overview', async () => {
  await openScreen('도구');
  await startCard.getByRole('button', { name: '처음 시작 안내 접기' }).click().catch(() => {});
  await settle(page, 2000);
  // The mini arm: its joint chips (the label layer itself spans the view).
  const mini = await page.evaluate(() => {
    const rs = [...document.querySelectorAll('[aria-label="관절 각도와 손끝 위치"] *')].filter((e) => /^J\d/.test(e.textContent ?? '') && e.childElementCount <= 2).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.width < 160);
    const x = Math.min(...rs.map((r) => r.left)) - 6;
    const y = Math.min(...rs.map((r) => r.top)) - 6;
    return { x, y, w: Math.max(...rs.map((r) => r.right)) + 50 - x, h: Math.max(...rs.map((r) => r.bottom)) + 60 - y };
  });
  await save(page, out('g-overview.jpg'), {
    marks: [
      { at: page.locator('nav[aria-label="화면"]'), n: 1, pos: 'bl' },
      { at: page.locator('[class*=connPill]'), n: 2, pos: 'bl' },
      { at: page.locator('button[aria-label="도움말"]'), n: 3, pos: 'l' },
      { at: rail, n: 4, pos: 'r' },
      { at: page.locator('button[title="처음 시작 안내 펼치기"]'), n: 5, pos: 'r' },
      { at: { x: 640, y: 470, w: 0, h: 0 }, n: 6, box: false },
      { at: page.locator('[data-panel=viewtools]'), n: 7, pos: 'l' },
      { at: mini, n: 8, pos: 'tl' },
      { at: panel, n: 9, pos: 'tl' },
      { at: btn('기본 자세'), n: 10, pos: 'tl' },
    ],
  });
});
await shot('help', async () => {
  await page.locator('button[aria-label="도움말"]').click();
  const dlg = page.locator('dialog[aria-label="도움말"]');
  await dlg.waitFor();
  await settle(page, 800);
  await save(page, out('g-help.png'), { crop: dlg, pad: 6 });
  await page.keyboard.press('Escape');
  await settle(page, 600);
});

// ---------- 3 · 제어 ----------
const how = () => screen().getByRole('group', { name: '움직이는 방법' });
await shot('jog', async () => {
  await openScreen('제어');
  await how().getByRole('button', { name: /^관절/ }).click();
  await settle(page, 1200);
  await save(page, out('g-jog.png'), { crop: screen(), pad: 10 });
});
await shot('jog-xyz', async () => {
  await openScreen('제어');
  await how().getByRole('button', { name: /^좌표/ }).click();
  await settle(page, 1500);
  await save(page, out('g-jog-xyz.png'), { crop: screen(), pad: 10 });
  await how().getByRole('button', { name: /^관절/ }).click();
});

// ---------- 4 · 도구와 자세 ----------
await shot('tools', async () => {
  await openScreen('도구');
  await screen().getByRole('button', { name: /어댑티브 그리퍼/ }).first().click();
  await settle(page, 2500);
  await save(page, out('g-tools.png'), { crop: [screen().getByText('지금 달린 도구'), screen().getByText('받침대 (G 베이스)')], pad: 30 });
});
await shot('poses', async () => {
  await openScreen('자세');
  await settle(page, 800);
  await save(page, out('g-poses.png'), { crop: [screen().getByRole('button', { name: /지금 자세 저장하기/ }), screen().getByRole('button', { name: '이 자세로' }).last()], pad: 16 });
});

// ---------- 5 · 공정 ----------
const proc = page.locator('[role=region][aria-label="공정 짜기"]');
const flowStep = (n) => page.locator('nav[aria-label="공정 짜기 단계"] button').nth(n - 1);
const procCrop = () => [page.locator('nav[aria-label="공정 짜기 단계"]'), proc];
await shot('proc', async () => {
  await openScreen('공정');
  await flowStep(1).click();
  await settle(page, 1500);
  await save(page, out('g-proc-1.png'), { crop: panel, pad: 6 });
  await flowStep(2).click();
  await settle(page, 1200);
  await save(page, out('g-proc-2.png'), { crop: panel, pad: 6 });
  await proc.getByRole('button', { name: /이 실습으로 시작/ }).click();
  await settle(page, 3000);
  // 하는 방법: 따라하기 (the practice's own places).
  const fold = proc.locator('details', { has: page.locator('summary', { hasText: '하는 방법' }) }).last();
  if (!(await fold.evaluate((d) => d.open))) await fold.locator('summary').click();
  await fold.getByRole('button', { name: '따라하기', exact: true }).click();
  await settle(page, 1500);
  await save(page, out('g-proc-3.jpg'));
  await fastest();
  await simulate();
  await save(page, out('g-proc-4.png'), { crop: panel, pad: 6 });
});
await shot('proc-change', async () => {
  await flowStep(3).click();
  await settle(page, 800);
  const fold = proc.locator('details', { has: page.locator('summary', { hasText: '하는 방법' }) }).last();
  if (!(await fold.evaluate((d) => d.open))) await fold.locator('summary').click();
  await fold.getByRole('button', { name: '바꿔 보기', exact: true }).click();
  await settle(page, 1500);
  await save(page, out('g-proc-change.png'), { crop: panel, pad: 6 });
  await fold.getByRole('button', { name: '직접 짜기', exact: true }).click();
  await settle(page, 1500);
  await save(page, out('g-proc-free.png'), { crop: panel, pad: 6 });
  await fold.getByRole('button', { name: '바꿔 보기', exact: true }).click();
  await settle(page, 1000);
});

// ---------- 6 · 코딩 ----------
const langs = page.locator('[role=tablist][aria-label="코딩 언어"]');
await shot('code', async () => {
  await openScreen('코딩');
  await langs.getByRole('tab', { name: /블록/ }).click();
  await settle(page, 2500);
  await save(page, out('g-code.png'), {
    crop: panel,
    pad: 30,
    marks: [
      { at: langs, n: 1, pos: 'tl' },
      { at: page.locator('section[aria-label="튜토리얼"]'), n: 2, pos: 'tl' },
      { at: page.locator('[aria-label="블록 꾸러미"]'), n: 3, pos: 'l' },
      { at: page.locator('[class*=workspace]').first(), n: 4, pos: 'tr' },
      { at: page.getByRole('button', { name: '넓게 보기' }).first(), n: 5, pos: 'b' },
      { at: page.locator('section[aria-label="미션 코드 조각"]'), n: 6, pos: 'l' },
      { at: runGroup, n: 7, pos: 'tl' },
    ],
  });
});
await shot('code-run', async () => {
  await fastest();
  await simulate();
  await save(page, out('g-code-run.jpg'));
});
await shot('code-wide', async () => {
  await page.getByRole('button', { name: '넓게 보기' }).first().click();
  await settle(page, 1500);
  await save(page, out('g-code-wide.jpg'));
  await page.getByRole('button', { name: '좁게 보기' }).first().click();
  await settle(page, 1000);
});
await shot('python', async () => {
  await openScreen('코딩');
  await langs.getByRole('tab', { name: /Python/ }).click();
  await settle(page, 2500);
  await fastest();
  await simulate();
  await save(page, out('g-python.png'), { crop: panel, pad: 6 });
  await langs.getByRole('tab', { name: /블록/ }).click();
  await settle(page, 1500);
});

// ---------- 7 · 손 따라하기 ----------
const hand = page.locator('section[aria-label="손 따라하기"]');
if (HAND) {
  await shot('hand', async () => {
    await openScreen('손');
    await hand.getByRole('button', { name: '카메라 켜기' }).click();
    await page.waitForFunction(() => /손 찾음/.test(document.querySelector('section[aria-label="손 따라하기"]')?.textContent ?? ''), null, { timeout: 120000 });
    await hand.getByRole('button', { name: '따라 하기' }).click();
    await settle(page, 2500);
    // The picture's lower part (a face, in the sample photo) blurred; the hand's marks stay sharp above it.
    await page.evaluate(() => {
      const view = document.querySelector('section[aria-label="손 따라하기"] [data-cam]');
      const veil = document.createElement('div');
      veil.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:42%;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);z-index:3;pointer-events:none';
      view?.appendChild(veil);
    });
    await save(page, out('g-hand.jpg'));
    await hand.getByRole('button', { name: '● 녹화' }).click();
    await page.waitForTimeout(6000);
    await hand.getByRole('button', { name: '■ 녹화 끝' }).click();
    await page.waitForTimeout(800);
    await hand.getByRole('button', { name: '■ 멈추기' }).click();
    await settle(page, 1500);
    await save(page, out('g-hand-panel.png'), { crop: panel, pad: 6 });
    await hand.getByRole('button', { name: '공정으로' }).click();
    await settle(page, 2500);
    await save(page, out('g-hand-demo.png'), { crop: panel, pad: 6 });
  });
}

await browser.close();
console.log(failed ? `${failed} shot(s) failed` : 'all shots saved');
process.exit(failed ? 1 : 0);
