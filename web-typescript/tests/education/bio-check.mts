/**
 * 바이오 실험실 (engine/education/lab/bio.ts): the starting programs fail the way the lesson script
 * (content-markdown/sites/bio.md) says, the worked fixes pass, and the numbers the script quotes hold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const B = await import('../../src/engine/education/lab/bio');

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));
let failed = 0;
const check = (name: string, fn: () => string | void) => {
  try {
    const note = fn();
    console.log(`  ✓ ${name}${note ? ` (${note})` : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
};

console.log('① 시험관이 기울어 쏟아진다 — 자세');
check('the spill angle is atan(2h / d) = 31°', () => {
  assert.ok(Math.abs(B.SPILL_DEG - 31) < 0.1, `${B.SPILL_DEG}`);
});
check('the copied pose (ry −35°) spills on the way', () => {
  const r = B.runBio(chain, 1, B.BIO_DEFAULTS[1]);
  assert.equal(r.failure?.kind, 'spill');
  assert.ok(r.maxTilt > B.SPILL_DEG && r.maxTilt < B.SPILL_DEG + 1, `${r.maxTilt}`);
  return `${r.failure!.t.toFixed(1)} s, ${r.maxTilt.toFixed(1)}°`;
});
check('ry 0 places the tube without tilting it', () => {
  const r = B.runBio(chain, 1, B.BIO_FIXES[1]);
  assert.ok(B.scoreBio(1, r).pass, B.scoreBio(1, r).headline);
  assert.ok(r.maxTilt < 1, `${r.maxTilt}`);
});
check('ry 25° does not spill, but the tilted tube does not go into the hole', () => {
  const r = B.runBio(chain, 1, { tilt: 25, yaw: 0 });
  assert.equal(r.failure?.kind, 'catch');
});
check('turning only rz (90°) keeps the tube straight', () => {
  assert.ok(B.scoreBio(1, B.runBio(chain, 1, { tilt: 0, yaw: 90 })).pass);
});

console.log('② 먼 칸일수록 어긋난다 — 영점 오차');
check('without calibration: holes 1–4 out of the 1 mm standard, hole 5 catches the rim', () => {
  const r = B.runBio(chain, 2, B.BIO_DEFAULTS[2]);
  assert.equal(r.failure?.kind, 'catch');
  assert.equal(r.failure?.tube, 4);
  const o = r.offsets.slice(0, 4) as number[];
  assert.ok(o.every((x) => x > B.READ_MM && x < B.CATCH_MM), o.join(', '));
  return o.map((x) => x.toFixed(2)).join(' · ') + ' mm';
});
check('offset ÷ distance is the 1° zero error (0.0175 rad) at holes 3 and 4', () => {
  const r = B.runBio(chain, 2, B.BIO_DEFAULTS[2]);
  for (const k of [2, 3]) {
    const h = B.rowHole(k);
    const ratio = r.offsets[k]! / Math.hypot(h[0], h[1]);
    assert.ok(Math.abs(ratio - 0.01745) < 0.0015, `${k + 1}: ${ratio}`);
  }
  assert.ok(Math.abs(r.offsets[2]! - 2.62) < 0.01, `hole 3 = ${r.offsets[2]} (the script's 2.62)`);
});
check('calibrating 1.0° puts all six within 1 mm; 0.5° does not', () => {
  const r = B.runBio(chain, 2, B.BIO_FIXES[2]);
  assert.ok(B.scoreBio(2, r).pass, B.scoreBio(2, r).headline);
  const half = B.runBio(chain, 2, { zero: 0.5 });
  assert.ok(!B.scoreBio(2, half).pass);
  assert.equal(half.failure, null);
  return `max ${Math.max(...(r.offsets as number[])).toFixed(2)} mm · half: ${Math.max(...(half.offsets as number[])).toFixed(2)} mm`;
});

console.log('③ 돌아가는 길에 부딪힌다 — 경유점');
check('the straight joint move at 125 mm swings the tube into the centrifuge', () => {
  const r = B.runBio(chain, 3, B.BIO_DEFAULTS[3]);
  assert.equal(r.failure?.kind, 'hit');
  assert.match(r.failure!.text, /원심분리기/);
  return `${r.failure!.t.toFixed(1)} s`;
});
check('lifting over it (172 mm) is out of reach: the arm reaches about 165 mm there, the rack is 180 mm away', () => {
  const reach = B.bioReach(chain, 172);
  assert.ok(reach < Math.hypot(B.DST[0], B.DST[1]), `${reach}`);
  const r = B.runBio(chain, 3, { lift: 172, via: false, vx: 90, vy: 0, vz: 125 });
  assert.equal(r.failure?.kind, 'unreachable');
  return `${reach.toFixed(0)} mm`;
});
check('a waypoint at (90, 0, 125) goes round with at least 10 mm to spare', () => {
  const r = B.runBio(chain, 3, B.BIO_FIXES[3]);
  assert.ok(B.scoreBio(3, r).pass, B.scoreBio(3, r).headline);
  assert.ok(r.minClear >= 10, `${r.minClear}`);
  return `${r.minClear.toFixed(1)} mm`;
});
check('the same values give the same run', () => {
  const a = B.runBio(chain, 2, B.BIO_DEFAULTS[2]);
  const b = B.runBio(chain, 2, B.BIO_DEFAULTS[2]);
  assert.deepEqual(a.offsets, b.offsets);
  assert.equal(a.durationS, b.durationS);
});

if (failed) {
  console.log(`\nbio: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nbio: all checks passed');
