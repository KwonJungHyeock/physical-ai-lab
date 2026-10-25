/**
 * 말로 만들기 · AI 에게 시키기: the scene description stays inside the class server's limits for every arm
 * and theme; every example program in the AI's instructions (desktop-go/classroom/llm_system.md) is a
 * program the block checks accept; an AI answer is turned into a program with its problems found; the
 * scene in coordinates, the run's joint notes, the conversation and the answer's mode.
 *
 * Run with: npm run check:speak
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const { ARMS, setActiveArm } = await import('../../src/engine/robot/arms');
const { speakContext, answerProgram, problemsText, speakExamples } = await import('../../src/engine/simulator/speak');

const SYSTEM = readFileSync(new URL('../../../desktop-go/classroom/llm_system.md', import.meta.url), 'utf8');

/* --- the scene: inside llm.go's limits (LLMContext.check) ------------------------------------------- */
for (const arm of Object.values(ARMS)) {
  if (!arm) continue;
  for (const theme of ['arm', 'kit'] as const) {
    for (const effector of arm.tools) {
      const c = speakContext({ arm, effector, theme, poseNames: ['내 자세 1', '이름 "따옴표"'], program: 'robot.home()\n'.repeat(200), errors: 'x'.repeat(900) });
      assert.ok(c.arm.length <= 60 && (c.ranges ?? '').length <= 200 && c.tool.length <= 40 && c.toolKind.length <= 10, `${arm.id}: short fields`);
      assert.ok(c.joints === arm.dof && c.places.length <= 40 && c.places.every((p) => p.length <= 24 && !p.includes('"')), `${arm.id}: places`);
      assert.deepEqual(c.poses, ['내 자세 1'], 'a pose name with a quote is left out');
      assert.equal(c.program, '', 'a program too long for the server is not sent');
      assert.ok((c.errors ?? '').length <= 600, 'errors cut to the server limit');
      assert.ok(speakExamples(effector, theme).length >= 3);
    }
  }
}
const k = speakContext({ arm: ARMS['mycobot280-rdkx5']!, effector: 'pump', theme: 'kit', poseNames: [], program: 'robot.home()' });
assert.ok(k.places.includes('분류함 A') && !k.places.includes('자리 1') && k.toolKind === 'suction' && k.ranges?.startsWith('J1 -168~168'));
const o = speakContext({ arm: ARMS['omx-f']!, effector: 'omx', theme: 'arm', poseNames: [], program: '' });
assert.ok(o.joints === 5 && o.ranges?.endsWith('J5 -180~180') && o.places.includes('자리 4') && o.tool === 'OMX 그리퍼');
console.log('  ok   scene description: every arm, theme and tool inside the class server limits');

/* --- the instructions' examples: real block programs ------------------------------------------------ */
const examples = SYSTEM.split('# Examples')[1]
  .split('Student:')
  .slice(1)
  .filter((c) => c.includes('ok true'));
