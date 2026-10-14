// 로봇 실습 7 "선생님과 함께", end to end on a fresh class server: the teacher's screen and three students'
// screens in their own browsers. One student is the group's robot PC (the page the robot serves, the demo
// robot server). Walks lesson 7-4 step by step: the class follows every step, answers reach the teacher's
// rail, help requests show, the answer is revealed on every screen, the robot buttons stay locked until the
// teacher allows them, [■ 모든 로봇 정지] stops the robot mid-run, then it runs to the end; the next lesson
// carries the class along and [수업 끝내기] lets them go. Screenshots of both sides go to OUT.
//
//   1. class server:  go run . -class -data <empty dir> -dev-origin http://127.0.0.1:8090   (in desktop-go)
//   2. demo robot:    python3 server.py --demo --port 8090 --camera kit.jpg,hand.png       (robot-python/server)
//   3. OUT=dir node tools/check/lead-class.mjs
import { mkdirSync } from "node:fs";

import { chromiumPath, loadPlaywright } from "./inspect.mjs";

const OUT = process.env.OUT ?? ".";
const CLASS = process.env.CLASS ?? "http://127.0.0.1:47290";
const ROBOT = process.env.ROBOT ?? "http://127.0.0.1:8090";
mkdirSync(OUT, { recursive: true });

