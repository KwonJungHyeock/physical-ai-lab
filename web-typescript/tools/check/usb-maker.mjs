// 로봇 USB 만들기, end to end in the desktop program: ⚙ → [로봇 USB 만들기] on a stick (a folder standing in
// for it), the Wi-Fi filled from this PC's, [USB 만들기]; then what is on the stick is checked the way a robot
// reads it (robot-python/server: usb_setup.read_fields, kit_update.verify against the kit's signature). Two robots'
// result files are put on the stick (as usb_setup.apply writes them); opened again, the dialog shows them, and
// [연결] on one goes to the connect dialog's checks for that robot. Screenshots go to OUT.
//
//   1. the program with its kit:  KIT=… sh desktop-go/build.sh, or a Linux build of desktop-go with kit/eduino_usb.zip
//   2. run it on a folder:        PAI_USB_ROOTS="$USB" PAI_PC_WIFI=EDUINO-LAB ./program
//   3. USB="$USB" OUT=dir node tools/check/usb-maker.mjs
//      MANUAL=manuals/simulator/img also writes the manual's pictures (40–43-usb-*.png, cropped).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromiumPath, loadPlaywright } from "./inspect.mjs";

const OUT = process.env.OUT ?? ".";
const USB = process.env.USB;
const BASE = process.env.BASE ?? "http://127.0.0.1:47280";
if (!USB) throw new Error("USB=<the folder the program lists as a stick>");
mkdirSync(OUT, { recursive: true });
const MANUAL = process.env.MANUAL;
/** The manual's picture of one part of the screen. */
const manual = async (name, locator) => {
  if (MANUAL) await locator.screenshot({ path: path.join(MANUAL, name) });
};
const server = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../robot-python/server");

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1180 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "  ok" : "  ✗ "}  ${what}`);
  if (!ok) failed++;
};

await page.goto(`${BASE}/console?from=sim`, { waitUntil: "load", timeout: 240000 });
await page.getByRole("button", { name: "시뮬레이터로 시작" }).click({ timeout: 240000 }).catch(() => {});
await page.waitForFunction(() => document.querySelector("[class*=splash][data-done]"), null, { timeout: 240000 }).catch(() => {});
await page.getByRole("button", { name: "시뮬레이션만 (로봇 없이)" }).click({ timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);

const openMaker = async (shot) => {
  await page.locator('button[title="설정"]').click();
  if (shot) {
    await page.waitForTimeout(500);
    await manual(shot, page.locator("[class*=menuPop]"));
  }
  await page.getByRole("menuitem", { name: /로봇 USB 만들기/ }).click();
  const dlg = page.getByRole("dialog", { name: "로봇 USB 만들기" });
  await dlg.waitFor();
  await page.waitForTimeout(1200);
  return dlg;
};

/* --- 1. make the stick ------------------------------------------------------------------------- */
let dlg = await openMaker("40-usb-menu.png");
const ssid = dlg.getByRole("textbox").first();
check((await ssid.inputValue()) === "EDUINO-LAB", `Wi-Fi 이름이 이 PC 의 Wi-Fi 로 채워짐 ("${await ssid.inputValue()}")`);
check((await dlg.getByRole("radio").count()) === 1 && (await dlg.getByRole("radio").first().getAttribute("aria-checked")) === "true", "USB 하나 → 저절로 골라짐");
await dlg.getByPlaceholder("비밀번호가 없으면 비워 두기").fill("1234567");
check(await dlg.getByRole("button", { name: "USB 만들기", exact: true }).isDisabled(), "비밀번호 7자 → [USB 만들기] 잠김");
check((await dlg.innerText()).includes("8~63자"), "비밀번호 7자 → 이유가 보임");
await dlg.getByPlaceholder("비밀번호가 없으면 비워 두기").fill("eduino2026");
await dlg.getByPlaceholder(/예: 3조/).fill("1조");
await page.screenshot({ path: path.join(OUT, "usb-1-form.png") });
await manual("41-usb-make.png", dlg.locator("[class*=pickerBox]"));
await dlg.getByRole("button", { name: "USB 만들기", exact: true }).click();
await dlg.getByText("USB 를 만들었어요").waitFor({ timeout: 120000 });
await page.waitForTimeout(500);
const over = await dlg.evaluate((el) => { const box = el.querySelector("[class*=pickerBox]"); return box.scrollWidth - box.clientWidth; });
check(over <= 0, `다 됐어요 화면이 창 안에 들어옴 (넘침 ${over}px)`);
await page.screenshot({ path: path.join(OUT, "usb-2-done.png") });
await manual("42-usb-done.png", dlg.locator("[class*=pickerBox]"));

/* --- 2. the stick as a robot reads it ---------------------------------------------------------- */
const folder = path.join(USB, "eduino");
const py = (code, ...args) => execFileSync("python3", ["-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(server)}); ${code}`, ...args], { encoding: "utf8" }).trim();
const fields = JSON.parse(py("import usb_setup as u; print(json.dumps(u.read_fields(sys.argv[1]), ensure_ascii=False))", path.join(folder, "wifi.txt")));
check(fields.ssid === "EDUINO-LAB" && fields.password === "eduino2026" && fields.label === "1조", `로봇이 읽는 wifi.txt: ${JSON.stringify(fields)}`);
const sig = py(
  "import kit_update as k; print(k.verify(sys.argv[1], sys.argv[2], sys.argv[3])[0])",
  path.join(folder, "robot_console.zip"),
  path.join(folder, "robot_console.zip.sig"),
  path.join(server, "kit_signing_public.pem"),
);
check(sig === "True", `키트 서명 확인 (kit_update.verify): ${sig}`);
for (const f of ["install.py", "설치하기.desktop", "읽어보세요.txt", "Physical AI Tool.html", "checks"]) check(existsSync(path.join(folder, f)), `USB 에 ${f}`);
check(readFileSync(path.join(folder, "wifi.txt")).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "wifi.txt: 메모장용 BOM 그대로");

