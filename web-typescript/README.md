# 웹 앱 (TypeScript · Next.js)

Physical AI Lab 의 웹 부분입니다. 저장소 전체 구성은 [루트 README](../README.md)를 보세요.

- **주력 대상**: myCobot 280 **RDK X5** (보고 #5, `docs/reports/education/05-on-robot-plan.md`).
- **들어 있는 것**
  - `/console` — **로봇팔 실습 콘솔**. RDK X5 공식 3D 모델 + **AI 로봇 확장 키트**(공식 키트 모델·코드·
    사진으로 맞춘 받침판, 보정판과 ArUco 마커, 분류함 A~D, 카메라 거치대), 엔드이펙터 7종 + 카메라
    플랜지 교체, 단계 3개(초급 블록 코딩 / 중급 파이썬 pymycobot / 고급 ROS 2 rclpy) + 모든 단계의 직접 움직이기,
    키트 카메라·손 카메라 화면과 공식 방식 영상 처리
    화면, 시뮬레이션 통과 후 로봇용 pymycobot 코드 생성. 설계 원본은 `docs/mockup/edu-console.html`.
  - `/spike/twin` — 디지털 트윈 (URDF 파싱, FK·IK 학습용). M5 URDF 기준.
  - `/spike/serial`, `/spike/diag` — 280 AR(M5) 용 Web Serial 스파이크. RDK X5 전환으로 **보류**.
- **스택**: Next.js (App Router) + TypeScript + Tailwind CSS(홈) / CSS Module(콘솔) +
  react-three-fiber.

## 페이지

| 경로 | 내용 |
| --- | --- |
| `/` | 시작 화면 |
| `/console` | 로봇팔 실습 콘솔 (아래 "콘솔 구조") |
| `/spike/twin` | 디지털 트윈 뷰어. URDF 파싱, 6축 조작, 관절 로컬 좌표축, 순기구학, 수치해석 역기구학, 작업영역·바닥 경고 |
| `/spike/serial` | Web Serial 브리지 (보류) |
| `/spike/diag` | Web Serial 환경 진단 (보류) |

## 폴더 구성 (파트별)

```
src/
  app/                    페이지 (Next.js 경로) — / · /console · /agv · /figures/[id] · /materials/[doc] · /spike/*
  ui/                     화면 (React · react-three-fiber)
    simulator/            [시뮬레이터] 탭과 콘솔 전체 — Console.tsx(전체) · TopBar · console.module.css
      stage/              3D 무대: Stage · StageTools(시점·작은 카메라) · CameraViews · robotModel · sceneHelpers · StudioLight
      editors/            블록 편집기 · 코드 편집기 · PyPanel(파이썬·ROS 2 편집과 출력)
      control/            직접 움직이기: ControlPanel · ZeroPanel(영점) · RobotStatus · PartsPanel · jointInfo · ToolIcon
      connect/            로봇 연결: ConnectDialog · ModelPicker · WifiPanel · usePcApp(PC 앱 설치)
      tasks/              실습 · 미션: TaskChip · TaskIcon · MissionCard · RunBar
      pages/              [실습 라이브러리] · [자료실] 탭
    education/            [교육] 탭 — LearnView.tsx(전체) · learn.module.css · widgets · lessons
      roadmap/            첫 화면 (로드맵 · 단원 카드 · 장비 선택)
      lesson/             수업 쪽: TheoryPager(도입 · 개념 · 활동 · 정리 · 평가) · Rich(기호 · 용어) · QuickCheck · TopicArt
      stage/              실습 3D 무대 · 제어판 오버레이
      topics/             차시별 실습 화면 — 학문별 폴더 1-basics … 8-learning, 공용 kit · gcam · types
      fig/                주제 그림 28점 (f1 … f8 = 학문)
      print/              자료실 인쇄용 문서 (PDF)
      lab/                문제 해결 실습 (시범) — 컨베이어 공정 문제 3개: LabView(화면) · LabBar · LabPanel · ConveyorCell(3D) · Timeline
    agv/                  이동 로봇(myAGV) 콘솔
    twin/                 디지털 트윈 (스파이크)
  engine/                 화면 없는 로직 (React 없음, three.js 수학 · Rapier 만 사용) — 그대로 옮겨 쓸 수 있음
    robot/                URDF · 순/역기구학 · 동작 시간 계획 · 도구 방향 IK · 관절 한계 · 자기 충돌 · 모델 목록(arms · catalog)
    physics/              교육용 계산: 자코비안 · 동역학 · 물리(Rapier) · 충돌 · 경로 계획 · 작업 공간 · 선형대수
    simulator/            시뮬레이터 로직: 월드 · 프로그램 · 실습 목록 · 데모 · 작업대 · 로봇 통신 · 키트 배치 · 내보내기
    python/               파이썬 실행 (Pyodide 웹 워커, 가짜 pymycobot · rclpy)
    vision/               영상 처리 (색 · 마커 · 추적)
    education/            교육 데이터: 원고 생성물(curriculum.gen.ts) · 카탈로그 · 로드맵 · 용어 · 기호 · 문항 · 자료실 목록
      lab/                문제 해결 실습: 공정 배치(cell) · 시간 단위 실행(run: 벨트 · 센서 · 궤적 · 충돌) · 문제 3개(problems) · 글(chapter)
    agv/                  myAGV 시뮬레이터 · 서버 통신
    serial/               myCobot 시리얼 프로토콜 (Web Serial)
  types/                  Web Serial 타입
tests/                    자동 검증 (npm run check)
  robot/                  프로토콜 · 송수신 · 기구학 · 모델 · 추적
  simulator/              콘솔 · 자기 충돌 · 실습 예제 · 데모 · 파이썬 실행
  agv/                    myAGV
  education/              교육 계산(physics) · 원고 형식(content) · 문제 해결 실습(lab) · sim/ 원고대로 눌러 볼 시나리오
tools/
  build/                  만들기: 원고 → 앱 데이터, 자료실 PDF, 그림 GIF, 로봇용 화면, Pyodide 복사, 서비스 워커, 매뉴얼 PDF
  check/                  브라우저 검사: 그림 정렬 · 쏠림(figures), 교육 화면(learn-ui), 원고 대조 · 시연 GIF(learn-sim)
public/                   3D 모델(robot/) · Draco · 아이콘 · 브랜드 · 교육 그림·GIF(education/) · 자료실 PDF(materials/) · 실습 라이브러리 GIF(library/)
```

### 주요 파일

| 파일 | 역할 |
| --- | --- |
| `src/engine/robot/kinematics.ts` | URDF 기반 FK, DLS IK |
| `src/engine/robot/tool.ts` | "도구가 아래를 향한 채" 목표점에 가는 IK (집기·놓기·누르기·그리기 공통) |
| `src/engine/robot/motion.ts` | 5차(최소 저크) 시간 스케일링, 관절 동기 이동, 직선 이동 경로 |
| `src/engine/simulator/board.ts` | AI 키트 배치 (로봇 좌표, mm) — 숫자마다 출처([M] 공식 모델, [C] 공식 코드, [P] 공식 사진, [E] 추정) |
| `src/engine/simulator/sim.ts` | 시뮬레이터: 월드 상태, 블록 프로그램 실행, 파이썬 명령 목록 재생, 충돌 검사, 미션 판정 |
| `src/engine/simulator/practices.ts` · `practicesPy.ts` | 단계(초급·중급·고급)와 실습 목록, 예제 프로그램, 진행 판정 |
| `src/engine/simulator/robotLink.ts` | 로봇 안 서버(`robot-python/server/server.py`)와 통신 |
| `src/engine/education/curriculum.gen.ts` | `content-markdown/*.md` 에서 만든 교육 데이터 (`npm run gen:curriculum`, 손대지 말 것) |
| `src/ui/education/topics/index.ts` | 차시 번호(N-M) → 실습 화면 |

## 실행

```bash
cd web-typescript
npm install
npm run dev          # http://localhost:3000
```

Web Serial 은 **secure context** (HTTPS 또는 `http://localhost`) 에서만 동작하고, **Chromium
계열 데스크톱 브라우저** (Chrome, Edge, Whale, Opera) 에서만 지원됩니다. Firefox, Safari,
모바일 브라우저는 지원하지 않습니다.

### 자동 검증 (`tests/`) · 도구 (`tools/`)

`web-typescript/` 폴더에서 실행합니다.

```bash
npm run check             # 아래를 모두 실행
npm run check:protocol    # tests/robot     — 프레임 생성 결과를 pymycobot 출력과 바이트 단위로 비교
npm run check:transport   # tests/robot     — 에뮬레이트한 ATOM 컨트롤러 상대로 송수신 계층 통합 검증
npm run check:kinematics  # tests/robot     — URDF 파싱 / FK / 자코비안 / IK 수렴률
npm run check:track       # tests/robot     — 영상 추적
npm run check:console     # tests/simulator — 공식 키트 자료 대조, 작업점 도달, 프로그램 언어, 분류 미션, 영상 처리
npm run check:practice    # tests/simulator — 모든 실습 예제가 시뮬레이터에서 목표 달성
npm run check:python      # tests/simulator — 중급·고급 파이썬 실행
npm run check:agv         # tests/agv       — myAGV 주행 · 충돌 · 라이다 · 직진 보정
npm run check:robotics    # tests/education — 교육용 계산 (자코비안 · 동역학 · 경로 계획)
npm run check:learn       # tests/education — 교육 원고 형식 · 기호 · 문항 · 그림 · GIF
npm run check:lab         # tests/education — 문제 해결 실습: 처음 값은 실패, 고친 값은 통과 (문제 3개)
npm run gen:curriculum    # tools/build     — 원고 md → src/engine/education/curriculum.gen.ts
npm run lint
npm run build
npm run build:robot       # tools/build     — 로봇용 정적 화면 → ../robot-python/server/static
```

개발 서버(`npm run dev`)를 켠 채로 쓰는 도구:

```bash
node tools/build/materials.mjs          # 자료실 PDF 26
node tools/build/figure-gifs.mjs        # 그림 GIF 28 (FFMPEG=…)
node tools/check/figures.mjs [5-2 …]    # 그림: 글자 정렬 · 겹침 · 넘침 · 쏠림 · 빈 곳
node tools/check/learn-ui.mjs [1-1 …]   # 교육 화면: 잘림 · 넘침 · 가운데 정렬
npx tsx tools/check/learn-sim.mjs [--clips]   # 원고대로 눌러 결과 숫자 대조, 시연 GIF
```

## 프로토콜 출처 (Protocol provenance)

시리얼 프로토콜은 **추정하지 않고** Elephant Robotics 공식 Python SDK `pymycobot` **4.0.6**
(PyPI `pymycobot-4.0.6-py3-none-any.whl`) 소스에서 추출했습니다. 상수·인자 순서·응답 해석은
모두 아래 파일을 근거로 하며, 개별 근거는 `src/engine/serial/protocol.ts` 와 `client.ts` 주석에
함수 단위로 남겨 두었습니다.

| SDK 파일 | 사용한 내용 |
| --- | --- |
| `pymycobot/common.py` | `class ProtocolCode` (opcode, HEADER/FOOTER), `DataProcessor._mesg` (프레임 구성), `_process_received` (응답 파싱), `_encode_int16`/`_angle2int` (값 인코딩), 모듈 함수 `read()` (타임아웃) |
| `pymycobot/generate.py` | `CommandGenerator` — 각 명령의 인자 순서와 `has_reply` 여부 |
| `pymycobot/mycobot280.py` | `MyCobot280` — 시리얼 파라미터, `_res` 재시도 로직, 응답 후처리, 그리퍼 명령 |
| `pymycobot/robot_info.py` | `robot_limit["MyCobot280"]` — 관절 가동 범위 |

### 프레임 구조

```
+------+------+-----+--------+-------------------+------+
| 0xFE | 0xFE | LEN | OPCODE | PAYLOAD (LEN - 2) | 0xFA |
+------+------+-----+--------+-------------------+------+
  [0]    [1]   [2]    [3]      [4 .. ]             last
```

`LEN = payload 길이 + 2` (opcode 와 footer 를 포함, header 2바이트와 자기 자신은 제외).
따라서 전체 프레임 길이는 `LEN + 3` 입니다.
근거: `DataProcessor._mesg` 의 `LEN = len(command_data) + 2` 및 `_process_received` 의
`data_len = data[header_i + 2] - 2`, `data_pos = header_i + 4`.

> CRC-16 트레일러를 쓰는 변형이 SDK 에 있지만, 그것은 `DataProcessor.crc_robot_class`
> (Mercury / Pro 시리즈) 전용입니다. `MyCobot280` 은 해당 목록에 없으므로 **0xFA footer** 를
> 사용합니다.

**0xFA 는 이스케이프되지 않습니다.** payload 바이트가 footer 값과 같을 수 있으므로 (예:
그리퍼 release 는 `FE FE 04 66 FE 32 FA`), 파서는 반드시 LEN 기반으로 잘라야 하며 0xFA 를
스캔하면 안 됩니다. `npm run check:protocol` 이 이 경우를 회귀 검증합니다.

### 구현한 명령

| 기능 | opcode | 프레임 예시 | SDK 근거 |
| --- | --- | --- | --- |
| 컨트롤러 연결 확인 | `0x14` | `FE FE 02 14 FA` | `generate.py::is_controller_connected` |
| 전원 ON | `0x10` | `FE FE 02 10 FA` | `generate.py::power_on` |
| 전원 OFF | `0x11` | `FE FE 02 11 FA` | `generate.py::power_off` |
| 전원 상태 | `0x12` | `FE FE 02 12 FA` | `generate.py::is_power_on` |
| 서보 해제 | `0x13` | `FE FE 02 13 FA` | `generate.py::release_all_servos` |
| 관절각 읽기 (6축) | `0x20` | `FE FE 02 20 FA` | `generate.py::get_angles` |
| 관절각 쓰기 (6축 + 속도) | `0x22` | `FE FE 0F 22 <6×int16BE> <speed> FA` | `generate.py::send_angles` |
| 관절각 쓰기 (단일축) | `0x21` | `FE FE 06 21 <id> <int16BE> <speed> FA` | `generate.py::send_angle` |
| 그리퍼 개폐 | `0x66` | `FE FE 04 66 <flag> <speed> FA` | `mycobot280.py::set_gripper_state` |
| 그리퍼 값 읽기 | `0x65` | `FE FE 02 65 FA` | `mycobot280.py::get_gripper_value` |

- 각도는 **부호 있는 big-endian int16, 1/100도 단위**입니다
  (`_angle2int` = `int(angle * 100)`, `_encode_int16` = `struct.pack(">h", …)`).
- 그리퍼 `flag`: `0` 열기 / `1` 닫기 / `254` 해제 (`set_gripper_state` docstring).
- 속도는 `1 ~ 100` (`send_angles` docstring), 그리퍼 속도는 `0 ~ 100`.
- 관절 가동 범위는 `src/engine/robot/limits.ts` 단일 상수 모듈에 있습니다 (아래 참조).

### 시리얼 파라미터와 타이밍

`src/engine/serial/transport.ts` 는 요청을 **직렬화**합니다. ATOM 은 한 번에 하나의 명령만 처리하므로, 슬라이더
전송과 200ms 폴링이 겹쳐도 프레임이 섞이지 않습니다.

모두 SDK 에서 확인된 값이며 임의로 정한 값은 없습니다.

| 항목 | 값 | 근거 |
| --- | --- | --- |
| baudrate | `115200`, 8N1 | `MyCobot280.__init__(port, baudrate="115200", …)` |
| RTS / DTR | de-assert | `self._serial_port.rts = False` (ESP32 auto-reset 라인) |
| 포트 오픈 후 대기 | `1500 ms` | `time.sleep(1.5)  # use to 280 AR` — ATOM 이 리셋 후 부팅을 마칠 때까지 |
| 응답 타임아웃 | `500 ms` | `read()`: Windows `0.15`, 그 외 `0.5`. 브라우저에서는 호스트 OS 를 신뢰할 수 없어 **둘 중 큰 값**을 사용 |
| 재시도 | `3회` | `MyCobot280._res` 의 `while try_count < 3` |
| 요청 직전 입력 버퍼 비움 | 매 시도마다 | `MyCobot280._res` 의 `self._serial_port.reset_input_buffer()` |

## 관절 가동범위 — 채택 근거

세 출처가 서로 다릅니다. **축별로 가장 좁은 값**을 채택했습니다. 한계가 너무 좁으면 도달
가능한 자세를 거부할 뿐이지만, 너무 넓으면 하드웨어가 거부하거나 걸리는 자세를 명령하게 됩니다.

| 축 | pymycobot `robot_limit["MyCobot280"]` | 데이터시트 | URDF `<limit>` | **채택** |
| --- | --- | --- | --- | --- |
| J1 | ±168 | ±168 | ±168.0 | **±168** |
| J2 | ±140 | ±135 | ±140.0 | **±135** (데이터시트) |
| J3 | ±150 | ±150 | ±150.0 | **±150** |
| J4 | ±150 | ±145 | ±150.0 | **±145** (데이터시트) |
| J5 | −155~160 | ±165 | −155.0~160.0 | **−155~160** (SDK·URDF) |
| J6 | ±180 | ±180 | ±180.0 | **±180** |

- J5 의 **비대칭**은 SDK 와 URDF 가 독립적으로 일치하므로 오타가 아닙니다. 대칭으로 정리하지
  마세요.
- 채택 벡터는 SDK 의 `robot_limit["MyCobot280RDK-X5"]` 항목과 정확히 같습니다. SDK 가 형제
  모델용으로 이미 이 교집합을 배포하고 있다는 뜻이라, 임의로 만든 값이 아니라는 방증입니다.

### 도달거리 측정 기준점

URDF 를 관절한계 내 무작위 자세 200,000회로 훑으면 어깨(J1 축 원점) 기준 최대 거리는

- **손목(J6 프레임) 기준 287mm**
- **플랜지(joint6_flange) 기준 302mm**

데이터시트의 작업반경 280mm 는 **손목 중심 기준**입니다 (287 vs 280 은 모델명 반올림 범위).
URDF 와 데이터시트는 일치합니다. **맞추기 위해 조정한 값은 없습니다.**

> 정정: 이전 판의 "플랜지 332.5mm" 는 URDF `rpy` 를 잘못된 순서(Rx·Ry·Rz)로 곱해서 나온
> 값이었습니다. URDF 규약은 Rz(yaw)·Ry(pitch)·Rx(roll) 이고, 고친 뒤 0° 자세에서 팔이 실제
> 로봇처럼 곧게 섭니다 (보고 #6). 손목 기준 287mm 는 순서와 무관해 바뀌지 않았습니다.

## 3D 모델 (URDF / 메시)

- 출처: Elephant Robotics `mycobot_ros` 의 `mycobot_description` 패키지, `mycobot_280_m5` 변형.
- **라이선스: BSD 2-Clause** (Copyright © 2020 Elephant Robotics). 상용 교육 제품에 재배포
  가능하며, 저작권 고지·조건·면책조항을 유지해야 합니다 →
  `public/robot/mycobot280/LICENSE`, `public/robot/mycobot280/ATTRIBUTION.md`.
  상표권은 부여되지 않으므로 Elephant Robotics 의 보증을 암시해서는 안 됩니다.
- 변환: Collada 8개(20.1MB) → 단일 GLB, 링크당 노드 1개 → Draco 압축 = **238KB**.
  재현 스크립트: `robot-python/tools/convert_meshes.py` (저장소 루트 기준).
- `G_base.dae` 만 `<unit meter="0.001">` (밀리미터), 나머지는 미터입니다. 이 태그를 무시하는
  Collada 리더(trimesh 포함)는 베이스를 1000배로 읽습니다 — 변환 시 반영했습니다.
- Draco 디코더는 `public/draco/` 에 자체 호스팅합니다. 외부 CDN 요청이 없어 차단된 학교
  네트워크와 오프라인 교실에서도 동작합니다.

## 기구학

- **FK**: URDF 의 `<origin xyz rpy>` 를 그대로 누적합니다. DH 파라미터를 재유도하지 않습니다 —
  URDF 가 이미 부모→관절 변환을 명시하므로 DH 로 옮기면 동기화할 숫자가 하나 더 늘 뿐입니다.
- **IK**: 자코비안 기반 **Damped Least Squares** (수치해석). myCobot 280 은 손목 3축이 한 점에서
  만나지 않아 구면손목이 아니고, 닫힌 해가 안정적이지 않습니다.
  - 관절 한계에 눌린 관절은 자코비안 열을 0으로 만들어 **잠급니다**(active-set). 단순 클램프만
    쓰면 나머지 관절이 보상하지 못해 국소 최소점에 갇힙니다.
  - 실패 시 목표 좌표로 시드한 결정론적 PRNG 로 **다른 시드에서 재시작**합니다. 같은 목표는
    항상 같은 해를 주므로 화면이 해 사이를 오가지 않습니다.
  - 도달 불가 시 임의로 근사값을 반환하지 않고 `converged: false` 로 명시합니다.

## 현재 검증 상태

- 프레임 생성 13종이 pymycobot 4.0.6 이 만들어내는 바이트열과 **정확히 일치**함을 자동 검증.
- 에뮬레이트한 ATOM 컨트롤러 상대로 왕복 통신, 1바이트 단위 분할 수신, 에코 프레임 무시,
  타임아웃 후 재시도, 동시 호출 직렬화, hex 로그를 자동 검증.
- URDF 파싱·FK·IK 를 실제 배포 URDF 로 자동 검증. 해석적 자코비안을 유한차분과 대조해 최대
  상대오차 0.0001%. 도달 가능한 임의 목표 100개에 대해 IK **100/100 수렴**, 평균 1.34ms.
- **실기기 연결은 아직 검증되지 않았습니다.** 실기기 응답이 위 문서와 다르면 임의로 보정하지
  말고, `/spike/serial` 의 hex 로그를 그대로 복사해 보고해 주세요.

## 학교 관리 PC 대응

`/spike/diag` 가 원인을 판정합니다. 자주 나오는 경우:

- **`navigator.serial` 없음 + Chromium 계열** → 그룹 정책 차단.
  `chrome://policy` 에서 `DefaultWebSerialGuardSetting` / `WebSerialBlockedForUrls` 확인 후
  관리자에게 해제 요청.
- **secure context 아님** → HTTPS 로 접속. Vercel 배포 주소는 기본이 HTTPS 입니다.
- **포트 목록에 장치가 안 보임 (Windows)** → USB-UART 브리지 드라이버 필요.
  M5Stack ATOM 은 생산 시기에 따라 **CP210x** 또는 **CH9102** 를 사용하므로 장치관리자에서
  확인 후 해당 드라이버를 설치해야 합니다. macOS 12+ / ChromeOS / 최신 Linux 커널은 기본 내장.

## 아직 하지 않은 것

- 실기기 ↔ 시뮬 동기화. Web Serial 스파이크가 실기기로 확정되기 전까지는 의도적으로 열지
  않습니다.
- 물리엔진, 정밀 자기충돌 판정, Blockly/코드 에디터, 차시 콘텐츠, DB/인증.

## 배포

웹 앱이 저장소의 `web-typescript/` 폴더에 있으므로 Vercel 프로젝트 설정에서
**Root Directory 를 `web-typescript`** 으로 지정합니다 (Settings → Build and Deployment → Root Directory).
그 외 설정은 필요 없습니다 (프레임워크 자동 감지, 환경변수 없음, 모든 페이지 정적 프리렌더).
