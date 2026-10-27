#!/usr/bin/env python3
"""에듀이노 USB 키트 설치 — 로봇마다 한 번, 로봇 터미널에서:

    sudo python3 /media/*/eduino/install.py        (RDK X5: the stick is /media/<label>)
    sudo python3 "$(find /media /mnt -maxdepth 6 -path '*eduino/install.py' 2>/dev/null | head -1)"   (anywhere)

Everything a robot needs for class, from the stick it runs from:
  1. unpacks robot_console.zip into the robot user's ~/robot_console
  2. makes the console server start at power-on (autostart.py; arm or myAGV, found out here)
  3. installs the `eduino-usb` service: from now on a stick with a new eduino/wifi.txt
     is applied as soon as it is plugged in, and a newer signed kit updates
     ~/robot_console by itself (usb_setup.py, kit_update.py)
  4. turns the robot's own hotspot off for good (it held the Wi-Fi chip, so the
     classroom Wi-Fi could not get it; wifi.py retire_hotspot), then applies this
     stick's wifi.txt right away and writes the result (robot ID, address,
     console version) next to it: eduino/result-<robot name>.txt

The zip's robot_console/VERSION stays in ~/robot_console/VERSION: the version the
robot runs, which the eduino-usb service compares with the kit on a stick.

Options:  arm | agv   choose the robot instead of detecting it
          --no-wifi   leave the Wi-Fi as it is

Turning the hotspot off cuts an SSH session over it; the setup goes on without
it and the result file on the stick tells how it went.
"""

import glob
import os
import pwd
import shutil
import signal
import subprocess
import sys
import zipfile

KIT = os.path.dirname(os.path.abspath(__file__))
MOUNT = os.path.dirname(KIT)
ZIP = os.path.join(KIT, "robot_console.zip")
USB_UNIT = "/etc/systemd/system/eduino-usb.service"
MAKER_DIR = "/usr/local/bin/hotspot-function"     # Elephant Robotics' hotspot scripts: the myCobot 280 RDK X5 image


def robot_addresses(dest):
    """This robot's network addresses (the unpacked console's helper), or [] when there are none yet."""
    try:
        sys.path.insert(0, dest)
        import usb_setup
        return usb_setup.addresses()
    except Exception:
        return []


def say(text=""):
    try:
        print(text, flush=True)
    except OSError:
        pass                                      # the terminal went away with the Wi-Fi


def step(n, text):
    say(f"\n[{n}/4] {text}")


def robot_user():
    """The robot's everyday user (the one who ran sudo; else the first ordinary account)."""
    name = os.environ.get("SUDO_USER")
    if name and name != "root":
        return pwd.getpwnam(name)
    people = sorted((p for p in pwd.getpwall() if 1000 <= p.pw_uid < 60000 and p.pw_dir.startswith("/home/")),
                    key=lambda p: p.pw_uid)
    if not people:
        raise SystemExit("로봇 사용자 계정을 찾지 못했어요. 'sudo python3 install.py' 로 실행해 주세요.")
    return people[0]


def board():
    try:
        with open("/proc/device-tree/model", encoding="utf-8", errors="replace") as f:
            return f.read().strip("\0 \n")
    except OSError:
        return ""


def detect_kind():
    """'arm' or 'agv' (None: ask)."""
    model = board().lower()
    if os.path.isdir(MAKER_DIR) or "rdk" in model:
        return "arm"                              # myCobot 280 RDK X5
    if "raspberry pi" in model or os.path.exists("/etc/nv_tegra_release"):
        return None                               # myAGV 2023 (Pi / Jetson Nano), or a myCobot 280 Pi / Jetson Nano
    return None


