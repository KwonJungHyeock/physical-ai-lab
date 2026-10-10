/**
 * Checks for the 교육 홈 · 로봇 시티 (src/engine/education/park.ts and the map's layout):
 *
 *  - nine places: the academy, seven theme labs, the data centre; nothing done → only the academy
 *    is open and its first 차시 is next;
 *  - following the next step from nothing: theory and site problems in turn, each problem only once
 *    its 차시 are learnt and its site's earlier problems solved, all 28 차시 and 21 problems once;
 *  - a site opens on its problem 1's 차시; its other problems stay locked until theirs are learnt;
 *  - all open (teacher): nothing locked;
 *  - every problem names real 학문; every theme has a social problem and robots; every place stands
 *    on its own block of the map, and the map's routes are sane (lanes close, people on the slabs).
 *
 * Run with: npm run check:park
 */
import assert from 'node:assert/strict';

const P = await import('../../src/engine/education/park');
const { CATEGORIES, topicsOf } = await import('../../src/engine/education/catalog');
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
assert.deepEqual(P.nextStep(none), { kind: 'topic', topic: '1-1' });
assert.equal(P.currentSite(none), 'center');
console.log('  ✓ nothing done: only the 로봇 아카데미 is open, its first 차시 is next');

// A student who always takes the next step: theory and sites in turn, every problem after the 차시 it needs.
const walk: { done: Record<string, boolean>; solved: Record<string, Record<number, boolean>> } = { done: {}, solved: {} };
const order: string[] = [];
for (let i = 0; i < 80; i++) {
  const n = P.nextStep(walk);
  if (n.kind === 'data') break;
  if (n.kind === 'topic') {
    walk.done[n.topic] = true;
    order.push(n.topic);
    continue;
  }
  const site = P.SITE_BY_ID.get(n.site)!;
  assert.equal(P.siteStates(walk)[n.site], 'open', `${n.site} open when it is next`);
  assert.deepEqual(P.problemMissing(site, n.prob, walk), [], `${n.lab} ${n.prob}: its 차시 learnt first`);
  for (const j of [1, 2, 3].filter((j) => j < n.prob)) assert.ok(walk.solved[n.lab]?.[j], `${n.lab}: ${j} before ${n.prob}`);
  walk.solved[n.lab] = { ...(walk.solved[n.lab] ?? {}), [n.prob]: true };
  order.push(`${n.lab}${n.prob}`);
}
const nTopics = P.centerTopics().length;
assert.equal(order.length, nTopics + P.THEMES.length * 3, 'every 차시 and every problem, once');
assert.ok(order.indexOf('bio1') < order.indexOf('2-1'), 'the first site problem comes inside 1단원 work, not after the whole theory');
assert.ok(order.indexOf('factory1') === order.indexOf('2-1') + 1, 'a problem right after the 차시 that opens it');
assert.ok(order.indexOf('ai3') === order.length - 1, 'the capstone problem last');
assert.equal(P.siteStates(walk).center, 'done');
assert.ok(P.THEMES.every((s) => P.siteStates(walk)[s.id] === 'done'));
assert.equal(P.currentSite(walk), 'data');
console.log(`  ✓ next step: ${order.length} steps, theory and sites in turn (${order.slice(0, 9).join(' ')} …)`);

const basics = { done: Object.fromEntries(topicsOf('1').map((t) => [t.id, true])), solved: {} };
st = P.siteStates(basics);
assert.equal(st.lab, 'open', 'bio opens on 1-2 · 1-3');
assert.equal(st.farm, 'locked', 'farm waits for 7-2');
assert.deepEqual(P.labLocks(basics).bio, { 2: ['5-5'], 3: ['6-1', '6-2'] });
assert.deepEqual(P.labLocks(basics, true).bio, {});
assert.deepEqual(P.siteScore('factory', basics), { done: 0, of: 3 });
assert.equal(P.siteScore('data', basics), null);
console.log('  ✓ 1단원 done: bio opens (problems 2 and 3 still need 5-5, 6-1 · 6-2); the rest wait for their 차시');

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
