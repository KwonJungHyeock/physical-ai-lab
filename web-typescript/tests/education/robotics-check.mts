/**
 * Checks for the 교육 (robotics lessons) maths: Jacobian, manipulability,
 * resolved-rate control, IK trace, workspace, dynamics, collisions and planning.
 * Each is checked against an independent route to the same number (finite
 * differences of FK, the derivative of potential energy, kinetic energy, ...).
 *
 * Run with: npm run check:robotics
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JSDOM } from 'jsdom';
import { Vector3 } from 'three';

globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain, forwardKinematicsFrames, solveIk } = await import('../../src/engine/robot/kinematics');
const { FLANGE_REACH_MM } = await import('../../src/engine/robot/limits');
const { eigSym3, solve } = await import('../../src/engine/physics/linalg');
const { jacobianAt, manipulability, resolvedRateStep, toolVelocity } = await import('../../src/engine/physics/jacobian');
const { inverseDynamics, gravityTorques, massMatrix, potentialEnergy, torqueLimits, LINK_INERTIA } = await import('../../src/engine/physics/dynamics');
const { workspaceProfile, profileOutline } = await import('../../src/engine/physics/workspace');
const { poseContact, moveContact } = await import('../../src/engine/physics/collide');
const { trapezoid, quinticWithin, rrtConnect, pathLengthDeg } = await import('../../src/engine/physics/planning');

const robot = parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8'));
const chain = buildChain(robot);
const HOME = [0.61, 45.87, -92.37, -41.3, 2.02, 9.58];
const POSES = [HOME, [10, -20, -60, 30, 15, 0], [-40, 30, -80, -20, -30, 45], [80, -45, -30, 60, 20, -10]];

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`);
  }
};
const tipMm = (q: number[], tcp = 0) => {
  const f = forwardKinematicsFrames(chain, q);
  const e = f[f.length - 1].elements;
  return [(e[12] + (e[8] * tcp) / 1000) * 1000, (e[13] + (e[9] * tcp) / 1000) * 1000, (e[14] + (e[10] * tcp) / 1000) * 1000];
};

console.log('linear algebra');
check('symmetric eigen-decomposition: A v = λ v, largest first', () => {
  const A = [
    [4, 1, 0.5],
    [1, 3, 0.2],
    [0.5, 0.2, 1],
  ];
  const { values, vectors } = eigSym3(A);
  assert.ok(values[0] >= values[1] && values[1] >= values[2]);
  values.forEach((l, i) => {
    const v = vectors[i];
    const Av = A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
    Av.forEach((x, k) => assert.ok(Math.abs(x - l * v[k]) < 1e-9, `eigenpair ${i}`));
  });
});
check('linear solve', () => {
  const x = solve(
    [
      [2, 1],
      [1, 3],
    ],
    [3, 5],
  );
  assert.ok(Math.abs(x[0] - 0.8) < 1e-12 && Math.abs(x[1] - 1.4) < 1e-12);
});

console.log('단원 3 · 자코비안');
check('Jacobian = finite differences of FK (tool point 60 mm past the flange)', () => {
  for (const q of POSES) {
    const { J } = jacobianAt(chain, q, 60);
    for (let j = 0; j < 6; j += 1) {
      const h = 1e-4; // degrees
      const qp = q.slice();
      qp[j] += h;
      const qm = q.slice();
      qm[j] -= h;
      const a = tipMm(qp, 60);
      const b = tipMm(qm, 60);
      for (let r = 0; r < 3; r += 1) {
        const fd = (a[r] - b[r]) / 1000 / (2 * h * (Math.PI / 180));
        assert.ok(Math.abs(fd - J[r][j]) < 1e-6, `J[${r}][${j}] ${J[r][j]} vs ${fd}`);
      }
    }
  }
});
check('tool velocity = J q̇ in mm/s', () => {
  const { J } = jacobianAt(chain, HOME);
  const v = toolVelocity(J, [10, 0, 0, 0, 0, 0]).linearMmS;
  const a = tipMm(HOME);
  const qq = HOME.slice();
  qq[0] += 0.01;
  const b = tipMm(qq);
  v.forEach((x, k) => assert.ok(Math.abs(x - (b[k] - a[k]) * 1000) < 0.05, `axis ${k}`));
});
check('manipulability: stretched arm (singular) is much flatter (isotropy) than the work pose', () => {
  const work = manipulability(jacobianAt(chain, HOME).J);
  const stretched = manipulability(jacobianAt(chain, [0, 0, 0, 0, 0, 0]).J);
  console.log(`    home index ${work.index.toExponential(2)} isotropy ${work.isotropy.toFixed(2)}; upright ${stretched.index.toExponential(2)} isotropy ${stretched.isotropy.toFixed(3)}`);
  assert.ok(stretched.index < work.index * 0.6);
  assert.ok(stretched.isotropy < 0.1);
});
check('resolved-rate control moves the tool the asked way (+x 20 mm/s for 1 s)', () => {
  let q = HOME.slice();
  const start = tipMm(q);
  for (let k = 0; k < 50; k += 1) q = resolvedRateStep(chain, q, [20, 0, 0], 0.02).next;
  const end = tipMm(q);
  const d = end.map((v, i) => v - start[i]);
  console.log(`    moved ${d.map((v) => v.toFixed(2)).join(', ')} mm`);
  assert.ok(Math.abs(d[0] - 20) < 1.5 && Math.abs(d[1]) < 1.5 && Math.abs(d[2]) < 1.5);
});

console.log('단원 2 · 역기구학');
check('the solver closes in: error at the end ≤ 1 mm, and the trace is recorded', () => {
  const target = new Vector3(0.18, 0.05, 0.12);
  const trace: number[] = [];
  const r = solveIk(chain, target, HOME, { onIteration: (_q, e) => trace.push(e) });
  assert.ok(r.converged, 'converged');
  assert.ok(trace.length >= 2, `trace ${trace.length}`);
  assert.ok(trace[trace.length - 1] < trace[0], 'error went down');
});

console.log('단원 1 · 작업 공간');
check('workspace reach ≈ flange reach (302 mm), outline closed', () => {
  const p = workspaceProfile(chain);
  console.log(`    reach ${p.reachMm.toFixed(1)} mm at z ${p.reachZ.toFixed(0)}, top ${p.topZ.toFixed(0)} mm, rows ${p.rows.length}`);
  assert.ok(Math.abs(p.reachMm - FLANGE_REACH_MM) < 15, `reach ${p.reachMm}`);
  assert.ok(p.topZ > 380 && p.topZ < 480, `top ${p.topZ}`);
  assert.ok(profileOutline(p).length === p.rows.length * 2);
});

console.log('단원 4 · 동역학');
check('estimated moving mass ≈ 0.55 kg', () => {
  const m = Object.values(LINK_INERTIA).reduce((s, l) => s + l.mass, 0);
  assert.ok(m > 0.5 && m < 0.6);
});
check('gravity torques = ∂V/∂q (finite differences of potential energy)', () => {
  for (const q of POSES) {
    for (const payloadKg of [0, 0.25]) {
      const G = gravityTorques(chain, q, { payloadKg, tcpMm: 40 });
      for (let j = 0; j < 6; j += 1) {
        const h = 1e-3;
        const qp = q.slice();
        qp[j] += h;
        const qm = q.slice();
        qm[j] -= h;
        const fd = (potentialEnergy(chain, qp, { payloadKg, tcpMm: 40 }) - potentialEnergy(chain, qm, { payloadKg, tcpMm: 40 })) / (2 * h * (Math.PI / 180));
        assert.ok(Math.abs(fd - G[j]) < 1e-5, `G[${j}] ${G[j]} vs ${fd}`);
      }
    }
  }
});
check('mass matrix symmetric and positive definite', () => {
  for (const q of POSES) {
    const M = massMatrix(chain, q, { payloadKg: 0.1 });
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) assert.ok(Math.abs(M[i][j] - M[j][i]) < 1e-9, `M[${i}][${j}]`);
    for (let t = 0; t < 20; t += 1) {
      const x = Array.from({ length: 6 }, (_, k) => Math.sin(t * 7 + k * 3));
      const xMx = x.reduce((s, xi, i) => s + xi * M[i].reduce((ss, mij, j) => ss + mij * x[j], 0), 0);
      assert.ok(xMx > 0);
    }
  }
});
check('energy balance: power τ·q̇ = d(kinetic + potential)/dt along a motion', () => {
  // q(t) = q0 + A sin(t); compare ∫τ·q̇ dt with the change of ½q̇ᵀMq̇ + V.
  const q0 = POSES[1];
  const A = [20, 15, -25, 30, 10, 5];
  const at = (t: number) => ({
    q: q0.map((v, i) => v + A[i] * Math.sin(t)),
    qd: A.map((a) => a * Math.cos(t)),
    qdd: A.map((a) => -a * Math.sin(t)),
  });
  const energy = (t: number) => {
    const { q, qd } = at(t);
    const M = massMatrix(chain, q);
    const w = qd.map((v) => (v * Math.PI) / 180);
    return 0.5 * w.reduce((s, wi, i) => s + wi * M[i].reduce((ss, mij, j) => ss + mij * w[j], 0), 0) + potentialEnergy(chain, q);
  };
  const T = 1.2;
  const n = 1200;
  let work = 0;
  for (let k = 0; k < n; k += 1) {
    const t = ((k + 0.5) / n) * T;
    const { q, qd, qdd } = at(t);
    const tau = inverseDynamics(chain, q, qd, qdd);
    work += tau.reduce((s, ti, i) => s + ti * ((qd[i] * Math.PI) / 180), 0) * (T / n);
  }
  const dE = energy(T) - energy(0);
  console.log(`    work ${work.toFixed(6)} J, energy change ${dE.toFixed(6)} J`);
  assert.ok(Math.abs(work - dE) < 2e-4 + Math.abs(dE) * 1e-3);
});
check('torque limits: holding 250 g at full reach is within them, J2 carries the most', () => {
  const lim = torqueLimits(chain);
  console.log(`    limits ${lim.map((t) => t.toFixed(2)).join(' / ')} N·m`);
  const g = gravityTorques(chain, [0, -90, 0, 0, 0, 0], { payloadKg: 0.25 });
  g.forEach((t, i) => assert.ok(Math.abs(t) <= lim[i] + 1e-9, `J${i + 1}`));
  assert.ok(lim[1] >= Math.max(...lim.slice(2)));
});

console.log('충돌');
check('the work pose and the upright pose are free', () => {
  assert.equal(poseContact(chain, HOME), null);
  assert.equal(poseContact(chain, [0, 0, 0, 0, 0, 0]), null);
});
check('reaching down through the table is caught, and a move into it stops on the way', () => {
  const down = [0, -100, -60, -10, 0, 0];
  const c = poseContact(chain, down, [], 60);
  assert.ok(c && c.what === '책상', JSON.stringify(c));
  const m = moveContact(chain, HOME, down, [], 60);
  assert.ok(m && m.t > 0 && m.t <= 1);
});
check('a box obstacle is caught', () => {
  const tip = tipMm(HOME, 0);
  const box = { min: [tip[0] - 20, tip[1] - 20, tip[2] - 20] as [number, number, number], max: [tip[0] + 20, tip[1] + 20, tip[2] + 20] as [number, number, number] };
  assert.ok(poseContact(chain, HOME, [box]));
});

console.log('단원 5 · 경로계획');
check('trapezoid: reaches the end at rest, within its limits', () => {
  const p = trapezoid(90, 60, 120);
  const end = p.sample(p.durationS);
  assert.ok(Math.abs(end.p - 90) < 1e-9 && Math.abs(end.v) < 1e-9);
  for (let t = 0; t <= p.durationS; t += 0.01) {
    const s = p.sample(t);
    assert.ok(Math.abs(s.v) <= 60 + 1e-9 && Math.abs(s.a) <= 120 + 1e-9);
  }
  const q = quinticWithin(90, 60, 120);
  assert.ok(q.durationS > p.durationS, 'smooth takes longer');
  for (let t = 0; t <= q.durationS; t += 0.01) {
    const s = q.sample(t);
    assert.ok(Math.abs(s.v) <= 60 + 1e-6 && Math.abs(s.a) <= 120 + 1e-3);
  }
});
check('RRT-Connect finds a way round a wall the straight move goes through', () => {
  const start = [60, 30, -100, -20, 0, 0];
  const goal = [-60, 30, -100, -20, 0, 0];
  const wall = { min: [120, -25, 0] as [number, number, number], max: [260, 25, 230] as [number, number, number], name: '벽' };
  assert.ok(moveContact(chain, start, goal, [wall]), 'the straight move hits the wall');
  const free = (q: number[]) => !poseContact(chain, q, [wall]);
  const r = rrtConnect(start, goal, free);
  console.log(`    ok ${r.ok}, iterations ${r.iterations}, checks ${r.checks}, raw ${r.raw.length} → ${r.path.length} poses, ${pathLengthDeg(r.path).toFixed(0)}°`);
  assert.ok(r.ok);
  for (let i = 1; i < r.path.length; i += 1) assert.equal(moveContact(chain, r.path[i - 1], r.path[i], [wall]), null, `stretch ${i}`);
  assert.deepEqual(r.path[0], start);
  assert.deepEqual(r.path[r.path.length - 1], goal);
});

console.log('물리엔진 (Rapier)');
{
  const { createPhysics } = await import('../../src/engine/physics/physics');
  const stack = [
    { id: 'a', color: 'red', at: [200, 0, 12.5] as [number, number, number] },
    { id: 'b', color: 'blue', at: [200, 0, 40] as [number, number, number] },
    { id: 'c', color: 'green', at: [200, 0, 70] as [number, number, number] },
    { id: 'd', color: 'yellow', at: [150, -120, 60] as [number, number, number] },
  ];
  const phys = await createPhysics(chain, 0, stack);
  phys.setArm([0, 0, 0, 0, 0, 0]);
  for (let k = 0; k < 240; k += 1) phys.step(1 / 60);
  const at = Object.fromEntries(phys.blocks().map((b) => [b.id, b.at]));
  check('blocks fall and settle: a dropped block rests on the table, a 3-stack stands', () => {
    console.log(`    d z ${at.d.z.toFixed(1)} mm; stack ${['a', 'b', 'c'].map((k) => at[k].z.toFixed(1)).join(' / ')} mm`);
    assert.ok(Math.abs(at.d.z - 12.5) < 1.5);
    assert.ok(Math.abs(at.a.z - 12.5) < 1.5 && Math.abs(at.b.z - 37.5) < 2 && Math.abs(at.c.z - 62.5) < 2.5);
    assert.ok(Math.abs(at.c.x - 200) < 3);
  });
  check('grab a block with the tool and lift it; release drops it back', () => {
    // Tool straight down over block d.
    const r = solveIk(chain, new Vector3(0.15, -0.12, 0.025 + 0.0125), HOME, { matchOrientation: true, targetRpyDeg: [180, 0, 0] });
    assert.ok(r.converged, 'ik');
    phys.setArm(r.anglesDeg);
    for (let k = 0; k < 30; k += 1) phys.step(1 / 60);
    const got = phys.grab();
    assert.equal(got, 'd');
    const up = solveIk(chain, new Vector3(0.15, -0.12, 0.12), r.anglesDeg, { matchOrientation: true, targetRpyDeg: [180, 0, 0] });
    for (let k = 1; k <= 60; k += 1) {
      phys.setArm(r.anglesDeg.map((a, i) => a + ((up.anglesDeg[i] - a) * k) / 60));
      phys.step(1 / 60);
    }
    const lifted = phys.blocks().find((b) => b.id === 'd')!;
    console.log(`    lifted to z ${lifted.at.z.toFixed(1)} mm`);
    assert.ok(lifted.at.z > 80);
    phys.release();
    for (let k = 0; k < 180; k += 1) phys.step(1 / 60);
    const dropped = phys.blocks().find((b) => b.id === 'd')!;
    assert.ok(dropped.at.z < 20, `z ${dropped.at.z}`);
  });
  check('the arm sweeping through the stack knocks it over', () => {
    phys.reset(stack.slice(0, 3));
    phys.setArm(HOME);
    for (let k = 0; k < 120; k += 1) phys.step(1 / 60);
    const low = solveIk(chain, new Vector3(0.2, -0.1, 0.05), HOME).anglesDeg;
    const sweep = solveIk(chain, new Vector3(0.2, 0.1, 0.05), low).anglesDeg;
    for (let k = 1; k <= 60; k += 1) {
      phys.setArm(HOME.map((a, i) => a + ((low[i] - a) * k) / 60));
      phys.step(1 / 60);
    }
    for (let k = 1; k <= 90; k += 1) {
      phys.setArm(low.map((a, i) => a + ((sweep[i] - a) * k) / 90));
      phys.step(1 / 60);
    }
    for (let k = 0; k < 120; k += 1) phys.step(1 / 60);
    const top = phys.blocks().find((b) => b.id === 'c')!;
    console.log(`    top block now at (${top.at.x.toFixed(0)}, ${top.at.y.toFixed(0)}, ${top.at.z.toFixed(0)}) mm`);
    assert.ok(top.at.z < 50 || Math.hypot(top.at.x - 200, top.at.y) > 15);
  });
  phys.dispose();

  console.log('  단원 6: the pump stacks three blocks (IK above, down, grab, up, over, down, release)');
  {
    const { solveToolPose, STRAIGHT_DOWN } = await import('../../src/engine/robot/tool');
    const TCP = 89;
    const start = [
      { id: 'r', color: 'red', at: [230, 40, 12.5] as [number, number, number] },
      { id: 'y', color: 'yellow', at: [160, 110, 12.5] as [number, number, number] },
      { id: 'b', color: 'blue', at: [250, -40, 12.5] as [number, number, number] },
    ];
    const w = await createPhysics(chain, TCP, start);
    let q = HOME.slice();
    w.setArm(q);
    for (let k = 0; k < 60; k += 1) w.step(1 / 60);
    const go = (p: number[]) => {
      const r = solveToolPose(chain, { x: p[0], y: p[1], z: p[2] }, q, { tcpMm: TCP, orientation: STRAIGHT_DOWN });
      assert.ok(r.converged, `ik ${p}`);
      const from = q.slice();
      for (let k = 1; k <= 45; k += 1) {
        q = from.map((a, i) => a + ((r.anglesDeg[i] - a) * k) / 45);
        w.setArm(q);
        w.step(1 / 60);
      }
    };
    const GOAL = [170, -140];
    let level = 0;
    let ok = true;
    for (const id of ['b', 'r', 'y']) {
      const b = w.blocks().find((x) => x.id === id)!;
      const top = b.at.z + 12.5;
      go([b.at.x, b.at.y, top + 50]);
      go([b.at.x, b.at.y, top + 1.5]);
      if (w.grab(8) !== id) ok = false;
      go([b.at.x, b.at.y, top + 70]);
      go([GOAL[0], GOAL[1], level * 25 + 25 + 60]);
      go([GOAL[0], GOAL[1], level * 25 + 25 + 1.5]);
      w.release();
      for (let k = 0; k < 20; k += 1) w.step(1 / 60);
      go([GOAL[0], GOAL[1], level * 25 + 25 + 60]);
      level += 1;
    }
    for (let k = 0; k < 60; k += 1) w.step(1 / 60);
    const placed = w.blocks().map((x) => `${x.id} (${x.at.x.toFixed(0)}, ${x.at.y.toFixed(0)}, ${x.at.z.toFixed(1)})`);
    console.log(`    ${placed.join('  ')}`);
    check('all three grabbed and stacked at the goal', () => {
      assert.ok(ok, 'every grab took the block');
      const zs = w.blocks().map((x) => {
        assert.ok(Math.hypot(x.at.x - GOAL[0], x.at.y - GOAL[1]) < 10, `${x.id} on the spot`);
        return x.at.z;
      }).sort((a, b) => a - b);
      assert.ok(Math.abs(zs[0] - 12.5) < 2 && Math.abs(zs[1] - 37.5) < 2.5 && Math.abs(zs[2] - 62.5) < 3, zs.join());
    });
    w.dispose();
  }
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall robotics checks passed');
