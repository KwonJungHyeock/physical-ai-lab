/**
 * Every arm the simulator can open: its URDF loads, has its movable joints (6, or 4) and the
 * flange link the tools mount on; its ready pose is inside its joint ranges, points the tool
 * straight down and sits over the work mat; its model files exist. `solve` also prints IK
 * solutions for tool-down targets (how the ready poses were found).
 *
 * Run with: npm run check:arms
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { Vector3 } from 'three';

globalThis.DOMParser = new JSDOM('').window.DOMParser;
const W = new URL('../..', import.meta.url).pathname;
const { parseUrdf, meshNodeName } = await import('../../src/engine/robot/urdf');
const { buildChain, forwardKinematicsFrames, solveIk } = await import('../../src/engine/robot/kinematics');
const { ARMS, setActiveArm } = await import('../../src/engine/robot/arms');
const { MODELS } = await import('../../src/engine/robot/catalog');

/** Node names in a GLB (its JSON chunk). */
function glbNodeNames(path: string): string[] {
  const b = readFileSync(path);
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { nodes: { name?: string }[] };
  return json.nodes.map((n) => n.name ?? '');
}

for (const m of MODELS.filter((x) => x.kind === 'arm' && x.status === 'ready')) assert.ok(ARMS[m.id], `${m.id}: ready in the catalog but no arm spec`);

for (const [id, a] of Object.entries(ARMS)) {
  if (!a) continue;
  setActiveArm(a.id);
  for (const g of a.glbs) assert.ok(existsSync(W + 'public' + g), `${id}: missing ${g}`);
  for (const t of Object.values(a.textures)) assert.ok(existsSync(W + 'public' + t), `${id}: missing ${t}`);
  const robot = parseUrdf(readFileSync(W + 'public' + a.urdf, 'utf8'));
  const chain = buildChain(robot);
  assert.equal(chain.filter((s) => s.movableIndex >= 0).length, a.dof, `${id}: ${a.dof} movable joints`);
  assert.equal(a.min.length, 6, `${id}: six angle slots (a 4-axis arm's last two fixed at 0)`);
  assert.ok(chain.some((s) => s.joint.child === a.flangeLink), `${id}: flange link ${a.flangeLink}`);
  const meshes = [...robot.links.values()].map((l) => l.visual && meshNodeName(l.visual.meshFilename)).filter(Boolean);
  assert.ok(meshes.length >= a.dof + 1, `${id}: link meshes`);
  const nodes = new Set(a.glbs.flatMap((g) => glbNodeNames(W + 'public' + g)));
  for (const m of meshes) assert.ok(nodes.has(m as string), `${id}: mesh ${m} not in ${a.glbs.join(' + ')}`);
  assert.ok(a.home.every((v, i) => v >= a.min[i] && v <= a.max[i]), `${id}: ready pose inside the joint ranges`);
  const e = forwardKinematicsFrames(chain, a.home).at(-1)!.elements;
  const tip = [e[12] * 1000, e[13] * 1000, e[14] * 1000];
  assert.ok(e[10] < -0.95, `${id}: tool points down in the ready pose (z axis ${e[10].toFixed(2)})`);
  assert.ok(Math.hypot(tip[0], tip[1]) > 60 && tip[2] > 80 && tip[2] < 280, `${id}: ready pose over the mat (${tip.map((v) => v.toFixed(0)).join(', ')})`);
  console.log(`  ok   ${id.padEnd(20)} ${meshes.length} meshes · ready tip ${tip.map((v) => v.toFixed(0)).join(', ')} mm`);

  if (process.argv[2] === 'solve') {
    for (const target of [[a.reachMm * 0.62, 0, 130], [a.reachMm * 0.55, 0, 160], [210, 0, 200]]) {
      const r = solveIk(chain, new Vector3(target[0] / 1000, target[1] / 1000, target[2] / 1000), a.home, { matchOrientation: true, targetRpyDeg: [180, 0, 0], restarts: 40 });
      console.log(`       tool down at ${target.map((v) => v.toFixed(0)).join(', ')}: ${r.converged ? r.anglesDeg.map((v) => v.toFixed(1)).join(', ') : 'no solution'}`);
    }
  }
}
console.log('arms-check: all arms load');
