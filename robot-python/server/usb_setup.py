"""Classroom Wi-Fi from a USB stick: edit two lines on a PC, plug the stick in.

The stick carries a folder `eduino/` with `wifi.txt`:

    와이파이=EDUINO-LAB
    비밀번호=12345678
    사용자=3조 김민수

(`사용자` is optional: the name 로봇 찾기 shows next to the robot's address,
kept by robot_label.py; the older `이름=` still means the Wi-Fi name.)

(`이름=핫스팟` puts the robot back on its own hotspot.) Installed once by
eduino/install.py, the `eduino-usb` service (root) looks at the USB sticks
every few seconds (mounting a stick itself when no desktop did); a stick whose
wifi.txt this robot has not applied yet is applied with wifi.py, the arm (or
the AGV) moves a little when it worked, and a result file with the robot's ID
and address is written back to the stick: `eduino/result-<robot name>.txt`
(an ASCII name: a FAT stick mounted without UTF-8 cannot take Korean ones).

The result file also records which wifi.txt it answers (a short checksum), so
one stick can go round every robot of a class, a stick left in is not applied
again at every power-on, and after a failure plugging it in again retries.

Only the Wi-Fi name and password are read from the stick — never code — so a
stranger's stick can at most move the robot to another Wi-Fi.

    sudo python3 usb_setup.py --watch          # the service
    sudo python3 usb_setup.py --once /media/x  # apply one stick now (install.py)
"""

import glob
import hashlib
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request

import robot_label
import wifi

KIT = "eduino"
CONFIG = "wifi.txt"
SCAN_S = 3
BOOT_SETTLE_S = 60        # at power-on the boot service joins the classroom network first; do not race it
AUTOMOUNT_WAIT_S = 8      # a desktop mounts a new stick itself within a few seconds; after that we do
OWN_MOUNTS = "/run/eduino-usb"
NAME_KEYS = ("이름", "와이파이", "wifi", "ssid", "name")
PASS_KEYS = ("비밀번호", "암호", "password", "pass", "psk")
LABEL_KEYS = ("사용자", "사용자이름", "사용자 이름", "로봇이름", "로봇 이름", "user", "label")
HOTSPOT_WORDS = ("핫스팟", "hotspot")
CHECK_LABEL = "확인값"

say = wifi._say


def read_config(path):
    """(ssid, password) from wifi.txt, whatever Windows Notepad saved it as; ssid None if not there."""
    fields = read_fields(path)
    return fields["ssid"], fields["password"]


def read_fields(path):
    """ssid, password and label (사용자) from wifi.txt."""
    with open(path, "rb") as f:
        raw = f.read(64 * 1024)
    text = ""
    encodings = ("utf-16",) if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else ("utf-8-sig", "cp949", "latin-1")
    for enc in encodings:                   # old Notepad: "Unicode" = UTF-16, "ANSI" = cp949
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    ssid = password = label = None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        key = key.lower()
        if key in NAME_KEYS:
            ssid = value or None
        elif key in PASS_KEYS:
            password = value
        elif key in LABEL_KEYS:
            label = value
    return {"ssid": ssid, "password": password or "", "label": robot_label.clean(label or "")}


def fingerprint(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read(64 * 1024)).hexdigest()[:12]


def robot_name():
    """Host name plus the end of the Wi-Fi address: every RDK X5 is called "ubuntu", so the name alone
    would let one robot's result stand for all of them."""
    tag = ""
    for path in sorted(glob.glob("/sys/class/net/wl*/address")) + sorted(glob.glob("/sys/class/net/e*/address")):
        try:
            with open(path, encoding="ascii") as f:
                mac = f.read().strip().replace(":", "")
        except OSError:
            continue
        if mac and mac.strip("0"):
            tag = mac[-4:]
            break
    if not tag:
        try:
            with open("/etc/machine-id", encoding="ascii") as f:
                tag = f.read().strip()[:4]
        except OSError:
            pass
    host = re.sub(r"[^A-Za-z0-9_.-]", "", socket.gethostname()) or "robot"
    return f"{host}-{tag}" if tag else host


def result_path(folder):
    return os.path.join(folder, f"result-{robot_name()}.txt")


def already_applied(folder, check):
    """This robot answered this very wifi.txt before, and it worked."""
    try:
        with open(result_path(folder), encoding="utf-8-sig") as f:
            text = f.read(4096)
    except (OSError, UnicodeDecodeError):
        return False
    return f"{CHECK_LABEL}: {check}" in text and "결과: 성공" in text


# ------------------------------------------------------------------ sticks
def _mounts():
    """{device: mount point} of everything mounted now."""
    out = {}
    try:
        with open("/proc/mounts", encoding="utf-8") as f:
            for line in f:
                dev, point = line.split()[:2]
                out.setdefault(dev, point.replace("\\040", " "))
    except OSError:
        pass
    return out