def ask_kind():
    if not sys.stdin.isatty():
        say("  로봇 종류를 알아내지 못해 myAGV 로 설치해요. 로봇팔이면: sudo python3 install.py arm")
        return "agv"
    say(f"  보드: {board() or '알 수 없음'}")
    while True:
        try:
            a = input("  이 로봇은? 1) 이동 로봇 myAGV   2) 로봇팔 myCobot  [1]: ").strip()
        except EOFError:
            a = ""
        if a in ("", "1"):
            return "agv"
        if a == "2":
            return "arm"


def unpack(user):
    dest = os.path.join(user.pw_dir, "robot_console")
    if not os.path.exists(ZIP):
        if not os.path.exists(os.path.join(dest, "usb_setup.py")):
            raise SystemExit(f"{ZIP} 가 없고, 로봇에도 ~/robot_console 이 없어요. 키트를 다시 받아 USB 에 복사해 주세요.")
        say(f"  robot_console.zip 이 없어 로봇에 있던 {dest} 를 그대로 써요.")
        return dest
    with zipfile.ZipFile(ZIP) as z:
        bad = [n for n in z.namelist() if not n.startswith("robot_console/") or ".." in n.split("/")]
        if bad or "robot_console/usb_setup.py" not in z.namelist():
            raise SystemExit("robot_console.zip 이 이 키트의 것이 아니에요. 키트를 다시 받아 주세요.")
        # the running server holds the old files; it is restarted by autostart.py
        subprocess.run(["systemctl", "stop", "robot-console.service"], capture_output=True)
        if os.path.isdir(dest):
            shutil.rmtree(dest)
        z.extractall(user.pw_dir)
    for root, dirs, files in os.walk(dest):
        for name in dirs + files:
            os.chown(os.path.join(root, name), user.pw_uid, user.pw_gid)
    os.chown(dest, user.pw_uid, user.pw_gid)
    say(f"  {dest} 에 풀었어요 (버전 {installed_version(dest)}).")
    return dest


def installed_version(dest):
    try:
        with open(os.path.join(dest, "VERSION"), encoding="utf-8", errors="replace") as f:
            return f.read(200).strip() or "표시 없음"
    except OSError:
        return "표시 없음"


def check_pymycobot():
    p = subprocess.run([sys.executable, "-c", "import pymycobot; print(pymycobot.__version__)"], capture_output=True, text=True)
    if p.returncode == 0:
        say(f"  pymycobot {p.stdout.strip()}")
    else:
        say("  ⚠ pymycobot 이 없어요. 인터넷이 되는 곳에서 'pip3 install pymycobot' 을 한 번 해 주세요 (그 전에는 로봇이 안 움직여요).")


