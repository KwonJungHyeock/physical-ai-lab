/**
 * The arm against the kit and the plate (engine/simulator/sim.ts moveCheck · play · kitCollisions):
 * - a pose already into the plate (the scene changed under the arm, or the real arm stands that way)
 *   does not lock every button: [기본 자세] and [일자로 펴기] are allowed out of it, a move deeper is not;
 * - the arm's links, not only the tool tip, stop on a bin wall or the camera stand.
 *
 * Run with: npm run check:kitcollide
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { setActiveArm } = await import('../../src/engine/robot/arms');
const { contactJoints, createWorld, moveProblem, poseContact, runProgram } = await import('../../src/engine/simulator/sim');

const arm = setActiveArm('mycobot280-rdkx5');
const chain = buildChain(parseUrdf(readFileSync(new URL(`../../public${arm.urdf}`, import.meta.url), 'utf8')));
const ZERO = [0, 0, 0, 0, 0, 0];

/* --- out of the plate ---------------------------------------------------------- */
{
  // The pose of the field report: the real arm reaching down beside the kit (tool tip ~70 mm under the plate).
  const stuck = [115.3, -66.5, -109.9, 87.8, -0.9, 20.3];
  const w = createWorld('adaptive', false, undefined, 'kit');
  assert.ok(moveProblem(chain, w, stuck), 'reaching that pose from home is refused (it is into the plate)');
  const inside = { ...createWorld('adaptive', false, undefined, 'kit'), angles: stuck.slice() };
  assert.equal(moveProblem(chain, inside, arm.home), null, '[기본 자세] out of the plate is allowed');
  assert.equal(moveProblem(chain, inside, ZERO), null, '[일자로 펴기] out of the plate is allowed');
  const deeper = stuck.slice();
  deeper[1] -= 20;
  assert.ok(moveProblem(chain, inside, deeper), 'a move that ends into the plate is still refused');
  // And the simulated arm really travels out (frame by frame) instead of stopping on its first frame.
  const run = { ...createWorld('adaptive', false, undefined, 'kit'), angles: stuck.slice() };
  await runProgram([{ type: 'move', joints: arm.home.slice(), speed: 50, line: 0 }], { chain, world: run, poses: {}, animate: async (_d: number, frame: (t: number) => void) => frame(1), see: async () => null });
  assert.deepEqual(
    run.angles.map((a) => Math.round(a)),
    arm.home.map((a) => Math.round(a)),
    'the arm arrives home',
  );
  console.log('  ok   a pose into the plate: 기본 자세 · 일자로 펴기 get out of it, deeper is refused, the run arrives');
}

/* --- links against the kit ---------------------------------------------------- */
{
  // The elbow brought down into bin A's wall (J1 60°): the link stops there, the tool tip is not the one touching.
  const w = createWorld('none', false, undefined, 'kit');
  const intoBin = [60, -80, -40, -30, 0, 0];
  const found = moveProblem(chain, { ...w, angles: intoBin }, intoBin);
  assert.match(found ?? '', /관절 쪽 팔이 분류함 A에 닿아요/);
  const intoStand = [30, -30, 0, -30, 0, 0];
  assert.match(moveProblem(chain, { ...w, angles: intoStand }, intoStand) ?? '', /키트 카메라에 닿아요/);
  assert.ok(found, 'an arm link through a bin wall is caught');
  // The official programs never touch a wall: the home and photo poses are free.
  assert.equal(moveProblem(chain, { ...w, angles: arm.home.slice() }, ZERO), null, 'home → zero is free on the kit');
  console.log(`  ok   a link through a bin wall stops: ${found}`);
}

/* --- standing in contact: the red arm and the notice ---------------------------- */
{
  const stuck = [115.3, -66.5, -109.9, 87.8, -0.9, 20.3];
  const inside = { ...createWorld('adaptive', false, undefined, 'kit'), angles: stuck.slice() };
  const err = poseContact(chain, inside);
  assert.ok(err, 'the pose into the plate is found standing still');
  assert.deepEqual(contactJoints(err!.message), [6], `the tool is the part shown red (${err!.message})`);
  assert.equal(poseContact(chain, createWorld('adaptive', false, undefined, 'kit')), null, 'home touches nothing');
  assert.deepEqual(contactJoints('3번 관절 쪽 팔이 분류함 A에 닿아요.'), [3]);
  assert.deepEqual(contactJoints('팔끼리 부딪혀요. 손목이 위팔에 닿아요.'), [4, 5, 2]);
  console.log(`  ok   standing in contact is found and coloured: ${err!.message}`);
}

console.log('kit collisions: all checks passed');