def usb_partitions():
    """/dev/sdXN of USB disks (the disk itself when it has no partitions), never the system disk."""
    mounted = _mounts()
    out = []
    for disk in sorted(os.listdir("/sys/block")) if os.path.isdir("/sys/block") else []:
        if not disk.startswith("sd") or "/usb" not in os.path.realpath(f"/sys/block/{disk}"):
            continue
        parts = sorted(p for p in os.listdir(f"/sys/block/{disk}") if p.startswith(disk))
        devs = [f"/dev/{p}" for p in parts] or [f"/dev/{disk}"]
        if any(mounted.get(d) in ("/", "/boot", "/boot/firmware") for d in devs):
            continue                            # a robot started from a USB disk
        out += devs
    return out


def own_mount(dev):
    """Mount a stick no desktop mounted (a robot with nobody logged in): only to read and write two files."""
    point = os.path.join(OWN_MOUNTS, os.path.basename(dev))
    os.makedirs(point, exist_ok=True)
    p = subprocess.run(["mount", "-o", "rw,nosuid,nodev,noexec", dev, point], capture_output=True, text=True)
    if p.returncode != 0:
        os.rmdir(point)
        return None
    return point


def own_unmount(point):
    subprocess.run(["umount", point], capture_output=True)
    try:
        os.rmdir(point)
    except OSError:
        pass


def kit_folder(mount):
    """The stick's eduino/ folder: at the top, or one folder down (Windows "압축 풀기" makes eduino_usb/eduino/)."""
    top = os.path.join(mount, KIT)
    for folder in [top] + sorted(glob.glob(os.path.join(glob.escape(mount), "*", KIT))):
        if os.path.isfile(os.path.join(folder, CONFIG)):
            return folder
    return top


def kit_file(mount, name):
    """A file in the stick's eduino/ folder, refusing links that lead off the stick."""
    root = os.path.realpath(mount)
    path = os.path.join(kit_folder(mount), name)
    real = os.path.realpath(path)
    if os.path.commonpath([root, real]) != root or os.path.islink(path):
        raise OSError(f"{path}: 링크는 쓰지 않아요")
    return path


PC_PROGRAM = "Physical AI Tool.html"
_ROBOTS = re.compile(r"var ROBOTS = /\*ROBOTS\*/(\[.*?\]);")


def add_to_pc_program(mount, ips):
    """List this robot in the stick's PC program, so a PC that copies it opens this robot at once.

    The program keeps its robots in one line, `var ROBOTS = /*ROBOTS*/[...];`; only that line changes.
    """
    if not ips:
        return
    try:
        path = kit_file(mount, PC_PROGRAM)
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return                                   # an older kit without the program
    m = _ROBOTS.search(text)
    if not m:
        return
    try:
        robots = [r for r in json.loads(m.group(1)) if isinstance(r, dict)]
    except ValueError:
        robots = []
    name = robot_name()
    me = {"id": ips[0].rsplit(".", 1)[1], "address": f"{ips[0]}:8080", "ips": ips, "name": name}
    robots = [r for r in robots if r.get("name") != name and r.get("address") != me["address"]] + [me]
    line = json.dumps(robots[-40:], ensure_ascii=False).replace("<", "\\u003c")
    tmp = path + ".tmp"
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o644)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text[:m.start(1)] + line + text[m.end(1):])
        os.replace(tmp, path)
    except OSError as exc:
        say(f"[USB] PC 프로그램에 로봇을 적지 못했어요: {exc}")
        try:
            os.remove(tmp)
        except OSError:
            pass


# ------------------------------------------------------------------ one stick
def nod():
    """Tell the person at the robot it worked: the console server moves the robot a little."""
    try:
        req = urllib.request.Request("http://127.0.0.1:8080/api/identify", data=b"{}", method="POST",
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5).read()
    except OSError:
        pass


def addresses():
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True).stdout.split()
    except OSError:
        return []
    return [ip for ip in out if ip.count(".") == 3 and not ip.startswith("127.")]


def _wait(w):
    while w.lock.locked():
        time.sleep(0.5)
    return w.last or {}


