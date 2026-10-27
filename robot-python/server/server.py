#!/usr/bin/env python3
"""로봇팔 실습 콘솔 — 로봇(RDK X5) 안에서 돌리는 서버.

Serves the classroom console (the web app, exported as static files into
./static) and lets it drive this robot:

    GET  /api/state    connection, live joint angles, what is running
    POST /api/run      run a program the console has already simulated
    POST /api/move     one joint move (e.g. to the observation pose)
    POST /api/target   real-time jog: the next target of a held jog key (sent a few times a second)
    POST /api/jog      smooth joint jog: the robot's own continuous jog (jog_angle) while the key is held
    POST /api/stop     stop now
    POST /api/reconnect  open the robot's serial port again (after a cable or power hiccup)
    POST /api/release  servos off, arm can be moved by hand
    POST /api/focus    servos on again
    POST /api/joint      one joint's servo off or on (zero calibration, joint by joint)
    POST /api/pump       suction pump on/off (Hobot.GPIO, BOARD 31/37 as the official RDK X5 vision kit)
    POST /api/gripper    gripper open/close now (set_gripper_state; the control panel's 열기·닫기)
                         then, once the fingers stop, hold there a little tighter instead of stalling
    POST /api/calibrate  zero calibration: the current position (marks lined up) of the given joints becomes 0°
    GET  /api/selfcheck  before the acceptance demonstration: arm, coordinates, cameras, OpenCV/ArUco, AI model,
                         pump, gripper, ROS 2 — each with what it is needed for
    GET  /api/arrivals   measured arrivals of the latest run (repeatability check)
    GET  /api/camera.jpg camera frame, ?cam=N for the N-th camera from 0 (camera.py, needs OpenCV on the robot)
    POST /api/vision     official colour program run on the robot, on the newest frame ({"cam": N})
    POST /api/ai         AI sample: YOLOv5s object detection on the robot's CPU (official RDK X5 vision kit
                         yolo_demo; models/yolov5s.onnx from the USB kit) → names, boxes, time, marked picture
    POST /api/vision/hand  hand camera (camera flange): official RDK X5 vision kit colour program and
                         hand-eye calibration → each block's position in the robot's base frame

Standard library + pymycobot; the optional camera part uses the robot's OpenCV
when it is there. Run it on the robot:

    python3 server.py            # then open http://<robot IP>:8080/console
    python3 server.py --demo     # no robot: a stand-in arm, for trying it out

Safety, enforced here as well as in the browser (the browser is not trusted):
every joint target inside the adopted limits, speed capped at SPEED_CAP, one
program at a time, stop always accepted, servo release refused while moving.
"""

import argparse
import base64
import glob
import ipaddress
import json
import math
import os
import random
import threading
import time
import traceback
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import camera as kit_camera
import robot_label
from wifi import Wifi

# --------------------------------------------------------------------------- #
# Robot profile — the one place for connection and limit numbers.             #
# --------------------------------------------------------------------------- #
PROFILE = {
    # pymycobot 4.0.x pymycobot/mycobot280rdkx5.py (MyCobot280RDKX5, default baudrate 100_0000)
    # and the official RDK X5 demo; confirmed on the real robot (docs/reports/console/08-robot-check.md).
    "serial_port": "/dev/ttyS1",
    "baudrate": 1_000_000,
    # Adopted per-axis limits, degrees (web-typescript/src/engine/robot/limits.ts; equals pymycobot
    # robot_limit["MyCobot280RDK-X5"]).
    "angle_min": [-168, -135, -150, -145, -155, -180],
    "angle_max": [168, 135, 150, 145, 160, 180],
}
SPEED_CAP = 50          # classroom speed limit (same as the console)
ARRIVE_DEG = 2.0        # final arrival tolerance (J1 measured 1.4° on the real robot)
VIA_DEG = 5.0           # intermediate waypoint of a straight line: send the next one early
POLL_S = 0.1            # live angle refresh for the console
IDENTIFY_SPEED = 25     # 로봇 찾기 [움직여 확인]: straightening, slow enough to stop by hand
DEADMAN_S = 5.0         # stop a run when the console has not polled for this long (0 = off; --deadman);
                        # 5 s rides out a Wi-Fi roam or a busy classroom network without letting a lost arm go on
SETTLE_S = 0.3         # after arriving, wait up to this long for the arm to stop moving before measuring
JOG_LEAD_DEG = 15.0    # a jog target may lead the arm by at most this much per joint
JOG_HOLD_S = 1.0       # jogging and no keep-alive for this long: the console let go (or went away), stop
JOG_EDGE_DEG = 3.0     # a continuous joint jog stops this far before the joint's limit
COORD_AXES = ("x", "y", "z", "rx", "ry", "rz")  # pymycobot jog_coord ids 1..6
GRIP_SPEED = 50
# The gripper is a position servo: told "close", it pushes towards fully closed for as long as it is
# powered, stalled against the other finger or the object (the buzzing, and a hot motor). Once the
# fingers stop, it is told to hold where they are, this many steps (0-100 scale) tighter: enough to
# keep a block, not a stall. Negative: never ease off (--grip-squeeze).
GRIP_SQUEEZE = 12
GRIP_SETTLE_S = 3.0    # how long the fingers may take to stop
# "Close" is not "fully closed": the fingers go slowly towards 60 (a full close at speed 50 stalled on
# the kit's 40 mm cube and buzzed). They stop on the object; then they hold GRIP_SQUEEZE steps tighter
# than where they stopped, whatever the object's size. 82 (an estimate of 40 mm minus ~4 mm) was too
# weak to lift the cube on the real robot. --grip-close 0 = fully.
GRIP_CLOSE = 60
GRIP_CLOSE_SPEED = 30
# When each joint was last zero-calibrated from the console. Kept in the home folder,
# not next to the server, so unpacking a new robot_console.zip keeps it.
CALIBRATION_FILE = os.path.expanduser("~/.robot_console_calibration.json")


