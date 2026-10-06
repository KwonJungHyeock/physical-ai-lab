"""Build the USB kit: eduino_usb.zip, unpacked onto a USB stick as-is.

Development tool, not run on the robot. Build the console screens first
(`npm run build:robot` in web-typescript/), then:

    python3 tools/make_usb_kit.py                 # -> eduino_usb.zip and robot_console.zip here
    python3 tools/make_usb_kit.py -o dist/

eduino_usb.zip holds one folder, `eduino/`: install.py, 설치하기.desktop (double-click
on the robot's desktop: finds install.py on the stick and runs it with sudo in a terminal),
wifi.txt, 읽어보세요.txt (from robot-python/usb-kit/), robot_console.zip (robot-python/server/
with its static/ screens; unpacked on the robot as ~/robot_console/), checks/ (robot-python/checks/:
pump, robot and network checks) and
"Physical AI Tool.html", the PC program (static/pc/physical-ai-tool.html: it
finds the robots on the classroom Wi-Fi and opens one; copy it to a PC's desktop).
robot_console.zip also carries models/yolov5s.onnx, the AI sample's model (check 6; downloaded
once from the YOLOv5 v7.0 release into robot-python/server/models/ and checked against its SHA-256).
Text files meant for Windows Notepad are written with a UTF-8 BOM and CRLF
line ends. robot_console.zip is also written on its own
for robots updated by hand.
"""

import argparse
import hashlib
import io
import os
import sys
import time
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.path.dirname(HERE)
CONSOLE = os.path.join(PY, "server")
KIT_SRC = os.path.join(PY, "usb-kit")
CHECKS = os.path.join(PY, "checks")
NOTEPAD = ("wifi.txt", "읽어보세요.txt")
LAUNCHER = "설치하기.desktop"
REQUIRED = ("server.py", "agv_server.py", "wifi.py", "usb_setup.py", "autostart.py", "static/console.html", "static/agv.html", "static/pc/physical-ai-tool.html")
PC_PROGRAM = os.path.join(CONSOLE, "static", "pc", "physical-ai-tool.html")
YOLO_MODEL = os.path.join(CONSOLE, "models", "yolov5s.onnx")
YOLO_URL = "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.onnx"
YOLO_SHA256 = "8bc25a47abdbe2fd23e30eb948746bf856b031ea3cc815166687f52db9f8c659"


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


def console_zip():
    missing = [p for p in REQUIRED if not os.path.exists(os.path.join(CONSOLE, p))]
    if missing:
        sys.exit(f"robot-python/server 에 없는 파일: {', '.join(missing)} (static/ 은 web-typescript/ 에서 npm run build:robot)")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(CONSOLE):
            dirs[:] = sorted(d for d in dirs if d != "__pycache__")
            for name in sorted(files):
                if name.endswith((".pyc", ".pyo")):
                    continue
                path = os.path.join(root, name)
                # On the robot the folder stays ~/robot_console (install.py, autostart.py and robots
                # already set up use that name), whatever the source folder here is called.
                z.write(path, os.path.join("robot_console", os.path.relpath(path, CONSOLE)))
    return buf.getvalue()


def notepad(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return ("﻿" + text.replace("\r\n", "\n").replace("\n", "\r\n")).encode("utf-8")


def main():
    ap = argparse.ArgumentParser(description="USB 키트 만들기")
    ap.add_argument("-o", "--out", default=".", help="만들 폴더")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    yolo_model()
    rc = console_zip()
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
        with open(PC_PROGRAM, "rb") as f:
            put(z, "eduino/Physical AI Tool.html", f.read())
        # hardware checks to run on the robot (pump, robot, network): eduino/checks/
        for name in sorted(os.listdir(CHECKS)):
            if name.endswith(".py"):
                with open(os.path.join(CHECKS, name), "rb") as f:
                    put(z, f"eduino/checks/{name}", f.read(), 0o755)
    with open(os.path.join(args.out, "robot_console.zip"), "wb") as f:
        f.write(rc)
    print(f"{kit}  ({os.path.getsize(kit) // 1024} KB)")
    print(f"{os.path.join(args.out, 'robot_console.zip')}  ({len(rc) // 1024} KB)")


if __name__ == "__main__":
    main()
