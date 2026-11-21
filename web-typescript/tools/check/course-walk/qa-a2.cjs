// 실행: (web-typescript에서 npx next build && npx next start -p 3123 을 띄운 뒤) node tools/check/course-walk/qa-a2.cjs   — 약 1분, WALK_BASE로 다른 주소
// QA 수정 지시서 A2 재현: 12차시 4-1 실습, 이동 단위 10mm로 X+ 25번 · Y+ 25번 · Z+ 30번을 0.08초 간격으로 연타.
// 통과 = 브라우저 확인창 0번이고, 연타가 끝난 뒤 10초 안에 움직임이 멈춤. 가장 긴 화면 멈춤(ms)도 출력. 실패하면 종료 코드 1.
// 개발용 점검이라 앱 번들(src · public)에 들어가지 않는다.
process.env.WALK_W ||= '1920';
process.env.WALK_H ||= '1080';
const L = require('./lib.cjs');
const IDLE_LIMIT_S = 10;

(async () => {
  const b = await L.launch();
  const ctx = await L.context(b, { rate: '1' });
  const p = await L.open(ctx, '/track/life?course=12&no=4-1&mode=practice&render=1');
  let dialogs = 0;
  p.on('dialog', async (d) => {
    dialogs++;
    console.log('확인창', d.message().slice(0, 70));
    await d.dismiss();
  });
  await L.idle(p);
  await p.waitForTimeout(2000);
  for (let i = 0; i < 10; i++) {
    const np = await L.nowParts(p);
    if (!(np && /좌표 버튼/.test(np.text))) break;
    await p.evaluate(() => document.querySelector('[title^="좌표: 손끝"]')?.click());
    await p.waitForTimeout(800);
  }
  const unit = await p.evaluate(() => {
    const e = [...document.querySelectorAll('aside button')].find((x) => x.textContent.trim() === '10' && x.offsetParent);
    if (e) e.click();
    return !!e;
  });
  await p.waitForTimeout(500);
  if (!unit) console.log('(이동 단위 10 버튼을 못 찾음 — 기본 단위로 연타)');
  await p.evaluate(() => {
    window.__gap = 0;
    let t = performance.now();
    const f = () => {
      const n = performance.now();
      window.__gap = Math.max(window.__gap, n - t);
      t = n;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  const press = (ax) =>
    p.evaluate((ax) => {
      const e = [...document.querySelectorAll('aside [aria-label]')].find((x) => x.getAttribute('aria-label').endsWith(`(${ax})`));
      if (!e) return false;
      e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      e.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      e.click();
      return true;
    }, ax);
  let missing = 0;
  for (const [ax, n] of [
    ['X+', 25],
    ['Y+', 25],
    ['Z+', 30],
  ]) {
    for (let i = 0; i < n; i++) {
      if (!(await press(ax))) missing++;
      await p.waitForTimeout(80);
    }
  }
  const t1 = Date.now();
  await L.idle(p, 120000);
  const idleS = (Date.now() - t1) / 1000;
  const gap = await p.evaluate(() => Math.round(window.__gap));
  console.log('멈춤까지', idleS.toFixed(1), 's · 가장 긴 화면 멈춤', gap, 'ms · 확인창', dialogs, '번 · 못 찾은 버튼', missing);
  const ok = dialogs === 0 && idleS <= IDLE_LIMIT_S && missing === 0 && !L.errs.length;
  console.log(ok ? 'PASS A2' : 'FAIL A2', L.errs.length ? L.errs.slice(0, 3) : '');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
