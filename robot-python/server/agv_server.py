#!/usr/bin/env python3
"""이동 로봇 실습 콘솔 — myAGV 안에서 돌리는 서버.

The same console files (./static) and the same classroom Wi-Fi and camera
parts as the arm server (server.py); this one drives a myAGV 2023 (Raspberry
Pi / Jetson Nano) base instead of an arm:

    GET  /api/state      connection, the speed being driven, battery, straight-line trim
    POST /api/drive      {vx, vy, wz}: drive at this speed (m/s, m/s, rad/s) — a keep-alive:
                         send it every 0.1-0.2 s while a key or the joystick is held
    POST /api/stop       stop now
    POST /api/straight   the 1 m straight-line test: 0.2 m/s ahead for 5 s, driven here
    POST /api/trim       {w, y}: saved straight-line correction per metre ahead
    POST /api/led        {r, g, b}: the base's light
    POST /api/identify   "이 로봇 맞나요?": blink and turn a little on the spot
    POST /api/reconnect  open the base's serial port again
    GET  /api/camera.jpg front camera frame (camera.py, needs OpenCV)
    GET  /api/wifi …     classroom Wi-Fi (wifi.py), as on the arm

The base takes one motion frame at a time (pymycobot MyAgv, SET_MOTION_CONTROL:
each of forward, left and counter-clockwise as 128 + speed×100) and keeps the
last one for a moment, so this server repeats the current speed ten times a
second and sends zero as soon as the console lets go or goes quiet.

Standard library + pymycobot, like server.py. Run it on the robot:

    python3 agv_server.py            # then open http://<robot IP>:8080/console
    python3 agv_server.py --demo     # no robot: a stand-in base

Safety, enforced here as well as in the browser: speeds capped at MAX_V/MAX_W,
no keep-alive for DRIVE_HOLD_S → stop, stop always accepted.
"""

import argparse
import json
import math
import os
import threading
import time
import traceback

import camera as kit_camera
import server as base
from wifi import Wifi

PROFILE = {
    # myAGV 2023 Pi: the lower board on the Pi's /dev/ttyAMA2 at 115200 (pymycobot MyAgv, myagv_ros
    # 2023Pi); the 2023 Jetson Nano uses /dev/ttyTHS1 or ttyS0 (--serial).
    "serial_port": "/dev/ttyAMA2",
    "baudrate": 115200,
    "model": "myAGV 2023",
}
MAX_V = 0.5            # classroom speed limit, m/s (the base does 0.9)
MAX_W = 1.5            # rad/s
SEND_S = 0.1           # motion frame period (the official move commands send every 100 ms)
DRIVE_HOLD_S = 0.5     # driving and no keep-alive for this long: the console let go (or went away), stop
BATTERY_S = 5.0        # how often the battery is read while standing still
STRAIGHT = (0.2, 5.0)  # the 1 m straight-line test: speed m/s, seconds
TRIM_FILE = os.path.expanduser("~/.agv_console.json")

log = base.log


def motion_byte(v):
    """One motion value on the wire: 128 + v×100, v within ±1.0 (m/s or rad/s)."""
    return max(28, min(228, 128 + round(v * 100)))


def load_trim():
    try:
        with open(TRIM_FILE, encoding="utf-8") as f:
            t = json.load(f).get("trim", {})
        return {"w": float(t.get("w", 0.0)), "y": float(t.get("y", 0.0))}
    except (OSError, ValueError, AttributeError):
        return {"w": 0.0, "y": 0.0}


def save_trim(trim):
    try:
        with open(TRIM_FILE, "w", encoding="utf-8") as f:
            json.dump({"trim": trim}, f)
    except OSError as exc:
        log(f"[직진 보정] 저장하지 못했어요: {exc}")


class DemoBase:
    """A stand-in base (--demo): takes the same frames, drifts a little to the right like a real one."""

    DRIFT_W = -0.035       # rad per metre ahead: what the straight-line trim is there to cancel

    def __init__(self):
        self.pose = [0.0, 0.0, 0.0]
        self.speed = (0.0, 0.0, 0.0)
        self.t = time.time()
        # the drive loop and the state requests both move it on: one at a time, or a slice counts twice
        self.pose_lock = threading.Lock()

    def _advance(self):
        with self.pose_lock:
            now = time.time()
            dt, self.t = min(0.3, now - self.t), now
            vx, vy, wz = self.speed
            wz += self.DRIFT_W * vx
            x, y, th = self.pose
            self.pose = [x + (vx * math.cos(th) - vy * math.sin(th)) * dt, y + (vx * math.sin(th) + vy * math.cos(th)) * dt, th + wz * dt]

    def move(self, x, y, w):
        self._advance()
        with self.pose_lock:
            self.speed = tuple((b - 128) / 100 for b in (x, y, w))

    def where(self):
        self._advance()
        with self.pose_lock:
            return list(self.pose)

    def battery(self):
        return 12.1

    def led(self, r, g, b, blink=False):
        pass

    def close(self):
        pass


