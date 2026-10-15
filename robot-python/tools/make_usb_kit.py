"""Build the USB kit: eduino_usb.zip, unpacked onto a USB stick as-is.

Development tool, not run on the robot. Build the console screens first
(`npm run build:robot` in web-typescript/), then:

    EDUINO_SIGNING_KEY=~/keys/eduino-kit-signing.pem python3 tools/make_usb_kit.py      # signed kit
    python3 tools/make_usb_kit.py --key ~/keys/eduino-kit-signing.pem -o dist/
    python3 tools/make_usb_kit.py                 # unsigned (a warning): robots do not update from it

eduino_usb.zip holds one folder, `eduino/`: install.py, 설치하기.desktop (double-click
on the robot's desktop: finds install.py on the stick and runs it with sudo in a terminal),
wifi.txt, 읽어보세요.txt (from robot-python/usb-kit/), robot_console.zip (robot-python/server/
with its static/ screens; unpacked on the robot as ~/robot_console/), robot_console.zip.sig
(its signature), checks/ (robot-python/checks/: pump, robot and network checks) and
"Physical AI Tool.html", the PC program (static/pc/physical-ai-tool.html: it
finds the robots on the classroom Wi-Fi and opens one; copy it to a PC's desktop).
The three manual PDFs (static/guides/*.pdf) are left out: they are in the PC program, and the
robot's server answers their links with a note saying so.
robot_console.zip also carries models/yolov5s.onnx, the AI sample's model (check 6; downloaded
once from the YOLOv5 v7.0 release into robot-python/server/models/ and checked against its SHA-256).
Text files meant for Windows Notepad are written with a UTF-8 BOM and CRLF
line ends. robot_console.zip (and its .sig) is also written on its own
for robots updated by hand.

Version and signature (server/kit_update.py, the robot's side):
- robot_console/VERSION in the zip: `YYYYMMDD-HHMMSS-<git short hash>` (build time, UTC; sorts by
  time; `-dirty` when the checkout had uncommitted changes). install.py leaves it in ~/robot_console/VERSION.
- robot_console.zip.sig: Ed25519 signature of the zip's bytes, made with the `openssl` command
  (OpenSSL 3: `openssl pkeyutl -sign -rawin`). The private key comes from --key or the environment
  variable EDUINO_SIGNING_KEY and never from (or into) the repository; its public half is
  server/kit_signing_public.pem, which every robot already has. A robot with the eduino-usb service
  updates itself from a stick only when the kit is signed and newer than what it runs.
"""

import argparse
import hashlib
import io
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
REPO = os.path.dirname(PY)
CONSOLE = os.path.join(PY, "server")
KIT_SRC = os.path.join(PY, "usb-kit")
CHECKS = os.path.join(PY, "checks")
NOTEPAD = ("wifi.txt", "읽어보세요.txt")
LAUNCHER = "설치하기.desktop"
REQUIRED = ("server.py", "agv_server.py", "wifi.py", "usb_setup.py", "kit_update.py", "autostart.py",
            "kit_signing_public.pem", "static/console.html", "static/agv.html", "static/pc/physical-ai-tool.html")
PC_PROGRAM = os.path.join(CONSOLE, "static", "pc", "physical-ai-tool.html")
PUBLIC_KEY = os.path.join(CONSOLE, "kit_signing_public.pem")
YOLO_MODEL = os.path.join(CONSOLE, "models", "yolov5s.onnx")
YOLO_URL = "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.onnx"
YOLO_SHA256 = "8bc25a47abdbe2fd23e30eb948746bf856b031ea3cc815166687f52db9f8c659"
KEY_ENV = "EDUINO_SIGNING_KEY"


