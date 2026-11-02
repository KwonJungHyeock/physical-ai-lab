#!/usr/bin/env python3
"""Who may move a robot, and how far (server.py, agv_server.py).

Starts the arm server and the myAGV server in demo mode on spare ports and checks:
  - 로봇 찾기 [움직여 확인] (/api/identify) is taken from the robot's own page, the PC program's window
    (http://127.0.0.1:47280), a PC on a private address and the platform's web site, and refused (no CORS either)
    from any other web page; /api/state stays readable by every page;
  - 움직여 확인 from the PC holding the arm is not refused as "another PC" (it sends its console id);
  - joint angles are strict: 0.3° past a limit is refused with the server's own message (run, move,
    jog target, Python program), exactly at the limit is taken; a tool jog stops before a joint's limit;
  - the myAGV takes no text/plain or other-page POST (no preflight would guard it);
  - the dead-man time (DEADMAN_S) is 8 s, past the console's own "link lost" (~5 s).

    python3 robot-python/tools/check_robot_guard.py
"""

import ast
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.join(HERE, "..", "server")
EVIL = "https://evil.example"
PC = "http://127.0.0.1:47280"
CLASS = "http://192.168.0.5:47280"
WEB = "https://physical-ai-lab-lake.vercel.app"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def call(port, path, body=None, origin=None, ctype="application/json", console=None, method=None):
    """(status, json, headers)."""
    headers = {}
    if body is not None:
        headers["Content-Type"] = ctype
    if origin:
        headers["Origin"] = origin
    if console:
        headers["X-Console-Id"] = console
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, headers=headers,
                                 method=method or ("GET" if body is None else "POST"))
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}, r.headers
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}, e.headers
        except ValueError:
            return e.code, {}, e.headers


passed = 0


def ok(cond, what):
    global passed
    if not cond:
        raise SystemExit(f"✗ {what}")
    passed += 1
    print(f"  ✓ {what}")


