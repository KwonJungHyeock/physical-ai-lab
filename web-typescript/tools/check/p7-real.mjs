// The seven acceptance checks, end to end against a robot server (default: the demo server on :8090):
// 교육 → 로봇 실습 7 → every unit's [실물로] buttons, then the 시뮬레이터's 검수 준비 점검 and 결과표.
//   OUT=dir BASE=http://localhost:8090 node tools/check/p7-real.mjs
import { chromiumPath, loadPlaywright } from './inspect.mjs';
const S = process.env.OUT ?? '.';
const base = process.env.BASE ?? 'http://localhost:8090';
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/console`, { waitUntil: 'load', timeout: 240000 });
await page.waitForTimeout(6000);
await page.getByRole('button', { name: '나중에' }).click({ timeout: 3000 }).catch(() => {});
await page.getByRole('tab', { name: /교육/ }).first().click();
await page.waitForFunction(() => typeof window.__learnP7 === 'function', null, { timeout: 120000 });
await page.evaluate(() => window.__learnP7());
await page.waitForTimeout(3000);

const panel = () => page.locator('aside[aria-label]').filter({ has: page.locator('[role=tablist][aria-label="순서"]') });
async function waitIdle(limit = 240000) {
  await page.waitForTimeout(800);
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent?.includes('■ 멈추기') && b.offsetParent), null, { timeout: limit });
  await page.waitForTimeout(500);
}
const msg = async () => (await panel().locator('[class*=realMsg]').innerText().catch(() => '')).replace(/\s+/g, ' ');
const press = async (name) => {
  await panel().getByRole('button', { name }).click();
  await waitIdle();
  const m = await msg();
  console.log(`  [${name}] → ${m}`);
  return m;
};

const results = [];
for (let u = 1; u <= 7; u++) {
  const t0 = Date.now();
  await page.locator('nav[aria-label="실습 고르기"] button').nth(u - 1).click();
  await page.waitForTimeout(1500);
  await panel().getByRole('tab', { name: /실물로/ }).click();
  await page.waitForTimeout(800);
  console.log(`검수 ${u}`);
  let m = '';
  if (u === 1) m = await press('실물로 6축 움직이기');
  if (u === 2) m = await press('실물로 5번 다녀오기');
  if (u === 3) m = await press(/실제 카메라 \d대로 찍기/);
  if (u === 4) {
    await press('① 실제 블록 찾기');
    await panel().getByRole('button', { name: '② 시뮬레이션으로 확인' }).click();
    await page.waitForFunction(() => /이제 \[실물로 옮기기\]|닿지 않는/.test(document.querySelector('aside [class*=realMsg]')?.textContent ?? ''), null, { timeout: 300000 });
    console.log(`  [② 시뮬레이션으로 확인] → ${await msg()}`);
    m = await press('③ 실물로 옮기기');
  }
  if (u === 5) {
    await press('① 그리퍼 열기 · 닫기');
    await panel().getByLabel('흡착 펌프로 바꿔 끼웠어요').check();
    m = await press('② 펌프 켜기 · 끄기');
  }
  if (u === 6) m = await press('로봇 안에서 AI 실행');
  if (u === 7) m = await press('같은 코드를 실물로 실행');
  await page.screenshot({ path: `${S}/p7-${u}-real.png` });
  await panel().getByRole('tab', { name: /결과/ }).click();
  await page.waitForTimeout(600);
  const res = (await panel().locator('[class*=result]').first().innerText()).replace(/\n+/g, ' | ');
  const ok = /✓ 실물로/.test(res);
  results.push({ u, ok, s: ((Date.now() - t0) / 1000).toFixed(0), m, res });
  console.log(`  결과: ${res}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

// 시뮬레이터 → 라이브러리 → 검수: 준비 점검 and the result sheet.
// 검수 시연 (교사용) from the ⚙ menu opens 라이브러리 → 검수 시연.
await page.locator('button[title="설정"]').click();
await page.getByRole('menuitem', { name: /검수 시연 \(교사용\)/ }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${S}/checks.png` });
await page.getByRole('button', { name: /검수 준비 점검/ }).first().click();
const dlg = page.getByRole('dialog', { name: '검수 준비 점검' });
await dlg.waitFor();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${S}/prep.png` });
console.log('준비 점검:', (await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 900));
const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: '검수 결과표 저장' }).click()]);
await dl.saveAs(`${S}/${dl.suggestedFilename()}`);
console.log('결과표:', dl.suggestedFilename());
const sheet = await ctx.newPage();
await sheet.goto(`file://${S}/${dl.suggestedFilename()}`);
await sheet.screenshot({ path: `${S}/sheet.png`, fullPage: true });
console.log((await sheet.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 2500));

console.log('\n요약');
for (const r of results) console.log(`검수 ${r.u}: ${r.ok ? 'OK' : '실패'} · ${r.s} s · ${r.m}`);
console.log('page errors:', errors.length ? errors : '없음');
await browser.close();
process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);
