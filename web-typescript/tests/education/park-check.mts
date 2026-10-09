/**
 * Checks for the 교육 홈 · 로봇 시티 (src/engine/education/park.ts and the map's layout):
 *
 *  - nine places: the academy, seven theme labs, the data centre; nothing done → only the academy
 *    is open and it is where to go next;
 *  - the academy's 1학문 차시 done → every theme and the data centre open, the next place is the
 *    first theme; a theme's three problems solved → it is done and the next theme is next;
 *  - all open (teacher): nothing locked;
 *  - every problem names real 학문; every theme has a social problem and robots; every place stands
 *    on its own block of the map, and the map's routes are sane (lanes close, people on the slabs).
 *
 * Run with: npm run check:park
 */
import assert from 'node:assert/strict';

const P = await import('../../src/engine/education/park');
const { CATEGORIES } = await import('../../src/engine/education/catalog');
const { DISTRICTS, DISTRICT_BY_ID, world } = await import('../../src/ui/education/map/world/worldLayout');
const { rectLoop, circleLoop, run } = await import('../../src/ui/education/map/world/worldPaths');

const none = { done: {}, solved: {} };
let st = P.siteStates(none);
assert.equal(P.SITES.length, 9);
assert.deepEqual(
  P.SITES.map((s) => s.content),
  ['lessons', 'lab', 'lab', 'lab', 'lab', 'lab', 'lab', 'lab', 'data'],
);
assert.deepEqual(
  P.SITES.map((s) => st[s.id]),
  ['open', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked'],
);
assert.equal(P.currentSite(none), 'center');
console.log('  ✓ nothing done: only the 로봇 아카데미 is open');

const basics = { done: Object.fromEntries(P.centerTopics().map((t) => [t, true])), solved: {} };
assert.ok(P.centerTopics().length > 0);
st = P.siteStates(basics);
assert.equal(st.center, 'done');
assert.ok(P.SITES.every((s) => st[s.id] !== 'locked'), 'all open once the academy is done');
assert.equal(P.currentSite(basics), 'factory');
assert.deepEqual(P.siteScore('factory', basics), { done: 0, of: 3 });
assert.equal(P.siteScore('data', basics), null);
console.log('  ✓ 1학문 done: every place opens, the 스마트팩토리 is next');

const lab = { ...basics, solved: { factory: { 1: true, 2: true, 3: true } } };
st = P.siteStates(lab);
assert.equal(st.factory, 'done');
assert.equal(P.currentSite(lab), 'logistics');
const partly = { ...basics, solved: { factory: { 1: true, 2: true } } };
assert.equal(P.siteStates(partly).factory, 'open');
const all = { ...basics, solved: Object.fromEntries(P.THEMES.map((s) => [s.lab!, { 1: true, 2: true, 3: true }])) };
assert.equal(P.currentSite(all), 'data');
console.log('  ✓ a theme solved is done; with every theme done the data centre is next');

st = P.siteStates(none, true);
assert.ok(P.SITES.every((s) => st[s.id] !== 'locked'));
console.log('  ✓ 모든 현장 열기: nothing locked');

const units = new Set(CATEGORIES.map((c) => c.id));
for (const s of P.SITES) {
  for (const p of s.problems) for (const u of p.units) assert.ok(units.has(u), `${s.id}: ${p.title} → 학문 ${u}`);
  assert.ok(s.content !== 'lab' || (s.lab && s.problems.length === 3 && s.issue && s.crew.length >= 2), `${s.id}: three problems, a social problem, robots`);
  assert.ok(DISTRICT_BY_ID.get(s.id), `${s.id}: on the map`);
}
const blocks = new Set(DISTRICTS.map((d) => d.at.join(',')));
assert.equal(blocks.size, 9, 'one block each');
console.log('  ✓ problems name real 학문; every theme has its issue and robots; one block per place');

const { places, features } = world();
assert.ok(places.length > 600, `a full city (${places.length} models)`);
assert.ok(features.robots.length >= 9, 'robots at every place');
assert.ok(features.robots.some((r) => r.arm && r.arm !== 'mycobot280-rdkx5'), 'other arms on the map');
const loop = rectLoop(0, 0, 8, 8, 1, true);
const a = loop.at(0);
const b = loop.at(loop.length);
assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-6, 'a loop closes');
assert.ok(Math.abs(loop.at(4).z + 8) < 1e-6 && Math.abs(loop.at(4).rot - Math.PI / 2) < 1e-6, 'clockwise: along the far side towards +x first');
const c = circleLoop(0, 0, 3);
assert.ok(Math.abs(Math.hypot(c.at(1).x, c.at(1).z) - 3) < 0.05, 'a circle keeps its radius');
const r = run([
  [0, 0],
  [4, 0],
]);
assert.ok(Math.abs(r.at(6).x - 2) < 1e-9 && Math.abs(Math.abs(r.at(6).rot) - Math.PI / 2) < 1e-9, 'a run comes back');
console.log('  ✓ the map is full, robots at every place; routes close, circle, turn back');
console.log('park: all checks passed');
