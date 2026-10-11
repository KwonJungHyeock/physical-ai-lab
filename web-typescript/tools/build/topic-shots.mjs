// The lesson pictures from our own 3D robot: for every theory topic (tests/education/sim/) open it,
// do tries A · B · C the way its 원고 says (the scenario's presses, as tools/check/learn-sim.mjs
// does), and when the try's result shows take one still of the 3D view — the dark studio tone,
// the arm with the trails, workspace, targets and labels the try draws, without the panel and
// the view tools. Saved as public/education/shots/<topic>-<A|B|C>.webp, and the list of the
// shots there as src/ui/education/lesson/shots.gen.ts (TopicShot reads it).
//   [SLOW=3] [DILATE=n] npx tsx tools/build/topic-shots.mjs [5-2 ...]   (tsx: the scenarios are TypeScript)
//   npx tsx tools/build/topic-shots.mjs --recrop [5-2 ...]   (only cut and save again, from the last stills)
// Needs the app running (npm run dev; BASE=http://localhost:3000), Playwright and ffmpeg
// (FFMPEG=path, else ffmpeg on PATH). About 10 minutes a topic here (software 3D, slowed down).
// A topic named on the command line is shot again; the manifest always lists every shot in the
// folder. The uncut stills stay in <tmp>/topic-shots for --recrop.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SCENARIOS } from '../../tests/education/sim/index.ts';
import { chromiumPath, loadPlaywright } from '../check/inspect.mjs';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const recrop = process.argv.includes('--recrop');
// The page's clock runs this many times slower than the wall's (DILATE=1: real time). Software 3D draws
// about one frame a second here, and the tries draw their trails from the frames they get: slowed
// down, a 3-second sweep gets some 30 points instead of 3. SLOW=n gives each wait n times longer still.
// Only the lessons run slowed (the app's start screens keep real time).
const dilate = Number(process.env.DILATE ?? 10);
/** Waits are page time: n times longer on the wall (set per topic, see DILATE_FOR). */
let slow = Number(process.env.SLOW ?? 1) * dilate;
const outDir = path.join(web, 'public', 'education', 'shots');
const manifest = path.join(web, 'src', 'ui', 'education', 'lesson', 'shots.gen.ts');
const raws = path.join(tmpdir(), 'topic-shots');
/** The page while shooting (css px), and the saved picture (16 : 10, px). */
const VIEW = { w: 1600, h: 900 };
const OUT = { w: 960, h: 600 };
/** Pixel ratio of the stills (the 3D view draws at most 1.75), and the tightest crop (share of the view's width). */
const SHARP = 1.75;
const MIN = 0.5;
/** Room around what the stills show, a share of its size on each side. */
const PAD = 0.14;

/**
 * Tries whose 3D view does not show what the try teaches (its result is a graph or numbers in
 * the panel), so the lesson keeps its drawing (TopicArt) for them. `topic` alone: all three.
 */
const SKIP = new Set([
  // 관성과 가속 토크: the arm ends each try at rest in the same place; the torques are the panel's graph.
  '4-2',
  // 궤적 추종: each try ends on the target with the same path; the tracking error is the panel's graph.
  '5-3',
  // 색으로 찾기: what changes is the camera picture and its colour mask in the panel; 1 · 2 look the same in 3D.
  '7-2',
]);
/** Topics slowed down more than DILATE: a try that draws a long trail quickly. */
const DILATE_FOR = { '1-1': 25 };
/** Tries seen from another side than the lesson's first view (a face of the view cube): what they draw faces it. */
const VIEW_FOR = { '1-4-B': '정면' };
/** Extra wait after the result, ms, for a try whose arm is still on its way when the chips settle. */
const SETTLE = {};

const scenarios = SCENARIOS.filter((s) => !only.length || only.includes(s.topic));

let browser;
let ctx;
let page;
let cdp;
let panel;
let stage;

/** The browser, slowed-down clocks ready (window.__timeScale). */
async function launch() {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  ctx = await browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('robot-console-model', 'mycobot280-rdkx5');
      // The pictures are always the dark studio, whatever the lessons' default tone.
      localStorage.setItem('learn-tone', 'studio');
    } catch {
      /* private */
    }
    // window.__timeScale(k): from now on the clocks, the animation frames' time stamps and the
    // timers run k times slower than the wall (the clocks go on from where they are).
    const now = performance.now.bind(performance);
    const date = Date.now;
    let k = 1;
    let wall = now();
    let at = wall;
    const pageNow = () => at + (now() - wall) / k;
    const d0 = date() - now();
    performance.now = pageNow;
    Date.now = () => Math.round(d0 + pageNow());
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf(() => cb(pageNow()));
    const timeout = window.setTimeout.bind(window);
    const interval = window.setInterval.bind(window);
    window.setTimeout = (fn, ms, ...a) => timeout(fn, (ms ?? 0) * k, ...a);
    window.setInterval = (fn, ms, ...a) => interval(fn, (ms ?? 0) * k, ...a);
    window.__timeScale = (n) => {
      at = pageNow();
      wall = now();
      k = n;
    };
  });
  page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  cdp = await ctx.newCDPSession(page);
  panel = page.locator('section[aria-label="실습 제어판"]');
  stage = page.locator('section[aria-label="3D 실습 화면"]');
}

