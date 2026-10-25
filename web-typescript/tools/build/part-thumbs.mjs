// Pictures of the tools, accessories and robots, rendered from the simulator's own 3D models on a clear
// background (the /spike/parts page): the 도구 · 액세서리 cards use public/robot/parts/<id>.png, the intro
// public/brand/intro/<model>.png. Needs the dev server (npm run dev); BASE=http://host:port to use another.
//   node tools/build/part-thumbs.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASE, launch } from './guide-shots/lib.mjs';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS = ['none', 'adaptive', 'parallel', 'flexible', 'pump', 'pen', 'phone', 'cylinder', 'omx', 'flange', 'gbase'];
// ONLY=omx,flange renders just those parts.
const ONLY = process.env.ONLY?.split(',');
const ROBOTS = ['mycobot280-rdkx5', 'mycobot320-pi', 'mecharm270-pi', 'mypalletizer260-pi'];
const jobs = [
  ...TOOLS.map((id) => ({ part: id, file: path.join(web, 'public/robot/parts', `${id}.png`), px: 240 })),
  ...ROBOTS.map((id) => ({ part: `arm:${id}`, file: path.join(web, 'public/brand/intro', `${id}.png`), px: 480 })),
  { part: 'agv', file: path.join(web, 'public/brand/intro', 'myagv.png'), px: 480 },
];

const { browser, page } = await launch({ width: 480, height: 480 });
for (const job of jobs.filter((j) => !ONLY || ONLY.includes(j.part))) {
  mkdirSync(path.dirname(job.file), { recursive: true });
  await page.goto(`${BASE}/spike/parts?part=${encodeURIComponent(job.part)}`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForSelector('body[data-ready]', { timeout: 120000 });
  await page.addStyleTag({ content: 'html,body,body *{background:transparent!important} nextjs-portal{display:none!important}' });
  await page.waitForTimeout(800);
  // The page renders at 480 css px; the cards need less, the intro more (devicePixelRatio 1.5 → 720 px).
  await page.screenshot({ path: job.file, omitBackground: true, clip: { x: 0, y: 0, width: 480, height: 480 }, scale: job.px > 480 ? 'device' : 'css' });
  console.log(path.relative(web, job.file));
}
await browser.close();
