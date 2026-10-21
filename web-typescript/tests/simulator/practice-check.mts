/**
 * Every practice of both themes (the proposal's seven acceptance checks on the
 * AI Kit, and the arm-only lessons) must run its ready program in the
 * simulator without a collision and reach full progress.
 *
 * Run with: npm run check:practice
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { parse, check } = await import('../../src/engine/simulator/program');
const { createWorld, runProgram, moveProblem, RunError } = await import('../../src/engine/simulator/sim');
const { EMPTY_DESK, makeObject, practiceUsesMat, setActiveDesk, setMatNeeded } = await import('../../src/engine/simulator/desk');
const { solveIk } = await import('../../src/engine/robot/kinematics');
const { Vector3 } = await import('three');
const { PRACTICES, newSession, placedBlocks } = await import('../../src/engine/simulator/practices');
const { HOME_DEG } = await import('../../src/engine/simulator/board');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));

const instantAnimate = async (durationS: number, frame: (t: number) => void) => {
  const n = Math.max(1, Math.ceil(durationS * 60));
  for (let k = 1; k <= n; k += 1) frame((durationS * k) / n);
};

// Poses a student might record for the drag-teaching practice.
const POSES = {
  '내 자세 1': [30, 20, -60, -40, 0, 0],
  '내 자세 2': [-30, 10, -50, -50, 0, 0],
  '내 자세 3': [0, 30, -90, -20, 0, 0],
};

type Theme = keyof typeof PRACTICES;
type Practice = (typeof PRACTICES)[Theme][number];
type Eid = Practice['effector'];

async function run(theme: Theme, p: Practice, effector: Eid, session: ReturnType<typeof newSession>) {
  const flange = p.cameraFlange ?? false;
  const code = p.starter(effector, theme);
  // The desk the console gives this practice: the mat and its blocks only when the practice uses them.
  setMatNeeded(practiceUsesMat(p.id));
  const world = createWorld(effector, flange, undefined, theme);
  const { steps, errors } = parse(code);
  assert.equal(errors.length, 0, `${theme}/${p.id}: ${JSON.stringify(errors)}`);
  const ce = check(steps, { theme, effector, cameraFlange: flange, poses: POSES }).errors;
  assert.equal(ce.length, 0, `${theme}/${p.id}: ${JSON.stringify(ce)}`);
  try {
    await runProgram(steps, {
      chain,
      world,
      poses: POSES,
      animate: instantAnimate,
      see: async (cam, color) => {
        session.cameras.add(cam);
        const b = world.blocks.find((k) => k.color === color)!;
        return { x: b.x, y: b.y };
      },
    });
  } catch (err) {
    if (err instanceof RunError) throw new Error(`${theme}/${p.id} (${effector}): line ${err.line}: ${err.message} / ${err.fix ?? ''}`);
    throw err;
  }
  if (placedBlocks(world) > 0) session.pickTools.add(effector);
  return world;
}

for (const theme of Object.keys(PRACTICES) as Theme[]) {
  for (const p of PRACTICES[theme]) {
    const session = newSession();
    let world = await run(theme, p, p.effector, session);
    if (p.id === 'tools') world = await run(theme, p, 'pump', session); // the second tool
    if (p.action === 'vision') session.visionRuns += 1;
    if (p.action === 'api') session.apiRuns += 1;
    const m = p.progress(world, session);
    if (p.id !== 'free') assert.equal(m.done, m.total, `${theme}/${p.id}: ${m.title} ${m.done}/${m.total}`);
    // Every program ends back at the observation pose, ready for the next one.
    assert.ok(world.angles.every((a, i) => Math.abs(a - HOME_DEG[i]) < 0.5), `${theme}/${p.id} ends at home`);
    console.log(`  ok   ${theme === 'kit' ? 'AI 키트' : '로봇팔 단독'} · ${p.check ? `검수 ${p.check} ` : ''}${p.title}: ${m.title} ${m.done}/${m.total}`);
  }
}

// Theme rules: bins and the kit camera only on the kit, mat spots only on the bare desk.
{
  const ctx = { effector: 'pump' as const, cameraFlange: false, poses: {} };
  assert.equal(check(parse('robot.move_above("분류함 A")').steps, { ...ctx, theme: 'arm' }).errors.length, 1);
  assert.equal(check(parse('robot.move_above("자리 1")').steps, { ...ctx, theme: 'kit' }).errors.length, 1);
  assert.equal(check(parse('b = camera.find("빨강")').steps, { ...ctx, theme: 'arm' }).errors.length, 1);
  assert.equal(check(parse('robot.move_above("빨강 블록")').steps, { ...ctx, theme: 'kit' }).errors.length, 0);
  console.log('  ok   theme rules (bins and kit camera: kit only; spots: arm only)');
}

// 작업대: the scene's furniture stops the arm; the desk's objects are the rigid-body world's for the arm's
// links to push (physics is always on), the tool itself still stops on one; no mat = no blocks, and a
// program that wants one says so.
{
  const home = createWorld('pump', false, undefined, 'arm').angles;
  const down = solveIk(chain, new Vector3(0.2, 0, 0.15), home, { restarts: 8 }).anglesDeg;
  const obstacle = makeObject('obstacle', { x: 200, y: 0 });
  setActiveDesk({ ...EMPTY_DESK, objects: [obstacle] });
  assert.equal(createWorld('pump', false, undefined, 'arm').physics, true);
  assert.match(moveProblem(chain, createWorld('pump', false, undefined, 'arm'), down) ?? '', /장애물에 닿아요/);
  // High over it (the flange, so the tool clears its top): free.
  const over = solveIk(chain, new Vector3(0.2, 0, 0.3), home, { restarts: 8 }).anglesDeg;
  assert.equal(moveProblem(chain, createWorld('pump', false, undefined, 'arm'), over), null);
  setActiveDesk({ ...EMPTY_DESK, scene: 'factory' });
  assert.match(moveProblem(chain, createWorld('pump', false, undefined, 'arm'), down) ?? '', /컨베이어에 닿아요/);
  setActiveDesk(EMPTY_DESK);
  assert.equal(moveProblem(chain, createWorld('pump', false, undefined, 'arm'), down), null);
  setMatNeeded(false);
  const bare = createWorld('pump', false, undefined, 'arm');
  assert.equal(bare.blocks.length, 0);
  await assert.rejects(
    runProgram(parse('robot.move_above("빨강 블록")').steps, { chain, world: bare, poses: {}, animate: instantAnimate, see: async () => null }),
    (e: unknown) => e instanceof RunError && /블록이 없어요/.test(e.message),
  );
  setMatNeeded(true);
  console.log('  ok   desk rules (furniture and objects stop the arm, physics hands objects over, no mat = no blocks)');
}

console.log('\nAll practices pass in the simulator.');
