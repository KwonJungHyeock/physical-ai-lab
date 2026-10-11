/**
 * 산업단지 현장 실습 · 대학 과제 (engine/education/lab/pyTasks.ts): every lab's three problems have a
 * graded Python task that is well formed, whose expected values are finite and agree with the
 * engine run with the real arm (the inputs taken from the screen: reach, descent times, inertia,
 * accelerations, areas), whose starter does not already pass (nor print an answer), and whose model
 * solution (pySolutions.ts) passes every case — through the page's grader in Pyodide
 * (engine/python/grade.ts) and, when python3 is installed, through CPython (`python3 -I`, on a
 * temporary file, the cases passed as a file argument).
 *
 * Run with: npm run check:pytask
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JSDOM } from 'jsdom';

globalThis.DOMParser = new JSDOM('').window.DOMParser as typeof DOMParser;

const { parseUrdf } = await import('../../src/engine/robot/urdf');
const { buildChain, forwardKinematics } = await import('../../src/engine/robot/kinematics');
const { GRADE_PY, gradeScript } = await import('../../src/engine/python/grade');
const T = await import('../../src/engine/education/lab/pyTasks');
const { PY_SOLUTIONS } = await import('../../src/engine/education/lab/pySolutions');
const P = await import('../../src/engine/education/lab/problems');
const { BOX_C, boxTop } = await import('../../src/engine/education/lab/cell');
const L = await import('../../src/engine/education/lab/logistics');
const B = await import('../../src/engine/education/lab/bio');
const F = await import('../../src/engine/education/lab/farm');
const C = await import('../../src/engine/education/lab/cafe');
const A = await import('../../src/engine/education/lab/ai');
const E = await import('../../src/engine/education/lab/energy');

type Task = (typeof T.PY_TASKS)['factory'][1];
type Call = Parameters<typeof T.checkCall>[1];

const chain = buildChain(parseUrdf(readFileSync('public/robot/rdkx5/mycobot_280_rdkx5.urdf', 'utf8')));
const LABS = ['factory', 'logistics', 'bio', 'farm', 'cafe', 'ai', 'energy'] as const;
const PROBS = [1, 2, 3] as const;
const TASKS: Task[] = LABS.flatMap((lab) => PROBS.map((p) => T.PY_TASKS[lab][p]));

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
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
const nums = (x: unknown): number[] => (typeof x === 'number' ? [x] : Array.isArray(x) ? x.flatMap(nums) : []);

console.log('과제의 모양');
check('7 labs × 3 problems, each with a function, a starter, a statement and 3 – 4 cases', () => {
  for (const t of TASKS) {
    const at = `${t.lab} ${t.prob}`;
    assert.ok(T.pyTask(t.lab, t.prob) === t, at);
    assert.match(t.fn, /^[a-z_][a-z0-9_]*$/, `${at}: function name`);
    assert.ok(t.starter.includes(`def ${t.fn}(`), `${at}: the starter defines ${t.fn}`);
    assert.ok(t.title && t.statement.length >= 2 && t.statement.length <= 3, `${at}: title and 2 – 3 statement lines`);
    assert.ok(t.cases.length >= 3 && t.cases.length <= 4, `${at}: 3 – 4 cases`);
    assert.equal(new Set(t.cases.map((c) => c.note)).size, t.cases.length, `${at}: each case has its own note`);
    for (const c of t.cases) {
      assert.ok(c.note, `${at}: every case says what it is`);
      assert.deepEqual(JSON.parse(JSON.stringify(c.args)), c.args, `${at}: arguments survive JSON`);
      assert.ok(c.tol >= 0 && (typeof c.expected !== 'string' || c.tol === 0), `${at}: tolerance`);
    }
  }
  return `${TASKS.length} tasks`;
});
check('every expected number and every numeric argument is finite', () => {
  for (const t of TASKS) for (const c of t.cases) for (const x of [...nums(c.expected), ...nums(c.args)]) assert.ok(Number.isFinite(x), `${t.lab} ${t.prob} ${c.note}: ${x}`);
});
check('the cases of a task do not all expect the same answer', () => {
  for (const t of TASKS) assert.ok(new Set(t.cases.map((c) => JSON.stringify(c.expected))).size >= 2, `${t.lab} ${t.prob}`);
});
check('no starter shows an expected value (any non-whole one, to 1 or 2 decimals)', () => {
  for (const t of TASKS)
    for (const x of t.cases.flatMap((c) => nums(c.expected)))
      if (Math.abs(x - Math.round(x)) > 0.05) for (const s of [x.toFixed(1), x.toFixed(2)]) assert.ok(!t.starter.includes(s), `${t.lab} ${t.prob}: the starter contains ${s}`);
});
check('every lesson script names its tasks (content-markdown/sites/<lab>.md)', () => {
  for (const lab of LABS) {
    const md = readFileSync(`../content-markdown/sites/${lab}.md`, 'utf8');
    for (const p of PROBS) assert.ok(md.includes(T.PY_TASKS[lab][p].fn), `${lab}.md does not mention ${T.PY_TASKS[lab][p].fn}`);
  }
});

console.log('엔진과 같은 숫자 (실제 팔로 계산)');
check('공장 ①: the work sheet tip and the right J1, and J1 turns the tip about z (Rz)', () => {
  const tip = P.tipMm(chain, P.wristDown(P.P1_DEFAULT.j1, P.P1_DEFAULT.j2, P.P1_DEFAULT.j3));
  near(tip[0], T.F1_SHEET_TIP[0], 0.1, 'sheet tip x');
  near(tip[1], T.F1_SHEET_TIP[1], 0.1, 'sheet tip y');
  near(P.p1Answer(chain).j1 - P.P1_DEFAULT.j1, T.F1_J1_FIX, 0.05, 'J1 fix');
  const dq = 7;
  const turned = P.tipMm(chain, P.wristDown(P.P1_DEFAULT.j1 + dq, P.P1_DEFAULT.j2, P.P1_DEFAULT.j3));
  const a = (dq * Math.PI) / 180;
  near(turned[0], tip[0] * Math.cos(a) - tip[1] * Math.sin(a), 0.01, 'FK x after J1');
  near(turned[1], tip[0] * Math.sin(a) + tip[1] * Math.cos(a), 0.01, 'FK y after J1');
  near(turned[2], tip[2], 0.01, 'z stays');
});
check('공장 ②: the reach at box C’s top', () => {
  const reach = P.reachAt(chain, boxTop(BOX_C), 200);
  near(reach, T.F2_REACH, 2, 'reachAt');
  return `${reach.toFixed(1)} mm`;
});
check('공장 ③: the ways down, and the planned delay lands the arm on the box (p3Timing)', () => {
  const fix = { belt: 120, waitY: 40, delayMs: 0, move: 'joint' as const, speed: 80 };
  near(P.p3Timing(chain, fix).downS, T.F3_DOWN.fix, 0.01, 'down, joint 80');
  near(P.p3Timing(chain, P.P3_DEFAULT).downS, T.F3_DOWN.start, 0.01, 'down, linear 30');
  for (const c of T.pyTask('factory', 3).cases.slice(0, 3)) {
    const [belt, waitY, down] = c.args as number[];
    const [delay, gap] = c.expected as number[];
    const t = P.p3Timing(chain, { ...fix, belt, waitY, delayMs: delay * 1000 });
    near(t.boxS - delay, down, 1e-9, `${c.note}: arrival`);
    near(t.gapS, gap, 1e-9, `${c.note}: gap`);
  }
});
check('물류 ②: the screen’s acceleration at speed 100 is the one the lesson uses', () => {
  assert.ok(L.LOGI_TEXT[2].calc.prompt.includes(`${T.L2_ACC100} m/s²`), 'calc prompt');
});
check('바이오 ①: the tilt formula reads the simulator’s get_coords (rx, ry, rz) as the engine’s tool axis', () => {
  const q = B.poseAt(chain, [B.DST[0], B.DST[1], B.LIFT_Z], { yawDeg: 20, tiltDeg: (B.BIO_DEFAULTS[1] as { tilt: number }).tilt });
  assert.ok(q, 'pose');
  const axis = B.toolAt(chain, q).axis;
  const tilt = (Math.acos(-axis[2]) * 180) / Math.PI;
  const rpy = forwardKinematics(chain, q).rpyDeg;
  const R = (x: number, y: number) => (Math.acos(-Math.cos((x * Math.PI) / 180) * Math.cos((y * Math.PI) / 180)) * 180) / Math.PI;
  near(R(rpy.x, rpy.y), tilt, 0.05, 'arccos(−cos rx cos ry) vs the tool axis');
  near(tilt, (B.BIO_DEFAULTS[1] as { tilt: number }).tilt, 0.5, 'the place pose’s tilt');
  return `rx ${rpy.x.toFixed(1)}, ry ${rpy.y.toFixed(1)} → ${tilt.toFixed(1)}°`;
});
check('바이오 ②: least squares on the rack’s own misses finds the J1 zero error', () => {
  const pre = B.calibPreview(chain, { zero: 0 });
  const fit = (pre.reduce((s, x) => s + x.r * x.offset, 0) / pre.reduce((s, x) => s + x.r * x.r, 0)) * (180 / Math.PI);
  near(fit, B.J1_ERR_DEG, 0.1, 'δθ');
  return `${fit.toFixed(3)}°`;
});
check('농장 ②③: the marker distance now (265 px) and the camera’s diameter of tomato 1', () => {
  const [a, b] = F.markerPixels(F.CAM.z);
  near(Math.hypot(b.u - a.u, b.v - a.v), 265, 0.5, 'marker px');
  const g = F.gripPreview(F.FARM_DEFAULTS[3] as { squeeze: number; speed: number }).find((x) => x.k === 0);
  assert.ok(g, 'tomato 1 found');
  near(g.dSeen, T.FM3_SEEN, 0.1, 'dSeen');
});
check('카페 ②: the speed found keeps the protective distance at the detection distance', () => {
  for (const c of T.pyTask('cafe', 2).cases) {
    const [detect, react] = c.args as number[];
    const v = c.expected as number;
    if (v > 0) near(C.protectiveDistance({ zoneSpeed: v, detect, react }).total, detect, 0.01, c.note);
    else assert.ok(C.protectiveDistance({ zoneSpeed: 0, detect, react }).total >= detect, c.note);
  }
});
check('카페 ③: the turn angle, J1’s inertia (τ ÷ α), and the torque at the shortest time', () => {
  const t230 = C.turnTorque(chain, { radius: 230, time: 1.4 });
  const t180 = C.turnTorque(chain, { radius: 180, time: 1.4 });
  near(t230.dq, T.C3_DQ, 0.05, 'Δθ');
  near(t230.tau / t230.alpha, T.C3_INERTIA[230], 0.01 * T.C3_INERTIA[230], 'I at 230');
  near(t180.tau / t180.alpha, T.C3_INERTIA[180], 0.01 * T.C3_INERTIA[180], 'I at 180');
  const fast = T.pyTask('cafe', 3).cases[0].expected as number;
  const tau = C.turnTorque(chain, { radius: 230, time: fast }).tau;
  near(tau, C.CARE_J1_LIMIT, 0.02 * C.CARE_J1_LIMIT, 'τ at the shortest time');
  return `${fast.toFixed(3)} s → ${tau.toFixed(3)} N·m`;
});
check('AI ②: the blend uses the policy’s own weights (ai.ts policy)', () => {
  for (const c of T.pyTask('ai', 2).cases) {
    const [x, y, p] = c.args as number[];
    const w = A.policy(chain, { mode: 'blend', power: p }, [x, y]).weights;
    const at = [0, 1].map((j) => A.DEMOS.reduce((s, d, i) => s + d[j] * w[i], 0));
    near(at[0], (c.expected as number[])[0], 1e-6, `${c.note} x`);
    near(at[1], (c.expected as number[])[1], 1e-6, `${c.note} y`);
  }
});
check('AI ③: the corrected point is where the part really is', () => {
  const [red, green] = [A.AI_THINGS[3][0], A.AI_THINGS[3][2]];
  const [c0, c1] = T.pyTask('ai', 3).cases;
  for (const [t, c] of [
    [red, c0],
    [green, c1],
  ] as const) {
    near((c.expected as number[])[0], t.x, 0.3, `${t.color} x`);
    near((c.expected as number[])[1], t.y, 0.3, `${t.color} y`);
  }
});
check('에너지 ②: the accelerations at speed 100 (carryPreview)', () => {
  const pre = E.carryPreview(chain, E.ENERGY_DEFAULTS[2] as Parameters<typeof E.carryPreview>[1]);
  near(pre[5].aXY, T.E2_ACC100.wetPack, 0.02, 'wet pack');
  near(pre[E.FULL_CAN].aXY, T.E2_ACC100.fullCan, 0.02, 'full can');
  near(pre[4].aXY, T.E2_ACC100.dryPack, 0.02, 'dry pack');
});
check('에너지 ③: the blobs the camera finds, and the program’s own order', () => {
  const list = E.ENERGY_ITEMS[3];
  const seen = E.findItems(E.sortPicture(list), E.VISION_FIX, list).found.slice().sort((a, b) => a.k - b.k);
  assert.deepEqual(
    seen.map((f) => f.kind),
    T.E3_SEEN.kinds,
  );
  seen.forEach((f, i) => near(f.areaMm, T.E3_SEEN.areas[i], 1, `${f.kind} area`));
  assert.deepEqual(
    E.pickOrder(seen, 'visible').map((f) => f.k),
    T.pyTask('energy', 3).cases[0].expected,
  );
});

/* --- grading in Python ------------------------------------------------------------------------- */

