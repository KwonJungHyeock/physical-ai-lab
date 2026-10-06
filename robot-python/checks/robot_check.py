#!/usr/bin/env python3
"""
myCobot 280 RDK X5 — 실기 점검 스크립트 (테스트용)

로봇의 연결, 각도 읽기 속도, 작은 동작, 정지, 손으로 움직이기(서보 풀기),
그리퍼를 차례로 확인하고, 결과를 복사해서 보낼 수 있게 한 번에 출력합니다.

실행
    python3 robot_check.py                  # 로봇(RDK X5) 안에서 실행 — 권장
    python3 robot_check.py --ip 192.168.0.12  # PC에서 원격 실행 (로봇에서 공식 서버가 켜져 있어야 함)
    python3 robot_check.py --demo           # 로봇 없이 흐름만 미리 보기

SDK facts this script relies on (pymycobot 4.0.7, mycobot280rdkx5.py):
    MyCobot280RDKX5(port="/dev/ttyS1", baudrate=1_000_000)   onboard UART
    MyCobot280RDKX5Socket(ip, port=30002)                     demo/Server_280_RDKX5.py on the robot
    get_angles, send_angle(joint_id, angle, speed), stop, release_all_servos,
    focus_all_servos, power_on, is_power_on, get_fresh_mode/set_fresh_mode,
    get_error_information, get_system_version, set_gripper_state(state, speed),
    get_gripper_value
Joint limits are the adopted per-axis limits from web-typescript/src/engine/robot/limits.ts.
"""

import argparse
import math
import datetime as _dt
import os
import platform
import random
import shutil
import signal
import statistics
import subprocess
import sys
import time

JOINT_MIN = [-168, -135, -150, -145, -155, -180]
JOINT_MAX = [168, 135, 150, 145, 160, 180]
DEFAULT_PORT = "/dev/ttyS1"
DEFAULT_BAUD = 1_000_000
TEST_SPEED = 20          # gentle, well under the 50% classroom cap
ARRIVE_TOL_DEG = 1.5
ARRIVE_TIMEOUT_S = 8.0

REPORT = []              # lines for the copyable summary
ROBOT = None
SERVOS_RELEASED = False


# --------------------------------------------------------------------------- #
# Output helpers                                                              #
# --------------------------------------------------------------------------- #

def say(msg=""):
    print(msg, flush=True)


def record(key, value):
    REPORT.append(f"{key}: {value}")
    say(f"   · {key}: {value}")


def heading(title):
    say()
    say("=" * 60)
    say(f" {title}")
    say("=" * 60)


def ask(prompt, default_skip=False):
    """Enter = 진행, s = 건너뛰기. Returns True to proceed."""
    hint = "[Enter=진행 / s=건너뛰기]"
    try:
        ans = input(f"\n>> {prompt} {hint} ").strip().lower()
    except EOFError:
        return not default_skip
    return ans not in ("s", "skip", "n", "no")


def fmt_angles(a):
    if not valid_angles(a):
        return str(a)
    return "[" + ", ".join(f"{v:7.2f}" for v in a) + "]"


def valid_angles(a):
    return isinstance(a, (list, tuple)) and len(a) == 6 and all(isinstance(v, (int, float)) for v in a)


def ms_stats(samples):
    if not samples:
        return "측정값 없음"
    s = sorted(samples)
    p95 = s[max(0, int(round(0.95 * len(s))) - 1)]
    return (f"평균 {statistics.mean(s):.1f}ms / 중앙값 {statistics.median(s):.1f}ms / "
            f"95% {p95:.1f}ms / 최대 {s[-1]:.1f}ms (n={len(s)})")


# --------------------------------------------------------------------------- #
# Demo robot: lets the whole flow run without hardware                        #
# --------------------------------------------------------------------------- #

