"""Self-test of the USB stick's console update and kit discovery, without a robot.

Development tool. Runs server/usb_setup.py and server/kit_update.py against temporary
folders for the stick, the home folder and ~/robot_console, with systemctl, the Wi-Fi,
the nod and (mostly) the health check stubbed out. Needs the `openssl` command (OpenSSL 3);
it makes its own throwaway key pair, never the real signing key.

    python3 robot-python/tools/check_usb_update.py        # PASS/FAIL per case, exit 1 on a failure
"""

import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(os.path.dirname(HERE), "server")
TMP = tempfile.mkdtemp(prefix="eduino-usb-check-")
os.environ["EDUINO_LABEL_FILE"] = os.path.join(TMP, "robot-name.txt")   # robot_label.py: not /etc
sys.path.insert(0, SERVER)
sys.dont_write_bytecode = True

import kit_update  # noqa: E402
import usb_setup  # noqa: E402

V0, V1, V2, V3 = "20260901-120000-0000000", "20261001-120000-aaaaaaa", "20261006-120000-bbbbbbb", "20261007-090000-ccccccc"
HOME = os.path.join(TMP, "home")
CONSOLE = os.path.join(HOME, "robot_console")
KEYS = os.path.join(TMP, "keys")
CALIBRATION = os.path.join(HOME, ".robot_console_calibration.json")
WIFI_TXT = "와이파이=EDUINO-LAB\r\n비밀번호=12345678\r\n사용자=3조\r\n"
SERVER_FILES = sorted(n for n in os.listdir(SERVER) if n.endswith(".py"))

results = []
calls = {"systemctl": [], "nod": 0, "wifi": 0}
HEALTH = [True]


# ------------------------------------------------------------------ fixtures
def openssl(*args):
    subprocess.run(["openssl", *args], check=True, capture_output=True)


def keys():
    os.makedirs(KEYS)
    for name in ("good", "other"):
        openssl("genpkey", "-algorithm", "ed25519", "-out", os.path.join(KEYS, f"{name}.pem"))
        openssl("pkey", "-in", os.path.join(KEYS, f"{name}.pem"), "-pubout", "-out", os.path.join(KEYS, f"{name}.pub.pem"))


def console_files(version, tweak=None):
    """{relative path: bytes} of a console: the real server/*.py, a stub screen, the test public key, VERSION."""
    files = {}
    for name in SERVER_FILES:
        with open(os.path.join(SERVER, name), "rb") as f:
            files[name] = f.read()
    with open(os.path.join(KEYS, "good.pub.pem"), "rb") as f:
        files[kit_update.PUBLIC_KEY] = f.read()
    files["static/console.html"] = b"<!doctype html><title>console</title>"
    files["VERSION"] = (version + "\n").encode() if version else None
    if tweak:
        tweak(files)
    return {k: v for k, v in files.items() if v is not None}


def make_zip(version, tweak=None):
    path = os.path.join(TMP, "build.zip")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data in sorted(console_files(version, tweak).items()):
            z.writestr("robot_console/" + rel, data)
    with open(path, "rb") as f:
        return f.read()


def sign(data, key="good"):
    src, sig = os.path.join(TMP, "sign.bin"), os.path.join(TMP, "sign.sig")
    with open(src, "wb") as f:
        f.write(data)
    openssl("pkeyutl", "-sign", "-inkey", os.path.join(KEYS, f"{key}.pem"), "-rawin", "-in", src, "-out", sig)
    with open(sig, "rb") as f:
        return f.read()


