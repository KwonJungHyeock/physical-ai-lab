/**
 * ▶ 데모 of every 실습 환경 (engine/simulator/demos.ts): each demo program runs through the simulator on the
 * arms it is offered for — every collision check on (furniture, desk objects, the arm into itself), the
 * gripper and pump carrying the scene's own objects — and ends with the job done and the arm at home.
 * The program reads back as the same blocks, so [블록으로 보기] opens exactly what was played.
 *
 * Run with: npm run check:demo
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { selfContact } = await import('../../src/engine/robot/selfCollision');
const { tcpPositionMm } = await import('../../src/engine/robot/motion');
const { parse, check, serialize } = await import('../../src/engine/simulator/program');
const { createWorld, runProgram, preflight, blocksSorted, RunError } = await import('../../src/engine/simulator/sim');
const { EMPTY_DESK, SCENES, makeObject, sceneObjects, setActiveDesk, setMatNeeded } = await import('../../src/engine/simulator/desk');
const { BLOCK_START } = await import('../../src/engine/simulator/board');
const { tcpFor } = await import('../../src/engine/simulator/effectors');
const { DEMO_ARMS, demoFor, demoFits, demoStepAt } = await import('../../src/engine/simulator/demos');
const { ARMS, setActiveArm } = await import('../../src/engine/robot/arms');

type SceneId = (typeof SCENES)[number]['id'];
type World = ReturnType<typeof createWorld>;

const chainOf = (urdf: string) => buildChain(parseUrdf(readFileSync(new URL(`../../public${urdf}`, import.meta.url), 'utf8')));
const instantAnimate = async (durationS: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(durationS * 60));
  for (let k = 1; k <= n; k += 1) frame((durationS * k) / n);
};

/** What each demo leaves behind. */
const DONE: Record<SceneId, (w: World, dof: number) => string | null> = {
  empty: (w, dof) => {
    const moved = w.stats.jointMin.filter((lo, i) => w.stats.jointMax[i] - lo >= 30).length;
    return moved >= dof ? null : `관절 ${moved}개만 움직였어요`;
  },
  lab: (w) => {
    const onTray = w.objects.filter((o) => o.kind === 'block' && Math.abs(o.z - 12) < 1 && o.x > -40 && o.x < 160 && o.y > -240 && o.y < -160);
    return onTray.length === 2 && onTray.some((o) => o.color === '#e5484d') && onTray.some((o) => o.color === '#2f6fed') ? null : `트레이 위 블록 ${onTray.length}개`;
  },
  factory: (w) => {
    const inBin = w.objects.filter((o) => o.kind === 'part' && Math.abs(o.z - 4) < 1 && Math.abs(o.x - 90) < 40 && Math.abs(o.y + 250) < 30);
    return inBin.length === 1 ? null : `OK 함 안 부품 ${inBin.length}개`;
  },
  logistics: (w) => {
    const onPallet = w.objects.filter((o) => o.kind === 'box' && Math.abs(o.z - 30) < 1 && o.x > 60 && o.x < 300 && o.y > -310 && o.y < -110);
    return onPallet.length === 4 ? null : `팔레트 위 상자 ${onPallet.length}개`;
  },
  home: (w) => {
    const cup = w.objects.find((o) => o.kind === 'cup')!;
    return Math.abs(cup.z - 10) < 1 && cup.x - 38 > -50 && cup.x + 38 < 170 && cup.y - 38 > -290 && cup.y + 38 < -150 ? null : `컵이 (${cup.x.toFixed(0)}, ${cup.y.toFixed(0)}, ${cup.z.toFixed(0)})`;
  },
  kit: (w) => (blocksSorted(w) === 4 ? null : `분류함에 ${blocksSorted(w)}개`),
};

const families = new Map<string, string>();
for (const [id, a] of Object.entries(ARMS)) if (a && !families.has(a.family)) families.set(a.family, id);

