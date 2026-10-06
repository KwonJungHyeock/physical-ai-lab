// The 라이브러리 cards' moving pictures, recorded from the app itself: for every card on the page
// (pages/Library.tsx, [data-lib="<kind>-<id>"]) it opens the 라이브러리, clicks the card, and records
// the 3D view in the simulator to public/library/<kind>-<id>.gif (320×200, 12 fps, 3 s, ≤ ~300 KB).
//
//   node tools/build/library-gifs.mjs [practice-joints scene-lab ...] [--kind=scene,tool] [--keep]
//
// Needs the app running (npm run dev; BASE=http://localhost:3000), Playwright (the project's or the
// global one) and ffmpeg (FFMPEG=path, else ffmpeg on PATH). --keep skips cards that already have a GIF.
//
// What each kind shows, as a time-lapse of a program run in the simulator ([시뮬레이션], up to 90 s):
//   practice-* · check-*  the practice's own program
//   scene-* · tool-* · model-*  전 축 구동 (practice-joints: every joint turned both ways) with that
//                         environment, tool or robot model loaded
//   model-myagv           the /agv simulator driven with the keyboard
//   a card that cannot be opened (a model marked 다음 순서) → one still frame from its product picture
// The camera stays put (a turning camera changes every pixel, which makes GIFs large).
// The window is narrow (640 px, the one-column layout), so the 3D view is small and renders faster:
// with the software renderer (SwiftShader) a frame takes about a second. Frames are read straight from
// the 3D canvas after each draw (no overlays), then cut to 16:10 and encoded with ffmpeg.
// A short run gives few frames: its GIF plays them slower (4–12 fps). Several kinds change the console
// they are opened in (theme, level, tool, arm), so run the whole set in the order the script uses.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const outDir = path.join(web, 'public', 'library');
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const kinds = args
  .find((a) => a.startsWith('--kind='))
  ?.slice(7)
  .split(',');
const keep = args.includes('--keep');

const W = 320;
const H = 200;
const FPS = 12;
const FRAMES = 36; // 3 s
const MAX_KB = 300;
/** Cards that cannot be opened: a still from this picture (public/...). */
const STILLS = { 'model-four-axis': 'robot/thumbs/ultraarm-p340.png' };

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}

const { chromium } = await loadPlaywright();
const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 640 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('robot-console-model', 'mycobot280-rdkx5');
    localStorage.setItem('robot-console-level', 'basic');
    localStorage.setItem('console-guide-done', '1');
    localStorage.setItem('robot-console-pc-offered', '1');
    // No axes, joint points or see-through arm over the robot; the panels stay put while a program runs.
    localStorage.setItem('robot-console-display', JSON.stringify({ baseAxes: false, jointPoints: false, ghost: false, autoFold: false }));
    // 드래그 티칭 plays back three recorded poses (joint angles, °).
    const poses = { '내 자세 1': [35, 20, -70, -30, 0, 0], '내 자세 2': [-35, 10, -45, -50, 20, 0], '내 자세 3': [0, 45, -95, -20, -20, 30] };
    if (!localStorage.getItem('robot-console-poses')) localStorage.setItem('robot-console-poses', JSON.stringify(poses));
  } catch {
    /* private */
  }
});
const page = await ctx.newPage();
page.setDefaultTimeout(120000);