class SerialBase:
    """The real base through pymycobot MyAgv."""

    def __init__(self, port, baud):
        from pymycobot.myagv import MyAgv, ProtocolCode   # only on the robot
        self.agv = MyAgv(port, baud)
        self.code = ProtocolCode

    def move(self, x, y, w):
        # One frame, no waiting (go_ahead() and friends loop for seconds; the console needs to stop at once).
        self.agv._merge(self.code.SET_MOTION_CONTROL, x, y, w)

    def battery(self):
        """Battery voltage from the status the base reports (the higher of its two packs), or None."""
        info = self.agv.get_mcu_info()
        volts = [v for v in (info or [])[10:12] if isinstance(v, (int, float)) and 5 < v < 30]
        return max(volts) if volts else None

    def led(self, r, g, b, blink=False):
        self.agv.set_led(2 if blink else 1, r, g, b)

    def close(self):
        self.agv.close()


class Agv:
    def __init__(self, demo, port, baud):
        self.demo, self.port, self.baud = demo, port, baud
        self.lock = threading.Lock()
        self.base = None
        self.want = (0.0, 0.0, 0.0)          # asked for by the console (before the trim)
        self.want_at = 0.0
        self.script = None                   # server-driven run: {"until", "speed", "label"}
        self.sent_zero = 0
        self.residual = [0.0, 0.0, 0.0]     # rounding carried to the next motion frame
        self.last_seen = 0.0
        self.state = {
            "connected": False, "demo": demo, "kind": "agv", "vx": 0.0, "vy": 0.0, "wz": 0.0, "moving": False,
            "running": False, "battery": None, "trim": load_trim(), "led": [31, 174, 102],
            "message": "", "error": "", "updated": 0.0, "maxV": MAX_V, "maxW": MAX_W,
        }
        self._open()
        threading.Thread(target=self._loop, daemon=True).start()

    # ------------------------------------------------------------ connection
    def _open(self):
        try:
            self.base = DemoBase() if self.demo else SerialBase(self.port, self.baud)
            self.base.move(128, 128, 128)
            self.state.update(connected=True, error="")
            log(f"이동 로봇 연결: {'데모 (가짜 로봇)' if self.demo else f'{self.port} {self.baud}'}")
        except Exception as exc:
            self.base = None
            self.state.update(connected=False, error=f"로봇 바닥 보드에 연결하지 못했어요: {exc}")
            log(f"[연결] 실패: {exc}")

    def reconnect(self):
        with self.lock:
            if self.base:
                try:
                    self.base.close()
                except Exception:
                    pass
            self._open()
        return None if self.state["connected"] else self.state["error"]

    def seen(self):
        self.last_seen = time.time()

    # ------------------------------------------------------------ commands
    def drive(self, vx, vy, wz):
        if not self.state["connected"]:
            return "로봇이 연결되지 않았어요."
        if self.script:
            return "직진 테스트 중이에요. [멈춤] 뒤에 움직여 주세요."
        clamp = lambda v, m: max(-m, min(m, float(v)))
        try:
            self.want = (clamp(vx, MAX_V), clamp(vy, MAX_V), clamp(wz, MAX_W))
        except (TypeError, ValueError):
            return "속도 값이 잘못됐어요."
        self.want_at = time.time()
        return None

    def stop(self):
        self.script = None
        self.want = (0.0, 0.0, 0.0)
        self.state.update(running=False, message="정지했어요.")
        self._send(0.0, 0.0, 0.0)
        log("[정지] 요청")

    def straight_test(self):
        if not self.state["connected"]:
            return "로봇이 연결되지 않았어요."
        v, secs = STRAIGHT
        self.want = (0.0, 0.0, 0.0)
        self.script = {"until": time.time() + secs, "speed": (v, 0.0, 0.0), "label": "1m 직진 테스트"}
        self.state.update(running=True, message="1m 직진 테스트 중")
        log(f"[직진 테스트] {v} m/s 로 {secs} 초 (보정 w {self.state['trim']['w']:+.3f}, y {self.state['trim']['y']:+.3f})")
        return None

    def identify(self):
        """Blink and turn a little left and right on the spot (only when standing still)."""
        if not self.state["connected"]:
            return "로봇이 연결되지 않았어요."
        if self.state["moving"] or self.script:
            return "움직이는 중에는 알려 줄 수 없어요."
        t = time.time()
        self.script = {"steps": [(t + 0.35, (0.0, 0.0, 0.6)), (t + 0.7, (0.0, 0.0, -0.6))], "until": t + 0.7, "label": "로봇 찾기"}
        self.state.update(running=True, message="로봇 찾기: 이 로봇이에요")
        log("[로봇 찾기] 불빛을 깜빡이고 제자리에서 살짝 돌아요")
        self.led(*self.state["led"], blink=True)
        return None

    def set_trim(self, w, y):
        try:
            w, y = float(w), float(y)
        except (TypeError, ValueError):
            return "보정 값이 잘못됐어요."
        if abs(w) > 0.5 or abs(y) > 0.3:
            return "보정 값이 너무 커요 (1m 에 회전 ±0.5 rad, 옆 ±30 cm 까지)."
        self.state["trim"] = {"w": round(w, 5), "y": round(y, 5)}
        save_trim(self.state["trim"])
        log(f"[직진 보정] 저장: 회전 {math.degrees(w):+.2f}°/m, 옆 {y * 100:+.2f} cm/m")
        return None

    def led(self, r, g, b, blink=False):
        try:
            rgb = [max(0, min(255, int(c))) for c in (r, g, b)]
        except (TypeError, ValueError):
            return "색 값이 잘못됐어요."
        if not self.base:
            return "로봇이 연결되지 않았어요."
        try:
            with self.lock:
                self.base.led(*rgb, blink=blink)
        except Exception as exc:
            return f"불빛을 바꾸지 못했어요: {exc}"
        if not blink:
            self.state["led"] = rgb
        return None

    # ------------------------------------------------------------ loop
    def _send(self, vx, vy, wz):
        if not self.base:
            return
        # The wire takes 0.01 steps: a straight-line trim of a few thousandths would round away at
        # classroom speeds. Carry each frame's rounding over to the next, so the average is exact.
        frame = []
        for i, v in enumerate((vx, vy, wz)):
            b = motion_byte(v + self.residual[i] / 100)
            self.residual[i] = 0.0 if v == 0 else self.residual[i] + v * 100 - (b - 128)
            frame.append(b)
        try:
            with self.lock:
                self.base.move(*frame)
            self.state.update(vx=round(vx, 3), vy=round(vy, 3), wz=round(wz, 3), updated=time.time())
        except Exception as exc:
            self.state.update(connected=False, error=f"로봇 바닥 보드가 대답하지 않아요: {exc}")
            log(f"[연결] 끊김: {exc}")

    def _target(self, now):
        s = self.script
        if s:
            if now >= s["until"]:
                self.script = None
                self.state.update(running=False, message=f"{s['label']} 끝")
                log(f"[{s['label']}] 끝")
                if s["label"] == "로봇 찾기":
                    self.led(*self.state["led"])
                return (0.0, 0.0, 0.0)
            if "steps" in s:
                return next(v for t, v in s["steps"] if now < t)
            return s["speed"]
        if now - self.want_at > DRIVE_HOLD_S:
            if any(self.want):
                log("[주행] 유지 신호가 끊겨 멈춥니다.")
            self.want = (0.0, 0.0, 0.0)
        return self.want

    def _loop(self):
        next_battery = 0.0
        while True:
            now = time.time()
            try:
                vx, vy, wz = self._target(now)
                moving = any(abs(v) > 1e-3 for v in (vx, vy, wz))
                if moving:
                    # Straight-line trim: a little turn and sideways for every metre ahead.
                    trim = self.state["trim"]
                    wz = max(-MAX_W, min(MAX_W, wz + trim["w"] * vx))
                    vy = max(-MAX_V, min(MAX_V, vy + trim["y"] * vx))
                    self._send(vx, vy, wz)
                    self.sent_zero = 0
                elif self.sent_zero < 3:
                    # Stopping: send zero a few times, then leave the line quiet (the battery can be read).
                    self._send(0.0, 0.0, 0.0)
                    self.sent_zero += 1
                elif now > next_battery and self.base:
                    next_battery = now + BATTERY_S
                    try:
                        with self.lock:
                            volts = self.base.battery()
                        if volts:
                            self.state["battery"] = round(volts, 1)
                    except Exception as exc:
                        log(f"[배터리] 읽지 못했어요: {exc}")
                self.state["moving"] = moving
            except Exception:
                traceback.print_exc()
            time.sleep(max(0.0, SEND_S - (time.time() - now)))

    def snapshot(self):
        s = dict(self.state)
        if self.demo and isinstance(self.base, DemoBase):
            s["demoPose"] = [round(v, 4) for v in self.base.where()]
        return s


