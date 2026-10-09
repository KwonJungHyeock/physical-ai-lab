#!/usr/bin/env python3
"""로봇 전원을 켜면 콘솔 서버가 저절로 켜지게 (한 번만 설치).

Installs server.py as a systemd service on the robot (RDK OS), so the class
only switches the robot on and opens the address on the PC — nobody has to
log in to the robot and start the server by hand any more.

    sudo python3 autostart.py            # install and start now (also at every boot)
    sudo python3 autostart.py --agv      # the same on a myAGV (agv_server.py instead of server.py)
    sudo python3 autostart.py --off      # remove (back to starting by hand)
    python3 autostart.py --status        # is it installed / running?

The service runs as the user who ran sudo, in this folder, with the same
options server.py takes (e.g. `sudo python3 autostart.py --camera 0`).
After unpacking a new robot_console.zip into the same folder:
    sudo systemctl restart robot-console
Its messages:  journalctl -u robot-console -f
"""

import argparse
import os
import pwd
import subprocess
import sys

NAME = "robot-console"
UNIT = f"/etc/systemd/system/{NAME}.service"
HERE = os.path.dirname(os.path.abspath(__file__))


def run(*cmd, check=True):
    print("  $", " ".join(cmd))
    return subprocess.run(cmd, check=check)


def unit_text(user, extra, script="server.py"):
    args = " ".join(extra)
    what = "mobile robot" if script == "agv_server.py" else "robot arm"
    return f"""[Unit]
Description=Eduino {what} console ({script} in {HERE})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={user}
WorkingDirectory={HERE}
Environment=PYTHONUNBUFFERED=1
# The serial port and the camera may take a moment after power-on.
ExecStartPre=/bin/sleep 3
ExecStart={sys.executable} {os.path.join(HERE, script)} {args}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
"""


def install(extra, script="server.py"):
    if os.geteuid() != 0:
        raise SystemExit("관리자 권한이 필요해요: sudo python3 autostart.py")
    if not os.path.exists(os.path.join(HERE, "static", "console.html")):
        raise SystemExit("이 폴더에 화면 파일(static/console.html)이 없어요. robot_console.zip 을 푼 폴더에서 실행해 주세요.")
    user = os.environ.get("SUDO_USER") or "root"
    pwd.getpwnam(user)   # the user must exist
    with open(UNIT, "w", encoding="utf-8") as f:
        f.write(unit_text(user, extra, script))
    print(f"서비스 파일을 만들었어요: {UNIT} (사용자 {user}, 폴더 {HERE}, {script})")
    # A server started by hand holds port 8080 and the serial port: stop it first.
    for name in ("server.py", "agv_server.py"):
        subprocess.run(["pkill", "-f", os.path.join(HERE, name)], check=False)
        subprocess.run(["pkill", "-f", f"python3 {name}"], check=False)
    run("systemctl", "daemon-reload")
    run("systemctl", "enable", "--now", f"{NAME}.service")
    print("\n설치했어요. 지금 서버가 켜졌고, 앞으로 로봇 전원을 켜면 저절로 켜져요.")
    print("PC 브라우저 주소: http://<로봇 IP>:8080/console   (로봇 IP: hostname -I)")
    print(f"상태 보기: systemctl status {NAME}    메시지 보기: journalctl -u {NAME} -f")


def remove():
    if os.geteuid() != 0:
        raise SystemExit("관리자 권한이 필요해요: sudo python3 autostart.py --off")
    run("systemctl", "disable", "--now", f"{NAME}.service", check=False)
    if os.path.exists(UNIT):
        os.remove(UNIT)
    run("systemctl", "daemon-reload")
    print("자동 시작을 껐어요. 이제 python3 server.py 로 직접 켜요.")


def status():
    installed = os.path.exists(UNIT)
    active = subprocess.run(["systemctl", "is-active", f"{NAME}.service"], capture_output=True, text=True).stdout.strip()
    print(f"자동 시작 설치: {'예' if installed else '아니오'}   지금 상태: {active or '알 수 없음'}")


def main():
    ap = argparse.ArgumentParser(description="콘솔 서버 자동 시작 (systemd)")
    ap.add_argument("--off", action="store_true", help="자동 시작 지우기")
    ap.add_argument("--status", action="store_true", help="설치·실행 상태 보기")
    ap.add_argument("--agv", action="store_true", help="이동 로봇(myAGV)용: agv_server.py 를 자동 시작")
    args, extra = ap.parse_known_args()   # anything else goes to server.py (--camera 0, --port 8081 ...)
    if args.status:
        status()
    elif args.off:
        remove()
    else:
        install(extra, "agv_server.py" if args.agv else "server.py")


if __name__ == "__main__":
    main()
