"""Classroom Wi-Fi for the robot: see where it is connected, list nearby
networks, join the classroom router, or turn Wi-Fi off (LAN cable only).

Standard library only; it drives NetworkManager with `nmcli` (Ubuntu on the
RDK X5, the Pi and the Jetson use it). Joining a network takes the robot off
the network it is on now, so the switch runs in the background after the
answer has gone out, and a failure puts the previous connection back.

The robot has no hotspot of its own any more: a hotspot that came on held the
Wi-Fi chip, and the classroom network could not get it back ("device not
ready"). The robot is reached over the classroom Wi-Fi or the LAN cable
(lan.py), and set up from a USB stick (usb_setup.py). Every classroom
network gets the same autoconnect priority; NetworkManager joins whichever
is there by itself.

The myCobot 280 RDK X5 image comes with Elephant Robotics' hotspot outside
NetworkManager: at desktop login ~/.config/autostart/hotspot_on.desktop runs
/usr/local/bin/hotspot-function/hotspot_on.sh (masks wpa_supplicant, starts
hostapd and isc-dhcp-server on wlan0, 10.42.0.1); hotspot_off.sh undoes it.
retire_hotspot() turns it off and keeps it off: the login autostart set
aside (renamed, not deleted), isc-dhcp-server disabled, wlan0 back to
NetworkManager, and a small boot service (eduino-wifi.service,
`wifi.py --boot`) that does it again at every power-on and then keeps
looking for the classroom network. Hotspot profiles inside NetworkManager
(other robot images) are kept but no longer joined by themselves. These
steps need root (the installer, the eduino-usb service, `sudo python3 wifi.py`).

Also a command-line tool for setting up robots one by one:
    sudo python3 wifi.py                       # where am I connected
    sudo python3 wifi.py EDUINO-LAB 비밀번호    # join the classroom router
    sudo python3 wifi.py --off                 # Wi-Fi off (a classroom on the LAN cable only, lan.py)
    sudo python3 wifi.py --boot                # (the boot service) hotspot kept off, then the classroom Wi-Fi
"""

import glob
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time

CLASSROOM_PRIORITY = 10          # every classroom network the same (see remember)
CONNECT_TIMEOUT_S = 45
BOOT_WAIT_S = 120                # at power-on: how long NetworkManager may take to join by itself
                                 # (a router on the same power strip boots slower than the robot)
RETRY_S = 90                     # no classroom network yet: ask for it again this often

# Elephant Robotics' own hotspot on the myCobot 280 RDK X5 image (see the module notes).
MAKER_DIR = "/usr/local/bin/hotspot-function"
MAKER_AUTOSTART = "/home/*/.config/autostart/hotspot_on.desktop"
AUTOSTART_OFF = ".off-by-eduino"         # the login autostart, set aside for good
HOSTAPD_CONF = "/etc/hostapd.conf"
STATE_FILE = "/etc/eduino-wifi.json"     # {"ssid": ...}: the classroom network this robot uses; {"off": true}: Wi-Fi off
UNIT_FILE = "/etc/systemd/system/eduino-wifi.service"


def _split_terse(line):
    """nmcli -t separates fields with ':' and escapes ':' and '\\' inside values."""
    out, cur, esc = [], "", False
    for ch in line:
        if esc:
            cur += ch
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == ":":
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


MAKER_NEEDS_ROOT = ("이 로봇(RDK X5)은 Wi-Fi 장치를 다루려면 관리자 권한이 필요해요. "
                    "로봇 터미널에서 한 번만: cd ~/robot_console && sudo python3 wifi.py <Wi-Fi 이름> <비밀번호>")


