"""Update ~/robot_console from a signed USB kit (run by usb_setup.py, the eduino-usb service, as root).

A kit built by tools/make_usb_kit.py with the signing key carries, in its eduino/ folder:

    robot_console.zip       the console: robot_console/... entries, with robot_console/VERSION
    robot_console.zip.sig   Ed25519 signature of the zip's bytes (openssl pkeyutl -sign -rawin)

VERSION is one line, `YYYYMMDD-HHMMSS-<git hash>` (UTC): it sorts by the build time.

When the stick's VERSION is newer than ~/robot_console/VERSION:
  1. the zip and its signature are copied off the stick and the copy is checked with
     kit_signing_public.pem of the console installed now (never a key from the stick),
     using the `openssl` command (OpenSSL 3)
  2. the copy is unpacked into ~/robot_console.new and its Python files are compiled;
     files in ~/robot_console that the kit does not ship (anything but *.py and static/)
     are carried over
  3. robot-console is stopped, ~/robot_console becomes ~/robot_console.prev, the new
     folder becomes ~/robot_console, robot-console is started
  4. GET /api/state must answer within HEALTH_S; on any failure ~/robot_console.prev is
     put back and started again

No signature, a bad one, or no openssl on the robot: nothing from the stick is used as code.
The calibration (~/.robot_console_calibration.json) and the other settings live outside
~/robot_console and are never touched.
"""

import json
import os
import py_compile
import re
import shutil
import stat
import subprocess
import tempfile
import time
import urllib.request
import zipfile

ZIP = "robot_console.zip"
SIG = ZIP + ".sig"
PREFIX = "robot_console/"                 # every entry of the zip (robots in the field use this name)
VERSION_FILE = "VERSION"
PUBLIC_KEY = "kit_signing_public.pem"
SERVICE = "robot-console.service"
SELF_SERVICE = "eduino-usb.service"
UNIT_FILE = "/etc/systemd/system/robot-console.service"
STATE_PATH = "/api/state"
DEFAULT_PORT = 8080
HEALTH_S = 60       # the real server starts in a few seconds; a slow first start must not undo the update
ZIP_MAX = 1 << 30
# the files the eduino-usb service itself runs: when an update changes one, the service restarts
SELF_FILES = ("usb_setup.py", "kit_update.py", "wifi.py", "robot_label.py")
# shipped with every kit: never carried over from the old folder
SHIPPED_DIRS = ("static", "__pycache__")
SHIPPED_SUFFIXES = (".py", ".pyc", ".pyo")

# The installed console (this file's folder); the self-test points it at a temporary folder.
CONSOLE_DIR = os.path.dirname(os.path.abspath(__file__))

_VERSION = re.compile(r"\d{8}-\d{6}(-[0-9A-Za-z][0-9A-Za-z.+-]{0,47})?")

# result codes (usb_setup.py writes the Korean text into the result file)
UPDATED, CURRENT, NO_KIT, UNSIGNED, BAD_SIGNATURE, NO_OPENSSL, FAILED = (
    "updated", "current", "no-kit", "unsigned", "bad-signature", "no-openssl", "failed")


def _log(text):
    try:
        print(text, flush=True)
    except OSError:
        pass


# ------------------------------------------------------------------ versions
def parse_version(text):
    """The version in a VERSION file's text, or '' when it is not one."""
    first = (text or "").strip().split("\n", 1)[0].strip()
    return first if _VERSION.fullmatch(first) else ""


def newer(kit, installed):
    """Is the kit's version newer than the installed one ('' = none: a robot set up before versions)?"""
    return bool(kit) and (not installed or kit[:15] > installed[:15])


def installed_version():
    try:
        with open(os.path.join(CONSOLE_DIR, VERSION_FILE), encoding="utf-8", errors="replace") as f:
            return parse_version(f.read(200))
    except OSError:
        return ""


