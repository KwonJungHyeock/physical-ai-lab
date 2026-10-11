/**
 * Checks for 실물 연동 (src/engine/education/follow.ts), with a fake robot and clock:
 *
 *  - off until started; started, one target per period and none while one is on its way;
 *  - a target never leads the measured angles by more than the lead (the server's 15° rule), stays
 *    inside the joint limits, and the speed never passes the classroom cap; slower while far behind;
 *  - at rest (screen arm reached) nothing more is sent;
 *  - a blocked step (check), a refused target or lost angles stop the arm and keep it stopped
 *    (with the reason) until started again; the pump and the gripper follow on change only.
 *
 * Run with: npm run check:follow
 */
import assert from 'node:assert/strict';

const { Follower, FOLLOW_CAP } = await import('../../src/engine/education/follow');

interface Sent {
  angles: number[];
  speed: number;
}

function fake(start: number[]) {
  const r = {
    angles: start.slice() as number[] | null,
    sent: [] as Sent[],
    stops: 0,
    pumps: [] as boolean[],
    grips: [] as boolean[],
    refuse: '' as string,
    blocked: '' as string,
    pending: [] as (() => void)[],
  };
  const io = {
    actual: () => r.angles,
    target: (angles: number[], speed: number) => {
      r.sent.push({ angles, speed });
      return new Promise<{ ok: boolean; error?: string }>((res) => r.pending.push(() => res(r.refuse ? { ok: false, error: r.refuse } : { ok: true })));
    },
    stop: async () => {
      r.stops += 1;
      return { ok: true };
    },
    pump: async (on: boolean) => {
      r.pumps.push(on);
      return { ok: true };
    },
    grip: async (open: boolean) => {
      r.grips.push(open);
      return { ok: true };
    },
    check: () => r.blocked || null,
    min: [-165, -165, -165, -165, -165, -175],
    max: [165, 165, 165, 165, 165, 175],
  };
  /** Answers the targets on their way and lets the promise callbacks run. */
  const settle = async () => {
    for (const f of r.pending.splice(0)) f();
    await new Promise((res) => setTimeout(res, 0));
  };
  return { r, io, settle };
}

const zero = [0, 0, 0, 0, 0, 0];

{
  // Off until started.
  const { r, io } = fake(zero);
  const f = new Follower(io);
  f.feed(0, [10, 0, 0, 0, 0, 0]);
  assert.equal(r.sent.length, 0);
  assert.equal(f.status.phase, 'off');
  console.log('  ✓ off until started');
}

{
  // Rate, lead, cap, catch-up speed.
  const { r, io, settle } = fake(zero);
  const f = new Follower(io, { speed: 90, cap: 80 });
  f.start();
  const goal = [60, -30, 0, 0, 0, 200];
  f.feed(0, goal);
  assert.equal(r.sent.length, 1);
  f.feed(200, goal); // still on its way
  assert.equal(r.sent.length, 1, 'no target while the last is on its way');
  await settle();
  f.feed(50, goal); // too soon after the last
  assert.equal(r.sent.length, 1, 'one target per period');
  f.feed(300, goal);
  assert.equal(r.sent.length, 2);
  for (const s of r.sent) {
    assert.ok(
      s.angles.every((a, i) => Math.abs(a - zero[i]) <= 12 + 1e-9),
      'leads the measured angles by 12° at most',
    );
    assert.ok(s.speed <= FOLLOW_CAP, 'never above the classroom cap');
    assert.equal(s.speed, 25, 'far behind: the catch-up speed');
  }
  assert.ok(r.sent[0].angles[5] <= 175, 'inside the joint limits');
  console.log('  ✓ one target per period, within 12° of the arm, at most speed 50, slower while far behind');

  // The arm catches up; near the goal it follows at the normal speed, and at rest nothing is sent.
  await settle();
  r.angles = [55, -28, 0, 0, 0, 170];
  f.feed(600, [56, -28, 0, 0, 0, 170]);
  assert.equal(r.sent.at(-1)!.speed, FOLLOW_CAP);
  await settle();
  r.angles = [56, -28, 0, 0, 0, 170];
  f.feed(900, [56, -28, 0, 0, 0, 170]);
  const n = r.sent.length;
  await settle();
  f.feed(1200, [56, -28, 0, 0, 0, 170]);
  f.feed(1500, [56, -28, 0, 0, 0, 170]);
  assert.equal(r.sent.length, n, 'at rest: nothing more');
  assert.ok(f.status.lag < 0.5);
  console.log('  ✓ near the goal at the normal speed; at rest nothing more is sent');
}

{
  // A blocked step stops and stays stopped.
  const { r, io } = fake(zero);
  const f = new Follower(io);
  f.start();
  r.blocked = '책상에 닿아요';
  f.feed(0, [0, 30, 0, 0, 0, 0]);
  assert.equal(r.sent.length, 0);
  assert.equal(r.stops, 1);
  assert.equal(f.status.phase, 'stopped');
  assert.match(f.status.message, /책상에 닿아요/);
  r.blocked = '';
  f.feed(500, [0, 30, 0, 0, 0, 0]);
  assert.equal(r.sent.length, 0, 'stays stopped');
  f.start();
  f.feed(1000, [0, 30, 0, 0, 0, 0]);
  assert.equal(r.sent.length, 1, 'started again');
  console.log('  ✓ a blocked step stops the arm and it stays stopped until started again');
}

{
  // A refused target and lost angles stop it.
  const { r, io, settle } = fake(zero);
  const f = new Follower(io);
  f.start();
  r.refuse = '서보가 풀려 있어요.';
  f.feed(0, [5, 0, 0, 0, 0, 0]);
  await settle();
  assert.equal(f.status.phase, 'stopped');
  assert.match(f.status.message, /서보가 풀려/);
  const g = fake(zero);
  const h = new Follower(g.io);
  h.start();
  g.r.angles = null;
  h.feed(0, [5, 0, 0, 0, 0, 0]);
  assert.equal(h.status.phase, 'stopped');
  assert.equal(g.r.stops, 1);
  console.log('  ✓ a refused target or lost angles stop the arm');
}

{
  // The tool follows on change only; a plain stop goes back to off.
  const { r, io } = fake(zero);
  const f = new Follower(io);
  f.start();
  f.feed(0, zero, { pump: false, open: true });
  f.feed(10, zero, { pump: false, open: true });
  f.feed(20, zero, { pump: true, open: true });
  f.feed(30, zero, { pump: true, open: false });
  assert.deepEqual(r.pumps, [false, true]);
  assert.deepEqual(r.grips, [true, false]);
  f.stop();
  assert.equal(f.status.phase, 'off');
  assert.equal(r.stops, 1);
  console.log('  ✓ the pump and the gripper follow on change; a plain stop turns it off');
}

console.log('follow: all checks passed');
