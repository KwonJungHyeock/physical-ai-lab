"""Classroom Wi-Fi and console updates from a USB stick: edit two lines on a PC, plug the stick in.

The stick carries a folder `eduino/` with `wifi.txt`:

    와이파이=EDUINO-LAB
    비밀번호=12345678
    사용자=3조 김민수

(`사용자` is optional: the name 로봇 찾기 shows next to the robot's address,
kept by robot_label.py; the older `이름=` still means the Wi-Fi name.)

(`와이파이=핫스팟` puts the robot back on its own hotspot, `와이파이=끔` turns its Wi-Fi off
for a classroom that uses only the LAN cable, and an empty `와이파이=` leaves the Wi-Fi as it is.) Installed once by
eduino/install.py, the `eduino-usb` service (root) looks at the USB sticks
every few seconds (mounting a stick itself when no desktop did); a stick whose
wifi.txt this robot has not applied yet is applied with wifi.py, the arm (or
the AGV) moves a little when it worked, and a result file with the robot's ID
and address is written back to the stick: `eduino/result-<robot name>.txt`
(an ASCII name: a FAT stick mounted without UTF-8 cannot take Korean ones).

A whole kit on the stick (eduino/robot_console.zip with its signature
robot_console.zip.sig, from tools/make_usb_kit.py) whose VERSION is newer than
~/robot_console/VERSION also updates the console first (kit_update.py): the
signature is checked with the public key already on the robot, the new console
is unpacked next to the old one, started and checked, and the old one is put
back when anything fails. The result file then also shows the version before
and after and how the update went.

The result file also records which wifi.txt it answers (a short checksum), so
one stick can go round every robot of a class, a stick left in is not applied
again at every power-on, and after a failure plugging it in again retries.
A kit is updated from only while it is newer than what the robot runs.

The eduino/ folder is looked for at the top of the stick and up to two folders
down (Windows "압축 풀기" into a folder makes X/eduino_usb/eduino/); when there
are several, the one whose kit is newest wins (else the newest wifi.txt).

Code is taken from a stick only from a kit signed with the project's key; from
any other stick only the Wi-Fi name, password and user name are read, so a
stranger's stick can at most move the robot to another Wi-Fi.

    sudo python3 usb_setup.py --watch          # the service
    sudo python3 usb_setup.py --once /media/x  # apply one stick now (also its update)
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

import kit_update
import lan
import robot_label
import wifi

KIT = "eduino"
CONFIG = "wifi.txt"
KIT_DEPTH = 2             # eduino/ is looked for this many folders below the top of the stick
SCAN_S = 3
BOOT_SETTLE_S = 60        # at power-on the boot service joins the classroom network first; do not race it
AUTOMOUNT_WAIT_S = 8      # a desktop mounts a new stick itself within a few seconds; after that we do
OWN_MOUNTS = "/run/eduino-usb"
NAME_KEYS = ("이름", "와이파이", "wifi", "ssid", "name")
PASS_KEYS = ("비밀번호", "암호", "password", "pass", "psk")
LABEL_KEYS = ("사용자", "사용자이름", "사용자 이름", "로봇이름", "로봇 이름", "user", "label")
HOTSPOT_WORDS = ("핫스팟", "hotspot")
OFF_WORDS = ("끔", "끄기", "off")
CHECK_LABEL = "확인값"
KIT_LABEL = "키트"
UPDATE_TEXT = {
    kit_update.UPDATED: "성공",
    kit_update.CURRENT: "이미 최신",
    kit_update.NO_KIT: "없음 — 이 USB 에 robot_console.zip 이 없어요",
    kit_update.UNSIGNED: "서명 없음 — USB 의 프로그램은 쓰지 않았어요",
    kit_update.BAD_SIGNATURE: "서명 잘못됨 — USB 의 프로그램은 쓰지 않았어요",
    kit_update.NO_OPENSSL: "건너뜀",
    kit_update.FAILED: "실패 → 이전 버전으로 되돌림",
}
RESTART_SELF = [False]    # an update changed this program: the service restarts once the stick is done

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


def _result_text(folder):
    path = result_path(folder)
    if os.path.islink(path):
        return ""
    try:
        with open(path, encoding="utf-8-sig") as f:
            return f.read(4096)
    except (OSError, UnicodeDecodeError):
        return ""


def already_applied(folder, check):
    """This robot answered this very wifi.txt before, and it worked."""
    text = _result_text(folder)
    return f"{CHECK_LABEL}: {check}" in text and "결과: 성공" in text


def tried_before(folder, kit):
    """This robot looked at this very kit before and could not update from it (refused or failed)."""
    return bool(kit) and f"({KIT_LABEL} {kit})" in _result_text(folder)


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


def _on_stick(mount, path):
    """Is path on the stick itself: no link on the way down, nothing leading off it?"""
    root = os.path.realpath(mount)
    if os.path.commonpath([root, os.path.realpath(path)]) != root:
        return False
    rel = os.path.relpath(path, mount)
    here = mount
    for part in rel.split(os.sep):
        if part in ("", "."):
            continue
        here = os.path.join(here, part)
        if os.path.islink(here):
            return False
    return True


def kit_folders(mount):
    """Every eduino/ folder with a wifi.txt or a kit: at the top and up to KIT_DEPTH folders down."""
    found = []
    for depth in range(KIT_DEPTH + 1):
        pattern = os.path.join(glob.escape(mount), *(["*"] * depth), KIT)
        for folder in sorted(glob.glob(pattern)):
            if not os.path.isdir(folder) or not _on_stick(mount, folder):
                continue
            if any(os.path.isfile(os.path.join(folder, n)) for n in (CONFIG, kit_update.ZIP)):
                found.append(folder)
    return found


def _kit_age(mount, folder):
    """Sort key of one eduino/ folder: its kit's VERSION first, then when its wifi.txt was saved."""
    try:
        version = kit_update.zip_version(kit_file(mount, kit_update.ZIP, folder))
    except OSError:
        version = ""
    try:
        saved = os.lstat(kit_file(mount, CONFIG, folder)).st_mtime
    except OSError:
        saved = 0
    return version[:15], saved


