/**
 * 말로 만들기: the scene description stays inside the class server's limits for every arm and theme;
 * every example program in the AI's instructions (desktop-go/classroom/llm_system.md) is a program the
 * block checks accept; an AI answer is turned into a program with its problems found.
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
console.log('speak: all checks passed');
