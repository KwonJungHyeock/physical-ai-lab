# 매뉴얼

사람이 순서대로 따라 하는 사용·실행 안내서입니다. 쓰는 사람과 장비에 따라 폴더를 나눴습니다.

## 배포용 문서 (PDF)

| 문서 | 대상 | 원고 |
| --- | --- | --- |
| [`기초 사용 매뉴얼 (교사용).pdf`](basic/기초%20사용%20매뉴얼%20(교사용).pdf) (30쪽) | 선생님 · 실습 담당자 — 구성품과 안전, 로봇 설치(USB 로 처음 설치 · 영점 · 검수 준비 점검), 프로그램 설치, 연결 세 가지(교실 Wi-Fi · 공유기 랜선 · 유선 직결, 로봇 핫스팟은 쓰지 않음), 화면 사용법, 기초 조작(코딩 없이), 문제 해결 · 점검표 | [`basic/teacher.md`](basic/teacher.md) |
| [`기초 사용 매뉴얼 (학생용).pdf`](basic/기초%20사용%20매뉴얼%20(학생용).pdf) (13쪽) | 학생 — 안전 약속, 로봇 켜기, 프로그램 켜기 · 끄기, 연결하기, 화면 둘러보기, 버튼으로 움직이기(따라 하기 다섯 가지), 이럴 땐 선생님께. 교사용과 장 번호가 같음 | [`basic/student.md`](basic/student.md) |
| [`시뮬레이터 사용 가이드.pdf`](simulator/시뮬레이터%20사용%20가이드.pdf) (25쪽) | 학생 · 선생님 공통 — 로봇 없이 시뮬레이터만. 1부 사용법(시작하기 · 처음 시작 안내, 화면, 제어, 도구 · 자세, 공정, 코딩, 손 따라하기, 결과 · 저장, 이럴 땐), 2부 기초 실습 다섯 개(움직임 제어 · 블록 코딩 · 파이썬 튜토리얼 · 공정 첫걸음 · 손 따라하기 첫걸음) | [`simulator/guide.md`](simulator/guide.md) |
| [`교사용 교육 가이드라인.pdf`](course/교사용%20교육%20가이드라인.pdf) (30쪽) | 선생님 — 과정 한눈에, 수업 준비 · 안전, 한 차시 50분 운영, 28차시 계획표, 학문별 지도 포인트, 평가, 자료실, 로봇 실습 7 선생님과 함께 수업(일곱 수업 단계표) | [`course/teacher-guide.md`](course/teacher-guide.md) |

원고(md)를 고친 뒤 PDF 를 다시 만들기 (개발 서버를 켠 상태, `web-typescript/` 에서):
```bash
# 기초 사용 매뉴얼 그림 → basic/img: PC 쪽 화면(정적 서버) + 로봇에 연결한 화면(로봇 서버 또는 데모 서버)
PC_BASE=http://localhost:3001 BASE=http://localhost:8090 node tools/build/guide-shots/manual.mjs
USB=<USB 대신 쓸 폴더> MANUAL=../manuals/basic/img node tools/check/usb-maker.mjs   # 로봇 USB 만들기 그림 (u-*.png, 리눅스용 프로그램을 그 폴더로 켠 상태)
node tools/build/guide-shots/teacher.mjs     # 교사용 교육 가이드라인 그림 → course/img (개발 서버)
BASE=http://localhost:3001 node tools/build/guide-shots/lead.mjs   # 선생님과 함께 수업 화면 → course/img/b-lead-teacher.jpg
BASE=http://localhost:3001 HAND_Y4M=<손 사진 .y4m> node tools/build/guide-shots/simulator.mjs   # 시뮬레이터 사용 가이드 그림 → simulator/img (정적 서버, 손 따라하기는 가짜 카메라)
node tools/build/guide-shots/diagrams.mjs    # 설명 그림 (d-*.png)
node tools/build/guides.mjs                  # md → PDF, 인쇄 쪽 검사 (자료실 사본 · 표지 미리보기도)
```
`guides.mjs` 는 인쇄한 쪽마다 제목이 쪽 맨 아래에 홀로 남았는지, 쪽이 많이 비었는지, 글꼴에 없는 글자가 있는지 검사합니다.
원고 형식: `# ` 장 · `## ` 절, `![캡션](img/x.png){w=70}` 번호 붙는 그림, `::: step 제목` … `:::` 따라 하기 카드,
`::: marks` 화면의 빨간 번호 설명, `::: cols` … `+++` … `:::` 나란히, `::: newpage` 쪽 넘김, `> 팁:` `> 주의:` `> 참고:` `> 안전:` 상자, `[버튼]` 버튼 이름.

