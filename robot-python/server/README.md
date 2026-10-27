# server — 로봇 안에서 도는 실습 콘솔 서버

로봇에는 `robot_console.zip` 으로 묶여 `~/robot_console/` 에 설치됩니다 (`../tools/make_usb_kit.py`, `../usb-kit/install.py`).

`server.py` 가 `static/` 의 실습 콘솔 화면을 제공하고, 화면의 요청으로 이 로봇을 움직입니다.
표준 라이브러리 + `pymycobot` 만 씁니다. 카메라 부분(`camera.py`)만 로봇에 OpenCV 가 있으면
씁니다 (RDK OS 기본 포함). 없으면 카메라 기능만 꺼지고 나머지는 그대로 동작합니다.
사용 순서는 [`manuals/robot-arm/robot-console.md`](../../manuals/robot-arm/robot-console.md).

```bash
python3 server.py                  # http://<로봇 IP>:8080/console  (PC 브라우저로 열기)
python3 server.py --demo           # 로봇 없이 가짜 팔로
python3 server.py --camera 0,2     # 카메라 번호 지정 (기본 auto: /dev/video0~9 중 영상이 나오는 것을 모두, 최대 4대)
python3 server.py --camera kit.png,hand.png # 카메라 대신 그림 파일 (화면 시험용, 쉼표로 여러 대)
sudo python3 autostart.py          # 한 번만: 로봇 전원을 켜면 서버가 저절로 켜지게 (systemd, --off 로 되돌림)
sudo python3 wifi.py EDUINO-LAB 비밀번호   # 교실 Wi-Fi 로 옮기기 (--off: Wi-Fi 끄기, 인자 없이: 지금 연결 보기)
sudo python3 usb_setup.py --watch  # (eduino-usb 서비스) USB 를 꽂으면 서명된 새 키트로 업데이트(kit_update.py)하고 eduino/wifi.txt 적용 — 설치는 USB 키트의 install.py
python3 agv_server.py              # 이동 로봇(myAGV 2023) 에서: 같은 화면 파일로 주행 콘솔 (--demo: 가짜 로봇)
sudo python3 autostart.py --agv    # myAGV 에서 자동 시작
```

- `static/` 은 저장소에 넣지 않습니다. `web-typescript/` 에서 `npm run build:robot` 으로 만듭니다.
- `kit_signing_public.pem` 은 USB 키트 서명을 확인하는 공개 키입니다 (`kit_update.py` 가 씀, 비밀 키는 저장소 밖).
  `VERSION` 은 저장소에 없고 `make_usb_kit.py` 가 키트를 만들 때 넣습니다 (`../README.md` 의 USB 키트 절).
- 화면은 배포 사이트와 같은 웹 앱입니다. `/api/state` 가 응답하면 로봇 모드로 바뀝니다
  (`web-typescript/src/engine/simulator/robotLink.ts`).