AGV = None


class Handler(base.Handler):
    """The arm server's handler (static files, Wi-Fi, camera), with the base's routes instead of the arm's."""

    def translate_path(self, path):
        # /console opens the driving console (agv.html) on this robot.
        if path.split("?")[0].rstrip("/") == "/console":
            path = "/agv"
        return super().translate_path(path)

    def do_GET(self):
        route = self.path.split("?")[0]
        if route == "/api/state":
            base.refresh_identity()
            AGV.seen()
            return self.send_json({**AGV.snapshot(), **base.IDENTITY, "camera": base.CAMERA.available})
        if route.startswith("/api/") and not (route.startswith("/api/wifi") or route == "/api/camera.jpg"):
            return self.send_json({"ok": False, "error": "없는 주소예요."}, 404)
        return super().do_GET()

    def do_POST(self):
        route = self.path.split("?")[0]
        if route.startswith("/api/wifi"):
            return super().do_POST()
        # The arm server's guard: only JSON, only from this robot's own console or the PC program on this
        # network. A text/plain POST from another web page needs no preflight and would otherwise drive it.
        if not self.console_post():
            return self.send_json({"ok": False, "error": "이 요청은 받을 수 없어요 (로봇 콘솔 화면에서만)."}, 403)
        try:
            body = self.read_json()
            if route == "/api/drive":
                err = AGV.drive(body.get("vx", 0), body.get("vy", 0), body.get("wz", 0))
            elif route == "/api/stop":
                AGV.stop()
                err = None
            elif route == "/api/straight":
                err = AGV.straight_test()
            elif route == "/api/trim":
                err = AGV.set_trim(body.get("w", 0), body.get("y", 0))
            elif route == "/api/led":
                err = AGV.led(body.get("r", 0), body.get("g", 0), body.get("b", 0))
            elif route == "/api/identify":
                err = AGV.identify()
            elif route == "/api/reconnect":
                err = AGV.reconnect()
            else:
                return self.send_json({"ok": False, "error": "없는 주소예요."}, 404)
            return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
        except Exception as exc:
            traceback.print_exc()
            return self.send_json({"ok": False, "error": str(exc)}, 500)


