/**
 * Python sources of the simulated libraries, written into Pyodide's file system.
 *
 * pymycobot   MyCobot280RDKX5 with the same method names, arguments and
 *             parameter checks (messages copied from pymycobot 4.0.x
 *             error.calibration_parameters for "MyCobot280RDK-X5").
 * Hobot.GPIO  the RDK's GPIO library; the suction pump is on BOARD pins 31/37
 * RPi.GPIO    Raspberry Pi / Jetson Nano: the pump on BCM 20/21 (both LOW = on)
 *             as in Elephant Robotics' RDK X5 vision kit.
 * rclpy       a small ROS 2 client (nodes, topics, timers, spin) in simulated
 *             time, with sensor_msgs/std_msgs messages; the official driver
 *             node of mycobot_280_rdkx5 (slider_control: /joint_states ->
 *             send_angles(degrees, 50)) runs alongside, as `ros2 launch
 *             mycobot_280_rdkx5 slider_control.launch.py` does on the robot.
 *
 * Every call reports the program line it came from (the frame in main.py), so
 * a collision found later in the 3D playback points at the right line.
 */

export const PY_FILES: Record<string, string> = {
  '/sim/_simpy.py': String.raw`
import sys
import _sim


def line():
    f = sys._getframe(1)
    while f is not None:
        if f.f_code.co_filename == "main.py":
            return f.f_lineno
        f = f.f_back
    return 0
`,

  '/sim/pymycobot/__init__.py': String.raw`
"""pymycobot (시뮬레이터) — myCobot 280 RDK X5 에서 쓰는 명령을 그대로 흉내 냅니다.
myCobot 280 (Pi · M5 · Jetson Nano · Arduino), myCobot 320, mechArm 270, myPalletizer 260 (관절 4개) 도
같은 명령으로 — 관절 범위는 시뮬레이터에서 연 로봇팔의 것을 따릅니다."""
from pymycobot.mycobot280rdkx5 import MyCobot280RDKX5, MyCobot280RDKX5Socket
from pymycobot.mycobot280 import MyCobot280, MyCobot280Socket
from pymycobot.mycobot320 import MyCobot320, MyCobot320Socket
from pymycobot.mecharm270 import MechArm270
from pymycobot.mypalletizer260 import MyPalletizer260
from pymycobot.mycobot import MyCobot

__version__ = "4.0.0-sim"
`,

  '/sim/pymycobot/mycobot280rdkx5.py': String.raw`
import math
import time

import _sim
from _simpy import line

def _dof():
    # Joints of the arm open in the simulator: 6, or 4 (myPalletizer: coords are [x, y, z, θ]).
    return int(_sim.dof())


def _four(c):
    # A 6-slot coordinate list as a 4-axis arm reports it: x, y, z and the tool's turn.
    c = list(c)
    return c[:3] + [c[5]]


def _limits():
    # The ranges of the arm open in the simulator (pymycobot robot_info.py; myCobot 280 RDK X5 by default).
    a_min, a_max, c_min, c_max = (list(_sim.angles_min()), list(_sim.angles_max()), list(_sim.coords_min()), list(_sim.coords_max()))
    if _dof() == 4:
        return (a_min[:4], a_max[:4], _four(c_min), _four(c_max))
    return (a_min[: _dof()], a_max[: _dof()], c_min, c_max)


def _ncoords():
    # Numbers in a coordinate list: [x, y, z, θ] on a 4-axis arm, [x, y, z, rx, ry, rz] on the others (OMX-F's 5 joints too).
    return 4 if _dof() == 4 else 6


def _six(angles):
    # The simulator's arm always has six slots; a 4-axis arm's last two stay 0.
    return list(angles) + [0] * (6 - len(angles))


def _check(**kwargs):
    # Same checks and messages as pymycobot error.calibration_parameters ("MyCobot280RDK-X5").
    for parameter, value in kwargs.items():
        if value is None:
            continue
        if parameter in ("joint_id", "coord_id"):
            ids = list(range(1, (_dof() if parameter == "joint_id" else _ncoords()) + 1))
            if value not in ids:
                raise ValueError(f"The {parameter} not right, should be in {ids}, but received {value}.")
        elif parameter in ("angle", "coord"):
            ANGLES_MIN, ANGLES_MAX, COORDS_MIN, COORDS_MAX = _limits()
            index = kwargs["joint_id" if parameter == "angle" else "coord_id"] - 1
            lo = (ANGLES_MIN if parameter == "angle" else COORDS_MIN)[index]
            hi = (ANGLES_MAX if parameter == "angle" else COORDS_MAX)[index]
            if not lo <= value <= hi:
                raise ValueError(f"The {parameter} not right, should be in {lo} ~ {hi}, but received {value}.")
        elif parameter in ("angles", "coords"):
            n = _dof() if parameter == "angles" else _ncoords()
            if len(value) != n:
                raise ValueError(f"The length of {chr(96)}{parameter}{chr(96)} must be {n}.")
            ANGLES_MIN, ANGLES_MAX, COORDS_MIN, COORDS_MAX = _limits()
            lows = ANGLES_MIN if parameter == "angles" else COORDS_MIN
            highs = ANGLES_MAX if parameter == "angles" else COORDS_MAX
            for i, v in enumerate(value):
                if not lows[i] <= v <= highs[i]:
                    raise ValueError(f"The {parameter} not right, should be in {lows[i]} ~ {highs[i]}, but received {v}.")
        elif parameter == "speed":
            if not 1 <= value <= 100:
                raise ValueError(f"speed value not right, should be 1 ~ 100, the received speed is {value}")


class MyCobot280RDKX5:
    """myCobot 280 RDK X5 (시뮬레이터). 실제 로봇에서는 pymycobot 이 같은 이름으로 동작합니다."""

    def __init__(self, port="/dev/ttyS1", baudrate=1000000, timeout=0.1, debug=False, thread_lock=True):
        self._port = port
        _sim.connect(str(port), int(baudrate), line())

    # -- power / servos ------------------------------------------------------
    def power_on(self):
        return 1

    def power_off(self):
        return 1

    def is_power_on(self):
        return 1

    def focus_all_servos(self):
        _sim.servos(True, line())
        return 1

    def release_all_servos(self, data=None):
        _sim.servos(False, line())
        return 1

    def is_all_servo_enable(self):
        return 1

    def set_fresh_mode(self, mode):
        return 1

    def get_fresh_mode(self):
        return 1

    def get_system_version(self):
        return 1.0

    # -- reading -------------------------------------------------------------
    def get_angles(self):
        return [round(a, 2) for a in _sim.angles().to_py()][: _dof()]

    def get_radians(self):
        return [round(math.radians(a), 3) for a in self.get_angles()]

    def get_coords(self):
        c = [round(c, 2) for c in _sim.coords().to_py()]
        return _four(c) if _dof() == 4 else c

    def angles_to_coords(self, angles):
        _check(angles=list(angles))
        c = [round(c, 2) for c in _sim.fk(_six(angles)).to_py()]
        return _four(c) if _dof() == 4 else c

    def _six_coords(self, coords):
        # A 4-axis arm's [x, y, z, θ]: its tool always points down, so the tilt is what it is now.
        if _dof() == 4:
            now = list(_sim.coords().to_py())
            return list(coords[:3]) + [now[3], now[4], coords[3]]
        return list(coords)

    def is_moving(self):
        return 1 if _sim.moving() else 0

    def is_in_position(self, data, mode=0):
        now = self.get_coords() if mode == 1 else self.get_angles()
        tol = 5 if mode == 1 else 2
        return 1 if max(abs(a - b) for a, b in zip(now, data)) <= tol else 0

    # -- moving --------------------------------------------------------------
    def send_angles(self, angles, speed, _async=False):
        angles = list(angles)
        _check(angles=angles, speed=speed)
        _sim.move(_six(angles), speed, "send_angles", line())
        return 1

    def send_angle(self, joint_id, angle, speed, _async=False):
        _check(joint_id=joint_id, angle=angle, speed=speed)
        target = self.get_angles()
        target[joint_id - 1] = angle
        _sim.move(_six(target), speed, "send_angle", line())
        return 1

    def send_radians(self, radians, speed):
        return self.send_angles([math.degrees(r) for r in radians], speed)

    def send_coords(self, coords, speed, mode=0, _async=False):
        coords = list(coords)
        _check(coords=coords, speed=speed)
        _sim.move_coords(self._six_coords(coords), speed, "send_coords", line())
        return 1

    def send_coord(self, coord_id, coord, speed):
        _check(coord_id=coord_id, coord=coord, speed=speed)
        target = self.get_coords()
        target[coord_id - 1] = coord
        _sim.move_coords(self._six_coords(target), speed, "send_coord", line())
        return 1

    def _wait(self, timeout):
        end = _sim.now() + timeout
        while _sim.moving() and _sim.now() < end:
            time.sleep(0.05)
        return 1

    def sync_send_angles(self, degrees, speed, timeout=15):
        self.send_angles(degrees, speed)
        return self._wait(timeout)

    def sync_send_coords(self, coords, speed, mode=0, timeout=15):
        self.send_coords(coords, speed, mode)
        return self._wait(timeout)

    def stop(self):
        _sim.stop(line())
        return 1

    def pause(self):
        return self.stop()

    def resume(self):
        return 1

    # -- tools ---------------------------------------------------------------
    def set_gripper_state(self, flag, speed, _type_1=None, is_torque=None):
        if flag not in (0, 1):
            raise ValueError(f"The data supported by parameter flag is 0 or 1, but the received value is {flag}")
        _sim.gripper(flag == 0, int(_type_1 or 1), line())
        return 1

    def set_gripper_value(self, gripper_value, speed, gripper_type=None):
        if not 0 <= gripper_value <= 100:
            raise ValueError(f"gripper_value not right, should be 0 ~ 100, the received value is {gripper_value}")
        _sim.gripper(gripper_value >= 50, int(gripper_type or 1), line())
        return 1

    def get_gripper_value(self, gripper_type=None):
        return _sim.gripper_value()

    def set_basic_output(self, pin_no, pin_signal):
        if pin_signal not in (0, 1):
            raise ValueError(f"The data supported by parameter pin_signal is 0 or 1, but the received value is {pin_signal}")
        _sim.basic_out(int(pin_no), int(pin_signal), line())
        return 1

    def get_basic_input(self, pin_no):
        return _sim.basic_get(int(pin_no))


class MyCobot280RDKX5Socket(MyCobot280RDKX5):
    """PC 에서 로봇의 소켓 서버(포트 30002)로 제어할 때 쓰는 클래스 (시뮬레이터에서는 같은 동작)."""

    def __init__(self, ip, netport=30002, debug=False):
        super().__init__(f"{ip}:{netport}")
`,

  '/sim/pymycobot/mycobot280.py': String.raw`
from pymycobot.mycobot280rdkx5 import MyCobot280RDKX5


class MyCobot280(MyCobot280RDKX5):
    """myCobot 280 (Pi · M5 · Jetson Nano · Arduino) — 시뮬레이터에서는 RDK X5 와 같은 명령."""


class MyCobot280Socket(MyCobot280):
    def __init__(self, ip, netport=9000, debug=False):
        super().__init__(f"{ip}:{netport}")
`,

  '/sim/pymycobot/mycobot.py': String.raw`
from pymycobot.mycobot280 import MyCobot280


class MyCobot(MyCobot280):
    """옛 이름 (pymycobot 3.x 의 MyCobot) — MyCobot280 과 같아요."""
`,

  '/sim/pymycobot/mycobot320.py': String.raw`
from pymycobot.mycobot280rdkx5 import MyCobot280RDKX5


class MyCobot320(MyCobot280RDKX5):
    """myCobot 320 — 같은 명령, 관절 범위는 320 의 것 (시뮬레이터에서 연 로봇팔)."""


class MyCobot320Socket(MyCobot320):
    def __init__(self, ip, netport=9000, debug=False):
        super().__init__(f"{ip}:{netport}")
`,

  '/sim/pymycobot/mecharm270.py': String.raw`
from pymycobot.mycobot280rdkx5 import MyCobot280RDKX5


class MechArm270(MyCobot280RDKX5):
    """mechArm 270 — 같은 명령, 관절 범위는 mechArm 270 의 것 (시뮬레이터에서 연 로봇팔)."""
`,

  '/sim/pymycobot/mypalletizer260.py': String.raw`
from pymycobot.mycobot280rdkx5 import MyCobot280RDKX5


class MyPalletizer260(MyCobot280RDKX5):
    'myPalletizer 260: 관절 4개 (send_angles 는 숫자 4개), 좌표는 [x, y, z, θ] (손끝은 늘 아래).'
`,

  '/sim/omx/__init__.py': String.raw`
"""omx (시뮬레이터 수업용) — ROBOTIS OMX-F 를 pymycobot 과 같은 명령으로 움직여요.
실물 OMX-F 는 ROS 2 (open_manipulator) 나 다이나믹셀 SDK 로 움직여요: 이 모듈은 시뮬레이터에만 있어요."""
from pymycobot.mycobot280rdkx5 import MyCobot280RDKX5


class OMXF(MyCobot280RDKX5):
    'OMX-F: 관절 5개 (send_angles 는 숫자 5개), 좌표는 [x, y, z, rx, ry, rz] (손 방향은 5축이 돌 수 있는 쪽만).'
`,

  '/sim/Hobot/__init__.py': '',

  '/sim/Hobot/GPIO.py': String.raw`
"""Hobot.GPIO (시뮬레이터). 흡착 펌프는 BOARD 31·37번 — RDK X5 공식 비전 키트와 같은 배선."""
import _sim
from _simpy import line

BOARD = 10
BCM = 11
OUT = 1
IN = 0
HIGH = 1
LOW = 0


def setwarnings(flag):
    pass


def setmode(mode):
    _sim.gpio_mode(int(mode))


def setup(channel, direction, initial=None, pull_up_down=None):
    for c in channel if isinstance(channel, (list, tuple)) else [channel]:
        if initial is not None:
            _sim.gpio(int(c), int(initial), line())


def output(channel, value):
    for c in channel if isinstance(channel, (list, tuple)) else [channel]:
        _sim.gpio(int(c), 1 if value else 0, line())


def input(channel):
    return _sim.gpio_get(int(channel))


def cleanup(channel=None):
    pass
`,

  '/sim/RPi/__init__.py': '',

  '/sim/RPi/GPIO.py': String.raw`
"""RPi.GPIO (시뮬레이터). 라즈베리파이 · 젯슨 나노 보드의 흡착 펌프는 BCM 20·21번 (둘 다 LOW = 켜기) — 공식 AI 키트 배선."""
import _sim
from _simpy import line

BOARD = 10
BCM = 11
OUT = 1
IN = 0
HIGH = 1
LOW = 0


def setwarnings(flag):
    pass


def setmode(mode):
    _sim.gpio_mode(int(mode))


def setup(channel, direction, initial=None, pull_up_down=None):
    for c in channel if isinstance(channel, (list, tuple)) else [channel]:
        if initial is not None:
            _sim.gpio(int(c), int(initial), line())


def output(channel, value):
    for c in channel if isinstance(channel, (list, tuple)) else [channel]:
        _sim.gpio(int(c), 1 if value else 0, line())


def input(channel):
    return _sim.gpio_get(int(channel))


def cleanup(channel=None):
    pass
`,

  '/sim/rclpy/__init__.py': String.raw`
"""rclpy (시뮬레이터) — ROS 2 노드·토픽·타이머를 시뮬레이션 시간으로 돌립니다."""
import time as _time

import _sim
from _simpy import line

_nodes = []
_running = [False]
# default spin length when the program never stops on its own, simulated seconds
SPIN_S = 20.0


def init(args=None, context=None):
    _running[0] = True
    from rclpy import _bus
    _bus.start_driver()


def ok(context=None):
    return _running[0] and _sim.now() < _sim.limit()


def shutdown(context=None):
    _running[0] = False


def try_shutdown(context=None):
    shutdown()


def spin_once(node, executor=None, timeout_sec=None):
    from rclpy import _bus
    _bus.step(timeout_sec if timeout_sec is not None else 0.1)


def spin(node, executor=None):
    from rclpy import _bus
    end = _sim.now() + SPIN_S
    while _running[0] and _sim.now() < end:
        if not _bus.step(end - _sim.now()):
            break
    _sim.log("spin 이 끝났어요 (시뮬레이션은 %g초까지 돌려요)." % SPIN_S)
`,

  '/sim/rclpy/_bus.py': String.raw`
import heapq
import math

import _sim
from _simpy import line

topics = {}          # name -> list of (node, callback)
timers = []          # heap of (due, seq, timer)
queue = []           # heap of (t, seq, topic, msg)
_seq = [0]
driver = [None]
current_line = [0]   # program line that published the message being handled


def norm(topic):
    return topic if topic.startswith("/") else "/" + topic


def publish(node, topic, msg):
    topic = norm(topic)
    _seq[0] += 1
    heapq.heappush(queue, (_sim.now(), _seq[0], topic, msg, line()))
    _sim.ros_msg(topic, type(msg).__module__.split(".")[0] + "/" + type(msg).__name__, repr(msg))


def add_timer(timer):
    _seq[0] += 1
    heapq.heappush(timers, (_sim.now() + timer.period, _seq[0], timer))


def step(budget):
    """Run what is due next (a queued message or a timer). False when nothing is left."""
    if queue:
        t, _, topic, msg, ln = heapq.heappop(queue)
        current_line[0] = ln
        for node, cb in list(topics.get(topic, [])):
            cb(msg)
        return True
    if timers:
        due, seq, timer = heapq.heappop(timers)
        if timer.cancelled:
            return True
        wait = due - _sim.now()
        if wait > budget:
            heapq.heappush(timers, (due, seq, timer))
            _sim.sleep(budget)
            return False
        if wait > 0:
            _sim.sleep(wait)
        timer.callback()
        _seq[0] += 1
        heapq.heappush(timers, (_sim.now() + timer.period, _seq[0], timer))
        return True
    return False


def start_driver():
    """The official mycobot_280_rdkx5 driver: /joint_states (radians) -> send_angles(degrees, 50)."""
    if driver[0] is not None:
        return
    from rclpy.node import Node
    from sensor_msgs.msg import JointState

    class ControlSlider(Node):
        def __init__(self):
            super().__init__("control_slider", _builtin=True)
            self.create_subscription(JointState, "joint_states", self.listener_callback, 10)

        def listener_callback(self, msg):
            n = int(_sim.dof())
            data_list = [round(math.degrees(v), 2) for v in list(msg.position)[:n]]
            if len(data_list) == n:
                _sim.driver_move(data_list + [0] * (6 - n), 50, current_line[0])

    driver[0] = ControlSlider()
`,

  '/sim/rclpy/node.py': String.raw`
import _sim
from _simpy import line
from rclpy import _bus, _nodes


class _Logger:
    def __init__(self, name):
        self.name = name

    def info(self, text, *a, **k):
        _sim.log("[INFO] [%s]: %s" % (self.name, text))

    warn = warning = info

    def error(self, text, *a, **k):
        _sim.log("[ERROR] [%s]: %s" % (self.name, text))


class _Time:
    def __init__(self, ns):
        self.nanoseconds = ns

    def to_msg(self):
        from builtin_interfaces.msg import Time
        return Time(sec=int(self.nanoseconds // 1_000_000_000), nanosec=int(self.nanoseconds % 1_000_000_000))


class _Clock:
    def now(self):
        return _Time(int(_sim.now() * 1e9))


class Publisher:
    def __init__(self, node, msg_type, topic):
        self.node, self.msg_type, self.topic = node, msg_type, _bus.norm(topic)

    def publish(self, msg):
        _bus.publish(self.node, self.topic, msg)


class Timer:
    def __init__(self, period, callback):
        self.period, self.callback, self.cancelled = float(period), callback, False

    def cancel(self):
        self.cancelled = True


class _Param:
    def __init__(self, value):
        self.value = value

    def get_parameter_value(self):
        class V:
            pass
        v = V()
        v.string_value = v.integer_value = v.double_value = v.bool_value = self.value
        return v


class Node:
    def __init__(self, node_name, *, namespace=None, _builtin=False, **kwargs):
        self._name = node_name
        self._params = {}
        self._pubs, self._subs = [], []
        _nodes.append(self)
        _sim.ros_node(node_name, bool(_builtin))

    def get_name(self):
        return self._name

    def get_logger(self):
        return _Logger(self._name)

    def get_clock(self):
        return _Clock()

    def create_publisher(self, msg_type, topic, qos_profile=10, **kwargs):
        p = Publisher(self, msg_type, topic)
        _sim.ros_link(self._name, p.topic, "pub")
        return p

    def create_subscription(self, msg_type, topic, callback, qos_profile=10, **kwargs):
        t = _bus.norm(topic)
        _bus.topics.setdefault(t, []).append((self, callback))
        _sim.ros_link(self._name, t, "sub")
        return object()

    def create_timer(self, timer_period_sec, callback, **kwargs):
        timer = Timer(timer_period_sec, callback)
        _bus.add_timer(timer)
        return timer

    def declare_parameter(self, name, value=None, *a, **k):
        self._params[name] = value
        return _Param(value)

    def get_parameter(self, name):
        return _Param(self._params.get(name))

    def destroy_node(self):
        pass
`,

  '/sim/std_msgs/__init__.py': '',
  '/sim/std_msgs/msg.py': String.raw`
class _Msg:
    _fields = ()

    def __init__(self, **kw):
        for f, default in self._fields:
            setattr(self, f, kw.get(f, default() if callable(default) else default))

    def __repr__(self):
        return "%s(%s)" % (type(self).__name__, ", ".join("%s=%r" % (f, getattr(self, f)) for f, _ in self._fields))


class String(_Msg):
    _fields = (("data", ""),)


class Float64(_Msg):
    _fields = (("data", 0.0),)


class Float64MultiArray(_Msg):
    _fields = (("data", list),)


class Header(_Msg):
    _fields = (("stamp", None), ("frame_id", ""))
`,

  '/sim/builtin_interfaces/__init__.py': '',
  '/sim/builtin_interfaces/msg.py': String.raw`
class Time:
    def __init__(self, sec=0, nanosec=0):
        self.sec, self.nanosec = sec, nanosec

    def __repr__(self):
        return "Time(sec=%d, nanosec=%d)" % (self.sec, self.nanosec)
`,

  '/sim/sensor_msgs/__init__.py': '',
  '/sim/sensor_msgs/msg.py': String.raw`
from std_msgs.msg import Header, _Msg


class JointState(_Msg):
    _fields = (("header", Header), ("name", list), ("position", list), ("velocity", list), ("effort", list))
`,
};

/** Python run before every program: simulated clock for the time module, fresh modules. */
export const PY_PRELUDE = String.raw`
import sys, time
for _m in [m for m in sys.modules if m.split(".")[0] in ("pymycobot", "omx", "Hobot", "RPi", "rclpy", "std_msgs", "sensor_msgs", "builtin_interfaces", "_simpy", "_sim")]:
    del sys.modules[_m]
if "/sim" not in sys.path:
    sys.path.insert(0, "/sim")
import _sim
time.sleep = _sim.sleep
time.time = lambda: 1_700_000_000.0 + _sim.now()
time.monotonic = time.perf_counter = lambda: _sim.now()
`;
