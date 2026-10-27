// 검수 1~7 in the AI kit scene (simulation): open each from its number, run its example, record the result.
// Run with the dev server up: OUT=dir node tools/check/checks7-sim.mjs  (CHECKS=4,5 to pick, WAIT=ms per run)
import { launch, openConsole, settle } from '../build/guide-shots/lib.mjs';
const OUT = process.env.OUT;
const { browser, page } = await launch({ width: 1600, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await openConsole(page, { pick: false });
const chip = (n) => page.locator('[aria-label="검수 항목"] button', { hasText: new RegExp(`^${n}$`) });
const runBtn = () => page.locator('button:not([data-hint-skip])', { hasText: /^\s*시뮬레이션\s*$/ }).last();
const history = async () => {
  const btn = page.locator('[data-panel="log"] button', { hasText: /기록/ }).first();
  await btn.click();
  await page.waitForTimeout(300);
  const t = await page
    .locator('[data-panel="log"] ul')
    .innerText()
    .catch(() => '');
  await btn.click().catch(() => {});
  return t;
};
await page.getByRole('button', { name: /설정/ }).last().click();
await page.getByRole('menuitem', { name: /검수 시연/ }).click();
await settle(page, 2000);
await chip(3).click();
await settle(page, 2000);
const report = [];
for (const n of (process.env.CHECKS ?? '1,2,3,4,5,6,7').split(',').map(Number)) {
  await chip(n).click();
  await settle(page, 2500);
  await page
    .locator('header button, nav button, [role=tab]', { hasText: /^\s*시뮬레이터\s*$/ })
    .first()
    .click()
    .catch((e) => console.log('no sim tab', String(e).slice(0, 80)));
  await settle(page, 1200);
  if (
    !(await page
      .locator('[aria-label="튜토리얼"]')
      .isVisible()
      .catch(() => false))
  )
    await page
      .getByRole('button', { name: /^코딩/ })
      .first()
      .click()
      .catch(() => {});
  await settle(page, 1500);
  const title = await page
    .locator('[class*=cardText] b')
    .first()
    .innerText()
    .catch(() => '?');
  const before = (await history()).split('\n').length;
  const t0 = Date.now();
  await runBtn()
    .click({ timeout: 5000 })
    .catch((e) => report.push(`#${n} run click failed ${String(e).slice(0, 60)}`));
  await page.waitForTimeout(1500);
  // done when the run button is enabled again
  await page
    .waitForFunction(
      () => {
        const b = [...document.querySelectorAll('button')].filter((x) => /^\s*시뮬레이션\s*$/.test(x.textContent || '') && !x.hasAttribute('data-hint-skip')).pop();
        return b && !b.disabled;
      },
      null,
      { timeout: Number(process.env.WAIT ?? 900000) },
    )
    .catch(() => report.push(`#${n} wait ended`));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/check${n}.png` });
  const log = (await history()).split('\n');
  const progress = await page
    .locator('[class*=taskBar], [class*=missionTag], header')
    .first()
    .innerText()
    .catch(() => '');
  report.push(
    `#${n} ${title} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n   ${log
      .slice(Math.max(0, before - 1))
      .filter(Boolean)
      .slice(-8)
      .join('\n   ')}\n   top: ${progress.replace(/\s+/g, ' ').slice(0, 160)}`,
  );
}
console.log(report.join('\n'));
console.log('errors', errs.slice(0, 8));
await browser.close();