const judge = (t: Task, calls: Call[]) => t.cases.map((c, i) => T.checkCall(c, calls[i] ?? {}));

console.log('채점 (Pyodide — 페이지와 같은 채점기)');
const { loadPyodide } = await import('pyodide');
const py = (await loadPyodide()) as unknown as Parameters<typeof gradeScript>[0];
const grade = (t: Task, code: string) => gradeScript(py, code, t.fn, t.cases.map((c) => c.args) as unknown[][]);
check('every model solution passes every case', () => {
  for (const t of TASKS) {
    const g = grade(t, PY_SOLUTIONS[t.lab][t.prob]);
    assert.ok(!g.error && !g.missing, `${t.lab} ${t.prob}: ${JSON.stringify(g.error)}`);
    judge(t, g.calls).forEach((v, i) => assert.ok(v.ok, `${t.lab} ${t.prob} ${t.cases[i].note}: got ${v.got}, expected ${T.fmtValue(t.cases[i].expected)} ${v.why ?? ''}`));
  }
});
check('every starter runs, defines its function and passes no case', () => {
  for (const t of TASKS) {
    const g = grade(t, t.starter);
    assert.ok(!g.error && !g.missing, `${t.lab} ${t.prob}: ${JSON.stringify(g.error)}`);
    judge(t, g.calls).forEach((v, i) => {
      assert.ok(!v.ok, `${t.lab} ${t.prob} ${t.cases[i].note}: the starter passes`);
      if (t.cases[i].expected !== null) assert.match(v.why ?? '', /return/, `${t.lab} ${t.prob}: says the value is missing`);
    });
  }
});
check('near misses fail: a unit left out, degrees for radians, the box’s half length forgotten, no tie-break', () => {
  const miss = (lab: (typeof LABS)[number], p: 1 | 2 | 3, from: string, to: string) => {
    const t = T.pyTask(lab, p);
    const code = PY_SOLUTIONS[lab][p];
    assert.ok(code.includes(from), `${lab} ${p}: ${from}`);
    const g = grade(t, code.replace(from, to));
    assert.ok(judge(t, g.calls).some((v) => !v.ok), `${lab} ${p}: ${to} still passes`);
  };
  miss('cafe', 1, 'acc_m_s2 * 1000', 'acc_m_s2');
  miss('bio', 1, 'math.radians(rx), math.radians(ry), math.radians(rz)', 'rx, ry, rz');
  miss('factory', 3, 'SENSOR_Y + HALF_LEN - wait_y', 'SENSOR_Y - wait_y');
  miss('energy', 3, '(-ratio[i], -areas[i])', '-areas[i]');
});
check('errors come back in plain words with the line: syntax, inside the function, a missing name, a wrong type', () => {
  const t = T.pyTask('factory', 3);
  const syn = grade(t, 'def catch_plan(belt_mm_s, wait_y, down_s)\n    return 1\n');
  assert.equal(syn.error?.type, 'SyntaxError');
  assert.equal(syn.error?.line, 1);
  assert.ok(syn.error?.hint && syn.error.last.includes('SyntaxError'), JSON.stringify(syn.error));
  const zero = grade(t, 'def catch_plan(belt_mm_s, wait_y, down_s):\n    x = 1 / 0\n    return x\n');
  assert.ok(zero.calls.every((c) => c.error?.type === 'ZeroDivisionError' && c.error.line === 2), JSON.stringify(zero.calls[0]));
  assert.match(T.checkCall(t.cases[0], zero.calls[0]).why ?? '', /2번째 줄/);
  assert.ok(grade(t, 'def plan(a, b, c):\n    return 0\n').missing, 'missing function');
  const one = grade(t, 'def catch_plan(belt_mm_s, wait_y, down_s):\n    return 1.69\n');
  assert.match(T.checkCall(t.cases[0], one.calls[0]).why ?? '', /묶어/);
  const mod = grade(t, 'import numpy\n');
  assert.equal(mod.error?.type, 'ModuleNotFoundError');
  assert.match(mod.error?.hint ?? '', /math/);
});
check('print output is kept, and a long one is cut', () => {
  const t = T.pyTask('factory', 2);
  assert.equal(grade(t, 'print("hi")\ndef max_sensor_y(a, b):\n    return 0\n').output, 'hi\n');
  const long = grade(t, 'for i in range(5000):\n    print(i)\ndef max_sensor_y(a, b):\n    return 0\n').output;
  assert.ok(long.length < 4200 && long.includes('줄였어요'), `${long.length}`);
});
check('one run does not leak into the next (a fresh namespace each time)', () => {
  const t = T.pyTask('factory', 2);
  grade(t, 'LEAK = 5\ndef max_sensor_y(a, b):\n    return LEAK\n');
  const g = grade(t, 'def max_sensor_y(a, b):\n    return LEAK\n');
  assert.equal(g.calls[0].error?.type, 'NameError');
});

