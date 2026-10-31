// Shared helpers for the guide screenshots: open the app, wait for the 3D scene, mark parts with numbered
// badges, and save a screenshot (whole window or a crop around some parts).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const BASE = process.env.BASE ?? 'http://localhost:3000';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}

export async function launch({ width = 1600, height = 900, storage = {} } = {}) {
  const { chromium } = await loadPlaywright();
  const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript((s) => {
    try {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch {
      /* private */
    }
  }, { 'robot-console-start': JSON.stringify({ done: [], folded: true }), ...storage });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { browser, ctx, page };
}

/** The dev badge and the headless-only "3D not visible yet" note are not part of the product screen. */
export async function clean(page) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important} [class*=sceneNote]{display:none!important} *{caret-color:transparent!important}' });
}

export async function openConsole(page, { pick = true, sim = true } = {}) {
  await page.goto(`${BASE}/console`, { waitUntil: 'load', timeout: 240000 });
  // The intro's last frame waits for a choice: 시뮬레이터로 시작 (the robot's own console has none).
  await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(1200);
  if (pick) {
    const start = page.getByRole('button', { name: /myCobot 280 RDK X5/ });
    if (await start.isVisible().catch(() => false)) await start.click();
    await page.waitForTimeout(1500);
  }
  if (sim) {
    const only = page.getByRole('button', { name: '시뮬레이션만 (로봇 없이)' });
    if (await only.isVisible().catch(() => false)) await only.click();
  }
  await settle(page, 6000);
}

export async function settle(page, ms = 2500) {
  await page.waitForTimeout(ms);
  await clean(page);
}

async function rectOf(page, target) {
  if (!target) return null;
  if (typeof target === 'function') target = target(page);
  if (typeof target === 'string') target = page.locator(target);
  if ('x' in target && 'w' in target) return target;
  const b = await target.first().boundingBox();
  return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
}

/**
 * Draw numbered badges. marks: [{ at: locator | (page) => locator | {x,y,w,h}, n: 1, pos?: 'tl'|'tr'|'bl'|'br'|'l'|'r', box?: true }]
 */
export async function mark(page, marks) {
  const rects = [];
  for (const m of marks) {
    const r = await rectOf(page, m.at);
    if (!r) throw new Error(`mark ${m.n}: element not found`);
    rects.push({ ...r, n: m.n, pos: m.pos ?? 'tl', box: m.box !== false });
  }
  await page.evaluate((rects) => {
    document.getElementById('__marks')?.remove();
    const host = document.createElement('div');
    host.id = '__marks';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const W = innerWidth;
    const H = innerHeight;
    for (const r of rects) {
      if (r.box) {
        const b = document.createElement('div');
        b.style.cssText = `position:absolute;left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w + 6}px;height:${r.h + 6}px;border:2.5px solid #F2542D;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85)`;
        host.appendChild(b);
      }
      const s = 26;
      const at = {
        tl: [r.x - s * 0.55, r.y - s * 0.55],
        tr: [r.x + r.w - s * 0.45, r.y - s * 0.55],
        bl: [r.x - s * 0.55, r.y + r.h - s * 0.45],
        br: [r.x + r.w - s * 0.45, r.y + r.h - s * 0.45],
        l: [r.x - s - 6, r.y + r.h / 2 - s / 2],
        r: [r.x + r.w + 6, r.y + r.h / 2 - s / 2],
        t: [r.x + r.w / 2 - s / 2, r.y - s - 6],
        b: [r.x + r.w / 2 - s / 2, r.y + r.h + 6],
      }[r.pos];
      const x = Math.min(Math.max(at[0], 2), W - s - 2);
      const y = Math.min(Math.max(at[1], 2), H - s - 2);
      const c = document.createElement('div');
      c.textContent = String(r.n);
      c.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:#F2542D;color:#fff;font:800 15px/26px Pretendard,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2.5px #fff,0 2px 6px rgba(0,0,0,.35)`;
      host.appendChild(c);
    }
    document.body.appendChild(host);
  }, rects);
}

export async function unmark(page) {
  await page.evaluate(() => document.getElementById('__marks')?.remove());
}

/**
 * Save a screenshot. crop: undefined (whole window) | locator(s) | {x,y,w,h}; pad around a crop.
 * Files are JPEG (3D scenes compress badly as PNG) unless the name ends in .png.
 */
export async function save(page, file, { crop, marks, pad = marks ? 30 : 14 } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  for (const c of crop ? (Array.isArray(crop) ? crop : [crop]) : []) {
    if (c && typeof c === 'object' && 'first' in c) await c.first().scrollIntoViewIfNeeded().catch(() => {});
  }
  await page.waitForTimeout(300);
  if (marks) await mark(page, marks);
  let clip;
  if (crop) {
    const list = Array.isArray(crop) ? crop : [crop];
    const rs = (await Promise.all(list.map((c) => rectOf(page, c)))).filter(Boolean);
    if (!rs.length) throw new Error(`${file}: crop target not found`);
    const vw = page.viewportSize();
    const x0 = Math.max(0, Math.min(...rs.map((r) => r.x)) - pad);
    const y0 = Math.max(0, Math.min(...rs.map((r) => r.y)) - pad);
    const x1 = Math.min(vw.width, Math.max(...rs.map((r) => r.x + r.w)) + pad);
    const y1 = Math.min(vw.height, Math.max(...rs.map((r) => r.y + r.h)) + pad);
    clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  const png = file.endsWith('.png');
  await page.screenshot({ path: file, clip, type: png ? 'png' : 'jpeg', quality: png ? undefined : 88, timeout: 120000 });
  if (marks) await unmark(page);
  console.log(`  ${path.basename(file)}${clip ? ` (${Math.round(clip.width)}×${Math.round(clip.height)})` : ''}`);
}