def main():
    global AGV
    ap = argparse.ArgumentParser(description="이동 로봇 실습 콘솔 서버 (myAGV 2023)")
    ap.add_argument("--port", type=int, default=8080, help="웹 주소 포트 (기본 8080)")
    ap.add_argument("--serial", default=PROFILE["serial_port"], help="바닥 보드 시리얼 포트 (Pi: /dev/ttyAMA2)")
    ap.add_argument("--baud", type=int, default=PROFILE["baudrate"], help="통신 속도")
    ap.add_argument("--demo", action="store_true", help="로봇 없이 가짜 이동 로봇으로 실행")
    ap.add_argument("--camera", default="auto", help="앞 카메라: auto(기본), 장치 번호, 그림 파일 경로, 또는 none")
    args = ap.parse_args()

    if not os.path.exists(os.path.join(base.STATIC_DIR, "agv.html")):
        raise SystemExit(f"화면 파일이 없어요: {base.STATIC_DIR}/agv.html — 받은 압축 파일을 이 폴더에 그대로 풀었는지 확인해 주세요.")
    AGV = Agv(args.demo, args.serial, args.baud)
    base.WIFI = Wifi(args.demo, log)
    base.CAMERA = kit_camera.CameraSet(base.camera_spec(args.camera), log)
    base.IDENTITY.update(kind="agv", model=PROFILE["model"])
    base.CROSS_ORIGIN = ("/api/state",)   # as on the arm: other pages read the state, only consoles move it
    server = base.ConsoleServer(("0.0.0.0", args.port), Handler)
    base.refresh_identity(True)
    base.IDENTITY["host"] = os.uname().nodename
    ips = base.IDENTITY["ips"]
    print("이동 로봇 실습 콘솔 서버가 켜졌어요." + (" (데모: 가짜 로봇)" if args.demo else ""))
    if base.IDENTITY["robotId"]:
        print(f"  ★ 로봇 ID: {base.IDENTITY['robotId']}   (PC 화면의 [로봇 찾기]에 이 번호로 나와요. 주소 {ips[0]})")
    for ip in ips or ["localhost"]:
        print(f"  브라우저 주소: http://{ip}:{args.port}/console")
    print("  끄기: Ctrl+C  (로봇도 함께 멈춰요)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        AGV.stop()
        print("\n서버를 껐어요.")


if __name__ == "__main__":
    main()
