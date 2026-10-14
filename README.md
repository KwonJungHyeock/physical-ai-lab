# Physical AI Lab — 인계 안내

피지컬 AI 로봇팔 학습 프로그램 — myCobot 280 RDK X5 를 한국어로, 초급 블록 코딩 · 중급 파이썬(pymycobot) ·
고급 ROS 2 의 3단계와 로봇공학 8단원 · 28차시로 배웁니다. 모든 프로그램은 브라우저 안 시뮬레이터를 통과한 뒤 실제 로봇에서 실행합니다.

이 문서는 다른 웹 플랫폼으로 옮겨 붙일 개발자를 위한 안내입니다. 폴더는 **언어 → 파트 → 갈래** 순으로 나눴습니다.

## 폴더 구성

```
physical-ai-lab/
├─ README.md               이 문서
├─ web-typescript/         웹 앱 (TypeScript · Next.js 16 · React 19) — 옮겨 갈 대상
│  ├─ src/app/             페이지 (Next.js 경로): / · /console · /agv · /figures/[id] · /materials/[doc] · /spike/parts (도구 썸네일 만들기용)
│  ├─ src/ui/simulator/    [시뮬레이터] 탭과 콘솔 전체 — stage/ editors/ control/ connect/ tasks/ pages/
│  ├─ src/ui/education/    [교육] 탭 — roadmap/ lesson/ stage/ topics/ fig/ print/ lab/(문제 해결 실습 · 시범)
│  ├─ src/ui/agv/          이동 로봇(myAGV) 콘솔 화면
│  ├─ src/engine/          화면 없는 로직 (React 없음) — 그대로 옮겨 쓸 수 있음
│  │  ├─ robot/            URDF · 순/역기구학 · 동작 계획 · 관절 한계 · 자기 충돌 · 로봇 모델 목록
│  │  ├─ physics/          자코비안 · 동역학 · 경로 계획 · 충돌 · Rapier 월드 · 작업 공간 · 선형대수
│  │  ├─ simulator/        시뮬레이터 실행기 · 블록 프로그램 · 실습 · 데모 · 작업대 · 로봇 서버 통신
│  │  ├─ python/           Pyodide 웹 워커 · 가짜 pymycobot / rclpy
│  │  ├─ education/        교육 데이터 (curriculum.gen.ts · 카탈로그 · 로드맵 · 문항 · 용어 · 자료실 목록)
│  │  ├─ vision/           색 · 마커 인식, 손 카메라 추적
│  │  ├─ agv/              myAGV 시뮬레이터 · 서버 통신
│  │  └─ serial/           myCobot 시리얼 프로토콜 (Web Serial, 보류 중인 스파이크용)
│  ├─ public/              정적 파일 (아래 "정적 파일" 표)
│  ├─ tests/               자동 검증 `npm run check` — robot/ simulator/ agv/ education/
│  └─ tools/               build/ (데이터 · PDF · GIF · 로봇용 화면 만들기), check/ (브라우저 검사)
├─ robot-python/           로봇 쪽 (Python · 표준 라이브러리 + pymycobot)
│  ├─ server/              로봇 안에서 도는 서버 — 로봇팔 server.py · myAGV agv_server.py · 카메라 · Wi-Fi · 자동 시작
│  ├─ checks/              실제 로봇(RDK X5)에서 돌리는 점검 — 로봇 · 네트워크 · 펌프
│  ├─ tools/               개발 도구 — 3D 모델 변환, USB 키트 · 배포 묶음 만들기, 손 카메라 왕복 검사
│  └─ usb-kit/             USB 키트 원본 — install.py · 설치하기.desktop · wifi.txt · 읽어보세요.txt
├─ desktop-go/             Windows 시뮬레이터 exe (Go) — 웹 앱 정적 빌드를 통째로 품은 프로그램 하나
├─ content-markdown/       교육 원고 (한국어 md 8개 + reference/) — 앱의 [교육] 탭과 자료실 PDF 가 읽음
├─ docs/                   보고서 reports/<갈래>/ · 화면 목업 mockup/ (한국어)
└─ manuals/                사람이 따라 하는 안내서 (한국어) · 배포용 PDF 2종
```