def kit_folder(mount):
    """The stick's eduino/ folder. Windows "압축 풀기" makes eduino_usb/eduino/, and into another folder
    X/eduino_usb/eduino/; an old copy may be left at the top. Of several, the newest kit wins
    (VERSION in its robot_console.zip), else the newest wifi.txt."""
    found = kit_folders(mount)
    if not found:
        return os.path.join(mount, KIT)
    if len(found) == 1:
        return found[0]
    return max(found, key=lambda folder: _kit_age(mount, folder))


def kit_file(mount, name, folder=None):
    """A file in the stick's eduino/ folder, refusing links that lead off the stick."""
    path = os.path.join(folder or kit_folder(mount), name)
    if os.path.islink(path) or not _on_stick(mount, path):
        raise OSError(f"{path}: 링크는 쓰지 않아요")
    return path


PC_PROGRAM = "Physical AI Tool.html"
_ROBOTS = re.compile(r"var ROBOTS = /\*ROBOTS\*/(\[.*?\]);")


def add_to_pc_program(mount, ips, folder=None):
    """List this robot in the stick's PC program, so a PC that copies it opens this robot at once.

    The program keeps its robots in one line, `var ROBOTS = /*ROBOTS*/[...];`; only that line changes.
    """
    if not ips:
        return
    try:
        path = kit_file(mount, PC_PROGRAM, folder)
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
    """The robot's network addresses, Wi-Fi first; not the fixed one for a cable straight to a PC (lan.py)."""
    return [ip for k, ip in lan.addresses() if k != "직결"]


def _wait(w):
    while w.lock.locked():
        time.sleep(0.5)
    return w.last or {}


