"""Classroom Wi-Fi for the robot: see where it is connected, list nearby
networks, join the classroom router, or go back to its own hotspot.

Standard library only; it drives NetworkManager with `nmcli` (Ubuntu on the
RDK X5, the Pi and the Jetson use it). Joining a network takes the robot off
the network it is on now, so the switch runs in the background after the
answer has gone out, and a failure puts the previous connection back.

The classroom profile gets a higher autoconnect priority than the robot's
hotspot: at school the robot joins the router by itself after power-on; away
from the router it falls back to its hotspot.

Joining needs only the network's name and password: the robot does not have
to see it in a scan first (a robot running its hotspot cannot scan).

The myCobot 280 RDK X5 image runs its hotspot outside NetworkManager: at
desktop login ~/.config/autostart/hotspot_on.desktop runs Elephant Robotics'
/usr/local/bin/hotspot-function/hotspot_on.sh (masks wpa_supplicant, starts
hostapd and isc-dhcp-server on wlan0, 10.42.0.1), and hotspot_off.sh undoes
it. There (class MakerHotspot) joining the classroom calls hotspot_off.sh
first and hotspot_on.sh again if the join fails; once joined, the login
autostart is set aside (renamed, not deleted) and a small boot service
(eduino-wifi.service, `wifi.py --boot`) waits for the classroom network and
turns the maker's hotspot on only when it is not there. `--hotspot` puts all
of it back as the maker left it. These steps need root: `sudo python3 wifi.py`.

Also a command-line tool for setting up robots one by one:
    sudo python3 wifi.py                       # where am I connected
    sudo python3 wifi.py EDUINO-LAB 비밀번호    # join the classroom router
    sudo python3 wifi.py --hotspot             # back to the robot's own hotspot
    sudo python3 wifi.py --off                 # Wi-Fi off (a classroom on the LAN cable only, lan.py)
    sudo python3 wifi.py --boot                # (the boot service) classroom first, else the hotspot
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

CLASSROOM_PRIORITY = 10          # above the hotspot profile (0 by default)
CONNECT_TIMEOUT_S = 45
BOOT_WAIT_S = 120                # at power-on: how long the classroom network may take before the hotspot comes on
                                 # (a router on the same power strip boots slower than the robot)
RETRY_S = 300                    # on the fallback hotspot with nobody on it: try the classroom network again this often

# Elephant Robotics' own hotspot on the myCobot 280 RDK X5 image (see the module notes).
MAKER_DIR = "/usr/local/bin/hotspot-function"
MAKER_AUTOSTART = "/home/*/.config/autostart/hotspot_on.desktop"
AUTOSTART_OFF = ".off-by-eduino"         # the login autostart, set aside while the classroom network is in use
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


MAKER_NEEDS_ROOT = ("이 로봇(RDK X5)은 제조사 핫스팟을 끄고 켜야 해서 관리자 권한이 필요해요. "
                    "로봇 터미널에서 한 번만: cd ~/robot_console && sudo python3 wifi.py <Wi-Fi 이름> <비밀번호>")


def hotspot_has_clients():
    """A phone or PC is on the robot's hotspot now (`iw` lists its stations). When `iw` is missing,
    say yes: better to keep the hotspot than to cut someone off."""
    try:
        names = [ln.split()[1] for ln in subprocess.run(["iw", "dev"], capture_output=True, text=True, timeout=5).stdout.splitlines() if ln.strip().startswith("Interface ")]
        return any("Station" in subprocess.run(["iw", "dev", n, "station", "dump"], capture_output=True, text=True, timeout=5).stdout for n in names)
    except (OSError, subprocess.SubprocessError, IndexError):
        return True


class MakerHotspot:
    """The maker's hostapd hotspot (myCobot 280 RDK X5 image), switched with the maker's own scripts."""

    def __init__(self, log):
        self.log = log

    @staticmethod
    def present():
        return all(os.path.exists(os.path.join(MAKER_DIR, f)) for f in ("hotspot_on.sh", "hotspot_off.sh"))

    @staticmethod
    def running():
        return subprocess.run(["pgrep", "-x", "hostapd"], capture_output=True).returncode == 0

    @staticmethod
    def ssid():
        try:
            with open(HOSTAPD_CONF, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith("ssid="):
                        return line.split("=", 1)[1].strip()
        except OSError:
            pass
        return "로봇 핫스팟"

    def _script(self, name, timeout=60):
        p = subprocess.run(["bash", os.path.join(MAKER_DIR, name)], capture_output=True, text=True, timeout=timeout)
        if p.returncode != 0:
            self.log(f"[Wi-Fi] {name}: {(p.stderr or p.stdout).strip()[-200:]}")

    def off(self):
        """Hotspot off, wlan0 back to NetworkManager (the driver reloads, so wait for it)."""
        self.log("[Wi-Fi] 제조사 핫스팟을 끄는 중 (hotspot_off.sh)…")
        self._script("hotspot_off.sh")
        subprocess.run(["systemctl", "stop", "isc-dhcp-server"], capture_output=True)

    def on(self):
        self.log("[Wi-Fi] 제조사 핫스팟을 켜는 중 (hotspot_on.sh)…")
        self._script("hotspot_on.sh")

    # --- classroom first at power-on -------------------------------------
    def classroom_mode(self, ssid, here):
        """After a join: power-on tries this network first; the login autostart no longer takes wlan0."""
        self._own_boot({"ssid": ssid}, here)
        self.log(f"[Wi-Fi] 켤 때마다 '{ssid}' 에 먼저 붙고, 없으면 로봇 핫스팟을 켜요.")

    def off_mode(self, here):
        """Wi-Fi off (the classroom uses the LAN cable): no hotspot at login or at power-on."""
        self._own_boot({"off": True}, here)
        self.log("[Wi-Fi] 꺼 둠: 켤 때 핫스팟도 켜지 않아요 (유선 LAN 으로만 연결).")

    def _own_boot(self, state, here):
        """Power-on is ours (eduino-wifi.service), not the maker's login autostart."""
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f)
        for path in glob.glob(MAKER_AUTOSTART):
            os.replace(path, path + AUTOSTART_OFF)
        # no DHCP server on the classroom network (hotspot_on.sh enables it again)
        subprocess.run(["systemctl", "disable", "isc-dhcp-server"], capture_output=True)
        with open(UNIT_FILE, "w", encoding="utf-8") as f:
            f.write(f"""[Unit]
Description=Eduino classroom Wi-Fi first, the robot's own hotspot when it is not there, or Wi-Fi off (wifi.py --boot)
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
# simple, not oneshot: on the fallback hotspot it keeps trying the classroom network
Type=simple
ExecStart={sys.executable} {os.path.join(here, "wifi.py")} --boot

[Install]
WantedBy=multi-user.target
""")
        subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
        subprocess.run(["systemctl", "enable", "eduino-wifi.service"], capture_output=True)

    def maker_mode(self):
        """Everything back as the maker left it: hotspot at login, no boot service."""
        for path in glob.glob(MAKER_AUTOSTART + AUTOSTART_OFF):
            os.replace(path, path[: -len(AUTOSTART_OFF)])
        if os.path.exists(UNIT_FILE):
            subprocess.run(["systemctl", "disable", "eduino-wifi.service"], capture_output=True)
            os.remove(UNIT_FILE)
            subprocess.run(["systemctl", "daemon-reload"], capture_output=True)
        if os.path.exists(STATE_FILE):
            os.remove(STATE_FILE)


