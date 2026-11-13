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
  // 6장: 과정 끝에 열림 (the course's end opens it, never a list).
  assert.equal(C.subById(id)?.status, id.startsWith('6-') ? 'end' : 'unused', `${id} 사용 안 함 · 6장은 과정 끝에 열림`);
  for (const c of K.COURSES) assert.equal(K.lessonIn(c, id), 0, `${c.id} 목록에 ${id} 없음`);
}

// Kinds as decided.
const kinds = (id: string) => C.subById(id)!.kinds;
assert.deepEqual(kinds('3-4'), { scene: 'none', practice: 'open' });
assert.deepEqual(kinds('4-1'), { scene: 'none', practice: 'open' });
for (const id of ['4-3', '5-1', '5-2', '5-3']) assert.deepEqual(kinds(id), { scene: 'open', practice: 'open' }, id);
assert.equal(C.modeFor(C.subById('3-4')!, 'scene'), 'practice', '없는 종류로 오면 있는 쪽');
assert.equal(C.modeFor(C.subById('5-2')!, 'scene'), 'scene');
assert.equal(C.modeFor(C.subById('5-4')!, 'practice'), 'practice', '5-4 열림 (만드는 중인 절은 이제 없음)');
assert.equal(C.modeFor(C.subById('5-4')!, 'scene'), 'practice', '5-4 장면 보기 없음 → 실습');

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
assert.equal((K.nextIn(full, '3-4') as { id: string }).id, '3-5');
assert.equal((K.nextIn(full, '3-5') as { id: string }).id, '3-6');
assert.equal((K.nextIn(full, '5-2') as { id: string }).id, '5-3');
assert.equal((K.nextIn(full, '5-3') as { id: string }).id, '5-4');
assert.equal((K.nextIn(full, '5-4') as { id: string }).id, '5-5');
assert.equal((K.nextIn(full, '5-5') as { id: string }).id, '5-6');
assert.equal(K.nextIn(full, '5-6'), 'record');
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
for (const t of tests) assert.equal(K.testReady(t.sub), ['1-4', '2-5', '3-6', '4-5', '5-6'].includes(t.sub.id), `${t.sub.id}: 1 ~ 5장 모두 열림`);

// 1장 (장별 가이드라인 v1): 1-1 · 1-2 · 1-3 open as the course's own 절; 1-1 has 장면 보기; 1장 수행평가 opens after 1-3.
const S = await import('../../src/engine/simulator/cell/courseSteps');
const T = await import('../../src/engine/simulator/cell/courseTests');
assert.deepEqual(C.subById('1-1')!.kinds, { scene: 'open', practice: 'open' });
assert.deepEqual(C.subById('1-2')!.kinds, { scene: 'none', practice: 'open' });
assert.deepEqual(C.subById('1-3')!.kinds, { scene: 'none', practice: 'open' });
assert.equal(S.COURSE_STEPS['1-1'].length, 3);
assert.equal(S.COURSE_STEPS['1-2'].length, 7);
assert.equal(S.COURSE_STEPS['1-3'].length, 3);
assert.equal(S.ARM_PARTS.length, 7);
assert.equal((K.nextIn(full, '1-3') as { id: string }).id, '1-4', '1-3 다음은 1장 수행평가');
assert.equal(C.modeFor(C.subById('1-4')!, 'scene'), 'practice');
assert.deepEqual(T.CHAPTER_TESTS[1].answers, ['O', 'X', 'O', 'X', 'O']);
assert.equal(T.gradeOX(T.CHAPTER_TESTS[1], ['O', 'X', 'O', 'O', 'O']), 4);
assert.equal(T.CHAPTER_TESTS[1].mission.ready, false, '사진 6장은 팀에서 받기 전까지 준비 중');
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

