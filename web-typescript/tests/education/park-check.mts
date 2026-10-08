/**
 * Checks for the 교육 홈 · 로봇 산업단지 (src/engine/education/park.ts): seven sites in route order,
 * each opening when the one before it is finished, and the teacher's 모든 현장 열기.
 *
 *  - nothing done: only the 교육센터 is open, and it is the next site;
 *  - the 1단원 차시 done: the 교육센터 is finished and the 스마트 공장 opens;
 *  - the lab's three problems solved: the 공장 is finished and the 물류 센터 opens (준비 중: no score);
 *  - all open: nothing is locked, finished sites stay finished;
 *  - every problem names real 단원, and every site has a layout on the map.
 *
 * Run with: npm run check:park
 */
import assert from 'node:assert/strict';

const P = await import('../../src/engine/education/park');
const { CATEGORIES } = await import('../../src/engine/education/catalog');
const { SITE_AT, SITE_PROPS, ROADS } = await import('../../src/ui/education/map/parkLayout');

const none = { done: {}, labSolved: {} };
let st = P.siteStates(none);
assert.equal(P.SITES.length, 7);
assert.deepEqual(
  P.SITES.map((s) => st[s.id]),
  ['open', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked'],
);
assert.equal(P.currentSite(none), 'center');
console.log('  ✓ nothing done: only the 교육센터 is open');

const basics = { done: Object.fromEntries(P.centerTopics().map((t) => [t, true])), labSolved: {} };
assert.ok(P.centerTopics().length > 0);
st = P.siteStates(basics);
assert.equal(st.center, 'done');
assert.equal(st.factory, 'open');
assert.equal(st.logistics, 'locked');
assert.equal(P.currentSite(basics), 'factory');
assert.deepEqual(P.siteScore('factory', basics), { done: 0, of: 3 });
console.log('  ✓ 1단원 done: the 스마트 공장 opens');

const partly = { ...basics, labSolved: { 1: true, 2: true } };
assert.equal(P.siteStates(partly).logistics, 'locked');
const lab = { ...basics, labSolved: { 1: true, 2: true, 3: true } };
st = P.siteStates(lab);
assert.equal(st.factory, 'done');
assert.equal(st.logistics, 'open');
assert.equal(P.siteScore('logistics', lab), null);
assert.equal(st.lab, 'locked');
console.log('  ✓ the lab solved: the 물류 센터 opens (준비 중)');

st = P.siteStates(basics, true);
assert.ok(P.SITES.every((s) => st[s.id] !== 'locked'));
assert.equal(st.center, 'done');
console.log('  ✓ 모든 현장 열기: nothing locked');

const units = new Set(CATEGORIES.map((c) => c.id));
for (const s of P.SITES) {
  for (const p of s.problems) for (const u of p.units) assert.ok(units.has(u), `${s.id}: ${p.title} → 단원 ${u}`);
  assert.ok(s.content === 'lessons' || s.problems.length === 3, `${s.id}: three problems`);
  assert.ok(SITE_AT[s.id] && SITE_PROPS[s.id].length > 0, `${s.id}: on the map`);
}
for (const [a, b] of ROADS) assert.ok(SITE_AT[a][0] === SITE_AT[b][0] || SITE_AT[a][1] === SITE_AT[b][1], `road ${a}–${b} runs straight`);
console.log('  ✓ problems name real 단원; every site is on the map, roads run straight');
console.log('park: all checks passed');
