/**
 * The student's programs kept in the browser (engine/simulator/programs.ts): one per robot, level,
 * environment and practice; an untouched example is forgotten; the oldest go first past the limit;
 * and the open program carried to the robot's console in the address (#carry=) comes back whole,
 * Korean text included, while a broken or foreign address part is ignored.
 *
 * Run with: npm run check:programs
 */
import assert from 'node:assert/strict';

// A browser store in memory.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const { loadProgram, saveProgram, loadLastPractice, saveLastPractice, carryHash, readCarried } = await import('../../src/engine/simulator/programs');

const ARM = 'mycobot280-rdkx5';

saveProgram(ARM, 'basic', 'arm', 'joints', 'move_joint(1, 40)\n# 내 프로그램');
saveProgram(ARM, 'python', 'arm', 'joints', 'print("파이썬")');
assert.equal(loadProgram(ARM, 'basic', 'arm', 'joints'), 'move_joint(1, 40)\n# 내 프로그램');
assert.equal(loadProgram(ARM, 'python', 'arm', 'joints'), 'print("파이썬")');
assert.equal(loadProgram(ARM, 'basic', 'kit', 'joints'), null, 'another environment is another program');
assert.equal(loadProgram('mycobot320-pi', 'basic', 'arm', 'joints'), null, 'another robot is another program');
console.log('  ok   one program per robot, level, environment and practice');

saveProgram(ARM, 'basic', 'arm', 'joints', null);
assert.equal(loadProgram(ARM, 'basic', 'arm', 'joints'), null);
assert.equal(loadProgram(ARM, 'python', 'arm', 'joints'), 'print("파이썬")');
console.log('  ok   back to the example: forgotten, the others kept');

for (let i = 0; i < 130; i++) saveProgram(ARM, 'basic', 'arm', `p${i}` as never, `# ${i}`);
const kept = Object.keys(JSON.parse(store.get('robot-console-programs')!));
assert.equal(kept.length, 120);
assert.equal(loadProgram(ARM, 'basic', 'arm', 'p129' as never), '# 129');
console.log('  ok   at most 120 kept, the newest');

saveLastPractice('python', 'repeat');
saveLastPractice('basic', 'teach');
assert.equal(loadLastPractice('python'), 'repeat');
assert.equal(loadLastPractice('basic'), 'teach');
assert.equal(loadLastPractice('ros'), null);
console.log('  ok   the practice each level was left on');

const carried = { level: 'python' as const, theme: 'kit' as const, id: 'repeat' as const, code: 'mc.send_angles([0, 0, 0, 0, 0, 0], 40)  # 집으로 🏠\n' };
const hash = carryHash(carried);
assert.ok(hash.startsWith('#carry='));
assert.deepEqual(readCarried(hash), carried);
assert.equal(readCarried(''), null);
assert.equal(readCarried('#carry=%%%'), null);
assert.equal(readCarried(`#carry=${Buffer.from(JSON.stringify({ ...carried, level: 'root' })).toString('base64')}`), null);
console.log('  ok   carried to the robot in the address and back, unchanged; a broken one ignored');

console.log('programs: all checks passed');