console.log('채점 (CPython — python3 -I)');
const has = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (has.status !== 0) console.log('  - python3 is not installed: skipped');
else
  check('every model solution passes and every starter fails under CPython too', () => {
    const dir = mkdtempSync(join(process.env.PYTASK_TMP ?? tmpdir(), 'pytask-'));
    try {
      const jobs = TASKS.flatMap((t) => [PY_SOLUTIONS[t.lab][t.prob], t.starter].map((code) => ({ code, fn: t.fn, cases: JSON.stringify(t.cases.map((c) => c.args)) })));
      writeFileSync(join(dir, 'jobs.json'), JSON.stringify(jobs));
      writeFileSync(join(dir, 'grade.py'), `${GRADE_PY}\nimport sys\nfor _j in _pt_json.load(open(sys.argv[1], encoding="utf-8")):\n    print(_pt_main(_j["code"], _j["fn"], _j["cases"]))\n`);
      const run = spawnSync('python3', ['-I', join(dir, 'grade.py'), join(dir, 'jobs.json')], { cwd: dir, encoding: 'utf8', timeout: 60000 });
      assert.equal(run.status, 0, run.stderr);
      const out = run.stdout.trim().split('\n').map((l) => JSON.parse(l) as { error?: unknown; missing?: boolean; calls: Call[] });
      TASKS.forEach((t, k) => {
        const [sol, start] = [out[2 * k], out[2 * k + 1]];
        assert.ok(!sol.error && !sol.missing, `${t.lab} ${t.prob}: ${JSON.stringify(sol.error)}`);
        judge(t, sol.calls).forEach((v, i) => assert.ok(v.ok, `${t.lab} ${t.prob} ${t.cases[i].note}: got ${v.got}`));
        assert.ok(!start.error && judge(t, start.calls).every((v) => !v.ok), `${t.lab} ${t.prob}: the starter`);
      });
      return run.stdout.split('\n').length - 1 + ' runs, ' + has.stdout.trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall pytask checks passed');
