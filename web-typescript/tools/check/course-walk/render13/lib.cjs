// 파트 13 교안 렌더 공통: 1920×1440, ?render=1 (Stage.tsx __render), 화면 UI 끄기 · 배경 #EEF2F6 · 책상 끄기 + 바닥 그림자.
process.env.WALK_W = '1920'; process.env.WALK_H = '1440';
const L = require('../lib.cjs');
const OUT = process.env.R_OUT;
const BG = '#EEF2F6';
const HOME = [0.61, 45.87, -92.37, -41.3, 2.02, 9.58];
async function open(ctx, no) {
  const p = await L.open(ctx, `/track/life?no=${no}&render=1`);
  await L.idle(p);
  await p.waitForTimeout(2500);
  return p;
}
/** keep: what of the scene stays besides the arm, its plate and the plate's soft shadow: 'desk', 'lamp', 'booth' (mat · card · ink · lines · dots · waiting cards); html: DOM labels kept (a test on their text). */
async function clean(p, { keep = [], html = null } = {}) {
  await p.evaluate(([keep, html, BG]) => {
    const R = window.__render;
    const K = new Set(keep);
    const armRoot = R.arm.root;
    const top = armRoot.parent.parent;
    const under = (o, a) => { for (let x = o; x; x = x.parent) if (x === a) return true; return false; };
    top.traverse((o) => {
      if (!(o.isMesh || o.isLine || o.isLineSegments || o.isSprite) || under(o, armRoot) || o.userData.__keep) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const c = m?.color?.getHexString?.();
      const wp = o.getWorldPosition(o.position.clone());
      const at = [wp.x * 1000, -wp.z * 1000, wp.y * 1000];
      const plate = c === 'd6dadf';
      const contact = m?.type === 'MeshBasicMaterial' && m.map && o.renderOrder === 1 && Math.hypot(at[0], at[1]) < 5;
      const desk = (c === 'b38f66' && m.type === 'MeshPhysicalMaterial') || (c === 'c8cdd2' && at[2] < -100);
      const lamp = Math.abs(at[0] - 312) < 40 && Math.abs(at[1] + 140) < 40;
      if (plate || contact || m?.type === 'ShadowMaterial') return;
      if (desk) { if (!K.has('desk')) o.visible = false; return; }
      if (lamp) { if (!K.has('lamp')) o.visible = false; return; }
      if (!K.has('booth')) o.visible = false;
    });
    if (!window.__bgKeep) window.__bgKeep = setInterval(() => { R.scene.background?.set?.(BG); R.scene.fog = null; }, 50);
    R.scene.background?.set?.(BG);
    R.scene.fog = null;
    if (!K.has('desk') && !window.__floor) { R.floor(-2.2, 0.22); window.__floor = 1; }
    const cv = document.querySelector('canvas');
    let st = document.getElementById('r13style');
    if (!st) { st = document.createElement('style'); st.id = 'r13style'; document.head.appendChild(st); }
    st.textContent = `*:not(canvas) { visibility: hidden !important; } canvas, .r13keep, .r13keep * { visibility: visible !important; } html, body { background: ${BG} !important; }`;
    for (const e of document.querySelectorAll('.r13keep')) e.classList.remove('r13keep');
    const re = html ? new RegExp(html) : null;
    if (re) for (const s of cv.parentElement.parentElement.children) if (!s.contains(cv) && re.test(s.textContent.trim())) s.classList.add("r13keep");
  }, [keep, html, BG]);
}
const look = (p, eye, target) => p.evaluate(([e, t]) => window.__render.look(e, t), [eye, target]);
const angles = (p, a) => p.evaluate((a) => { const w = window.__render.world.current; w.angles = a.slice(); w.version = (w.version || 0) + 1; }, a);
async function shot(p, name, ms = 1500) {
  await p.waitForTimeout(ms);
  await p.mouse.move(1919, 1439);
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: 1920, height: 1440 }, timeout: 180000 });
  console.log('shot', name);
}
module.exports = { L, open, clean, look, angles, shot, HOME, OUT };
/** Camera from a direction (robot frame, from target to eye) so the arm (and the given points, mm) fill `fill` of the picture, centred. */
async function frame(p, dir, target, { pts = [], fill = 0.72, arm = true } = {}) {
  let t = target.slice();
  let dist = 1000;
  const n = Math.hypot(...dir);
  const d = dir.map((v) => v / n);
  for (let k = 0; k < 6; k++) {
    const eye = t.map((v, i) => v + d[i] * dist);
    await look(p, eye, t);
    await p.waitForTimeout(250);
    const f = await p.evaluate((pts) => window.__stageFrame(pts), pts);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    if (arm && f.arm) { add(f.arm.x0, f.arm.y0); add(f.arm.x1, f.arm.y1); }
    for (const [x, y] of f.pts) add(x, y);
    const W = f.canvas.w, H = f.canvas.h;
    const cx = (x0 + x1) / 2 / W - 0.5, cy = (y0 + y1) / 2 / H - 0.5;
    const s = Math.max((x1 - x0) / W, (y1 - y0) / H) / fill;
    // shift the target in the picture plane: right = d × up, up' = right × d (robot frame, z up)
    const up = [0, 0, 1];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let right = cr(up, d); const rn = Math.hypot(...right) || 1; right = right.map((v) => v / rn);
    const upv = cr(d, right);
    const halfH = dist * Math.tan((34 / 2) * Math.PI / 180);
    const halfW = halfH * (W / H);
    t = t.map((v, i) => v + right[i] * cx * 2 * halfW - upv[i] * cy * 2 * halfH);
    if (process.env.R_DEBUG) console.log(k, Math.round(dist), [x0, y0, x1, y1].map(Math.round), W, H, cx.toFixed(2), cy.toFixed(2), s.toFixed(2));
    dist *= s;
  }
  const eye = t.map((v, i) => v + d[i] * dist);
  await look(p, eye, t);
  return { eye, target: t };
}
module.exports.frame = frame;