class MakerHotspot:
    """The maker's hostapd hotspot (myCobot 280 RDK X5 image): turned off with the maker's own script and kept off."""

    def __init__(self, log):
        self.log = log

    @staticmethod
    def present():
        return os.path.exists(os.path.join(MAKER_DIR, "hotspot_off.sh"))

    @staticmethod
    def running():
        return subprocess.run(["pgrep", "-x", "hostapd"], capture_output=True).returncode == 0

    def _script(self, name, timeout=60):
        p = subprocess.run(["bash", os.path.join(MAKER_DIR, name)], capture_output=True, text=True, timeout=timeout)
        if p.returncode != 0:
            self.log(f"[Wi-Fi] {name}: {(p.stderr or p.stdout).strip()[-200:]}")

    def off(self):
        """Hotspot off, wlan0 back to NetworkManager (the driver reloads, so wait for it)."""
        self.log("[Wi-Fi] 제조사 핫스팟을 끄는 중 (hotspot_off.sh)…")
        self._script("hotspot_off.sh")
        if self.running():
            subprocess.run(["pkill", "-x", "hostapd"], capture_output=True)
        subprocess.run(["systemctl", "stop", "isc-dhcp-server"], capture_output=True)

    def retire(self, here):
        """Never on again: no login autostart, no DHCP server, our boot service in charge of power-on.
        True when something was still set the maker's way."""
        changed = False
        for path in glob.glob(MAKER_AUTOSTART):
            os.replace(path, path + AUTOSTART_OFF)
            changed = True
        # hotspot_on.sh enables it again; on the classroom network it must not hand out addresses
        if subprocess.run(["systemctl", "is-enabled", "isc-dhcp-server"], capture_output=True, text=True).stdout.strip() == "enabled":
            subprocess.run(["systemctl", "disable", "isc-dhcp-server"], capture_output=True)
            changed = True
        unit = f"""[Unit]
Description=Eduino: the robot's hotspot kept off, then the classroom Wi-Fi (or Wi-Fi off) (wifi.py --boot)
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
# simple, not oneshot: with no classroom network yet it keeps asking for it
Type=simple
ExecStart={sys.executable} {os.path.join(here, "wifi.py")} --boot

[Install]
WantedBy=multi-user.target
"""
        try:
            with open(UNIT_FILE, encoding="utf-8") as f:
                same = f.read() == unit
        except OSError:
            same = False
        if not same:
            with open(UNIT_FILE, "w", encoding="utf-8") as f:
                f.write(unit)
            subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
            changed = True
        subprocess.run(["systemctl", "enable", "eduino-wifi.service"], capture_output=True)
        return changed


