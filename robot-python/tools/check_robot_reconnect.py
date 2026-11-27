#!/usr/bin/env python3
"""The arm server reconnects by itself (server.py Robot._auto_reopen), no [다시 연결] needed.

A stand-in pymycobot whose arm can be switched off and on, as the real one:
  - the robot boots and the server comes up before the arm's firmware: the port opens, the arm is silent,
    then it answers on its own once the firmware is up;
  - the arm switched off and on while the server runs: the old port handle stays dead (as a serial line whose
    other end restarted), only a reopened one answers; the server must reopen it by itself;
  - the port will not open at first (cable out): it is opened once it can be;
  - a released arm is reopened without power_on (its servos would lock under a holding hand);
  - nothing is reopened while a program runs;
  - the state tells the console: armSilentSince while silent, armLink counts each return;
  - after REOPEN_SLOW_AFTER_S of failing, it tries every REOPEN_SLOW_S instead.

    python3 robot-python/tools/check_robot_reconnect.py
"""

import os
import sys
import time
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "server"))


class Hw:
    """The arm hardware: on/off, and which opened handle is still good."""
    on = True
    port_ok = True
    generation = 0          # bumps on every power-on: older handles go dead
    opens = 0
    power_ons = 0


class FakeCobot:
    def __init__(self, port, baud):
        if not Hw.port_ok:
            raise OSError(f"could not open port {port}")
        Hw.opens += 1
        self.gen = Hw.generation

    def _alive(self):
        return Hw.on and self.gen == Hw.generation

    def get_angles(self):
        return [0.0, 10.0, -20.0, 30.0, 0.0, 0.0] if self._alive() else -1

    def power_on(self):
        Hw.power_ons += 1

    def close(self):
        pass


sys.modules["pymycobot"] = types.SimpleNamespace(MyCobot280RDKX5=FakeCobot)
import server  # noqa: E402

server.log = lambda text: None
server.ARM_SILENT_S = 0.4
server.REOPEN_EVERY_S = 0.5
server.REOPEN_SLOW_S = 2.0
server.REOPEN_SLOW_AFTER_S = 1.5
FAILS = []


def wait(robot, connected, within):
    t = time.time()
    while time.time() - t < within:
        if robot.state["connected"] == connected:
            return True
        time.sleep(0.05)
    return False


def check(name, ok):
    print(("ok   " if ok else "FAIL ") + name)
    if not ok:
        FAILS.append(name)


def power_cycle(off_s=0.8):
    Hw.on = False
    time.sleep(off_s)
    Hw.generation += 1
    Hw.on = True


# 1. Server before firmware: the arm silent at the start, answering a moment later.
Hw.on = False
robot = server.Robot(False, "/dev/fake", 1000000)
time.sleep(1.0)
check("silent arm at boot: not connected", robot.state["connected"] is False)
Hw.generation += 1
Hw.on = True
check("arm firmware up: connected by itself within 4 s", wait(robot, True, 4))

# 2. Switched off and on while running the server: the old handle stays dead.
opens = Hw.opens
link = robot.state["armLink"]
Hw.on = False
check("arm off: shown as not connected", wait(robot, False, 3))
check("... silent since is set", isinstance(robot.state["armSilentSince"], float))
time.sleep(0.3)
Hw.generation += 1
Hw.on = True
check("arm on again: reconnected by itself within 4 s", wait(robot, True, 4))
check("... by reopening the port", Hw.opens > opens)
check("... armLink counted, silent since cleared", robot.state["armLink"] > link and robot.state["armSilentSince"] is None)

# 3. Released arm: reopened without power_on.
robot.state["released"] = True
before = Hw.power_ons
power_cycle()
check("released arm: reconnected by itself", wait(robot, True, 5))
check("... without power_on", Hw.power_ons == before)
robot.state["released"] = False

# 4. Not while a program runs.
robot.state["running"] = True
opens = Hw.opens
power_cycle(0.2)
time.sleep(1.5)
check("running: the port is not reopened", Hw.opens == opens)
robot.state["running"] = False
check("run over: reconnected by itself", wait(robot, True, 4))

# 5. Failing for long: slower tries.
Hw.on = False
wait(robot, False, 3)
time.sleep(2.5)                      # past REOPEN_SLOW_AFTER_S
t0 = Hw.opens
time.sleep(3.0)
check("failing past a minute (scaled): tries slow down (<= 2 in 3 s)", Hw.opens - t0 <= 2)
Hw.generation += 1
Hw.on = True
check("... and still reconnects", wait(robot, True, 5))

# 6. Port will not open at first (NoArm), then can.
Hw.port_ok = False
robot2 = server.Robot(False, "/dev/fake2", 1000000)
check("no port: NoArm, error said", isinstance(robot2.arm, server.NoArm) and bool(robot2.state["error"]))
time.sleep(0.8)
Hw.port_ok = True
check("port back: connected by itself, error cleared", wait(robot2, True, 4) and robot2.state["error"] == "")

print("모두 통과" if not FAILS else f"실패 {len(FAILS)}개")
sys.exit(1 if FAILS else 0)