// 2장 (장별 가이드라인 v1): 2-1 · 2-3 · 2-4 open (실습 하기 only), 2장 수행평가 after 2-4, its mission done in the scene.
for (const id of ['2-1', '2-3', '2-4']) assert.deepEqual(C.subById(id)!.kinds, { scene: 'none', practice: 'open' }, id);
assert.deepEqual(
  ['2-1', '2-3', '2-4'].map((id) => S.COURSE_STEPS[id as '2-1'].length),
  [2, 2, 3],
);
assert.equal((K.nextIn(full, '2-4') as { id: string }).id, '2-5', '2-4 다음은 2장 수행평가');
assert.deepEqual(T.CHAPTER_TESTS[2].answers, ['X', 'O', 'O', 'X', 'O']);
assert.equal(T.CHAPTER_TESTS[2].mission.ready, true);
assert.equal(T.inOrder(T.CHAPTER_TESTS[2].mission.steps!, ['zero', 'home', 'pen', 'dot']), true);
assert.equal(T.inOrder(T.CHAPTER_TESTS[2].mission.steps!, ['pen', 'zero', 'home', 'dot']), false, '순서가 다르면 아직');
assert.equal(S.KIT_PARTS.length, 5);
assert.deepEqual(
  S.DESK_PLACES.map((p) => p.name),
  ['로봇', '매트', '카드'],
);
assert.deepEqual([...S.PREP_POSE], [30, 20, -40, -20, 0, 0]);
// 4-1 맛보기: the lit key takes the tip up first and down last (고리 3 from 고리 2: up, not across low past the base).
const L = await import('../../src/engine/simulator/lifeTutorials');
const key = (tip: { x: number; y: number; z: number }, r: readonly [number, number, number]) => (L.ringLead(tip, r)[0] as { sel?: string }).sel;
assert.equal(key({ x: 130, y: 120, z: 110 }, [130, -130, 190]), '[aria-label$="(Z+)"]', '고리 3: 먼저 위로');
assert.equal(key({ x: 130, y: 120, z: 190 }, [130, -130, 190]), '[aria-label$="(Y−)"]', '그다음 옆으로');
assert.equal(key({ x: 170, y: 0, z: 150 }, [130, 120, 110]), '[aria-label$="(Y+)"]', '고리 2: 옆으로 먼저, 아래는 마지막');
assert.equal(key({ x: 130, y: 120, z: 150 }, [130, 120, 110]), '[aria-label$="(Z−)"]');

// 4-1 맛보기 (고리 3개를 매트 위 가까이): following only the lit key (10 mm steps, the tip moved as asked) gets
// into all three, using X, Y and Z, and takes about 50 presses.
{
  const tip = { x: 65.9, y: -62.3, z: 238.8 };
  const used = new Set<string>();
  let presses = 0;
  for (const st of L.LIFE_TASTE.steps) {
    const r = st.ring!;
    for (let k = 0; k < 60 && Math.hypot(tip.x - r[0], tip.y - r[1], tip.z - r[2]) > L.RING_MM; k += 1) {
      const m = /\(([XYZ])([+−])\)/.exec(key(tip, r) ?? '')!;
      used.add(m[1]);
      tip[m[1].toLowerCase() as 'x' | 'y' | 'z'] += m[2] === '+' ? 10 : -10;
      presses += 1;
    }
    assert.ok(Math.hypot(tip.x - r[0], tip.y - r[1], tip.z - r[2]) <= L.RING_MM, `고리 ${r} 통과`);
  }
  assert.deepEqual([...used].sort(), ['X', 'Y', 'Z'], '세 축을 모두 씀');
  assert.ok(presses >= 45 && presses <= 60, `누른 횟수 ${presses}`);
}