def zip_version(path):
    """VERSION inside a robot_console.zip ('' when there is none or the file is not a zip)."""
    try:
        with zipfile.ZipFile(path) as z:
            with z.open(PREFIX + VERSION_FILE) as f:
                return parse_version(f.read(200).decode("utf-8", "replace"))
    except (OSError, KeyError, zipfile.BadZipFile, RuntimeError, ValueError):
        return ""


# ------------------------------------------------------------------ system (stubbed by the self-test)
def systemctl(*args):
    """Run systemctl; its exit code (127 when there is no systemctl)."""
    try:
        return subprocess.run(["systemctl", *args], capture_output=True, text=True, timeout=120).returncode
    except (OSError, subprocess.TimeoutExpired):
        return 127


def service_port():
    """The port robot-console listens on: --port in its unit (autostart.py passes it on), else 8080."""
    try:
        with open(UNIT_FILE, encoding="utf-8") as f:
            m = re.search(r"^ExecStart=.*?--port[ =](\d+)", f.read(), re.M)
        return int(m.group(1)) if m else DEFAULT_PORT
    except (OSError, ValueError):
        return DEFAULT_PORT


def healthy(port, wait_s=HEALTH_S):
    """Does the console server answer GET /api/state with JSON within wait_s seconds?"""
    deadline = time.time() + wait_s
    while True:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{STATE_PATH}", timeout=3) as r:
                if r.status == 200 and isinstance(json.loads(r.read(1 << 20)), dict):
                    return True
        except (OSError, ValueError):
            pass
        if time.time() >= deadline:
            return False
        time.sleep(1)


def has_openssl():
    return shutil.which("openssl") is not None


def verify(zip_path, sig_path, key_path):
    """(ok, reason): the Ed25519 signature of the zip's bytes, checked with the robot's public key."""
    try:
        p = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", key_path, "-rawin",
                            "-in", zip_path, "-sigfile", sig_path], capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"openssl 실행 실패: {exc}"
    if p.returncode == 0:
        return True, ""
    said = (p.stdout + p.stderr).strip()
    return False, "서명이 맞지 않아요" + (f" ({said.splitlines()[0][:100]})" if said else "")


# ------------------------------------------------------------------ files
def copy_off_stick(src, dst, limit=ZIP_MAX):
    """Copy one regular file off the stick (no links), so the stick cannot change it after the check."""
    fd = os.open(src, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as f:
        st = os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode):
            raise OSError(f"{os.path.basename(src)}: 보통 파일이 아니에요")
        if st.st_size > limit:
            raise OSError(f"{os.path.basename(src)}: 너무 커요 ({st.st_size // (1 << 20)} MB)")
        with open(dst, "wb") as out:
            shutil.copyfileobj(f, out, 1 << 20)
    return st.st_size


def unpack(zip_path, dest):
    """Unpack robot_console/... of a (verified) zip into dest, which must not exist yet."""
    with zipfile.ZipFile(zip_path) as z:
        infos = z.infolist()
        names = {i.filename for i in infos}
        for i in infos:
            n = i.filename
            parts = n.split("/")
            if (not n.startswith(PREFIX) or "\\" in n or ".." in parts or "" in parts[1:-1]
                    or stat.S_ISLNK(i.external_attr >> 16)):
                raise ValueError(f"키트 안의 이상한 경로: {n[:80]}")
        for need in ("usb_setup.py", VERSION_FILE):
            if PREFIX + need not in names:
                raise ValueError(f"키트에 {need} 가 없어요")
        os.mkdir(dest, 0o755)
        for i in infos:
            rel = i.filename[len(PREFIX):]
            if not rel:
                continue
            target = os.path.join(dest, *rel.rstrip("/").split("/"))
            if i.is_dir():
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(i) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out, 1 << 20)


