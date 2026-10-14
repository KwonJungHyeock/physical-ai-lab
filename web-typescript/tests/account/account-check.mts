/**
 * Checks for class accounts and learning records (src/engine/account/):
 *
 *  - pin: PBKDF2 hashes match the class server's byte for byte (the vectors in
 *    desktop-go/classroom/classroom_test.go), verify right / wrong / malformed, random PINs never weak;
 *  - events: builders make statements the server accepts, object ids parse back, bad ids throw, and the
 *    verbs with their published purposes are the same as the server's (statements.go);
 *  - queue: batches, retry with backoff after a failure, stop on a refused login until resume, refused
 *    statements dropped, the cap, two tabs on one store, one flush at a time, autoFlush with fake timers;
 *  - client: addresses typed by people, join links, login + bearer token, error mapping (wrong PIN,
 *    locked with Retry-After, offline), the queue's sender, finding the server;
 *  - live: where each student is, stuck after N fails until a pass, idle / offline / never, grid cells;
 *  - roster: the teacher's 번호 ↔ 이름 list parsed from pasted text, CSV defused, login cards;
 *  - session and role gating.
 *
 * Run with: npm run check:account
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const A = await import('../../src/engine/account');
type Statement = import('../../src/engine/account').Statement;

const here = dirname(fileURLToPath(import.meta.url));
const goDir = join(here, '..', '..', '..', 'desktop-go', 'classroom');
const goStatements = readFileSync(join(goDir, 'statements.go'), 'utf8');
const goTests = readFileSync(join(goDir, 'classroom_test.go'), 'utf8');

/* --- pin ------------------------------------------------------------------------------------------ */
{
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const vectors: [string, string | undefined, string][] = [
    ['4821', undefined, 'pbkdf2-sha256$1000$AAECAwQFBgcICQoLDA0ODw$Z6JOy8PjhRTmSedeSHtn7HxPh52Qj1lcDGYj1Pc79cU'],
    ['4821', 'pepper-for-test-0123456789abcdef', 'pbkdf2-sha256$1000$AAECAwQFBgcICQoLDA0ODw$KeE2OSwjhcCmuG2XXsEGDXOynxLUUPEdhuHzlJ0s8p8'],
    ['비밀번호-Teacher!', undefined, 'pbkdf2-sha256$1000$AAECAwQFBgcICQoLDA0ODw$R8kAF+RFGYjY2Mo1k5M/Bhuv6CXiqBbvmAb1vTq02k0'],
  ];
  for (const [secret, pepper, want] of vectors) {
    assert.equal(await A.hashWithSalt(secret, salt, 1000, pepper), want, `vector ${secret}`);
    assert.ok(goTests.includes(want), 'the same vector is in the Go test');
    assert.ok(await A.verifySecret(want, secret, pepper));
  }
  const h = await A.hashSecret('1357', { iterations: 2000, pepper: 'p' });
  assert.match(h, /^pbkdf2-sha256\$2000\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  assert.notEqual(h, await A.hashSecret('1357', { iterations: 2000, pepper: 'p' }), 'fresh salt each time');
  assert.equal(await A.verifySecret(h, '1357', 'p'), true);
  assert.equal(await A.verifySecret(h, '1358', 'p'), false);
  assert.equal(await A.verifySecret(h, '1357'), false, 'pepper missing');
  for (const bad of ['', '1357', 'md5$1$a$b', 'pbkdf2-sha256$10$AAAA$AAAA', 'pbkdf2-sha256$1000$***$AAAA', 'pbkdf2-sha256$99999999$AAAA$AAAA'])
    assert.equal(await A.verifySecret(bad, '1357'), false, `malformed ${bad}`);
  await assert.rejects(A.hashWithSalt('x', salt, 10), RangeError);
  const pins = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const p = A.newPin();
    assert.ok(A.validPin(p) && !A.weakPin(p), p);
    pins.add(p);
  }
  assert.ok(pins.size > 400, 'PINs vary');
  for (const w of ['0000', '1234', '9876', '7777']) assert.ok(A.weakPin(w));
  for (const b of ['123', '12345', '12a4', '１２３４']) assert.ok(!A.validPin(b));
  assert.deepEqual([...(A.b64decode(A.b64encode(Uint8Array.from([0, 255, 7]))) ?? [])], [0, 255, 7]);
  assert.equal(A.b64decode('*'), null);
}

