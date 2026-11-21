// 실행: (web-typescript에서 npx next build && npx next start -p 3123 을 띄운 뒤) node tools/check/course-walk/qa-a1.cjs   — 약 6분, WALK_BASE로 다른 주소
// QA 수정 지시서 A1 재현 1: 12차시 1-1 데모가 끝까지 돌고 로봇이 복귀한 뒤 '다음으로' → 1-2.
// 통과 = 1-2가 영점 자세(0,0,0,0,0,0)로 열리고, 베이스(J1)를 누르면 '2 / 7 단계'로 넘어감. 실패하면 종료 코드 1.
// 개발용 점검이라 앱 번들(src · public)에 들어가지 않는다.
process.env.WALK_W ||= '1920';
process.env.WALK_H ||= '1080';
const L = require('./lib.cjs');
const ang = (p) => p.evaluate(() => window.__render?.world.current.angles.map((a) => Math.round(a)).join(','));
const clickText = (p, re) =>
  p.evaluate((re) => {
    const b = [...document.querySelectorAll('button')].find((x) => new RegExp(re).test(x.textContent.trim()) && x.offsetParent && !x.disabled);
    if (b) {
      b.click();
      return b.textContent.trim();
    }
    return null;
  }, re);

(async () => {
  const b = await L.launch();
  const ctx = await L.context(b, { rate: '1' });
  const p = await L.open(ctx, '/track/life?course=12&no=1-1&render=1');
  await L.idle(p);
  await p.waitForTimeout(1500);
  const t0 = Date.now();
  await L.click(p, '[data-step="run"]');
  for (let i = 0; i < 20 && !(await L.busy(p)); i++) await p.waitForTimeout(300);
  while (Date.now() - t0 < 600000 && (await L.busy(p))) await p.waitForTimeout(3000);
  await p.waitForTimeout(3000);
  console.log('1-1 데모 끝', Math.round((Date.now() - t0) / 1000), 's · 자세', await ang(p));
  let opened = null;
  for (let k = 0; k < 6; k++) {
    await clickText(p, '^다음으로');
    await p.waitForTimeout(2500);
    await L.idle(p);
    await p.waitForTimeout(1500);
    const np = await L.nowParts(p);
    if (/관절/.test(np?.text || '')) {
      opened = { ang: await ang(p), np };
      break;
    }
  }
  if (!opened) {
    console.log('FAIL 1-2 첫 단계(관절 찾기)를 못 봄');
    await b.close();
    process.exit(1);
  }
  console.log('1-2 열림 · 자세', opened.ang, '·', opened.np.steps);
  const hit = await p.evaluate(() => {
    const s = document.querySelector('button[aria-label][data-base]');
    if (!s) return false;
    s.click();
    return true;
  });
  await p.waitForTimeout(1500);
  const after = await L.nowParts(p);
  console.log('J1 누름', hit ? '·' : '(핫스팟 없음) ·', after?.steps);
  const ok = opened.ang === '0,0,0,0,0,0' && hit && /^2 \/ 7/.test(after?.steps || '') && !L.errs.length;
  console.log(ok ? 'PASS A1' : 'FAIL A1', L.errs.length ? L.errs.slice(0, 3) : '');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