async function openConsole() {
  await page.goto(`${base}/console?from=sim`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 300000 }).catch(() => {});
  await page
    .getByRole('button', { name: '시뮬레이션만 (로봇 없이)' })
    .click({ timeout: 120000 })
    .catch(() => {});
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  // A window still open over the console (로봇 연결): close it.
  for (let i = 0; i < 3 && (await page.locator('[role=dialog][aria-modal=true]').count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
}
const screenTab = (name) => page.locator('[role=tab]').filter({ hasText: name }).first();
async function toLibrary() {
  await page.keyboard.press('Escape').catch(() => {});
  if (
    !(await page
      .locator('[data-lib]')
      .first()
      .isVisible()
      .catch(() => false))
  )
    await screenTab('라이브러리').click();
  const all = page.getByRole('button', { name: /^전체/ }).first();
  if ((await all.getAttribute('aria-current').catch(() => null)) !== 'page') await all.click();
  await page.locator('[data-lib]').first().waitFor();
}
async function toSim() {
  if (
    !(await page
      .locator('[data-viewport] canvas')
      .first()
      .isVisible()
      .catch(() => false))
  )
    await screenTab('시뮬레이터').click();
  await page.locator('[data-viewport] canvas').first().waitFor({ timeout: 180000 });
}

/**
 * The part of the 3D view a GIF shows: `s` of the largest 16:10 cut, centred at (x, y) of the view.
 * 'wide' the whole view (a scene); 'arm' closer, where the robot stands after [전체 맞춤]; 'model' between.
 */
const CROP = { wide: { s: 1, x: 0.5, y: 0.5 }, arm: { s: 0.66, x: 0.44, y: 0.45 }, model: { s: 0.85, x: 0.47, y: 0.47 } };

/** Start keeping every frame the 3D canvas draws (cut to 16:10, twice the GIF size), as JPEG. */
async function recStart(crop = CROP.wide, sel = '[data-viewport] canvas') {
  await page.evaluate(
    ({ sel, w, h, crop }) => {
      const src = document.querySelector(sel);
      const out = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = out.getContext('2d');
      const rec = { frames: [], on: true, t0: performance.now() };
      window.__rec = rec;
      const grab = () => {
        if (!rec.on) return;
        const sw = src.width;
        const sh = src.height;
        const cw = Math.min(sw, (sh * w) / h) * crop.s;
        const ch = (cw * h) / w;
        const x = Math.max(0, Math.min(sw - cw, sw * crop.x - cw / 2));
        const y = Math.max(0, Math.min(sh - ch, sh * crop.y - ch / 2));
        g.fillStyle = '#262d36';
        g.fillRect(0, 0, w, h);
        g.drawImage(src, x, y, cw, ch, 0, 0, w, h);
        rec.frames.push({ t: performance.now() - rec.t0, d: out.toDataURL('image/jpeg', 0.92) });
        requestAnimationFrame(grab);
      };
      requestAnimationFrame(grab);
    },
    { sel, w: W * 2, h: H * 2, crop },
  );
}
const frameCount = () => page.evaluate(() => window.__rec?.frames.length ?? 0);
async function nextFrame(timeout = 90000) {
  const n = await frameCount();
  await page.waitForFunction((n) => window.__rec.frames.length > n, n, { timeout, polling: 100 });
}
async function recStop() {
  return page.evaluate(() => {
    window.__rec.on = false;
    return window.__rec.frames;
  });
}

/**
 * Frames spread evenly over what was recorded (a time-lapse when the run was long), about 3 s long.
 * Tried from the finest down until the file is at most MAX_KB (a busy scene needs fewer frames and
 * colours, without dithering).
 */
const STEPS = [
  { n: FRAMES, colors: 128, dither: 'bayer:bayer_scale=3' },
  { n: FRAMES, colors: 64, dither: 'none' },
  { n: 27, colors: 64, dither: 'none' },
  { n: 24, colors: 48, dither: 'none' },
  { n: 18, colors: 40, dither: 'none' },
  { n: 15, colors: 32, dither: 'none' },
];
function encode(name, frames) {
  if (!frames.length) throw new Error('no frames');
  const dir = path.join(tmpdir(), `lib-${name}`);
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.gif`);
  let n = 0;
  for (const step of STEPS) {
    n = Math.min(step.n, frames.length);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const pick = Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / Math.max(1, n - 1))]);
    pick.forEach((f, i) => writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.d.split(',')[1], 'base64')));
    // Fewer frames (a short run, a smaller file): slower, so the clip still lasts about 3 s.
    const rate = Math.max(4, Math.min(FPS, Math.round(n / 3)));
    const vf = `scale=${W}:${H}:flags=lanczos,split[a][b];[a]palettegen=max_colors=${step.colors}:stats_mode=full[p];[b][p]paletteuse=dither=${step.dither}:diff_mode=rectangle`;
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(rate), '-i', path.join(dir, 'f%04d.jpg'), '-vf', vf, '-loop', '0', out]);
    if (statSync(out).size / 1024 <= MAX_KB) break;
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ${name}.gif  ${n} frames of ${frames.length} · ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

function still(name, src) {
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.gif`);
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x262d36,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse`;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(web, 'public', src), '-vf', vf, '-frames:v', '1', out]);
  console.log(`  ${name}.gif  still from ${src}`);
}

async function fit() {
  await page
    .getByRole('button', { name: '전체 맞춤' })
    .click({ timeout: 5000 })
    .catch(() => {});
  // The camera glides there over a few frames.
  await page.waitForTimeout(5000);
}

/** The open practice's program, run in the simulator; frames from start to end (up to 90 s). */
async function run(name, crop) {
  await page.waitForTimeout(1500);
  const fitTool = page.getByRole('button', { name: /끼우기/ }).first();
  if (await fitTool.isVisible().catch(() => false)) {
    await fitTool.click();
    await page.waitForTimeout(2500);
  }
  await fit();
  const go = page.getByRole('button', { name: '시뮬레이션', exact: true }).first();
  await go.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button[aria-label="시뮬레이션"]')][0];
      return b && !b.disabled;
    },
    null,
    { timeout: 180000 },
  );
  await go.evaluate((b) => b.click());
  const t0 = Date.now();
  // From just after the start: the view settles as the run begins (the panel changes beside it).
  await page.waitForTimeout(3000);
  await recStart(crop);
  await page.waitForFunction(() => document.querySelector('button[aria-label="시뮬레이션"]')?.disabled, null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('button[aria-label="시뮬레이션"]')?.disabled, null, { timeout: 90000, polling: 500 }).catch(async () => page.keyboard.press('Escape'));
  await page.waitForTimeout(1500);
  const frames = await recStop();
  console.log(`  ran ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  encode(name, frames);
}