assert.ok(examples.length >= 3, 'examples found');
setActiveArm('mycobot280-rdkx5');
for (const ex of examples) {
  const lines = [...ex.slice(ex.indexOf('lines'), ex.indexOf('explain')).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (!lines.length) continue;
  const r = answerProgram(lines, { theme: 'arm', effector: 'adaptive', cameraFlange: false, poses: {} });
  assert.equal(r.errors.length, 0, `example "${ex.split('\n')[0].trim()}": ${JSON.stringify(r.errors)}\n${r.code}`);
}
// Every command named in the instructions' table is one the parser knows (a typo there would teach the AI a wrong line).
for (const cmd of SYSTEM.matchAll(/\| `(robot\.[a-z_.]+)\(/g)) assert.ok(readFileSync(new URL('../../src/engine/simulator/program.ts', import.meta.url), 'utf8').includes(cmd[1].replace(/\./g, '\\.')), `${cmd[1]} is a block`);
console.log(`  ok   ${examples.length} example programs in llm_system.md pass the block checks; every command in its table is a block`);

/* --- an answer becomes a program ------------------------------------------------------------------ */
const good = answerProgram(['robot.home()', 'robot.pick_place("빨강 블록", "자리 1")'], { theme: 'arm', effector: 'adaptive', cameraFlange: false, poses: {} });
assert.ok(good.code.startsWith('from edu import robot\n') && good.errors.length === 0);
const bad = answerProgram(['robot.home()', 'robot.dance()', 'robot.pump.on()'], { theme: 'arm', effector: 'adaptive', cameraFlange: false, poses: {} });
assert.ok(bad.errors.length >= 1);
assert.match(problemsText(bad.code, bad.errors), /robot\.dance\(\) → /);
const pump = answerProgram(['robot.pump.on()'], { theme: 'arm', effector: 'adaptive', cameraFlange: false, poses: {} });
assert.ok(pump.errors.length === 1, 'a pump line with a gripper fitted is caught');
const joint6 = (() => {
  setActiveArm('omx-f');
  const r = answerProgram(['robot.move_joints([0, 0, 0, 90, 0, 0])'], { theme: 'arm', effector: 'omx', cameraFlange: false, poses: {} });
  setActiveArm('mycobot280-rdkx5');
  return r;
})();
assert.ok(joint6.errors.length === 1 && /5개/.test(joint6.errors[0].msg), 'six angles for a 5-joint arm are caught');
console.log('  ok   answers: import added, unknown lines, a tool the arm does not hold and wrong joint counts are caught');

/* --- AI 에게 시키기: scene, run notes, conversation, mode ----------------------------------------- */
const { sceneText, comfortRange, RunWatch, historyText, answerMode, MAX_SCENE, MAX_HISTORY } = await import('../../src/engine/simulator/speak');
const { createWorld } = await import('../../src/engine/simulator/sim');
const { setMatNeeded } = await import('../../src/engine/simulator/desk');
const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { tcpFor } = await import('../../src/engine/simulator/effectors');
const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));
const a280 = ARMS['mycobot280-rdkx5']!;
setActiveArm(a280.id);
setMatNeeded(true);
const w = createWorld('adaptive', false, undefined, 'arm');
const scene = sceneText({ chain, world: w, arm: a280 });
assert.ok(scene.length <= MAX_SCENE, `scene ${scene.length} chars`);
assert.match(scene, /^tool tip now: x -?\d+, y -?\d+, z \d+/);
assert.match(scene, /gripper open, holding nothing/);
assert.match(scene, /빨강 블록 x 135, y -25/);
assert.match(scene, /자리 1 x 130, y -100/);
assert.match(scene, /put-down height for this tool \(a held block on the desk\): 14/);
// The comfortable distance is the arm's own: at block height every joint keeps 15° of room between them.
const comfort = comfortRange(chain, a280, tcpFor('adaptive', false), 12.5)!;
assert.ok(comfort.from >= 140 && comfort.from <= 190 && comfort.to >= 230, `comfort ${JSON.stringify(comfort)}`);
assert.match(scene, new RegExp(`comfortable distance from the base at block height: ${comfort.from}–${comfort.to} mm`));
// The red block (about 137 mm out) is closer than that: the scene says so.
assert.match(scene, /빨강 블록 x 135, y -25 \(close to the base/);
// A joint at its limit is named with its room; a held block shows in the tool.
w.angles[2] = a280.min[2] + 1;
w.held = { color: '빨강', offset: new (await import('three')).Matrix4() };
const s2 = sceneText({ chain, world: w, arm: a280 });
assert.match(s2, /J3 -14\d(\.\d)?° \(1° from its limit\)/);
assert.match(s2, /holding 빨강 블록/);
assert.match(s2, /빨강 블록 x 135, y -25 \(in the tool\)/);
// Every arm, theme and tool: inside the server's limit.
for (const arm of Object.values(ARMS)) {
  if (!arm) continue;
  setActiveArm(arm.id);
  for (const theme of ['arm', 'kit'] as const)
    for (const effector of arm.tools) {
      const t = sceneText({ chain, world: createWorld(effector, false, undefined, theme), arm });
      assert.ok(t.length <= MAX_SCENE && !t.includes('NaN'), `${arm.id} ${theme} ${effector}: ${t.length}`);
    }
}
setActiveArm(a280.id);
console.log(`  ok   scene: tip, joints, tool, blocks, places and the comfortable distance ${comfort.from}–${comfort.to} mm in under ${MAX_SCENE} characters`);

// A run that folds the elbow to its limit is reported; an easy one is not.
const watch = new RunWatch(chain, tcpFor('adaptive', false), true, 6);
const q = a280.home.slice();
for (let k = 0; k <= 40; k += 1)
  watch.update(
    k * 0.05,
    q.map((v, i) => (i === 2 ? v + ((a280.min[2] + 1 - v) * k) / 40 : v)),
  );
assert.deepEqual(
  watch.notes().filter((n) => n.startsWith('J3')),
  ['J3 한계까지 1°'],
);
const easy = new RunWatch(chain, tcpFor('adaptive', false), true, 6);
for (let k = 0; k <= 10; k += 1) easy.update(k * 0.1, a280.home);
assert.deepEqual(easy.notes(), []);
console.log('  ok   run notes: a joint driven to 1° of its limit is reported, a still arm reports nothing');

// The conversation keeps the newest turns inside the server's limit.
const turn = (k: number) => ({ said: `빨간 블록 집어 ${k}`, mode: 'do' as const, ok: true, explain: '집어요.', lines: ['from edu import robot', 'robot.move_above("빨강 블록")'], run: '끝까지 움직였어요; J3 한계까지 1°' });
const h = historyText(Array.from({ length: 40 }, (_, k) => turn(k)));
assert.ok(h.length <= MAX_HISTORY && h.endsWith('run: 끝까지 움직였어요; J3 한계까지 1°') && h.includes('집어 39') && !h.includes('집어 0\n'));
assert.ok(!h.includes('from edu'), 'the import line is left out');
// What to do with an answer.
assert.equal(answerMode('빨간 블록 집어', { ok: true, mode: 'do', lines: ['robot.home()'] }), 'do');
assert.equal(answerMode('방금 한 걸 블록으로 짜 줘', { ok: true, mode: 'do', lines: ['robot.home()'] }), 'blocks');
assert.equal(answerMode('왜 멈췄어?', { ok: true, lines: [] }), 'talk');
assert.equal(answerMode('x', { ok: true, lines: ['from edu import robot', 'robot.home()'] }), 'blocks');
assert.equal(answerMode('춤춰', { ok: false, mode: 'do', lines: [] }), 'talk');
console.log('  ok   conversation: newest turns kept under the limit; modes from the AI, 블록·짜 wins');
console.log('speak: all checks passed');
