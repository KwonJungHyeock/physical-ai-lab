#!/usr/bin/env python3
"""myCobot 280 RDK X5 — PC 연결 방법 점검 (읽기 전용, 로봇을 움직이지 않음).

로봇 안에서 실행합니다:  python3 network_check.py

PC 를 교실 와이파이 없이 로봇에 붙이는 방법이 이 로봇에서 되는지 봅니다.
  1) USB-C 케이블 (RDK X5 "闪连" USB Device 포트의 가상 네트워크, 기본 192.168.128.10)
     - D-Robotics x5-hobot-utils: hobot-usb-gadget.service -> usb-gadget.sh start rndis-ecm-msd
     - D-Robotics x5-hobot-configs: /etc/netplan/01-hobot-net.yaml (usb0 192.168.128.10/24, DHCP 없음)
  2) 랜선 직결 (eth0, 기본 192.168.127.10, DHCP 없음)
  3) 로봇 핫스팟 (NetworkManager shared 모드, 보통 10.42.0.1)
아무것도 바꾸지 않습니다. 명령을 읽기만 하고 결과를 한 번에 보여 줍니다.
"""

import os
import shutil
import subprocess
import time


def run(cmd):
    """Output of a read-only command, or a short note when it is not available."""
    if not shutil.which(cmd[0]):
        return f"(명령 없음: {cmd[0]})"
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return (out.stdout + out.stderr).strip() or "(출력 없음)"
    except Exception as exc:  # noqa: BLE001 - report anything, change nothing
        return f"(실패: {exc})"


def section(title, body):
    return f"■ {title}\n" + "\n".join("  " + line for line in body.splitlines()) + "\n"


def main():
    parts = []
    parts.append(section("시스템", run(["uname", "-a"]) + "\n" + run(["cat", "/etc/os-release"]).split("\n")[0]))
    rdk = "/etc/version"
    parts.append(section("RDK OS 버전", run(["cat", rdk]) if os.path.exists(rdk) else "(/etc/version 없음)"))

    # 1) USB-C gadget network
    parts.append(section(
        "USB-C 가상 네트워크 (hobot-usb-gadget)",
        "서비스 활성: " + run(["systemctl", "is-active", "hobot-usb-gadget"]) + "\n"
        + "서비스 켜짐(부팅 시): " + run(["systemctl", "is-enabled", "hobot-usb-gadget"]) + "\n"
        + run(["ip", "-brief", "addr", "show", "usb0"]) + "\n"
        + run(["ip", "-brief", "addr", "show", "usb1"]),
    ))
    netplan = "/etc/netplan/01-hobot-net.yaml"
    parts.append(section(netplan, run(["cat", netplan]) if os.path.exists(netplan) else "(파일 없음)"))

    # 2) Ethernet
    parts.append(section("유선 랜 (eth0)", run(["ip", "-brief", "addr", "show", "eth0"])
                         + "\n링크: " + run(["cat", "/sys/class/net/eth0/operstate"])))

    # 3) Wi-Fi / hotspot
    parts.append(section("와이파이 · 핫스팟 (NetworkManager)",
                         run(["nmcli", "-t", "-f", "NAME,TYPE,DEVICE,STATE", "connection", "show", "--active"]) + "\n"
                         + run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"])))
    ap = run(["nmcli", "-t", "-f", "NAME,802-11-wireless.mode,ipv4.method", "connection", "show"])
    parts.append(section("저장된 연결 (모드, IPv4 방식)", ap))

    parts.append(section("모든 주소", run(["ip", "-brief", "addr"])))
    parts.append(section("열린 포트", run(["ss", "-ltn"])))

    report = "[myCobot 280 RDK X5 연결 점검 결과]\n" + time.strftime("%Y-%m-%d %H:%M:%S") + "\n\n" + "\n".join(parts)
    print(report)
    path = os.path.expanduser(time.strftime("~/network_check_%Y%m%d_%H%M%S.txt"))
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"저장: {path}")
    except OSError:
        pass
    print("\n위 [myCobot 280 RDK X5 연결 점검 결과] 전체를 복사해서 보내 주세요.")


if __name__ == "__main__":
    main()