class DemoRobot:
    """Minimal stand-in with the same method names as MyCobot280RDKX5."""

    def __init__(self):
        self.angles = [0.0, 35.0, 10.0, -70.0, -90.0, 0.0]
        self.target = list(self.angles)
        self.deg_per_s = 0.0
        self.t_last = time.time()
        self.released = False
        self.fresh = 0
        self.grip = 50

    def _tick(self):
        now = time.time()
        dt, self.t_last = now - self.t_last, now
        if self.released:
            self.angles = [a + random.uniform(-0.6, 0.6) for a in self.angles]
            return
        step = self.deg_per_s * dt
        self.angles = [a + max(-step, min(step, t - a)) for a, t in zip(self.angles, self.target)]

    def _io(self):
        time.sleep(random.uniform(0.006, 0.014))

    def get_angles(self):
        self._io(); self._tick(); return [round(a, 2) for a in self.angles]

    def get_coords(self):
        # Demo only: what firmware using the official DH table would report.
        self._io(); x, y, z = dh_position(self.angles, 131.22); return [round(x, 1), round(y, 1), round(z, 1), 180.0, 0.0, 0.0]

    def send_angle(self, joint_id, angle, speed):
        self._io(); self._tick()
        self.target[joint_id - 1] = float(angle)
        self.deg_per_s = speed * 2.0
        return 1

    def stop(self):
        self._io(); self._tick(); self.target = list(self.angles); return 1

    def power_on(self): self._io(); return 1
    def is_power_on(self): self._io(); return 1
    def get_system_version(self): self._io(); return 1.0
    def get_fresh_mode(self): self._io(); return self.fresh
    def set_fresh_mode(self, m): self._io(); self.fresh = m; return 1
    def get_error_information(self): self._io(); return 0
    def release_all_servos(self): self._io(); self.released = True; return 1
    def focus_all_servos(self): self._io(); self._tick(); self.released = False; self.target = list(self.angles); return 1
    def set_gripper_state(self, state, speed): self._io(); self.grip = 100 if state == 0 else 0; return 1
    def get_gripper_value(self): self._io(); return self.grip


# --------------------------------------------------------------------------- #
# Safety: Ctrl+C always stops the arm                                         #
# --------------------------------------------------------------------------- #

def emergency_stop(*_):
    say("\n\n[정지] Ctrl+C 를 눌렀어요. 로봇을 멈춥니다.")
    try:
        if ROBOT is not None:
            ROBOT.stop()
            if SERVOS_RELEASED:
                ROBOT.focus_all_servos()
    except Exception as exc:  # noqa: BLE001 — best effort on the way out
        say(f"[정지] 정지 명령 중 오류: {exc}")
    print_summary(interrupted=True)
    sys.exit(130)


def call(name, fn, *args):
    """Call an SDK method, time it, and never let one failure end the run."""
    t0 = time.perf_counter()
    try:
        result = fn(*args)
        return result, (time.perf_counter() - t0) * 1000.0, None
    except Exception as exc:  # noqa: BLE001
        return None, (time.perf_counter() - t0) * 1000.0, f"{type(exc).__name__}: {exc}"


def read_angles():
    res, ms, err = call("get_angles", ROBOT.get_angles)
    return (res if valid_angles(res) else None), ms, err


def wait_until(target, joint_index):
    """Poll until joint reaches target (±tol). Returns (arrived, seconds, final_angles)."""
    t0 = time.time()
    last = None
    while time.time() - t0 < ARRIVE_TIMEOUT_S:
        a, _, _ = read_angles()
        if a:
            last = a
            if abs(a[joint_index] - target) <= ARRIVE_TOL_DEG:
                return True, time.time() - t0, a
        time.sleep(0.05)
    return False, time.time() - t0, last


def safe_offset(current, joint_index, offset):
    """Pick +offset or -offset so the target stays inside the adopted limits."""
    lo, hi = JOINT_MIN[joint_index], JOINT_MAX[joint_index]
    for cand in (current + offset, current - offset):
        if lo + 5 <= cand <= hi - 5:
            return cand
    return None


