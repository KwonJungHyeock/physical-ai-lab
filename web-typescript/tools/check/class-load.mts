/**
 * Load test of the teacher's class server (desktop-go -class): one class, N students (default 30) in a
 * "선생님과 함께" lesson for DURATION seconds, each client doing what the real screens do —
 *   students: GET /lead every 1.5 s (LEAD_POLL_MS), PUT /lead/me when the step changes (one robot PC per
 *             group, groups of about 4, at most 12), POST /events every 3 s (the queue's flush) with 1–3 statements;
 *   teacher:  GET /classes/{id}/lead every 1.5 s, the 학급 관리 grid (GET …/events after the last seq +
 *             GET …/live) every 1.5 s, the next step every STEP seconds.
 * Reported: requests, failures, latency per request (median · 95% · max), bytes, how long until every
 * student's screen showed a new step, and the server's CPU and memory (PID, when on this machine).
 *
 *   go run . -class -data <empty dir>                          (in desktop-go)
 *   CLASS=http://127.0.0.1:47290 N=30 DURATION=120 PID=<server pid> npx tsx tools/check/class-load.mts
 * Against a real classroom: run it on a PC on the classroom Wi-Fi with CLASS=http://<teacher PC>:47290.
 */
import { readFileSync } from 'node:fs';

const { events } = await import('../../src/engine/account/events');
const { LEAD_POLL_MS } = await import('../../src/engine/account/lead');

const CLASS = process.env.CLASS ?? 'http://127.0.0.1:47290';
const N = Number(process.env.N ?? 30);
const DURATION = Number(process.env.DURATION ?? 120) * 1000;
const STEP = Number(process.env.STEP ?? 15) * 1000;
const PID = process.env.PID;
const LESSON = 'p7-4';
const API = `${CLASS}/class-api/v1`;

type Stat = { ms: number[]; fail: number; bytes: number };
const stats = new Map<string, Stat>();
const errors = new Map<string, number>();