for (const [family, id] of families) {
  const arm = setActiveArm(id as Parameters<typeof setActiveArm>[0]);
  const chain = chainOf(arm.urdf);
  for (const { id: scene } of SCENES) {
    // Not offered for this arm: its pill is off.
    if (!demoFits(scene, arm)) continue;
    const d = demoFor(scene, arm);
    assert.equal(d.steps.length, 4, `${scene}: four steps`);
    assert.ok(arm.tools.includes(d.effector), `${family}/${scene}: the arm has the ${d.effector}`);
    const theme = scene === 'kit' ? 'kit' : 'arm';
    setActiveDesk(scene === 'kit' ? EMPTY_DESK : { ...EMPTY_DESK, scene, objects: sceneObjects(scene) });
    setMatNeeded(false);
    const { steps, errors } = parse(d.code);
    assert.equal(errors.length, 0, `${family}/${scene}: ${JSON.stringify(errors)}`);
    assert.equal(check(steps, { theme, effector: d.effector, cameraFlange: false, poses: {} }).errors.length, 0, `${family}/${scene}: program check`);
    // Blocks and text are one program: the blocks give back exactly the text that was played.
    assert.equal(serialize(steps), d.code, `${family}/${scene}: the blocks read back as the same program`);
    // Each step starts on a line of the program, in order.
    d.starts.forEach((s, k) => assert.equal(demoStepAt(d, s), k));
    const world = createWorld(d.effector, false, BLOCK_START, theme);
    const hooks = { chain, world, poses: {}, see: async (_c: unknown, color: string) => world.blocks.find((b) => b.color === color) ?? null };
    assert.equal(await preflight((h) => runProgram(steps, h), { chain, world: createWorld(d.effector, false, BLOCK_START, theme), poses: {} }), null, `${family}/${scene}: no self-collision`);
    const seen = new Set<number>();
    try {
      await runProgram(steps, { ...hooks, animate: instantAnimate, onLine: (line) => seen.add(demoStepAt(d, line)) });
    } catch (err) {
      if (err instanceof RunError) throw new Error(`${family}/${scene}: line ${err.line} (${d.code.split('\n')[err.line - 1]}): ${err.message}`);
      throw err;
    }
    assert.equal(seen.size, 4, `${family}/${scene}: every step ran`);
    const why = DONE[scene](world, arm.dof);
    assert.equal(why, null, `${family}/${scene}: ${why}`);
    assert.ok(!world.carry && !world.held, `${family}/${scene}: nothing left in the tool`);
    assert.ok(
      world.angles.every((a, i) => Math.abs(a - arm.home[i]) < 0.5),
      `${family}/${scene}: ends at home`,
    );
    assert.equal(selfContact(chain, world.angles, arm.family, tcpFor(d.effector, false)), null);
    console.log(`  ok   ${family.padEnd(16)} ${scene.padEnd(10)} ${d.steps.map((s, k) => `${k + 1} ${s.title}`).join(' · ')}`);
  }
}

// The classroom robot (myCobot 280) has every demo; every arm has at least the joints one.
assert.ok(
  SCENES.every((s) => demoFits(s.id, ARMS['mycobot280-rdkx5'])),
  'myCobot 280: all six demos',
);
assert.ok(
  [...families.keys()].every((f) => DEMO_ARMS.empty.includes(f as never)),
  'every arm: the 빈 화면 demo',
);

// Desk objects in the tool's hands (the arm's links push them, the physics): the pump takes a flat top it
// touches and the gripper what is between its open fingers; a closed gripper or a bare flange is stopped by it.
{
  const arm = setActiveArm('mycobot280-rdkx5');
  const chain = chainOf(arm.urdf);
  setMatNeeded(false);
  const run = async (effector: 'pump' | 'adaptive' | 'none', code: string) => {
    const block = makeObject('block', { x: 200, y: 0 });
    setActiveDesk({ ...EMPTY_DESK, objects: [block] });
    const world = createWorld(effector, false, BLOCK_START, 'arm');
    await runProgram(parse(code).steps, { chain, world, poses: {}, animate: instantAnimate, see: async () => null });
    return world;
  };
  const pumped = await run('pump', 'robot.move_to(200, 0, 30)\nrobot.pump.on()\nrobot.move_to(150, -100, 80)\nrobot.move_to(150, -100, 30)\nrobot.pump.off()\n');
  const b = pumped.objects[0];
  assert.ok(Math.abs(b.x - 150) < 0.5 && Math.abs(b.y + 100) < 0.5 && Math.abs(b.z) < 0.5, `the pump carried the block to (150, -100): ${JSON.stringify(b)}`);
  const gripped = await run('adaptive', 'robot.gripper.open()\nrobot.move_to(200, 0, 15)\nrobot.gripper.close()\nrobot.move_to(200, 0, 90)\n');
  assert.ok(gripped.carry && Math.abs(gripped.objects[0].z - 75) < 0.5, 'the gripper lifts the block it closed on');
  await assert.rejects(run('adaptive', 'robot.gripper.close()\nrobot.move_to(200, 0, 15)\n'), (e: unknown) => e instanceof RunError && /블록에 닿아요/.test(e.message));
  await assert.rejects(run('none', 'robot.move_to(200, 0, 20)\n'), (e: unknown) => e instanceof RunError && /블록에 닿아요/.test(e.message));
  // Carried into the furniture: stopped with the object's name.
  setActiveDesk({ ...EMPTY_DESK, scene: 'factory', objects: sceneObjects('factory') });
  const w = createWorld('pump', false, BLOCK_START, 'arm');
  await assert.rejects(
    runProgram(parse('robot.move_to(226, -150, 88)\nrobot.pump.on()\nrobot.move_to(226, -30, 88)\n').steps, { chain, world: w, poses: {}, animate: instantAnimate, see: async () => null }),
    (e: unknown) => e instanceof RunError && /잡은 부품이 부품에 부딪혀요/.test(e.message),
  );
  const tip = tcpPositionMm(chain, w.angles, tcpFor('pump', false));
  assert.ok(tip.z > 80, 'the arm stopped above the belt');
  setActiveDesk(EMPTY_DESK);
  setMatNeeded(true);
  console.log('  ok   desk objects: pump and gripper carry them, closed fingers and the flange are stopped, a carried part stops at another');
}

console.log('demos: all pass');
