/**
 * 입문 과정 (매칭 표 · 구성): the table and the two courses agree — 8차시 by default and 4차시 inside it,
 * no 사용 안 함 절 listed, 차시 counted from the course, a 수행평가 after each chapter's last 절 (8차시
 * only), the 학습 기록 at the end, a 선택 절 never counted, and the kinds as decided (3-4 · 4-1: no
 * 장면 보기; 4-3 · 5-1 · 5-2 · 5-3: both).
 *
 * Run with: npm run check:course
 */
import assert from 'node:assert/strict';

const C = await import('../../src/engine/simulator/cell/course');
const K = await import('../../src/engine/simulator/cell/courses');

const full = K.DEFAULT_PLAN;
const focus = K.COURSES.find((c) => c.id === 'focus4');
assert.ok(focus, '4차시 구성이 있어요');
assert.equal(K.COURSES.length, 2, '구성은 8차시 · 4차시 둘');
assert.equal(full.id, 'full8');
assert.equal(full.lessons.length, 8);
assert.equal(focus.lessons.length, 4);

// Every 절 of a course is in the table, listable, and the 4차시 is inside the 8차시.
const ids = new Set(C.COURSE_SUBS.map((s) => s.id));
for (const c of K.COURSES)
  for (const id of c.lessons.flat()) {
    assert.ok(ids.has(id), `${c.id}: ${id} 가 표에 있어요`);
    assert.notEqual(C.subById(id)?.status, 'unused', `${c.id}: ${id} 는 사용 안 함이 아니에요`);
  }
for (const id of focus.lessons.flat()) assert.ok(K.lessonIn(full, id) > 0, `4차시의 ${id} 는 8차시에도 있어요`);

// 사용 안 함: kept in the table, never in a course's list.
for (const id of ['1-4', '2-2', '2-5', '3-3', '3-6', '4-5', '5-6', '6-1', '6-2', '6-3']) {
  assert.equal(C.subById(id)?.status, 'unused', `${id} 사용 안 함`);
  for (const c of K.COURSES) assert.equal(K.lessonIn(c, id), 0, `${c.id} 목록에 ${id} 없음`);
}

// Kinds as decided.
const kinds = (id: string) => C.subById(id)!.kinds;
assert.deepEqual(kinds('3-4'), { scene: 'none', practice: 'open' });
assert.deepEqual(kinds('4-1'), { scene: 'none', practice: 'open' });
for (const id of ['4-3', '5-1', '5-2', '5-3']) assert.deepEqual(kinds(id), { scene: 'open', practice: 'open' }, id);
assert.equal(C.modeFor(C.subById('3-4')!, 'scene'), 'practice', '없는 종류로 오면 있는 쪽');
assert.equal(C.modeFor(C.subById('5-2')!, 'scene'), 'scene');
assert.equal(C.modeFor(C.subById('3-2')!, 'practice'), null, '만드는 중은 열리지 않아요');

// 선택: 5-5 (the real robot) is in the 8차시 and never counted.
assert.ok(C.subById('5-5')?.optional);
assert.ok(K.lessonIn(full, '5-5') > 0);
assert.ok(!K.countedIn(full).some((s) => s.optional));

// 수행평가: after each chapter's last 절 in 8차시; none in 4차시 (its 차시 missions instead).
const steps = K.stepsIn(full);
const tests = steps.filter((x) => x.kind === 'test');
assert.deepEqual(
  tests.map((x) => x.sub.id),
  ['1-4', '2-5', '3-6', '4-5', '5-6'],
);
for (const t of tests) {
  const k = steps.indexOf(t);
  assert.equal(steps[k - 1].sub.chapter, t.chapter.n, `${t.sub.id} 는 그 장의 마지막 절 뒤`);
}
assert.equal(K.stepsIn(focus).filter((x) => x.kind === 'test').length, 0);
assert.deepEqual(
  K.missionSubsIn(focus).map((s) => s.id),
  ['1-3', '3-4', '4-3', '5-3'],
);

// Next: the next 절 that opens, then the 학습 기록 at the end.
assert.equal((K.nextIn(full, '3-4') as { id: string }).id, '4-1');
assert.equal((K.nextIn(full, '5-2') as { id: string }).id, '5-3');
assert.equal(K.nextIn(full, '5-3'), 'record');
assert.equal(K.nextIn(focus, '5-3'), 'record');

// 차시 from the course: 5-1 is the 7th in 8차시, the 4th in 4차시.
assert.equal(K.lessonIn(full, '5-1'), 7);
assert.equal(K.lessonIn(focus, '5-1'), 4);

// The platform's own list: unknown and 사용 안 함 dropped, empty 차시 too.
const P = await import('../../src/engine/simulator/cell/platform');
const own = P.planFromPlatform({ lessons: [['1-1', '9-9'], ['3-3'], ['5-1', '5-2']] });
assert.deepEqual(own.lessons, [['1-1'], ['5-1', '5-2']]);

// 수행평가 준비 중: shown in the 차시 of its chapter's last 절, skipped, never counted.
const ls = K.lessonStepsIn(full);
assert.deepEqual(
  ls.flatMap((l) => l.steps.filter((x) => x.kind === 'test').map((x) => `${l.n}:${x.sub.id}`)),
  ['1:1-4', '2:2-5', '4:3-6', '6:4-5', '8:5-6'],
);
for (const t of tests) assert.equal(K.testReady(t.sub), false, `${t.sub.id} 준비 중`);
assert.ok(!K.countedIn(full).some((s) => s.test));

// 상 · 중 · 하 (임시, browser): by the #48 rule, only for a 수행평가 taken.
assert.equal(P.levelOf({ chapter: 3, right: 5, of: 5, mission: true }).level, '상');
assert.equal(P.levelOf({ chapter: 3, right: 4, of: 5, mission: true }).level, '중');
assert.equal(P.levelOf({ chapter: 3, right: 5, of: 5, mission: false }).level, '중');
assert.equal(P.levelOf({ chapter: 3, right: 4, of: 5, mission: false }).level, '하');
assert.equal(P.levelOf({ chapter: 3, right: 5, of: 5, mission: true }).temporary, true);

// 저작권 안내: once a day.
const store = new Map<string, string>();
const day1 = new Date(2026, 10, 11, 9).getTime();
assert.equal(
  P.noticeDue((k) => store.get(k) ?? null, day1),
  true,
);
P.noticeRead((k, v) => store.set(k, v), day1);
assert.equal(
  P.noticeDue((k) => store.get(k) ?? null, day1 + 5 * 3600_000),
  false,
  '같은 날은 안내 없음',
);
assert.equal(
  P.noticeDue((k) => store.get(k) ?? null, new Date(2026, 10, 12, 8).getTime()),
  true,
  '다음 날은 다시',
);

// 접근: today every course may be opened.
assert.equal(await P.mayOpen({ course: 'full8', sub: '5-2', mode: 'scene' }), true);

console.log(`입문 과정: 표 ${C.COURSE_SUBS.length}절 · 8차시 ${full.lessons.flat().length}절 · 4차시 ${focus.lessons.flat().length}절 · 수행평가 ${tests.length} — 통과`);
