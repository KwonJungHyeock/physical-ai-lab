// 파트 13 렌더 1: 맨 책상 절(3-3)에서 — R01 R02 R05 R06a/b R07a~f R08 R09
const R = require('./lib.cjs');
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (n) => !only || only.has(n);
const BOX = [[-85, -85, 0], [85, 85, 0], [85, -85, 0], [-85, 85, 0]];
const ring = (r, z = 0) => Array.from({ length: 16 }, (_, i) => [r * Math.cos((i * Math.PI) / 8), r * Math.sin((i * Math.PI) / 8), z]);
const FRONT = [0.75, -0.6, 0.45];
(async () => {
  const b = await R.L.launch();
  const ctx = await R.L.context(b, {});
  const p = await R.open(ctx, '3-3');
  await R.clean(p);
  const ev = (f, a) => p.evaluate(f, a);
  const reset = () => ev(() => window.__render.clear());
  // R01 기본 자세 · 앞 3/4
  await R.angles(p, R.HOME);
  const v1 = await R.frame(p, FRONT, [40, 0, 170], { pts: BOX });
  if (want('R01')) await R.shot(p, 'R01');
  // R02 옆으로 쭉 편 자세 + 작업 범위 원
  if (want('R02')) {
    await R.angles(p, [90, -90, 0, 0, 0, 0]);
    await ev(() => window.__render.reach(true));
    await R.frame(p, [0.3, -0.5, 1], [0, 60, 120], { pts: ring(280), fill: 0.8 });
    await R.shot(p, 'R02');
    await reset();
  }
  // R05 위에서 본 작업 범위 원 + 로봇
  if (want('R05')) {
    await R.angles(p, R.HOME);
    await ev(() => window.__render.reach(true));
    await R.frame(p, [0, -0.03, 1], [0, 0, 0], { pts: ring(290), fill: 0.8 });
    await R.shot(p, 'R05');
    await reset();
  }
  // R06a 영점 자세 / R06b 기본 자세 (같은 카메라)
  if (want('R06a') || want('R06b')) {
    await R.angles(p, [0, 0, 0, 0, 0, 0]);
    const v = await R.frame(p, FRONT, [0, 0, 220], { pts: BOX, fill: 0.78 });
    await R.shot(p, 'R06a');
    await R.angles(p, R.HOME);
    await R.look(p, v.eye, v.target);
    await R.shot(p, 'R06b');
  }
  // R07a~f 관절 하나씩: 움직이기 전(반투명) + 움직인 뒤(실물, 그 관절만 주황)
  const D = [40, 30, 30, 40, 60, 90];
  for (let j = 1; j <= 6; j++) {
    const n = 'R07' + 'abcdef'[j - 1];
    if (!want(n)) continue;
    const after = R.HOME.slice();
    after[j - 1] += D[j - 1];
    await ev((a) => window.__render.ghost(a), R.HOME);
    await R.angles(p, after);
    await ev((j) => window.__render.focus(j), j);
    await R.look(p, v1.eye, v1.target);
    await R.shot(p, n);
    await reset();
  }
  // R08 팔꿈치 한계 경고(빨강)
  if (want('R08')) {
    await R.angles(p, [45, -30, 149, 0, 0, 0]);
    await R.frame(p, FRONT, [40, 0, 170], { pts: BOX });
    await R.shot(p, 'R08', 2500);
  }
  // R09 저장 자세 3개 겹침 (반투명 2 + 실물 1)
  if (want('R09')) {
    await R.angles(p, R.HOME);
    await ev(() => { window.__render.ghost([35, 20, -60, -45, 0, 0]); window.__render.ghost([-35, 10, -40, -60, 0, 0]); });
    await R.frame(p, [0.8, -0.35, 0.55], [60, 0, 180], { pts: [...BOX, [120, 110, 370], [120, -110, 370], [-60, 110, 370], [-60, -110, 370]], fill: 0.86 });
    await R.shot(p, 'R09');
    await reset();
  }
  console.log('errors', R.L.errs.slice(0, 3));
  await b.close();
})();