/* --- events --------------------------------------------------------------------------------------- */
const T0 = Date.UTC(2026, 9, 12, 1, 0);
let n = 0;
const deps = { now: () => T0, uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
{
  // Same verbs, ids and published purposes as the server.
  for (const k of A.VERB_KEYS) {
    const v = A.VERBS[k];
    const short = v.id.replace(A.ADL_VERB, 'adl + "').replace(A.OUR_VERB, 'ourVerb + "');
    assert.ok(goStatements.includes(`{${short}", "${k}", "${v.ko}", "${v.purpose}", ${v.cloud}}`), `server verb ${k} differs`);
  }
  assert.equal((goStatements.match(/^\t\{(adl|ourVerb) \+ "/gm) ?? []).length, A.VERB_KEYS.length, 'the server has no extra verbs');
  assert.ok(goStatements.includes('(lesson|site|quiz|robot)(:[A-Za-z0-9._-]{1,40}){1,6}'), 'object id rule as the server');

  assert.equal(A.lessonObject('1-2', 'concept'), 'urn:robocity:lesson:1-2:page:concept');
  assert.equal(A.siteObject('factory', 2, 1), 'urn:robocity:site:factory:problem:2:step:1');
  assert.equal(A.quizObject('final', 'q3'), 'urn:robocity:quiz:final:item:q3');
  assert.deepEqual(A.parsePlace('urn:robocity:lesson:1-2:page:concept'), { kind: 'lesson', lesson: '1-2', page: 'concept' });
  assert.deepEqual(A.parsePlace('urn:robocity:site:farm:problem:3'), { kind: 'site', lab: 'farm', problem: 3 });
  assert.deepEqual(A.parsePlace('urn:robocity:site:farm:problem:3:step:2'), { kind: 'site', lab: 'farm', problem: 3, step: '2' });
  assert.deepEqual(A.parsePlace('urn:robocity:quiz:final:item:7'), { kind: 'quiz', quiz: 'final', item: '7' });
  assert.equal(A.parsePlace('https://x/y').kind, 'other');
  assert.equal(A.parsePlace('urn:robocity:site:farm:problem:x').kind, 'other');
  assert.throws(() => A.lessonObject('1 2'), RangeError);
  assert.throws(() => A.siteObject('a:b', 1), RangeError);
  assert.throws(() => A.statement({ verb: 'nope' as never, object: A.lessonObject('1-1') }), RangeError);
  assert.throws(() => A.statement({ verb: 'ran', object: 'urn:robocity:other:x' }), RangeError);

  const all: Statement[] = [
    A.events.pageOpened('1-2', 'concept', deps),
    A.events.lessonStarted('1-2', deps),
    A.events.problemStarted('factory', 1, A.uuid(), deps),
    A.events.answered(A.quizObject('1-2', 1), 'B', true, deps),
    A.events.answered(A.lessonObject('1-2', 'act1'), '가'.repeat(900), undefined, deps),
    A.events.completed(A.lessonObject('1-2'), deps),
    A.events.problemResult('factory', 1, false, { durationS: 12.34, values: { speed: 60, 'mode name': 'policy', ok: true, junk: { a: 1 } }, scaled: 2 }, deps),
    A.events.scored(A.quizObject('final', 'all'), 6, 7, true, deps),
    A.events.hint(A.siteObject('factory', 1), 2, deps),
    A.events.ran(A.siteObject('factory', 1), deps),
    A.events.operated(A.siteObject('factory', 1), 'mycobot280-rdkx5', deps),
    A.events.robotResult(A.lessonObject('p7-2'), 'mycobot280-rdkx5', { response: '같은 점에 5번 도착 · 흩어진 폭 0.8 mm (잰 각도로 계산)', values: { times: 5, spreadMm: 0.8 }, demo: true }, deps),
  ];
  for (const s of all) assert.equal(A.statementProblem(s), null, JSON.stringify(s));
  const pr = all[6];
  assert.equal(pr.verb.id, A.ADL_VERB + 'failed');
  assert.equal(pr.result?.duration, 'PT12.3S');
  assert.equal(pr.result?.score?.scaled, 1, 'scaled clamped');
  assert.deepEqual(pr.result?.extensions, { 'urn:robocity:val:speed': 60, 'urn:robocity:val:mode_name': 'policy', 'urn:robocity:val:ok': true });
  assert.equal(all[4].result?.response?.length, A.MAX_RESPONSE, 'long answers cut to 500');
  const rr = all[11];
  assert.equal(rr.verb.id, A.VERBS.operated.id);
  assert.deepEqual(rr.result?.extensions, { 'urn:robocity:val:times': 5, 'urn:robocity:val:spreadMm': 0.8 });
  assert.deepEqual(rr.context?.extensions, { 'urn:robocity:ctx:robot': 'mycobot280-rdkx5', 'urn:robocity:ctx:demo': true });
  assert.equal(all[0].timestamp, new Date(T0).toISOString());
  assert.equal(all[0].actor, undefined, 'the client never sets the actor');
  assert.equal(all[0].object.definition?.type, A.ACTIVITY_TYPES.page);
  assert.match(A.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const bad = (patch: Partial<Statement>) => A.statementProblem({ ...all[0], ...patch });
  assert.equal(bad({ id: 'X' }), 'id');
  assert.equal(bad({ verb: { id: 'http://x/verbs/hack' } }), 'verb');
  assert.equal(bad({ object: { objectType: 'Activity', id: 'https://evil' } }), 'object.id');
  assert.equal(bad({ timestamp: 'yesterday' }), 'timestamp');
  assert.equal(bad({ result: { duration: '12s' } }), 'result.duration');
  assert.equal(bad({ result: { extensions: { name: 'x' } } }), 'result.extensions: 키 형식');
  assert.equal(bad({ context: { registration: 'r' } }), 'context.registration');
}

/* --- queue ---------------------------------------------------------------------------------------- */
const mk = (i: number) => A.events.pageOpened('1-1', i, { now: () => T0, uuid: () => `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}` });
{
  let clock = T0;
  const sent: string[][] = [];
  let mode: 'ok' | 'down' | 'auth' | 'bad' | 'reject1' = 'ok';
  const store = A.memoryStore();
  const q = new A.EventQueue({
    key: 'q',
    store,
    batchSize: 3,
    maxItems: 8,
    now: () => clock,
    random: () => 1,
    send: async (batch) => {
      sent.push(batch.map((s) => s.id));
      if (mode === 'down') throw new Error('network');
      if (mode === 'auth') return { ok: false, retry: false, auth: true, error: '다시 로그인' };
      if (mode === 'bad') return { ok: false, retry: false, error: '형식' };
      if (mode === 'reject1') return { ok: true, rejected: [batch[0].id] };
      return { ok: true };
    },
  });
  assert.equal(q.push({ ...mk(0), id: 'bad' }), false, 'malformed refused');
  for (let i = 1; i <= 7; i++) assert.ok(q.push(mk(i)));
  assert.ok(q.push(mk(1)), 'same id again: kept once');
  assert.equal(q.pending(), 7);
  assert.ok(JSON.parse(store.data.q).items.length === 7, 'persisted');

  let r = await q.flush();
  assert.deepEqual([r.sent, r.dropped, r.error], [7, 0, null]);
  assert.deepEqual(sent.map((b) => b.length), [3, 3, 1], 'batches of 3');
  assert.equal(q.pending(), 0);

  // Down: kept, backoff 2 s, 4 s, … (random = 1 → full delay), not due before.
  mode = 'down';
  q.push(mk(10));
  r = await q.flush();
  assert.equal(r.sent, 0);
  assert.equal(q.state().failures, 1);
  assert.equal(q.state().nextAttemptAt, T0 + 2000);
  assert.equal(q.due(T0 + 1999), false);
  assert.equal(q.due(T0 + 2000), true);
  clock = T0 + 2000;
  await q.flush();
  assert.equal(q.state().nextAttemptAt, T0 + 2000 + 4000);
  assert.equal(q.backoff(20), A.QUEUE_DEFAULTS.maxDelayMs, 'capped');
  mode = 'ok';
  clock += 4000;
  r = await q.flush();
  assert.deepEqual([r.sent, q.pending(), q.state().failures, q.state().lastError], [1, 0, 0, null]);

  // A refused login stops sending until resume().
  mode = 'auth';
  q.push(mk(11));
  await q.flush();
  assert.equal(q.state().authNeeded, true);
  assert.equal(q.due(clock + 10 ** 9), false);
  const before = sent.length;
  await q.flush();
  assert.equal(sent.length, before, 'no send while the login is refused');
  mode = 'ok';
  q.resume();
  await q.flush();
  assert.equal(q.pending(), 0);

  // Refused statements are dropped and counted; a batch the server will never take is dropped.
  mode = 'reject1';
  q.push(mk(12));
  q.push(mk(13));
  r = await q.flush();
  assert.deepEqual([r.sent, r.dropped, q.pending()], [1, 1, 0]);
  mode = 'bad';
  q.push(mk(14));
  r = await q.flush();
  assert.deepEqual([r.dropped, q.pending()], [1, 0]);

  // The cap drops the oldest.
  mode = 'down';
  for (let i = 20; i < 30; i++) q.push(mk(i));
  assert.equal(q.pending(), 8);
  const st = q.state();
  assert.equal(st.dropped, 1 + 1 + 2);
  assert.equal(JSON.parse(store.data.q).items[0].id, mk(22).id);

  // Two tabs on one store: neither loses the other's events.
  const shared = A.memoryStore();
  const got: string[] = [];
  const send = async (b: Statement[]) => {
    got.push(...b.map((s) => s.id));
    return { ok: true } as const;
  };
  const tab1 = new A.EventQueue({ key: 'k', store: shared, send });
  const tab2 = new A.EventQueue({ key: 'k', store: shared, send });
  tab1.push(mk(40));
  tab2.push(mk(41));
  tab1.push(mk(42));
  assert.equal(tab2.pending(), 3);
  const [a, b] = [tab1.flush(), tab1.flush()];
  assert.equal(a, b, 'one flush at a time');
  await a;
  assert.deepEqual(got.sort(), [mk(40).id, mk(41).id, mk(42).id].sort());
  assert.equal(tab2.pending(), 0);
  // No store (private window): memory only, still works.
  const memQ = new A.EventQueue({ key: 'm', store: null, send });
  memQ.push(mk(50));
  assert.equal(memQ.pending(), 1);
  memQ.clear();
  assert.equal(memQ.pending(), 0);
  assert.equal(A.queueKeyFor({ classId: 'c_1', no: 7 }), 'account-queue:c_1:7');

  // autoFlush with fake timers.
  const timers: { fn: () => void; ms: number }[] = [];
  const auto = new A.EventQueue({ key: 'auto', store: A.memoryStore(), send, now: () => T0 });
  const stop = A.autoFlush(auto, { intervalMs: 3000, now: () => T0, timers: { setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {} } });
  auto.push(mk(60));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 3000);
  timers[0].fn();
  await new Promise((res) => setTimeout(res, 0));
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(auto.pending(), 0);
  stop();
}

/* --- client --------------------------------------------------------------------------------------- */
{
  assert.equal(A.normalizeServerAddress('192.168.0.10'), 'http://192.168.0.10:47290');
  assert.equal(A.normalizeServerAddress(' 192.168.0.10:8080 '), 'http://192.168.0.10:8080');
  assert.equal(A.normalizeServerAddress('http://teacher.local:47290/'), 'http://teacher.local:47290');
  assert.equal(A.normalizeServerAddress('http://10.0.0.80'), 'http://10.0.0.80:47290');
  assert.equal(A.normalizeServerAddress('http://10.0.0.5:80'), 'http://10.0.0.5');
  assert.equal(A.normalizeServerAddress('https://class.example.kr'), 'https://class.example.kr');
  for (const bad of ['', 'ftp://x', 'http://x/path', 'http://u:p@x', 'javascript:alert(1)', 'http://x?y=1'])
    assert.equal(A.normalizeServerAddress(bad), null, bad);
  assert.deepEqual(A.joinParams('?server=192.168.0.10&class=k7m4qx'), { server: 'http://192.168.0.10:47290', classCode: 'K7M4QX' });
  assert.deepEqual(A.joinParams('?class=<script>'), { server: null, classCode: null });
  assert.equal(A.joinLink('http://192.168.0.10:47290', 'K7M4QX'), 'http://192.168.0.10:47290/console?from=class&class=K7M4QX');

  type Call = { url: string; init?: RequestInit };
  const calls: Call[] = [];
  let reply: (c: Call) => Response | Promise<Response> = () => new Response('{}');
  const fakeFetch = async (url: string, init?: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return reply(c);
  };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const base = 'http://192.168.0.10:47290';
  const c = new A.ClassServerClient(base, { fetch: fakeFetch });

  reply = () =>
    json(200, {
      token: 'tok-1',
      expiresAt: T0 + 3600_000,
      role: 'student',
      student: { classId: 'c_1', classCode: 'K7M4QX', no: 7, actor: { objectType: 'Agent', account: { homePage: 'urn:x', name: 'K7M4QX-7' } } },
      class: { code: 'K7M4QX', name: '2학년 3반', openLessons: ['*'] },
    });
  const s = await c.loginStudent(' k7m4qx ', 7, '4821');
  const last = calls.at(-1)!;
  assert.equal(last.url, base + '/class-api/v1/login/student');
  assert.equal(last.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(last.init?.body)), { classCode: 'K7M4QX', no: 7, pin: '4821' });
  assert.equal(last.init?.credentials, 'omit', 'no cookies');
  assert.equal(s.role, 'student');
  assert.equal(s.baseUrl, base);

  reply = () => json(200, { accepted: 1, duplicate: 0, rejected: [] });
  await c.postEvents([mk(1)]);
  assert.equal((calls.at(-1)!.init?.headers as Record<string, string>).Authorization, 'Bearer tok-1');

  reply = () => json(401, { error: 'wrong', message: '학급 코드, 번호, PIN 을 다시 확인해 주세요.' });
  await assert.rejects(c.loginStudent('K7M4QX', 7, '0000'), (e: unknown) => e instanceof A.ClassApiError && e.status === 401 && e.code === 'wrong' && e.message.includes('PIN'));
  reply = () => json(429, { error: 'locked', message: '잠김', retryAfter: 60 }, { 'Retry-After': '60' });
  await assert.rejects(c.loginStudent('K7M4QX', 7, '0000'), (e: unknown) => e instanceof A.ClassApiError && e.code === 'locked' && e.retryAfter === 60);
  reply = () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(c.me(), (e: unknown) => e instanceof A.ClassApiError && e.offline);

  // The queue's sender: keep / retry / log in again.
  const sender = c.sender();
  const batch = [mk(1), mk(2)];
  reply = () => json(200, { accepted: 1, duplicate: 0, rejected: [{ i: 1, id: batch[1].id, reason: 'verb' }] });
  assert.deepEqual(await sender(batch), { ok: true, rejected: [batch[1].id] });
  reply = () => json(200, { accepted: 2, duplicate: 0, rejected: null });
  assert.deepEqual(await sender(batch), { ok: true, rejected: [] }, 'a null list from an older server is fine');
  reply = () => json(503, {});
  assert.deepEqual(await sender(batch), { ok: false, retry: true, error: '학급 서버 응답 503' });
  reply = () => json(401, { error: 'login', message: '다시 로그인해 주세요.' });
  assert.deepEqual(await sender(batch), { ok: false, retry: false, auth: true, error: '다시 로그인해 주세요.' });
  reply = () => json(400, { error: 'batch', message: 'x' });
  assert.deepEqual(await sender(batch), { ok: false, retry: false, error: 'x' });
  reply = () => {
    throw new TypeError('down');
  };
  assert.equal((await sender(batch)).ok, false);

  // Teacher calls and query strings.
  reply = () => json(200, { now: T0, students: [] });
  await c.live('c_1', { stuck: 4, idleMinutes: 10 });
  assert.equal(calls.at(-1)!.url, base + '/class-api/v1/classes/c_1/live?stuck=4&idle=10');
  reply = () => new Response('\uFEFF번호,시각\r\n', { status: 200 });
  assert.ok((await c.exportClass('c_1', 'csv')).startsWith('\uFEFF번호'));
  assert.equal(calls.at(-1)!.url, base + '/class-api/v1/classes/c_1/export?format=csv');
  reply = () => json(200, { ok: true });
  await c.deleteClass('c_1', 'K7M4QX');
  assert.equal(calls.at(-1)!.url, base + '/class-api/v1/classes/c_1?confirm=K7M4QX');
  assert.equal(calls.at(-1)!.init?.method, 'DELETE');

  // Finding the server: the page's own origin when it is a class server, else the saved address.
  reply = (call) => (call.url.startsWith('http://127.0.0.1:47280') ? json(404, {}) : json(200, { kind: A.SERVER_KIND }));
  assert.equal(await A.resolveServer({ pageOrigin: 'http://127.0.0.1:47280', saved: '192.168.0.10', fetch: fakeFetch }), base);
  reply = () => json(200, { kind: 'something-else' });
  assert.equal(await A.resolveServer({ pageOrigin: base, fetch: fakeFetch }), null);
}

/* --- live ----------------------------------------------------------------------------------------- */
{
  let seq = 0;
  const stored = (s: Statement, no: number, at: number): Statement => ({
    ...s,
    actor: { objectType: 'Agent', account: { homePage: 'urn:robocity:class-server:x', name: `K7M4QX-${no}` } },
    context: { ...s.context, extensions: { ...s.context?.extensions, [A.EXT_NO]: no } },
    stored: new Date(at).toISOString(),
    seq: ++seq,
  });
  let k = 0;
  const d = () => ({ now: () => T0, uuid: () => `00000000-0000-4000-9000-${String(++k).padStart(12, '0')}` });
  const min = 60_000;
  const evs = [
    stored(A.events.pageOpened('1-2', 'concept', d()), 1, T0),
    stored(A.events.problemResult('factory', 2, false, {}, d()), 1, T0 + min),
    stored(A.events.problemResult('factory', 2, false, {}, d()), 1, T0 + 2 * min),
    stored(A.events.hint(A.siteObject('factory', 2), 1, d()), 1, T0 + 2 * min),
    stored(A.events.problemResult('factory', 2, false, {}, d()), 1, T0 + 3 * min),
    stored(A.events.pageOpened('1-1', 'intro', d()), 2, T0),
    stored(A.events.completed(A.lessonObject('1-1'), d()), 2, T0 + min),
    stored(A.events.answered(A.quizObject('1-1', 1), '토크는 힘 × 거리', false, d()), 2, T0 + min),
  ];
  const state = A.createLiveState();
  A.applyStatements(state, evs.slice().reverse()); // order does not matter
  A.applyStatements(state, evs); // repeats ignored
  assert.equal(state.lastSeq, evs.length);
  let rows = A.liveRows(state, [1, 2, 3], T0 + 3 * min);
  assert.deepEqual(rows[0].place, { kind: 'site', lab: 'factory', problem: 2 });
  assert.deepEqual(rows[0].flags, ['stuck']);
  assert.equal(rows[0].stuckOn[0].fails, 3);
  assert.equal(rows[0].hintsHere, 1);
  assert.deepEqual(rows[1].flags, ['offline'], 'last heard 2 minutes ago');
  assert.equal(rows[1].completed, 1);
  assert.deepEqual(rows[2].flags, ['never']);
  assert.deepEqual(A.liveRows(state, [1], T0 + 3 * min, { stuckFails: 4 })[0].flags, [], 'threshold is an option');
  assert.equal(A.cellStatus(state, 1, A.siteObject('factory', 2)), 'stuck');
  assert.equal(A.cellStatus(state, 1, A.lessonObject('1-2')), 'started');
  assert.equal(A.cellStatus(state, 2, A.lessonObject('1-1')), 'done');
  assert.equal(A.cellStatus(state, 2, A.lessonObject('1-3')), 'none');
  assert.equal(A.latestAnswer(state, 2, A.quizObject('1-1', 1)), '토크는 힘 × 거리');

  // A pass clears stuck; quiet but heard from → idle; not heard → offline.
  A.applyStatements(state, [stored(A.events.problemResult('factory', 2, true, {}, d()), 1, T0 + 4 * min)]);
  A.markSeen(state, 2, T0 + 9 * min);
  rows = A.liveRows(state, [1, 2], T0 + 10 * min);
  assert.deepEqual(rows[0].flags, ['offline']);
  assert.deepEqual(rows[1].flags, ['idle']);
  assert.equal(A.cellStatus(state, 1, A.siteObject('factory', 2)), 'done');
  rows = A.liveRows(state, [1, 2], T0 + 4 * min + 30_000, {}, [2]);
  assert.deepEqual(rows[0].flags, []);
  assert.deepEqual(rows[1].flags, ['locked'], 'heard at 9 min is in the future here, so not idle');
  assert.deepEqual(A.flagCounts(A.buildLiveGrid(evs, [1, 2, 3], T0 + 3 * min)), { never: 1, offline: 1, idle: 0, stuck: 1, locked: 0, active: 1 });
  assert.equal(A.placeLabel(A.parsePlace(A.lessonObject('1-2', 'concept'))), '차시 1-2 · 개념');
  assert.equal(A.placeLabel(A.parsePlace(A.siteObject('farm', 1, 2)), { lab: { farm: '스마트팜' } }), '스마트팜 문제 1 · 2단계');
  assert.equal(A.placeLabel(A.parsePlace(A.quizObject('final', 3))), '마무리 평가 3번');
  assert.equal(A.placeLabel(null), '—');
  assert.equal(A.studentNoOf({ ...evs[0], context: undefined }), 1, '번호 from the actor name');
}

/* --- roster --------------------------------------------------------------------------------------- */
{
  const { roster, errors } = A.parseRosterText('\uFEFF번호,이름\r\n1,김민준\n2\t이서연\n3 박 지 호\n\n4,\nabc\n2,최하늘\n');
  assert.deepEqual(roster, { 1: '김민준', 2: '최하늘', 3: '박 지 호' });
  assert.equal(errors.length, 3, errors.join(' / '));
  const store = A.memoryStore();
  A.saveRoster(store, 'c_1', roster);
  assert.deepEqual(A.loadRoster(store, 'c_1'), roster);
  store.setItem(A.rosterKey('c_2'), '{"1":"ok","200":"x","__proto__":"y","3":5}');
  assert.deepEqual(A.loadRoster(store, 'c_2'), { 1: 'ok' });
  assert.deepEqual(A.loadRoster(store, 'nope'), {});
  A.clearRoster(store, 'c_1');
  assert.deepEqual(A.loadRoster(store, 'c_1'), {});
  const csv = A.rosterCsv({ 2: '=cmd|x', 1: '김"민준' });
  assert.equal(csv, '\uFEFF"번호","이름"\r\n1,"김""민준"\r\n2,"\'=cmd|x"\r\n');
  assert.deepEqual(A.withNames([{ no: 1 }, { no: 9 }], roster), [
    { no: 1, name: '김민준' },
    { no: 9, name: null },
  ]);
  const cards = A.loginCards({ code: 'K7M4QX', name: '2학년 3반' }, [
    { no: 2, pin: '5821' },
    { no: 1, pin: '0472' },
  ], roster);
  assert.deepEqual(
    cards.map((c) => [c.no, c.pin, c.name, c.classCode]),
    [
      [1, '0472', '김민준', 'K7M4QX'],
      [2, '5821', '최하늘', 'K7M4QX'],
    ],
  );
}

/* --- session and roles ---------------------------------------------------------------------------- */
{
  const store = A.memoryStore();
  const s: import('../../src/engine/account').Session = {
    role: 'student',
    token: 't',
    expiresAt: T0 + 3600_000,
    baseUrl: 'http://192.168.0.10:47290',
    student: { classId: 'c_1', classCode: 'K7M4QX', no: 7, actor: { objectType: 'Agent', account: { homePage: 'urn:x', name: 'K7M4QX-7' } } },
    class: { code: 'K7M4QX', name: '2학년 3반', openLessons: ['1-1', '1-2'] },
  };
  A.saveSession(store, s);
  assert.deepEqual(A.loadSession(store, T0), s);
  assert.equal(A.savedServerAddress(store), 'http://192.168.0.10:47290');
  assert.equal(A.loadSession(store, T0 + 3600_000), null, 'expired');
  assert.equal(store.getItem(A.SESSION_KEY), null, 'expired session removed');
  store.setItem(A.SESSION_KEY, '{"role":"student","token":"t","expiresAt":9e15,"baseUrl":"javascript:x"}');
  assert.equal(A.loadSession(store, T0), null);
  store.setItem(A.SESSION_KEY, 'not json');
  assert.equal(A.loadSession(store, T0), null);

  assert.ok(A.lessonOpen(s, '1-2') && !A.lessonOpen(s, '2-1'));
  assert.ok(A.lessonOpen(null, '2-1'), 'no class: everything open as before');
  assert.ok(A.lessonOpen({ ...s, class: { ...s.class, openLessons: ['*'] } }, '7-4'));
  assert.ok(A.can('student', 'sendEvents') && !A.can('student', 'seeTeacherContent') && !A.can('student', 'seeLive'));
  assert.ok(A.can('teacher', 'seeLive') && A.can('teacher', 'export') && !A.can('teacher', 'manageTeachers') && !A.can('teacher', 'configureSync'));
  assert.ok(A.can('operator', 'manageTeachers') && A.can('operator', 'seeAllClasses') && A.can('operator', 'configureSync'));
  assert.ok(A.can(null, 'learn') && !A.can(null, 'sendEvents'));
}

{
  // One learner's progress per student on a shared PC (profile.ts).
  const data = new Map<string, string>();
  const st = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  st.setItem('learn-done', '{"1-1":true}');
  st.setItem('lab-solved', '{"1":true}');
  st.setItem('learn-tone', 'mat');
  st.setItem('class-session', 'x');
  const kim = A.profileOf({ role: 'student', student: { classId: 'c1', no: 1 } });
  const lee = A.profileOf({ role: 'student', student: { classId: 'c1', no: 2 } });
  assert.equal(A.profileOf({ role: 'teacher' }), A.FREE_PROFILE);
  assert.ok(A.switchProfile(st, kim));
  assert.equal(st.getItem('learn-done'), null, 'a new student starts empty');
  assert.equal(st.getItem('learn-tone'), 'mat', 'settings stay');
  assert.equal(st.getItem('class-session'), 'x', 'the login stays');
  st.setItem('learn-done', '{"2-1":true}');
  assert.ok(A.switchProfile(st, lee));
  assert.equal(st.getItem('learn-done'), null, 'the next student does not see the last one');
  st.setItem('learn-done', '{"3-1":true}');
  assert.ok(!A.switchProfile(st, lee), 'already in use: nothing moves');
  A.switchProfile(st, kim);
  assert.equal(st.getItem('learn-done'), '{"2-1":true}', 'back to my own');
  A.switchProfile(st, A.FREE_PROFILE);
  assert.equal(st.getItem('learn-done'), '{"1-1":true}');
  assert.equal(st.getItem('lab-solved'), '{"1":true}', "the PC's own progress comes back");
  A.switchProfile(st, lee);
  assert.equal(st.getItem('learn-done'), '{"3-1":true}');
  console.log('  ✓ progress per student on a shared PC (profiles swap, settings stay)');
}

{
  // Handing the login over to a robot's page (session.ts).
  const s = {
    role: 'teacher',
    token: 't'.repeat(43),
    baseUrl: 'http://192.168.0.10:47290',
    expiresAt: Date.now() + 3600_000,
    user: { id: 'u1', username: '김선생', role: 'teacher' },
  } as unknown as Parameters<typeof A.sessionHandoff>[0];
  const h = A.sessionHandoff(s);
  const hash = `#${h}&carry=abc`;
  const back = A.readHandoff(hash, Date.now());
  assert.ok(back && back.token === s.token && back.baseUrl === s.baseUrl, 'the login comes through');
  assert.equal(A.withoutHandoff(hash), '#carry=abc', 'the rest of the fragment stays');
  assert.equal(A.readHandoff('#carry=abc', Date.now()), null);
  assert.equal(A.readHandoff('#class=%%%', Date.now()), null, 'garbage is ignored');
  assert.equal(A.readHandoff(hash, Date.now() + 7200_000), null, 'an expired login is not taken');
  console.log('  ✓ login handed over to a robot page in the fragment, checked, then removed');
}

/* --- 로봇 실습 7 real-robot results on the live grid ------------------------------------------- */
{
  const P = await import('../../src/engine/education/practice7');
  const min = 60_000;
  let n = 0;
  const at = (no: number, s: Statement, t: number): Statement => ({
    ...s,
    id: `00000000-0000-4000-8000-${String(5000 + ++n).padStart(12, '0')}`,
    stored: new Date(t).toISOString(),
    context: { ...s.context, extensions: { ...s.context?.extensions, [A.EXT_NO]: no } },
  });
  const res = (unit: 1 | 2 | 3 | 4 | 5 | 6 | 7, text: string, values: Record<string, unknown>, demo = false) =>
    A.events.robotResult(A.lessonObject(P.unitLesson(unit)), 'mycobot280-rdkx5', { response: text, values, demo });
  const evs = [
    at(1, res(2, '폭 1.4 mm', { times: 5, spreadMm: 1.4 }), T0),
    at(1, res(2, '폭 0.6 mm', { times: 5, spreadMm: 0.6 }), T0 + 2 * min),
    at(1, res(6, 'AI', { ms: 412, found: 3, top: 'cup' }), T0 + min),
    at(2, res(1, '차이', { maxErrDeg: 0.4, joint: 3 }, true), T0),
    at(2, A.events.operated(A.siteObject('factory', 1), 'mycobot280-rdkx5'), T0 + min),
  ];
  // Out of order: the newer 7-2 result wins either way.
  const rows = A.buildLiveGrid([evs[1], evs[0], ...evs.slice(2)], [1, 2, 3], T0 + 3 * min);
  assert.deepEqual(rows[0].robot.map((x) => [x.object, x.text]), [
    [A.lessonObject('p7-2'), '폭 0.6 mm'],
    [A.lessonObject('p7-6'), 'AI'],
  ]);
  assert.deepEqual(rows[0].robot[0].values, { times: 5, spreadMm: 0.6 }, 'values without the prefix');
  assert.equal(rows[1].robot.length, 1, 'an operated event without a result is not a measurement');
  assert.equal(rows[1].robot[0].demo, true);
  assert.deepEqual(rows[2].robot, []);
  assert.equal(P.realBrief(2, rows[0].robot[0].values), '5번 · 폭 0.6 mm');
  assert.equal(P.realBrief(1, rows[1].robot[0].values), '차이 최대 0.4° (J3)');
  assert.equal(P.realBrief(6, rows[0].robot[1].values), '412 ms · 3개');
  assert.equal(P.realBrief(4, {}), '블록 옮김', 'no values: still says what was done');
  assert.equal(P.unitOfLesson('p7-4'), 4);
  assert.equal(P.unitOfLesson('1-2'), null);
  console.log('  ✓ real-robot results (로봇 실습 7): newest per unit, values, demo marked, brief words');
}

console.log('account check: ok');