def reset(version=V1):
    """A fresh home: ~/robot_console at `version` with a person's file in it, and the calibration beside it."""
    if os.path.isdir(HOME):
        shutil.rmtree(HOME)
    os.makedirs(CONSOLE)
    for rel, data in console_files(version).items():
        path = os.path.join(CONSOLE, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    with open(os.path.join(CONSOLE, "kit.png"), "wb") as f:
        f.write(b"a picture for --camera")
    with open(CALIBRATION, "w", encoding="utf-8") as f:
        json.dump({"at": "2026-10-01"}, f)
    calls.update(systemctl=[], nod=0, wifi=0)
    HEALTH[0] = True
    usb_setup.RESTART_SELF[0] = False


def stick(name, folders):
    """A stick: {"eduino" | "X/eduino_usb/eduino": {"wifi": text|None, "zip": bytes|None, "sig": bytes|None}}."""
    mount = os.path.join(TMP, "sticks", name)
    if os.path.isdir(mount):
        shutil.rmtree(mount)
    os.makedirs(mount)
    for rel, kit in folders.items():
        folder = os.path.join(mount, rel)
        os.makedirs(folder)
        if kit.get("wifi") is not None:
            with open(os.path.join(folder, "wifi.txt"), "w", encoding="utf-8", newline="") as f:
                f.write(kit["wifi"])
        if kit.get("zip") is not None:
            with open(os.path.join(folder, kit_update.ZIP), "wb") as f:
                f.write(kit["zip"])
        if kit.get("sig") is not None:
            with open(os.path.join(folder, kit_update.SIG), "wb") as f:
                f.write(kit["sig"])
    return mount


def signed_kit(version, wifi=WIFI_TXT, tweak=None):
    data = make_zip(version, tweak)
    return {"wifi": wifi, "zip": data, "sig": sign(data)}


def installed():
    return kit_update.installed_version()


def result_text(mount, folder="eduino"):
    with open(os.path.join(mount, folder, "result-testbot-abcd.txt"), encoding="utf-8-sig") as f:
        return f.read()


def stopped():
    return ("stop", kit_update.SERVICE) in calls["systemctl"]


# ------------------------------------------------------------------ stubs
def fake_systemctl(*args):
    calls["systemctl"].append(args)
    return 0


def fake_nod():
    calls["nod"] += 1


def fake_wifi(path):
    calls["wifi"] += 1
    fields = usb_setup.read_fields(path)
    return True, f"'{fields['ssid']}' 에 연결했어요.", fields["label"]


REAL_HEALTHY = kit_update.healthy
kit_update.CONSOLE_DIR = CONSOLE
kit_update.UNIT_FILE = os.path.join(TMP, "robot-console.service")
kit_update.systemctl = fake_systemctl
kit_update.healthy = lambda port, wait_s=kit_update.HEALTH_S: HEALTH[0]
usb_setup.nod = fake_nod
usb_setup.apply_wifi = fake_wifi
usb_setup.addresses = lambda: ["192.168.0.42"]
usb_setup.robot_name = lambda: "testbot-abcd"
usb_setup.say = lambda text: None


def case(name):
    def wrap(fn):
        try:
            fn()
            results.append(("PASS", name, ""))
        except AssertionError as exc:
            results.append(("FAIL", name, str(exc)))
        except Exception as exc:
            results.append(("FAIL", name, f"{type(exc).__name__}: {exc}"))
        return fn
    return wrap


def check(cond, why):
    if not cond:
        raise AssertionError(why)


# ------------------------------------------------------------------ cases
def main():
    if not shutil.which("openssl"):
        sys.exit("openssl 명령이 없어요 (OpenSSL 3 필요).")
    keys()
    with open(kit_update.UNIT_FILE, "w", encoding="utf-8") as f:
        f.write("[Service]\nExecStart=/usr/bin/python3 /home/x/robot_console/server.py\n")

    @case("signed newer kit -> updated, .prev kept, user file carried over, calibration untouched")
    def _():
        reset(V1)
        before_cal = open(CALIBRATION, "rb").read()
        m = stick("newer", {"eduino": signed_kit(V2)})
        check(usb_setup.pending(m), "a newer kit should be pending")
        ok, _ = usb_setup.apply(m, wifi_again=False)
        check(ok, "wifi part should be ok")
        check(installed() == V2, f"installed {installed()} != {V2}")
        with open(os.path.join(CONSOLE + ".prev", "VERSION")) as f:
            check(f.read().strip() == V1, ".prev should hold the old version")
        check(os.path.isfile(os.path.join(CONSOLE, "kit.png")), "kit.png not carried over")
        check(not os.path.exists(CONSOLE + ".new"), ".new left behind")
        check(open(CALIBRATION, "rb").read() == before_cal, "calibration changed")
        check(calls["systemctl"] == [("stop", kit_update.SERVICE), ("start", kit_update.SERVICE),
                                     ("is-active", "--quiet", kit_update.SERVICE)], f"systemctl {calls['systemctl']}")
        check(calls["nod"] == 1, f"nodded {calls['nod']} times")
        t = result_text(m)
        check(f"버전: {V1} → {V2}" in t and "업데이트: 성공" in t, t)
        check("결과: 성공" in t and "확인값:" in t and "로봇 ID: 42" in t, "existing fields missing:\n" + t)
        check(not usb_setup.RESTART_SELF[0], "usb_setup.py did not change: no restart of eduino-usb")
        check(usb_setup.pending(m) is None, "the same stick must not update again (next boot)")
        check(usb_setup.pending(m, retry=False) is None, "nor when it was in at power-on")

    @case("update that changes usb_setup.py -> eduino-usb restarted with --no-block at the end")
    def _():
        reset(V1)

        def tweak(files):
            files["usb_setup.py"] += b"\n# changed\n"
        m = stick("self", {"eduino": signed_kit(V2, tweak=tweak)})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V2, "not updated")
        check(usb_setup.RESTART_SELF[0], "RESTART_SELF not set")
        kit_update.restart_self()
        check(calls["systemctl"][-1] == ("restart", "--no-block", kit_update.SELF_SERVICE), f"{calls['systemctl'][-1]}")

    @case("same version -> skipped (이미 최신), no stop")
    def _():
        reset(V2)
        m = stick("same", {"eduino": signed_kit(V2)})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V2 and not stopped(), "touched the console")
        check("업데이트: 이미 최신" in result_text(m), result_text(m))
        check(usb_setup.pending(m) is None, "wifi applied and kit current: nothing pending")

    @case("older version -> skipped (이미 최신), no stop")
    def _():
        reset(V2)
        m = stick("older", {"eduino": signed_kit(V0)})
        check(kit_update.check(os.path.join(m, "eduino", kit_update.ZIP), None)[0] == kit_update.CURRENT, "not current")
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V2 and not stopped(), "downgraded")
        check("업데이트: 이미 최신" in result_text(m), result_text(m))

    @case("tampered zip -> refused (서명 잘못됨), nothing touched")
    def _():
        reset(V1)
        kit = signed_kit(V2)
        data = bytearray(kit["zip"])
        data[len(data) // 2] ^= 0x01
        kit["zip"] = bytes(data)
        m = stick("tampered", {"eduino": kit})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V1 and not stopped() and not os.path.exists(CONSOLE + ".prev"), "touched the console")
        check("업데이트: 서명 잘못됨" in result_text(m), result_text(m))
        check(calls["nod"] == 1, "the Wi-Fi part still nods once")

    @case("signature by another key -> refused (서명 잘못됨)")
    def _():
        reset(V1)
        data = make_zip(V2)
        m = stick("otherkey", {"eduino": {"wifi": WIFI_TXT, "zip": data, "sig": sign(data, "other")}})
        r = kit_update.update(os.path.join(m, "eduino", kit_update.ZIP), os.path.join(m, "eduino", kit_update.SIG), lambda t: None)
        check(r["status"] == kit_update.BAD_SIGNATURE and installed() == V1 and not stopped(), f"{r}")

    @case("unsigned kit -> refused (서명 없음), no code used")
    def _():
        reset(V1)
        m = stick("unsigned", {"eduino": {"wifi": WIFI_TXT, "zip": make_zip(V2)}})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V1 and not stopped(), "updated from an unsigned kit")
        check("업데이트: 서명 없음" in result_text(m), result_text(m))
        check(usb_setup.pending(m, retry=False) is None, "in at power-on: an unsigned kit is not looked at again")
        check(usb_setup.pending(m) is not None, "re-plugged: looked at again")

    @case("no openssl on the robot -> skipped and said so")
    def _():
        reset(V1)
        m = stick("noopenssl", {"eduino": signed_kit(V2)})
        real = kit_update.has_openssl
        kit_update.has_openssl = lambda: False
        try:
            usb_setup.apply(m, wifi_again=False)
        finally:
            kit_update.has_openssl = real
        check(installed() == V1 and not stopped(), "updated without openssl")
        check("업데이트: 건너뜀 — 로봇에 openssl 이 없어" in result_text(m), result_text(m))

    @case("health check fails -> rolled back to .prev and restarted")
    def _():
        reset(V1)
        HEALTH[0] = False
        m = stick("unhealthy", {"eduino": signed_kit(V2)})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V1, f"installed {installed()} after a failed update")
        check(os.path.isfile(os.path.join(CONSOLE, "kit.png")), "user file lost in the rollback")
        check(not os.path.exists(CONSOLE + ".prev") and not os.path.exists(CONSOLE + ".new"), "leftover folders")
        check(calls["systemctl"][-2:] == [("stop", kit_update.SERVICE), ("start", kit_update.SERVICE)], f"{calls['systemctl']}")
        t = result_text(m)
        check("업데이트: 실패 → 이전 버전으로 되돌림" in t and "대답하지 않았어요" in t and f"버전: {V1}" in t, t)
        check(calls["nod"] == 1, "nod for the Wi-Fi part only")
        check(usb_setup.pending(m, retry=False) is None, "in at power-on: a failed kit is not tried again")
        check(usb_setup.pending(m) is not None, "re-plugged: tried again")

    @case("swap fails half-way (.new -> robot_console) -> .prev put back, no leftovers")
    def _():
        reset(V1)
        m = stick("halfswap", {"eduino": signed_kit(V2)})
        real_rename = os.rename

        def rename(src, dst):
            if src == CONSOLE + ".new" and dst == CONSOLE:
                raise OSError("simulated failure")
            return real_rename(src, dst)
        os.rename = rename
        try:
            usb_setup.apply(m, wifi_again=False)
        finally:
            os.rename = real_rename
        check(installed() == V1, f"installed {installed()}")
        check(not os.path.exists(CONSOLE + ".new") and not os.path.exists(CONSOLE + ".prev"), "leftover folders")
        check(calls["systemctl"][-1] == ("start", kit_update.SERVICE), f"{calls['systemctl']}")
        check("simulated failure" in result_text(m), result_text(m))

    @case("robot-console cannot be stopped -> failed, nothing swapped or started")
    def _():
        reset(V1)
        m = stick("nostop", {"eduino": signed_kit(V2)})

        def refuse_stop(*args):
            calls["systemctl"].append(args)
            return 5 if args[0] == "stop" else 0
        kit_update.systemctl = refuse_stop
        try:
            usb_setup.apply(m, wifi_again=False)
        finally:
            kit_update.systemctl = fake_systemctl
        check(installed() == V1 and not os.path.exists(CONSOLE + ".new"), "swapped anyway")
        check(calls["systemctl"] == [("stop", kit_update.SERVICE)], f"{calls['systemctl']}")
        check("멈추지 못했어요" in result_text(m), result_text(m))

    @case("kit that does not compile -> failed before stopping anything")
    def _():
        reset(V1)

        def tweak(files):
            files["server.py"] = b"def broken(:\n"
        m = stick("syntax", {"eduino": signed_kit(V2, tweak=tweak)})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V1 and not stopped() and not os.path.exists(CONSOLE + ".new"), "touched the console")
        check("server.py 컴파일 실패" in result_text(m), result_text(m))

    @case("zip whose entries leave robot_console/ -> refused even when signed")
    def _():
        reset(V1)
        path = os.path.join(TMP, "evil.zip")
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("robot_console/VERSION", V2 + "\n")
            z.writestr("robot_console/usb_setup.py", "x = 1\n")
            z.writestr("robot_console/../../evil.py", "x = 1\n")
        data = open(path, "rb").read()
        m = stick("evil", {"eduino": {"wifi": WIFI_TXT, "zip": data, "sig": sign(data)}})
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V1 and not os.path.exists(os.path.join(TMP, "evil.py")), "escaped")
        check("이상한 경로" in result_text(m), result_text(m))

    @case("kit files that are links -> refused")
    def _():
        reset(V1)
        m = stick("links", {"eduino": {"wifi": WIFI_TXT}})
        kit = signed_kit(V2)
        outside = os.path.join(TMP, "outside")
        os.makedirs(outside, exist_ok=True)
        for name, data in ((kit_update.ZIP, kit["zip"]), (kit_update.SIG, kit["sig"])):
            with open(os.path.join(outside, name), "wb") as f:
                f.write(data)
            os.symlink(os.path.join(outside, name), os.path.join(m, "eduino", name))
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V1 and not stopped(), "followed a link off the stick")

    @case("discovery: stale top-level eduino/ vs newer kit 2 levels down -> the newer")
    def _():
        reset(V1)
        m = stick("deep", {"eduino": signed_kit(V1, wifi="와이파이=OLD\r\n"),
                           "다운로드/eduino_usb/eduino": signed_kit(V3, wifi="와이파이=NEW\r\n")})
        check(usb_setup.kit_folder(m) == os.path.join(m, "다운로드", "eduino_usb", "eduino"), usb_setup.kit_folder(m))
        usb_setup.apply(m, wifi_again=False)
        check(installed() == V3, f"installed {installed()}")
        check(os.path.exists(os.path.join(m, "다운로드", "eduino_usb", "eduino", "result-testbot-abcd.txt")), "result in the wrong folder")

    @case("discovery: no VERSION anywhere -> the newest wifi.txt; 3 levels down is not looked at")
    def _():
        m = stick("mtime", {"eduino": {"wifi": "와이파이=OLD\r\n"}, "X/eduino": {"wifi": "와이파이=NEW\r\n"},
                            "a/b/c/eduino": {"wifi": "와이파이=TOO-DEEP\r\n"}})
        old = time.time() - 3600
        os.utime(os.path.join(m, "eduino", "wifi.txt"), (old, old))
        os.utime(os.path.join(m, "a", "b", "c", "eduino", "wifi.txt"), (time.time() + 60,) * 2)
        check(usb_setup.kit_folder(m) == os.path.join(m, "X", "eduino"), usb_setup.kit_folder(m))

    @case("discovery: a folder that is a link off the stick is ignored")
    def _():
        m = stick("linkdir", {"eduino": {"wifi": "와이파이=MINE\r\n"}})
        outside = os.path.join(TMP, "elsewhere", "eduino")
        os.makedirs(outside, exist_ok=True)
        with open(os.path.join(outside, "wifi.txt"), "w") as f:
            f.write("와이파이=STRANGER\r\n")
        os.symlink(os.path.dirname(outside), os.path.join(m, "zz"))
        check(usb_setup.kit_folder(m) == os.path.join(m, "eduino"), usb_setup.kit_folder(m))

    @case("wifi.txt-only stick -> applied once as before, again when wifi.txt changes")
    def _():
        reset(V1)
        m = stick("wifionly", {"eduino_usb/eduino": {"wifi": WIFI_TXT}})
        check(usb_setup.kit_folder(m) == os.path.join(m, "eduino_usb", "eduino"), "one folder down not found")
        check(usb_setup.pending(m), "a new wifi.txt should be pending")
        ok, _ = usb_setup.apply(m, wifi_again=False)
        check(ok and calls["wifi"] == 1 and calls["nod"] == 1, f"wifi {calls['wifi']} nod {calls['nod']}")
        check(not stopped() and installed() == V1, "touched the console")
        t = result_text(m, "eduino_usb/eduino")
        check("결과: 성공" in t and f"버전: {V1}" in t and "업데이트: 없음" in t and "확인값:" in t, t)
        check(usb_setup.pending(m) is None, "applied: not again")
        with open(os.path.join(m, "eduino_usb", "eduino", "wifi.txt"), "a", encoding="utf-8") as f:
            f.write("비밀번호=new-one\r\n")
        check(usb_setup.pending(m), "changed wifi.txt should be pending again")

    @case("install.py's call (apply(mount)) still applies wifi.txt every time")
    def _():
        reset(V1)
        m = stick("install", {"eduino": {"wifi": WIFI_TXT}})
        usb_setup.apply(m)
        usb_setup.apply(m)
        check(calls["wifi"] == 2, f"wifi applied {calls['wifi']} times")

    @case("watcher: a stick in at power-on with a newer kit is updated, then eduino-usb restarts itself")
    def _():
        reset(V1)

        def tweak(files):
            files["usb_setup.py"] += b"\n# changed\n"
        m = stick("boot", {"eduino": signed_kit(V2, tweak=tweak)})

        class Loop(Exception):
            pass
        ticks = [0]

        def fake_sleep(s):
            ticks[0] += 1
            if ticks[0] > 4:
                raise Loop()
        saved = usb_setup.usb_partitions, usb_setup._mounts, usb_setup.time
        usb_setup.usb_partitions = lambda: ["/dev/sdz1"]
        usb_setup._mounts = lambda: {"/dev/sdz1": m}
        usb_setup.time = type("T", (), {"sleep": staticmethod(fake_sleep), "time": staticmethod(time.time),
                                        "strftime": staticmethod(time.strftime)})
        try:
            usb_setup.watch()
            returned = True
        except Loop:
            returned = False
        finally:
            usb_setup.usb_partitions, usb_setup._mounts, usb_setup.time = saved
        check(installed() == V2, f"installed {installed()}")
        check(returned, "the loop should end after asking systemd to restart eduino-usb")
        check(calls["systemctl"][-1] == ("restart", "--no-block", kit_update.SELF_SERVICE), f"{calls['systemctl']}")
        check(calls["nod"] == 1, f"nodded {calls['nod']} times")

    @case("kit_update.healthy(): a real HTTP /api/state answer, and a dead port")
    def _():
        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                body = b'{"connected": false}' if self.path == "/api/state" else b"no"
                self.send_response(200 if self.path == "/api/state" else 404)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass
        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        real = REAL_HEALTHY
        check(real(srv.server_address[1], 3), "a live server should pass")
        srv.shutdown()
        srv.server_close()
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        dead = s.getsockname()[1]
        s.close()
        check(not real(dead, 1), "a dead port should fail")

    @case("kit_update.service_port(): --port from the robot-console unit")
    def _():
        with open(kit_update.UNIT_FILE, "w", encoding="utf-8") as f:
            f.write("[Service]\nExecStart=/usr/bin/python3 /home/x/robot_console/server.py --port 8081 --camera 0\n")
        check(kit_update.service_port() == 8081, f"{kit_update.service_port()}")
        with open(kit_update.UNIT_FILE, "w", encoding="utf-8") as f:
            f.write("[Service]\nExecStart=/usr/bin/python3 /home/x/robot_console/server.py\n")
        check(kit_update.service_port() == 8080, "default port")

    for status, name, why in results:
        print(f"{status}  {name}" + (f"\n      {why}" if why else ""))
    failed = sum(1 for r in results if r[0] == "FAIL")
    print(f"\n{len(results) - failed}/{len(results)} 통과" + (f", {failed} 실패" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(code)
