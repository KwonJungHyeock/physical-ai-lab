/**
 * 로봇 실습 7 "선생님과 함께": the seven led lessons fit their units (3D steps that exist, questions with
 * one right answer, picks the class server takes), the 기초교육 차시 add up, and the teacher's summary
 * counts the class right (engine/account/lead.ts, the same shapes as desktop-go/classroom/lead.go).
 */

import assert from 'node:assert/strict';

const P = await import('../../src/engine/education/practice7');
const L = await import('../../src/engine/education/lead');
const A = await import('../../src/engine/account/lead');

let n = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  n += 1;
  console.log(`  ✓ ${name}`);
};
const runes = (s: string) => [...s].length;

await ok('one lesson per unit, ids the class server takes', () => {
  assert.deepEqual(L.LESSONS.map((l) => l.unit), [1, 2, 3, 4, 5, 6, 7]);
  for (const l of L.LESSONS) {
    assert.match(l.id, /^[a-z0-9][a-z0-9-]{0,39}$/);
    assert.ok(l.steps.length >= 4 && l.steps.length <= A.LEAD_MAX_STEP + 1, l.id);
  }
});

await ok('every step has its projector, teacher and student text', () => {
  for (const l of L.LESSONS)
    for (const s of l.steps) {
      for (const k of ['name', 'title', 'say', 'doNow', 'ask', 'expect', 'task', 'sub'] as const) assert.ok(s[k].trim(), `${l.id} ${s.name} ${k}`);
      assert.ok(s.script.length >= 1, `${l.id} ${s.name} script`);
      assert.ok(s.min >= 1 && s.min <= 15, `${l.id} ${s.name} min`);
      assert.ok(!/—/.test(JSON.stringify(s)), `${l.id} ${s.name}: no long dash in the text`);
    }
});

await ok("3D steps are the unit's own 따라 하기 steps, each once", () => {
  for (const l of L.LESSONS) {
    const ids = P.UNIT_BY_ID.get(l.unit)!.steps.map((s) => s.id);
    const used = l.steps.flatMap((s) => (s.act.kind === 'sim' ? s.act.steps : []));
    for (const id of used) assert.ok(ids.includes(id), `${l.id}: ${id}`);
    assert.equal(new Set(used).size, used.length, `${l.id}: a step twice`);
    assert.deepEqual([...used].sort(), [...ids].sort(), `${l.id}: every 따라 하기 step is led`);
  }
});

await ok('every lesson ends with a wrap-up and has one real-robot step with three checks', () => {
  for (const l of L.LESSONS) {
    assert.equal(l.steps.at(-1)!.act.kind, 'wrap', l.id);
    const real = l.steps.filter((s) => s.act.kind === 'real');
    assert.equal(real.length, 1, l.id);
    const act = real[0].act as Extract<typeof real[0]['act'], { kind: 'real' }>;
    assert.equal(act.checks.length, 3, l.id);
    assert.ok(act.predict.options.length >= 2, l.id);
  }
});

await ok('questions: one right answer, options short enough to send as an answer', () => {
  for (const l of L.LESSONS)
    for (const s of l.steps) {
      const opts = L.answerOptions(s.act);
      for (const o of opts) assert.ok(runes(o) <= 40, o);
      const q = s.act.kind === 'quiz' ? s.act : s.act.kind === 'wrap' ? s.act.quiz : null;
      if (!q) continue;
      assert.ok(q.answer >= 0 && q.answer < q.options.length, `${l.id} ${s.name}`);
      assert.ok(q.why.trim());
      assert.equal(L.answerRight(s.act, L.pickAnswer(q.answer)), true);
      assert.equal(L.answerRight(s.act, L.pickAnswer((q.answer + 1) % q.options.length)), false);
    }
});

await ok('unit 4: the red block pick and the photo agree', () => {
  const red = L.HAND_PHOTO.blocks.find((b) => b.color === '빨강')!;
  const right = L.RED_CANDIDATES.find((c) => c.key === L.RED_RIGHT)!;
  assert.deepEqual([right.x, right.y], [red.x, red.y]);
  assert.equal(new Set(L.HAND_PHOTO.blocks.map((b) => b.color)).size, 4);
  const pick = L.LESSON_BY_ID.get('p7-4')!.steps.find((s) => s.act.kind === 'pick')!;
  assert.equal(L.answerRight(pick.act, 'B'), true);
  assert.equal(L.answerRight(pick.act, 'A'), false);
  assert.equal(L.answerIndex(pick.act, 'C'), 2);
});

