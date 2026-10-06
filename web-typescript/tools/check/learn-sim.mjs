// Browser check of the 교육 tab: for every topic in tests/education/sim/, open it,
// do tries A · B · C the way its 원고 says (the scenario's presses), and check
// the result chips against the numbers its 볼 것 promises.
//   [SLOW=3] npx tsx tools/check/learn-sim.mjs [5-2 ...] [--clips]   (tsx: the scenarios are TypeScript)
// Needs the app running (npm run dev; BASE=http://localhost:3000) and Playwright.
// --clips also records each try's 3D view (with the panel) to
// public/education/clips/<topic>-<step>.gif with ffmpeg (FFMPEG=path, else ffmpeg on PATH).

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SCENARIOS } from '../../tests/education/sim/index.ts';

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const base = process.env.BASE ?? 'http://localhost:3000';
const args = process.argv.slice(2);
const clips = args.includes('--clips');
const only = args.filter((a) => !a.startsWith('--'));
const scenarios = SCENARIOS.filter((s) => !only.length || only.includes(s.topic));
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
// SLOW=3 gives each try three times as long (software 3D on a busy machine draws ~1 frame a second, and some tries step their physics per frame).
const slow = Number(process.env.SLOW ?? 1);
const clipDir = path.join(web, 'public', 'education', 'clips');

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
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('robot-console-model', 'mycobot280-rdkx5');
  } catch {
    /* private */
  }
});
const page = await ctx.newPage();
// Slow software 3D (SwiftShader) can hold the page for a while: wait longer than Playwright's 30 s.
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (c) => c.type() === 'error' && !/Failed to load resource|DevTools|WebGL|GPU stall/.test(c.text()) && errors.push(c.text().slice(0, 200)));

await page.goto(`${base}/console?from=sim`, { waitUntil: 'load', timeout: 240000 });
// The intro's last frame waits for a choice: 시뮬레이터로 시작 (the robot's own console has none).
await page.getByRole('button', { name: '시뮬레이터로 시작' }).click({ timeout: 240000 }).catch(() => {});
await page.waitForFunction(() => document.querySelector('[class*=splash][data-done]'), null, { timeout: 240000 });
await page
  .getByRole('button', { name: '시뮬레이션만 (로봇 없이)' })
  .click({ timeout: 90000 })
  .catch(() => {});
// The app always opens on the simulator: go to 교육.
await page.getByRole('tab', { name: '교육' }).click();
await page.waitForTimeout(1500);

// The dev server's badge sits over the page corner, the mouse hint over the 3D view (neither in the clips).
await page.addStyleTag({ content: 'nextjs-portal{display:none!important} [class*=stageHint]{display:none!important}' });

const panel = page.locator('section[aria-label="실습 제어판"]');
const stage = page.locator('section[aria-label="3D 실습 화면"]');

async function openTopic(id) {
  // The lesson opens straight at 활동 1 (window.__learnOpen, the same as 수업 시작 on the course map).
  await page.waitForFunction(() => !!window.__learnOpen, null, { timeout: 60000 });
  await page.evaluate((t) => window.__learnOpen(t, 'A'), id);
  // Let the topic's panel and 3D scene settle (slow when the machine is busy).
  await panel.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2500);
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
    if (process.env.DEBUG) console.log('    [pick]', (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  }
  else await page.waitForTimeout(a.wait * slow);
  await page.waitForTimeout(250);
}

/** The result chips of the open try (null until it is done). */
const chips = () =>
  panel.evaluate((el) => {
    const box = el.querySelector('[class*=resultBox][data-state=done]');
    if (!box) return null;
    return Object.fromEntries([...box.querySelectorAll('li')].map((li) => [li.querySelector('small')?.textContent?.trim() ?? '', li.querySelector('b')?.textContent?.trim() ?? '']));
  });

const matches = (got, want) => {
  if (got === undefined) return false;
  const re = /^\/(.*)\/$/.exec(want);
  return re ? new RegExp(re[1]).test(got) : got.includes(want);
};

/** Frames of the 3D view while `run` goes on, then encoded to a clip. */
async function record(name, run) {
  if (!clips) return run();
  const dir = path.join(tmpdir(), `clip-${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const box = await stage.boundingBox();
  const frames = [];
  let going = true;
  const grab = (async () => {
    const t0 = Date.now();
    while (going) {
      const file = path.join(dir, `f${String(frames.length).padStart(4, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88, clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
      frames.push({ file, t: (Date.now() - t0) / 1000 });
    }
  })();
  try {
    await run();
    await page.waitForTimeout(1200);
  } finally {
    going = false;
    await grab;
  }
  // Real timing: each frame lasts until the next one was taken.
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? f.t + 0.1) - f.t).toFixed(3)}`).join('\n');
  writeFileSync(path.join(dir, 'list.txt'), `${list}\nfile '${frames.at(-1).file}'\n`);
  mkdirSync(clipDir, { recursive: true });
  const vf = 'fps=12,scale=560:-2:flags=lanczos';
  const out = path.join(clipDir, name);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', `${vf},split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', `${out}.gif`]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`    clip ${name}.gif ${(statSync(`${out}.gif`).size / 1024).toFixed(0)} KB`);
}

let failed = 0;
for (const sc of scenarios) {
  const before = errors.length;
  await openTopic(sc.topic);
  for (const [i, k] of ['A', 'B', 'C'].entries()) {
    const st = sc[k];
    await panel.locator('ol[aria-label="실습 순서"] button').nth(i).click();
    await page.waitForTimeout(700);
    let got = null;
    let problem = '';
    await record(`${sc.topic}-${k}`, async () => {
      try {
        const before = JSON.stringify(await chips());
        for (const a of st.do) await act(a);
        // The result of these presses: chips that differ from before (a try done again may keep its
        // chips — then accept them after a while) and hold still for a moment.
        const t0 = Date.now();
        const until = t0 + (st.timeout ?? 30000) * slow;
        let last = '';
        let still = 0;
        while (Date.now() < until) {
          const now = await chips();
          const s = JSON.stringify(now);
          if (now && (s !== before || Date.now() - t0 > 12000)) {
            still = s === last ? still + 1 : 0;
            if (still >= 3) {
              got = now;
              break;
            }
          }
          last = s;
          await page.waitForTimeout(400);
        }
        if (!got) problem = `결과가 안 나옴 — 제어판: ${(await panel.innerText()).replace(/\s+/g, ' ').slice(0, 240)}`;
      } catch (e) {
        problem = `누르기 실패: ${e.message.split('\n')[0]}`;
      }
    });
    const bad = got ? Object.entries(st.expect).filter(([n, want]) => !matches(got[n], want)) : [];
    const ok = !problem && !bad.length;
    if (!ok) failed++;
    const shown = got ? Object.entries(got).map(([n, v]) => `${n} ${v}`).join(' · ') : '';
    console.log(`${ok ? '  ok ' : '  ✗  '} ${sc.topic} ${k}  ${problem || shown}`);
    for (const [n, want] of bad) console.log(`       ${n}: 원고 "${want}" ≠ 화면 "${got[n] ?? '(없음)'}"`);
  }
  for (const e of errors.slice(before)) {
    failed++;
    console.log(`  ✗  ${sc.topic} 오류: ${e}`);
  }
}
await browser.close();
console.log(failed ? `learn sim: ${failed} problem(s)` : `learn sim: ${scenarios.length} topics OK`);
process.exit(failed ? 1 : 0);
