#!/usr/bin/env python3
"""One console at a time moves the arm (server.py Owner).

Starts the robot server in demo mode on a spare port and plays two PCs against it: PC A moves the arm,
PC B is refused (with A's name) while A's run goes on and for the lease after it, B's stop is always
taken, B gets the arm once A's lease is over, a console without an id is known by its address, and
/api/state names the holder. The lease is shortened for the test (LEASE_S, through --owner-lease).

    python3 robot-python/tools/check_robot_owner.py
"""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "..", "server", "server.py")
LEASE = 2.0


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = free_port()
BASE = f"http://127.0.0.1:{PORT}"


def call(path, body=None, console=None, name=None):
    headers = {"Content-Type": "application/json"}
    if console:
        headers["X-Console-Id"] = console
    if name:
        headers["X-Console-Name"] = urllib.parse.quote(name)
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers,
                                 method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def state():
    return call("/api/state")[1]


def wait_idle(limit=30):
    t0 = time.time()
    while time.time() - t0 < limit:
        if not state()["running"]:
            return
        time.sleep(0.2)
    raise SystemExit("✗ 실행이 끝나지 않아요")


passed = 0


def ok(cond, what):
    global passed
    if not cond:
        raise SystemExit(f"✗ {what}")
    passed += 1
    print(f"  ✓ {what}")


proc = subprocess.Popen([sys.executable, SERVER, "--demo", "--port", str(PORT), "--owner-lease", str(LEASE)],
                        cwd=os.path.dirname(SERVER), stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
try:
    for _ in range(100):
        try:
            if state().get("connected"):
                break
        except OSError:
            pass
        time.sleep(0.2)
    else:
        raise SystemExit("✗ 데모 로봇 서버가 켜지지 않아요")

    home = [0, 0, 0, 0, 0, 0]
    there = [20, 0, 0, 0, 0, 0]
    ok(state().get("owner") is None, "처음에는 쓰는 PC 없음")

    code, r = call("/api/move", {"angles": there, "speed": 30}, "pc-a", "3번 학생")
    ok(code == 200 and r["ok"], "PC A 가 움직임")
    ok((state().get("owner") or {}).get("name") == "3번 학생", "상태에 쓰는 PC 이름 (3번 학생)")

    code, r = call("/api/move", {"angles": home, "speed": 30}, "pc-b", "7번 학생")
    ok(code == 409 and "3번 학생" in r["error"], f"PC B 는 거절, 누가 쓰는지 알려 줌 ({r['error']})")
    code, r = call("/api/jog", {"joint": 1, "dir": 1, "speed": 20}, "pc-b", "7번 학생")
    ok(code == 409, "PC B 의 조그도 거절")
    code, r = call("/api/gripper", {"open": True}, "pc-b", "7번 학생")
    ok(code == 409, "PC B 의 도구 명령도 거절")

    code, r = call("/api/stop", {}, "pc-b", "7번 학생")
    ok(code == 200 and r["ok"], "PC B 의 정지는 언제나 받음")
    wait_idle()

    code, r = call("/api/move", {"angles": home, "speed": 30}, "pc-a", "3번 학생")
    ok(code == 200, "PC A 는 계속 쓸 수 있음")
    wait_idle()
    code, r = call("/api/move", {"angles": there, "speed": 30}, "pc-b", "7번 학생")
    ok(code == 409, "실행이 끝나도 잠깐(조작권 시간)은 PC A 의 것")

    time.sleep(LEASE + 0.5)
    ok(state().get("owner") is None, "조작권 시간이 지나면 쓰는 PC 없음")
    code, r = call("/api/move", {"angles": there, "speed": 30}, "pc-b", "7번 학생")
    ok(code == 200, "그 뒤 PC B 가 움직임")
    code, r = call("/api/move", {"angles": home, "speed": 30})
    ok(code == 409 and "7번 학생" in r["error"], "이름표 없는 요청(옛 화면 · 스크립트)도 거절")
    wait_idle()
    time.sleep(LEASE + 0.5)
    code, r = call("/api/move", {"angles": home, "speed": 30})
    ok(code == 200 and (state().get("owner") or {}).get("name") == "127.0.0.1", "이름표가 없으면 주소로 구분")
    wait_idle()
finally:
    proc.terminate()
    proc.wait(timeout=10)

print(f"robot owner: {passed} checks passed")
