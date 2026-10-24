"""The robot's LAN port: one fixed address for a cable straight to a PC, and which address is which.

A PC and a robot joined by one LAN cable, with no router between them, have nobody to hand out
addresses. Windows then gives itself a link-local address (169.254.x.y) after about half a minute;
the robot keeps one fixed link-local address on its LAN port as well, 169.254.127.10, so the PC
program reaches it at http://169.254.127.10:8080 with nothing set on the PC.

The address is added next to whatever the port gets otherwise (a router's DHCP address stays as it
is), so plugging the robot into the school network changes nothing there: no address is handed out
to anyone, and link-local addresses never leave the cable segment. NetworkManager may drop an
address it did not make when the port goes down and up again, so `ensure()` is called every few
seconds by the eduino-usb service (root) and simply adds it back.

Standard library only; `ip` (iproute2) does the work.

    sudo python3 lan.py            # add the address now and show every address of the robot
"""

import os
import subprocess
import sys

DIRECT = "169.254.127.10"
PREFIX = 16
NET = "/sys/class/net"


def _wired_ports():
    """The physical wired ports (eth0, end0, enp1s0 …): a device behind them, no Wi-Fi radio."""
    try:
        names = sorted(os.listdir(NET))
    except OSError:
        return []
    return [n for n in names if n != "lo" and os.path.exists(os.path.join(NET, n, "device")) and not os.path.exists(os.path.join(NET, n, "wireless"))]


def _ipv4(dev=None):
    """[(device, address)] from `ip -4 -o addr show`."""
    cmd = ["ip", "-4", "-o", "addr", "show"] + (["dev", dev] if dev else [])
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    found = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 4 and parts[2] == "inet":
            found.append((parts[1], parts[3].split("/")[0]))
    return found


def ensure(log=None):
    """The direct address on the first wired port (needs root). True when it is there now."""
    ports = _wired_ports()
    if not ports:
        return False
    dev = ports[0]
    if any(ip == DIRECT for _, ip in _ipv4(dev)):
        return True
    if os.geteuid() != 0:
        return False
    try:
        subprocess.run(["ip", "link", "set", "dev", dev, "up"], capture_output=True, timeout=5)
        p = subprocess.run(["ip", "addr", "add", f"{DIRECT}/{PREFIX}", "dev", dev, "label", f"{dev}:direct"], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError) as exc:
        if log:
            log(f"[LAN] 직결 주소를 붙이지 못했어요: {exc}")
        return False
    if p.returncode != 0 and "exists" not in p.stderr.lower():
        if log:
            log(f"[LAN] 직결 주소를 붙이지 못했어요: {p.stderr.strip()[-160:]}")
        return False
    if log:
        log(f"[LAN] {dev} 에 직결 주소 {DIRECT} 를 붙였어요.")
    return True


def kind(dev, ip):
    """'무선', '유선' or '직결' (the fixed address for a cable straight to a PC)."""
    if ip == DIRECT:
        return "직결"
    return "무선" if os.path.exists(os.path.join(NET, dev, "wireless")) else "유선"


def addresses():
    """Every address the robot can be reached at, as [(kind, address)]: Wi-Fi first, then the LAN port, the direct one last."""
    order = {"무선": 0, "유선": 1, "직결": 2}
    found = [(kind(dev, ip), ip) for dev, ip in _ipv4() if not ip.startswith("127.")]
    return sorted(found, key=lambda k: order[k[0]])


def describe(found=None):
    """'무선 192.168.0.52 · 유선 192.168.0.61 · 직결 169.254.127.10'."""
    found = addresses() if found is None else found
    return " · ".join(f"{k} {ip}" for k, ip in found) or "-"


if __name__ == "__main__":
    ensure(log=print)
    print(describe())
    sys.exit(0)
