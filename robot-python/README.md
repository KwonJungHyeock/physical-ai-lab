# Python (로봇 쪽)

로봇(myCobot 280 RDK X5, myAGV) 쪽 파이썬 코드입니다. 표준 라이브러리와 공식 SDK `pymycobot` 만 씁니다.

| 폴더 | 내용 |
| --- | --- |
| `server/` | 로봇 안에서 도는 실습 콘솔 서버 — 로봇팔 `server.py` · myAGV `agv_server.py` · 카메라 · Wi-Fi · 자동 시작 (화면은 `web-typescript/` 에서 `npm run build:robot` → `server/static/`) |
| `checks/` | **테스트용.** 실제 로봇에서 실행하는 점검 스크립트 — `robot_check.py` · `network_check.py` · `pump_check.py` |
| `tools/` | 개발용 도구 — `convert_meshes.py` (공식 3D 모델을 웹용으로 변환) · `make_usb_kit.py` · `make_release.py` · `check_hand_camera.py` |
| `usb-kit/` | USB 키트 원본 — `install.py`, `설치하기.desktop`, `wifi.txt`, `읽어보세요.txt` (`tools/make_usb_kit.py` 가 묶음) |

로봇에 설치되면 `server/` 는 `robot_console.zip` 으로 묶여 로봇의 `~/robot_console/` 에 풀립니다
(이미 설치된 로봇과 맞추려고 로봇 쪽 이름은 그대로 둡니다).

실행 방법은 [`manuals/`](../manuals/) 의 안내서를 따르세요.