def start(script, port, *extra):
    proc = subprocess.Popen([sys.executable, os.path.join(SERVER_DIR, script), "--demo", "--port", str(port), "--camera", "none", *extra],
                            cwd=SERVER_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(100):
        try:
            if call(port, "/api/state")[1].get("connected"):
                return proc
        except OSError:
            pass
        time.sleep(0.2)
    proc.terminate()
    raise SystemExit(f"✗ {script} 데모 서버가 켜지지 않아요")


def wait_idle(port, limit=30):
    t0 = time.time()
    while time.time() - t0 < limit:
        if not call(port, "/api/state")[1]["running"]:
            return
        time.sleep(0.2)
    raise SystemExit("✗ 실행이 끝나지 않아요")


# -- the dead-man time, from the source (importing server.py would load the camera and AI parts) --
with open(os.path.join(SERVER_DIR, "server.py"), encoding="utf-8") as f:
    tree = ast.parse(f.read())
deadman = next(n.value.value for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "DEADMAN_S")
ok(deadman == 8.0, f"DEADMAN_S = {deadman:g} s (콘솔이 '연결 끊김' 을 알리는 ~5 s 보다 넉넉히)")

ARM = free_port()
proc = start("server.py", ARM, "--owner-lease", "2")
try:
    print("로봇팔 서버 (데모)")
    # 1. 움직여 확인: which pages may ask
    code, r, h = call(ARM, "/api/identify", {}, origin=EVIL)
    ok(code == 403 and not h.get("Access-Control-Allow-Origin"), f"다른 웹 페이지({EVIL})의 움직여 확인은 거절 ({code})")
    code, _, h = call(ARM, "/api/identify", method="OPTIONS", origin=EVIL)
    ok(code == 404 and not h.get("Access-Control-Allow-Origin"), "그 페이지의 사전 요청(preflight)도 거절")
    code, r, h = call(ARM, "/api/identify", {}, origin=EVIL, ctype="text/plain")
    ok(code == 403, "text/plain 으로 보내도 거절")
    code, _, h = call(ARM, "/api/state", origin=EVIL)
    ok(code == 200 and h.get("Access-Control-Allow-Origin") == "*", "상태 읽기(로봇 찾기 목록)는 어느 페이지든 그대로")
    code, _, h = call(ARM, "/api/identify", method="OPTIONS", origin=PC)
    ok(code == 204 and h.get("Access-Control-Allow-Origin") == PC and h.get("Access-Control-Allow-Private-Network") == "true",
       "PC 프로그램 창의 사전 요청은 받음")
    for origin, who in ((PC, "PC 프로그램 창 (127.0.0.1:47280)"), (CLASS, "다른 PC (사설 주소)"), (WEB, "웹 사이트 (Vercel)"), (None, "로봇 자기 화면 (같은 주소)")):
        code, r, h = call(ARM, "/api/identify", {}, origin=origin)
        ok(code == 200 and r.get("ok") and (origin is None or h.get("Access-Control-Allow-Origin") == origin), f"{who} 의 움직여 확인은 받음")
        wait_idle(ARM)

    # 4. the PC holding the arm may ask it to show itself; another PC is told who holds it
    code, r, _ = call(ARM, "/api/move", {"angles": [10, 0, 0, 0, 0, 0], "speed": 50}, origin=PC, console="pc-a")
    ok(code == 200, "PC A 가 움직임 (조작권)")
    wait_idle(ARM)
    code, r, _ = call(ARM, "/api/identify", {}, origin=PC, console="pc-b")
    ok(code == 409 and "다른 PC" in (r.get("error") or ""), "PC B 의 움직여 확인은 'PC A 가 쓰는 중'")
    code, r, _ = call(ARM, "/api/identify", {}, origin=PC, console="pc-a")
    ok(code == 200 and r.get("ok"), "PC A 자신의 움직여 확인은 받음 (콘솔 id 를 보내면)")
    wait_idle(ARM)
    time.sleep(2.5)   # the lease is over

    # 3. strict joint limits
    lo = [-168, -135, -150, -145, -155, -180]
    hi = [168, 135, 150, 145, 160, 180]
    past = [0, hi[1] + 0.3, 0, 0, 0, 0]
    code, r, _ = call(ARM, "/api/move", {"angles": past, "speed": 30})
    ok(code == 409 and "범위" in (r.get("error") or ""), f"관절 한계 0.3° 밖 자세 이동은 거절 ({r.get('error')})")
    code, r, _ = call(ARM, "/api/run", {"actions": [{"type": "angles", "angles": [lo[0] - 0.3, 0, 0, 0, 0, 0], "speed": 30}]})
    ok(code == 409 and "범위" in (r.get("error") or ""), "프로그램 실행도 0.3° 밖이면 거절")
    code, r, _ = call(ARM, "/api/run", {"actions": [{"type": "timed", "t": 0, "cmd": "angles", "angles": [0, 0, 0, 0, hi[4] + 0.3, 0], "speed": 30}]})
    ok(code == 409 and "범위" in (r.get("error") or ""), "파이썬 프로그램 명령도 0.3° 밖이면 거절")
    code, r, _ = call(ARM, "/api/target", {"angles": [0, 0, 0, 0, 0, lo[5] - 0.3], "speed": 20})
    ok(code == 409 and "범위" in (r.get("error") or ""), "조그 목표도 0.3° 밖이면 거절")
    code, r, _ = call(ARM, "/api/move", {"angles": [0, hi[1], 0, 0, 0, 0], "speed": 50})
    ok(code == 200, "한계 딱 그 값은 받음")
    wait_idle(ARM)

    # a tool jog (jog_coord) stops before a joint's limit; the demo arm's y jog turns J1
    code, r, _ = call(ARM, "/api/move", {"angles": [hi[0] - 15, 0, 0, 0, 0, 0], "speed": 50})
    ok(code == 200, "J1 을 한계 15° 앞으로")
    wait_idle(ARM)
    t0, refused = time.time(), None
    while time.time() - t0 < 6:
        code, r, _ = call(ARM, "/api/jog", {"axis": "y", "dir": 1, "speed": 5})
        if code != 200:
            refused = r.get("error")
            break
        time.sleep(0.25)
    a1 = call(ARM, "/api/state")[1]["angles"][0]
    ok(refused and "한계" in refused, f"좌표 조그는 관절 한계 앞에서 멈추고 더 가지 않음 ({refused})")
    ok(a1 < hi[0], f"J1 {a1:.1f}° (한계 {hi[0]}° 전)")
    code, r, _ = call(ARM, "/api/jog", {"axis": "y", "dir": -1, "speed": 5})
    ok(code == 200, "반대쪽(한계에서 멀어지는) 좌표 조그는 됨")
    call(ARM, "/api/stop", {})
finally:
    proc.terminate()
    proc.wait(timeout=10)

AGV = free_port()
proc = start("agv_server.py", AGV)
try:
    print("이동 로봇 서버 (데모)")
    code, r, _ = call(AGV, "/api/drive", b'{"vx": 0.2}', ctype="text/plain")
    ok(code == 403, "text/plain 주행 명령은 거절 (사전 요청 없이 오는 요청)")
    code, r, _ = call(AGV, "/api/drive", {"vx": 0.2}, origin=EVIL)
    ok(code == 403, "다른 웹 페이지의 주행 명령은 거절")
    code, r, _ = call(AGV, "/api/identify", {}, origin=EVIL)
    ok(code == 403, "다른 웹 페이지의 로봇 찾기 움직임도 거절")
    code, r, _ = call(AGV, "/api/drive", {"vx": 0.2})
    ok(code == 200 and r.get("ok"), "로봇 자기 화면의 주행 명령은 받음")
    code, r, _ = call(AGV, "/api/drive", {"vx": 0.0}, origin=PC)
    ok(code == 200 and r.get("ok"), "PC 프로그램 창의 주행 명령은 받음")
    code, r, _ = call(AGV, "/api/stop", {})
    ok(code == 200, "정지는 받음")
finally:
    proc.terminate()
    proc.wait(timeout=10)

print(f"robot guard: {passed} checks passed")
