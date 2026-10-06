// Record each topic figure's animation (/figures/<id>) to public/education/fig/<id>.gif,
// for slides, handouts and the 자료실. The page's CSS animations are paused and stepped
// frame by frame, so the GIF is smooth however slow the machine is; the last frame holds.
// The last frame is also kept as <id>.png, the still the 교육 home shows; --still makes only that.
//   BASE=http://localhost:3000 FFMPEG=/path/to/ffmpeg node tools/build/figure-gifs.mjs [--still] [5-2 ...]
// Needs the app running (npm run dev) and Playwright + ffmpeg.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const outDir = path.join(web, 'public', 'education', 'fig');
const FPS = 15;
const HOLD = 2.5;
const WIDTH = 960;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}

const all = JSON.parse(
  execFileSync('npx', ['tsx', '-e', "import('./src/ui/education/fig/index.ts').then((m) => console.log(JSON.stringify(Object.keys(m.FIGURES ?? m.default.FIGURES))))"], { cwd: web }).toString(),
);
const args = process.argv.slice(2);
const stillOnly = args.includes('--still');
const ids = args.filter((a) => a !== '--still').length ? args.filter((a) => a !== '--still') : all;
/** The last frame, scaled like the GIF, as <id>.png. */
const still = (frame, id) => {
  const out = path.join(outDir, `${id}.png`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', frame, '-vf', `scale=${WIDTH}:-2:flags=lanczos`, out]);
  console.log(`${id}.png  ${(statSync(out).size / 1024).toFixed(0)} KB`);
};

const { chromium } = await loadPlaywright();
const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  await page.goto(`${base}/figures/${id}`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  // The dev server's badge sits over the page corner.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  // Hold every animation, and find when the last one-shot animation ends.
  const end = await page.evaluate(() => {
    let end = 0;
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = 0;
      const t = a.effect?.getComputedTiming();
      if (t && Number.isFinite(t.endTime)) end = Math.max(end, Number(t.endTime));
    }
    return end / 1000;
  });
  const dir = path.join(tmpdir(), `fig-${id}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fig = page.locator('#figure svg');
  const n = Math.max(1, Math.ceil(end * FPS));
  const last = path.join(dir, `f${String(n).padStart(4, '0')}.png`);
  if (stillOnly) {
    await page.evaluate((ms) => {
      for (const a of document.getAnimations()) a.currentTime = ms;
    }, end * 1000);
    await fig.screenshot({ path: last });
    still(last, id);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  for (let i = 0; i <= n; i++) {
    const t = Math.min(end, i / FPS) * 1000;
    await page.evaluate((ms) => {
      for (const a of document.getAnimations()) a.currentTime = ms;
    }, t);
    await fig.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) });
  }
  const list = Array.from({ length: n + 1 }, (_, i) => `file '${path.join(dir, `f${String(i).padStart(4, '0')}.png`)}'\nduration ${i === n ? HOLD : (1 / FPS).toFixed(4)}`).join('\n');
  writeFileSync(path.join(dir, 'list.txt'), `${list}\nfile '${path.join(dir, `f${String(n).padStart(4, '0')}.png`)}'\n`);
  const out = path.join(outDir, `${id}.gif`);
  execFileSync(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    path.join(dir, 'list.txt'),
    '-vf',
    `scale=${WIDTH}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    '-loop',
    '0',
    out,
  ]);
  still(last, id);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${id}.gif  ${(statSync(out).size / 1024).toFixed(0)} KB  (${n + 1} frames, ${end.toFixed(1)} s + ${HOLD} s)`);
}
await browser.close();