def _run(cmd, timeout=20):
    """A system command's output ("" when it is missing or fails): steps that may not apply on every robot."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def _read_state():
    """STATE_FILE: {"ssid", "ssids"} the classroom networks, {"off": true} Wi-Fi off, {} not set yet."""
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            state = json.load(f)
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f)


class Wifi:
    def __init__(self, demo=False, log=print):
        self.demo = demo
        self.log = log
        self.lock = threading.Lock()
        # the last switch: {"ssid", "state": "switching"|"ok"|"failed", "error", "at"}
        self.last = None
        self._demo_net = {"ssid": "EDUINO-LAB", "mode": "wifi"}
        self.maker = None if demo or not MakerHotspot.present() else MakerHotspot(log)

    # ---------------------------------------------------------------- nmcli
    def _nm(self, *args, timeout=15):
        try:
            p = subprocess.run(["nmcli", *args], capture_output=True, text=True, timeout=timeout)
        except FileNotFoundError:
            raise RuntimeError("이 로봇에는 nmcli(네트워크 관리자)가 없어요.")
        except subprocess.TimeoutExpired:
            raise RuntimeError("네트워크 관리자가 응답하지 않아요.")
        if p.returncode != 0:
            msg = (p.stderr or p.stdout).strip()
            if "not authorized" in msg.lower() or "insufficient privileges" in msg.lower():
                raise RuntimeError("이 서버에는 Wi-Fi 를 바꿀 권한이 없어요. 로봇 터미널에서 'sudo python3 wifi.py <Wi-Fi 이름> <비밀번호>' 로 바꿔 주세요.")
            if "secrets were required" in msg.lower() or "password" in msg.lower():
                raise RuntimeError("비밀번호가 맞지 않아요.")
            if "no suitable device found" in msg.lower():
                raise RuntimeError("로봇의 Wi-Fi 장치(wlan0)를 네트워크 관리자가 아직 쓰지 못해요. 로봇을 껐다 켠 뒤 다시 해 주세요.")
            if "no network with ssid" in msg.lower() or "could not be found" in msg.lower():
                raise RuntimeError("그 이름의 Wi-Fi 를 찾지 못했어요. 이름(대소문자·띄어쓰기)과 공유기가 켜져 있는지 확인해 주세요.")
            raise RuntimeError(msg or "nmcli 오류")
        return p.stdout

    def _device(self):
        for line in self._nm("-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device").splitlines():
            dev, typ, state, conn = (_split_terse(line) + ["", "", "", ""])[:4]
            if typ == "wifi":
                return dev, state, conn
        raise RuntimeError("Wi-Fi 장치를 찾지 못했어요.")

    def _mode(self, conn):
        if not conn or conn == "--":
            return None, None
        out = self._nm("-t", "-f", "802-11-wireless.mode,802-11-wireless.ssid", "connection", "show", conn)
        vals = dict(_split_terse(l)[:2] for l in out.splitlines() if ":" in l)
        mode = vals.get("802-11-wireless.mode", "")
        return ("hotspot" if mode == "ap" else "wifi"), vals.get("802-11-wireless.ssid", conn)

    def _is_hotspot(self, conn):
        try:
            return self._mode(conn)[0] == "hotspot"
        except RuntimeError:
            return False

    def _take_wlan(self, radio=True):
        """Hand the Wi-Fi chip back to NetworkManager after the maker's hotspot: hostapd's hotspot_on.sh
        masks wpa_supplicant, and NetworkManager leaves a device it saw unmanaged alone, so without this
        a join fails with "No suitable device found" (only eth0 left to try). The chip may also be left
        blocked, in access-point mode or holding the hotspot's 10.42.0.1: NetworkManager then shows it
        "unavailable"."""
        _run(["rfkill", "unblock", "wifi"])
        _run(["systemctl", "unmask", "wpa_supplicant"])
        _run(["systemctl", "enable", "wpa_supplicant"])
        _run(["systemctl", "start", "wpa_supplicant"])
        for path in glob.glob("/sys/class/net/*/wireless"):
            dev = path.split("/")[-2]
            if not MakerHotspot.running():
                _run(["ip", "addr", "flush", "dev", dev])
                if "type AP" in _run(["iw", "dev", dev, "info"]):
                    _run(["ip", "link", "set", dev, "down"])
                    _run(["iw", "dev", dev, "set", "type", "managed"])
                _run(["ip", "link", "set", dev, "up"])
            try:
                self._nm("device", "set", dev, "managed", "yes")
            except RuntimeError:
                pass
        if radio:
            self._radio(True)

    def _ready_device(self):
        """The Wi-Fi device once NetworkManager can use it; if it stays unavailable, NetworkManager is
        restarted once (it can miss wpa_supplicant coming back after the hotspot) and waited for again."""
        dev, state, conn = self._wait_device()
        if state in ("unavailable", "unmanaged") and os.geteuid() == 0:
            self.log(f"[Wi-Fi] {dev} 가 아직 준비되지 않아 ({state}) 네트워크 관리자를 다시 켜요.")
            self._take_wlan()
            _run(["systemctl", "restart", "NetworkManager"], timeout=60)
            time.sleep(3)
            self._take_wlan()
            dev, state, conn = self._wait_device()
        return dev, state, conn

    def _wait_device(self, timeout=40):
        """The Wi-Fi device once NetworkManager can use it (after the maker's script reloads the driver)."""
        end = time.time() + timeout
        while True:
            try:
                dev, state, conn = self._device()
                if state not in ("unavailable", "unmanaged"):
                    return dev, state, conn
            except RuntimeError:
                pass
            if time.time() > end:
                return self._device()
            time.sleep(1)

    def retire_hotspot(self):
        """No robot hotspot: the maker's hotspot off and kept off (login and power-on), hotspot profiles in
        NetworkManager no longer joined by themselves, wlan0 back to NetworkManager. Needs root; safe to run
        again and again (the installer, the eduino-usb service and every power-on do). True when it changed something."""
        if self.demo or os.geteuid() != 0:
            return False
        changed = False
        if self.maker:
            if MakerHotspot.running():
                self.maker.off()
                changed = True
            changed = self.maker.retire(os.path.dirname(os.path.abspath(__file__))) or changed
        try:
            for line in self._nm("-t", "-f", "NAME,TYPE,AUTOCONNECT", "connection", "show").splitlines():
                name, typ, auto = (_split_terse(line) + ["", "", ""])[:3]
                if typ in ("802-11-wireless", "wifi") and auto == "yes" and self._is_hotspot(name):
                    self._nm("connection", "modify", "id", name, "connection.autoconnect", "no")
                    self.log(f"[Wi-Fi] 핫스팟 '{name}' 은 이제 저절로 켜지지 않아요.")
                    changed = True
        except RuntimeError:
            pass
        self._take_wlan(radio=not _read_state().get("off"))
        if changed:
            self.log("[Wi-Fi] 로봇 핫스팟을 껐어요. 이제 교실 Wi-Fi 나 랜선으로만 연결해요.")
        return changed

    def boot(self):
        """Power-on (eduino-wifi.service): the hotspot kept off, then the classroom network (or Wi-Fi off).
        NetworkManager joins a remembered network by itself; this only asks for it again while none has come."""
        self.retire_hotspot()
        state = _read_state()
        if state.get("off"):
            self._radio(False)
            self.log("[Wi-Fi] 켜짐: Wi-Fi 는 꺼 둠 (유선 LAN 으로만 연결).")
            return
        ssids = [s for s in state.get("ssids") or [state.get("ssid")] if s]
        if not ssids:
            self.log("[Wi-Fi] 켜짐: 기억한 교실 Wi-Fi 가 없어요 (USB 의 wifi.txt 를 꽂거나 랜선으로 연결).")
            return
        try:
            self._ready_device()                # the chip freed from the maker's hotspot before asking for a network
        except RuntimeError:
            pass
        end = time.time() + BOOT_WAIT_S
        asked = False
        while True:
            try:
                _, dev_state, conn = self._device()
                if dev_state.startswith("connected") and conn in ssids:
                    self.log(f"[Wi-Fi] 켜짐: '{conn}' 에 연결됐어요.")
                    return
                if not asked and dev_state == "disconnected" and time.time() > end - BOOT_WAIT_S / 2:
                    asked = True
                    self._up_any(ssids, 20)
            except RuntimeError:
                pass
            if time.time() > end:
                break
            time.sleep(2)
        # The classroom network may come later (the router was off, or slower to start): keep asking.
        self.log(f"[Wi-Fi] 켜짐: {' · '.join(repr(s) for s in ssids)} 가 아직 없어요. 랜선은 그대로 쓸 수 있고, Wi-Fi 는 계속 찾아요.")
        while True:
            time.sleep(RETRY_S)
            try:
                _, dev_state, conn = self._device()
                if dev_state.startswith("connected"):
                    self.log(f"[Wi-Fi] '{conn}' 에 연결됐어요.")
                    return
            except RuntimeError:
                pass
            self._take_wlan()
            conn = self._up_any(ssids, 30)
            if conn:
                self.log(f"[Wi-Fi] '{conn}' 에 연결됐어요.")
                return

    def _up_any(self, ssids, wait_s):
        """The first of these remembered networks that comes up (its name), else None."""
        for ssid in ssids:
            try:
                self._nm("--wait", str(wait_s), "connection", "up", "id", ssid, timeout=wait_s + 10)
                _, state, conn = self._device()
                if state.startswith("connected") and conn == ssid:
                    return ssid
            except RuntimeError:
                pass
        return None

    def classroom_mode(self, ssid, ssids=None):
        """After a join: power-on asks for this network first (then the others remembered with it, ssids)."""
        if self.demo or os.geteuid() != 0:
            return
        ssids = [ssid] + [s for s in (ssids or []) if s != ssid]
        _write_state({"ssid": ssid, "ssids": ssids})
        self.retire_hotspot()
        self.log(f"[Wi-Fi] 켤 때마다 {' · '.join(repr(s) for s in ssids)} 중 있는 쪽에 붙어요.")

    def adopt(self, conn, password):
        """A network joined by hand (the desktop's Wi-Fi menu): its profile may keep the password in the
        logged-in user's keyring and belong to that user only, so after power-on nobody is there to unlock
        it. Make it the robot's own, like one joined from wifi.txt: password stored for the system, for every
        user, joined by itself at power-on."""
        if self.demo or not conn:
            return
        args = ["connection", "modify", "id", conn, "connection.permissions", "", "connection.autoconnect", "yes",
                "connection.autoconnect-priority", str(CLASSROOM_PRIORITY), "802-11-wireless.powersave", "2"]
        if password:
            args += ["802-11-wireless-security.psk", password, "802-11-wireless-security.psk-flags", "0"]
        try:
            self._nm(*args)
            self.log(f"[Wi-Fi] 손으로 연결한 '{conn}' 을 로봇이 켤 때마다 붙도록 저장했어요.")
        except RuntimeError as exc:
            self.log(f"[Wi-Fi] '{conn}' 을 저장하지 못했어요: {exc}")

    def remember(self, ssid, password):
        """Keep another network for later without joining it now: NetworkManager joins it by itself when
        it is there and the one in use is not. Every classroom network gets the same priority, so after a
        moment without signal the robot goes back to the one it was on (NetworkManager prefers the most
        recently used of equal ones), not over to another router where the PC cannot see it."""
        if self.demo:
            return
        try:
            dev, _, _ = self._device()
            try:
                self._nm("connection", "delete", "id", ssid)
            except RuntimeError:
                pass
            args = ["connection", "add", "type", "wifi", "ifname", dev, "con-name", ssid, "ssid", ssid,
                    "802-11-wireless.hidden", "yes", "802-11-wireless.powersave", "2",
                    "connection.autoconnect", "yes", "connection.autoconnect-priority", str(CLASSROOM_PRIORITY)]
            if password:
                args += ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password]
            self._nm(*args)
            self.log(f"[Wi-Fi] '{ssid}' 도 기억해 둬요 (있으면 저절로 붙어요).")
        except RuntimeError as exc:
            self.log(f"[Wi-Fi] '{ssid}' 를 기억하지 못했어요: {exc}")

    def even_out(self):
        """Robots set up before every remembered network had the same priority (wifi.txt order, 10, 9 …):
        give them all CLASSROOM_PRIORITY, so a short drop does not move the robot to the other router."""
        if self.demo:
            return
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                ssids = json.load(f).get("ssids") or []
        except (OSError, ValueError, AttributeError):
            return
        for ssid in ssids if len(ssids) > 1 else []:
            try:
                out = self._nm("-g", "connection.autoconnect-priority", "connection", "show", "id", ssid)
                if out.strip() != str(CLASSROOM_PRIORITY):
                    self._nm("connection", "modify", "id", ssid, "connection.autoconnect-priority", str(CLASSROOM_PRIORITY))
                    self.log(f"[Wi-Fi] '{ssid}' 의 순위를 다른 교실 Wi-Fi 와 같게 맞췄어요.")
            except RuntimeError:
                pass

    def _radio(self, on):
        try:
            self._nm("radio", "wifi", "on" if on else "off")
        except RuntimeError as exc:
            self.log(f"[Wi-Fi] 무선을 {'켜지' if on else '끄지'} 못했어요: {exc}")

    def _radio_on(self):
        """Is the Wi-Fi radio on (off after `--off`)?"""
        try:
            return self._nm("radio", "wifi").strip() != "disabled"
        except RuntimeError:
            return True

    # ---------------------------------------------------------------- API
    def off(self):
        """Wi-Fi off for a classroom that uses only the LAN cable (needs root). Returns an error or None."""
        if self.demo:
            self._demo_net = {"ssid": None, "mode": "off"}
            return None
        if os.geteuid() != 0:
            return MAKER_NEEDS_ROOT
        if not self.lock.acquire(blocking=False):
            return "이미 Wi-Fi 를 바꾸는 중이에요."
        try:
            _write_state({"off": True})
            self.retire_hotspot()
            self._radio(False)
            self.log("[Wi-Fi] 꺼 둠: 켤 때도 Wi-Fi 를 켜지 않아요 (유선 LAN 으로만 연결).")
            self.last = {"ssid": "(Wi-Fi 끔)", "state": "ok", "error": "", "at": time.time()}
            return None
        except Exception as exc:
            return f"Wi-Fi 를 끄지 못했어요: {exc}"
        finally:
            self.lock.release()

    def status(self):
        """Where the robot is connected now."""
        if self.demo:
            return {**self._demo_net, "device": "wlan0", "last": self.last}
        if self.maker and MakerHotspot.running():   # a robot not set up by the kit yet
            return {"device": "wlan0", "state": "connected", "mode": "hotspot", "ssid": None,
                    "connection": "hostapd", "last": self.last}
        if not self._radio_on():
            return {"device": "wlan0", "state": "off", "mode": "off", "ssid": None, "connection": None, "last": self.last}
        dev, state, conn = self._device()
        mode, ssid = self._mode(conn) if state.startswith("connected") else (None, None)
        return {"device": dev, "state": state, "mode": mode, "ssid": ssid, "connection": conn, "last": self.last}

    def scan(self):
        """Nearby networks, strongest first."""
        if self.demo:
            nets = [("EDUINO-LAB", 82), ("School-WiFi", 64), ("Library 2F", 31)]
            return [{"ssid": n, "signal": sig, "secure": True, "current": n == self._demo_net["ssid"]} for n, sig in nets]
        if self.maker and MakerHotspot.running():
            return []                           # the maker's hotspot holds the radio: nothing to scan with
        dev, _, _ = self._device()
        try:
            out = self._nm("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", dev, "--rescan", "yes", timeout=25)
        except RuntimeError:
            out = self._nm("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", dev)
        seen = {}
        for line in out.splitlines():
            inuse, ssid, signal, sec = (_split_terse(line) + ["", "", "0", ""])[:4]
            if not ssid:
                continue
            item = {"ssid": ssid, "signal": int(signal or 0), "secure": bool(sec and sec != "--"), "current": inuse == "*"}
            if ssid not in seen or item["signal"] > seen[ssid]["signal"]:
                seen[ssid] = item
        return sorted(seen.values(), key=lambda n: -n["signal"])

    def connect(self, ssid, password, on_done=None):
        """Join `ssid` in the background (the answer to the browser goes out first). Returns an error or None."""
        ssid = (ssid or "").strip()
        if not ssid or len(ssid) > 32:
            return "Wi-Fi 이름을 넣어 주세요."
        if password and not (8 <= len(password) <= 63):
            return "Wi-Fi 비밀번호는 8~63자예요."
        if self.maker and os.geteuid() != 0:
            return MAKER_NEEDS_ROOT
        if not self.lock.acquire(blocking=False):
            return "이미 Wi-Fi 를 바꾸는 중이에요."
        self.last = {"ssid": ssid, "state": "switching", "error": "", "at": time.time()}
        threading.Thread(target=self._switch, args=(ssid, password, on_done), daemon=True).start()
        return None

    # ---------------------------------------------------------------- background work
    def _switch(self, ssid, password, on_done):
        try:
            time.sleep(1.5)                     # let the answer reach the browser first
            if self.demo:
                time.sleep(2)
                self._demo_net = {"ssid": ssid, "mode": "wifi"}
                self.last.update(state="ok")
                self.log(f"[Wi-Fi] (데모) '{ssid}' 에 연결했어요.")
                return
            self._radio(True)                   # after `--off`
            self.retire_hotspot()               # a robot not set up by the kit yet still has its hotspot on
            self._take_wlan()
            dev, state, before = self._ready_device()
            if state in ("unavailable", "unmanaged"):
                raise RuntimeError(f"로봇의 Wi-Fi 장치({dev})가 준비되지 않았어요 ({state}). 로봇을 껐다 켠 뒤 다시 해 주세요.")
            self.log(f"[Wi-Fi] '{ssid}' 에 연결하는 중… (지금 연결: {before})")
            # A profile made from the name and password alone, not from the scan list: right after
            # the driver reloads the robot has not scanned yet, so the classroom network is not listed.
            # "hidden" makes NetworkManager ask for that name directly instead of waiting to see it.
            try:
                self._nm("connection", "delete", "id", ssid)       # an earlier try with the same name
            except RuntimeError:
                pass
            args = ["connection", "add", "type", "wifi", "ifname", dev, "con-name", ssid, "ssid", ssid,
                    "802-11-wireless.hidden", "yes",
                    # no Wi-Fi power saving: a dozing robot answers 로봇 찾기 too late and is missed
                    "802-11-wireless.powersave", "2",
                    # joined by itself at power-on, like every classroom network (see remember)
                    "connection.autoconnect", "yes", "connection.autoconnect-priority", str(CLASSROOM_PRIORITY)]
            if password:
                args += ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password]
            try:
                self._nm(*args)
                self._nm("--wait", str(CONNECT_TIMEOUT_S), "connection", "up", "id", ssid, "ifname", dev, timeout=CONNECT_TIMEOUT_S + 10)
                self.classroom_mode(ssid)
                self.last.update(state="ok")
                self.log(f"[Wi-Fi] '{ssid}' 에 연결했어요. 다음부터 켜면 이 Wi-Fi 에 먼저 붙어요.")
            except RuntimeError as exc:
                self.last.update(state="failed", error=str(exc))
                self.log(f"[Wi-Fi] 연결 실패: {exc} — 원래 연결({before})로 돌아가요.")
                try:
                    self._nm("connection", "delete", "id", ssid)   # no half-made profile left to retry at boot
                except RuntimeError:
                    pass
                if before and before != "--" and before != ssid and not self._is_hotspot(before):
                    try:
                        self._nm("connection", "up", before, timeout=40)
                    except RuntimeError as exc2:
                        self.log(f"[Wi-Fi] 원래 연결로도 못 돌아갔어요: {exc2}")
        except Exception as exc:                # never leave the lock held
            self.last.update(state="failed", error=str(exc))
            self.log(f"[Wi-Fi] 연결 실패: {exc}")
        finally:
            self.lock.release()
            if on_done:
                on_done()


