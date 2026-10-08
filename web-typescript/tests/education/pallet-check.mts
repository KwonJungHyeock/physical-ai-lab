/**
 * Checks for 물류 센터 · 문제 1 (src/engine/education/lab/pallet.ts): the palletizing cell runs
 * headless with real rigid-body physics, and
 *
 *  - the sheet's values (layer pitch 30 mm for 40 mm cartons) crush the first box of layer 2 into
 *    the one under it by about 10 mm and stop the line;
 *  - the worked fix (pitch = box height, let go 2 mm above) stacks all twelve within tolerance;
 *  - letting go 10 mm above drops the boxes: it does not pass;
 *  - every place and the pick are within the arm's reach, and the same values give the same run.
 *
 * Run with: npm run check:pallet
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const P = await import('../../src/engine/education/lab/pallet');
const { toolPoseAt } = await import('../../src/engine/education/lab/run');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));

for (let k = 0; k < P.N_BOXES; k += 1) {
  const c = P.slotCentre(k);
  assert.ok(toolPoseAt(chain, [c[0], c[1], c[2] + P.PBOX.h / 2 + 60]), `place ${k + 1} reachable`);
}
assert.ok(toolPoseAt(chain, [P.PICK[0], P.PICK[1], P.PICK[2] + P.PBOX.h / 2]), 'pick reachable');
console.log('  ✓ the pick and all 12 places are within reach');

const before = await P.runStack(chain, P.STACK_DEFAULT);
const sb = P.scoreStack(before);
assert.equal(before.failure?.kind, 'press', before.failure?.text);
assert.equal(before.failure?.box, 4);
assert.ok(sb.pressed > 8 && sb.pressed < 12, `pressed ${sb.pressed}`);
assert.equal(sb.placed, 4);
assert.ok(!sb.pass);
console.log(`  ✓ starting values: ${before.failure!.text} (${sb.pressed.toFixed(1)} mm, ${before.durationS.toFixed(1)} s)`);

const fixed = await P.runStack(chain, P.STACK_FIX);
const sf = P.scoreStack(fixed);
assert.ok(sf.pass, JSON.stringify(sf));
assert.equal(sf.ok, P.N_BOXES);
assert.ok(sf.maxDrop <= P.DROP_OK_MM);
console.log(`  ✓ worked fix: ${sf.ok}/12 in place, worst xy ${Math.max(...fixed.boxes.map((b) => b.xyErr)).toFixed(1)} mm, ${sf.timeS.toFixed(1)} s`);

const high = P.scoreStack(await P.runStack(chain, { pitch: P.PBOX.h, gap: 10 }));
assert.ok(!high.pass && high.maxDrop > P.DROP_OK_MM);
console.log(`  ✓ let go 10 mm above: does not pass (dropped ${high.maxDrop.toFixed(0)} mm${high.stopped ? `, ${high.stopped}` : ''})`);

const again = await P.runStack(chain, P.STACK_DEFAULT);
assert.equal(again.durationS, before.durationS);
assert.deepEqual(again.frames[again.frames.length - 1].boxes, before.frames[before.frames.length - 1].boxes);
console.log('  ✓ the same values give the same run');
console.log('pallet: all checks passed');