/**
 * Open the app at the 교육 tab with the page's clock slowed down. Again whenever the page was
 * reloaded under us (the dev server reloads it when a source file changes).
 */
async function start() {
  await page.goto(`${base}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
  await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 });
  await page
    .getByRole('button', { name: '시뮬레이션만 (로봇 없이)' })
    .click({ timeout: 90000 })
    .catch(() => {});
  await page.getByRole('tab', { name: '교육' }).click();
  await page.waitForTimeout(1500);
  await page.evaluate((k) => {
    window.__timeScale(k);
    window.__shooting = true;
  }, dilate);
  // html[data-shot] (set just for the still) hides what sits over the 3D view: the view tools and the mouse hint.
  await page.addStyleTag({
    content: `nextjs-portal{display:none!important}
      html[data-shot] [class*=viewTools], html[data-shot] [class*=stageHint], html[data-shot] [class*=sceneNote]{visibility:hidden!important}`,
  });
}
const reloaded = async () => !(await page.evaluate(() => !!window.__shooting).catch(() => false));

async function openTopic(id) {
  const k = process.env.DILATE ? dilate : (DILATE_FOR[id] ?? dilate);
  slow = Number(process.env.SLOW ?? 1) * k;
  await page.evaluate((n) => window.__timeScale(n), k);
  await page.waitForFunction(() => !!window.__learnOpen, null, { timeout: 60000 });
  await page.evaluate((t) => window.__learnOpen(t, 'A'), id);
  await panel.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500 * slow);
}

/** @param {import('../../tests/education/sim/types').Action} a */
async function act(a) {
  if ('click' in a) {
    const name = a.click.startsWith('~') ? a.click.slice(1) : a.click;
    await panel.getByRole('button', { name, exact: !a.click.startsWith('~') }).first().click({ timeout: 45000 * slow });
  } else if ('slider' in a) await panel.getByRole('slider', { name: a.slider, exact: true }).first().fill(String(a.value), { timeout: 45000 * slow });
  else if ('select' in a) await panel.getByRole('combobox', { name: a.select }).first().selectOption({ label: a.option }, { timeout: 10000 });
  else if ('check' in a) await panel.getByRole('checkbox', { name: a.check }).first().setChecked(a.on, { timeout: 45000 });
  else if ('pick' in a) {
    const ok = await page.evaluate((mm) => (window.__learnPick ? (window.__learnPick(mm), true) : false), a.pick);
    if (!ok) throw new Error('책상 클릭 자리(window.__learnPick)가 없음');
  } else await page.waitForTimeout(a.wait * slow);
  await page.waitForTimeout(250 * slow);
}

/** The result chips of the open try (null until it is done). */
const chips = () =>
  panel.evaluate((el) => {
    const box = el.querySelector('[class*=resultBox][data-state=done]');
    if (!box) return null;
    return JSON.stringify([...box.querySelectorAll('li')].map((li) => li.textContent));
  });

/** Wait for this try's result (chips that changed, or any after a while) to hold still. */
async function result(before, timeout) {
  const t0 = Date.now();
  let last = '';
  let still = 0;
  while (Date.now() < t0 + timeout * slow) {
    const now = await chips();
    if (now && (now !== before || Date.now() - t0 > 12000 * slow)) {
      still = now === last ? still + 1 : 0;
      if (still >= 3) return true;
    }
    last = now;
    await page.waitForTimeout(Math.max(400, 150 * slow));
  }
  return false;
}

/**
 * Draw the page at this pixel ratio. The 3D view takes it up when its size changes, so nudge the
 * window narrower and back, each time waiting until the view has drawn at that size (one frame
 * at 1.75 takes seconds in software 3D, and a nudge undone before it is seen does nothing).
 */
async function pixelRatio(dpr) {
  const want = Math.min(dpr, 1.75);
  const canvas = stage.locator('canvas').first();
  let seen = await canvas.evaluate((c) => c.getBoundingClientRect().width);
  for (const width of [VIEW.w - 40, VIEW.w]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: VIEW.h, deviceScaleFactor: dpr, mobile: false });
    const t0 = Date.now();
    for (;;) {
      const [cw, w] = await canvas.evaluate((c) => [c.width, c.getBoundingClientRect().width]);
      if (Math.abs(cw / w - want) < 0.02 && Math.abs(w - seen) >= 1) {
        seen = w;
        break;
      }
      if (Date.now() - t0 > 90000) throw new Error(`3D 화면이 배율 ${dpr} 로 안 바뀜 (${(cw / w).toFixed(2)}, 폭 ${w})`);
      await page.waitForTimeout(500);
    }
  }
  // A frame or two at the new size (seconds each in software 3D).
  await page.waitForTimeout(dpr > 1 ? 9000 : 1500);
}

/** The whole 3D view, without what sits over it, sharp (the crop is chosen per topic). */
async function still(name) {
  await page.evaluate(() => document.documentElement.setAttribute('data-shot', ''));
  const look = (title) => stage.locator(`[title="${title}"]`).first().evaluate((b) => b.click());
  try {
    if (VIEW_FOR[name]) {
      await look(`${VIEW_FOR[name]}에서 보기`);
      await page.waitForTimeout(1500 * slow);
    }
    await pixelRatio(SHARP);
    const box = await stage.locator('canvas').first().boundingBox();
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    const png = path.join(raws, `${name}.png`);
    // Through the DevTools protocol: Playwright's own screenshot puts its pixel ratio back first.
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
    writeFileSync(png, Buffer.from(data, 'base64'));
    return png;
  } finally {
    await pixelRatio(1);
    if (VIEW_FOR[name]) {
      await look('처음 시점');
      await page.waitForTimeout(1500 * slow);
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-shot'));
  }
}

/** A PNG's width and height (its header, bytes 16 … 23). */
function size(png) {
  const head = readFileSync(png).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}

/** An image's pixels, `scale` times smaller, as RGB bytes. */
function pixels(png, scale) {
  const [w, h] = size(png);
  const sw = Math.floor(w / scale);
  const sh = Math.floor(h / scale);
  const rgb = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', png, '-vf', `scale=${sw}:${sh}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  return { w: sw, h: sh, rgb };
}

/**
 * Where the picture is: the box around what is not the plain slate studio — the white arm and its
 * dark base, the coloured trails, shapes and labels, and any sharp edge (a grey part against the
 * floor) — in full-size pixels (null: nothing found).
 */
function subject(png) {
  const S = 3;
  const { w, h, rgb } = pixels(png, S);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  const cols = new Array(w).fill(0);
  const rows = new Array(h).fill(0);
  // Not the edges: the view's rounded corners show the page behind.
  const edge = Math.round(Math.min(w, h) * 0.04);
  for (let y = edge; y < h - edge; y++)
    for (let x = edge; x < w - edge; x++) {
      const i = y * w + x;
      const sat = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) - Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
      // The floor's gradient and grid change by a few levels a pixel, the horizon by about 15.
      const grad = Math.max(Math.abs(lum[i + 1] - lum[i - 1]), Math.abs(lum[i + w] - lum[i - w]));
      if (lum[i] > 150 || lum[i] < 26 || sat > 50 || grad > 30) {
        cols[x]++;
        rows[y]++;
      }
    }
  // Ignore stray pixels: a column or row counts with a few marked pixels.
  const span = (a) => {
    const lo = a.findIndex((n) => n >= 2);
    const hi = a.length - 1 - [...a].reverse().findIndex((n) => n >= 2);
    return lo < 0 ? null : [lo * S, (hi + 1) * S];
  };
  const xs = span(cols);
  const ys = span(rows);
  return xs && ys ? { x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1] } : null;
}

