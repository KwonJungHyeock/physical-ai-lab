/**
 * Checks for the 디지털 트윈 관제센터's data science (src/engine/education/dataScience.ts):
 *
 *  - mean · median · sample standard deviation against values worked by hand;
 *  - the least-squares line and Pearson r on known lines and a small worked example, and the plain-Korean reading;
 *  - histogram bins, round axis ticks, the numbers read out of check values ("최대 4.2 mm", "3 / 4개");
 *  - summaries (pass rate, tries to the first pass per student), the 병목;
 *  - the twin: a robot run pairs with the simulator run of the same lab, problem and values — also a run
 *    written down in a lab's 실제 로봇 결과 적기 (the logged simulator run's values, bare numbers typed);
 *  - CSV: cells with commas, quotes and line breaks are quoted, and the file reads back;
 *  - the example class: the same seed gives the same records, it looks like a class, and the three questions have answers.
 *
 * Run with: npm run check:data
 */
import assert from 'node:assert/strict';

const D = await import('../../src/engine/education/dataScience');
type Rec = import('../../src/engine/education/dataScience').DataRecord;

const near = (a: number, b: number, tol = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≠ ${b}`);

/* --- statistics ------------------------------------------------------------------------------- */
// [2, 4, 4, 4, 5, 5, 7, 9]: mean 5; median (4 + 5) / 2; squared deviations 9+1+1+1+0+0+4+16 = 32, ÷ 7 → s = √(32/7).
const xs = [2, 4, 4, 4, 5, 5, 7, 9];
near(D.mean(xs), 5);
near(D.median(xs), 4.5);
near(D.std(xs), Math.sqrt(32 / 7));
near(D.median([3, 1, 2]), 2);
near(D.mean([1, NaN, 3]), 2, 1e-12, 'NaN left out');
assert.ok(Number.isNaN(D.mean([])));
assert.equal(D.std([7]), 0);
const sp = D.spread([3, 1, 2, NaN]);
assert.deepEqual([sp.n, sp.min, sp.max], [3, 1, 3]);
console.log('  ✓ mean, median, sample standard deviation (worked by hand)');

/* --- regression --------------------------------------------------------------------------------- */
const line = (f: (x: number) => number) => [0, 1, 2, 3, 4].map((x) => ({ x, y: f(x) }));
let fit = D.regression(line((x) => 2 * x + 1))!;
near(fit.slope, 2);
near(fit.intercept, 1);
near(fit.r!, 1);
fit = D.regression(line((x) => -0.5 * x + 3))!;
near(fit.slope, -0.5);
near(fit.intercept, 3);
near(fit.r!, -1);
// x 1…5, y 2 4 5 4 5: Sxy = 6, Sxx = 10, Syy = 6 → slope 0.6, intercept 4 − 0.6·3 = 2.2, r = 6 / √60.
fit = D.regression([1, 2, 3, 4, 5].map((x, i) => ({ x, y: [2, 4, 5, 4, 5][i] })))!;
near(fit.slope, 0.6, 1e-12);
near(fit.intercept, 2.2, 1e-12);
near(fit.r!, 6 / Math.sqrt(60), 1e-12);
assert.equal(D.regression([{ x: 1, y: 2 }]), null, 'one point');
assert.equal(D.regression([1, 1, 1].map((x, i) => ({ x, y: i }))), null, 'x never changes');
assert.equal(D.regression(line(() => 3))!.r, null, 'y never changes: no r');
console.log('  ✓ least-squares line and Pearson r: y = 2x + 1, y = −0.5x + 3, a worked example, degenerate cases');

const speed: import('../../src/engine/education/dataScience').Column = { key: 'v:carry', name: '운반 속도', unit: '%', kind: 'value' };
const pass: import('../../src/engine/education/dataScience').Column = { key: 'pass', name: '성공', unit: '', kind: 'run', binary: true };
const gap: import('../../src/engine/education/dataScience').Column = { key: 'c:x', name: '놓인 자리 오차', unit: 'mm', kind: 'check' };
assert.equal(D.describeR({ n: 20, slope: -0.01, intercept: 1, r: -0.82 }, speed, pass), '운반 속도가 빠를수록 실패가 늘어요 (r = −0.82 · 강한 관계)');
assert.equal(D.describeR({ n: 20, slope: 0.01, intercept: 1, r: 0.5 }, speed, pass), '운반 속도가 빠를수록 성공이 늘어요 (r = 0.50 · 보통 관계)');
assert.match(D.describeR({ n: 20, slope: 0, intercept: 1, r: 0.05 }, speed, gap), /^운반 속도와 놓인 자리 오차는 거의 관계가 없어요/);
assert.match(
  D.describeR({ n: 20, slope: 1, intercept: 1, r: 0.6 }, { ...speed, name: 'J1 각도', unit: '°' }, gap),
  /^J1 각도가 클수록 놓인 자리 오차도 커져요/,
);
assert.match(D.describeR(null, speed, pass), /어려워요/);
assert.equal(D.josa('스마트팜', '은', '는'), '스마트팜은');
assert.equal(D.josa('물류 허브', '은', '는'), '물류 허브는');
assert.equal(D.josa('J1', '이', '가'), 'J1이');
console.log('  ✓ the reading in plain Korean (direction, strength, particles)');

/* --- histogram, ticks, check numbers --------------------------------------------------------------- */
// 1 · 2 2 · 3 3 3 · 10: span 9 → step 2 from 0 → [0,2) [2,4) [4,6) [6,8) [8,10].
const h = D.histogram([1, 2, 2, 3, 3, 3, 10]);
assert.deepEqual([h.lo, h.step, h.counts], [0, 2, [1, 5, 0, 0, 1]]);
assert.equal(h.n, 7);
const h1 = D.histogram([4, 4, 4]);
assert.equal(
  h1.counts.reduce((a, b) => a + b, 0),
  3,
  'all the same: one bin holds them',
);
assert.deepEqual(D.histogram([NaN]).counts, []);
assert.deepEqual(D.niceTicks(0.3, 9.7, 5).ticks, [0, 2, 4, 6, 8, 10]);
assert.deepEqual(D.niceTicks(-0.25, 0.9, 4).ticks, [-0.5, 0, 0.5, 1]); // span 1.15 ÷ 4 ≈ 0.29 → step 0.5
assert.equal(D.niceStep(0.12, 5), 0.025);
assert.deepEqual(D.parseCheckNumber('최대 4.2 mm'), { n: 4.2, unit: 'mm' });
assert.deepEqual(D.parseCheckNumber('3 / 4'), { n: 3, unit: '' });
assert.deepEqual(D.parseCheckNumber('3 / 4개'), { n: 3, unit: '개' });
assert.deepEqual(D.parseCheckNumber('최대 23% (2.0 m/s²)'), { n: 23, unit: '%' });
assert.deepEqual(D.parseCheckNumber('최대 0.92 N·m'), { n: 0.92, unit: 'N·m' });
assert.deepEqual(D.parseCheckNumber('110 mm/s로 닿음'), { n: 110, unit: 'mm/s' });
assert.deepEqual(D.parseCheckNumber('최대 12.5°'), { n: 12.5, unit: '°' });
assert.deepEqual(D.parseCheckNumber('-1.5 mm'), { n: -1.5, unit: 'mm' });
assert.equal(D.parseCheckNumber('없음'), null);
assert.equal(D.parseCheckNumber('했어요'), null);
assert.equal(D.fmtNum(59, 1), '59.0');
assert.equal(D.fmtNum(-1.5), '−1.5');
assert.equal(D.fmtNum(-0.001, 2), '0.00');
assert.equal(D.fmtNum(NaN), '—');
console.log('  ✓ histogram bins, round ticks, numbers read out of check values');

/* --- records ------------------------------------------------------------------------------------- */
const T = Date.UTC(2026, 8, 14);
let k = 0;
const rec = (o: Partial<Rec> & Pick<Rec, 'lab'>): Rec => ({
  t: T + 1000 * k++,
  problem: 1,
  pass: false,
  durationS: 10,
  values: {},
  checks: [],
  source: 'sim',
  ...o,
});

// Student A: fail, fail, pass (3rd); student B: pass at once (1st); student C: fails twice. → tries mean 2, one not yet.
const runs: Rec[] = [
  rec({ lab: 'cafe', who: 'A', durationS: 2, values: { speed: 300 } }),
  rec({ lab: 'cafe', who: 'B', durationS: 3, pass: true, values: { speed: 200 } }),
  rec({ lab: 'cafe', who: 'A', durationS: 4, values: { speed: 280 } }),
  rec({ lab: 'cafe', who: 'C', durationS: 5, values: { speed: 290 } }),
  rec({ lab: 'cafe', who: 'A', durationS: 6, pass: true, values: { speed: 220 } }),
  rec({ lab: 'cafe', who: 'C', durationS: NaN, values: { speed: 310 } }),
];
const s = D.summarize(runs);
assert.equal(s.runs, 6);
assert.equal(s.passes, 2);
near(s.passRate, 1 / 3);
near(s.triesToPass!, 2, 1e-12, 'tries: (3 + 1) / 2');
assert.equal(s.notYet, 1);
assert.equal(s.duration.n, 5, 'the run without a job time is left out');
near(s.duration.mean, 4);
near(s.duration.median, 4);
assert.equal(s.latest, runs[5]);
// One browser (no `who`): fail, pass → the first pass on the 2nd run.
assert.equal(D.summarize([rec({ lab: 'bio' }), rec({ lab: 'bio', pass: true }), rec({ lab: 'bio' })]).triesToPass, 2);
console.log('  ✓ summary: pass rate, job time without the missing one, tries to the first pass per student');

const cols = D.columnsOf([
  rec({
    lab: 'cafe',
    values: { speed: 250, acc: 4, mode: 'x', on: true },
    checks: [
      { label: '옮기는 시간 2.5 s 안', ok: true, value: '2.10 s' },
      { label: '픽업 자리에 놓음', ok: true, value: '했어요' },
    ],
  }),
]);
assert.deepEqual(
  cols.map((c) => [c.key, c.name, c.unit]),
  [
    ['v:speed', '최고 속도', 'mm/s'],
    ['v:acc', '가속도', 'm/s²'],
    ['v:on', 'on', ''],
    ['c:옮기는 시간 2.5 s 안', '걸린 시간', 's'],
    ['durationS', '작업 시간', 's'],
    ['pass', '성공', ''],
  ],
);
const pts = D.scatter(runs, 'v:speed', 'durationS');
assert.equal(pts.length, 5, 'the run without a job time has no point');
console.log('  ✓ numeric columns (values, check numbers, job time, pass) and scatter points');

const neck = D.bottleneck([
  ...[1, 2, 3].map(() => rec({ lab: 'factory', durationS: 10, pass: true })),
  ...[1, 2, 3].map((i) => rec({ lab: 'logistics', durationS: 60, pass: i === 1 })),
  ...[1, 2, 3].map((i) => rec({ lab: 'cafe', durationS: 3, pass: i !== 1, problem: 2 })),
  rec({ lab: 'ai', durationS: 99 }), // too few runs to count
  rec({ lab: 'factory', durationS: 999, source: 'robot' }), // robot runs are not the class's attempts
]);
assert.equal(neck.slowest?.lab, 'logistics');
assert.equal(neck.weakest?.lab, 'logistics');
assert.deepEqual(
  neck.labs.map((l) => l.lab),
  ['factory', 'logistics', 'cafe'],
);
assert.equal(neck.hardest?.lab, 'logistics');
console.log('  ✓ 병목: the slowest lab, the weakest, labs with too few runs and robot runs left out');

/* --- twin ------------------------------------------------------------------------------------------ */
const mm = (x: number) => [{ label: '놓인 자리가 5 mm 안', ok: x <= 5, value: `최대 ${x.toFixed(1)} mm` }];
const simA = rec({ lab: 'bio', problem: 2, who: 'A', values: { zero: 1 }, durationS: 30, pass: true, checks: mm(0.4) });
const simB = rec({ lab: 'bio', problem: 2, who: 'A', values: { zero: 0.9 }, durationS: 30, pass: true, checks: mm(0.8) });
const robB = rec({ lab: 'bio', problem: 2, who: 'A', values: { zero: 0.9 }, durationS: 32.5, pass: true, checks: mm(2.3), source: 'robot' });
const robA = rec({ lab: 'bio', problem: 2, who: 'A', values: { zero: 1 }, durationS: 31, pass: true, checks: mm(1.4), source: 'robot' });
const robX = rec({ lab: 'bio', problem: 2, who: 'A', values: { zero: 1.2 }, durationS: 31, pass: false, checks: mm(6), source: 'robot' });
const robOther = rec({ lab: 'bio', problem: 2, who: 'B', values: { zero: 1 }, durationS: 31, pass: true, checks: mm(1), source: 'robot' });
// A robot run before its simulator run pairs with the first one after.
const robEarly = rec({ lab: 'farm', problem: 2, values: { ratio: 0.83 }, durationS: 31, pass: false, checks: mm(5.5), source: 'robot', t: T - 1000 });
const simLate = rec({ lab: 'farm', problem: 2, values: { ratio: 0.83 }, durationS: 30, pass: true, checks: mm(3), t: T + 1e6 });
const pairs = D.pairTwin([simA, simB, robB, robA, robX, robOther, robEarly, simLate]);
assert.equal(pairs.length, 3, 'robX (no such values) and robOther (another student) stay unpaired');
const pB = pairs.find((p) => p.robot === robB)!;
assert.equal(pB.sim, simB, 'same values → simB, not the other simulator run');
near(pB.dDuration!, 2.5);
assert.deepEqual(pB.checks, [{ label: '놓인 자리가 5 mm 안', unit: 'mm', sim: 0.8, robot: 2.3, diff: 1.5 }]);
assert.equal(pairs.find((p) => p.robot === robA)!.sim, simA);
assert.equal(pairs.find((p) => p.robot === robEarly)!.sim, simLate);
const tw = D.twinSummary(pairs);
// |2.3 − 0.8| = 1.5, |1.4 − 0.4| = 1.0, |5.5 − 3| = 2.5 → MAE 5 / 3; durations +2.5, +1, +1.
near(tw.mmMae!, 5 / 3, 1e-9);
near(tw.durationBias, 4.5 / 3, 1e-9);
near(tw.passAgree, 2 / 3, 1e-12);
assert.ok(D.sameValues({ a: 1, b: 'x', c: true }, { c: true, b: 'x', a: 1 }));
assert.ok(!D.sameValues({ a: 1 }, { a: 1, b: 2 }));
assert.ok(!D.sameValues({ a: 1 }, { a: 1.01 }));
console.log('  ✓ twin: robot runs pair by lab, problem, student and values; differences and mean absolute error');

/* --- CSV ------------------------------------------------------------------------------------------- */
assert.equal(D.csvCell('plain'), 'plain');
assert.equal(D.csvCell('a,b'), '"a,b"');
assert.equal(D.csvCell('say "hi"'), '"say ""hi"""');
assert.equal(D.csvCell('two\nlines'), '"two\nlines"');
assert.equal(D.csvCell(' edge'), '" edge"');
assert.equal(D.csvCell(NaN), '');
assert.equal(D.csvCell(null), '');
assert.equal(D.csvCell(2.5), '2.5');

/** A small RFC 4180 reader, to read the file back. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return rows;
}
const tricky = rec({
  lab: 'cafe',
  problem: 2,
  values: { note: 'a, "b"\nc', zoneSpeed: 100 },
  checks: [{ label: '손님에게 건넴', ok: true, value: '했어요, 바로' }],
  pass: true,
});
const csv = D.toCsv([tricky, runs[0]]);
const back = readCsv(csv);
assert.equal(back.length, 3, 'header and two rows');
assert.ok(
  back.every((r) => r.length === back[0].length),
  'every row has every column',
);
const col = (name: string) => back[0].indexOf(name);
assert.equal(back[2][col('값: note')], 'a, "b"\nc', 'the tricky value reads back as it was');
assert.equal(back[2][col('손님에게 건넴 — 값')], '했어요, 바로');
assert.equal(back[2][col('성공')], 'O');
assert.equal(back[1][col('작업 시간 (s)')], '2');
assert.equal(back[1][col('학생')], 'A');
console.log('  ✓ CSV: commas, quotes, line breaks quoted; the file reads back cell for cell');

/* --- the example class ------------------------------------------------------------------------------- */
const demo = D.demoRuns(7);
assert.equal(JSON.stringify(D.demoRuns(7)), JSON.stringify(demo), 'same seed, same class');
assert.notEqual(JSON.stringify(D.demoRuns(8)), JSON.stringify(demo), 'another seed, another class');
assert.ok(demo.length > 600, `${demo.length} runs`);
assert.ok(
  demo.every((r, i) => i === 0 || r.t >= demo[i - 1].t),
  'oldest first',
);
assert.ok(
  demo.every((r) => r.who?.startsWith('예시 ')),
  'every record is marked as the example',
);
assert.equal(new Set(demo.map((r) => r.who)).size, D.DEMO_STUDENTS);
assert.ok(demo.every((r) => (D.RUN_LABS as readonly string[]).includes(r.lab) && [1, 2, 3].includes(r.problem) && Number.isFinite(r.durationS)));
const sim = D.simOnly(demo);
const rate = sim.filter((r) => r.pass).length / sim.length;
assert.ok(rate > 0.15 && rate < 0.6, `pass rate ${rate.toFixed(2)}`);
const robots = demo.filter((r) => r.source === 'robot');
assert.ok(robots.length >= 10, `${robots.length} robot runs`);
const dp = D.pairTwin(demo);
assert.equal(dp.length, robots.length, 'every robot run of the example has its simulator run');
const dt = D.twinSummary(dp);
assert.ok(dt.mmMae! > 0.3 && dt.mmMae! < 3, `sim ↔ real ${dt.mmMae} mm`);
assert.ok(dt.durationBias > 0, 'the real robot is a little slower');
for (const lab of ['factory', 'logistics', 'bio', 'farm', 'cafe', 'ai'] as const)
  for (const p of [1, 2, 3])
    assert.ok(
      D.ofProblem(sim, lab, p).some((r) => r.pass),
      `${lab} ${p}: someone passes`,
    );
const qs = D.quizzes(demo);
assert.deepEqual(
  qs.map((q) => q.id),
  ['bottleneck', 'speed', 'twin'],
);
for (const q of qs) assert.ok(q.answer !== null && q.answer >= 0 && q.answer < q.choices.length, `${q.id} has an answer`);
assert.equal(qs[0].choices[qs[0].answer!], D.bottleneck(demo).slowest!.name);
assert.equal(qs[2].answer, D.mmBand(dt.mmMae!));
// No data: the questions say so instead of answering.
assert.ok(D.quizzes([]).every((q) => q.answer === null));
console.log(
  `  ✓ example class: deterministic, ${demo.length} runs of ${D.DEMO_STUDENTS} students, ${robots.length} on the robot, the three questions answered`,
);

/* --- labs ---------------------------------------------------------------------------------------- */
assert.match(D.labInfo('energy').name, /에너지/);
assert.equal(D.labInfo('energy').problems.length, 3);
assert.equal(D.labInfo('somewhere').name, 'somewhere');
assert.ok(D.labOverview([]).every((o) => o.all.runs === 0 && o.spark.length === 0));
assert.deepEqual(D.labsIn([rec({ lab: 'new' as Rec['lab'] })]).slice(-2), ['energy', 'new']);
console.log('  ✓ labs: 에너지·자원순환 and labs not known yet get a label');

/* --- the real robot's results, written down after a lab run (RobotRecord) ------------------------ */
{
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  const L = await import('../../src/engine/education/runLog');
  L.logRun({ lab: 'factory', problem: 2, pass: true, durationS: 7.25, values: { speed: 60, grip: { z: -3.5, wait: 0.4 } }, checks: [{ label: '흡착 위치 오차', ok: true, value: '최대 1.2 mm' }, { label: '옮긴 상자', ok: true, value: '3 / 3개' }] });
  const sim = L.loadRuns().at(-1)!;
  // What the form saves: the simulator run's (flattened) values again, the numbers as typed.
  L.logRun({ lab: sim.lab, problem: sim.problem, pass: false, durationS: 8.5, values: sim.values, checks: sim.checks.map((c, i) => ({ label: c.label, ok: i === 1, value: ['2.9', '3'][i] })), source: 'robot' });
  const all = L.loadRuns();
  assert.equal(all.length, 2);
  assert.deepEqual(all[1].values, all[0].values, 'flattening flat values keeps them');
  const tp = D.pairTwin(all);
  assert.equal(tp.length, 1);
  near(tp[0].dDuration!, 1.25);
  assert.deepEqual(
    tp[0].checks.map((c) => [c.label, c.unit, c.diff]),
    [
      ['흡착 위치 오차', 'mm', 1.7],
      ['옮긴 상자', '개', 0],
    ],
  );
  assert.equal(tp[0].samePass, false);
  delete (globalThis as { localStorage?: unknown }).localStorage;
  console.log('  ✓ a real-robot result written down after a lab run pairs with its simulator run');
}
