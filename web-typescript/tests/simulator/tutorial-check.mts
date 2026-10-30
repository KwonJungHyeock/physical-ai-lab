/**
 * 코딩 튜토리얼 and the 한 번에 하는 동작 blocks: every tutorial's yellow places are found in its
 * practice's example (and changing one changes only it), every snippet goes in and keeps a block
 * program valid, and the beginner blocks really do their job in the simulator (a block carried, all
 * four sorted, each shape drawn) and round-trip between text and blocks.
 *
 * Run with: npm run check:tutorial
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { createWorld, runProgram } = await import('../../src/engine/simulator/sim');
const { setMatNeeded } = await import('../../src/engine/simulator/desk');
const { SPOTS, BLOCK_START } = await import('../../src/engine/simulator/board');
const P = await import('../../src/engine/simulator/practices');
const G = await import('../../src/engine/simulator/program');
const T = await import('../../src/engine/simulator/tutorials');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
setMatNeeded(true);

// Every tutorial: its places are in the example; a change touches only that place; snippets go in.
let places = 0;
for (const theme of ['arm', 'kit'] as const) {
  for (const level of ['basic', 'python', 'ros'] as const) {
    for (const p of P.practicesFor(level, theme)) {
      const code = P.starterFor(p, p.effector, theme);
      const tut = T.tutorialFor(level, theme, p.id);
      assert.ok(tut.steps.length >= 2, `${level} ${p.id}: steps`);
      for (const st of tut.steps) for (const k of st.slots) assert.ok(k < tut.slots.length, `${level} ${p.id}: step slot ${k}`);
      const hits = T.findSlots(code, tut);
      // An authored tutorial finds every one of its places in its own example.
      const authored = tut.snippets.length && tut.steps.some((s) => s.title !== '값 바꾸기' && s.slots.length);
      if (authored && theme === 'arm') {
        const found = new Set(hits.map((h) => h.index));
        tut.slots.forEach((s, k) => assert.ok(found.has(k), `${level} ${p.id}: place "${s.label}" not found in the example`));
      }
      for (const h of hits) {
        const next = T.setSlot(code, tut, h.index, h.choices ? (h.choices.find((c) => c !== h.value) ?? h.value) : '7');
        const changed = next.split('\n').filter((l, i) => l !== code.split('\n')[i]).length;
        const lines = new Set(hits.filter((x) => x.index === h.index).map((x) => x.line)).size;
        assert.ok(changed <= lines, `${level} ${p.id}: "${h.label}" changed ${changed} lines`);
        // Still found after the change (the place is found by its shape, not its value).
        assert.ok(T.findSlots(next, tut).some((x) => x.index === h.index), `${level} ${p.id}: "${h.label}" lost after a change`);
        places += 1;
      }
      // Fitted to its example (as the console shows it): every step's place is there, every snippet goes in
      // and adds no problem for the practice's own tool on this desk, and a mission names only snippets offered.
      const ctx = { theme, effector: p.effector, cameraFlange: !!p.cameraFlange, poses: {} };
      const known = new Set(G.check(G.parse(code).steps, ctx).errors.map((e) => e.msg));
      const fitted = T.tutorialFor(level, theme, p.id, { example: code, fits: level === 'basic' ? (next) => !G.parse(next).errors.length && G.check(G.parse(next).steps, ctx).errors.every((e) => known.has(e.msg)) : undefined });
      const there = new Set(T.findSlots(code, fitted).map((h) => h.index));
      for (const st of fitted.steps) for (const k of st.slots) assert.ok(there.has(k), `${theme} ${level} ${p.id}: step "${st.title}" points at a place the example does not have`);
      for (const st of fitted.steps) for (const [, n] of st.text.matchAll(/\[([^\]]+)\]/g)) if (st.title === '미션') assert.ok(fitted.snippets.some((sn) => sn.label === n), `${theme} ${level} ${p.id}: mission names [${n}], not offered`);
      for (const sn of fitted.snippets) {
        const next = T.insertSnippet(code, sn);
        assert.notEqual(next, code, `${level} ${p.id}: snippet "${sn.label}" did not go in`);
        if (level === 'basic') assert.deepEqual(G.parse(next).errors, [], `${level} ${p.id}: snippet "${sn.label}" breaks the program`);
      }
    }
  }
}
console.log(`  ok   tutorials: every place found and changed alone (${places} places), every snippet goes in`);

// A half-typed value is not taken (the place would be lost); a whole one is.
{
  const p = P.practicesFor('python', 'arm').find((x) => x.id === 'joints')!;
  const code = P.starterFor(p, p.effector, 'arm');
  const tut = T.tutorialFor('python', 'arm', 'joints');
  const pause = tut.slots.findIndex((s) => s.label === '쉬는 시간');
  const turn = tut.slots.findIndex((s) => s.label === '돌릴 각도');
  for (const v of ['0.', '', '-', '.5']) assert.equal(T.slotTakes(code, tut, pause, v), false, `"${v}" taken`);
  assert.ok(T.slotTakes(code, tut, pause, '0.5') && T.slotTakes(code, tut, turn, '-30'));
  console.log('  ok   a half-typed value keeps the place (0. · - · empty wait; 0.5 · -30 go in)');
}

// Basic snippets land before the last return home.
{
  const code = 'from edu import robot\n\nrobot.home()\nrobot.move_joint(1, 30)\nrobot.home()\n';
  const next = T.insertSnippet(code, { label: 'x', code: 'robot.wait(1)' });
  assert.deepEqual(next.trim().split('\n').slice(-2), ['robot.wait(1)', 'robot.home()']);
  console.log('  ok   a snippet goes in before the program returns home');
}

const instant = async (d: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(d * 40));
  for (let k = 1; k <= n; k += 1) frame((d * k) / n);
};
async function run(code: string, tool: 'adaptive' | 'pump' | 'pen') {
  const { steps, errors } = G.parse(code);
  assert.deepEqual(errors, []);
  assert.deepEqual(G.check(steps, { theme: 'arm', effector: tool, cameraFlange: false, poses: {} }).errors, []);
  assert.equal(G.serialize(steps), code, 'blocks and text round-trip');
  const world = createWorld(tool, false, BLOCK_START, 'arm');
  await runProgram(steps, { chain, world, poses: {}, animate: instant, see: async () => null });
  return world;
}

// 집어서 옮기기 with the gripper and with the pump.
for (const tool of ['adaptive', 'pump'] as const) {
  const w = await run('from edu import robot\n\nrobot.home()\nrobot.pick_place("파랑 블록", "자리 3")\nrobot.home()\n', tool);
  const b = w.blocks.find((k) => k.color === '파랑')!;
  assert.ok(Math.hypot(b.x - SPOTS['자리 3'].x, b.y - SPOTS['자리 3'].y) < 8, `${tool}: blue on 자리 3 ${JSON.stringify(b)}`);
}
console.log('  ok   "집어서 옮기기" carries a block with the gripper and with the pump');

// 색깔별로 정리하기: all four on their places.
{
  const w = await run('from edu import robot\n\nrobot.home()\nrobot.sort_blocks()\nrobot.home()\n', 'adaptive');
  const names = ['자리 1', '자리 2', '자리 3', '자리 4'] as const;
  w.blocks.forEach((b, k) => assert.ok(Math.hypot(b.x - SPOTS[names[k]].x, b.y - SPOTS[names[k]].y) < 8, `${b.color} on ${names[k]}`));
  console.log('  ok   "색깔별로 정리하기" puts all four blocks on 자리 1~4');
}

// 도형 그리기: every shape draws one closed stroke.
for (const shape of G.SHAPE_NAMES) {
  const w = await run(`from edu import robot\n\nrobot.home()\nrobot.draw_shape("${shape}", 6)\nrobot.home()\n`, 'pen');
  const strokes = w.trail.filter((s) => s.length > 3);
  assert.equal(strokes.length, 1, `${shape}: one stroke`);
  const s = strokes[0];
  assert.ok(Math.hypot(s[0][0] - s.at(-1)![0], s[0][1] - s.at(-1)![1]) < 3, `${shape}: closed`);
}
console.log('  ok   "도형 그리기" draws 네모 · 원 · 삼각형 · 별 as one closed line each');

// Wrong tool or size: refused before anything moves.
{
  const bad = G.parse('from edu import robot\n\nrobot.draw_shape("네모", 30)\nrobot.pick_place("빨강 블록", "자리 1")\n').steps;
  const msgs = G.check(bad, { theme: 'arm', effector: 'pen', cameraFlange: false, poses: {} }).errors.map((e) => e.msg);
  assert.ok(msgs.some((m) => /30cm/.test(m)) && msgs.some((m) => /집어서 옮기기인데/.test(m)), msgs.join(' | '));
  assert.ok(G.parse('robot.draw_shape("하트", 5)').errors[0]?.msg.includes('하트'));
  console.log('  ok   a wrong tool, size or shape is refused with a fix');
}
