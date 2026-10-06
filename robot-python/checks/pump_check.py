#!/usr/bin/env python3
"""
흡착 펌프 V2.0 점검 — myCobot 280 RDK X5 (로봇 터미널에서)

    sudo systemctl stop robot-console     # 콘솔 서버가 같은 핀을 잡고 있으면 먼저 끄기
    python3 pump_check.py                 # 1) 일반 사용자로
    sudo python3 pump_check.py            # 2) 관리자로 (1 이 권한 오류일 때)
    sudo systemctl start robot-console    # 끝나면 다시 켜기

What it checks, in order, and prints so the result can be copied and sent:
  1. who runs it (user, groups — RDK OS gives GPIO to the "gpio" group or root)
  2. Hobot.GPIO: import, BOARD numbering, pins 31 and 37 as outputs
  3. the pump: ON for 3 s (the motor hums, the cup sucks), then OFF (the release valve clicks)
  4. the wiring the console assumes, to compare with the cables

Pins and on/off order are those of Elephant Robotics' RDK X5 vision kit
(mycobot280RDKX5_vision_kit color_demo.py): pin 37 = pump (G5 on the pump box,
the Pi version's BCM 20), pin 31 = release valve (G2, the Pi version's BCM 21).
    on:  31 HIGH, then 37 LOW        off: 31 LOW, then 37 HIGH
"""

import grp
import os
import pwd
import sys
import time

PUMP = 37      # G5 on the pump box
VALVE = 31     # G2 on the pump box

WIRING = """배선 (펌프 상자 → 로봇 베이스 40핀, 핀 번호는 보드 위 인쇄 번호)
    5V  → 5V   (2번 또는 4번 핀)
    GND → GND  (6번 등)
    G5  → 37번 핀   (펌프 모터)
    G2  → 31번 핀   (공기 빼는 밸브)
  펌프 상자의 전원선도 꽂혀 있어야 합니다."""


def say(ok, text):
    print(f"  {'OK ' if ok else '!! '} {text}")


def main():
    print("흡착 펌프 점검 (myCobot 280 RDK X5)\n")
    user = pwd.getpwuid(os.geteuid()).pw_name
    groups = sorted({grp.getgrgid(g).gr_name for g in os.getgroups()})
    print("1. 실행 사용자")
    say(True, f"{user} (uid {os.geteuid()}), 그룹: {', '.join(groups) or '-'}")
    if os.geteuid() != 0 and "gpio" not in groups:
        say(False, "이 사용자는 gpio 그룹이 아니에요 — 핀을 못 쓸 수 있어요 (sudo 로 다시 해 보세요)")

    print("\n2. Hobot.GPIO")
    try:
        import Hobot.GPIO as GPIO
    except Exception as exc:
        say(False, f"불러오지 못했어요: {exc}")
        print("   RDK OS 에 들어 있는 모듈이에요. RDK X5 가 아닌 곳에서는 이 점검을 할 수 없어요.")
        return 1
    say(True, "불러옴")
    try:
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BOARD)
        GPIO.setup(PUMP, GPIO.OUT)
        GPIO.output(PUMP, GPIO.HIGH)
        GPIO.setup(VALVE, GPIO.OUT)
        GPIO.output(VALVE, GPIO.HIGH)
    except Exception as exc:
        say(False, f"핀 {VALVE}·{PUMP} 을 출력으로 설정하지 못했어요: {exc}")
        if os.geteuid() != 0:
            print("   → 권한 문제일 가능성이 커요. 'sudo python3 pump_check.py' 로 다시 해 보세요.")
            print("     sudo 로 되면: 콘솔 서버도 관리자 권한이 있어야 펌프를 켤 수 있어요 (매뉴얼 '흡착 펌프').")
        return 1
    say(True, f"핀 {VALVE}·{PUMP} 출력으로 설정 (BOARD 번호)")

    print("\n3. 펌프 켜기 3초 → 끄기")
    try:
        GPIO.output(VALVE, GPIO.HIGH)
        time.sleep(0.05)
        GPIO.output(PUMP, GPIO.LOW)
        say(True, "켰어요 — 지금 모터 소리가 나고 흡착컵이 빨아들여야 해요")
        time.sleep(3)
        GPIO.output(VALVE, GPIO.LOW)
        time.sleep(0.05)
        GPIO.output(PUMP, GPIO.HIGH)
        say(True, "껐어요 — 밸브가 '딸깍' 하며 공기가 빠져야 해요")
        time.sleep(1)
    except Exception as exc:
        say(False, f"핀을 바꾸지 못했어요: {exc}")
        return 1
    finally:
        try:
            GPIO.cleanup()
        except Exception:
            pass

    print("\n4. 소리가 안 났다면 배선을 확인하세요")
    print(WIRING)
    print("\n소프트웨어 쪽은 정상이에요. 위 3 에서 소리가 났다면 콘솔의 [흡착 켜기] 도 같은 핀을 써요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
