// 경미 묶음 4: 목록 장 카드 그림 chapter-1 ~ chapter-6 (public/course/assets/, 카드 칸 112 × 56의 4배 = 448 × 224, 글자 없음).
// 실행: (next start -p 3123을 띄운 뒤) R_OUT=<폴더> node tools/check/course-walk/render13/thumbs.cjs [1,2,…]  → <폴더>/chapter-N.raw.png (1920 × 960),
//   줄이기: python3 -c "from PIL import Image; …" (보고서 참고) 또는 아무 도구로 448 × 224.
// 장마다 그 장 절의 처음 장면(실습 하기, 움직이기 전), 화면 UI는 끄고 장면만. 6장(마무리)은 3D 장면이 없어 1-1의 다 쓴 카드 장면.
const R = require('./lib.cjs');
const only = process.argv[2] ? new Set(process.argv[2].split(',').map(Number)) : null;
const MAT = [[110, -90, 0], [300, -90, 0], [300, 70, 0], [110, 70, 0]];
const PLATE = [[-85, -85, 0], [85, 85, 0], [85, -85, 0], [-85, 85, 0]];
const RINGS = [[170, -60, 170], [170, 60, 150], [110, -60, 200]];
const DIR = [0.55, -0.75, 0.55];
const CARD = [[150, -40, 0], [270, -40, 0], [270, 40, 0], [150, 40, 0]];
const HANDED = [[150, -175, 0], [270, -175, 0], [270, -95, 0], [150, -95, 0]];
const LAMP = [[312, -140, 0], [312, -140, 60]];
const CH = [
  // 1장: 1-1 글씨 부스 (로봇 · 매트 · 빈 카드 · 완성 램프)
  { n: 1, no: '1-1&mode=practice', target: [120, 0, 80], pts: [...MAT, ...PLATE] },
  // 2장: 2-1 처음 (책상 위 빈 자리 · 로봇 판)
  { n: 2, no: '2-1&mode=practice', target: [110, 0, 0], pts: [...MAT, ...PLATE], arm: false, dir: [0.45, -0.7, 0.75] },
  // 3장: 3-1 처음 (관절 하나가 칠해진 팔)
  { n: 3, no: '3-1&mode=practice', target: [0, 0, 200], pts: PLATE, dir: [0.75, -0.6, 0.35] },
  // 4장: 4-1 처음 (손끝과 고리, 좌표축 글자 끔)
  { n: 4, no: '4-1&mode=practice', target: [80, 0, 150], pts: [...RINGS, ...PLATE], axesOff: true, dir: [0.35, -0.85, 0.45] },
  // 5장: 5-1 처음, 매트 끝에서 카드 너머로 펜을 단 로봇
  { n: 5, no: '5-1&mode=practice', target: [120, 0, 100], pts: [...CARD, ...PLATE], dir: [0.95, -0.3, 0.4] },
  // 6장 (마무리, 3D 장면 없음): 1-1을 끝까지 돌린 뒤, 켜진 완성 램프 너머로 로봇과 다 쓴 카드 (카드의 글씨는 끔: 그림에 글자 없음)
  { n: 6, no: '1-1&mode=scene', target: [180, -60, 60], pts: [...PLATE, ...HANDED, ...LAMP], dir: [0.15, -0.95, 0.22], end: true, noInk: true },
];
(async () => {
  const b = await R.L.launch();
  for (const c of CH) {
    if (only && !only.has(c.n)) continue;
    const ctx = await R.L.context(b, { rate: '1' });
    const p = await R.open(ctx, c.no);
    if (c.end) {
      // ⚡ 결과 바로 → the card written and handed (lying in front of the mat).
      await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /결과 바로/.test(x.textContent) && x.offsetParent)?.click());
      await p.waitForFunction(() => (window.__render.world.current.cell?.draw?.done.length ?? 0) > 0, null, { timeout: 600000, polling: 500 });
      await p.waitForTimeout(3000);
    }
    await R.clean(p, { keep: ['desk', 'lamp', 'booth'] });
    // (6장: no letters in the picture — the written card's ink (#141a33) off; the card itself, handed, stays.)
    if (c.noInk) await p.evaluate(() => window.__render.scene.traverse((o) => { if (o.isMesh && o.material?.color?.getHexString?.() === '141a33') o.visible = false; }));
    // (4장: the 좌표축 and its X · Y · Z letters are screen-only overlays: off, no letters in the picture.)
    if (c.axesOff) await p.evaluate(() => window.__render.scene.traverse((o) => { if (!(o.layers.mask & 1)) o.visible = false; }));
    await R.frame(p, c.dir ?? DIR, c.target, { pts: c.pts, fill: c.fill ?? 0.6, arm: c.arm !== false });
    await p.waitForTimeout(1500);
    await p.mouse.move(1919, 1439);
    await p.screenshot({ path: `${R.OUT}/chapter-${c.n}.raw.png`, clip: { x: 0, y: 240, width: 1920, height: 960 }, timeout: 180000 });
    console.log('shot chapter', c.n);
    await ctx.close();
  }
  await b.close();
})();
