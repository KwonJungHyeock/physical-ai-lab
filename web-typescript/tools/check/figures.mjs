// Layout check of the topic figures, measured on the drawn page (/figures/<id>):
//   OUT       text outside the 1600 × 900 picture
//   CROSS     text running over its panel's edge (into the next panel)
//   OVERLAP   two texts on top of each other
//   OFFCENTER text inside a box / circle but not centred in it (도형 속 글자 정렬)
//   SPILL     text inside a box / circle running out of it
//   SMALL     text smaller than the spec's 28 px
//   LOPSIDED  a panel's drawing pushed to one side (쏠림)
//   SPARSE    a panel mostly empty
//   BALANCE   the three activity panels of a figure filled very unevenly
// Needs the app running (npm run dev) and Playwright.
//   BASE=http://localhost:3000 node tools/check/figures.mjs [5-2 ...]   → prints problems, exit 1 if any
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}

const defs = JSON.parse(
  execFileSync(
    'npx',
    ['tsx', '-e', "import('./src/ui/education/fig/index.ts').then((m) => { const F = m.FIGURES ?? m.default.FIGURES; console.log(JSON.stringify(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v.panels])))); })"],
    { cwd: web },
  ).toString(),
);
const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(defs);

const { chromium } = await loadPlaywright();
const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

