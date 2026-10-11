/**
 * Checks for 반 결과 모으기 (src/engine/education/classReport.ts):
 *
 *  - a report built from a fake store: 차시, solved problems, runs per problem (sim · robot · passes),
 *    hints and stars where kept, the 마무리 평가 score, the name (typed, else the 평가 sheet's);
 *  - an empty or broken store gives an empty report, not an error;
 *  - round trip: the exported text parses back to the same report;
 *  - files refused with a reason: not JSON, too big, another kind or version, wrong types, huge or empty
 *    names, unknown keys, prototype keys (__proto__, constructor), a problem twice, counts that disagree;
 *  - the same student twice → the newest file; ordered by 번호;
 *  - CSV: the BOM, Korean headers, a row per student, quoting, and a cell that would be a formula defused;
 *  - the flags: a problem run many times without a pass, many hints.
 *
 * Run with: npm run check:class
 */
import assert from 'node:assert/strict';

const C = await import('../../src/engine/education/classReport');
const { FINAL_ITEMS } = await import('../../src/engine/education/lab/final');
type Report = import('../../src/engine/education/classReport').StudentReport;

const T0 = Date.UTC(2026, 9, 11, 5, 0);
const fakeStore = (kv: Record<string, unknown>) => (k: string) => (k in kv ? (typeof kv[k] === 'string' ? (kv[k] as string) : JSON.stringify(kv[k])) : null);
const run = (lab: string, problem: number, pass: boolean, source: 'sim' | 'robot' = 'sim') => ({ t: T0, lab, problem, pass, durationS: 3, values: {}, checks: [], source });

/* --- building ------------------------------------------------------------------------------------- */
const item0 = FINAL_ITEMS[0];
const store = fakeStore({
  'student-name': '  김\t민준 ',
  'student-no': '7',
  'learn-level': '"uni"', // as LearnView writes it (JSON)
  'learn-done': { '1-1': true, '1-2': true, '2-1': true, 'x-9': true, '1-3': false },
  'lab-solved': { 1: true, 2: true },
  'lab-solved-bio': { 1: true },
  'lab-runs': [run('factory', 1, false), run('factory', 1, true), run('factory', 2, true), run('factory', 2, true, 'robot'), run('bio', 1, true), { junk: 1 }, null],
  'lab-effort': { factory: { 1: { hints: 2, stars: 2 }, 2: { hints: 9, stars: 3 } } },
  'final-exam': { name: '다른이름', records: { [item0.id]: { picks: [item0.causes.findIndex((c) => c.ok)], calcChecks: [true], hints: 1, runs: 2, pass: true, last: '', done: true } } },
});
const r = C.buildReport(store, T0);
assert.equal(r.kind, C.REPORT_KIND);
assert.equal(r.name, '김 민준', 'controls out, spaces squeezed');
assert.equal(r.no, '7');
assert.equal(r.level, 'uni');
assert.deepEqual(r.theory, ['1-1', '1-2', '2-1'], 'known 차시 only, course order');
assert.equal(r.problems.length, C.PROBLEMS_OF);
assert.equal(C.PROBLEMS_OF, 21);
assert.equal(C.THEORY_OF, 28);
const f1 = r.problems.find((p) => p.lab === 'factory' && p.problem === 1)!;
const f2 = r.problems.find((p) => p.lab === 'factory' && p.problem === 2)!;
assert.deepEqual([f1.solved, f1.runs, f1.passes, f1.robot, f1.hints, f1.stars], [true, 2, 1, 0, 2, 2]);
assert.deepEqual([f2.runs, f2.passes, f2.robot, f2.hints, f2.stars], [1, 1, 1, null, 3], 'a hint count above 3 is not kept');
assert.equal(r.problems.find((p) => p.lab === 'bio' && p.problem === 1)!.solved, true);
assert.equal(r.problems.filter((p) => p.solved).length, 3);
assert.deepEqual(r.runs, { sim: 4, robot: 1, passes: 3 });
assert.ok(r.final, 'the 마무리 평가 is started');
assert.equal(r.final!.done, 1);
assert.equal(r.final!.hints, 1);
assert.equal(r.final!.score, Math.round((9 * 100) / (FINAL_ITEMS.length * 10)), '원인 4 + 계산 3 + 고치기 3 − 힌트 1');
// The name from the 평가 sheet when none was typed.
assert.equal(C.buildReport(fakeStore({ 'final-exam': { name: '이서연', records: {} } }), T0).name, '이서연');
console.log('  ✓ a report from a fake store: 차시, problems, runs, hints · stars, 마무리 평가, name');