def compile_all(folder, scratch):
    """py_compile every Python file of the new console (the .pyc go to scratch, not the user's folder)."""
    n = 0
    for root, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if d not in SHIPPED_DIRS)
        for name in sorted(files):
            if name.endswith(".py"):
                path = os.path.join(root, name)
                try:
                    py_compile.compile(path, cfile=os.path.join(scratch, f"c{n}.pyc"), doraise=True)
                except py_compile.PyCompileError as exc:
                    raise ValueError(f"{os.path.relpath(path, folder)} 컴파일 실패: {exc.msg.strip()[-160:]}") from None
                n += 1
    if not n:
        raise ValueError("키트에 파이썬 파일이 없어요")
    return n


def carry_over(old, new):
    """Copy what is in the old console folder but not in the kit (pictures for --camera, notes…).

    Nothing the servers write lives in their folder today (calibration, trim, the robot's name
    and the Wi-Fi state are in ~ and /etc); this keeps whatever a person put there."""
    kept = []
    for root, dirs, files in os.walk(old):
        rel_root = os.path.relpath(root, old)
        dirs[:] = sorted(d for d in dirs if d != "__pycache__" and not (rel_root == "." and d in SHIPPED_DIRS))
        for name in sorted(files):
            if name.endswith(SHIPPED_SUFFIXES):
                continue
            rel = os.path.normpath(os.path.join(rel_root, name))
            target = os.path.join(new, rel)
            if os.path.lexists(target):
                continue                         # the kit ships it: the new one wins
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copy2(os.path.join(root, name), target, follow_symlinks=False)
            kept.append(rel)
    return kept


def chown_tree(path, uid, gid):
    if os.geteuid() != 0:
        return
    os.lchown(path, uid, gid)
    for root, dirs, files in os.walk(path):
        for name in dirs + files:
            os.lchown(os.path.join(root, name), uid, gid)


def _sibling(suffix):
    return CONSOLE_DIR.rstrip("/") + suffix


def _remove(path):
    """Remove one of our own sibling folders (robot_console.new / .prev), nothing else."""
    if path not in (CONSOLE_DIR, _sibling(".new"), _sibling(".prev")) and not os.path.basename(path).startswith(".robot_console-update-"):
        raise ValueError(f"지우지 않아요: {path}")
    if os.path.islink(path):
        os.remove(path)
    elif os.path.isdir(path):
        shutil.rmtree(path)


def _same_file(a, b):
    try:
        with open(a, "rb") as fa, open(b, "rb") as fb:
            return fa.read() == fb.read()
    except OSError:
        return False


# ------------------------------------------------------------------ the update
def outcome(status, before, after=None, kit="", reason="", self_changed=False, kept=()):
    return {"status": status, "before": before, "after": before if after is None else after, "kit": kit,
            "reason": reason, "self_changed": self_changed, "kept": list(kept)}


def check(zip_path, sig_path):
    """What an update from this kit would be, without doing it: (status, kit version, reason)."""
    before = installed_version()
    if not zip_path or not os.path.isfile(zip_path):
        return NO_KIT, "", ""
    kit = zip_version(zip_path)
    if not newer(kit, before):
        return CURRENT, kit, "" if kit else "키트에 버전 표시가 없어요 (예전 키트)"
    if not sig_path or not os.path.isfile(sig_path):
        return UNSIGNED, kit, f"{SIG} 가 없어요"
    if not has_openssl():
        return NO_OPENSSL, kit, "로봇에 openssl 이 없어 서명을 확인할 수 없어요"
    return UPDATED, kit, ""