def update_from_stick(mount, folder, retry=True):
    """The console update from this eduino/ folder's kit (kit_update.py); its outcome."""
    before = kit_update.installed_version()
    try:
        zip_path = kit_file(mount, kit_update.ZIP, folder)
        sig_path = kit_file(mount, kit_update.SIG, folder)
    except OSError as exc:
        return kit_update.outcome(kit_update.UNSIGNED, before, reason=str(exc))
    kit = kit_update.zip_version(zip_path) if os.path.isfile(zip_path) else ""
    if not retry and kit_update.newer(kit, before) and tried_before(folder, kit):
        return kit_update.outcome(kit_update.FAILED, before, kit=kit,
                                  reason="전에 안 된 키트라 켤 때는 다시 하지 않아요. USB 를 뺐다 꽂으면 다시 해요")
    result = kit_update.update(zip_path, sig_path, say)
    if result["status"] == kit_update.UPDATED and result["self_changed"]:
        RESTART_SELF[0] = True
    return result


def update_lines(result):
    """The result file's lines about the console version and the update."""
    if result is None:
        v = kit_update.installed_version()
        return [f"버전: {v or '표시 없음'}"]
    before, after = result["before"] or "표시 없음", result["after"] or "표시 없음"
    text = UPDATE_TEXT.get(result["status"], result["status"])
    if result["reason"]:
        text += f" — {result['reason']}"
    if result["kit"]:
        text += f" ({KIT_LABEL} {result['kit']})"
    return [f"버전: {before} → {after}" if before != after else f"버전: {after}", f"업데이트: {text}"]


def apply_wifi(path):
    """Apply one wifi.txt: (ok, message, label)."""
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
        ok, msg = None, "wifi.txt 의 '와이파이=' 가 비어 있어 Wi-Fi 는 그대로예요."
    elif ssid.lower() in OFF_WORDS:
        err = w.off()
        ok = err is None
        msg = "Wi-Fi 를 껐어요 (유선 LAN 으로만 연결). 다시 켜려면 와이파이= 에 Wi-Fi 이름이나 '핫스팟'을 적어 꽂으세요." if ok else err
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
    return ok, msg, label


def apply(mount, update=True, wifi_again=True, retry=True):
    """Apply one stick: the console update from a signed kit first (update=True), then eduino/wifi.txt
    (wifi_again=False: not again when this robot already applied this very wifi.txt; retry=False:
    not again a kit this robot could not update from before). Returns the Wi-Fi part's (ok, message)
    and writes the result next to it."""
    folder = kit_folder(mount)
    upd = update_from_stick(mount, folder, retry) if update else None
    try:
        path = kit_file(mount, CONFIG, folder)
        check = fingerprint(path)
    except OSError:
        path = check = None
    joined = False                              # the Wi-Fi was (re)applied just now
    if check is None:
        ok, msg, label = None, "이 USB 에 wifi.txt 가 없어 Wi-Fi 는 그대로예요.", robot_label.read_label()
    elif not wifi_again and already_applied(folder, check):
        ok, msg, label = True, "이 wifi.txt 는 전에 적용했어요 (Wi-Fi 그대로).", robot_label.read_label()
    else:
        ok, msg, label = apply_wifi(path)
        joined = True
    lan.ensure(say)
    ips = []
    if ok and joined:
        for _ in range(10):                     # the new address comes a moment after the join
            ips = addresses()
            if ips:
                break
            time.sleep(1)
    else:
        ips = addresses()
    updated = bool(upd) and upd["status"] == kit_update.UPDATED
    if (ok and joined) or updated:
        nod()                                   # once, whatever was done
    rid = ips[0].rsplit(".", 1)[1] if ips else "-"
    wifi_word = "성공" if ok else "실패" if ok is False else "그대로"
    lines = [
        time.strftime("%Y-%m-%d %H:%M"),
        f"로봇: {robot_name()}" + (f"   사용자: {label}" if label else ""),
        f"결과: {wifi_word} — {msg}",
        *update_lines(upd),
        f"로봇 ID: {rid}   주소: {lan.describe()}",
        f"PC 브라우저: http://{ips[0]}:8080/console" if ips else "",
        "PC 프로그램: 이 USB 의 eduino/Physical AI Tool.html 을 PC 바탕화면에 복사 → 더블클릭 → 이 로봇 [열기]" if ok else "",
        "실패하면 로봇은 원래 연결로 돌아가요. wifi.txt 를 고쳐 저장하고 다시 꽂으면 다시 해요." if ok is False else "",
        f"{CHECK_LABEL}: {check}" if check else "",
    ]
    try:
        out = kit_file(mount, os.path.basename(result_path("")), folder)
        fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0), 0o644)
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as f:
            f.write("\r\n".join(line for line in lines if line) + "\r\n")
        os.sync()
    except OSError as exc:
        say(f"[USB] 결과 파일을 쓰지 못했어요: {exc}")
    if ok:
        add_to_pc_program(mount, ips, folder)
        try:
            os.sync()
        except OSError:
            pass
    summary = f"{wifi_word} — {msg}"
    if upd:
        summary += f" / 업데이트: {UPDATE_TEXT.get(upd['status'], upd['status'])}"
    say(f"[USB] {mount}: {summary} (로봇 ID {rid})")
    return bool(ok), msg


