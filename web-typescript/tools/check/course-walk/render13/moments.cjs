// 파트 13 렌더 3: R14 (5-2 카드 놓인 매트, 책상 포함) · R15 R16 R17a/b/c (5-3 실행 중 순간: 그 순간의 3D 그림을 바로 받는다)
const R = require('./lib.cjs');
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (n) => !only || only.has(n);
const MAT = [[110, -90, 0], [300, -90, 0], [110, 70, 0], [300, 70, 0]];
const CARD = [[150, -40, 0], [270, -40, 0], [150, 40, 0], [270, 40, 0]];
const ASIDE = [160, 45.87, -92.37, -41.3, 2.02, 9.58];
const click = (p, sel) => p.evaluate((s) => document.querySelector(s)?.click(), sel);
/** What the run is doing now: 'put' · 'take' (the customer's hand), 'up' (빈 이동: pen lifted), 'draw', 'idle'. */
const phase = (p) =>
  p.evaluate(() => {
    const q = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('예측 없이 계속'));
    if (q) {
      q.click();
      return 'quiz';
    }
    const d = window.__render.world.current.cell?.draw;
    if (d?.hand) return d.hand.then;
    if (!document.querySelector('[data-busy]')) return 'idle';
    // Pen up or down: the flange's height against the lowest seen while ink was being laid (ink on the card: some stroke started).
    const R = window.__render;
    const v = R.arm.flange.getWorldPosition(R.camera.position.clone());
    const z = v.y * 1000;
    const ink = (R.world.current.trail ?? []).some((s) => s.length > 1);
    if (!ink) return 'busy';
    window.__zmin = Math.min(window.__zmin ?? Infinity, z);
    return z > window.__zmin + 2 ? 'up' : 'draw';
  });
/** The clock stopped, the canvas's last picture taken as it is (no new frame comes while stopped). */
async function freezeShot(p, name, cam0) {
  // (A camera given as a function: worked out at this moment — R15 looks at the pen tip where it is now.)
  const cam = typeof cam0 === 'function' ? await cam0(p) : cam0;
  // (The course may have turned the view during the run — a 확인 문제 shows its own: set it again, twice, then take.)
  for (let k = 0; k < 2 && cam; k++) {
    await R.look(p, cam.eye, cam.target);
    await p.waitForTimeout(250);
  }
  if (cam) console.log('  cam', name, JSON.stringify(await p.evaluate(() => { const r = window.__render; const c = r.camera.position; return { at: [c.x, -c.z, c.y].map((v) => Math.round(v * 1000)), canvases: document.querySelectorAll('canvas').length }; })), 'want', cam.eye.map(Math.round));
  // A frame drawn after the camera was set (swiftshader draws slowly: the canvas may still hold an older one).
  await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => ok())))));
  // (The scene's own canvas: the page has others — the camera pictures.)
  const url = await p.evaluate(() => window.__render.gl.domElement.toDataURL('image/png'));
  require('fs').writeFileSync(`${R.OUT}/${name}.raw.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('shot', name, '(canvas)');
}
/** Run 5-3 (손님 1명) and shoot at the moments asked: [{ name, at: phase, after: ms, n: which time it comes }]. */
async function run53(b, plan, prep) {
  const ctx = await R.L.context(b, {});
  const p = await R.open(ctx, '5-3');
  // 손님 1명 (R17은 2명: 두 번째 카드를 받는 순간이 있다)
  if (!prep.two) await p.evaluate(() => [...document.querySelectorAll('aside button')].find((x) => x.textContent.trim() === '−' || x.textContent.trim() === '-')?.click());
  await p.waitForTimeout(400);
  await R.clean(p, { keep: ['booth', ...(prep.desk ? ['desk'] : [])] });
  const cam = await prep.cam(p);
  await click(p, 'button[aria-label="시뮬레이션"]');
  const seen = {};
  let last = '';
  const todo = plan.slice();
  const t0 = Date.now();
  for (let t = 0; Date.now() - t0 < 900000 && todo.length; t++) {
    // (The view kept on the render's camera all through the run: the course turns it for a 확인 문제.)
    if (cam && cam.eye && t % 4 === 0) await R.look(p, cam.eye, cam.target);
    const ph = await phase(p);
    if (ph !== last) {
      seen[ph] = (seen[ph] || 0) + 1;
      last = ph;
    }
    const s = todo[0];
    if (ph === s.at && seen[ph] >= (s.n || 1)) {
      if (s.after) await p.waitForTimeout(s.after);
      await freezeShot(p, s.name, cam);
      todo.shift();
      for (const k of Object.keys(seen)) seen[k] = 0;
      last = '';
    }
    if (ph === 'idle' && t > 30) break;
    await p.waitForTimeout(80);
  }
  if (todo.length) console.log('missed', todo.map((s) => s.name).join(','), JSON.stringify(seen));
  await ctx.close();
}
(async () => {
  const b = await R.L.launch();
  // R14 카드 놓인 매트 · 위에서 (책상 포함)
  if (want('R14')) {
    const ctx = await R.L.context(b, {});
    const p = await R.open(ctx, '5-2');
    await R.clean(p, { keep: ['booth', 'desk'] });
    await R.angles(p, ASIDE);
    await R.frame(p, [0, -0.03, 1], [205, -10, 0], { pts: MAT, arm: false, fill: 0.94 });
    await R.shot(p, 'R14', 2500);
    await ctx.close();
  }
  // R15 획 사이 펜 든 순간 · 옆에서
  if (want('R15'))
    await run53(b, [{ name: 'R15', at: 'up', n: 1, after: 0 }], {
      cam: async () => async (p) => {
        // the flange (robot mm); the pen hangs about 60 mm under it — seen from the customer's side, a little above the paper
        const f = await p.evaluate(() => { const r = window.__render; const v = r.arm.flange.getWorldPosition(r.camera.position.clone()); return [v.x * 1000, -v.z * 1000, v.y * 1000]; });
        const t = [f[0], f[1], Math.max(10, f[2] - 55)];
        return { eye: [t[0] + 40, t[1] - 230, t[2] + 25], target: t };
      },
    });
  // R16 다 쓴 글자 카드 가까이
  if (want('R16'))
    await run53(b, [{ name: 'R16', at: 'take', after: 0 }], {
      cam: async (p) => R.frame(p, [0, -0.45, 1], [210, 0, 0], { pts: CARD, arm: false, fill: 0.92 }),
    });
  // R17a 카드 받기 · R17b 쓰기 · R17c 건네기 (같은 카메라, 책상 포함, 손 에셋 없음 → 손 없이)
  if (want('R17a') || want('R17b') || want('R17c'))
    await run53(
      b,
      [
        { name: 'R17a', at: 'busy', after: 300 },
        { name: 'R17b', at: 'draw', after: 2500 },
        { name: 'R17c', at: 'take', after: 500 },
      ],
      {
        desk: true,
        cam: async (p) => {
          await R.angles(p, R.HOME);
          return R.frame(p, [0.25, -1, 0.85], [120, 0, 80], { pts: [...MAT, [-85, -85, 0], [-85, 85, 0], [300, -150, 0]], fill: 0.85 });
        },
      },
    );
  console.log('errors', R.L.errs.slice(0, 3));
  await b.close();
})();