// 3장 (장별 가이드라인 v1): 3-1 · 3-2 · 3-5 open (실습 하기 only), 3-4 from the 기본 자세, 3장 수행평가 after 3-5.
for (const id of ['3-1', '3-2', '3-5']) assert.deepEqual(C.subById(id)!.kinds, { scene: 'none', practice: 'open' }, id);
assert.deepEqual(
  ['3-1', '3-2', '3-5'].map((id) => S.COURSE_STEPS[id as '3-1'].length),
  [6, 3, 4],
);
assert.equal((K.nextIn(full, '3-5') as { id: string }).id, '3-6', '3-5 다음은 3장 수행평가');
assert.deepEqual(T.CHAPTER_TESTS[3].answers, ['O', 'O', 'X', 'O', 'X']);
assert.deepEqual(T.CHAPTER_TESTS[3].mission.pose, [30, 30, -60, -20, 0, 0]);
// 미션: one more try; the 기록 tells first-try, second-try and not-passed apart; a second-try pass is a pass.
const tr = (mission: boolean | null, missionTries?: number) => ({ chosen: [], right: 5, mission, missionTries, at: 0 });
assert.equal(T.missionWay(tr(true, 1)), '한 번에 통과');
assert.equal(T.missionWay(tr(true, 2)), '다시 해서 통과');
assert.equal(T.missionWay(tr(false, 1)), null, '한 번 더 할 수 있음');
assert.equal(T.missionWay(tr(false, 2)), '통과 못 함');
assert.equal(P.levelOf({ chapter: 3, right: 5, of: 5, mission: true }).level, '상', '다시 해서 통과해도 통과');

// 접근: today every course may be opened.
assert.equal(await P.mayOpen({ course: 'full8', sub: '5-2', mode: 'scene' }), true);

// 문구 파일 (수정 지시서 v2 파트 G-1): every 절 of a course has its 지금 할 일 sentences and its one line when done,
// each step a sentence, the 6장 names as the screens show them, the 수행평가 answers five O · X each.
const W = await import('../../src/engine/simulator/cell/courseText');
for (const id of full.lessons.flat()) {
  assert.ok(W.stepTexts(id).length > 0, `${id} 지금 할 일 문장이 문구 파일에 있어요`);
  assert.ok(W.doneLine(id).startsWith('다 했어요 · '), `${id} 완료 한 줄이 '다 했어요 · …'`);
}
for (const [id, lines] of Object.entries(S.COURSE_STEPS)) {
  assert.equal(W.stepTexts(id).length, lines.length, `${id} 단계 수와 문장 수가 같아요`);
  for (const l of lines) assert.ok(l.text, `${id} 단계 문장이 비어 있지 않아요`);
}
for (const l of S.G2_COURSE) assert.ok(l.text, '5-2 단계 문장');
for (const id of ['4-2', '5-1', '5-2', '5-3']) {
  const z = W.quizText(id);
  assert.ok(z.q && z.options.length === 2 && z.answer >= 0 && z.answer < 2 && z.why, `${id} 잠깐 퀴즈가 문구 파일에 있어요`);
}
for (const n of [1, 2, 3, 4, 5]) {
  assert.equal(T.CHAPTER_TESTS[n].answers.length, 5, `${n}장 O · X 정답 5개`);
  assert.ok(
    T.CHAPTER_TESTS[n].answers.every((a: string) => a === 'O' || a === 'X'),
    `${n}장 정답은 O · X`,
  );
  assert.ok(T.CHAPTER_TESTS[n].mission.text, `${n}장 미션 문장`);
}
assert.equal(W.failLine('3-5', 'slowFirst', { pct: 30 }), '속도를 30% 이하로 맞추고 다시 눌러요');
assert.deepEqual(
  ['6-1', '6-2', '6-3'].map((id) => C.subById(id)?.title),
  ['결과 확인', '수업 후기', '학습 기록 한 장'],
);
assert.equal(C.shortTitle('관절 하나씩 움직이기: 방향과 한계'), '관절 하나씩 움직이기');

console.log(`입문 과정: 표 ${C.COURSE_SUBS.length}절 · 8차시 ${full.lessons.flat().length}절 · 4차시 ${focus.lessons.flat().length}절 · 수행평가 ${tests.length} — 통과`);