| 주소 | 내용 |
| --- | --- |
| `GET /api/state` | 로봇 ID(`robotId` = IP 마지막 숫자)·주소(`ips`), 연결, 실제 관절 각도, 읽은 지 몇 초(`age`), 실행 중인 줄·단계, 서보 풀림, 실행 번호(`run`), 카메라 유무 |
| `POST /api/run` | 시뮬레이션을 통과한 동작 목록 실행 (각도·그리퍼·기다리기) → `{ok, run}` |
| `POST /api/move` | 관절 이동 한 번 (제어판, 기본 자세로) |
| `POST /api/jog` | 부드러운 관절 조그: 로봇 자체의 연속 조그(`jog_angle`). 키를 누르고 있는 동안 0.2초마다 같은 요청이 오면 계속, 0.8초 끊기면·정지하면·한계 3° 앞이면 멈춤 |
| `POST /api/target` | 실시간 조그: 누르고 있는 동안 0.1초마다 오는 "조금 앞의 목표" 로 바로 이어서 움직임 (기다리지 않음). 지금 자세보다 15° 넘게 앞선 목표는 거절, 0.8초 동안 목표가 안 오면 스스로 정지 |
| `POST /api/stop` | 즉시 정지 |
| `POST /api/reconnect` | 로봇 포트를 닫고 다시 열어 각도를 읽어 봄 (팔 전원을 껐다 켰거나 케이블이 빠졌다 꽂혔을 때) |
| `POST /api/release`, `/api/focus` | 서보 풀기 / 고정 |
| `POST /api/joint` | 관절 하나만 서보 풀기 / 고정 (`release_servo` / `focus_servo`) — 관절별 영점 맞추기 |
| `POST /api/calibrate` | 영점: 풀어 둔 관절의 지금 위치(표시선을 맞춘 위치)를 0° 로 (`set_servo_calibration`) 한 뒤 다시 고정. 날짜는 `~/.robot_console_calibration.json` 에 저장 |
| `GET /api/arrivals` | 마지막 실행에서 동작마다 멈춘 뒤 잰 실제 각도 (반복 정밀도 계산용) |
| `GET /api/camera.jpg?cam=N` | N번 카메라 영상 (0부터, 640 px 폭 JPEG). `/api/state` 의 `cameras` = 찾은 카메라 수 |
| `POST /api/vision` | 공식 키트 색 인식(ArUco 보정 → HSV → 좌표)을 로봇 안에서 실행, 처리 시간 포함. `{"cam": N}` |
| `POST /api/vision/hand` | 손 카메라(카메라 플랜지): 공식 RDK X5 비전 키트의 색 인식 + 카메라 보정값(내부 행렬·왜곡·EyesInHand)과 로봇의 `get_coords` 로 블록 위치(로봇 좌표 mm). `{"cam": N, "planeZ": 블록 윗면 높이}` — 공식 코드의 고정 거리(230mm) 대신 광선을 블록 윗면 높이까지 따라가 받침대 위에서도 맞음 (`robot-python/tools/check_hand_camera.py` 로 왕복 0.1mm 확인) |
| `POST /api/ai` | AI 샘플(검수 6): YOLOv5s 물체 인식을 로봇 CPU 에서 OpenCV DNN 으로 (공식 yolo_demo 와 같은 기준값). 이름·점수·박스·처리 시간·표시한 사진. 모델은 `models/yolov5s.onnx` (USB 키트에 들어 있음) |
| `GET /api/selfcheck` | 검수 준비 점검: 팔 연결, 좌표 기준(로봇 ↔ 화면, 손 카메라 기준 회전), 카메라 수, OpenCV·ArUco, AI 모델, 펌프, 그리퍼, ROS 2 Humble·공식 패키지 |

안전 검사는 브라우저를 믿지 않고 서버에서 다시 합니다: 관절 한계, 속도 최대 50, 한 번에 한
프로그램, 움직이는 중 서보 풀기·영점 거부, 서보가 풀려 있지 않으면 영점 거부, 도착 시간 초과 시
정지, 펌프·펜·실린더 거부(핀 미확인).

한 번에 한 PC 만 움직입니다: 화면은 요청마다 `X-Console-Id` (탭마다 하나) · `X-Console-Name` (예: "3번 학생")
을 붙입니다. 움직이는 요청(run · move · jog · target · gripper · pump · calibrate · joint · release · focus)을
보낸 PC 가 실행 중일 때와 마지막 요청 · 실행이 끝난 뒤 15초 동안 로봇을 쥐고, 그동안 다른 PC 의 움직이는
요청은 `409` ("다른 PC(3번 학생)가 이 로봇을 움직이는 중이에요") 입니다. **정지는 누구든 언제나** 됩니다.
`/api/state` 의 `owner` = 지금 쥔 PC (`{id, name}` 또는 `null`), 화면은 이것으로 안내 띠를 보여 줍니다.
이름표가 없는 요청(스크립트)은 주소로 구분합니다. 시간은 `--owner-lease 초` 로 바꿀 수 있고,
점검은 `python3 robot-python/tools/check_robot_owner.py` (13개).

터미널에는 요청마다 한 줄씩 기록됩니다 (실행 시작·각 동작·`send_angles` 응답·거절·오류·영상처리).
