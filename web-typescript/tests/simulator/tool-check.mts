/**
 * The tool on screen against the real arm's flange (engine/simulator/effectors.ts): the banner's two
 * cases, which commands a program holds, and the refusal before gripper or pump commands reach a robot
 * fitted with the other tool. Run with: npm run check:tool
 */
import assert from 'node:assert/strict';

const { toolMismatch, toolsUsed, flangeRefusal } = await import('../../src/engine/simulator/effectors');

/* --- 1. the banner -------------------------------------------------------------------------------- */
assert.equal(toolMismatch('adaptive', 100), null, 'gripper on screen, gripper answers');
assert.equal(toolMismatch('adaptive', null), 'no-gripper');
assert.equal(toolMismatch('parallel', null), 'no-gripper');
assert.equal(toolMismatch('pump', 40), 'gripper-fitted');
assert.equal(toolMismatch('none', 0), 'gripper-fitted', 'an opening of 0 is still a gripper answering');
assert.equal(toolMismatch('pump', null), null, 'the pump has no sensor: nothing to say');
assert.equal(toolMismatch('adaptive', undefined), null, 'not known (running, older robot)');

/* --- 2. what a program holds ------------------------------------------------------------------------ */
assert.deepEqual(toolsUsed([{ type: 'angles' }, { type: 'gripper' }]), { grip: true, pump: false });
assert.deepEqual(toolsUsed([{ type: 'timed', cmd: 'pump' }]), { grip: false, pump: true });
assert.deepEqual(toolsUsed([{ type: 'angles' }, { type: 'wait' }]), { grip: false, pump: false });

/* --- 3. before sending ---------------------------------------------------------------------------- */
assert.match(flangeRefusal({ grip: true, pump: false }, null), /그리퍼가 대답하지 않아요/);
assert.match(flangeRefusal({ grip: false, pump: true }, 55), /흡착 펌프로 바꿔/);
assert.equal(flangeRefusal({ grip: true, pump: false }, 55), '');
assert.equal(flangeRefusal({ grip: false, pump: true }, null), '');
assert.equal(flangeRefusal({ grip: true, pump: true }, undefined), '', 'unknown: let it through');
assert.equal(flangeRefusal({ grip: false, pump: false }, null), '');

console.log('tool check: banner, program tools, refusals OK');
