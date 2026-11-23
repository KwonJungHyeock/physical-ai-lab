// 입문 인트로 그림 intro-life-1 (public/course/assets/): 1-1 장면 보기에서 로봇이 카드에 '사랑해'를 쓰는 중, 화면 UI 없이 (1920 × 1440).
// 실행: (next start -p 3123을 띄운 뒤) R_OUT=<폴더> node tools/check/course-walk/render13/intro.cjs  → <폴더>/intro-life-1.raw.png
const R = require('./lib.cjs');
const MAT = [[110, -90, 0], [300, -90, 0], [300, 70, 0], [110, 70, 0]];
(async () => {
  const b = await R.L.launch();
  const ctx = await R.L.context(b, { rate: '1' });
  const p = await R.open(ctx, '1-1&mode=scene');
  // Wait until two letters are written (the pen on the card, the third one coming).
  await p.waitForFunction(() => window.__render.world.current.trail.reduce((n, s) => n + s.length, 0) > 170, null, { timeout: 600000, polling: 100 });
  // The pen on the paper: the ink growing between two looks.
  await p.waitForFunction(() => { const w = window.__render.world.current; const n = w.trail.reduce((a, s) => a + s.length, 0); const was = window.__inkWas ?? n; window.__inkWas = n; return n > was; }, null, { timeout: 600000, polling: 120 });
  await R.clean(p, { keep: ['desk', 'lamp', 'booth'] });
  await R.frame(p, [0.3, -0.85, 0.48], [160, -10, 90], { pts: MAT, fill: 0.8 });
  await p.waitForTimeout(800);
  await p.mouse.move(1919, 1439);
  await p.screenshot({ path: `${R.OUT}/intro-life-1.raw.png`, clip: { x: 0, y: 0, width: 1920, height: 1440 }, timeout: 180000 });
  console.log('shot intro');
  await b.close();
})();