자세한 웹 앱 구성 · 프로토콜 근거는 [`web-typescript/README.md`](web-typescript/README.md), 로봇 쪽은
[`robot-python/README.md`](robot-python/README.md), 보고서 목록은 [`docs/README.md`](docs/README.md),
안내서 목록은 [`manuals/README.md`](manuals/README.md) 에 있습니다.

## 실행 · 검사 · 빌드

Node.js 22, Go 1.24+, Python 3 이 필요합니다. 웹 명령은 모두 `web-typescript/` 에서 실행합니다.

```bash
cd web-typescript
npm install
npm run dev               # http://localhost:3000/console  (predev: Pyodide 복사 + 서비스 워커 생성)

# 검사
npx next typegen          # 경로 타입(PageProps 등) 생성 — tsc 단독 실행 전에 한 번
npx tsc --noEmit
npx eslint src tools tests
npm run check             # tests/ 전체 (프로토콜 · 기구학 · 시뮬레이터 · 실습 · 파이썬 · myAGV · 교육 원고)

# 개발 서버를 켠 채로 (Playwright + 시스템 Chromium)
BASE=http://localhost:3000 node tools/check/learn-ui.mjs               # 교육 화면 잘림 · 넘침 · 정렬
BASE=http://localhost:3000 npx tsx tools/check/learn-sim.mjs 1-4 6-2   # 원고대로 눌러 결과 숫자 대조 (느린 PC 는 SLOW=4)

# 빌드
npm run build             # 일반 Next.js 빌드 (Vercel 등: Root Directory = web-typescript)
npm run build:robot       # 정적 내보내기 → ../robot-python/server/static/ (로봇 서버 · exe 가 쓰는 화면)
npm run gen:curriculum    # content-markdown/*.md → src/engine/education/curriculum.gen.ts (생성물, 손대지 않음)
```

```bash
export EDUINO_SIGNING_KEY=~/keys/eduino-kit-signing.pem   # USB 키트 서명용 비밀 키 (저장소 밖, 없으면 서명 없는 키트)
sh desktop-go/build.sh                              # build:robot 후 desktop-go/dist/PhysicalAI-Simulator.zip (exe + 읽어보세요),
                                                    #   키가 있으면 서명된 로봇 키트를 exe 에 넣음 (⚙ → 로봇 USB 만들기)
python3 robot-python/tools/make_usb_kit.py -o dist  # dist/eduino_usb.zip (USB 키트) · dist/robot_console.zip (+ .sig)
python3 robot-python/tools/make_release.py -o dist  # 배포 묶음: exe · USB · 매뉴얼 PDF · 수업 자료 PDF
python3 -m compileall robot-python                  # 파이썬 문법 검사
python3 robot-python/tools/check_hand_camera.py     # 손 카메라 좌표 왕복 (OpenCV · numpy, 로봇 없이)
python3 robot-python/tools/check_usb_update.py      # USB 자동 업데이트 자체 시험 (로봇 없이, openssl 필요)
```

**로봇에 올리기**: USB 키트의 `eduino/` 폴더를 USB 에 복사 → 로봇에 꽂고 로봇 터미널에서 한 줄
`sudo python3 "$(find /media /mnt -maxdepth 6 -path '*eduino/install.py' 2>/dev/null | head -1)"`
(FAT USB 의 파일에는 실행 권한이 없어 `설치하기` 를 더블클릭하면 로봇에 따라 글자 편집기로 열립니다).
`install.py` 는 `robot_console.zip` 을 로봇의 `~/robot_console/` 에 풀고(`VERSION` 포함), `autostart.py` 로 systemd 서비스
`robot-console` 을, 그리고 USB 감시 서비스 `eduino-usb` 를 설치한 뒤 `wifi.txt` 를 적용합니다.
그 뒤로는 USB 를 꽂기만 하면 됩니다: `wifi.txt` 가 바뀌었으면 적용하고, 서명된 키트(`robot_console.zip.sig`)의
`VERSION` 이 로봇보다 새것이면 로봇이 스스로 업데이트합니다 (실패하면 이전 버전으로 되돌림, 결과 파일에 버전 · 결과).
서명 키 · 버전 · 업데이트 순서는 [`robot-python/README.md`](robot-python/README.md).
로봇 쪽 이름 `~/robot_console` · `robot-console` · `eduino-usb` 는 이미 설치된 로봇과 맞추려고 그대로 둡니다.
손으로 할 때는 [`manuals/setup/usb-kit.md`](manuals/setup/usb-kit.md), [`manuals/robot-arm/robot-console.md`](manuals/robot-arm/robot-console.md).
로봇 없이 서버 시험: `cd robot-python/server && python3 server.py --demo` → `http://localhost:8080/console`.

