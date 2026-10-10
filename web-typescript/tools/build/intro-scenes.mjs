// The intro's pictures: where robots work, taken from the app's own 3D scenes — the 로봇 시티 map and its
// six site cells with the ambient life on (people, AGVs, belts). Each picture is the 3D view alone (the
// largest canvas on screen), saved as public/brand/intro/scene-<id>.jpg. Needs the dev server
// (npm run dev); BASE=http://host:port to use another.
//   node tools/build/intro-scenes.mjs [park factory logistics bio farm cafe ai]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { BASE, launch } from './guide-shots/lib.mjs';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(web, 'public/brand/intro');
/** How each scene is opened from the 교육 tab ('park': the map itself), and how long its program runs before the picture. */
const SCENES = {
  park: {},
  factory: { learn: '__learnLab', open: () => window.__labOpen(1, 'run', {}), wait: 5200 },
  logistics: { learn: '__learnLogi', hook: '__logiOpen', wait: 9000 },
  bio: { learn: '__learnBio', hook: '__bioOpen', wait: 5000 },
  farm: { learn: '__learnFarm', hook: '__farmOpen', wait: 5000 },
  cafe: { learn: '__learnCafe', hook: '__cafeOpen', wait: 4500 },
  ai: { learn: '__learnAi', hook: '__aiOpen', wait: 5000 },
};
const want = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(SCENES);

mkdirSync(out, { recursive: true });
const { browser, page } = await launch({ width: 1600, height: 900, storage: { 'robot-console-model': 'mycobot280-rdkx5', 'edu-ambient': 'on', 'park-all-open': 'true' } });
page.setDefaultTimeout(240000);
await page.goto(`${BASE}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 });
await page.addStyleTag({ content: 'nextjs-portal{display:none!important} [class*=sceneNote]{display:none!important}' });
await page.getByRole('tab', { name: '교육' }).click();
await page.waitForTimeout(6000);

/** The 3D view: the largest canvas on screen. */
const view = async () =>
  page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 200).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return c && { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) };
  });

for (const id of want) {
  const s = SCENES[id];
  if (s.learn) {
    await page.waitForFunction((n) => !!window[n], s.learn);
    await page.evaluate((n) => window[n](), s.learn);
    await page.waitForTimeout(3500);
    if (s.hook) {
      await page.waitForFunction((n) => !!window[n], s.hook);
      await page.evaluate((n) => window[n]('run', { prob: 1 }), s.hook);
    } else {
      await page.waitForFunction(() => !!window.__labOpen);
      await page.evaluate(s.open);
    }
  }
  await page.waitForTimeout(s.wait ?? 2500);
  // The picture is the scene alone: every panel, label and button hidden (the 3D labels are page
  // elements too); the map's own card on the right is cut off.
  const hide = await page.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });
  await page.waitForTimeout(400);
  const clip = await view();
  if (id === 'park') clip.width = Math.round(clip.width * 0.76);
  const file = path.join(out, `scene-${id}.jpg`);
  // A software renderer can be caught between frames (all black): take it again until it is lit.
  for (let k = 0; k < 8; k++) {
    const buf = await page.screenshot({ clip, type: 'jpeg', quality: 82 });
    const { channels } = await sharp(buf).stats();
    if (channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3 > 30 || k === 7) {
      writeFileSync(file, buf);
      break;
    }
    await page.waitForTimeout(1500);
  }
  console.log(path.relative(web, file), `${clip.width}×${clip.height}`);
  await hide.evaluate((el) => el.remove());
  // Back to the map for the next one.
  await page.getByRole('tab', { name: '시뮬레이터' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: '교육' }).click();
  await page.waitForTimeout(2500);
}
await browser.close();