def load_calibration():
    try:
        with open(CALIBRATION_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return {str(k): float(v) for k, v in data.get("joints", {}).items()}
    except (OSError, ValueError, AttributeError):
        return {}


def save_calibration(joints):
    try:
        with open(CALIBRATION_FILE, "w", encoding="utf-8") as f:
            json.dump({"joints": joints}, f)
    except OSError as exc:
        log(f"[영점] 기록을 저장하지 못했어요: {exc}")


def arrival_gap(now, target, tolerance):
    """Which joints are short of the target and by how much, in words for the console."""
    if not now:
        return ""
    far = [(i, t - a) for i, (a, t) in enumerate(zip(now, target)) if abs(t - a) > tolerance]
    far.sort(key=lambda x: -abs(x[1]))
    return ", ".join(f"J{i + 1} 목표 {target[i]:.1f}° / 지금 {now[i]:.1f}° ({abs(d):.1f}° 차이)" for i, d in far[:3])
MAX_ARRIVALS = 200      # measured arrivals kept per run (for the repeatability check)


def log(text):
    """One line in the server terminal, so the teacher can see what the robot is asked to do."""
    print(time.strftime("%H:%M:%S"), text, flush=True)


STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
# Shown for a manual PDF (/guides/*.pdf) the robot does not carry: they are in the PC program.
GUIDE_ELSEWHERE = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>설명서</title><body style="font-family:sans-serif;max-width:32em;margin:3em auto;padding:0 1em;line-height:1.7">
<h2>이 설명서는 PC 프로그램에 있어요</h2>
<p>로봇에는 설명서 PDF 를 넣지 않았어요.</p>
<p>PC 의 <b>Physical AI 시뮬레이터</b> 프로그램 → <b>자료실</b>에서 열어 주세요.</p>
</body>"""


class DemoArm:
    """Stand-in with the MyCobot280RDKX5 method names used here; moves at ~speed x 2 °/s."""

    def __init__(self, gripper=True):
        self.angles = [3.95, 134.47, -57.83, -129.46, 104.41, -1.84]  # measured power-on rest pose
        self.has_gripper = gripper   # --no-gripper: a flange without one (get_gripper_value answers -1)
        self.target, self.speed, self.t = list(self.angles), 30, time.time()
        self.limp = [False] * 6
        self.grip, self.grip_target, self.grip_speed, self.grip_t = 100.0, 100.0, 50, time.time()

    def _tick(self):
        now = time.time()
        dt, self.t = now - self.t, now
        step = self.speed * 2.0 * dt
        # A released joint stays where the hand left it (the demo has no hand: it stays put).
        self.angles = [a if limp else a + max(-step, min(step, b - a)) for a, b, limp in zip(self.angles, self.target, self.limp)]

    def get_angles(self):
        self._tick()
        time.sleep(0.004)
        return [round(a + random.uniform(-0.05, 0.05), 2) for a in self.angles]

    def send_angles(self, angles, speed):
        self._tick()
        self.target, self.speed = list(angles), speed
        return 1

    def stop(self):
        self._tick()
        self.target = list(self.angles)
        return 1

    def jog_coord(self, coord_id, direction, speed):
        """The demo arm has no kinematics: a base-axis jog turns the shoulder (x), the base (y) or the
        elbow (z), and a turn (rx / ry / rz) a wrist joint, so something visible happens; the real
        robot moves or turns the tool."""
        return self.jog_angle((2, 1, 3, 6, 5, 4)[coord_id - 1], direction if coord_id != 3 else 1 - direction, speed)

    def jog_angle(self, joint_id, direction, speed):
        """Continuous jog as the firmware does it: keep turning towards the joint's limit until stop()."""
        self._tick()
        i = joint_id - 1
        self.target = list(self.angles)
        self.target[i] = PROFILE["angle_max"][i] if direction else PROFILE["angle_min"][i]
        self.speed = speed
        return 1

    def release_all_servos(self):
        self.limp = [True] * 6
        return 1

    def focus_all_servos(self):
        self._tick()
        self.limp = [False] * 6
        self.target = list(self.angles)
        return 1

    def release_servo(self, servo_id):
        self._tick()
        self.limp[servo_id - 1] = True
        return 1

    def focus_servo(self, servo_id):
        self._tick()
        self.limp[servo_id - 1] = False
        self.target[servo_id - 1] = self.angles[servo_id - 1]
        return 1

    def power_on(self):
        return 1

    def _grip_tick(self):
        now = time.time()
        dt, self.grip_t = now - self.grip_t, now
        step = max(1, self.grip_speed) * dt * 1.5
        self.grip = self.grip + max(-step, min(step, self.grip_target - self.grip))

    def set_gripper_state(self, state, speed, gripper_type=None):
        self._grip_tick()
        # the demo fingers close on a 30-wide block (they cannot get past it)
        self.grip_target, self.grip_speed = (100.0 if state == 0 else 30.0), speed
        return 1

    def set_gripper_value(self, value, speed, gripper_type=None):
        self._grip_tick()
        self.grip_target, self.grip_speed = float(max(30, value)), speed
        return 1

    def get_gripper_value(self, gripper_type=1):
        if not self.has_gripper:
            return -1
        self._grip_tick()
        return int(round(self.grip))

    def set_servo_calibration(self, servo_id):
        self._tick()
        self.angles[servo_id - 1] = 0.0
        self.target[servo_id - 1] = 0.0
        return 1

    def get_coords(self):
        """Flange pose like the robot's get_coords (x, y, z mm, rx, ry, rz °), from the RDK X5 URDF in
        the console files (the real firmware agrees within 0.2 mm on position, docs/reports/console/08-robot-check.md)."""
        self._tick()
        return demo_coords(self.angles, kit_camera.FIRMWARE_TO_FLANGE_DEG)


def _urdf_chain():
    """(xyz m, rpy rad) of each joint of the RDK X5 URDF shipped with the console (all turn about z)."""
    import xml.etree.ElementTree as ET
    path = os.path.join(STATIC_DIR, "robot", "rdkx5", "mycobot_280_rdkx5.urdf")
    chain = []
    for j in ET.parse(path).getroot().iter("joint"):
        if j.get("type") != "revolute":
            continue
        o = j.find("origin")
        chain.append(([float(v) for v in o.get("xyz").split()], [float(v) for v in o.get("rpy").split()]))
    return chain


def _mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def demo_frame(angles):
    """Forward kinematics of the URDF: 4 x 4 flange pose (m)."""
    global DEMO_CHAIN
    if DEMO_CHAIN is None:
        DEMO_CHAIN = _urdf_chain()
    t = [[1.0, 0, 0, 0], [0, 1.0, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]]
    for (xyz, (r, p, y)), q in zip(DEMO_CHAIN, angles):
        cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
        origin = [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, xyz[0]],
                  [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, xyz[1]],
                  [-sp, cp * sr, cp * cr, xyz[2]], [0, 0, 0, 1.0]]
        c, s_ = math.cos(math.radians(q)), math.sin(math.radians(q))
        turn = [[c, -s_, 0, 0], [s_, c, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]]
        t = _mul(_mul(t, origin), turn)
    return t


def demo_coords(angles, firmware_turn_deg=0.0):
    """Flange pose as get_coords reports it (x, y, z mm, rx, ry, rz °, static x-y-z). firmware_turn_deg:
    the firmware's tool frame turned about the flange axis from the URDF's (the demo arm uses the
    turn the console's hand camera assumes, so its hand camera and the official calibration agree)."""
    t = demo_frame(angles)
    if firmware_turn_deg:
        c, s_ = math.cos(math.radians(firmware_turn_deg)), math.sin(math.radians(firmware_turn_deg))
        t = _mul(t, [[c, -s_, 0, 0], [s_, c, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]])
    rx = math.degrees(math.atan2(t[2][1], t[2][2]))
    ry = math.degrees(math.asin(max(-1.0, min(1.0, -t[2][0]))))
    rz = math.degrees(math.atan2(t[1][0], t[0][0]))
    return [round(t[0][3] * 1000, 1), round(t[1][3] * 1000, 1), round(t[2][3] * 1000, 1), round(rx, 2), round(ry, 2), round(rz, 2)]


DEMO_CHAIN = None


class Pump:
    """Suction pump V2.0 on the base's 40-pin header, switched the way Elephant Robotics'
    own RDK X5 vision kit does it (mycobot280RDKX5_vision_kit color_demo.py, aruco_demo.py):
    Hobot.GPIO, BOARD numbering, pins 31 and 37.
        start: both HIGH     on: 31 HIGH, then 37 LOW     off: 31 LOW, then 37 HIGH
    Hobot.GPIO ships with RDK OS; it is imported only here, so the rest of the server
    works without it."""

    PIN_A = 31
    PIN_B = 37

    def __init__(self, demo):
        self.demo = demo
        self.gpio = None
        self.error = ""
        self.on = False
        if demo:
            return
        try:
            import Hobot.GPIO as GPIO    # RDK OS only
            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BOARD)
            GPIO.setup(self.PIN_B, GPIO.OUT)
            GPIO.output(self.PIN_B, GPIO.HIGH)
            GPIO.setup(self.PIN_A, GPIO.OUT)
            GPIO.output(self.PIN_A, GPIO.HIGH)
            self.gpio = GPIO
        except Exception as exc:        # not an RDK, or no permission for the pins
            self.error = f"Hobot.GPIO 를 쓸 수 없어요: {exc}"
            if os.geteuid() != 0:
                self.error += " (서버가 관리자 권한 없이 켜져 있어요 — 핀을 쓰려면 관리자 권한이 필요할 수 있어요)"

    @property
    def available(self):
        return self.demo or self.gpio is not None

    def set(self, on):
        if not self.available:
            raise RuntimeError(self.error or "펌프를 켤 수 없어요.")
        if self.gpio is not None:
            g = self.gpio
            if on:
                g.output(self.PIN_A, g.HIGH)
                time.sleep(0.05)
                g.output(self.PIN_B, g.LOW)
            else:
                g.output(self.PIN_A, g.LOW)
                time.sleep(0.05)
                g.output(self.PIN_B, g.HIGH)
        self.on = on
        log(f"[펌프] {'켜기' if on else '끄기'}" + (" (데모)" if self.demo else ""))


class NoArm:
    """Stands in for the arm while its port cannot be opened: every call fails with the reason."""

    def __init__(self, reason):
        self.reason = reason

    def __getattr__(self, name):
        def fail(*_args, **_kwargs):
            raise RuntimeError(self.reason)
        return fail