let total = 0;
for (const id of ids) {
  await page.goto(`${base}/figures/${id}`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  // Final state of every animation (the drawing as printed).
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.finish?.();
  });
  const problems = await page.evaluate((panels) => {
    const svg = document.querySelector('#figure svg');
    const S = svg.getBoundingClientRect();
    const k = 1600 / S.width;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: (r.left - S.left) * k, y: (r.top - S.top) * k, w: r.width * k, h: r.height * k };
    };
    const cx = (b) => b.x + b.w / 2;
    const cy = (b) => b.y + b.h / 2;
    const inside = (b, p, m = 0) => b.x >= p.x - m && b.y >= p.y - m && b.x + b.w <= p.x + p.w + m && b.y + b.h <= p.y + p.h + m;
    const has = (p, x, y) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
    // The smallest panel holding a point (rows of panels may sit inside a bigger one).
    const panelAt = (x, y) => panels.filter((p) => has(p, x, y)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const out = [];
    const texts = [...svg.querySelectorAll('text')]
      .filter((t) => t.textContent.trim() && getComputedStyle(t).opacity !== '0')
      .map((t) => ({ el: t, s: t.textContent.trim(), b: box(t), size: Number(t.getAttribute('font-size') || 30), anchor: t.getAttribute('text-anchor') || 'start' }));
    for (const t of texts) {
      const { b } = t;
      if (!inside(b, { x: 0, y: 0, w: 1600, h: 900 }, 2)) out.push(['OUT', t.s, `x ${b.x.toFixed(0)}–${(b.x + b.w).toFixed(0)}, y ${b.y.toFixed(0)}–${(b.y + b.h).toFixed(0)}`]);
      const p = panelAt(cx(b), cy(b));
      if (p && !inside(b, p, 6)) out.push(['CROSS', t.s, `칸(${p.step ?? '-'}) 밖으로 ${Math.max(p.x - b.x, b.x + b.w - p.x - p.w, p.y - b.y, b.y + b.h - p.y - p.h).toFixed(0)} px`]);
      if (t.size < 28) out.push(['SMALL', t.s, `${t.size} px`]);
    }
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i].b;
        const c = texts[j].b;
        const w = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const h = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        // Font boxes are taller than the glyphs: count only a real overlap.
        if (w > 4 && h > Math.min(a.h, c.h) * 0.35 && w * h > 0.12 * Math.min(a.w * a.h, c.w * c.h)) out.push(['OVERLAP', `${texts[i].s} ↔ ${texts[j].s}`, `${w.toFixed(0)}×${h.toFixed(0)} px`]);
      }
    // Text inside a closed shape (rect / circle / ellipse, small enough to be a label box).
    const shapes = [...svg.querySelectorAll('rect, circle, ellipse')]
      .filter((e) => {
        const f = getComputedStyle(e).fill;
        const st = getComputedStyle(e).stroke;
        return (f && f !== 'none') || (st && st !== 'none');
      })
      .map((e) => ({ e, b: box(e) }))
      .filter(({ b }) => b.w > 20 && b.h > 20 && b.w * b.h < 1600 * 900 * 0.06);
    for (const t of texts) {
      const tb = t.b;
      const host = shapes.filter(({ b }) => has(b, cx(tb), cy(tb))).sort((a, c) => a.b.w * a.b.h - c.b.w * c.b.h)[0];
      if (!host) continue;
      const hb = host.b;
      // Only a shape that is the text's own box: about the text's size, not a big area it happens to sit in.
      if (hb.w > tb.w * 4 + 80 || hb.h > tb.h * 4) continue;
      if (!inside(tb, hb, 1)) out.push(['SPILL', t.s, `도형 ${hb.w.toFixed(0)}×${hb.h.toFixed(0)} 밖으로`]);
      else {
        const dx = cx(tb) - cx(hb);
        const dy = cy(tb) - cy(hb);
        if (t.anchor === 'middle' && Math.abs(dx) > Math.max(5, hb.w * 0.06)) out.push(['OFFCENTER', t.s, `가로 ${dx > 0 ? '오른쪽' : '왼쪽'}으로 ${Math.abs(dx).toFixed(0)} px`]);
        if (Math.abs(dy) > Math.max(5, hb.h * 0.12)) out.push(['OFFCENTER', t.s, `세로 ${dy > 0 ? '아래' : '위'}로 ${Math.abs(dy).toFixed(0)} px`]);
      }
    }
    // Panels: where the drawing sits in each.
    const marks = [...svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse, text')]
      .filter((e) => e.parentNode !== svg || e.tagName !== 'rect')
      .map((e) => ({ e, b: box(e) }))
      .filter(({ b }) => b.w * b.h < 1600 * 900 * 0.5 && (b.w > 0 || b.h > 0));
    const fills = [];
    for (const p of panels) {
      // Leave out the title row (52 px down) and the panel's own outline.
      const area = { x: p.x, y: p.y + 74, w: p.w, h: p.h - 74 };
      const mine = marks.filter(({ b }) => has(area, cx(b), cy(b)) && panelAt(cx(b), cy(b)) === p && !(b.w > p.w * 0.95 && b.h > p.h * 0.95));
      if (!mine.length) continue;
      const name = `칸 ${p.step ?? '-'}${p.title ? ` (${p.title})` : ''}`;
      // A 8 × 5 grid over the panel: which cells hold some ink, and where the ink's weight sits.
      const GX = 8;
      const GY = 5;
      const cell = new Array(GX * GY).fill(0);
      let wx = 0;
      let wy = 0;
      let wsum = 0;
      for (const { b } of mine) {
        const bx0 = Math.max(area.x, b.x);
        const by0 = Math.max(area.y, b.y);
        const bx1 = Math.min(area.x + area.w, b.x + Math.max(b.w, 2));
        const by1 = Math.min(area.y + area.h, b.y + Math.max(b.h, 2));
        if (bx1 <= bx0 || by1 <= by0) continue;
        // Lines and outlines count by their length, not the box they span.
        const wgt = Math.max(bx1 - bx0, by1 - by0) * 6;
        wx += ((bx0 + bx1) / 2) * wgt;
        wy += ((by0 + by1) / 2) * wgt;
        wsum += wgt;
        for (let gx = 0; gx < GX; gx++)
          for (let gy = 0; gy < GY; gy++) {
            const c0 = area.x + (gx * area.w) / GX;
            const r0 = area.y + (gy * area.h) / GY;
            if (bx0 < c0 + area.w / GX && bx1 > c0 && by0 < r0 + area.h / GY && by1 > r0) cell[gy * GX + gx] = 1;
          }
      }
      const used = cell.reduce((a, c) => a + c, 0) / cell.length;
      const ox = wsum ? (wx / wsum - (area.x + area.w / 2)) / area.w : 0;
      const oy = wsum ? (wy / wsum - (area.y + area.h / 2)) / area.h : 0;
      if (Math.abs(ox) > 0.14) out.push(['LOPSIDED', name, `무게가 ${ox > 0 ? '오른쪽' : '왼쪽'}으로 쏠림 (가운데에서 ${(Math.abs(ox) * 100).toFixed(0)}%)`]);
      if (Math.abs(oy) > 0.16) out.push(['LOPSIDED', name, `무게가 ${oy > 0 ? '아래' : '위'}로 쏠림 (가운데에서 ${(Math.abs(oy) * 100).toFixed(0)}%)`]);
      // Empty columns / rows strictly inside the drawing = a hole in the middle.
      const colsUsed = [...Array(GX).keys()].map((gx) => [...Array(GY).keys()].some((gy) => cell[gy * GX + gx]));
      const first = colsUsed.indexOf(true);
      const last = colsUsed.lastIndexOf(true);
      const holes = colsUsed.slice(first, last + 1).filter((u) => !u).length;
      if (holes >= 2) out.push(['SPARSE', name, `가운데가 비어 있음 (세로 띠 ${holes} 칸이 빔)`]);
      if (used < 0.45) out.push(['SPARSE', name, `칸의 ${(used * 100).toFixed(0)}% 에만 그림`]);
      const fill = used;
      if (p.step) fills.push([p.step, fill]);
    }
    if (fills.length === 3) {
      const f = fills.map((x) => x[1]);
      if (Math.max(...f) - Math.min(...f) > 0.35) out.push(['BALANCE', '활동 칸 세 개', fills.map(([s, v]) => `${s} ${(v * 100).toFixed(0)}%`).join(' · ')]);
    }
    return out;
  }, defs[id]);
  total += problems.length;
  console.log(`${id}: ${problems.length ? `${problems.length} 곳` : 'OK'}`);
  for (const [kind, what, detail] of problems) console.log(`  ${kind.padEnd(9)} ${what.slice(0, 60)} — ${detail}`);
}
await browser.close();
console.log(total ? `figures: ${total} problem(s)` : 'figures: OK');
process.exit(total ? 1 : 0);