class Wifi:
    def __init__(self, demo=False, log=print):
        self.demo = demo
        self.log = log
        self.lock = threading.Lock()
        # the last switch: {"ssid", "state": "switching"|"ok"|"failed", "error", "at"}
        self.last = None
        self._demo_net = {"ssid": "ElephantRobotics_AP_DEMO", "mode": "hotspot"}
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

    def boot(self):
        """Power-on (eduino-wifi.service): the classroom network if it comes, else the maker's hotspot."""
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                state = json.load(f)
        except (OSError, ValueError):
            return
        if state.get("off"):
            if self.maker and MakerHotspot.running():
                self.maker.off()
            self._radio(False)
            self.log("[Wi-Fi] 켜짐: Wi-Fi 는 꺼 둠 (유선 LAN 으로만 연결).")
            return
        ssid = state.get("ssid")
        if not ssid or not self.maker:
            return
        # a hotspot from an earlier fallback left wpa_supplicant masked: Wi-Fi needs it
        subprocess.run(["systemctl", "unmask", "wpa_supplicant"], capture_output=True)
        subprocess.run(["systemctl", "start", "wpa_supplicant"], capture_output=True)
        subprocess.run(["systemctl", "stop", "isc-dhcp-server"], capture_output=True)
        end = time.time() + BOOT_WAIT_S
        tried = False
        while time.time() < end:
            try:
                _, state, conn = self._device()
                if state.startswith("connected") and conn == ssid:
                    self.log(f"[Wi-Fi] 켜짐: '{ssid}' 에 연결됐어요.")
                    return
                if not tried and state == "disconnected" and time.time() > end - BOOT_WAIT_S / 2:
                    tried = True
                    self._nm("--wait", "20", "connection", "up", "id", ssid, timeout=30)
            except RuntimeError:
                pass
            time.sleep(2)
        self.log(f"[Wi-Fi] 켜짐: '{ssid}' 가 없어 로봇 핫스팟을 켜요.")
        self.maker.on()
        # The classroom network may come later (the router was off, or slower to start). While
        # nobody is on the hotspot, try it again now and then; someone on the hotspot is never cut off.
        while True:
            time.sleep(RETRY_S)
            if hotspot_has_clients():
                continue
            self.log(f"[Wi-Fi] '{ssid}' 를 다시 찾아봐요 (핫스팟에 붙은 기기가 없어요).")
            self.maker.off()
            try:
                self._nm("--wait", "30", "connection", "up", "id", ssid, timeout=40)
                _, state, conn = self._device()
                if state.startswith("connected") and conn == ssid:
                    self.log(f"[Wi-Fi] '{ssid}' 에 연결됐어요.")
                    return
            except RuntimeError:
                pass
            self.log(f"[Wi-Fi] '{ssid}' 가 아직 없어 핫스팟을 다시 켜요.")
            self.maker.on()

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
            if self.maker:
                if MakerHotspot.running():
                    self.maker.off()
                self.maker.off_mode(os.path.dirname(os.path.abspath(__file__)))
            self._radio(False)
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
        if self.maker and MakerHotspot.running():
            return {"device": "wlan0", "state": "connected", "mode": "hotspot", "ssid": MakerHotspot.ssid(),
                    "connection": "hostapd", "last": self.last}
        if not self._radio_on():
            return {"device": "wlan0", "state": "off", "mode": "off", "ssid": None, "connection": None, "last": self.last}
        dev, state, conn = self._device()
        mode, ssid = self._mode(conn) if state.startswith("connected") else (None, None)
        return {"device": dev, "state": state, "mode": mode, "ssid": ssid, "connection": conn, "last": self.last}

    def scan(self):
        """Nearby networks, strongest first (a robot in hotspot mode may only see a few)."""
        if self.demo:
            nets = [("ElephantRobotics_AP_DEMO", 100), ("EDUINO-LAB", 82), ("School-WiFi", 64), ("Library 2F", 31)]
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

    def hotspot(self, on_done=None):
        """Back to the robot's own hotspot (its previous AP profile, or a new one)."""
        if self.maker and os.geteuid() != 0:
            return MAKER_NEEDS_ROOT
        if not self.lock.acquire(blocking=False):
            return "이미 Wi-Fi 를 바꾸는 중이에요."
        self.last = {"ssid": "(로봇 핫스팟)", "state": "switching", "error": "", "at": time.time()}
        threading.Thread(target=self._to_hotspot, args=(on_done,), daemon=True).start()
        return None

    # ---------------------------------------------------------------- background work
    def _switch(self, ssid, password, on_done):
        maker_was_on = False
        try:
            time.sleep(1.5)                     # let the answer reach the browser first
            if self.demo:
                time.sleep(2)
                self._demo_net = {"ssid": ssid, "mode": "wifi"}
                self.last.update(state="ok")
                self.log(f"[Wi-Fi] (데모) '{ssid}' 에 연결했어요.")
                return
            self._radio(True)                   # after `--off`
            maker_was_on = bool(self.maker and MakerHotspot.running())
            if maker_was_on:
                self.maker.off()
            dev, _, before = self._wait_device()
            self.log(f"[Wi-Fi] '{ssid}' 에 연결하는 중… (지금 연결: {'제조사 핫스팟' if maker_was_on else before})")
            # A profile made from the name and password alone, not from the scan list: while the
            # robot is a hotspot its Wi-Fi cannot scan, so the classroom network is not listed.
            # "hidden" makes NetworkManager ask for that name directly instead of waiting to see it.
            try:
                self._nm("connection", "delete", "id", ssid)       # an earlier try with the same name
            except RuntimeError:
                pass
            args = ["connection", "add", "type", "wifi", "ifname", dev, "con-name", ssid, "ssid", ssid,
                    "802-11-wireless.hidden", "yes",
                    # no Wi-Fi power saving: a dozing robot answers 로봇 찾기 too late and is missed
                    "802-11-wireless.powersave", "2",
                    # prefer the classroom network at power-on; the hotspot stays as the fallback
                    "connection.autoconnect", "yes", "connection.autoconnect-priority", str(CLASSROOM_PRIORITY)]
            if password:
                args += ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password]
            try:
                self._nm(*args)
                self._nm("--wait", str(CONNECT_TIMEOUT_S), "connection", "up", "id", ssid, timeout=CONNECT_TIMEOUT_S + 10)
                if self.maker:
                    self.maker.classroom_mode(ssid, os.path.dirname(os.path.abspath(__file__)))
                self.last.update(state="ok")
                self.log(f"[Wi-Fi] '{ssid}' 에 연결했어요. 다음부터 켜면 이 Wi-Fi 에 먼저 붙어요.")
            except RuntimeError as exc:
                self.last.update(state="failed", error=str(exc))
                self.log(f"[Wi-Fi] 연결 실패: {exc} — 원래 연결({before})로 돌아가요.")
                try:
                    self._nm("connection", "delete", "id", ssid)   # no half-made profile left to retry at boot
                except RuntimeError:
                    pass
                if maker_was_on:
                    self.maker.on()
                elif before and before != "--" and before != ssid:
                    try:
                        self._nm("connection", "up", before, timeout=40)
                    except RuntimeError as exc2:
                        self.log(f"[Wi-Fi] 원래 연결로도 못 돌아갔어요: {exc2}")
        except Exception as exc:                # never leave the lock held
            self.last.update(state="failed", error=str(exc))
            self.log(f"[Wi-Fi] 연결 실패: {exc}")
            if maker_was_on and not MakerHotspot.running():
                self.maker.on()                 # never leave the robot with no way in
        finally:
            self.lock.release()
            if on_done:
                on_done()

    def _to_hotspot(self, on_done):
        try:
            time.sleep(1.5)
            if self.demo:
                self._demo_net = {"ssid": "ElephantRobotics_AP_DEMO", "mode": "hotspot"}
                self.last.update(state="ok")
                return
            self._radio(True)                   # after `--off`
            if self.maker:
                self.maker.maker_mode()
                try:
                    self._nm("device", "disconnect", "wlan0")
                except RuntimeError:
                    pass
                if not MakerHotspot.running():
                    self.maker.on()
                self.last.update(state="ok")
                self.log("[Wi-Fi] 제조사 핫스팟으로 돌아갔어요 (켤 때도 핫스팟).")
                return
            dev, _, _ = self._device()
            ap = None
            for line in self._nm("-t", "-f", "NAME,TYPE", "connection", "show").splitlines():
                name, typ = (_split_terse(line) + ["", ""])[:2]
                if typ in ("802-11-wireless", "wifi") and self._mode(name)[0] == "hotspot":
                    ap = name
                    break
            if ap:
                self._nm("connection", "up", ap, timeout=40)
            else:
                host = re.sub(r"[^A-Za-z0-9-]", "", subprocess.run(["hostname"], capture_output=True, text=True).stdout.strip()) or "robot"
                self._nm("device", "wifi", "hotspot", "ifname", dev, "ssid", f"EDUINO-{host}", "password", "12345678", timeout=40)
            self.last.update(state="ok")
            self.log("[Wi-Fi] 로봇 핫스팟으로 돌아갔어요.")
        except Exception as exc:
            self.last.update(state="failed", error=str(exc))
            self.log(f"[Wi-Fi] 핫스팟 켜기 실패: {exc}")
        finally:
            self.lock.release()
            if on_done:
                on_done()


def _say(text):
    """Print, and keep going if the terminal is gone (joining Wi-Fi can cut an SSH session over the hotspot)."""
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
        err = w.hotspot()
    elif len(argv) >= 2:
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