def pending(mount, retry=True):
    """What this robot still has to do with the stick (a short key, so each plug-in is handled once), else None:
    a wifi.txt it has not applied yet, or a kit newer than the console it runs."""
    try:
        folder = kit_folder(mount)
    except OSError:
        return None
    try:
        check = fingerprint(kit_file(mount, CONFIG, folder))
    except OSError:
        check = None
    try:
        kit = kit_update.zip_version(kit_file(mount, kit_update.ZIP, folder))
    except OSError:
        kit = ""
    wifi_todo = bool(check) and not already_applied(folder, check)
    update_todo = kit_update.newer(kit, kit_update.installed_version()) and (retry or not tried_before(folder, kit))
    if not (wifi_todo or update_todo):
        return None
    return f"{check or '-'}/{kit or '-'}"


# ------------------------------------------------------------------ the service
def watch():
    """Handle each stick once per plug-in (again if wifi.txt changes while it is in, or it failed and is re-plugged).

    A stick already in at power-on is handled too; only a kit this robot could not update from
    before waits for the stick to be plugged in again (no stop-and-start of the server at every boot)."""
    lan.ensure(say)                     # at once: a cable straight to a PC works from power-on
    time.sleep(BOOT_SETTLE_S)
    done = {}        # device -> what was handled while this stick is in
    own_done = set() # devices we mounted ourselves once during this plug-in
    first_seen = {}  # device -> when it appeared unmounted
    at_start = set(usb_partitions())   # in since power-on
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
                retry = dev not in at_start
                check = pending(point, retry)
                if check and done.get(dev) != check:
                    done[dev] = check
                    apply(point, wifi_again=False, retry=retry)
            except Exception as exc:            # a bad stick must not stop the service
                say(f"[USB] {dev}: {exc}")
            finally:
                if own:
                    own_unmount(point)
            if RESTART_SELF[0]:
                RESTART_SELF[0] = False
                say("[USB] 업데이트로 이 프로그램도 바뀌어 eduino-usb 를 다시 시작해요.")
                if kit_update.restart_self() == 0:
                    return                      # systemd starts the new one
        for dev in set(done) | own_done | set(first_seen) | at_start:
            if dev not in present:              # pulled out: the next plug-in is looked at again
                done.pop(dev, None)
                own_done.discard(dev)
                first_seen.pop(dev, None)
                at_start.discard(dev)
        lan.ensure(say)                         # the LAN port's address for a cable straight to a PC
        time.sleep(SCAN_S)


if __name__ == "__main__":
    # Joining Wi-Fi can cut the SSH session this was started from: keep going without it.
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    if os.geteuid() != 0:
        raise SystemExit("관리자 권한이 필요해요: sudo python3 usb_setup.py ...")
    if len(sys.argv) >= 3 and sys.argv[1] == "--once":
        ok, _ = apply(sys.argv[2])
        if RESTART_SELF[0]:
            kit_update.restart_self()
        sys.exit(0 if ok else 1)
    elif len(sys.argv) >= 2 and sys.argv[1] == "--watch":
        watch()
    else:
        raise SystemExit(__doc__)
