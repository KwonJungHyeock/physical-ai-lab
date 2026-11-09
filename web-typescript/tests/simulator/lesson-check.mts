/**
 * 교실 수업형 (입문 · 로봇 카페): the 수업 설계 (lessons.ts) and the 학습 기록 (lessonRecord.ts).
 *
 *  - every café quest has a 학습 목표, a 개념, its 교안 pages (in order, before the 정답 쪽) and three
 *    확인 문제 with a real answer; every plan (4 · 6 · 8 차시) takes the 8 quests once, in order;
 *    every 차시 asks three different questions;
 *  - the record: opened · tried · passed · answered (the first answer kept by the screen), the summary
 *    and the 3단계 기준; the teacher's 차시 opens the quests up to it;
 *  - a student's file is untrusted: not a record → null, answers graded again (a file cannot claim
 *    a right one), unknown and prototype keys dropped, strings capped; the CSV defuses formulas.
 *
 * Run with: npm run check:cell
 */
import assert from 'node:assert/strict';

const { missionsOf } = await import('../../src/engine/simulator/cell/missions');
const L = await import('../../src/engine/simulator/cell/lessons');
const R = await import('../../src/engine/simulator/cell/lessonRecord');

const ids = missionsOf('cafe').map((m) => m.id);
assert.deepEqual(ids, ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
let lastPage: number = L.GUIDE_PAGES.screen;
for (const id of ids) {
  const q = L.LESSON_QUEST[id];
  assert.ok(q, `${id}: no 수업 설계`);
  assert.ok(q.learn.length > 10 && q.concept.term && q.concept.def && q.concept.real, `${id}: 학습 목표 · 개념`);
  assert.ok(q.pages[0] === lastPage + 1 && q.pages[1] === q.pages[0] + 1, `${id}: pages ${q.pages}`);
  lastPage = q.pages[1];
  assert.equal(q.checks.length, 3);
  for (const c of q.checks) {
    assert.ok(c.answer >= 0 && c.answer < c.options.length && c.options.length >= 2 && c.why, `${id}: ${c.q}`);
    assert.equal(new Set(c.options).size, c.options.length, `${id}: options repeat`);
  }
}
assert.ok(lastPage < L.GUIDE_PAGES.answers, 'the 정답 쪽 comes after the quests');
console.log(`  ok   8 quests: 학습 목표 · 개념 · 교안 ${L.LESSON_QUEST.F1.pages[0]}–${lastPage}쪽 · 확인 문제 24개`);

for (const n of L.PLAN_SIZES) {
  const ls = L.lessonsOf(n);
  assert.equal(ls.length, n);
  assert.deepEqual(
    ls.flatMap((l) => l.quests),
    ids,
    `${n}차시: every quest once, in order`,
  );
  for (const l of ls) {
    const asks = L.checksOf(n, l.n);
    assert.equal(asks.length, 3, `${n}차시 · ${l.n}: three questions`);
    assert.equal(new Set(asks.map((a) => a.key)).size, 3);
    assert.ok(
      asks.every((a) => l.quests.includes(a.key.split('.')[0])),
      'its own quests',
    );
    assert.equal(L.lessonOfQuest(n, l.quests[0]), l.n);
  }
  console.log(`  ok   ${n}차시 구성: ${ls.map((l) => l.quests.map((q) => q.slice(1)).join('·')).join(' | ')}`);
}

assert.equal(L.levelOf(2, 2, 3, 3), '잘함');
assert.equal(L.levelOf(2, 2, 1, 3), '보통');
assert.equal(L.levelOf(1, 2, 0, 3), '보통');
assert.equal(L.levelOf(0, 2, 1, 3), '노력');

// The record, as a class goes.
let r = R.emptyRecord(4);
r = R.opened(r, 'F1', 1_000_000);
r = R.tried(r, 'F1', 1_010_000);
r = R.tried(r, 'F1', 1_020_000);
r = R.passed(r, 'F1', 1_000_000 + 5 * 60_000);
r = R.passed(r, 'F2', 1_000_000 + 9 * 60_000);
assert.equal(r.quests.F1.tries, 2);
assert.equal(R.minutesOf(r.quests.F1), 5);
assert.equal(r.quests.F2.tries, 1, 'passed by hand counts one try');
assert.equal(R.opened(r, 'X9', 0), r, 'unknown quest ignored');
for (const a of L.checksOf(4, 1)) r = R.answered(r, a.key, a.answer, 2_000_000);
const s = R.summaryOf(r);
assert.equal(s.lessons[0].passed, 2);
assert.equal(s.lessons[0].right, 3);
assert.equal(s.lessons[0].level, '잘함');
assert.equal(s.level, '잘함', 'in all: over the 차시 done');
assert.equal(s.lessons[1].level, null, 'a 차시 not begun has no 기준');
console.log(`  ok   기록: 1차시 퀘스트 2/2 · 확인 3/3 → ${s.lessons[0].level} · 전체 ${s.level}`);

// The teacher's 차시.
const t2: import('../../src/engine/simulator/cell/lessonRecord').TeacherSet = { plan: 4, lesson: 2, allOpen: false };
assert.ok(R.questOpen(t2, R.emptyRecord(), 'F4') && !R.questOpen(t2, R.emptyRecord(), 'F5'));
assert.ok(R.questOpen({ ...t2, allOpen: true }, R.emptyRecord(), 'F8'));
assert.ok(R.questOpen(t2, r, 'F1'));
assert.deepEqual(R.teacherFromQuery('?plan=6&lesson=3', R.defaultTeacher()), { plan: 6, lesson: 3, allOpen: false });
assert.deepEqual(R.teacherFromQuery('?plan=5&lesson=99', { plan: 4, lesson: 1, allOpen: false }), { plan: 4, lesson: 4, allOpen: false });
console.log('  ok   교사 열쇠: 2차시까지 열림 · 모두 열기 · 수업 링크');

// A student's file.
const f = R.recordFile({ ...r, name: '김 하나', no: '7' });
assert.equal(f.name, '7-김_하나-로봇카페-학습기록.json');
const back = R.parseRecord(f.text);
assert.ok(back && back.name === '김 하나' && back.quests.F1.passed && back.checks['F1.1'].ok);
assert.equal(R.parseRecord('{"kind":"other"}'), null);
assert.equal(R.parseRecord('not json'), null);
assert.equal(R.parseRecord('x'.repeat(70_000)), null);
const forged = JSON.parse(f.text);
forged.checks['F2.1'] = { chosen: (L.LESSON_QUEST.F2.checks[0].answer + 1) % 3, ok: true };
forged.checks['__proto__'] = { chosen: 0 };
forged.checks['Z9.1'] = { chosen: 0 };
forged.quests['Z9'] = { passed: true };
forged.name = '=HYPERLINK("x")' + 'ㄱ'.repeat(40);
const g = R.parseRecord(JSON.stringify(forged))!;
assert.equal(g.checks['F2.1'].ok, false, 'graded again');
assert.ok(!('Z9.1' in g.checks) && !('Z9' in g.quests) && !Object.prototype.hasOwnProperty.call(g.checks, '__proto__'));
assert.ok(g.name.length <= 20);
const csv = R.classCsv(R.mergeRecords([g, back!, { ...back!, at: back!.at - 1, name: '김 하나' }]), 4);
assert.ok(csv.startsWith('﻿"번호"'));
assert.ok(csv.includes(`"'=HYPERLINK`), 'formula defused');
assert.equal(csv.trim().split('\r\n').length, 3, 'same student twice → once');
console.log('  ok   제출 파일: 다시 채점 · 모르는 칸 버림 · 같은 학생 하나로 · CSV 수식 막음');