# --------------------------------------------------------------------------- #
# Checks                                                                      #
# --------------------------------------------------------------------------- #

def sh(cmd, timeout=5):
    """Run a read-only shell command; return its stdout (empty on any failure)."""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def short(items, limit=12):
    items = [i for i in items if i]
    more = f" 외 {len(items) - limit}개" if len(items) > limit else ""
    return ", ".join(items[:limit]) + more if items else "없음"


def survey_install_environment():
    """Read-only facts needed to install the classroom console on the robot."""
    heading("1-2. 설치 환경 (로봇은 움직이지 않아요)")
    record("호스트 이름", platform.node() or "알 수 없음")
    pretty = ""
    try:
        with open("/etc/os-release", encoding="utf-8") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    pretty = line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    record("운영체제", pretty or "알 수 없음")
    record("커널", platform.release())
    mem = {}
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                k, v = line.split(":", 1)
                mem[k] = int(v.split()[0]) // 1024
    except (OSError, ValueError):
        pass
    if mem:
        record("메모리", f"전체 {mem.get('MemTotal', 0)}MB / 여유 {mem.get('MemAvailable', 0)}MB")
    du = shutil.disk_usage(os.path.expanduser("~"))
    record("저장공간(홈)", f"여유 {du.free // 2**30}GB / 전체 {du.total // 2**30}GB")
    record("IP 주소", sh(["hostname", "-I"]) or "알 수 없음")
    ros = sorted(os.listdir("/opt/ros")) if os.path.isdir("/opt/ros") else []
    record("ROS 설치", short(ros))
    record("Node.js", sh(["node", "-v"]) or "없음")
    browsers = [b for b in ("chromium", "chromium-browser", "firefox", "google-chrome") if shutil.which(b)]
    record("브라우저", short(browsers))
    ports = sorted({ln.split()[3].rsplit(":", 1)[-1] for ln in sh(["ss", "-ltnH"]).splitlines() if len(ln.split()) > 3},
                   key=lambda p: int(p) if p.isdigit() else 0)
    record("열려 있는 포트", short(ports, 20))
    keys = ("elephant", "mycobot", "blockly", "studio", "vnc", "ros2", "/opt/ros", "server_280", "jupyter")
    svc = [ln.split()[0] for ln in sh(["systemctl", "list-units", "--type=service", "--state=running",
                                       "--no-legend", "--plain"]).splitlines()
           if ln.split() and any(k in ln.lower() for k in keys)]
    record("관련 서비스(실행 중)", short(svc))
    procs = []
    for ln in sh(["ps", "-eo", "pid=,args="]).splitlines():
        low = ln.lower()
        if any(k in low for k in keys) and "robot_check" not in low:
            procs.append(ln.strip()[:70])
    record("관련 프로그램(실행 중)", short(procs, 8))


