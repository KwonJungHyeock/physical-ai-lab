/**
 * 로봇 실습 7: the seven units match the seven acceptance checks, every question has one right answer,
 * and every motion a student can start is reachable and clear of the table and the kit's bins.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { poseContact } = await import('../../src/engine/physics/collide');
const { CHECKS } = await import('../../src/engine/simulator/modules');
const { BINS, COLOR_TO_BIN, BLOCK_START: await_start } = await import('../../src/engine/simulator/board');
const P = await import('../../src/engine/education/practice7');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));
let n = 0;
const ok = (name: string, f: () => void) => {
  f();
  n += 1;
  console.log(`  ✓ ${name}`);
};

const lerp = (a: readonly number[], b: readonly number[], s: number) => a.map((v, i) => v + (b[i] - v) * s);
/** Every pose along a straight joint-space move, 20 samples, clear of the table and bins. */
const clearPath = (from: readonly number[], to: readonly number[], boxes = P.kitBoxes()) => {
  for (let k = 0; k <= 20; k++) {
    const hit = poseContact(chain, lerp(from, to, k / 20), boxes, 0);
    if (hit) return `J${hit.joint} 가 ${hit.what}`;
  }
  return null;
};

ok('7 units, numbered 1~7, titles the same as the acceptance checks', () => {
  assert.equal(P.UNITS.length, 7);
  P.UNITS.forEach((u, i) => {
    assert.equal(u.id, i + 1);
    assert.equal(u.check, u.id);
    assert.equal(u.title, CHECKS[i].title);
    assert.ok(u.steps.length >= 2 && u.about && u.like && u.site && u.teacher);
    assert.equal(new Set(u.steps.map((s) => s.id)).size, u.steps.length);
  });
});

ok('every question: two (O/X) or three options, the answer one of them, a reason', () => {
  for (const u of P.UNITS)
    for (const q of u.quiz) {
      assert.ok(q.options.length === 2 || q.options.length === 3, u.title);
      assert.ok(q.answer >= 0 && q.answer < q.options.length, u.title);
      assert.ok(q.why.length > 10);
    }
});

ok('progress: done needs every step and both answers right; stars count steps, answers, the robot', () => {
  const u = P.UNITS[0];
  const p = P.emptyProgress();
  assert.equal(P.unitDone(u, p), false);
  p.steps = u.steps.map((s) => s.id);
  p.quiz = u.quiz.map((q) => q.answer);
  assert.equal(P.unitDone(u, p), true);
  assert.equal(P.stars(u, p), 2);
  p.real = { at: '', text: '' };
  assert.equal(P.stars(u, p), 3);
  p.quiz = [u.quiz[0].answer, (u.quiz[1].answer + 1) % u.quiz[1].options.length];
  assert.equal(P.unitDone(u, p), false);
});

ok('unit 1: each joint swings ±30° from the ready pose, clear of the table all the way', () => {
  for (let j = 0; j < 6; j++) {
    const poses = P.swingPoses(j);
    for (let k = 1; k < poses.length; k++) assert.equal(clearPath(poses[k - 1], poses[k]), null, `J${j + 1}`);
    assert.equal(poses[1][j] - poses[2][j], 2 * P.SWING_DEG);
  }
});

ok('unit 2: the target point is reachable with the pump down, and the way there is clear', () => {
  const r = P.repeatPoses(chain);
  assert.ok(r);
  assert.equal(clearPath(r!.home, r!.at), null);
});

ok('unit 4: all four blocks sort into their bins (official colour → bin), every move clear', () => {
  const m = P.sortPlan(chain);
  assert.ok(m, 'a pose was unreachable or touched the kit');
  let prev = P.HOME_DEG;
  for (const s of m!) {
    assert.equal(clearPath(prev, s.angles), null, s.say);
    prev = s.angles;
  }
  assert.equal(m!.filter((s) => s.tool === 'on').length, 4);
  assert.deepEqual(Object.keys(COLOR_TO_BIN).sort(), ['노랑', '빨강', '초록', '파랑'].sort());
  assert.ok(Object.values(BINS).length === 4);
});

ok('unit 5: the gripper move and the pump move are both reachable and clear', () => {
  for (const t of P.TOOL_MOVES) {
    const from = await_start[t.color];
    const m = P.pickPlace(chain, t.tool, t.color, from, { bin: false, ...t.to });
    assert.ok(m, t.tool);
    let prev = P.HOME_DEG;
    for (const s of m!) {
      assert.equal(clearPath(prev, s.angles), null, `${t.tool} ${s.say}`);
      prev = s.angles;
    }
    const acts = P.toActions(m!, t.tool);
    assert.ok(acts.some((a) => a.type === (t.tool === 'pump' ? 'pump' : 'gripper')));
  }
});

ok('unit 7: the greeting poses are clear, one pose per code line', () => {
  let prev = P.WAVE[0].angles;
  for (const w of P.WAVE) {
    assert.match(w.line, /^mc\.sync_send_angles\(\[/);
    const nums = JSON.parse(w.line.slice(w.line.indexOf('['), w.line.indexOf(']') + 1)) as number[];
    assert.deepEqual(nums, w.angles);
    assert.equal(clearPath(prev, w.angles), null);
    prev = w.angles;
  }
});

ok('spread: the largest distance from the mean', () => {
  assert.equal(P.spreadMm([[0, 0, 0], [0, 0, 0]]), 0);
  assert.equal(Math.round(P.spreadMm([[0, 0, 0], [2, 0, 0]]) * 10) / 10, 1);
});

ok('unit 1: from the home pose to the ready pose, clear of the table', () => {
  assert.equal(clearPath(P.HOME_DEG, P.READY_DEG), null);
});

ok('unit 4: a few blocks found where the robot put them: the plan covers just those; none found: no plan', () => {
  const m = P.sortPlan(chain, { 빨강: { x: 160, y: -10 }, 파랑: { x: 200, y: 30 } });
  assert.ok(m);
  assert.equal(m!.filter((s) => s.tool === 'on').length, 2);
  assert.equal(P.sortPlan(chain, {}), null);
});

ok('unit 6 (simulator): the colour finder boxes a red and a blue square and ignores grey', () => {
  const W = 40, H = 30;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const red = x >= 5 && x < 12 && y >= 5 && y < 12;
      const blue = x >= 25 && x < 33 && y >= 10 && y < 18;
      const c = red ? [220, 40, 40] : blue ? [40, 80, 220] : [200, 200, 205];
      px.set([...c, 255], i);
    }
  const f = P.findColours(px, W, H);
  assert.deepEqual(f.map((d) => d.color).sort(), ['빨강', '파랑'].sort());
  const r = f.find((d) => d.color === '빨강')!;
  assert.deepEqual(r.box, { x0: 5, y0: 5, x1: 11, y1: 11 });
  assert.ok(r.score > 0.95);
});

console.log(`practice7: all ${n} checks passed`);