/* --- 3. two robots answered -------------------------------------------------------------------- */
const result = (lines) => "﻿" + lines.join("\r\n") + "\r\n";
writeFileSync(
  path.join(folder, "result-ubuntu-3a7f.txt"),
  result([
    "2026-10-14 09:12",
    "로봇: ubuntu-3a7f   사용자: 1조",
    "결과: 성공 — 'EDUINO-LAB' 에 연결했어요.",
    "버전: 20261002-101500-aaaaaaa → 20261014-051829-c782f72",
    "업데이트: 성공",
    "로봇 ID: 107   주소: 192.168.0.107",
    "PC 브라우저: http://192.168.0.107:8080/console",
    "확인값: 3f9c0a1b22e4",
  ]),
);
writeFileSync(
  path.join(folder, "result-ubuntu-9c01.txt"),
  result(["2026-10-14 09:20", "로봇: ubuntu-9c01", "결과: 실패 — 'EDUINO-LAB' 의 비밀번호가 맞지 않아요.", "버전: 20261014-051829-c782f72", "로봇 ID: -   주소: -"]),
);
await dlg.getByRole("button", { name: "닫기" }).click();
dlg = await openMaker();
check((await dlg.getByRole("tab", { name: /로봇 결과 보기/ }).getAttribute("aria-selected")) === "true", "결과가 있는 USB → [로봇 결과 보기] 로 열림");
const text = await dlg.innerText();
check(text.includes("로봇 2대 · 연결 1대 · 실패 1대"), "결과 요약: 2대 · 연결 1 · 실패 1");
check(text.includes("1조") && text.includes("로봇 ID 107") && text.includes("192.168.0.107"), "성공한 로봇: 사용자 · ID · 주소");
check(text.includes("비밀번호가 맞지 않아요"), "실패한 로봇: 이유");
await page.screenshot({ path: path.join(OUT, "usb-3-results.png") });
await manual("43-usb-results.png", dlg.locator("[class*=pickerBox]"));
await dlg.getByRole("button", { name: "연결" }).click();
const connect = page.getByRole("dialog", { name: "로봇 연결" });
await connect.waitFor({ timeout: 10000 });
await connect.getByText(/192\.168\.0\.107/).first().waitFor({ timeout: 30000 });
check(true, "[연결] → 로봇 연결 창이 그 로봇(192.168.0.107)을 확인함");
await page.screenshot({ path: path.join(OUT, "usb-4-connect.png") });

/* --- 4. made again: the old results go aside --------------------------------------------------- */
await connect.getByRole("button", { name: "닫기" }).click().catch(() => page.keyboard.press("Escape"));
dlg = await openMaker();
await dlg.getByRole("tab", { name: /USB 만들기/ }).click();
await dlg.getByRole("button", { name: "USB 만들기", exact: true }).click();
await dlg.getByText("USB 를 만들었어요").waitFor({ timeout: 120000 });
check((await dlg.innerText()).includes("예전 결과 2개"), "다시 만들면 예전 결과 2개는 「지난 결과」 로");
check(existsSync(path.join(folder, "지난 결과", "result-ubuntu-3a7f.txt")), "지난 결과/result-ubuntu-3a7f.txt");

/* --- 5. no robot on this Wi-Fi: the robot finder points here ---------------------------------- */
await dlg.getByRole("button", { name: "닫기" }).click();
await page.locator("button[class*=connPill]").click();
const finder = page.getByRole("dialog", { name: "로봇 연결" });
const hint = finder.getByRole("button", { name: /로봇이 아직 이 Wi-Fi 에 없나요/ });
// The program searches this PC's own networks at once; a PC without one (a test machine): press [로봇 찾기].
await hint.waitFor({ timeout: 8000 }).catch(() => finder.locator("form").getByRole("button", { name: "로봇 찾기" }).click());
await hint.waitFor({ timeout: 180000 }).catch(() => {});
check(await hint.isVisible(), "로봇을 못 찾으면 → [로봇이 아직 이 Wi-Fi 에 없나요?] 안내");
await page.screenshot({ path: path.join(OUT, "usb-5-finder.png") });
if (await hint.isVisible()) {
  await hint.click();
  check(await page.getByRole("dialog", { name: "로봇 USB 만들기" }).isVisible(), "안내를 누르면 로봇 USB 만들기가 열림");
}

check(errors.length === 0, `페이지 오류 ${errors.length}개${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
console.log(failed ? `usb maker: ${failed} problem(s)` : "usb maker: all OK");
process.exit(failed ? 1 : 0);
