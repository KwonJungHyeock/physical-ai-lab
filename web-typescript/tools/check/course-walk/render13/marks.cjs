// 파트 13 렌더 2: R03 (1-2 이름표) · R04 R10 (펜 손끝) · R11 (4-2 장면 보기) · R12a/b (4-3) · R13a/b (4-4)
const R = require('./lib.cjs');
const fs = require('fs');
const seed = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../seeds/done8.json'), 'utf8'));
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (n) => !only || only.has(n);
const FRONT = [0.75, -0.6, 0.45];
const BOX = [[-85, -85, 0], [85, 85, 0], [85, -85, 0], [-85, 85, 0]];
const MAT = [[110, -90, 0], [300, -90, 0], [110, 70, 0], [300, 70, 0]];
const TOP = [0, -0.03, 1];
const ASIDE = [160, 45.87, -92.37, -41.3, 2.02, 9.58];
const click = (p, sel) => p.evaluate((s) => document.querySelector(s)?.click(), sel);
const byText = (p, t) => p.evaluate((t) => [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled)?.click(), t);
const runIdle = async (p) => {
  await click(p, '[data-step="run"]');
  await R.L.idle(p);
  for (let t = 0; t < 240 && (await p.evaluate(() => !!document.querySelector('[data-busy]'))); t++) await p.waitForTimeout(500);
  await p.waitForTimeout(1500);
};
const tipMm = (p) => p.evaluate(() => { const v = window.__render.arm.flange.getWorldPosition(window.__render.camera.position.clone()); return [v.x * 1000, -v.z * 1000, v.y * 1000]; });
const matShot = async (p, name, html) => {
  await R.clean(p, { keep: ['booth'], html });
  await R.angles(p, ASIDE);
  await R.frame(p, TOP, [205, -10, 0], { pts: MAT, arm: false, fill: 0.9 });
  await R.shot(p, name, 2500);
};
(async () => {
  const b = await R.L.launch();
  // R03 관절 이름표
  if (want('R03')) {
    const ctx = await R.L.context(b, {});
    const p = await R.open(ctx, '1-2');
    for (const n of ['베이스(J1)', '어깨(J2)', '팔꿈치(J3)', '손목 꺾기(J4)', '손목 돌리기(J5)', '손끝 돌리기(J6)', '손끝']) {
      await click(p, `button[aria-label="${n}"]`);
      await p.waitForTimeout(1900);
    }
    await R.clean(p, { html: '\\(J\\d\\)|^손끝$' });
    await R.frame(p, FRONT, [0, 0, 220], { pts: BOX, fill: 0.76 });
    await R.shot(p, 'R03', 2500);
    await ctx.close();
  }
  // R04 손끝 + 펜 · R10 손끝 X·Y·Z 축 (펜을 단 1-2의 팔, 기본 자세)
  if (want('R04') || want('R10')) {
    const ctx = await R.L.context(b, {});
    const p = await R.open(ctx, '1-2');
    await R.clean(p);
    await R.angles(p, R.HOME);
    await p.waitForTimeout(800);
    const f = await tipMm(p);
    console.log('flange', f.map(Math.round));
    const box = (s, dz) => [[f[0] - s, f[1] - s, f[2] + s], [f[0] + s, f[1] + s, f[2] + s], [f[0] - s, f[1] + s, f[2] - dz], [f[0] + s, f[1] - s, f[2] - dz]];
    if (want('R04')) {
      await R.frame(p, [0.8, -0.55, 0.25], f, { pts: box(35, 95), arm: false, fill: 0.85 });
      await R.shot(p, 'R04');
    }
    if (want('R10')) {
      await p.evaluate(() => window.__render.toolAxes(true));
      await R.frame(p, [0.8, -0.55, 0.35], f, { pts: box(55, 110), arm: false, fill: 0.85 });
      await R.shot(p, 'R10');
    }
    await ctx.close();
  }
  // R11 관절 이동 선 + 직선 이동 선 (4-2 장면 보기: 관절 이동 다음 직선 이동, 두 선이 남는다)
  if (want('R11')) {
    const ctx = await R.L.context(b, {});
    const p = await R.open(ctx, '4-2&mode=scene');
    let was = false;
    let quiet = 0;
    for (let t = 0; t < 600; t++) {
      const busy = await p.evaluate(() => !!document.querySelector('[data-busy]'));
      if (busy) {
        was = true;
        quiet = 0;
      } else if (was) quiet++;
      if (was && quiet > 12) break;
      await p.waitForTimeout(500);
    }
    await p.waitForTimeout(2000);
    await matShot(p, 'R11', '^[AB]$');
    await ctx.close();
  }
  // R12a 세모 · R12b 네모 (4-3 자유 실습, 도형마다 새 화면)
  for (const [name, pts] of [
    ['R12a', [[170, -40], [230, -40], [200, 12]]],
    ['R12b', [[226, 16], [226, -40], [170, -40], [170, 16]]],
  ]) {
    if (!want(name)) continue;
    const ctx = await R.L.context(b, { seed });
    const p = await R.open(ctx, '4-3');
    await click(p, '[data-step="free"]');
    await p.waitForTimeout(1500);
    for (let k = 0; k < 8; k++) {
      const n = (await p.$$('[data-step="vertices"] input')).length / 2;
      if (n === pts.length) break;
      await byText(p, n < pts.length ? '점 더하기' : '마지막 점 빼기');
      await p.waitForTimeout(250);
    }
    const ins = await p.$$('[data-step="vertices"] input');
    for (let i = 0; i < pts.length; i++) {
      await ins[2 * i].fill(String(pts[i][0]));
      await ins[2 * i + 1].fill(String(pts[i][1]));
    }
    await runIdle(p);
    await matShot(p, name, '^[1-9]$');
    await ctx.close();
  }
  // R13a 원 8점 · R13b 원 24점 (4-4 자유 실습, 점 개수마다 새 화면)
  for (const [name, n] of [
    ['R13a', 0],
    ['R13b', 1],
  ]) {
    if (!want(name)) continue;
    const ctx = await R.L.context(b, { seed });
    const p = await R.open(ctx, '4-4');
    await click(p, '[data-step="free"]');
    await p.waitForTimeout(1500);
    const ins = await p.$$('[data-step="circle"] input');
    await ins[0].fill('200');
    await ins[1].fill('-10');
    await ins[2].fill('30');
    await p.evaluate((n) => document.querySelectorAll('[data-step="count"] button')[n]?.click(), n);
    await runIdle(p);
    await matShot(p, name);
    await ctx.close();
  }
  console.log('errors', R.L.errs.slice(0, 3));
  await b.close();
})();