def yolo_model():
    """The AI sample's model in robot-python/server/models/, downloaded the first time."""
    def ok():
        if not os.path.exists(YOLO_MODEL):
            return False
        with open(YOLO_MODEL, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest() == YOLO_SHA256
    if ok():
        return
    os.makedirs(os.path.dirname(YOLO_MODEL), exist_ok=True)
    print(f"AI 모델 받는 중: {YOLO_URL}")
    urllib.request.urlretrieve(YOLO_URL, YOLO_MODEL + ".part")
    os.replace(YOLO_MODEL + ".part", YOLO_MODEL)
    if not ok():
        sys.exit("받은 AI 모델 파일이 예상과 달라요 (SHA-256). 네트워크를 확인하고 다시 해 주세요.")


def version_stamp():
    """`YYYYMMDD-HHMMSS-<git short hash>`: the build time in UTC (sorts by time) and the commit."""
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    try:
        commit = subprocess.run(["git", "-C", REPO, "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(["git", "-C", REPO, "status", "--porcelain", "--untracked-files=no"],
                               capture_output=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return f"{stamp}-nogit"
    return f"{stamp}-{commit}" + ("-dirty" if dirty else "")


def console_zip(version):
    missing = [p for p in REQUIRED if not os.path.exists(os.path.join(CONSOLE, p))]
    if missing:
        sys.exit(f"robot-python/server 에 없는 파일: {', '.join(missing)} (static/ 은 web-typescript/ 에서 npm run build:robot)")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(CONSOLE):
            dirs[:] = sorted(d for d in dirs if d != "__pycache__")
            for name in sorted(files):
                if name.endswith((".pyc", ".pyo")) or (root == CONSOLE and name == "VERSION"):
                    continue
                # The three manuals (about 20 MB) stay in the PC program only, so the kit fits in one
                # download under 100 MB; the robot's server answers their links with where to find them.
                if os.path.relpath(root, CONSOLE) == os.path.join("static", "guides") and name.endswith(".pdf"):
                    continue
                path = os.path.join(root, name)
                if name.endswith((".pem", ".key")):
                    with open(path, "rb") as f:
                        if b"PRIVATE KEY" in f.read():
                            sys.exit(f"{path} 는 비밀 키예요. 저장소 밖으로 옮기고 다시 해 주세요 (키트에 넣지 않아요).")
                # On the robot the folder stays ~/robot_console (install.py, autostart.py and robots
                # already set up use that name), whatever the source folder here is called.
                z.write(path, os.path.join("robot_console", os.path.relpath(path, CONSOLE)))
        z.writestr("robot_console/VERSION", version + "\n")
    return buf.getvalue()


def signing_key(path):
    """The private key's path (checked), or None for an unsigned kit."""
    if not path:
        return None
    path = os.path.abspath(os.path.expanduser(path))
    if not os.path.isfile(path):
        sys.exit(f"서명 키가 없어요: {path}")
    real = os.path.realpath(path)
    if os.path.commonpath([os.path.realpath(REPO), real]) == os.path.realpath(REPO):
        sys.exit(f"서명 키가 저장소 안에 있어요: {path}\n저장소 밖(예: ~/keys/)으로 옮기고 다시 해 주세요.")
    return path


def sign(data, key):
    """Ed25519 signature (64 bytes) of data, made and checked with the openssl command."""
    with tempfile.TemporaryDirectory() as tmp:
        src, sig = os.path.join(tmp, "robot_console.zip"), os.path.join(tmp, "robot_console.zip.sig")
        with open(src, "wb") as f:
            f.write(data)
        try:
            p = subprocess.run(["openssl", "pkeyutl", "-sign", "-inkey", key, "-rawin", "-in", src, "-out", sig],
                               capture_output=True, text=True)
        except OSError:
            sys.exit("openssl 명령이 없어요 (OpenSSL 3 필요).")
        if p.returncode != 0:
            sys.exit(f"서명하지 못했어요 (Ed25519 비밀 키인지 확인): {p.stderr.strip()[-300:]}")
        # the robots check with server/kit_signing_public.pem: a key that is not its pair makes kits they refuse
        v = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", PUBLIC_KEY, "-rawin",
                            "-in", src, "-sigfile", sig], capture_output=True, text=True)
        if v.returncode != 0:
            sys.exit(f"이 키는 {os.path.relpath(PUBLIC_KEY, REPO)} 와 짝이 아니에요. 로봇이 받아들이지 않을 키트라 만들지 않았어요.")
        with open(sig, "rb") as f:
            return f.read()


def notepad(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return ("﻿" + text.replace("\r\n", "\n").replace("\n", "\r\n")).encode("utf-8")


def main():
    ap = argparse.ArgumentParser(description="USB 키트 만들기")
    ap.add_argument("-o", "--out", default=".", help="만들 폴더")
    ap.add_argument("--key", default=os.environ.get(KEY_ENV),
                    help=f"서명용 Ed25519 비밀 키 (PEM, 저장소 밖). 기본: 환경 변수 {KEY_ENV}")
    args = ap.parse_args()
    key = signing_key(args.key)
    os.makedirs(args.out, exist_ok=True)
    yolo_model()
    version = version_stamp()
    rc = console_zip(version)
    sig = sign(rc, key) if key else None
    now = time.localtime()[:6]

    def put(z, name, data, mode=0o644):
        info = zipfile.ZipInfo(name, now)
        info.external_attr = mode << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)

    kit = os.path.join(args.out, "eduino_usb.zip")
    with zipfile.ZipFile(kit, "w") as z:
        with open(os.path.join(KIT_SRC, "install.py"), "rb") as f:
            put(z, "eduino/install.py", f.read(), 0o755)
        with open(os.path.join(KIT_SRC, LAUNCHER), "rb") as f:
            put(z, f"eduino/{LAUNCHER}", f.read(), 0o755)
        for name in NOTEPAD:
            put(z, f"eduino/{name}", notepad(os.path.join(KIT_SRC, name)))
        put(z, "eduino/robot_console.zip", rc)
        if sig:
            put(z, "eduino/robot_console.zip.sig", sig)
        with open(PC_PROGRAM, "rb") as f:
            put(z, "eduino/Physical AI Tool.html", f.read())
        # hardware checks to run on the robot (pump, robot, network): eduino/checks/
        for name in sorted(os.listdir(CHECKS)):
            if name.endswith(".py"):
                with open(os.path.join(CHECKS, name), "rb") as f:
                    put(z, f"eduino/checks/{name}", f.read(), 0o755)
    alone = os.path.join(args.out, "robot_console.zip")
    with open(alone, "wb") as f:
        f.write(rc)
    if sig:
        with open(alone + ".sig", "wb") as f:
            f.write(sig)
    elif os.path.exists(alone + ".sig"):
        os.remove(alone + ".sig")              # an older build's signature would not match this zip
    print(f"{kit}  ({os.path.getsize(kit) // 1024} KB)")
    print(f"{alone}  ({len(rc) // 1024} KB)" + ("  + .sig" if sig else ""))
    print(f"버전: {version}   서명: {'Ed25519 (' + os.path.basename(key) + ')' if sig else '없음'}")
    if not sig:
        print(f"\n⚠ 서명 키가 없어 서명하지 않은 키트를 만들었어요 ({KEY_ENV} 또는 --key).\n"
              "  처음 설치(install.py)는 되지만, 로봇이 이 USB 로 스스로 업데이트하지는 않아요.", file=sys.stderr)


if __name__ == "__main__":
    main()