await ok('기초교육 1차시 · 2차시: 50분 안, every unit once, the next lesson follows the 차시', () => {
  const seen = new Set<string>();
  for (const p of L.BASIC_PERIODS) {
    const mins = p.lessons.reduce((s, id) => s + L.lessonMinutes(L.LESSON_BY_ID.get(id)!), 0);
    assert.ok(mins >= 40 && mins <= 50, `${p.name}: ${mins}분`);
    for (const id of p.lessons) {
      assert.ok(!seen.has(id));
      seen.add(id);
    }
  }
  assert.equal(L.nextLesson('p7-1')!.id, 'p7-2');
  assert.equal(L.nextLesson('p7-5')!.id, 'p7-3');
  assert.equal(L.nextLesson('p7-3')!.id, 'p7-7');
  assert.equal(L.nextLesson('p7-4')!.id, 'p7-5');
  assert.equal(L.nextLesson('p7-7'), null);
});

/* --- the teacher's summary ---------------------------------------------------------------------- */

const lead = { lesson: 'p7-4', step: 4, gate: false, reveal: false, stop: 0, rev: 3, at: 0, since: 0 };
const mark = (no: number, m: Partial<import('../../src/engine/account/lead').Mark>) => ({ ...A.emptyMark(), no, at: 0, lesson: 'p7-4', step: 4, ...m });

await ok('summary: done, help, still at it, answers of this step only', () => {
  const marks = [
    mark(1, { group: 1, role: 'robot', done: true, robot: 'done', result: '4개 옮김' }),
    mark(2, { group: 1, role: 'screen', done: true, answer: '4' }),
    mark(3, { group: 1, role: 'screen', answer: '3' }),
    mark(4, { group: 2, role: 'robot', robot: 'ready' }),
    mark(5, { group: 2, role: 'screen', help: true }),
    mark(6, { step: 3, done: true, answer: '9' }),
    mark(7, { lesson: 'p7-3', step: 2, done: true, group: 3, role: 'robot', robot: 'done' }),
  ];
  const s = A.summarize(lead, marks, 24);
  assert.equal(s.total, 24);
  assert.equal(s.joined, 7);
  assert.equal(s.done, 2);
  assert.deepEqual(s.help, [5]);
  assert.equal(s.doing, 4);
  assert.deepEqual([...s.answers], [['4', 1], ['3', 1]]);
  assert.deepEqual(s.groups.map((g) => [g.group, g.robotNo, g.robot, g.members]), [[1, 1, 'done', [1, 2, 3]], [2, 4, 'ready', [4, 5]], [3, 7, '', [7]]]);
  assert.equal(A.groupsReady(s), false, "group 3's robot did nothing in this lesson");
  assert.equal(A.groupsReady(A.summarize(lead, marks.slice(0, 5))), true);
});

await ok('a mark is cut to what the server takes', () => {
  const m = A.cleanMark({ ...A.emptyMark(), group: 40, step: -2, answer: '가'.repeat(60), result: 'x'.repeat(200) });
  assert.equal(m.group, A.LEAD_MAX_GROUP);
  assert.equal(m.step, 0);
  assert.equal(runes(m.answer), 40);
  assert.equal(m.result.length, 80);
  assert.ok(A.sameMark(m, { ...m }));
  assert.ok(!A.sameMark(m, { ...m, help: true }));
});

await ok('leading on this PC alone: the same rules as the server (stop never goes back, since moves with the step)', async () => {
  let t = 1000;
  const h = new A.LocalLead(() => t);
  assert.equal(h.shared, false);
  assert.equal((await h.get()).lead, null);
  let v = await h.set({ lesson: 'p7-1', step: 0, gate: false, reveal: false, stop: 0 });
  assert.equal(v.lead!.rev, 1);
  t = 5000;
  v = await h.set({ lesson: 'p7-1', step: 0, gate: false, reveal: true, stop: 2 });
  assert.equal(v.lead!.since, 1000);
  v = await h.set({ lesson: 'p7-1', step: 1, gate: false, reveal: false, stop: 0 });
  assert.equal(v.lead!.since, 5000);
  assert.equal(v.lead!.stop, 2);
  await h.end();
  assert.equal((await h.get()).lead, null);
});

console.log(`lead: ${n} checks passed`);
