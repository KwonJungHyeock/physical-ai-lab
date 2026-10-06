# Python (로봇 쪽)

로봇(myCobot 280 RDK X5, myAGV) 쪽 파이썬 코드입니다. 표준 라이브러리와 공식 SDK `pymycobot` 만 씁니다.

| 폴더 | 내용 |
| --- | --- |
| `server/` | 로봇 안에서 도는 실습 콘솔 서버 — 로봇팔 `server.py` · myAGV `agv_server.py` · 카메라 · Wi-Fi · 자동 시작 (화면은 `web-typescript/` 에서 `npm run build:robot` → `server/static/`) |
| `checks/` | **테스트용.** 실제 로봇에서 실행하는 점검 스크립트 — `robot_check.py` · `network_check.py` · `pump_check.py` |
| `tools/` | 개발용 도구 — `convert_meshes.py` (공식 3D 모델을 웹용으로 변환) · `make_usb_kit.py` · `make_release.py` · `check_hand_camera.py` · `check_usb_update.py` |
| `usb-kit/` | USB 키트 원본 — `install.py`, `설치하기.desktop`, `wifi.txt`, `읽어보세요.txt` (`tools/make_usb_kit.py` 가 묶음) |

로봇에 설치되면 `server/` 는 `robot_console.zip` 으로 묶여 로봇의 `~/robot_console/` 에 풀립니다
(이미 설치된 로봇과 맞추려고 로봇 쪽 이름은 그대로 둡니다).

## USB 키트 — 서명 · 버전 · 자동 업데이트

```bash
# web-typescript/ 에서 npm run build:robot 한 뒤
EDUINO_SIGNING_KEY=~/keys/eduino-kit-signing.pem python3 robot-python/tools/make_usb_kit.py -o dist
python3 robot-python/tools/make_usb_kit.py --key ~/keys/eduino-kit-signing.pem -o dist   # 같은 것
python3 robot-python/tools/check_usb_update.py   # 자동 업데이트 자체 시험 (로봇 없이, openssl 필요)
```

- **버전**: `make_usb_kit.py` 가 `robot_console.zip` 안에 `robot_console/VERSION` 을 넣습니다 —
  `YYYYMMDD-HHMMSS-<git 짧은 해시>` (UTC 빌드 시각이라 글자 순서 = 시간 순서, 커밋 안 한 변경이 있으면 `-dirty`).
  `install.py` 가 풀면 로봇의 `~/robot_console/VERSION` 에 남습니다.
- **서명**: 비밀 키(Ed25519, PEM)를 환경 변수 `EDUINO_SIGNING_KEY` 나 `--key` 로 주면 `robot_console.zip.sig`
  (zip 바이트 전체의 서명, `openssl pkeyutl -sign -rawin`, OpenSSL 3)를 옆에 만듭니다.
  비밀 키는 **저장소 밖**에 둡니다 (저장소 안의 키는 거부, `.gitignore` 에도 막아 둠). 짝인 공개 키는
  `server/kit_signing_public.pem` 이고, 다른 키로 서명하려 하면 만들지 않습니다.
  키를 주지 않으면 경고와 함께 서명 없는 키트를 만듭니다 — 처음 설치는 되지만 로봇이 스스로 업데이트하지는 않아요.
- **자동 업데이트** (`server/kit_update.py`, `eduino-usb` 서비스의 `usb_setup.py` 가 부름): USB 를 꽂으면
  (전원을 켤 때 꽂혀 있던 USB 도) `eduino/` 폴더를 USB 맨 위와 그 아래 두 단계까지에서 찾고(여럿이면 키트 버전이
  가장 새것, 없으면 wifi.txt 가 가장 최근인 것), 키트가 로봇보다 새것이면:
  zip·서명을 로봇으로 복사 → 로봇에 있는 공개 키로 서명 확인 → `~/robot_console.new` 에 풀고 `py_compile` →
  `robot-console` 정지 → 지금 폴더는 `~/robot_console.prev`, 새 폴더가 `~/robot_console` → 시작 →
  `GET /api/state` 가 30초 안에 대답하는지 확인. 어디서든 실패하면 `.prev` 를 되돌리고 다시 시작합니다.
  키트에 없는 사람 파일(`*.py`·`static/` 밖)은 새 폴더로 옮기고, `~/.robot_console_calibration.json` 은 건드리지 않습니다.
  그다음 `wifi.txt` 를 전과 같이 적용하고, 무언가 했으면 로봇이 한 번 끄덕입니다.
  결과 파일 `result-<로봇>.txt` 에 `버전: 이전 → 지금` 과 `업데이트: 성공 / 이미 최신 / 서명 없음·잘못됨 /
  실패 → 이전 버전으로 되돌림 (이유)` 가 더해집니다. 서명이 없거나 틀리면, 또 로봇에 `openssl` 이 없으면
  USB 의 코드는 절대 쓰지 않습니다. `usb_setup.py` 자신이 바뀌면 끝에 `systemctl restart --no-block eduino-usb`.
- 이 기능이 생기기 전에 설치한 로봇은 새 키트로 `install.py` 를 한 번 더 실행해야 그 뒤로 스스로 업데이트합니다.

실행 방법은 [`manuals/`](../manuals/) 의 안내서를 따르세요.