async function agv(name) {
  await page.waitForURL(/\/agv/, { timeout: 120000 });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ timeout: 300000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.waitForTimeout(5000);
  await recStart(CROP.wide, 'canvas');
  await nextFrame();
  const drive = async (key, frames) => {
    await page.keyboard.down(key);
    for (let i = 0; i < frames; i++) await nextFrame();
    await page.keyboard.up(key);
  };
  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => {});
  await drive('w', 10);
  await drive('e', 8);
  await drive('w', 10);
  await drive('d', 8);
  const frames = await recStop();
  encode(name, frames);
  await openConsole();
}

await openConsole();
await toLibrary();
const cards = await page.locator('[data-lib]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-lib'), disabled: e.disabled })));
// Models last (each one changes the arm the other cards open on), myAGV (another page) at the very end.
const order = (id) => (id === 'model-myagv' ? 2 : id.startsWith('model-') ? 1 : 0);
const todo = cards
  .sort((a, b) => order(a.id) - order(b.id))
  .filter((c) => (!only.length || only.includes(c.id)) && (!kinds || kinds.includes(c.id.split('-')[0])) && !(keep && existsSync(path.join(outDir, `${c.id}.gif`))));
console.log(`${todo.length} of ${cards.length} cards`);

let failed = 0;
for (const c of todo) {
  console.log(c.id);
  try {
    if (STILLS[c.id]) {
      still(c.id, STILLS[c.id]);
      continue;
    }
    // An environment, a tool or a model is shown doing 전 축 구동: that practice first, then the card.
    if (/^(scene|tool|model)-/.test(c.id)) {
      await toLibrary();
      await page.locator('[data-lib="practice-joints"]').click();
      await page.waitForTimeout(2500);
    }
    // A model on the empty desk (nothing in the way of its joints, the same picture for every model).
    if (c.id.startsWith('model-')) {
      await toLibrary();
      await page.locator('[data-lib="scene-empty"]').click();
      await page.waitForTimeout(2500);
    }
    await toLibrary();
    await page.locator(`[data-lib="${c.id}"]`).click();
    if (c.id === 'model-myagv') {
      await agv(c.id);
      continue;
    }
    await toSim();
    await page.waitForTimeout(c.id.startsWith('model-') ? 8000 : 2500);
    await run(c.id, c.id.startsWith('scene-') ? CROP.wide : c.id.startsWith('model-') ? CROP.model : CROP.arm);
  } catch (err) {
    failed++;
    const shot = path.join(tmpdir(), `library-gif-failed-${c.id}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    console.log(`  FAILED ${c.id}: ${err.message.split('\n')[0]} (screen: ${shot})`);
    // Start again from a fresh console.
    await openConsole().catch(() => {});
  }
}
await browser.close();
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
