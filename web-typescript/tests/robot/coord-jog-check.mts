/**
 * The coordinate jog (조그 › 좌표) on the myCobot 280: it works from a bent arm in every direction,
 * and from the arm stretched straight (일자, a singular pose) it says so before anything moves
 * instead of "out of reach" (engine/robot/tool.ts coordJogBlocked, the field report of 2026-10-27).
 *
 * Run with: npm run check:coordjog
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { setActiveArm } = await import('../../src/engine/robot/arms');
const { coordJogBlocked, shiftTool } = await import('../../src/engine/robot/tool');

const arm = setActiveArm('mycobot280-rdkx5');
const chain = buildChain(parseUrdf(readFileSync(new URL(`../../public${arm.urdf}`, import.meta.url), 'utf8')));
const AXES = ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const;

// From home (and a bent working pose) every direction starts, and a held key carries the tip 60 mm.
for (const [name, q] of [
  ['기본 자세', arm.home],
  ['굽힌 자세', [0, -40, -60, -80, 0, 0]],
] as const) {
  for (const ax of AXES) for (const d of [1, -1] as const) assert.equal(coordJogBlocked(chain, q, 0, ax, d), null, `${name}: ${ax}${d > 0 ? '+' : '-'} starts`);
}
for (const ax of ['x', 'y', 'z'] as const) {
  for (const d of [1, -1]) {
    let q = arm.home.slice();
    let mm = 0;
    for (let k = 0; k < 60; k += 1) {
      const s = shiftTool(chain, q, { x: 0, y: 0, z: 0, [ax]: d });
      if (!s.converged || s.anglesDeg.some((a, i) => Math.abs(a - q[i]) > 6)) break;
      q = s.anglesDeg;
      mm += 1;
    }
    assert.equal(mm, 60, `from home ${ax}${d > 0 ? '+' : '-'} goes 60 mm (went ${mm})`);
  }
}
console.log('  ok   from home and a bent pose: all 12 directions start; x y z go 60 mm each way');

// The field report: the arm stretched straight up. Sideways and down cannot start; the notice names the pose.
const straight = [-0.1, -0.5, -0.6, -2.6, 17.4, 0.5];
for (const [ax, d] of [
  ['y', 1],
  ['y', -1],
  ['z', 1],
  ['z', -1],
] as const) {
  const why = coordJogBlocked(chain, straight, 0, ax, d);
  assert.match(why ?? '', /일자로 펴져|특이 자세/, `${ax}${d > 0 ? '+' : '-'} from straight: ${why}`);
}
console.log(`  ok   from the straight arm: ${coordJogBlocked(chain, straight, 0, 'y', 1)}`);
console.log('coordinate jog: all checks passed');
