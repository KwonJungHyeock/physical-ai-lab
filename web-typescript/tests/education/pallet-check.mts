/**
 * Checks for 물류 센터 · 문제 1 (src/engine/education/lab/pallet.ts): the palletizing cell runs
 * headless with real rigid-body physics, and
 *
 *  - the sheet's values (layer pitch 30 mm for 40 mm cartons) crush the first box of layer 2 into
 *    the one under it by about 10 mm and stop the line;
 *  - the worked fix (pitch = box height, let go 2 mm above) stacks all twelve within tolerance;
 *  - letting go 10 mm above drops the boxes: it does not pass;
 *  - every place and the pick are within the arm's reach, and the same values give the same run;
 *  - ② (a 200 g box): the foreman's full travel speed shakes the box off the cup; the worked fix
 *    (slower with a box, faster up and down) stacks all twelve within the time limit, and its
 *    largest acceleration with a box stays under the cup's limit; slow everywhere is too slow;
 *  - ③ (the pallet moved): the old reference point puts the first box half off the pallet and it
 *    falls; the reference taught again at the mark stacks all twelve on the moved pallet.
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
const lim = P.accLimit(P.HEAVY_G);
const s2b = P.scoreStack(await P.runStack(chain, P.setupFor(2, P.SPEED_DEFAULT)), P.TIME_LIMIT_S);
assert.ok(s2b.slipped && !s2b.pass, JSON.stringify(s2b));
const r2 = await P.runStack(chain, P.setupFor(2, P.SPEED_FIX));
const s2 = P.scoreStack(r2, P.TIME_LIMIT_S);
assert.ok(s2.pass, JSON.stringify(s2));
assert.ok(r2.maxCarryAcc < lim, `${r2.maxCarryAcc} < ${lim}`);
const s2slow = P.scoreStack(await P.runStack(chain, P.setupFor(2, { carry: 50, empty: 50, vert: 35 })), P.TIME_LIMIT_S);
assert.ok(!s2slow.pass && !s2slow.slipped && s2slow.timeS > P.TIME_LIMIT_S);
console.log(`  ✓ ② full speed: ${s2b.stopped}; fix: ${s2.timeS.toFixed(1)} s ≤ ${P.TIME_LIMIT_S} s, max ${r2.maxCarryAcc.toFixed(1)} < ${lim.toFixed(1)} m/s²; slow: ${s2slow.timeS.toFixed(0)} s`);

const s3b = P.scoreStack(await P.runStack(chain, P.setupFor(3, P.REF_DEFAULT)));
assert.ok(!s3b.pass && s3b.placed <= 2, JSON.stringify(s3b));
const s3 = P.scoreStack(await P.runStack(chain, P.setupFor(3, P.REF_FIX)));
assert.ok(s3.pass, JSON.stringify(s3));
const s3off = P.scoreStack(await P.runStack(chain, P.setupFor(3, { x: P.REF_FIX.x + 8, y: P.REF_FIX.y })));
assert.ok(!s3off.pass);
console.log(`  ✓ ③ old reference: ${s3b.stopped}; taught again: ${s3.ok}/12; 8 mm off: does not pass`);
console.log('pallet: all checks passed');