const empty = C.buildReport(fakeStore({ 'learn-done': '{broken', 'lab-runs': '"no"', 'final-exam': 7 }), T0);
assert.deepEqual([empty.name, empty.theory.length, empty.runs.sim, empty.final], ['', 0, 0, null]);
assert.ok(empty.problems.every((p) => !p.solved && p.hints === null));
const throwing = C.buildReport(() => {
  throw new Error('blocked');
}, T0);
assert.equal(throwing.theory.length, 0);
console.log('  ✓ an empty or broken store: an empty report, no error');

/* --- round trip ---------------------------------------------------------------------------------- */
const text = C.reportText(r);
const back = C.parseReport(text);
assert.ok(back.ok, back.ok ? '' : back.reason);
assert.deepEqual(back.report, r);
assert.ok(C.parseReport(`﻿${text}`).ok, 'a BOM in front is fine');
assert.equal(C.reportFileName(r), '김 민준-로봇시티-결과.json');
assert.equal(C.reportFileName({ name: '../a/b:c' }), 'abc-로봇시티-결과.json');
assert.equal(C.reportFileName({ name: '' }), '이름없음-로봇시티-결과.json');
console.log('  ✓ export → parse gives the same report; a safe file name');

/* --- refused ------------------------------------------------------------------------------------- */
const json = (): Record<string, unknown> => JSON.parse(text);
const refuse = (t: string, why: string) => {
  const p = C.parseReport(t);
  assert.ok(!p.ok, `refused: ${why}`);
  assert.ok(p.reason.length > 0 && p.reason.length < 80, `a short reason: ${why}`);
};
const edit = (fn: (x: Record<string, unknown>) => void, why: string) => {
  const x = json();
  fn(x);
  refuse(JSON.stringify(x), why);
};
refuse('', 'empty');
refuse('not json', 'not JSON');
refuse('[]', 'an array');
refuse('null', 'null');
refuse('"text"', 'a string');
refuse(' '.repeat(C.MAX_FILE_CHARS + 1), 'too big');
refuse(text.replace('"name": "김 민준"', `"name": "${'가'.repeat(100_000)}"`), 'a huge name (file too big)');
edit((x) => (x.kind = 'other'), 'another kind');
edit((x) => (x.version = 2), 'another version');
edit((x) => (x.name = 'a'.repeat(C.MAX_NAME + 1)), 'a long name');
edit((x) => (x.name = '   '), 'an empty name');
edit((x) => (x.name = 42), 'a number for a name');
edit((x) => (x.no = { a: 1 }), 'an object for 번호');
edit((x) => (x.exportedAt = 'today'), 'a string for the time');
edit((x) => (x.exportedAt = 9e15), 'a far-off time');
edit((x) => (x.level = 'phd'), 'an unknown level');
edit((x) => (x.theory = ['1-1', '1-1']), 'a 차시 twice');
edit((x) => (x.theory = ['<script>']), 'an unknown 차시');
edit((x) => (x.theory = 'all'), 'theory not a list');
edit((x) => (x.problems = (x.problems as unknown[]).slice(1)), 'a problem missing');
edit((x) => ((x.problems as Record<string, unknown>[])[1] = (x.problems as unknown[])[0] as Record<string, unknown>), 'a problem twice');
edit((x) => ((x.problems as Record<string, unknown>[])[0].runs = -1), 'a negative count');
edit((x) => ((x.problems as Record<string, unknown>[])[0].runs = 1.5), 'a fraction');
edit((x) => ((x.problems as Record<string, unknown>[])[0].passes = 99), 'more passes than runs');
edit((x) => ((x.problems as Record<string, unknown>[])[0].solved = 'yes'), 'a string for solved');
edit((x) => ((x.problems as Record<string, unknown>[])[0].hints = 4), 'more than three hints');
edit((x) => ((x.problems as Record<string, unknown>[])[0].lab = 'moon'), 'an unknown lab');
edit((x) => ((x.problems as Record<string, unknown>[])[0].extra = 1), 'an unknown key in a problem');
edit((x) => (x.extra = 1), 'an unknown key');
edit((x) => ((x.final as Record<string, unknown>).score = 101), 'a score above 100');
edit((x) => ((x.final as Record<string, unknown>).grade = 'S'), 'an unknown grade');
edit((x) => ((x.runs as Record<string, unknown>).sim = 999), 'totals that disagree');
// Prototype keys, as JSON.parse keeps them (own properties named __proto__ / constructor).
refuse(text.replace('{', '{"__proto__": {"polluted": true},'), '__proto__ at the top');
refuse(text.replace('"lab": "factory"', '"constructor": {"prototype": {}}, "lab": "factory"'), 'constructor in a problem');
refuse(text.replace('"final": {', '"final": {"__proto__": null, '), '__proto__ in the 평가');
assert.equal(({} as Record<string, unknown>).polluted, undefined, 'nothing polluted');
// A huge but well-formed list (cap on the list, not only the text).
edit((x) => (x.theory = Array.from({ length: 40 }, (_, i) => `1-${i}`)), 'a long 차시 list');
console.log('  ✓ refused with a reason: not JSON, too big, wrong kind · version · types, unknown and prototype keys, bad counts');