/**
 * One crop for the topic's three shots (the same scale, so A · B · C compare): 16 : 10 around all
 * that they show with a margin, never tighter than MIN of the view's width, kept inside it.
 */
function cropFor(pngs) {
  const [W0, H0] = size(pngs[0]);
  // Never the view's very edge: its rounded corners show the page behind.
  const inset = Math.round(W0 * 0.012);
  const W = W0 - 2 * inset;
  const H = H0 - 2 * inset;
  const boxes = pngs.map(subject).filter(Boolean);
  const box = boxes.length
    ? { x0: Math.min(...boxes.map((b) => b.x0)) - inset, x1: Math.max(...boxes.map((b) => b.x1)) - inset, y0: Math.min(...boxes.map((b) => b.y0)) - inset, y1: Math.max(...boxes.map((b) => b.y1)) - inset }
    : { x0: 0, x1: W, y0: 0, y1: H };
  const ratio = OUT.w / OUT.h;
  let w = (box.x1 - box.x0) * (1 + 2 * PAD);
  let h = (box.y1 - box.y0) * (1 + 2 * PAD);
  w = Math.max(w, h * ratio, W * MIN);
  h = w / ratio;
  if (h > H) {
    h = H;
    w = h * ratio;
  }
  w = Math.min(w, W);
  h = w / ratio;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const x = Math.round(inset + Math.min(Math.max(cx - w / 2, 0), W - w));
  const y = Math.round(inset + Math.min(Math.max(cy - h / 2, 0), H - h));
  return { x, y, w: Math.floor(w), h: Math.floor(h) };
}