async function call<T>(kind: string, method: string, path: string, token?: string, body?: unknown): Promise<T | null> {
  const st = stats.get(kind) ?? { ms: [], fail: 0, bytes: 0 };
  stats.set(kind, st);
  const t0 = performance.now();
  try {
    const r = await fetch(API + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    st.ms.push(performance.now() - t0);
    st.bytes += text.length;
    if (!r.ok) {
      st.fail++;
      const k = `${kind} ${r.status} ${text.slice(0, 80)}`;
      errors.set(k, (errors.get(k) ?? 0) + 1);
      return null;
    }
    return (text ? JSON.parse(text) : {}) as T;
  } catch (e) {
    st.ms.push(performance.now() - t0);
    st.fail++;
    const k = `${kind} ${(e as Error).name}`;
    errors.set(k, (errors.get(k) ?? 0) + 1);
    return null;
  }
}
const must = async <T,>(kind: string, method: string, path: string, token?: string, body?: unknown) => {
  const r = await call<T>(kind, method, path, token, body);
  if (!r) throw new Error(`${method} ${path} 실패: ${[...errors.keys()].at(-1)}`);
  return r;
};

/* --- the class --------------------------------------------------------------------------------- */
const op = await must<{ token: string }>('setup', 'POST', '/setup', undefined, { username: 'admin', password: 'operator-pass-1' });
await must('setup', 'POST', '/teachers', op.token, { username: 'kim', password: 'teacher-pass-1' });
const t = await must<{ token: string }>('setup', 'POST', '/login/teacher', undefined, { username: 'kim', password: 'teacher-pass-1' });
const cls = await must<{ id: string; code: string }>('setup', 'POST', '/classes', t.token, { name: '부하 시험반' });
const issued = (await must<{ issued: { no: number; pin: string }[] }>('setup', 'POST', `/classes/${cls.id}/students`, t.token, { count: N })).issued;
const students: { no: number; token: string; group: number; robot: boolean }[] = [];
for (const s of issued) {
  const r = await must<{ token: string }>('login', 'POST', '/login/student', undefined, { classCode: cls.code, no: s.no, pin: s.pin });
  // Groups of about 4, at most 12 (the server's limit); the first student of each group is its robot PC.
  const groups = Math.min(12, Math.ceil(N / 4));
  students.push({ no: s.no, token: r.token, group: ((s.no - 1) % groups) + 1, robot: s.no <= groups });
}
console.log(`학급 ${cls.code}: 학생 ${students.length}명 로그인 · ${DURATION / 1000}초 · 단계 ${STEP / 1000}초마다`);

/* --- the lesson -------------------------------------------------------------------------------- */
let step = 0;
let stepAt = 0;
const seen = new Map<number, number>(); // student → when they saw the current step
const delays: number[] = [];
await must('lead PUT', 'PUT', `/classes/${cls.id}/lead`, t.token, { lesson: LESSON, step: 0, gate: false, reveal: false, stop: 0 });
stepAt = performance.now();

const end = performance.now() + DURATION;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.random() * LEAD_POLL_MS; // screens do not start at the same instant

const studentLoop = async (s: (typeof students)[number]) => {
  await sleep(jitter());
  let myStep = -1;
  let nextEvents = performance.now() + Math.random() * 3000;
  while (performance.now() < end) {
    const lead = await call<{ lead: { step: number } | null }>('student GET /lead', 'GET', '/lead', s.token);
    const now = performance.now();
    if (lead?.lead && lead.lead.step !== myStep) {
      myStep = lead.lead.step;
      if (myStep === step && !seen.has(s.no)) {
        seen.set(s.no, now);
        delays.push(now - stepAt);
      }
      await call('student PUT /lead/me', 'PUT', '/lead/me', s.token, {
        group: s.group,
        role: s.robot ? 'robot' : 'screen',
        lesson: LESSON,
        step: myStep,
        done: myStep > 0,
        help: false,
        answer: myStep % 2 ? 'B' : '',
        robot: s.robot ? (myStep > 1 ? 'done' : 'ready') : '',
        result: '',
      });
    }
    if (now >= nextEvents) {
      nextEvents = now + 3000;
      const n = 1 + Math.floor(Math.random() * 3);
      const statements = Array.from({ length: n }, (_, k) => events.pageOpened(LESSON, myStep * 10 + k));
      await call('student POST /events', 'POST', '/events', s.token, { statements });
    }
    await sleep(LEAD_POLL_MS);
  }
};

const teacherLoop = async () => {
  let lastSeq = 0;
  let nextStep = performance.now() + STEP;
  while (performance.now() < end) {
    await call('teacher GET lead', 'GET', `/classes/${cls.id}/lead`, t.token);
    const ev = await call<{ statements: { seq?: number }[]; next?: number }>('teacher GET events', 'GET', `/classes/${cls.id}/events?after=${lastSeq}`, t.token);
    if (ev?.statements?.length) lastSeq = Math.max(lastSeq, ...ev.statements.map((x) => x.seq ?? 0), ev.next ?? 0);
    await call('teacher GET live', 'GET', `/classes/${cls.id}/live`, t.token);
    if (performance.now() >= nextStep && step < 6) {
      // Who had not seen the last step before the next one: counted as never (a miss).
      step++;
      seen.clear();
      stepAt = performance.now();
      await call('teacher PUT lead', 'PUT', `/classes/${cls.id}/lead`, t.token, { lesson: LESSON, step, gate: false, reveal: false, stop: 0 });
      nextStep = stepAt + STEP;
    }
    await sleep(LEAD_POLL_MS);
  }
};

/* --- the server's CPU and memory -------------------------------------------------------------- */
const cpu: number[] = [];
const rss: number[] = [];
const tick = Number(process.env.CLK_TCK ?? 100);
const probe = async () => {
  if (!PID) return;
  let last: number | null = null;
  while (performance.now() < end) {
    try {
      const f = readFileSync(`/proc/${PID}/stat`, 'utf8').split(') ')[1].split(' ');
      const used = (Number(f[11]) + Number(f[12])) / tick;
      if (last !== null) cpu.push((used - last) * 100); // % of one core over 1 s
      last = used;
      const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${PID}/status`, 'utf8'));
      if (m) rss.push(Number(m[1]) / 1024);
    } catch {
      return;
    }
    await sleep(1000);
  }
};

await Promise.all([...students.map(studentLoop), teacherLoop(), probe()]);
await call('lead DELETE', 'DELETE', `/classes/${cls.id}/lead`, t.token);

/* --- report ------------------------------------------------------------------------------------ */
const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};
const f = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
console.log('\n| 요청 | 횟수 | 실패 | 중앙값 ms | 95% ms | 최대 ms | 한 번 평균 크기 |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
let total = 0;
let failed = 0;
for (const [k, st] of stats) {
  if (k === 'setup' || k === 'login') continue;
  total += st.ms.length;
  failed += st.fail;
  console.log(`| ${k} | ${st.ms.length} | ${st.fail} | ${f(q(st.ms, 0.5))} | ${f(q(st.ms, 0.95))} | ${f(Math.max(...st.ms))} | ${Math.round(st.bytes / Math.max(1, st.ms.length))} B |`);
}
const secs = DURATION / 1000;
console.log(`\n초당 요청 ${f(total / secs)} · 실패 ${failed}`);
console.log(`단계가 바뀐 뒤 학생 화면에 보이기까지: 중앙값 ${f(q(delays, 0.5))} ms · 95% ${f(q(delays, 0.95))} ms · 최대 ${f(Math.max(0, ...delays))} ms (${delays.length}번)`);
if (cpu.length) console.log(`서버 CPU (한 코어 기준): 평균 ${f(cpu.reduce((a, b) => a + b, 0) / cpu.length)}% · 최대 ${f(Math.max(...cpu))}% · 메모리 최대 ${f(Math.max(...rss))} MB`);
for (const [k, n] of errors) console.log(`  ✗ ${n}× ${k}`);
process.exit(failed ? 1 : 0);