/* --- the class, through the API --------------------------------------------------------------- */
async function api(method, path, token, body) {
  const r = await fetch(`${CLASS}/class-api/v1${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok)
    throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const op = await api("POST", "/setup", null, {
  username: "admin",
  password: "operator-pass-1",
});
await api("POST", "/teachers", op.token, {
  username: "kim",
  password: "teacher-pass-1",
});
const t = await api("POST", "/login/teacher", null, {
  username: "kim",
  password: "teacher-pass-1",
});
const cls = await api("POST", "/classes", t.token, { name: "2학년 3반" });
const issued = (
  await api("POST", `/classes/${cls.id}/students`, t.token, { count: 3 })
).issued;
const teacherSession = {
  role: "teacher",
  token: t.token,
  expiresAt: t.expiresAt,
  baseUrl: CLASS,
  user: t.user,
};
const studentSession = async (no) => {
  const r = await api("POST", "/login/student", null, {
    classCode: cls.code,
    no,
    pin: issued.find((x) => x.no === no).pin,
  });
  return {
    role: "student",
    token: r.token,
    expiresAt: r.expiresAt,
    baseUrl: CLASS,
    student: r.student,
    class: r.class,
  };
};

/* --- the browsers -------------------------------------------------------------------------------- */
const { chromium } = await loadPlaywright();
// One browser per person: each draws its 3D in software, and one shared GPU process starves the others.
const browsers = [];
const errors = [];
async function open(name, url, session, viewport) {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  browsers.push(browser);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript(
    ([s, base]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("class-session", JSON.stringify(s));
      localStorage.setItem("class-server-address", base);
      localStorage.setItem("class-mode", "1");
    },
    [session, CLASS],
  );
  // This machine draws four pages' 3D in software on a few cores: frames at about 8 a second (animations
  // are timed by the clock, so they still finish on time) leave CPU for the rest. Test setup only.
  await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    // Every callback of an allowed frame runs; the frames between are skipped for all of them.
    let last = -1e9;
    let frame = -1;
    let open = false;
    window.requestAnimationFrame = (cb) =>
      raf(function tick(t) {
        if (t !== frame) {
          frame = t;
          open = t - last >= 120;
          if (open) last = t;
        }
        if (!open) return raf(tick);
        cb(t);
      });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() === 401 && r.url().includes("/class-api/"))
      console.log(
        `  ! ${name}: 401 ${r.url().replace(CLASS, "")} (${(r.request().headers().authorization ?? "").slice(7, 15)}…, 이 화면의 로그인 ${session.token.slice(0, 8)}…)`,
      );
  });
  await page.goto(url, { waitUntil: "load", timeout: 240000 });
  await page.waitForTimeout(5000);
  // The class server's page opens on the intro and waits for a choice (the robot's own page has none).
  if (!url.startsWith(ROBOT))
    await tap(page.getByRole("button", { name: "시뮬레이터로 시작" }));
  await page
    .waitForFunction(
      () => {
        const s = document.querySelector("[class*=splash]");
        return !s || s.hasAttribute("data-done");
      },
      null,
      { timeout: 240000 },
    )
    .catch(() => {});
  // The robot's page first connects to the robot (up to half a minute here); then the tabs show.
  await page
    .getByRole("tab", { name: /교육/ })
    .first()
    .waitFor({ timeout: 240000 });
  await tap(page.getByRole("button", { name: "나중에" }), 3000).catch(() => {});
  await tap(page.getByRole("tab", { name: /교육/ })).catch(async (e) => {
    await page.screenshot({ path: `${OUT}/fail-open.png` });
    const info = await page.evaluate(() =>
      [...document.querySelectorAll("[role=dialog],[aria-modal],[role=alert]")]
        .map(
          (d) =>
            `${d.getAttribute("role")}:${d.getAttribute("aria-label") ?? d.textContent?.slice(0, 60)}`,
        )
        .join(" | "),
    );
    throw new Error(
      `${name}: 교육 탭을 누를 수 없음 (${info}) ${e.message.split("\n")[0]}`,
    );
  });
  await page.waitForFunction(
    () => typeof window.__learnP7 === "function",
    null,
    { timeout: 120000 },
  );
  // 로봇 실습 7 right away (the 3D map behind it stops drawing).
  await page.evaluate(() => window.__learnP7());
  return page;
}
// A plain DOM click: four pages drawing 3D in software on a few cores rarely give Playwright the
// animation frames its "stable" check waits for, and a click needs none.
async function tap(loc, timeout = 30000) {
  const el = loc.first();
  await el.waitFor({ state: "attached", timeout });
  // A button still busy (the 3D is playing) is pressed once it is free.
  const h = await el.elementHandle();
  await h.evaluate(
    (n, ms) =>
      new Promise((ok, no) => {
        const t0 = Date.now();
        const k = () =>
          !n.disabled
            ? ok()
            : Date.now() - t0 > ms
              ? no(new Error("계속 눌 수 없음"))
              : setTimeout(k, 200);
        k();
      }),
    timeout,
  );
  await el.evaluate((n) =>
    n.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    ),
  );
}
/** Click a point of an element, as a fraction of its size (the hand-camera photo). */
async function tapAt(loc, fx, fy) {
  await loc.first().evaluate(
    (n, [x, y]) => {
      const r = n.getBoundingClientRect();
      n.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: r.left + x * r.width,
          clientY: r.top + y * r.height,
        }),
      );
    },
    [fx, fy],
  );
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const ok = (cond, what) => {
  if (!cond) throw new Error(`✗ ${what}`);
  console.log(`  ✓ ${what}`);
};
const text = (page) => page.evaluate(() => document.body.innerText);
const until = async (page, re, what, ms = 20000) => {
  await page
    .waitForFunction(
      (src) => new RegExp(src).test(document.body.innerText),
      re.source,
      { timeout: ms },
    )
    .catch(() => {});
  ok(re.test(await text(page)), what);
};

const teacher = await open(
  "선생님",
  `${CLASS}/console?from=class&role=teacher`,
  teacherSession,
  { width: 1600, height: 900 },
);
const s1 = await open(
  "1번 (로봇 PC)",
  `${ROBOT}/console`,
  await studentSession(1),
  { width: 1366, height: 768 },
);
const s2 = await open(
  "2번",
  `${CLASS}/console?from=class`,
  await studentSession(2),
  { width: 1366, height: 768 },
);
const s3 = await open(
  "3번",
  `${CLASS}/console?from=class`,
  await studentSession(3),
  { width: 1366, height: 768 },
);

try {
  console.log("수업 시작");
  await tap(teacher.getByRole("button", { name: "선생님과 함께 수업" }));
  await tap(teacher.getByRole("button", { name: /^7-4\./ }));
  await tap(teacher.getByRole("button", { name: "수업 시작 →" }));
  await until(teacher, /이렇게 말해요/, "선생님 화면: 진행 칸이 열림");

  for (const [page, group, role] of [
    [s1, "1조", "로봇 담당"],
    [s2, "1조", "화면으로 따라오기"],
    [s3, "2조", "화면으로 따라오기"],
  ]) {
    await tap(page.getByRole("button", { name: "함께하기 →" }));
    await tap(page.getByRole("button", { name: group, exact: true }));
    await tap(page.getByText(role, { exact: true }));
    await tap(
      page.getByRole("dialog").getByRole("button", { name: "함께하기 →" }),
    );
  }
  await until(s2, /사람은 컵을 집기 전에/, "학생 화면: 1단계를 따라옴");
  await until(teacher, /3 \/ 3명 들어옴/, "선생님 화면: 3명 들어옴");

  console.log("1 · 생각 열기 (고르기)");
  await tap(s1.getByRole("button", { name: /눈으로 컵을 본다/ }));
  await tap(s2.getByRole("button", { name: /손을 뻗는다/ }));
  await tap(s3.getByRole("button", { name: /눈으로 컵을 본다/ }));
  await until(
    teacher,
    /눈으로 컵을 본다\s*\n?\s*2명/,
    "선생님 화면: 고른 결과가 모임 (2명 · 1명)",
  );
  await shot(teacher, "lead-t1-open");
  await shot(s2, "lead-s1-open");

  console.log("2 · 로봇 눈으로 보기 (사진 누르기)");
  await tap(teacher.getByRole("button", { name: /다음 단계 열기/ }));
  await until(
    s2,
    /사진에서 블록 4개를 눌러 표시해요/,
    "학생 화면이 2단계로 넘어감",
  );
  const photo = s2.locator("[class*=photo][data-tap]");
  for (const [u, v] of [
    [246, 134],
    [222, 311],
    [406, 158],
    [381, 332],
  ])
    await tapAt(photo, u / 640, v / 480);
  await tap(s3.getByRole("button", { name: "✋ 도움이 필요해요" }));
  await until(teacher, /3번 ✋/, "선생님 화면: 3번 도움 요청");
  await until(s2, /다 했어요/, '2번: 블록 4개를 모두 찾아 "다 했어요"');
  await shot(s2, "lead-s2-see");
  await tap(teacher.getByRole("button", { name: "모든 화면에 정답 보이기" }));
  await teacher.waitForTimeout(2500);
  await shot(teacher, "lead-t2-see");

  console.log("3 · 자리 바꾸기 (A · B · C)");
  await tap(teacher.getByRole("button", { name: /다음 단계 열기/ }));
  await until(
    s2,
    /빨강 블록은 책상 위 어디일까요/,
    "학생 화면이 3단계로 넘어감",
  );
  await tap(s2.locator("g[data-cand=B]"));
  await tap(s3.locator("g[data-cand=A]"));
  await tap(s1.locator("g[data-cand=B]"));
  await teacher.waitForTimeout(3000);
  await tap(teacher.getByRole("button", { name: "모든 화면에 정답 보이기" }));
  await until(
    s2,
    /맞아요\. \(115, −75\) mm/,
    '2번 화면: 정답 공개 뒤 "맞아요"',
  );
  await until(s3, /답은 B 예요/, '3번 화면: 정답 공개 뒤 "답은 B"');
  await shot(teacher, "lead-t3-map");
  await shot(s3, "lead-s3-map");

  console.log("4 · 화면에서 먼저 (3D)");
  await tap(teacher.getByRole("button", { name: /다음 단계 열기/ }));
  await until(
    s1,
    /\[블록 찾기\] 다음 \[색깔별로 넣기\]/,
    "학생 화면이 4단계로 넘어감",
  );
  const stageBox = await s1
    .locator('section[aria-label="3D 실습 화면"][data-lead]')
    .boundingBox();
  ok(
    stageBox && stageBox.width > 300 && stageBox.height > 200,
    `1번 화면: 3D 가 제자리에 보임 (${Math.round(stageBox?.width ?? 0)}×${Math.round(stageBox?.height ?? 0)})`,
  );
  await tap(s1.getByRole("button", { name: /^1\s*블록 찾기/ }));
  await s1.waitForTimeout(1500);
  await tap(s1.getByRole("button", { name: /색깔별로 넣기/ }));
  await s1.waitForFunction(
    () => /다 했어요/.test(document.body.innerText),
    null,
    { timeout: 240000 },
  );
  ok(true, '1번: 시뮬레이션으로 4개를 넣고 "다 했어요"');
  await shot(s1, "lead-s4-sim");
  await tap(teacher.getByRole("button", { name: /블록 찾기/ }));
  await teacher.waitForTimeout(2500);
  await shot(teacher, "lead-t4-sim");

  console.log("5 · 실물로 (선생님 허락 · 모든 로봇 정지)");
  await tap(teacher.getByRole("button", { name: /다음 단계 열기/ }));
  await until(
    s1,
    /로봇 담당: 준비를 확인하고 실물로 해요/,
    "로봇 PC 가 5단계로 넘어감",
  );
  await until(s2, /몇 개가 맞는 상자에 들어갈까요/, "모둠원은 예상하기");
  ok(
    await s1.getByRole("button", { name: /① 실제 블록 찾기/ }).isDisabled(),
    "허락 전: 실물 버튼 잠김",
  );
  for (const c of [
    "로봇 둘레 50 cm 를 비웠어요",
    "흡착 펌프를 끼웠어요",
    "블록 4개를 작업판 가운데에 놓았어요",
  ])
    await tap(s1.getByRole("button", { name: c }));
  await tap(s2.locator("[class*=choices] button").nth(4));
  await until(teacher, /준비 끝/, '선생님 화면: 1조 "준비 끝"');
  ok(
    await s1.getByRole("button", { name: /① 실제 블록 찾기/ }).isDisabled(),
    "준비 끝이어도 허락 전에는 잠김",
  );
  await shot(teacher, "lead-t5-ready");
  await tap(
    teacher.getByRole("button", { name: /모든 조 로봇 움직여도 돼요/ }),
  );
  await s1.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("① 실제 블록 찾기"),
      )?.disabled,
    null,
    { timeout: 8000 },
  );
  ok(true, "허락 뒤: 실물 버튼 열림");
  const idle = (p, ms = 300000) =>
    p.waitForFunction(
      () =>
        ![...document.querySelectorAll("button")].some(
          (b) => b.textContent?.includes("■ 멈추기") && b.offsetParent,
        ),
      null,
      { timeout: ms },
    );
  await tap(s1.getByRole("button", { name: /① 실제 블록 찾기/ }));
  await s1.waitForTimeout(1000);
  await idle(s1);
  await until(s1, /블록 \d개를 찾았어요/, "로봇 PC: 실제 블록 찾음", 20000);
  await tap(s1.getByRole("button", { name: "② 시뮬레이션으로 확인" }));
  await s1.waitForFunction(
    () => /이제 \[실물로 옮기기\]/.test(document.body.innerText),
    null,
    { timeout: 300000 },
  );
  await tap(s1.getByRole("button", { name: /③ 실물로 옮기기/ }));
  await s1.waitForTimeout(6000);
  await until(teacher, /움직이는 중/, '선생님 화면: 1조 "움직이는 중"');
  await shot(teacher, "lead-t5-run");
  await tap(teacher.getByRole("button", { name: "■ 모든 로봇 정지" }));
  await until(s1, /멈췄어요/, "모든 로봇 정지 → 로봇 PC 의 실행이 멈춤", 10000);
  await until(
    teacher,
    /모든 조 로봇 움직여도 돼요/,
    "정지하면 허락도 다시 잠김",
  );
  const robotState = await (await fetch(`${ROBOT}/api/state`))
    .json()
    .catch(() => null);
  ok(robotState && !robotState.running, "데모 로봇 서버: 실행 중 아님");
  await tap(
    teacher.getByRole("button", { name: /모든 조 로봇 움직여도 돼요/ }),
  );
  await s1.waitForTimeout(2500);
  await tap(s1.getByRole("button", { name: /③ 실물로 옮기기/ }));
  await s1.waitForTimeout(3000);
  await idle(s1, 400000);
  await until(s1, /우리 조 실물 결과/, "로봇 PC: 끝까지 옮기고 결과", 15000);
  await until(teacher, /끝/, '선생님 화면: 1조 "끝"');
  await until(s2, /우리 조 로봇[\s\S]*끝/, '모둠원 화면: 우리 조 로봇 "끝"');
  await shot(teacher, "lead-t5-done");
  await shot(s1, "lead-s5-robot");
  await shot(s2, "lead-s5-member");

  console.log("6 · 정리 · 다음 수업 · 끝내기");
  await tap(teacher.getByRole("button", { name: /다음 단계 열기/ }));
  await until(s2, /확인 문제/, "학생 화면이 6단계로 넘어감");
  await tap(s2.getByRole("button", { name: "X", exact: true }));
  await tap(s3.getByRole("button", { name: "O", exact: true }));
  await teacher.waitForTimeout(3000);
  await tap(teacher.getByRole("button", { name: "모든 화면에 정답 보이기" }));
  await until(s3, /답은 X 예요/, '3번: 정답 공개 뒤 "답은 X"');
  await shot(teacher, "lead-t6-wrap");
  await shot(s2, "lead-s6-wrap");
  await tap(teacher.getByRole("button", { name: /다음 수업/ }));
  await until(
    s2,
    /얇고 평평한 카드를 집기 좋은 도구는/,
    "다음 수업(7-5)으로 학생 화면이 함께 넘어감",
  );
  await tap(teacher.getByRole("button", { name: "진행 칸 숨기기" }));
  await teacher.waitForTimeout(1500);
  await shot(teacher, "lead-t7-mirror");
  await tap(teacher.getByRole("button", { name: "진행 칸 보이기" }));
  await tap(teacher.getByRole("button", { name: "수업 끝내기" }));
  await tap(teacher.getByRole("button", { name: /정말 끝낼까요/ }));
  await until(
    s2,
    /선생님이 수업을 끝냈어요/,
    '학생 화면: "선생님이 수업을 끝냈어요"',
    10000,
  );
  await shot(s2, "lead-s7-ended");

  console.log("7 · 학급 관리: 로봇 PC 가 잰 실물 결과");
  // The robot PC's student sent what the robot did (events.robotResult) through the class's queue.
  let measured = null;
  for (let i = 0; i < 20 && !measured; i++) {
    const ev = await api("GET", `/classes/${cls.id}/events?after=0`, t.token);
    measured = ev.statements.find(
      (s) =>
        s.object.id === "urn:robocity:lesson:p7-4" &&
        s.verb.id.endsWith("operated") &&
        s.result?.response,
    );
    if (!measured) await new Promise((r) => setTimeout(r, 1000));
  }
  ok(
    measured &&
      measured.context.extensions["urn:robocity:ctx:no"] === 1 &&
      typeof measured.result.extensions["urn:robocity:val:blocks"] === "number",
    `학급 서버: 1번의 7-4 실물 결과 (${measured?.result?.response})`,
  );
  await tap(teacher.locator('button[title="선생님 계정"]'));
  await tap(teacher.getByRole("menuitem", { name: /학급 관리/ }));
  await until(teacher, /로봇 실습 7 · 실물 결과/, "학급 관리: 실물 결과 표", 30000);
  await until(teacher, /블록 \d개 옮김/, '학급 관리: 1번 7-4 "블록 N개 옮김"');
  await until(teacher, /실물 7-4 블록 \d개 옮김 \(데모\)/, "학생 카드: 데모 로봇 서버 표시");
  await teacher
    .locator("section[aria-label='로봇 실습 7 실물 결과']")
    .scrollIntoViewIfNeeded();
  await shot(teacher, "lead-t8-dashboard");
} catch (e) {
  // What every screen showed when it failed.
  for (const [n, p] of Object.entries({ teacher, s1, s2, s3 }))
    await p
      .screenshot({ path: `${OUT}/fail-${n}.png`, timeout: 20000 })
      .catch(() => {});
  console.log(`실패 화면: ${OUT}/fail-*.png`);
  throw e;
}
ok(
  errors.length === 0,
  `페이지 오류 ${errors.length}개${errors.length ? ": " + errors.join(" | ") : ""}`,
);
for (const b of browsers) await b.close();
console.log("lead-class: 모두 통과");
