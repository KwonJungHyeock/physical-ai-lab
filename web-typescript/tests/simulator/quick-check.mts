/**
 * ⚡ 결과 바로 (cell/quick.ts): a step's program run without drawing gives the same verdict as the
 * cell checks — a reference program passes, a wrong one fails with its check — and the 운영 day comes
 * out in seconds.
 *
 * Run with: npm run check:cell
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain } = await import('../../src/engine/robot/kinematics');
const { quickRun } = await import('../../src/engine/simulator/cell/quick');
const { missionById } = await import('../../src/engine/simulator/cell/missions');
const { cafeProgram, newRecipe } = await import('../../src/engine/simulator/cell/cafeMenu');
const { ICED_AMERICANO } = await import('../../src/engine/simulator/cell/cafe');

const chain = buildChain(parseUrdf(readFileSync(new URL('../../public/robot/rdkx5/mycobot_280_rdkx5.urdf', import.meta.url), 'utf8')));

for (const [cell, id] of [
  ['cafe', 'F4'],
  ['cafe', 'F8'],
  ['draw', 'G3'],
  ['board', 'H2'],
] as const) {
  const t0 = Date.now();
  const r = await quickRun({ chain, cell, mission: id, code: missionById(id)!.solution!, effector: 'adaptive' });
  assert.ok(r && r.passed, `${id}: the reference passes | ${r?.error ?? ''} ${r?.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label} ${c.detail ?? ''}`).join(' · ')}`);
  console.log(`  ok   ${id} 결과 바로: 통과 · 셀 ${r.cellS} s · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// A wrong program: one repeat for two orders → the check says what is off.
const one = cafeProgram([newRecipe(ICED_AMERICANO, true)], 1).code;
const bad = await quickRun({ chain, cell: 'cafe', mission: 'F6', code: one, effector: 'adaptive' });
assert.ok(bad && !bad.passed && bad.checks.some((c) => !c.ok && /2잔/.test(c.label)), 'F6 one repeat fails on the two cups');
console.log(`  ok   F6 반복 1번: ✗ ${bad.checks.find((c) => !c.ok)?.detail}`);

// Stopped part-way: no result.
const ctl = new AbortController();
const p = quickRun({ chain, cell: 'cafe', mission: 'F8', code: missionById('F8')!.solution!, effector: 'adaptive', signal: ctl.signal, onProgress: () => ctl.abort() });
assert.equal(await p, null, 'aborted → null');
console.log('  ok   멈추면 결과 없음');