def apply(mount):
    """Apply eduino/wifi.txt of one stick; returns (ok, message). Writes the result next to it."""
    path = kit_file(mount, CONFIG)
    check = fingerprint(path)
    fields = read_fields(path)
    ssid, password, label = fields["ssid"], fields["password"], fields["label"]
    if label:                                   # the name first: it shows even if the Wi-Fi fails
        try:
            label = robot_label.write_label(label)
            say(f"[USB] 사용자 이름: {label}")
        except OSError as exc:
            say(f"[USB] 사용자 이름을 저장하지 못했어요: {exc}")
    label = label or robot_label.read_label()
    w = wifi.Wifi(False, say)
    if not ssid:
        ok, msg = False, "wifi.txt 의 '이름=' 뒤에 Wi-Fi 이름을 적어 주세요."
    elif ssid.lower() in HOTSPOT_WORDS:
        err = w.hotspot()
        last = {} if err else _wait(w)
        ok = err is None and last.get("state") == "ok"
        msg = "로봇 핫스팟으로 돌아갔어요." if ok else (err or last.get("error") or "핫스팟을 켜지 못했어요.")
    else:
        try:
            now = w.status()
        except RuntimeError:
            now = {}
        if now.get("mode") == "wifi" and now.get("ssid") == ssid:
            ok, msg = True, f"이미 '{ssid}' 에 연결돼 있어요."
        else:
            say(f"[USB] '{ssid}' 에 연결해요.")
            err = w.connect(ssid, password)
            last = {} if err else _wait(w)
            ok = err is None and last.get("state") == "ok"
            msg = f"'{ssid}' 에 연결했어요." if ok else (err or last.get("error") or "연결하지 못했어요.")
    ips = []
    if ok:
        for _ in range(10):                     # the new address comes a moment after the join
            ips = addresses()
            if ips:
                break
            time.sleep(1)
        nod()
    else:
        ips = addresses()
    rid = ips[0].rsplit(".", 1)[1] if ips else "-"
    lines = [
        time.strftime("%Y-%m-%d %H:%M"),
        f"로봇: {robot_name()}" + (f"   사용자: {label}" if label else ""),
        f"결과: {'성공' if ok else '실패'} — {msg}",
        f"로봇 ID: {rid}   주소: {', '.join(ips) or '-'}",
        f"PC 브라우저: http://{ips[0]}:8080/console" if ips else "",
        "PC 프로그램: 이 USB 의 eduino/Physical AI Tool.html 을 PC 바탕화면에 복사 → 더블클릭 → 이 로봇 [열기]" if ok else "",
        "" if ok else "실패하면 로봇은 원래 연결로 돌아가요. wifi.txt 를 고쳐 저장하고 다시 꽂으면 다시 해요.",
        f"{CHECK_LABEL}: {check}",
    ]
    try:
        out = kit_file(mount, os.path.basename(result_path("")))
        fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o644)
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as f:
            f.write("\r\n".join(line for line in lines if line) + "\r\n")
        os.sync()
    except OSError as exc:
        say(f"[USB] 결과 파일을 쓰지 못했어요: {exc}")
    if ok:
        add_to_pc_program(mount, ips)
        try:
            os.sync()
        except OSError:
            pass
    say(f"[USB] {mount}: {'성공' if ok else '실패'} — {msg} (로봇 ID {rid})")
    return ok, msg


def pending(mount):
    """The stick's wifi.txt fingerprint if this robot still has to apply it, else None."""
    try:
        path = kit_file(mount, CONFIG)
        check = fingerprint(path)
    except OSError:
        return None
    return None if already_applied(os.path.dirname(path), check) else check


# ------------------------------------------------------------------ the service
def watch():
    """Apply each stick once per plug-in (again if wifi.txt changes while it is in, or it failed and is re-plugged)."""
    time.sleep(BOOT_SETTLE_S)
    done = {}        # device -> fingerprint handled while this stick is in
    own_done = set() # devices we mounted ourselves once during this plug-in
    first_seen = {}  # device -> when it appeared unmounted
    while True:
        present = usb_partitions()
        mounted = _mounts()
        for dev in present:
            point = mounted.get(dev)
            own = False
            if not point:
                if dev in own_done:
                    continue                    # looked at once already: once per plug-in
                first_seen.setdefault(dev, time.time())
                if time.time() - first_seen[dev] < AUTOMOUNT_WAIT_S:
                    continue
                own_done.add(dev)
                point = own_mount(dev)
                if not point:
                    continue                    # not a file system we can read
                own = True
            try:
                check = pending(point)
                if check and done.get(dev) != check:
                    done[dev] = check
                    apply(point)
            except Exception as exc:            # a bad stick must not stop the service
                say(f"[USB] {dev}: {exc}")
            finally:
                if own:
                    own_unmount(point)
        for dev in set(done) | own_done | set(first_seen):
            if dev not in present:              # pulled out: the next plug-in is looked at again
                done.pop(dev, None)
                own_done.discard(dev)
                first_seen.pop(dev, None)
        time.sleep(SCAN_S)


if __name__ == "__main__":
    # Joining Wi-Fi can cut the SSH session this was started from: keep going without it.
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    if os.geteuid() != 0:
        raise SystemExit("관리자 권한이 필요해요: sudo python3 usb_setup.py ...")
    if len(sys.argv) >= 3 and sys.argv[1] == "--once":
        ok, _ = apply(sys.argv[2])
        sys.exit(0 if ok else 1)
    elif len(sys.argv) >= 2 and sys.argv[1] == "--watch":
        watch()
    else:
        raise SystemExit(__doc__)
