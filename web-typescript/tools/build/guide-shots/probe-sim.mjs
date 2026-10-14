// Which selectors of simulator.mjs still match the simulator screen (a quick check before a long run).
//   node tools/build/guide-shots/probe-sim.mjs <selectors.txt> <out.png>
import { readFileSync } from 'node:fs';

import { BASE, launch, settle } from './lib.mjs';

const [selFile, shot] = process.argv.slice(2);
const sels = readFileSync(selFile, 'utf8').split('\n').filter(Boolean);
const { browser, page } = await launch();
await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
await page.getByRole('button', { name: '연결하기', exact: true }).click({ timeout: 240000 });
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 }).catch(() => {});
await settle(page, 2500);
await page.getByRole('button', { name: '시뮬레이션만 (로봇 없이)' }).click();
await settle(page, 15000);
await page.screenshot({ path: shot });
for (const s of sels) {
  const n = await page.locator(s).count().catch(() => -1);
  console.log(`${n > 0 ? '✓' : n === 0 ? '·' : '?'} ${n}\t${s}`);
}
// The top bar's buttons and labelled things, to find what replaced a missing one.
console.log('--- top bar');
console.log(await page.locator('header[data-panel=topbar]').evaluate((h) => [...h.querySelectorAll('button,[aria-label],[title]')].map((e) => `${e.tagName} ${e.getAttribute('aria-label') ?? ''} | ${e.getAttribute('title') ?? ''} | ${e.className.toString().slice(0, 60)} | ${e.textContent.trim().slice(0, 30)}`).join('\n')).catch((e) => String(e)));
await browser.close();