/* --- merge --------------------------------------------------------------------------------------- */
const mk = (name: string, no: string, at: number, theory = 0): Report => ({ ...C.buildReport(fakeStore({ 'student-name': name, 'student-no': no }), at), theory: (r.theory as string[]).slice(0, theory) as Report['theory'] });
const merged = C.mergeReports([mk('김민준', '7', T0, 1), mk('이서연', '3', T0), mk('김 민준', '7', T0 + 60_000, 3), mk('김민준', '7', T0 - 60_000, 2), mk('박지우', '', T0)]);
assert.deepEqual(
  merged.map((x) => [x.name, x.no]),
  [
    ['이서연', '3'],
    ['김 민준', '7'],
    ['박지우', ''],
  ],
  'by 번호; one row per student',
);
assert.equal(merged[1].theory.length, 3, 'the newest file wins');
assert.equal(C.mergeReports([mk('김민준', '7', T0), mk('김민준', '8', T0)]).length, 2, 'same name, another 번호: two students');
console.log('  ✓ merge: the same 이름 + 번호 → the newest file; ordered by 번호');

/* --- CSV ------------------------------------------------------------------------------------------- */
assert.equal(C.csvCell('plain'), 'plain');
assert.equal(C.csvCell(12), '12');
assert.equal(C.csvCell(null), '');
assert.equal(C.csvCell('a,b'), '"a,b"');
assert.equal(C.csvCell('say "hi"'), '"say ""hi"""');
assert.equal(C.csvCell('two\nlines'), '"two\nlines"');
assert.equal(C.csvCell('=1+1'), "'=1+1");
assert.equal(C.csvCell('+82'), "'+82");
assert.equal(C.csvCell('-2'), "'-2");
assert.equal(C.csvCell('@SUM(A1)'), "'@SUM(A1)");
assert.equal(C.csvCell('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
const csv = C.classCsv([r, mk('=cmd|calc', '1', T0), mk('홍, "길동"', '2', T0)]);
assert.ok(csv.startsWith('﻿이름,번호,과정,이론 차시 (/28),현장 문제 (/21),별 합,힌트 합,다시 가동 합,마무리 평가 점수,마무리 평가 등급,실물 실행 수,내보낸 때,살펴볼 점\r\n'), 'BOM and Korean headers');
const lines = csv.slice(1).trimEnd().split('\r\n');
assert.equal(lines.length, 4, 'a header and a row per student');
assert.ok(lines[1].startsWith("'=cmd|calc,1,"), 'a formula name defused');
assert.ok(lines[2].startsWith('"홍, ""길동""",2,'), 'a name with a comma and quotes, quoted');
assert.match(lines[3], /^김 민준,7,대학,3,3,5,2,4,13,E,1,\d{4}-\d{2}-\d{2} \d{2}:\d{2},/, 'the student’s numbers');
console.log('  ✓ CSV: BOM, Korean headers, a row per student, quoting, formula cells defused');

/* --- flags --------------------------------------------------------------------------------------- */
const stuckRuns = Array.from({ length: C.STUCK_RUNS }, () => run('farm', 2, false));
const stuck = C.buildReport(fakeStore({ 'lab-runs': stuckRuns, 'lab-effort': { ai: { 1: { hints: 3 }, 2: { hints: 3 }, 3: { hints: 3 } } } }), T0);
const flags = C.flagsOf(stuck);
assert.equal(flags.length, 2);
assert.match(flags[0], /스마트팜 2번 6번 실행/);
assert.match(flags[1], /힌트 9번/);
assert.deepEqual(C.flagsOf(r), [], 'on track: nothing to look at');
assert.deepEqual(C.flagsOf(C.buildReport(fakeStore({ 'lab-runs': stuckRuns.slice(1) }), T0)), [], 'fewer runs: not yet');
console.log('  ✓ flags: a problem run many times without a pass, many hints');

console.log('class-check: all passed');