def usb_unit(dest):
    return f"""[Unit]
Description=Eduino: a USB stick's signed kit updates the console, its eduino/wifi.txt sets the Wi-Fi (usb_setup.py)
After=NetworkManager.service

[Service]
Type=simple
Environment=PYTHONUNBUFFERED=1
# root must not leave __pycache__ in the robot user's folder (it could not delete it)
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart={sys.executable} {os.path.join(dest, "usb_setup.py")} --watch
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""


def main(argv):
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    args = argv[1:]
    if any(a in ("-h", "--help") for a in args):
        say(__doc__)
        return 0
    if os.geteuid() != 0:
        raise SystemExit("관리자 권한이 필요해요:  sudo python3 " + os.path.abspath(__file__))
    user = robot_user()
    kind = "arm" if "arm" in args else "agv" if "agv" in args else detect_kind()
    say("에듀이노 USB 키트 설치")
    say(f"  로봇 사용자: {user.pw_name}   USB: {MOUNT}")

    step(1, "콘솔 파일 풀기")
    dest = unpack(user)
    check_pymycobot()

    step(2, "전원을 켜면 콘솔 서버가 저절로 켜지게")
    if not kind:
        kind = ask_kind()
    say(f"  로봇: {'로봇팔 myCobot (server.py)' if kind == 'arm' else '이동 로봇 myAGV (agv_server.py)'}")
    env = {**os.environ, "SUDO_USER": user.pw_name}
    auto = [sys.executable, os.path.join(dest, "autostart.py")] + (["--agv"] if kind == "agv" else [])
    if subprocess.run(auto, cwd=dest, env=env).returncode != 0:
        raise SystemExit("자동 시작 설치에 실패했어요 (위 메시지 참고).")

    step(3, "USB 로 Wi-Fi 바꾸기·업데이트 (앞으로는 USB 를 꽂기만)")
    with open(USB_UNIT, "w", encoding="utf-8") as f:
        f.write(usb_unit(dest))
    subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
    subprocess.run(["systemctl", "enable", "eduino-usb.service"], capture_output=True)
    # started after step 4, so the service does not join in while this stick is being applied
    subprocess.run(["systemctl", "stop", "eduino-usb.service"], capture_output=True)
    say("  설치했어요: eduino-usb (USB 를 꽂으면 새 키트로 업데이트하고 eduino/wifi.txt 를 읽어 연결)")

    step(4, "로봇 핫스팟 끄기 · 교실 Wi-Fi 연결")
    sys.path.insert(0, dest)
    sys.dont_write_bytecode = True                # no root-owned __pycache__ in the user's folder
    import wifi as robot_wifi                     # the copy just unpacked
    say("  로봇 핫스팟을 꺼요 (켜 두면 Wi-Fi 를 놓아주지 않아요). 핫스팟으로 SSH 접속 중이면 여기서 창이 끊겨요 — 정상이에요.")
    if not robot_wifi.Wifi(False, say).retire_hotspot():
        say("  핫스팟은 이미 꺼져 있어요. 교실 Wi-Fi 나 랜선으로만 연결해요.")
    ok = True
    if "--no-wifi" in args:
        say("  건너뛰었어요 (--no-wifi).")
    elif not os.path.exists(os.path.join(KIT, "wifi.txt")):
        say("  이 USB 에 eduino/wifi.txt 가 없어요. 나중에 wifi.txt 를 넣어 꽂으면 연결돼요.")
    else:
        import usb_setup                          # the copy just unpacked
        ssid, _ = usb_setup.read_config(os.path.join(KIT, "wifi.txt"))
        if not ssid:
            say("  wifi.txt 에 Wi-Fi 이름이 비어 있어요. PC 에서 '와이파이=' 뒤에 적어 저장한 뒤 다시 꽂으면 연결돼요.")
        else:
            say(f"  '{ssid}' 에 연결해요.")
            ok, _ = usb_setup.apply(MOUNT)
    subprocess.run(["systemctl", "start", "eduino-usb.service"], capture_output=True)

    say("\n끝났어요." if ok else "\n설치는 끝났지만 Wi-Fi 연결은 실패했어요 (위 메시지와 USB 의 결과 파일 참고).")
    results = glob.glob(os.path.join(KIT, "result-*.txt"))
    if results:
        say(f"  결과 파일: {max(results, key=os.path.getmtime)}")
    ips = robot_addresses(dest)
    say("")
    say("=" * 60)
    if ips:
        say(f"  PC 에서 열기 (로봇 ID {ips[0].rsplit('.', 1)[1]})")
        say(f"    주소: http://{ips[0]}:8080/console")
    else:
        say("  PC 에서 열기: 로봇이 아직 네트워크 주소가 없어요 (Wi-Fi 연결을 확인해요)")
    say("    또는 이 USB 의 eduino/'Physical AI Tool.html' 을 PC 바탕화면에 복사해")
    say("    더블클릭 → 로봇이 목록에 나오면 [열기] (주소를 몰라도 돼요)")
    say("=" * 60)
    say("  다음부터: PC 에서 wifi.txt 를 고치고 새 키트의 eduino 폴더를 USB 에 복사 → 로봇에 꽂기")
    say("            → 1~2분 뒤 로봇이 살짝 움직이면 끝 (업데이트도 저절로, 결과 파일에 버전).")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