def update(zip_path, sig_path, log=_log):
    """Update the installed console from a kit on the stick when it is newer and signed; returns outcome()."""
    before = installed_version()
    status, kit, reason = check(zip_path, sig_path)
    if status != UPDATED:
        return outcome(status, before, kit=kit, reason=reason)
    parent = os.path.dirname(CONSOLE_DIR.rstrip("/"))
    new, prev = _sibling(".new"), _sibling(".prev")
    work = tempfile.mkdtemp(prefix=".robot_console-update-", dir=parent)
    swapped = False
    try:
        # 1. copy off the stick, then check the copy: what is unpacked is exactly what was checked
        local_zip, local_sig = os.path.join(work, ZIP), os.path.join(work, SIG)
        size = copy_off_stick(zip_path, local_zip)
        copy_off_stick(sig_path, local_sig, limit=4096)
        ok, why = verify(local_zip, local_sig, os.path.join(CONSOLE_DIR, PUBLIC_KEY))
        if not ok:
            return outcome(BAD_SIGNATURE, before, kit=kit, reason=why)
        kit = zip_version(local_zip)
        if not newer(kit, before):
            return outcome(CURRENT, before, kit=kit)
        log(f"[업데이트] 서명 확인: {kit} (지금 {before or '버전 없음'})")
        free = shutil.disk_usage(parent).free
        if free < 3 * size + (50 << 20):
            raise OSError(f"저장 공간이 모자라요 ({free >> 20} MB 남음)")
        # 2. the new folder next to the old one
        _remove(new)
        unpack(local_zip, new)
        n = compile_all(new, work)
        kept = carry_over(CONSOLE_DIR, new) if os.path.isdir(CONSOLE_DIR) else []
        owner = os.stat(CONSOLE_DIR if os.path.isdir(CONSOLE_DIR) else parent)
        chown_tree(new, owner.st_uid, owner.st_gid)
        log(f"[업데이트] {new} 준비: 파이썬 {n}개 컴파일 OK" + (f", 옮긴 파일 {len(kept)}개" if kept else ""))
        # 3. swap
        managed = os.path.exists(UNIT_FILE)
        if managed and systemctl("stop", SERVICE) != 0:
            # still running from the old folder, the check below would pass on the old server
            raise RuntimeError("robot-console 을 멈추지 못했어요")
        _remove(prev)
        swapped = True                           # from here on a failure puts .prev back
        if os.path.isdir(CONSOLE_DIR):
            os.rename(CONSOLE_DIR, prev)
        os.rename(new, CONSOLE_DIR)
        # 4. is it up?
        if managed:
            if systemctl("start", SERVICE) != 0:
                raise RuntimeError("robot-console 을 시작하지 못했어요")
            port = service_port()
            if not healthy(port, HEALTH_S):
                raise RuntimeError(f"새 서버가 {HEALTH_S}초 안에 대답하지 않았어요 (포트 {port}{STATE_PATH})")
            if systemctl("is-active", "--quiet", SERVICE) != 0:
                raise RuntimeError("새 서버가 켜졌다가 멈췄어요")
        changed = any(not _same_file(os.path.join(prev, f), os.path.join(CONSOLE_DIR, f)) for f in SELF_FILES)
        log(f"[업데이트] 성공: {before or '버전 없음'} → {kit}")
        return outcome(UPDATED, before, kit, kit=kit, self_changed=changed, kept=kept)
    except Exception as exc:
        reason = str(exc) or type(exc).__name__
        log(f"[업데이트] 실패: {reason}")
        if swapped:
            reason += rollback(log)
        else:
            try:
                _remove(new)
            except OSError:
                pass
        return outcome(FAILED, before, installed_version(), kit=kit, reason=reason)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def rollback(log=_log):
    """Put ~/robot_console.prev back and start it; '' or what went wrong on the way."""
    prev = _sibling(".prev")
    managed = os.path.exists(UNIT_FILE)
    try:
        if managed:
            systemctl("stop", SERVICE)
        if os.path.isdir(prev):
            _remove(CONSOLE_DIR)
            os.rename(prev, CONSOLE_DIR)
        _remove(_sibling(".new"))                # left over when the second rename failed
        if managed:
            systemctl("start", SERVICE)
        log("[업데이트] 이전 버전으로 되돌렸어요")
        return ""
    except Exception as exc:
        log(f"[업데이트] 되돌리기 실패: {exc}")
        return f" (되돌리기도 실패: {exc})"


def restart_self():
    """After the watcher's own files changed: restart eduino-usb without waiting for it (it is us)."""
    return systemctl("restart", "--no-block", SELF_SERVICE)