def _say(text):
    """Print, and keep going if the terminal is gone (joining Wi-Fi can cut an SSH session)."""
    try:
        print(text, flush=True)
    except OSError:
        pass
    try:
        with open("/var/log/eduino-wifi.log", "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + text + "\n")
    except OSError:
        pass


def _main(argv):
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    w = Wifi(log=_say)
    if len(argv) >= 2 and argv[1] == "--boot":
        w.boot()
        return
    if len(argv) >= 2 and argv[1] == "--off":
        err = w.off()
        _say(err or "Wi-Fi 를 껐어요. 유선 LAN 으로 연결하세요 (PC 와 랜선 직결: 169.254.127.10).")
        return
    if len(argv) >= 2 and argv[1] == "--hotspot":
        raise SystemExit("로봇 핫스팟은 이제 쓰지 않아요 (켜 두면 Wi-Fi 장치를 놓아주지 않아요). 교실 Wi-Fi 나 랜선으로 연결해 주세요.")
    if len(argv) >= 2:
        err = w.connect(argv[1], argv[2] if len(argv) > 2 else "")
    else:
        s = w.status()
        print(f"지금: {s.get('mode') or '연결 안 됨'} {s.get('ssid') or ''} ({s.get('device')})")
        for n in w.scan()[:10]:
            print(f"  {'*' if n['current'] else ' '} {n['signal']:3d}%  {n['ssid']}")
        return
    if err:
        raise SystemExit(err)
    while w.lock.locked() or (w.last and w.last["state"] == "switching"):
        time.sleep(0.5)
    _say(f"결과: {w.last}")


if __name__ == "__main__":
    _main(sys.argv)