function save(png, name, c) {
  const out = path.join(outDir, `${name}.webp`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', png, '-vf', `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${OUT.w}:${OUT.h}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', out]);
  console.log(`  ${name}.webp  ${(statSync(out).size / 1024).toFixed(0)} KB  (crop ${c.w}×${c.h} at ${c.x},${c.y})`);
}

/** Tries A · B · C of one topic as the 원고 says; each one's still (raw), or the problems. */
async function shoot(sc) {
  await openTopic(sc.topic);
  const raw = [];
  const problems = [];
  for (const [i, k] of ['A', 'B', 'C'].entries()) {
    const name = `${sc.topic}-${k}`;
    if (SKIP.has(name)) continue;
    const st = sc[k];
    try {
      await panel.locator('ol[aria-label="실습 순서"] button').nth(i).click();
      await page.waitForTimeout(700 * slow);
      // The controls show once a guess is made (any: the picture is the same).
      await panel.getByRole('radio').first().click();
      await page.waitForTimeout(250 * slow);
      const before = await chips();
      for (const a of st.do) await act(a);
      if (!(await result(before, st.timeout ?? 30000))) throw new Error('결과가 안 나옴');
      await page.waitForTimeout((1200 + (SETTLE[name] ?? 0)) * slow);
      raw.push([name, await still(name)]);
    } catch (e) {
      problems.push(`${name}: ${e.message.split('\n')[0]}`);
    }
  }
  return { raw, problems };
}

mkdirSync(raws, { recursive: true });
mkdirSync(outDir, { recursive: true });
let failed = 0;
if (recrop) {
  for (const sc of scenarios) {
    if (SKIP.has(sc.topic)) continue;
    const got = ['A', 'B', 'C'].map((k) => [`${sc.topic}-${k}`, path.join(raws, `${sc.topic}-${k}.png`)]).filter(([name, png]) => !SKIP.has(name) && existsSync(png));
    if (!got.length) continue;
    const c = cropFor(got.map(([, png]) => png));
    for (const [name, png] of got) save(png, name, c);
  }
} else {
  await launch();
  await start();
  for (const sc of scenarios) {
    if (SKIP.has(sc.topic)) continue;
    for (const k of ['A', 'B', 'C']) rmSync(path.join(raws, `${sc.topic}-${k}.png`), { force: true });
    // A topic goes again (once) when a try failed: the page may have been reloaded meanwhile.
    let got = { raw: [], problems: ['(시작 못 함)'] };
    for (let attempt = 0; attempt < 2 && got.problems.length; attempt++) {
      if (attempt) console.log(`  … ${sc.topic} 다시 (${got.problems.join(' · ')})`);
      try {
        if (attempt || (await reloaded())) await start();
        got = await shoot(sc);
      } catch (e) {
        got = { raw: [], problems: [`${sc.topic}: ${e.message.split('\n')[0]}`] };
      }
    }
    for (const p of got.problems) {
      failed++;
      console.log(`  ✗ ${p}`);
    }
    if (!got.raw.length) continue;
    const c = cropFor(got.raw.map(([, png]) => png));
    for (const [name, png] of got.raw) save(png, name, c);
  }
  await browser.close();
}

// The manifest: every shot in the folder (also those of earlier runs), by topic.
const shots = {};
for (const f of readdirSync(outDir).sort()) {
  const m = /^(\d-\d)-([ABC])\.webp$/.exec(f);
  if (m) (shots[m[1]] ??= []).push(m[2]);
}
const lines = Object.entries(shots).map(([t, ks]) => `  '${t}': [${ks.map((k) => `'${k}'`).join(', ')}],`);
writeFileSync(
  manifest,
  `// Generated by tools/build/topic-shots.mjs — do not edit. The tries that have a picture in\n// public/education/shots/<topic>-<try>.webp (the 3D view at the try's result).\n\nexport const SHOTS: Readonly<Record<string, readonly ('A' | 'B' | 'C')[]>> = {\n${lines.join('\n')}\n};\n`,
);
const total = readdirSync(outDir).reduce((n, f) => n + statSync(path.join(outDir, f)).size, 0);
console.log(`topic shots: ${Object.values(shots).flat().length} in ${path.relative(web, outDir)} (${(total / 1024 / 1024).toFixed(2)} MB)${failed ? `, ${failed} problem(s)` : ''}`);
process.exit(failed ? 1 : 0);