## 이식할 때 알아 둘 것

### 코드 갈래
- **`src/engine/`** — 프레임워크 없는 TypeScript. React · Next.js · DOM 화면 코드를 쓰지 않아 그대로 옮깁니다.
  외부 의존은 `three` 의 수학 클래스(Vector3 · Matrix4 · Quaternion · Euler)와 `physics/physics.ts` 의
  `@dimforge/rapier3d-compat` 뿐입니다. 브라우저 API 는 `fetch`(로봇 서버), `Worker`(python/), `localStorage`
  (education/wrong.ts · simulator/evidence.ts · simulator/modules.ts) 를 씁니다. `tests/` 는 주로 이 갈래를 Node(tsx)에서 바로 돌립니다.
- **`src/ui/`** — React 19 + react-three-fiber 9 / drei 10 / postprocessing, three.js 0.185, Rapier 0.21(WebAssembly).
  CSS Module(`*.module.css`), 화면 컴포넌트는 `'use client'`. Next.js 에 묶인 곳은 `next/link`(TopBar · AgvConsole),
  `next/dynamic`(3D 무대를 SSR 없이 늦게 불러오기, Console.tsx), `next/navigation` 의 `useRouter`(Console → /agv) 뿐입니다.
- **Python 편집기** — npm `pyodide`(314.0.x)를 `tools/build/copy-pyodide.mjs` 가 `public/pyodide/` 로 복사하고, 웹 워커
  (`engine/python/worker.ts`)가 같은 사이트의 `/pyodide/` 에서 불러옵니다 (외부 CDN 없음).
  가짜 `pymycobot` · `rclpy` · `Hobot.GPIO` 모듈은 `engine/python/pylib.ts` 의 파이썬 원본입니다.

### Next.js 정적 내보내기
- `next.config.ts`: `ROBOT_EXPORT=1` 일 때만 `output: 'export'`, `distDir: '.next-robot'` (`npm run build:robot` 이 켬).
  로봇에는 Node.js 가 없어 정적 파일만 씁니다. 그 밖(개발 서버, Vercel)은 일반 Next.js 입니다.
- 페이지는 `<경로>.html` 로 나옵니다 (`console.html`, `agv.html`). 로봇 서버(`server.py` `translate_path`)와
  exe(`desktop-go/main.go` `handler`)가 `/console` → `console.html` 로 이어 줍니다. 새 플랫폼도 같은 규칙이 필요합니다.
- 동적 경로 `/figures/[id]`, `/materials/[doc]` 는 `generateStaticParams` + `dynamicParams = false` 로 미리 만듭니다
  (그림 GIF 녹화 · 자료실 PDF 인쇄용 페이지). `src/app/manifest.ts` 는 PWA 매니페스트.
- 글꼴: Pretendard 는 `src/app/fonts/` 의 로컬 파일(`next/font/local`), JetBrains Mono · Michroma 는 `next/font/google`
  (빌드할 때 내려받아 같이 묶음).
- 서비스 워커 `public/sw.js`(설치형 PC 앱 · 오프라인)는 `tools/build/gen-sw.mjs` 가 `public/` 의 robot · draco · pyodide ·
  icons · brand · materials · guides · education · library 를 모아 만들고, 프로덕션 + secure context 에서만 등록합니다.