## `basic/` — 기초 사용 매뉴얼 (교사용 · 학생용)

| 안내서 | 내용 |
| --- | --- |
| [`teacher.md`](basic/teacher.md) | 교사용 원고 (그림은 `basic/img/`: `s-*` PC 화면, `r-*` 로봇에 연결한 화면, `c-*` 연결 창, `u-*` 로봇 USB 만들기, `d-*` 설명 그림) |
| [`student.md`](basic/student.md) | 학생용 원고 (같은 그림, 같은 장 번호) |

## `simulator/` — 시뮬레이터 사용 가이드 (로봇 없이)

| 안내서 | 내용 |
| --- | --- |
| [`guide.md`](simulator/guide.md) | 시뮬레이터 사용 가이드 원고 (그림은 `simulator/img/g-*`). 교육 탭은 다루지 않음 |

## `setup/` — 설치 · 준비 (처음 한 번)

| 안내서 | 내용 |
| --- | --- |
| [`usb-kit.md`](setup/usb-kit.md) | USB 키트로 로봇 준비 — 처음 한 번 명령 한 줄, 그 뒤로는 `wifi.txt` 에 Wi-Fi 이름이나 `끔`(랜선만)을 적어 꽂기 (로봇팔·myAGV 공통) |
| [`pc-simulator.md`](setup/pc-simulator.md) | PC 에 시뮬레이터 설치하기 — 로봇 없이, 인터넷 없이 연습 (크롬·엣지 앱 설치, Windows 실행 파일) |
| [`tablet.md`](setup/tablet.md) | 태블릿으로 쓰기 (갤럭시 탭 · 아이패드) — 로봇 · 시뮬레이터 주소 열기, 홈 화면에 추가 · 전체 화면, 손가락 조작(길게 눌러 설명, 반복 안에 블록 넣기), 태블릿에서 다른 점 |

## `robot-arm/` — 로봇팔 (myCobot 280 RDK X5)

| 안내서 | 내용 |
| --- | --- |
| [`robot-console.md`](robot-arm/robot-console.md) | 로봇에서 실습 콘솔 켜기 — PC 브라우저로 실제 로봇 구동 (`robot-python/server/server.py`) |
| [`robot-check.md`](robot-arm/robot-check.md) | 실제 로봇 점검 실행 방법 (`robot-python/checks/robot_check.py`) |

## `myagv/` — 이동 로봇 (myAGV)

| 안내서 | 내용 |
| --- | --- |
| [`agv-console.md`](myagv/agv-console.md) | 주행 실습 켜기 — 조이스틱·키보드·게임패드 주행, 앞 카메라, 직진 보정 (`robot-python/server/agv_server.py`) |

## `course/` — 교육 과정 (교사 · 학생)

| 안내서 | 내용 |
| --- | --- |
| [`teacher-guide.md`](course/teacher-guide.md) | 교사용 교육 가이드라인의 원고 (그림은 `course/img/`) |
| [`life-track-teacher.md`](course/life-track-teacher.md) | 입문 트랙 ① 생활 로봇 교사용 지도안 — 7차시 · 45분(기초 조작 · 로봇 카페 · 로봇 캘리그라피 · 보드게임 로봇), 차시 흐름, 단계별 틀린 곳 · 예측 정답 · 개념, 정리 · 평가 |
| [`robotics-course.md`](course/robotics-course.md) | 로봇공학 · 피지컬 AI — 윗줄 [교육] 탭: 대상 · 장비 → 커리큘럼 지도(8개 단원 · 28차시) → 단원 미리보기 → 수업 화면(단계 막대 · 활동 패널 · 수업 카드), 자료실 PDF 26종, 시연 GIF |
