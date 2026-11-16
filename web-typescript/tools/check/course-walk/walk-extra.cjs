// 가독성 점검 · 교안 캡처의 나머지 화면: node walk-extra.cjs <2-1|list|intro|all>
//  2-1: 구성품 다섯 개 → 로봇 · 매트 · 카드 놓기 (교안 캡처 1차에서는 빼는 절: 에셋이 온 뒤 2차)
//  list: [목록] — 장마다 눌러서
//  intro: 처음 들어올 때 (기록 없음) — 인트로, 그다음 저작권 안내
const L = require('./lib.cjs');
const only = (process.argv[2] || 'all').split(',');
const want = (k) => only.includes('all') || only.includes(k);

(async () => {
  const b = await L.launch();
  const sec = async (k, fn) => {
    if (!want(k)) return;
    console.log('==', k);
    const ctx = await L.context(b);
    try {
      await fn(ctx);
    } catch (e) {
      console.log(' FAIL', k, e.message.slice(0, 200));
    }
    await ctx.close();
  };

  await sec('2-1', async (ctx) => {
    const p = await L.open(ctx, '/track/life?no=2-1');
    const d = '2장/2-1';
    await L.shot(p, d, '2-1_1_전', { settle: true });
    for (let i = 0; i < 5; i++) {
      await p.evaluate((i) => document.querySelectorAll('[data-step="kit"] button')[i]?.click(), i);
      await p.waitForTimeout(500);
    }
    await L.shot(p, d, '2-1_1_후', { wait: 1200 });
    for (let k = 0; k < 3; k++) {
      const at = await p.evaluate((k) => {
        const pts = window.__placeAt?.();
        const c = document.querySelector('canvas')?.getBoundingClientRect();
        return pts && c ? [c.left + pts[k][0], c.top + pts[k][1]] : null;
      }, k);
      if (!at) {
        console.log('  MISS place', k);
        break;
      }
      await p.mouse.click(at[0], at[1]);
      await p.waitForTimeout(1200);
      await L.shot(p, d, `2-1_2_${k + 1}`, { wait: 800 });
    }
  });

  await sec('list', async (ctx) => {
    const p = await L.open(ctx, '/track/life?no=1-1');
    await p.evaluate(() => [...document.querySelectorAll('header button')].find((x) => x.textContent.includes('목록'))?.click());
    await p.waitForTimeout(1500);
    const n = await p.evaluate(() => document.querySelectorAll('nav[aria-label="장"] button').length);
    for (let i = 0; i < n; i++) {
      await p.evaluate((i) => document.querySelectorAll('nav[aria-label="장"] button')[i]?.click(), i);
      await L.shot(p, '목록', `목록_${i + 1}`, { wait: 700 });
    }
  });

  if (want('intro')) {
    console.log('== intro');
    const ctx = await b.newContext({ viewport: { width: L.W, height: L.H } });
    await ctx.addInitScript(() => {
      const hide = () => {
        const st = document.createElement('style');
        st.textContent = 'nextjs-portal{display:none!important}';
        document.head.appendChild(st);
      };
      document.addEventListener('DOMContentLoaded', hide);
    });
    const p = await ctx.newPage();
    await p.goto((process.env.WALK_BASE || 'http://localhost:3123') + '/track/life', { timeout: 240000 });
    // The 저작권 안내 comes over the intro at once; once it is read, the intro alone till the robot is ready.
    const t = Date.now();
    while (Date.now() - t < 120000 && !(await p.evaluate(() => !!document.querySelector('[role="dialog"], [role="alertdialog"]')))) await p.waitForTimeout(500);
    await L.shot(p, '인트로', '저작권안내', { wait: 800 });
    await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button')].find((x) => x.textContent.includes('확인'))?.click());
    await L.shot(p, '인트로', '인트로', { wait: 200 });
    await ctx.close();
  }
  console.log('errors', L.errs.length ? [...new Set(L.errs)] : 'none');
  await b.close();
})();