- 쿼리: `?from=sim`(exe 에서 열림: 이 PC 네트워크로 로봇 찾기), `?from=pc`(PC 프로그램에서 열림), `?pick`, `/spike/parts?part=…`.

### 정적 파일 (`web-typescript/public/`)
| 폴더 | 내용 | 만드는 곳 |
| --- | --- | --- |
| `robot/<모델>/` | GLB(Draco) · URDF · 텍스처 · 라이선스 | `robot-python/tools/convert_meshes.py` (커밋됨) |
| `robot/parts/`, `brand/intro/` | 도구 · 제품 카드 그림 | `tools/build/part-thumbs.mjs` (개발 서버 필요) |
| `robot/thumbs/`, `brand/`, `icons/`, `sim/scenes/` | 제품 사진 · 로고 · 앱 아이콘 · 장면 배경 | 손으로 넣은 파일 |
| `draco/` | three.js 의 Draco 디코더 (외부 CDN 없이) | `three` 패키지에서 복사 (커밋됨) |
| `education/fig/` | 주제 그림 GIF · 마지막 장면 PNG | `tools/build/figure-gifs.mjs` |
| `education/clips/` | 실습 시연 GIF (주제마다 A · B · C) | `tools/check/learn-sim.mjs --clips` |
| `education/unit/` | 단원 그림 u1–u8.jpg | 앱 3D 화면 캡처 (스크립트 없음) |
| `library/` | 라이브러리 카드 GIF | `tools/build/library-gifs.mjs` |
| `materials/`, `materials/thumbs/` | 자료실 PDF 26종 · 첫 쪽 그림 | `tools/build/materials.mjs`, `tools/build/pdf-thumbs.mjs` |
| `guides/` | 매뉴얼 PDF 2종의 앱용 사본 · 첫 쪽 그림 | `tools/build/guides.mjs`, `tools/build/pdf-thumbs.mjs` |
| `pc/physical-ai-tool.html` | 로봇 찾기 PC 프로그램 (HTML 한 장, USB 키트에도 들어감) | 손으로 쓴 파일 |
| `pyodide/`, `sw.js` | Pyodide 실행 파일 · 서비스 워커 | `tools/build/copy-pyodide.mjs`, `tools/build/gen-sw.mjs` (자동, 커밋 안 함) |

URL 은 `/robot/…`, `/education/…`(`engine/education/media.ts`), `/library/…`, `/materials/…` 처럼 사이트 맨 위 기준입니다.

### 브라우저 저장소 · 검사용 훅 (실행 계약 — 이름을 바꾸지 마세요)
- `localStorage` — 콘솔: `robot-console-model` · `-level` · `-tab` · `-side` · `-mode` · `-quality` · `-display` · `-sim-rate` ·
  `-poses` · `-mount` · `-cam-roles` · `-dock-open` · `-dock-<id>` · `-pc-offered` · `-net-prefix` · `-recent-robots` ·
  `-archive-view` · `-check-evidence` · `-progress-v1`, `console-guide-done`, `console-hud`;
  교육: `learn-topic` · `learn-done` · `learn-missions` · `learn-owned` · `learn-level` · `learn-resume` · `learn-overlay-notes` · `learn-wrong`;
  myAGV: `agv-console-model`.
  검사 스크립트는 로드 전에 `robot-console-model` = `mycobot280-rdkx5` 를 넣어 모델 선택 화면을 건너뜁니다.
- `window.__learnOpen(topicId, page?)` — 수업 하나를 엽니다 (`ui/education/LearnView.tsx`).
  `window.__learnPick(mm)` — 실습 3D 무대에서 점 하나를 고릅니다. `tools/check/learn-ui.mjs` · `learn-sim.mjs` 가 씁니다.
- `window.__learnLab()` — 교육 홈의 [문제 해결 실습 (시범)]을 엽니다. `window.__labOpen(문제, 단계, { solve?, at? })` — 문제 1–3 의
  한 단계를 엽니다 (`solve`: 정답 값으로 다시 실행, `at`: 재생 시각 또는 `'end'`; `ui/education/lab/LabView.tsx`).