class Robot:
    """The arm plus a live state the console polls, and one program runner."""

    def __init__(self, demo, port, baud, gripper=True):
        self.demo = demo
        self.port, self.baud = port, baud
        open_error = ""
        if demo:
            self.arm = DemoArm(gripper)
        else:
            # A missing pymycobot or a port that will not open must not stop the server (systemd
            # would restart it every few seconds and no PC could find the robot to learn why): it
            # serves anyway, says what is wrong, and the poll loop keeps trying to open the port.
            try:
                from pymycobot import MyCobot280RDKX5   # opening the port sends nothing to the arm
                self.arm = MyCobot280RDKX5(port, baud)
                time.sleep(0.3)
                self.arm.power_on()
            except Exception as exc:
                open_error = f"로봇 포트({port})를 열지 못했어요: {exc}"
                log(f"[연결] {open_error}")
                self.arm = NoArm(open_error)
        self.lock = threading.Lock()
        self.state = {
            "connected": False, "demo": demo, "angles": None, "updated": 0.0,
            "running": False, "step": -1, "line": 0, "total": 0, "released": False,
            # Servo off per joint (J1..J6); "released" is true when any joint is off.
            "limp": [False] * 6,
            # When each joint was zero-calibrated from the console: {"1": unix time, ...}
            "calibrated": load_calibration(),
            "message": "", "error": open_error, "read_errors": 0, "run": 0,
            # The gripper as last commanded: "open", "closed" or None (not told yet since the server started).
            "gripper": None,
            # Where the fingers stopped after the last open or close (0 closed .. 100 open), None until known.
            "gripperValue": None,
            # Every settled arrival of the latest run: target and measured angles, degrees.
            "arrivals": [],
        }
        self.start_lock = threading.Lock()
        self.last_seen = time.time()
        # Until then the dead-man check waits (a short move asked by another PC: 로봇 찾기 [움직여 확인]).
        self.grace_until = 0.0
        self.reopen_at = time.time() + 10   # with no arm (NoArm): when to try the port again
        self.lost = False           # the current run was stopped by the dead-man check
        self.pump = Pump(demo)   # stays as it is on Stop: switching off would drop a held block
        self.abort = threading.Event()
        self.runner = None
        self.jog_at = 0.0           # time of the latest jog target; 0 when not jogging
        self.jog_key = None         # what the firmware is jogging now: ("joint", 1..6, ±1) or ("coord", 1..3, ±1)
        self.jog_speed = 0
        self.grip_gen = 0           # each gripper command; a newer one cancels the older one's easing off
        threading.Thread(target=self._poll, daemon=True).start()

    # -- low level ------------------------------------------------------ #
    def call(self, name, *args):
        with self.lock:
            return getattr(self.arm, name)(*args)

    def read_angles(self):
        try:
            a = self.call("get_angles")
        except Exception:                       # serial hiccup: keep going, report it
            a = None
        if isinstance(a, list) and len(a) == 6 and all(isinstance(v, (int, float)) for v in a):
            self.state.update(angles=[round(float(v), 2) for v in a], updated=time.time(), connected=True)
            return a
        self.state["read_errors"] += 1
        if time.time() - self.state["updated"] > 2.0:
            self.state["connected"] = False
        return None

    def _poll(self):
        while True:
            if isinstance(self.arm, NoArm) and time.time() > self.reopen_at and not self.state["running"]:
                self.reopen_at = time.time() + 10
                if self.reconnect() is None:
                    self.state["error"] = ""
            if not self.state["running"]:       # the runner reads angles itself while moving
                self.read_angles()
                # Hold-to-run: a jog lasts only while the console keeps sending targets.
                if self.jog_at and time.time() - self.jog_at > JOG_HOLD_S:
                    log("[조그] 목표가 끊겨 멈춥니다.")
                    self.end_jog()
                # A firmware jog stops a few degrees before the joint's limit.
                elif self.jog_key and self.jog_key[0] == "joint" and self.state["angles"]:
                    _, j, d = self.jog_key
                    a = self.state["angles"][j - 1]
                    edge = PROFILE["angle_max"][j - 1] if d > 0 else PROFILE["angle_min"][j - 1]
                    if (edge - a) * d < JOG_EDGE_DEG:
                        log(f"[조그] J{j} 한계 가까이에서 멈춥니다.")
                        self.end_jog()
            # Dead-man: the console polls /api/state several times a second. If it goes
            # quiet while the arm is moving (Wi-Fi dropped, laptop closed), nobody can
            # press Stop any more — so stop.
            elif DEADMAN_S and time.time() - self.last_seen > DEADMAN_S and time.time() > self.grace_until and not self.abort.is_set():
                log(f"[정지] 화면과 {DEADMAN_S:g}초 넘게 연결이 끊겨 멈춥니다.")
                self.lost = True
                self.stop()
            time.sleep(POLL_S)

    def seen(self):
        """The console asked for the state: it is still there."""
        self.last_seen = time.time()

    # -- checks --------------------------------------------------------- #
    @staticmethod
    def check_angles(angles):
        if not (isinstance(angles, list) and len(angles) == 6):
            return "관절 각도는 6개여야 해요."
        for i, v in enumerate(angles):
            if not isinstance(v, (int, float)) or math.isnan(v):
                return f"{i + 1}번 관절 각도가 숫자가 아니에요."
            lo, hi = PROFILE["angle_min"][i], PROFILE["angle_max"][i]
            if not lo - 0.5 <= v <= hi + 0.5:
                return f"{i + 1}번 관절 {v:.1f}°는 범위({lo}°~{hi}°) 밖이에요."
        return None

    def validate(self, actions):
        if not isinstance(actions, list) or not actions:
            return "보낼 동작이 없어요."
        for n, a in enumerate(actions):
            t = a.get("type") if isinstance(a, dict) else None
            if t == "angles":
                err = self.check_angles(a.get("angles"))
                if err:
                    return f"{n + 1}번째 동작: {err}"
            elif t in ("gripper", "wait", "found"):
                if t == "wait" and not 0 <= float(a.get("sec", 0)) <= 10:
                    return "기다리기는 0~10초만 돼요."
            elif t == "pump":
                if not self.pump.available:
                    return f"흡착 펌프를 켤 수 없어요 ({self.pump.error})"
            elif t == "timed":
                err = self.check_timed(n, a, actions[n - 1] if n else None)
                if err:
                    return err
            else:
                return f"알 수 없는 동작: {t}"
        if any(a.get("type") == "timed" for a in actions) and not all(a.get("type") == "timed" for a in actions):
            return "파이썬 프로그램의 명령과 블록 명령을 섞어 보낼 수 없어요."
        return None

    def check_timed(self, n, a, prev):
        """One command of a Python program (중급·고급), replayed at its time t."""
        try:
            t = float(a.get("t"))
        except (TypeError, ValueError):
            return f"{n + 1}번째 명령: 시각이 없어요."
        if not 0 <= t <= 300 or (prev is not None and t < float(prev.get("t", 0))):
            return f"{n + 1}번째 명령: 시각({t})이 맞지 않아요."
        cmd = a.get("cmd")
        if cmd == "angles":
            err = self.check_angles(a.get("angles"))
            return f"{n + 1}번째 명령: {err}" if err else None
        if cmd == "pump":
            return None if self.pump.available else f"흡착 펌프를 켤 수 없어요 ({self.pump.error})"
        if cmd in ("stop", "gripper", "focus"):
            return None
        return f"{n + 1}번째 명령: 알 수 없는 명령 {cmd}"

    # -- running -------------------------------------------------------- #
    def start(self, actions, message):
        """Start a run. Returns (error, run id); the console waits for that id to finish."""
        with self.start_lock:
            if self.state["running"]:
                return "이미 움직이는 중이에요.", None
            if self.state["released"]:
                return "손으로 움직이기가 켜져 있어요. 먼저 서보를 고정해 주세요.", None
            err = self.validate(actions)
            if err:
                return err, None
            self.abort.clear()
            self.lost = False
            self.jog_at = 0.0
            self.jog_key = None
            self.seen()
            run = self.state["run"] + 1
            self.state.update(running=True, step=-1, line=0, total=len(actions), message=message, error="", run=run, arrivals=[])
            self.runner = threading.Thread(target=self._run, args=(actions,), daemon=True)
            self.runner.start()
            return None, run

    def target(self, angles, speed):
        """Real-time jog: go on towards this pose without waiting (send_angles returns at once).
        The console sends the next one a few times a second while a jog key is held, each a
        little ahead of the arm; when they stop coming, the arm stops (JOG_HOLD_S)."""
        if self.state["running"]:
            return "이미 움직이는 중이에요."
        if self.state["released"]:
            return "서보가 풀려 있어요. 먼저 서보를 고정해 주세요."
        err = self.check_angles(angles)
        if err:
            return err
        now = self.state["angles"]
        if now and max(abs(a - b) for a, b in zip(now, angles)) > JOG_LEAD_DEG:
            return f"조그 목표가 지금 자세보다 {JOG_LEAD_DEG:g}° 넘게 앞서요."
        try:
            speed = max(1, min(SPEED_CAP, int(round(float(speed)))))
        except (TypeError, ValueError):
            speed = 20
        if self.jog_key:
            self.call("stop")
            self.jog_key = None
        if not self.jog_at:
            log(f"[조그] 시작 (속도 {speed})")
        self.call("send_angles", [round(float(v), 2) for v in angles], speed)
        self.jog_at = time.time()
        return None

    def jog(self, joint, direction, speed, axis=None):
        """Smooth jog: the robot's own continuous jog for as long as the console keeps calling
        (every ~0.15 s while the key is held) — a joint (pymycobot jog_angle), the tool along a
        base axis x / y / z (jog_coord 1-3, the robot keeps the tool's orientation) or the tool
        turned about one, rx / ry / rz (jog_coord 4-6, the tip kept). A repeat only keeps
        it alive; a new speed is sent on at once. The arm stops when the calls stop (JOG_HOLD_S),
        at Stop, and a joint jog near the joint's limit."""
        if self.state["running"]:
            return "이미 움직이는 중이에요."
        if self.state["released"]:
            return "서보가 풀려 있어요. 먼저 서보를 고정해 주세요."
        if direction not in (-1, 1):
            return "방향은 -1 또는 1 이에요."
        if axis is not None:
            if axis not in COORD_AXES:
                return "축은 x, y, z, rx, ry, rz 예요."
            key = ("coord", COORD_AXES.index(axis) + 1, direction)
        else:
            if joint not in range(1, 7):
                return "관절 번호는 1~6 이에요."
            a = (self.state["angles"] or [0.0] * 6)[joint - 1]
            edge = PROFILE["angle_max"][joint - 1] if direction > 0 else PROFILE["angle_min"][joint - 1]
            if (edge - a) * direction < JOG_EDGE_DEG:
                return f"{joint}번 관절이 한계({edge}°)에 닿았어요."
            key = ("joint", joint, direction)
        try:
            speed = max(1, min(SPEED_CAP, int(round(float(speed)))))
        except (TypeError, ValueError):
            speed = 20
        if self.jog_key != key or abs(speed - self.jog_speed) >= 2:
            if self.jog_key and self.jog_key != key:
                self.call("stop")
            kind, n, d = key
            if self.jog_key != key:
                log(f"[조그] {'J' + str(n) if kind == 'joint' else COORD_AXES[n - 1].upper()} {'+' if d > 0 else '-'} 연속 (속도 {speed})")
            else:
                log(f"[조그] 속도 {speed}")
            self.call("jog_angle" if kind == "joint" else "jog_coord", n, 1 if d > 0 else 0, speed)
            self.jog_key, self.jog_speed = key, speed
        self.jog_at = time.time()
        return None

    def end_jog(self):
        self.jog_at = 0.0
        self.jog_key = None
        try:
            self.call("stop")
        except Exception:
            pass

    def stop(self):
        log("[정지] 요청")
        self.abort.set()
        self.jog_at = 0.0
        self.jog_key = None
        try:
            self.call("stop")
        except Exception:
            pass

    def _sleep(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            if self.abort.is_set():
                raise InterruptedError
            time.sleep(0.02)

    def _move(self, target, speed, tolerance):
        speed = max(1, min(SPEED_CAP, int(round(speed))))
        start = self.read_angles() or self.state["angles"] or target
        reply = self.call("send_angles", [round(v, 2) for v in target], speed)
        if tolerance == ARRIVE_DEG:
            log(f"     send_angles 속도 {speed} → 응답 {reply!r}")
        span = max(abs(a - b) for a, b in zip(start, target))
        deadline = time.time() + 3.0 + span / max(4.0, speed * 0.8)
        now = None
        while True:
            if self.abort.is_set():
                raise InterruptedError
            now = self.read_angles() or now
            if now and max(abs(a - b) for a, b in zip(now, target)) <= tolerance:
                if tolerance == ARRIVE_DEG:
                    self._settle(target, now)
                return
            if time.time() > deadline:
                gap = arrival_gap(now or self.state["angles"], target, tolerance)
                raise TimeoutError(f"목표 자세에 도착하지 않았어요: {gap}. 팔이 어딘가에 막혔거나, 영점이 틀어졌을 수 있어요." if gap else
                                   "목표 자세에 도착하지 않았어요 (막혔거나 한계에 걸렸을 수 있어요).")
            time.sleep(0.03)

    def _settle(self, target, now):
        """Wait until two reads agree (the arm has stopped), then record where it really is."""
        end = time.time() + SETTLE_S
        while time.time() < end:
            time.sleep(0.05)
            nxt = self.read_angles()
            if not nxt:
                continue
            still = max(abs(a - b) for a, b in zip(nxt, now)) < 0.1
            now = nxt
            if still:
                break
        arrivals = self.state["arrivals"]
        if len(arrivals) < MAX_ARRIVALS:
            arrivals.append({"target": [round(v, 2) for v in target], "actual": [round(float(v), 2) for v in now]})

    def calibrate(self, joints):
        """Zero calibration (official set_servo_calibration): with the servos released and every
        joint's zero marks lined up by hand, the present position of each joint becomes 0°."""
        if self.state["running"]:
            return "움직이는 중에는 영점을 맞출 수 없어요."
        if not joints or any(j not in range(1, 7) for j in joints):
            return "관절 번호는 1~6 이에요."
        before = self.read_angles() or self.state["angles"] or [0.0] * 6
        for j in joints:
            # A joint the servo is holding (the arm stands straight, or was jogged until its marks
            # met): release it for a moment first, as the official procedure calibrates released
            # joints. At the upright 0 degree pose gravity barely pulls, so nothing moves.
            if not self.state["limp"][j - 1]:
                self.call("release_servo", j)
                time.sleep(0.05)
            log(f"[영점] {j}번 관절: 읽은 각도 {before[j - 1]:.2f}° → 0° 로")
            reply = self.call("set_servo_calibration", j)
            log(f"[영점] {j}번 관절 → 응답 {reply!r}")
            time.sleep(0.1)
            reply = self.call("focus_servo", j)
            log(f"[영점] {j}번 관절 서보 고정 → 응답 {reply!r}")
            time.sleep(0.05)
            self.state["limp"][j - 1] = False
            self.state["calibrated"][str(j)] = time.time()
        self.state["released"] = any(self.state["limp"])
        save_calibration(self.state["calibrated"])
        return None

    def reconnect(self):
        """Close and reopen the serial port (the arm was switched off and on, or the cable came
        loose), then read the angles once. Returns an error message, or None when the arm answers."""
        if self.state["running"]:
            return "움직이는 중에는 다시 연결할 수 없어요."
        log("[연결] 로봇과 다시 연결해요")
        if not self.demo:
            with self.lock:
                try:
                    self.arm.close()
                except Exception:
                    pass
                time.sleep(0.3)
                try:
                    from pymycobot import MyCobot280RDKX5
                    self.arm = MyCobot280RDKX5(self.port, self.baud)
                    time.sleep(0.3)
                    self.arm.power_on()
                except Exception as exc:
                    log(f"[연결] 포트를 열지 못했어요: {exc}")
                    return f"로봇 포트({self.port})를 열 수 없어요: {exc}. 로봇 포트를 쓰는 다른 프로그램을 꺼 주세요."
            time.sleep(0.3)
        self.state["read_errors"] = 0
        for _ in range(5):
            if self.read_angles():
                log("[연결] 다시 연결됐어요")
                return None
            time.sleep(0.2)
        log("[연결] 로봇이 대답하지 않아요")
        return "로봇이 대답하지 않아요. 로봇 전원이 켜져 있는지(베이스의 불빛), 케이블이 꽂혀 있는지 확인해 주세요."

    def set_joint(self, joint, off):
        """One joint's servo off (to line up its zero marks by hand) or on again."""
        if self.state["running"]:
            return "움직이는 중에는 바꿀 수 없어요."
        if joint not in range(1, 7):
            return "관절 번호는 1~6 이에요."
        reply = self.call("release_servo" if off else "focus_servo", joint)
        log(f"[서보] J{joint} {'풀기' if off else '고정'} → 응답 {reply!r}")
        self.state["limp"][joint - 1] = bool(off)
        self.state["released"] = any(self.state["limp"])
        return None

    def _run(self, actions):
        if actions and actions[0].get("type") == "timed":
            return self._run_timed(actions)
        log(f"[실행 {self.state['run']}] 동작 {len(actions)}개 시작")
        try:
            for n, a in enumerate(actions):
                self.state.update(step=n, line=int(a.get("line", 0)))
                t = a["type"]
                if not a.get("via"):
                    detail = " ".join(f"{v:.1f}" for v in a["angles"]) if t == "angles" else ""
                    log(f"  {n + 1}/{len(actions)} {t} {detail}")
                if t == "angles":
                    self._move(a["angles"], a.get("speed", 30), VIA_DEG if a.get("via") else ARRIVE_DEG)
                elif t == "gripper":
                    self.grip(bool(a.get("open")), int(a.get("gripperType", 1)))
                    self._sleep(1.5)
                elif t == "wait":
                    self._sleep(float(a.get("sec", 0)))
                elif t == "pump":
                    self.pump.set(bool(a.get("on")))
                    self._sleep(1.0 if a.get("on") else 0.8)   # suction builds / the block drops
            self.state["message"] = "끝났어요."
            log(f"[실행 {self.state['run']}] 끝")
        except InterruptedError:
            self.state["message"] = "정지했어요."
            if self.lost:
                self.state["error"] = "화면과 연결이 끊겨 로봇이 스스로 멈췄어요. 와이파이·유선 연결을 확인해 주세요."
            log(f"[실행 {self.state['run']}] 정지")
        except Exception as exc:
            self.stop()
            self.state["error"] = str(exc) or type(exc).__name__
            log(f"[실행 {self.state['run']}] 오류: {self.state['error']}")
            traceback.print_exc()
        finally:
            self.state.update(running=False, step=-1)

    def _wait_until(self, deadline):
        """Sleep until a moment, reading the arm (for the console) and honouring Stop."""
        while True:
            if self.abort.is_set():
                raise InterruptedError
            left = deadline - time.time()
            if left <= 0:
                return
            self.read_angles()
            time.sleep(min(0.05, left))

    def _run_timed(self, actions):
        """A Python program's commands at the times the program issued them (simulated
        and checked in the console first) — like running the program itself here."""
        log(f"[실행 {self.state['run']}] 파이썬 프로그램 명령 {len(actions)}개 시작")
        last = None
        try:
            t0 = time.time()
            for n, a in enumerate(actions):
                self.state.update(step=n, line=int(a.get("line", 0)))
                self._wait_until(t0 + float(a["t"]))
                cmd = a["cmd"]
                if cmd == "angles":
                    speed = max(1, min(SPEED_CAP, int(round(a.get("speed", 30)))))
                    self.call("send_angles", [round(v, 2) for v in a["angles"]], speed)
                    last = (a["angles"], speed)
                    log(f"  {a['t']:6.2f}s L{a.get('line', 0)} send_angles " + " ".join(f"{v:.1f}" for v in a["angles"]) + f" 속도 {speed}")
                elif cmd == "stop":
                    self.call("stop")
                    last = None
                    log(f"  {a['t']:6.2f}s L{a.get('line', 0)} stop")
                elif cmd == "pump":
                    self.pump.set(bool(a.get("on")))
                elif cmd == "gripper":
                    self.grip(bool(a.get("open")), int(a.get("gripperType", 1)))
                    log(f"  {a['t']:6.2f}s L{a.get('line', 0)} gripper {'open' if a.get('open') else 'close'}")
                elif cmd == "focus":
                    self.call("focus_all_servos")
            # the program has ended; let the last move finish
            if last:
                target, speed = last
                start = self.read_angles() or target
                span = max(abs(x - y) for x, y in zip(start, target))
                deadline = time.time() + 3.0 + span / max(4.0, speed * 0.8)
                while True:
                    now = self.read_angles()
                    if now and max(abs(x - y) for x, y in zip(now, target)) <= ARRIVE_DEG:
                        break
                    if time.time() > deadline:
                        gap = arrival_gap(now or self.state["angles"], target, ARRIVE_DEG)
                        raise TimeoutError(f"목표 자세에 도착하지 않았어요: {gap}. 팔이 어딘가에 막혔거나, 영점이 틀어졌을 수 있어요." if gap else
                                           "목표 자세에 도착하지 않았어요 (막혔거나 한계에 걸렸을 수 있어요).")
                    self._wait_until(time.time() + 0.05)
            self.state["message"] = "끝났어요."
            log(f"[실행 {self.state['run']}] 끝")
        except InterruptedError:
            self.state["message"] = "정지했어요."
            if self.lost:
                self.state["error"] = "화면과 연결이 끊겨 로봇이 스스로 멈췄어요. 와이파이·유선 연결을 확인해 주세요."
            log(f"[실행 {self.state['run']}] 정지")
        except Exception as exc:
            self.stop()
            self.state["error"] = str(exc) or type(exc).__name__
            log(f"[실행 {self.state['run']}] 오류: {self.state['error']}")
            traceback.print_exc()
        finally:
            self.state.update(running=False, step=-1)

    def gripper(self, open_, gripper_type=1):
        """Open or close the gripper now (the control panel's buttons, outside a program)."""
        if self.state["running"]:
            return "움직이는 중에는 따로 열고 닫을 수 없어요."
        if not self.state["connected"]:
            return "로봇이 연결되지 않았어요."
        try:
            gripper_type = int(gripper_type)
        except (TypeError, ValueError):
            gripper_type = 1
        if gripper_type not in (1, 3, 4):
            return "알 수 없는 그리퍼 종류예요."
        reply = self.grip(open_, gripper_type)
        log(f"[그리퍼] {'열기' if open_ else '닫기'} (종류 {gripper_type}) → 응답 {reply!r}")
        return None

    def grip(self, open_, gripper_type=1):
        """Open or close, then ease off once the fingers have stopped (see GRIP_SQUEEZE)."""
        self.grip_gen += 1
        before = (self.state["gripper"], self.state["gripperValue"])
        if open_ or GRIP_CLOSE <= 0:
            reply = self.call("set_gripper_state", 0 if open_ else 1, GRIP_SPEED, gripper_type)
        else:
            reply = self.call("set_gripper_value", GRIP_CLOSE, GRIP_CLOSE_SPEED, gripper_type)
        self.state["gripper"] = "open" if open_ else "closed"
        if GRIP_SQUEEZE >= 0:
            threading.Thread(target=self._ease_grip, args=(self.grip_gen, open_, gripper_type, before), daemon=True).start()
        return reply

    def _ease_grip(self, gen, open_, gripper_type, before):
        """Wait until the fingers have gone where they can and stopped, then hold them there.
        "Stopped" counts only after they moved (or were at the end, or already held there): a gripper
        slow to start reads the same for a moment, and easing off then would undo the command."""
        time.sleep(0.4)                         # let the fingers start
        was_state, was_value = before
        already = was_state == ("open" if open_ else "closed") and was_value is not None
        start, last, still, end = None, None, 0, time.time() + GRIP_SETTLE_S
        while True:
            if gen != self.grip_gen:
                return                          # a newer command took over
            try:
                v = self.call("get_gripper_value", gripper_type)
            except Exception:
                v = None
            if isinstance(v, int) and 0 <= v <= 100:
                start = v if start is None else start
                still = still + 1 if last is not None and abs(v - last) <= 1 else 0
                last = v
                gone = abs(v - start) >= 5 or (v >= 90 if open_ else v <= max(10, GRIP_CLOSE + 3)) or (already and abs(v - was_value) <= 3)
                if still >= 2 and gone:         # three readings in a row within 1 step, after moving: stopped
                    break
            if time.time() > end:
                log("[그리퍼] " + ("위치를 읽지 못해" if last is None else f"손가락이 멈추지 않아(마지막 {last})") +
                    " 힘 빼기를 건너뛰어요.")
                return
            time.sleep(0.15)
        hold = last if open_ else max(0, last - GRIP_SQUEEZE)
        if gen != self.grip_gen:
            return
        try:
            self.call("set_gripper_value", hold, GRIP_CLOSE_SPEED, gripper_type)
        except Exception as exc:
            log(f"[그리퍼] 힘 빼기 실패: {exc}")
            return
        self.state["gripperValue"] = last
        log(f"[그리퍼] {'열림' if open_ else '닫힘'}: 멈춘 자리 {last} → {hold} 에서 버티게 했어요 (모터가 계속 밀지 않게)")

    def hand_pose(self):
        """The arm's pose for the hand camera: get_coords and how far out the official tool point
        (100 mm along the flange axis) still is from what get_coords reports. Returns (coords, offset, error)."""
        if self.state["running"] or self.jog_key or self.jog_at:
            return None, 0, "팔이 움직이는 중이에요. 멈춘 뒤 다시 해 주세요."
        try:
            c = self.call("get_coords")
        except Exception as exc:  # serial hiccup or no such call
            return None, 0, f"로봇 좌표를 읽지 못했어요 ({exc})."
        if not (isinstance(c, list) and len(c) == 6 and all(isinstance(v, (int, float)) for v in c)):
            return None, 0, "로봇 좌표를 읽지 못했어요. 다시 해 주세요."
        already = 0.0
        try:
            # With the tool end type on and a tool reference set, get_coords already reports the tool point.
            if self.call("get_end_type") == 1:
                ref = self.call("get_tool_reference")
                if isinstance(ref, list) and len(ref) >= 3:
                    already = float(ref[2])
        except Exception:
            pass
        return [float(v) for v in c], kit_camera.HAND_TOOL_MM - already, None

    def set_released(self, released):
        if self.state["running"]:
            return "움직이는 중에는 바꿀 수 없어요."
        reply = self.call("release_all_servos" if released else "focus_all_servos")
        log(f"[서보] {'풀기' if released else '고정'} → 응답 {reply!r}")
        self.state["released"] = released
        self.state["limp"] = [bool(released)] * 6
        return None


ROBOT = None
CAMERA = None
YOLO = kit_camera.Yolo()
# Shown on every console and in 로봇 찾기; `label` is the 사용자 이름 from the USB stick (robot_label.py).
IDENTITY = {"robotId": "", "ips": [], "host": "", "label": "", "kind": "arm", "model": "myCobot 280 RDK X5",
            # the Wi-Fi it is on ('' on a cable): the PC program says so when it is not the PC's
            "wifi": ""}
FIXED_LABEL = [None]   # --name: a name given on the command line wins over the file
IDENTITY_AT = [0.0]
WIFI = None
# Read by other pages on the classroom network (로봇 찾기 on a student's PC lists every robot).
CROSS_ORIGIN = ("/api/state", "/api/identify")
# Different on every start: a console that sees it change knows the server restarted (its run ids start over).
BOOT_ID = os.urandom(4).hex()
# Files whose names change with every build (and the Python runtime): kept by the browser.
LONG_CACHE = ("/_next/static/", "/pyodide/")


def console_version():
    """This console's version (VERSION beside this file, written by the USB kit: YYYYMMDD-HHMMSS-<hash>), or ''."""
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION"), encoding="utf-8", errors="replace") as f:
            return f.readline().strip()[:64]
    except OSError:
        return ""


# Read once: an update from the USB kit restarts the server.
VERSION = console_version()
# Requests that move the arm or its tool: one console at a time may send them (see Owner).
MOTION_ROUTES = ("/api/run", "/api/move", "/api/jog", "/api/target", "/api/gripper", "/api/pump",
                 "/api/calibrate", "/api/joint", "/api/release", "/api/focus")


class Owner:
    """Who is moving the arm. In a classroom several PCs can open the same robot; only one of them may
    drive it at a time, so two programs never fight over the arm. The console that sends a motion
    request holds the robot while its run goes on and for LEASE_S seconds after its last request or
    the end of its run (the consoles' state polls notice the end);
    another console's motion request is refused meanwhile, with the holder's name. Stop is always
    taken, from anyone (it is not a motion request). A console says who it is with X-Console-Id (a
    random id per browser tab) and X-Console-Name (e.g. "3번 학생", URL-encoded); a request without
    them is known by its address."""

    LEASE_S = 15.0

    def __init__(self, clock=time.time):
        self.lock = threading.Lock()
        self.clock = clock
        self.id = None
        self.name = ""
        self.until = 0.0

    def _hold(self, running, now):
        """While its run goes on the holder keeps the robot; the lease counts from the run's end."""
        if self.id and running:
            self.until = max(self.until, now + self.LEASE_S)

    def claim(self, cid, name, running):
        """None when `cid` may move the arm now (it then holds it), else why not."""
        now = self.clock()
        with self.lock:
            self._hold(running, now)
            if self.id and self.id != cid and (running or now < self.until):
                wait = "" if running else f" {max(1, round(self.until - now))}초 뒤에 다시 해 주세요."
                return f"다른 PC({self.name or '이름 없음'})가 이 로봇을 움직이는 중이에요." + (" 그 PC 의 실행이 끝나면 다시 해 주세요." if running else wait)
            self.id, self.name, self.until = cid, name, now + self.LEASE_S
            return None

    def view(self, running):
        """The holder ({id, name}) while it holds the robot, else None."""
        now = self.clock()
        with self.lock:
            self._hold(running, now)
            if self.id and now < self.until:
                return {"id": self.id, "name": self.name}
            return None


OWNER = Owner()


def refresh_identity(force=False):
    """The robot ID is the last number of its address; after a Wi-Fi switch the address changes."""
    if not force and time.time() - IDENTITY_AT[0] < 10:
        return
    IDENTITY_AT[0] = time.time()
    ips = lan_ips()
    IDENTITY.update(robotId=ips[0].rsplit(".", 1)[1] if ips else "", ips=ips, label=current_label())


def follow_wifi_name():
    """IDENTITY["wifi"], kept fresh away from the request threads (nmcli can be slow to answer)."""
    while True:
        try:
            st = WIFI.status()
            IDENTITY["wifi"] = (st.get("ssid") or "") if st.get("mode") == "wifi" else ""
        except Exception:
            IDENTITY["wifi"] = ""
        time.sleep(10)


def current_label():
    return FIXED_LABEL[0] if FIXED_LABEL[0] is not None else robot_label.read_label()


def lan_ips():
    """The robot's IPv4 addresses, the one it reaches the network with (default route) first, so the
    robot ID does not come from a container or a second adapter."""
    ips = [ip for ip in os.popen("hostname -I 2>/dev/null").read().split() if ip.count(".") == 3 and not ip.startswith("127.")]
    route = os.popen("ip -4 route get 1.1.1.1 2>/dev/null").read().split()
    main = route[route.index("src") + 1] if "src" in route[:-1] else ""
    # Container bridges (docker 172.17.x) and the fixed address for a LAN cable straight to a PC (lan.py) last.
    ips.sort(key=lambda ip: (ip.startswith("169.254."), ip != main, ip.startswith("172.17.")))
    return ips


class ConsoleServer(ThreadingHTTPServer):
    """A browser tab closed in the middle of a reply is normal, not an error for the terminal."""

    daemon_threads = True

    def handle_error(self, request, client_address):
        import sys
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


class Handler(SimpleHTTPRequestHandler):
    # Keep-alive: the console asks for the state many times a second; one connection for all of them
    # instead of a new one each time (a busy classroom Wi-Fi drops new connections first).
    # Every reply must then say its length (send_json, the files, the camera picture, the preflight).
    protocol_version = "HTTP/1.1"
    # An idle kept-alive connection is closed after this long (each one holds a thread).
    timeout = 30
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".js": "text/javascript",
        ".mjs": "text/javascript", ".json": "application/json", ".urdf": "application/xml",
        ".svg": "image/svg+xml", ".woff2": "font/woff2",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):         # quiet: only API errors are printed
        pass

    def cross_origin(self):
        route = self.path.split("?")[0]
        if route in CROSS_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        elif route.startswith("/api/") and self.remote_console():
            # The PC program driving this robot from its own screens (로봇 연결).
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin"))
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def remote_console(self):
        """The request comes from the PC program on this classroom network (its window at
        http://localhost / 127.0.0.1, or the class server at a private address), which drives the
        arm from its own screens. Not any page on the internet."""
        origin = self.headers.get("Origin")
        if not origin:
            return False
        parts = urllib.parse.urlsplit(origin)
        if parts.scheme != "http" or not parts.hostname:
            return False
        host = parts.hostname
        if host == "localhost":
            return True
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return False
        return ip.is_loopback or ip.is_private

    def do_OPTIONS(self):
        # Preflight for 로봇 찾기 (another page, possibly HTTPS, asking a robot on the local network)
        # and for the PC program driving the arm from its own screens.
        route = self.path.split("?")[0]
        if route not in CROSS_ORIGIN and not (route.startswith("/api/") and self.remote_console()):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(204)
        self.cross_origin()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Console-Id, X-Console-Name")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def same_origin(self):
        """The request comes from this robot's own console (a same-origin request sends no Origin,
        or the robot's own address), not from another page on the network."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return urllib.parse.urlsplit(origin).netloc == (self.headers.get("Host") or "")

    def end_headers(self):
        if self.command in ("GET", "HEAD") and not self.path.startswith("/api/"):
            # Hashed bundles never change under their name; everything else (the pages, the logo, the
            # pictures) is asked again each time, so the screens of a kit just installed show at once
            # instead of a browser's copy from before the update.
            self.send_header("Cache-Control", "public, max-age=31536000, immutable" if self.path.startswith(LONG_CACHE) else "no-cache")
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.cross_origin()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def console(self):
        """(id, name) of the console sending this request (Owner)."""
        cid = (self.headers.get("X-Console-Id") or "").strip()
        if not (0 < len(cid) <= 64 and all(c.isalnum() or c in "-_" for c in cid)):
            cid = "ip:" + self.client_address[0]
        name = urllib.parse.unquote(self.headers.get("X-Console-Name") or "").strip()[:40]
        return cid, name or self.client_address[0]

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ValueError("요청이 너무 커요.")
        return json.loads(self.rfile.read(n) or b"{}")

    def translate_path(self, path):
        # /console -> console.html (Next.js static export names pages <route>.html)
        full = super().translate_path(path)
        if os.path.isdir(full) and os.path.exists(os.path.join(full, "index.html")):
            return full
        if not os.path.splitext(full)[1] and os.path.exists(full + ".html"):
            return full + ".html"
        return full

    def camera_number(self, body=None):
        """Which camera a request means: ?cam=N or {"cam": N}, numbered from 0 (default 0)."""
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        raw = (body or {}).get("cam", query.get("cam", ["0"])[0])
        try:
            return max(0, int(raw))
        except (TypeError, ValueError):
            return 0

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            refresh_identity()
            # Only this robot's own console keeps a run alive: another PC's 로봇 찾기 asking the
            # state (cross-origin) must not keep a run going after its own console has gone.
            if self.same_origin() or ("console=1" in self.path and self.remote_console()):
                ROBOT.seen()
            # age: seconds since the last good angle read, measured on the robot's clock
            age = round(time.time() - ROBOT.state["updated"], 2) if ROBOT.state["updated"] else None
            state = {k: v for k, v in ROBOT.state.items() if k != "arrivals"}
            state["arrivalCount"] = len(ROBOT.state["arrivals"])
            return self.send_json({**state, **IDENTITY, "boot": BOOT_ID, "speedCap": SPEED_CAP, "age": age, "camera": CAMERA.available, "cameras": CAMERA.count,
                                   "pump": ROBOT.pump.available, "pumpError": ROBOT.pump.error, "remote": True, "version": VERSION,
                                   "owner": OWNER.view(ROBOT.state["running"])})
        if self.path.split("?")[0] == "/api/wifi":
            try:
                return self.send_json({"ok": True, **WIFI.status(), **IDENTITY})
            except RuntimeError as exc:
                return self.send_json({"ok": False, "error": str(exc), **IDENTITY}, 503)
        if self.path.split("?")[0] == "/api/wifi/scan":
            try:
                return self.send_json({"ok": True, "networks": WIFI.scan()})
            except RuntimeError as exc:
                return self.send_json({"ok": False, "error": str(exc), "networks": []}, 503)
        if self.path.split("?")[0] == "/api/selfcheck":
            return self.send_json({"ok": True, "items": selfcheck(), **IDENTITY})
        if self.path.split("?")[0] == "/api/tool":
            # What is on the flange, for the screen to compare with the tool it shows: a gripper answers
            # get_gripper_value with 0..100 (none: -1 or nothing). The pump has no sensor (pump: wired up).
            if ROBOT.state["running"] or not ROBOT.state["connected"]:
                return self.send_json({"ok": True, "busy": True, "gripper": None, "pump": ROBOT.pump.available})
            try:
                g = ROBOT.call("get_gripper_value", 1)
            except Exception:  # noqa: BLE001 - a robot that does not answer has no gripper to report
                g = None
            return self.send_json({"ok": True, "gripper": g if isinstance(g, int) and g >= 0 else None, "pump": ROBOT.pump.available})
        if self.path.split("?")[0] == "/api/arrivals":
            return self.send_json({"run": ROBOT.state["run"], "arrivals": ROBOT.state["arrivals"]})
        if self.path.split("?")[0] == "/api/camera.jpg":
            try:
                body = CAMERA.jpeg(self.camera_number())
            except RuntimeError as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 503)
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        route = self.path.split("?")[0]
        if route.startswith("/guides/") and route.endswith(".pdf") and not os.path.exists(self.translate_path(route)):
            # The robot's kit leaves the three manuals out (it has to fit in one 100 MB download):
            # say where they are instead of a bare 404.
            body = GUIDE_ELSEWHERE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        return super().do_GET()

    def do_POST(self):
        route = self.path.split("?")[0]
        # Only JSON, and only from this robot's own console or the PC program on this network (or,
        # for 움직여 확인, any page that asks first): a plain form or text/plain POST from another web
        # page needs no preflight and would otherwise drive the arm.
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json" or (route not in CROSS_ORIGIN and not self.same_origin() and not self.remote_console()):
            return self.send_json({"ok": False, "error": "이 요청은 받을 수 없어요 (로봇 콘솔 화면에서만)."}, 403)
        try:
            body = self.read_json()
            if route == "/api/stop":
                ROBOT.stop()
                return self.send_json({"ok": True})
            if route == "/api/demo/tool" and ROBOT.demo:
                # 가짜 팔만: 그리퍼 ↔ 흡착 펌프 바꿔 끼우기 (검수 4 · 5 를 로봇 없이 끝까지 해 볼 때)
                ROBOT.arm.has_gripper = bool(body.get("gripper"))
                log(f"[데모] {'그리퍼' if ROBOT.arm.has_gripper else '흡착 펌프'} 끼움")
                return self.send_json({"ok": True})
            if route in MOTION_ROUTES:
                cid, name = self.console()
                err = OWNER.claim(cid, name, ROBOT.state["running"])
                if err:
                    log(f"[거절] {name}: {err}")
                    return self.send_json({"ok": False, "error": err, "owner": OWNER.view(ROBOT.state["running"])}, 409)
            if route in ("/api/run", "/api/move"):
                if route == "/api/run":
                    err, run = ROBOT.start(body.get("actions"), "프로그램 실행 중")
                else:
                    move = {"type": "angles", "angles": body.get("angles"), "speed": body.get("speed", 20), "line": 0}
                    err, run = ROBOT.start([move], "자세 이동 중")
                if err:
                    log(f"[거절] {err}")
                return self.send_json({"ok": err is None, "error": err, "run": run}, 200 if err is None else 409)
            if route == "/api/identify":
                # "이 로봇 맞나요?" from 로봇 찾기 [움직여 확인]: the arm straightens slowly and stays so
                # (all joints 0, seen from across the room whatever the pose was). {"move": "nod"} from
                # the USB stick (nobody pressed anything): only the base turns 5° and back.
                a = ROBOT.state["angles"]
                if ROBOT.state["released"]:
                    return self.send_json({"ok": False, "error": "관절이 풀려 있어요 (손으로 움직이기). 고정한 뒤 다시 눌러 주세요."}, 409)
                if not a or ROBOT.state["running"]:
                    return self.send_json({"ok": False, "error": "지금은 움직여 알려 줄 수 없어요."}, 409)
                holder = OWNER.view(False)
                if holder and holder["id"] != self.console()[0]:
                    return self.send_json({"ok": False, "error": f"지금은 다른 PC({holder['name']})가 쓰는 중이라 움직여 알려 줄 수 없어요."}, 409)
                # Asked by another PC's page: its polls do not count for the dead-man check, so the
                # move gets time of its own.
                ROBOT.grace_until = time.time() + 30
                if body.get("move") == "nod":
                    there = list(a)
                    there[0] += -5 if a[0] > 0 else 5
                    moves = [{"type": "angles", "angles": there, "speed": 35, "line": 0},
                             {"type": "angles", "angles": list(a), "speed": 35, "line": 0}]
                else:
                    moves = [{"type": "angles", "angles": [0.0] * len(a), "speed": IDENTIFY_SPEED, "line": 0}]
                err, run = ROBOT.start(moves, "로봇 찾기: 이 로봇이에요")
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/wifi/connect":
                err = WIFI.connect(body.get("ssid"), body.get("password") or "", on_done=lambda: refresh_identity(True))
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/reconnect":
                err = ROBOT.reconnect()
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 503)
            if route == "/api/jog":
                try:
                    joint, direction = int(body.get("joint", 0)), int(body.get("dir", 0))
                except (TypeError, ValueError):
                    joint, direction = 0, 0
                err = ROBOT.jog(joint, direction, body.get("speed", 20), body.get("axis"))
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/target":
                err = ROBOT.target(body.get("angles"), body.get("speed", 20))
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/ai":
                try:
                    result = YOLO.detect(CAMERA.latest(self.camera_number(body)))
                except RuntimeError as exc:
                    return self.send_json({"ok": False, "error": str(exc)}, 503)
                image = result.pop("image")
                if image:
                    result["image"] = "data:image/jpeg;base64," + base64.b64encode(image).decode()
                names = ", ".join(f"{d['label']} {d['score']:.2f}" for d in result["detections"]) or "없음"
                log(f"[AI] YOLOv5s {result['ms']}ms (모델 읽기 {result['loadMs']}ms): {names}")
                return self.send_json(result)
            if route == "/api/vision/hand":
                # planeZ: height of the block tops in the robot's frame (block size, minus a base under the robot)
                coords, offset, err = ROBOT.hand_pose()
                if err:
                    return self.send_json({"ok": False, "error": err}, 409)
                try:
                    plane = float(body.get("planeZ", kit_camera.BLOCK_TOP_MM))
                    result = kit_camera.detect_hand(CAMERA.latest(self.camera_number(body)), coords, offset, plane)
                except RuntimeError as exc:
                    return self.send_json({"ok": False, "error": str(exc)}, 503)
                found = ", ".join(d["color"] + (f"({d['x']:.0f},{d['y']:.0f})" if "x" in d else "(바닥 밖)") for d in result["detections"])
                log(f"[손 카메라] {result['ms']}ms, 블록 {len(result['detections'])}개 {found}")
                return self.send_json(result)
            if route == "/api/vision":
                try:
                    result = kit_camera.detect(CAMERA.latest(self.camera_number(body)))
                except RuntimeError as exc:
                    return self.send_json({"ok": False, "error": str(exc)}, 503)
                log(f"[영상처리] {result['ms']}ms, 블록 {len(result['detections'])}개, 마커 {result['markers']}")
                return self.send_json(result)
            if route == "/api/calibrate":
                joints = body.get("joints")
                err = ROBOT.calibrate(joints if isinstance(joints, list) else [])
                if err:
                    log(f"[거절] {err}")
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/pump":
                if ROBOT.state["running"]:
                    return self.send_json({"ok": False, "error": "움직이는 중에는 따로 켜고 끌 수 없어요."}, 409)
                try:
                    ROBOT.pump.set(bool(body.get("on")))
                except RuntimeError as exc:
                    return self.send_json({"ok": False, "error": str(exc)}, 409)
                return self.send_json({"ok": True})
            if route == "/api/gripper":
                err = ROBOT.gripper(bool(body.get("open")), body.get("gripperType", 1))
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/joint":
                try:
                    joint = int(body.get("joint", 0))
                except (TypeError, ValueError):
                    joint = 0
                err = ROBOT.set_joint(joint, bool(body.get("off")))
                if err:
                    log(f"[거절] {err}")
                return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
            if route == "/api/release":
                err = ROBOT.set_released(True)
            elif route == "/api/focus":
                err = ROBOT.set_released(False)
            else:
                return self.send_json({"ok": False, "error": "없는 주소예요."}, 404)
            return self.send_json({"ok": err is None, "error": err}, 200 if err is None else 409)
        except Exception as exc:
            traceback.print_exc()
            return self.send_json({"ok": False, "error": str(exc)}, 500)


def selfcheck():
    """Before the acceptance demonstration: is everything each check needs there? A list of
    {id, checks, name, ok (True / False / None = not known), detail}."""
    items = []

    def add(id_, checks, name, ok, detail):
        items.append({"id": id_, "checks": checks, "name": name, "ok": ok, "detail": detail})

    st = ROBOT.state
    add("arm", [1, 2, 4, 5, 7], "로봇팔 연결", bool(st["connected"]),
        ("데모(가짜 팔)" if ROBOT.demo else "관절 각도 " + " ".join(f"{a:.0f}" for a in st["angles"])) if st["connected"] and st["angles"]
        else "각도를 읽지 못해요 — 전원·케이블, 다른 로봇 프로그램이 켜져 있는지 확인")
    # The robot's own coordinates against the console's model (the simulator's coordinates are the robot's).
    if st["connected"] and st["angles"] and not st["running"]:
        try:
            real = ROBOT.call("get_coords")
            model = demo_coords(st["angles"])
            if isinstance(real, list) and len(real) == 6:
                gap = math.dist(real[:3], model[:3])
                add("coords", [2, 4], "좌표 기준 (로봇 ↔ 화면)", gap < 3.0, f"끝 위치 차이 {gap:.1f}mm (화면의 좌표 = 로봇 좌표)")
                # How the firmware's tool frame is turned about the flange axis from the console's model.
                rm = kit_camera.euler_sxyz(*model[3:])
                rr = kit_camera.euler_sxyz(*real[3:])
                rel = [[sum(rm[k][i] * rr[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
                turn = math.degrees(math.atan2(rel[1][0], rel[0][0]))
                tilt = math.degrees(math.acos(max(-1.0, min(1.0, rel[2][2]))))
                want = kit_camera.FIRMWARE_TO_FLANGE_DEG
                off = (turn - want + 180) % 360 - 180
                add("handframe", [4], "손 카메라 기준 (3D 화면 ↔ 실물)", abs(off) < 5 and tilt < 3,
                    f"끝 회전 {turn:.1f}° (3D 손 카메라가 쓰는 값 {want:.1f}°, 차이 {off:.1f}°, 기울기 {tilt:.1f}°)"
                    + ("" if abs(off) < 5 and tilt < 3 else " — 실제 블록 위치(로봇 계산)는 영향 없음, 3D 손 카메라 화면만 어긋남"))
            else:
                add("coords", [2, 4], "좌표 기준 (로봇 ↔ 화면)", None, "로봇이 좌표를 알려 주지 않아요")
        except Exception as exc:  # not every firmware answers every call
            add("coords", [2, 4], "좌표 기준 (로봇 ↔ 화면)", None, f"좌표를 읽지 못했어요 ({exc})")
    if CAMERA.searching:
        add("cameras", [3, 4, 6], "카메라", None, "찾는 중이에요. 몇 초 뒤 다시 점검해 주세요")
    else:
        n = CAMERA.count
        add("cameras", [3, 4, 6], "카메라 (2대 필요: 키트·손)", n >= 2 if n else False,
            f"{n}대 연결됨" + ("" if n >= 2 else " — 검수 3 은 2대가 필요해요") if n else (CAMERA.error or "없음"))
    if kit_camera.cv2 is None:
        add("opencv", [4, 6], "OpenCV (영상 처리)", False, "로봇에 OpenCV(cv2)가 없어요")
    else:
        cv = kit_camera.cv2
        add("opencv", [4, 6], "OpenCV (영상 처리)", True, f"버전 {cv.__version__}")
        add("aruco", [4], "ArUco 마커 (키트 카메라 보정)", hasattr(cv, "aruco"), "있어요" if hasattr(cv, "aruco") else "cv2.aruco 가 없어요 (키트 카메라 좌표 불가, 손 카메라는 가능)")
    ok, why = kit_camera.Yolo.available()
    add("yolo", [6], "AI 모델 (YOLOv5s)", ok, "있어요" if ok else why)
    add("pump", [4, 5], "흡착 펌프 (40핀 GPIO)", ROBOT.pump.available,
        f"BOARD {Pump.PIN_A}·{Pump.PIN_B} 준비됨 — [흡착 켜기] 로 실제 동작 확인" if ROBOT.pump.available else ROBOT.pump.error)
    try:
        g = ROBOT.call("get_gripper_value", 1) if st["connected"] else None
        add("gripper", [5], "그리퍼", None if g is None else (isinstance(g, int) and g >= 0),
            "연결 안 됨" if g is None else (f"열림 정도 {g}" if isinstance(g, int) and g >= 0 else "응답 없음 — 그리퍼 케이블 확인"))
    except Exception as exc:
        add("gripper", [5], "그리퍼", None, f"확인하지 못했어요 ({exc})")
    humble = os.path.exists("/opt/ros/humble/setup.bash")
    home = os.path.expanduser("~" + (os.environ.get("SUDO_USER") or ""))
    pkg = None
    for root in (home, "/opt", "/root"):
        for ws in sorted(glob.glob(os.path.join(root, "*", "src", "mycobot_ros2"))) + sorted(glob.glob(os.path.join(root, "mycobot_ros2"))):
            pkg = ws
            break
        if pkg:
            break
    add("ros2", [7], "ROS 2 Humble", humble, "/opt/ros/humble 있음" if humble else "ROS 2 Humble 이 없어요 (검수 7 의 ROS 2 실행 불가, 파이썬 API 는 가능)")
    add("ros2pkg", [7], "공식 ROS 2 패키지 (mycobot_ros2)", bool(pkg), pkg or "찾지 못했어요 (~/<작업공간>/src/mycobot_ros2)")
    return items


def camera_spec(text):
    """--camera: "auto", "none", or numbers / picture files separated by commas."""
    if text == "none":
        return None
    if text == "auto":
        return "auto"
    return [int(t) if t.strip().isdigit() else t.strip() for t in text.split(",") if t.strip()]


def main():
    global ROBOT, CAMERA, DEADMAN_S, WIFI, GRIP_SQUEEZE, GRIP_CLOSE
    ap = argparse.ArgumentParser(description="로봇팔 실습 콘솔 서버 (myCobot 280 RDK X5)")
    ap.add_argument("--port", type=int, default=8080, help="웹 주소 포트 (기본 8080)")
    ap.add_argument("--serial", default=PROFILE["serial_port"], help="로봇 시리얼 포트")
    ap.add_argument("--baud", type=int, default=PROFILE["baudrate"], help="통신 속도")
    ap.add_argument("--owner-lease", type=float, default=Owner.LEASE_S, help="한 PC 가 로봇을 쥐고 있는 시간, 초 (기본 15)")
    ap.add_argument("--demo", action="store_true", help="로봇 없이 가짜 팔로 실행")
    ap.add_argument("--no-gripper", action="store_true", help="(--demo) 그리퍼를 끼우지 않은 가짜 팔")
    ap.add_argument("--name", default=None, help="로봇 찾기에 보일 사용자 이름 (기본: USB 의 wifi.txt 사용자= 로 정한 이름)")
    ap.add_argument("--camera", default="auto",
                    help="카메라: auto(기본, 연결된 카메라를 모두 찾아 씀), 장치 번호나 그림 파일 경로를 쉼표로 (예: 0,2), 또는 none")
    ap.add_argument("--grip-squeeze", type=int, default=GRIP_SQUEEZE,
                    help="그리퍼가 멈춘 자리보다 이만큼(0~100 단위) 더 조여 버팀 (기본 5, 음수 = 힘 빼기 끔)")
    ap.add_argument("--grip-close", type=int, default=GRIP_CLOSE,
                    help="[닫기] 때 그리퍼를 이 자리(0~100)까지만 닫음 (기본 60 쪽으로 천천히 닫다가 물건에 멈추면 그 자리보다 --grip-squeeze 만큼 더 조여 버팀, 0 = 끝까지)")
    ap.add_argument("--deadman", type=float, default=DEADMAN_S, help="화면 연결이 이만큼(초) 끊기면 실행 중인 로봇을 멈춤 (0 = 끔)")
    args = ap.parse_args()
    Owner.LEASE_S = max(0.5, args.owner_lease)
    DEADMAN_S = args.deadman
    GRIP_SQUEEZE = args.grip_squeeze
    GRIP_CLOSE = max(0, min(100, args.grip_close))

    if not os.path.exists(os.path.join(STATIC_DIR, "console.html")):
        raise SystemExit(f"화면 파일이 없어요: {STATIC_DIR}/console.html — 받은 압축 파일을 이 폴더에 그대로 풀었는지 확인해 주세요.")
    ROBOT = Robot(args.demo, args.serial, args.baud, gripper=not args.no_gripper)
    if not args.demo:
        log(f"[펌프] 준비됨 (40핀 BOARD {Pump.PIN_A}·{Pump.PIN_B})" if ROBOT.pump.available else f"[펌프] 쓸 수 없어요: {ROBOT.pump.error}")
    WIFI = Wifi(args.demo, log)
    threading.Thread(target=follow_wifi_name, daemon=True).start()
    CAMERA = kit_camera.CameraSet(camera_spec(args.camera), log)
    server = ConsoleServer(("0.0.0.0", args.port), Handler)
    ips = lan_ips()
    # Robot ID = the last number of its address: a PC on the same network reaches it from that alone.
    if args.name is not None:
        FIXED_LABEL[0] = robot_label.clean(args.name)
    IDENTITY.update(robotId=ips[0].rsplit(".", 1)[1] if ips else "", ips=ips, host=os.uname().nodename, label=current_label())
    IDENTITY_AT[0] = time.time()
    print("로봇팔 실습 콘솔 서버가 켜졌어요." + (" (데모: 가짜 팔)" if args.demo else ""))
    if IDENTITY["robotId"]:
        print(f"  ★ 로봇 ID: {IDENTITY['robotId']}   (PC 화면의 [로봇 연결]에 이 번호를 넣어요. 주소 {ips[0]})")
    if IDENTITY["label"]:
        print(f"  ★ 사용자 이름: {IDENTITY['label']}   ([로봇 찾기] 목록에 이 이름으로 나와요)")
    for ip in ips or ["localhost"]:
        print(f"  브라우저 주소: http://{ip}:{args.port}/console")
    if os.path.exists("/usr/sbin/avahi-daemon"):
        # mDNS: the name works on most PCs even when the IP changes
        print(f"  이름으로:     http://{os.uname().nodename}.local:{args.port}/console")
    print("  PC 에서 콘솔 오른쪽 위 [··· 설정] → [PC 프로그램 받기] 로 받은 파일을 바탕화면에 두면, 다음부터 더블클릭으로 로봇을 찾아 열어요.")
    print("  끄기: Ctrl+C  (로봇도 함께 멈춰요)")
    print("  로봇 화면의 브라우저는 느려요. 같은 공유기에 붙은 PC 에서 위 주소를 여세요.")
    time.sleep(0.5)
    a = ROBOT.state["angles"]
    if a:
        log("로봇 각도 읽기 OK: " + " ".join(f"{v:.1f}" for v in a))
    else:
        log("로봇 각도를 읽지 못했어요. 전원·케이블을 확인하고, 다른 로봇 프로그램이 켜져 있으면 끄세요.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 끕니다.")
        ROBOT.stop()


if __name__ == "__main__":
    main()