def check_environment(args):
    heading("1. 환경")
    record("시각", _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    record("Python", platform.python_version())
    record("장치", f"{platform.system()} {platform.machine()}")
    if args.demo:
        record("모드", "데모 (로봇 없이 실행)")
        return True
    try:
        import pymycobot  # noqa: F401
        record("pymycobot", getattr(pymycobot, "__version__", "버전 정보 없음"))
    except ImportError:
        record("pymycobot", "설치 안 됨")
        say("\n   pymycobot 이 없어요. 아래 명령으로 설치한 뒤 다시 실행해 주세요.")
        say("      pip3 install -U pymycobot")
        return False
    if args.ip:
        record("모드", f"원격 (소켓 {args.ip}:{args.socket_port})")
        return True
    record("모드", f"로봇 안에서 실행 (시리얼 {args.port}, {args.baud} baud)")
    if not os.path.exists(args.port):
        record("포트", "없음")
        say(f"\n   {args.port} 가 없어요. 이 스크립트를 로봇(RDK X5) 안에서 실행했는지 확인해 주세요.")
        return False
    rw = os.access(args.port, os.R_OK | os.W_OK)
    record("포트 권한", "읽기·쓰기 가능" if rw else "권한 없음")
    if not rw:
        say(f"\n   포트 권한이 없어요. 'sudo python3 {os.path.basename(__file__)}' 로 다시 실행해 보세요.")
        return False
    if shutil.which("fuser"):
        out = subprocess.run(["fuser", args.port], capture_output=True, text=True)
        users = (out.stdout + out.stderr).replace(f"{args.port}:", "").split()
        users = [u for u in users if u.strip().isdigit() and int(u) != os.getpid()]
        if users:
            names = []
            for pid in users:
                try:
                    with open(f"/proc/{pid}/comm") as f:
                        names.append(f"{pid}({f.read().strip()})")
                except OSError:
                    names.append(pid)
            record("포트 사용 중인 다른 프로그램", ", ".join(names))
            say("\n   다른 프로그램이 같은 포트를 쓰고 있으면 결과가 틀어질 수 있어요.")
            say("   (예: 공식 앱, ROS 노드, Server_280_RDKX5.py) 가능하면 끄고 다시 실행해 주세요.")
        else:
            record("포트 사용 중인 다른 프로그램", "없음")
    return True


def connect(args):
    global ROBOT
    heading("2. 연결")
    if args.demo:
        ROBOT = DemoRobot()
    else:
        try:
            if args.ip:
                from pymycobot import MyCobot280RDKX5Socket
                ROBOT = MyCobot280RDKX5Socket(args.ip, args.socket_port)
            else:
                from pymycobot import MyCobot280RDKX5
                ROBOT = MyCobot280RDKX5(args.port, args.baud)
        except ImportError:
            record("연결", "실패 — 이 pymycobot 버전에는 RDK X5 클래스가 없어요")
            say("   pip3 install -U pymycobot 로 업데이트해 주세요.")
            return False
        except Exception as exc:  # noqa: BLE001
            record("연결", f"실패 — {type(exc).__name__}: {exc}")
            return False
    time.sleep(0.5)

    _, _, err = call("power_on", ROBOT.power_on)
    record("전원 켜기(power_on)", "보냄" if not err else f"오류 {err}")
    time.sleep(0.5)
    for label, fn in (("전원 상태(is_power_on)", ROBOT.is_power_on),
                      ("시스템 버전", ROBOT.get_system_version),
                      ("명령 처리 모드(fresh mode)", ROBOT.get_fresh_mode),
                      ("오류 정보", ROBOT.get_error_information)):
        res, ms, err = call(label, fn)
        record(label, f"{res}  ({ms:.0f}ms)" if not err else f"오류 {err}")

    a, ms, err = read_angles()
    if not a:
        record("현재 각도", f"읽기 실패 {err or ''}".strip())
        say("\n   각도를 읽지 못했어요. 전원, 케이블, 다른 프로그램의 포트 사용 여부를 확인해 주세요.")
        return False
    record("현재 각도", fmt_angles(a))
    out = [f"J{i + 1}" for i, v in enumerate(a) if not (JOINT_MIN[i] <= v <= JOINT_MAX[i])]
    if out:
        record("범위 밖 관절", ", ".join(out))
    return True


def check_read_speed():
    heading("3. 각도 읽기 속도")
    say("   각도를 50번 읽어서 걸리는 시간을 잽니다. 로봇은 움직이지 않아요.")
    ok, bad, times = 0, 0, []
    for _ in range(50):
        a, ms, _ = read_angles()
        times.append(ms)
        ok, bad = (ok + 1, bad) if a else (ok, bad + 1)
    record("get_angles 응답", ms_stats(times))
    record("get_angles 실패", f"{bad}/50")
    if times:
        record("이론상 최대 갱신", f"약 {1000.0 / statistics.mean(times):.0f}Hz (읽기만 할 때)")
    ctimes = []
    for _ in range(20):
        _, ms, err = call("get_coords", ROBOT.get_coords)
        if not err:
            ctimes.append(ms)
    record("get_coords 응답", ms_stats(ctimes))


def move_joint_test(joint_index, offset, label):
    start, _, _ = read_angles()
    if not start:
        record(label, "시작 각도를 읽지 못해 건너뜀")
        return
    target = safe_offset(start[joint_index], joint_index, offset)
    if target is None:
        record(label, "한계에 너무 가까워 건너뜀")
        return
    say(f"   J{joint_index + 1}: {start[joint_index]:.1f}° → {target:.1f}° (속도 {TEST_SPEED}) 후 되돌아옵니다.")
    _, send_ms, err = call("send_angle", ROBOT.send_angle, joint_index + 1, target, TEST_SPEED)
    if err:
        record(label, f"명령 오류 {err}")
        return
    arrived, secs, final = wait_until(target, joint_index)
    err_deg = abs(final[joint_index] - target) if final else float("nan")
    record(f"{label} 명령 응답", f"{send_ms:.0f}ms")
    record(f"{label} 도착", f"{'도착' if arrived else '시간 초과'} {secs:.2f}초, 오차 {err_deg:.2f}°")
    others = [abs(final[i] - start[i]) for i in range(6) if i != joint_index] if final else []
    if others:
        record(f"{label} 다른 관절 흔들림", f"최대 {max(others):.2f}°")
    call("send_angle", ROBOT.send_angle, joint_index + 1, start[joint_index], TEST_SPEED)
    back, secs_b, _ = wait_until(start[joint_index], joint_index)
    record(f"{label} 복귀", f"{'복귀' if back else '시간 초과'} {secs_b:.2f}초")


def check_small_moves():
    heading("4. 작은 동작")
    say("   관절 1(몸통)을 10°, 관절 6(손목)을 20° 돌렸다가 제자리로 돌아옵니다.")
    say("   팔 주변 30cm 안에 물건과 손이 없는지 확인해 주세요.")
    if not ask("움직여도 될까요?"):
        record("작은 동작", "건너뜀")
        return
    res, _, err = call("get_fresh_mode", ROBOT.get_fresh_mode)
    record("시험 전 fresh mode", res if not err else f"오류 {err}")
    move_joint_test(0, 10, "J1 10° 이동")
    move_joint_test(5, 20, "J6 20° 이동")


def check_stop():
    heading("5. 정지 (비상정지 동작 확인)")
    say("   관절 1을 천천히 30° 돌리다가 0.6초 뒤에 정지 명령을 보냅니다.")
    if not ask("정지 시험을 할까요?"):
        record("정지", "건너뜀")
        return
    start, _, _ = read_angles()
    if not start:
        record("정지", "시작 각도를 읽지 못해 건너뜀")
        return
    target = safe_offset(start[0], 0, 30)
    if target is None:
        record("정지", "한계에 너무 가까워 건너뜀")
        return
    call("send_angle", ROBOT.send_angle, 1, target, 10)
    time.sleep(0.6)
    _, stop_ms, err = call("stop", ROBOT.stop)
    record("stop 명령 응답", f"{stop_ms:.0f}ms" if not err else f"오류 {err}")
    at_stop, _, _ = read_angles()
    time.sleep(1.0)
    after, _, _ = read_angles()
    if at_stop and after:
        drift = abs(after[0] - at_stop[0])
        moved = abs(at_stop[0] - start[0])
        record("정지 전까지 움직인 각도", f"{moved:.2f}°")
        record("정지 후 1초간 더 움직인 각도", f"{drift:.2f}° {'(멈춤 확인)' if drift < 1.0 else '(계속 움직임 — 확인 필요)'}")
    call("send_angle", ROBOT.send_angle, 1, start[0], TEST_SPEED)
    back, secs, _ = wait_until(start[0], 0)
    record("정지 시험 후 복귀", f"{'복귀' if back else '시간 초과'} {secs:.2f}초")


def check_free_mode():
    global SERVOS_RELEASED
    heading("6. 손으로 움직이기 (서보 풀기)")
    say("   ⚠ 서보를 풀면 팔이 무게 때문에 아래로 떨어질 수 있어요.")
    say("   반드시 한 손으로 팔의 윗부분을 받친 상태에서 진행해 주세요.")
    if not ask("팔을 받쳤나요? 서보를 풀까요?", default_skip=True):
        record("손으로 움직이기", "건너뜀")
        return
    _, ms, err = call("release_all_servos", ROBOT.release_all_servos)
    SERVOS_RELEASED = err is None
    record("서보 풀기 응답", f"{ms:.0f}ms" if not err else f"오류 {err}")
    say("   6초 동안 팔을 천천히 움직여 보세요. 읽은 각도를 보여 드릴게요.")
    first, lo, hi, n, fails = None, [1e9] * 6, [-1e9] * 6, 0, 0
    t0 = time.time()
    while time.time() - t0 < 6.0:
        a, _, _ = read_angles()
        if a:
            first = first or a
            lo = [min(x, y) for x, y in zip(lo, a)]
            hi = [max(x, y) for x, y in zip(hi, a)]
            n += 1
            print(f"\r   {fmt_angles(a)}", end="", flush=True)
        else:
            fails += 1
        time.sleep(0.1)
    say()
    if n:
        spans = [h - l for h, l in zip(hi, lo)]
        record("풀린 상태에서 읽은 횟수", f"{n}번 (실패 {fails}번)")
        record("관절별 움직인 범위", "[" + ", ".join(f"{s:.1f}°" for s in spans) + "]")
    else:
        record("풀린 상태 각도 읽기", "실패 — 서보를 풀면 각도를 못 읽을 수 있어요 (드래그 티칭에 중요)")
    ask("팔을 편한 자세로 두고 받친 채 Enter 를 누르면 다시 고정합니다.")
    _, ms, err = call("focus_all_servos", ROBOT.focus_all_servos)
    SERVOS_RELEASED = err is not None
    record("서보 고정 응답", f"{ms:.0f}ms" if not err else f"오류 {err}")
    time.sleep(0.5)
    a, _, _ = read_angles()
    record("고정 후 각도", fmt_angles(a) if a else "읽기 실패")


def check_gripper():
    heading("7. 그리퍼 (달려 있을 때만)")
    if not ask("그리퍼가 달려 있나요? 열고 닫아 볼까요?", default_skip=True):
        record("그리퍼", "건너뜀")
        return
    for state, name in ((0, "열기"), (1, "닫기")):
        _, ms, err = call("set_gripper_state", ROBOT.set_gripper_state, state, 50)
        time.sleep(1.5)
        val, _, verr = call("get_gripper_value", ROBOT.get_gripper_value)
        record(f"그리퍼 {name}", f"응답 {ms:.0f}ms, 값 {val}" if not (err or verr) else f"오류 {err or verr}")


# --------------------------------------------------------------------------- #
# Coordinate frame (no motion)                                                #
# --------------------------------------------------------------------------- #

# Official myCobot 280 standard-DH table (product docs, "SDH parameters"):
# d, a, alpha, theta offset per joint, mm / rad.
SDH = [
    (131.22, 0.0, math.pi / 2, 0.0),
    (0.0, -110.4, 0.0, -math.pi / 2),
    (0.0, -96.0, 0.0, 0.0),
    (63.4, 0.0, math.pi / 2, -math.pi / 2),
    (75.05, 0.0, -math.pi / 2, math.pi / 2),
    (45.6, 0.0, 0.0, 0.0),
]
# The RDK X5 URDF puts J2 8.34 mm higher than this table (base 139.56 mm).
RDK_URDF_D1 = 139.56


def dh_position(angles_deg, d1):
    """Flange position (mm) for joint angles with the official DH table and base height d1."""
    t = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    for i, (d, a, alpha, off) in enumerate(SDH):
        if i == 0:
            d = d1
        th = math.radians(angles_deg[i]) + off
        ct, st, ca, sa = math.cos(th), math.sin(th), math.cos(alpha), math.sin(alpha)
        m = [[ct, -st * ca, st * sa, a * ct], [st, ct * ca, -ct * sa, a * st], [0, sa, ca, d], [0, 0, 0, 1]]
        t = [[sum(t[r][k] * m[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
    return t[0][3], t[1][3], t[2][3]


def check_coordinate_frame():
    heading("8. 좌표계 (로봇은 움직이지 않아요)")
    say("   지금 각도와 로봇이 계산한 좌표를 읽어, 시뮬레이터 모델과 같은 기준인지 봅니다.")
    angles, _, _ = read_angles()
    coords, _, err = call("get_coords", ROBOT.get_coords)
    if not angles or err or not coords or len(coords) < 3:
        record("좌표계", "각도나 좌표를 읽지 못해 건너뜀")
        return
    record("지금 각도", fmt_angles(angles))
    record("로봇 좌표 (get_coords)", ", ".join(f"{v:.1f}" for v in coords[:6]))
    for label, d1 in (("공식 DH (기둥 131.22mm)", 131.22), ("RDK X5 URDF (기둥 139.56mm)", RDK_URDF_D1)):
        x, y, z = dh_position(angles, d1)
        dist = math.dist((x, y, z), coords[:3])
        record(f"계산 {label}", f"{x:.1f}, {y:.1f}, {z:.1f}  → 차이 {dist:.1f}mm")
    record("판정 기준", "차이가 더 작은 쪽이 이 로봇 펌웨어의 기준 (시뮬레이터 z 보정에 사용)")


# --------------------------------------------------------------------------- #
# Summary                                                                     #
# --------------------------------------------------------------------------- #

def print_summary(interrupted=False):
    heading("결과 — 아래 블록을 그대로 복사해서 보내 주세요")
    lines = ["[myCobot 280 RDK X5 실기 점검 결과]"] + REPORT
    if interrupted:
        lines.append("※ 중간에 Ctrl+C 로 멈췄음")
    text = "\n".join(lines)
    say("-" * 60)
    say(text)
    say("-" * 60)
    name = f"mycobot_check_{_dt.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    path = os.path.join(os.path.expanduser("~"), name)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        say(f"파일로도 저장했어요: {path}")
    except OSError as exc:
        say(f"파일 저장 실패: {exc}")


def main():
    parser = argparse.ArgumentParser(description="myCobot 280 RDK X5 실기 점검")
    parser.add_argument("--port", default=DEFAULT_PORT, help="시리얼 포트 (기본 /dev/ttyS1)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="통신 속도 (기본 1000000)")
    parser.add_argument("--ip", help="PC에서 원격 실행할 때 로봇 IP")
    parser.add_argument("--socket-port", type=int, default=30002, help="원격 포트 (기본 30002)")
    parser.add_argument("--demo", action="store_true", help="로봇 없이 흐름만 확인")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, emergency_stop)

    say("myCobot 280 RDK X5 실기 점검")
    say("언제든 Ctrl+C 를 누르면 로봇이 멈추고 그때까지의 결과를 보여 줘요.")
    say("움직이는 단계마다 먼저 물어봅니다. 모르는 단계는 s 를 눌러 건너뛰어도 괜찮아요.")

    env_ok = check_environment(args)
    survey_install_environment()
    if env_ok and connect(args):
        check_read_speed()
        check_small_moves()
        check_stop()
        check_free_mode()
        check_gripper()
        check_coordinate_frame()
    print_summary()


if __name__ == "__main__":
    main()