### 로봇 서버 API (`robot-python/server/`)
앱은 **같은 주소**의 `/api/state` 가 대답하면 로봇 모드, 아니면 시뮬레이터로 동작합니다 (`engine/simulator/robotLink.ts`).
HTTP + JSON 만 쓰고 WebSocket 은 없습니다 (화면이 `/api/state` 를 로봇이 있으면 0.1초, 없으면 3초마다 읽음). 포트 8080.

| 로봇팔 `server.py` | 내용 |
| --- | --- |
| `GET /api/state` | 연결 · 실제 관절 각도 · 실행 중인 줄 · 카메라 · 펌프 · 로봇 ID (다른 주소에서도 읽기 허용, CORS) |
| `POST /api/run` · `/api/move` | 시뮬레이션을 통과한 동작 목록 실행 · 관절 이동 한 번 |
| `POST /api/target` · `/api/jog` | 실시간 조그 (목표 스트리밍 · 로봇 자체 연속 조그) |
| `POST /api/stop` · `/api/reconnect` | 즉시 정지 · 시리얼 다시 열기 |
| `POST /api/release` · `/api/focus` · `/api/joint` · `/api/calibrate` | 서보 풀기 · 고정 · 관절별 · 영점 |
| `POST /api/gripper` · `/api/pump` | 그리퍼 · 흡착 펌프 |
| `GET /api/camera.jpg?cam=N` · `POST /api/vision` · `/api/vision/hand` · `/api/ai` | 카메라 영상 · 색 인식 · 손 카메라 좌표 · YOLOv5s |
| `GET /api/selfcheck` · `/api/arrivals` | 검수 준비 점검 · 마지막 실행의 실제 도착 각도 |
| `POST /api/identify` | "이 로봇 맞나요?" — 조금 움직여 보이기 (다른 주소에서 호출, CORS) |
| `GET /api/wifi` · `/api/wifi/scan`, `POST /api/wifi/connect` · `/api/wifi/hotspot` | 교실 Wi-Fi |

myAGV `agv_server.py` 는 같은 화면 파일에 `GET /api/state`, `POST /api/drive`(0.1–0.2초마다 유지 신호) · `/api/stop` ·
`/api/straight` · `/api/trim` · `/api/led` · `/api/identify` · `/api/reconnect`, `GET /api/camera.jpg`, `/api/wifi…` 를 둡니다.
exe(`desktop-go`)는 `/api/*` 에 404 를 돌려 시뮬레이터로 두고, `GET /__physical-ai-simulator/lan` 으로 이 PC 의 네트워크 대역을 알려 줍니다.
로봇 USB 만들기(`desktop-go/usbkit.go`)는 `/__physical-ai-simulator/usb` (USB 목록 · `/pcwifi` · `/make` · `/job` · `/results` · `/eject`):
127.0.0.1 에서만, `X-Physical-AI: 1` 머리글이 있는 요청만 받습니다 (학급 서버 모드에는 없음).

## 문서 · 배포

- 배포용 문서: [`시뮬레이터 사용 매뉴얼.pdf`](manuals/simulator/) · [`교사용 교육 가이드라인.pdf`](manuals/course/) — 원고와 다시 만들기는 [`manuals/README.md`](manuals/README.md)
- PC 시뮬레이터 설치: [`manuals/setup/pc-simulator.md`](manuals/setup/pc-simulator.md) · 실제 로봇 점검: [`manuals/robot-arm/robot-check.md`](manuals/robot-arm/robot-check.md)
- 교육 과정: [`manuals/course/robotics-course.md`](manuals/course/robotics-course.md) · 원고 형식: [`content-markdown/README.md`](content-markdown/README.md)
- 개발 중 exe 는 zip 을 둘로 나눠(`zip -s 30m`) 보내고, 확정본은 `release` 브랜치에 `PhysicalAI-Simulator.zip` + README 하나로 둡니다.
