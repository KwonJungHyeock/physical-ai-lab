# 매뉴얼

사람이 순서대로 따라 하는 사용·실행 안내서입니다. 쓰는 사람과 장비에 따라 폴더를 나눴습니다.

## 배포용 문서 (PDF)

| 문서 | 대상 | 원고 |
| --- | --- | --- |
| [`시뮬레이터 사용 매뉴얼.pdf`](simulator/시뮬레이터%20사용%20매뉴얼.pdf) (27쪽) | 학생 · 선생님 · 처음 쓰는 분 — 설치, 화면, 직접 제어, 블록 · Python · ROS 2, 과제, 실제 로봇 연결, 문제 해결 | [`simulator/simulator-guide.md`](simulator/simulator-guide.md) |
| [`교사용 교육 가이드라인.pdf`](course/교사용%20교육%20가이드라인.pdf) (21쪽) | 선생님 — 과정 한눈에, 수업 준비 · 안전, 한 차시 50분 운영, 28차시 계획표, 학문별 지도 포인트, 평가, 자료실 | [`course/teacher-guide.md`](course/teacher-guide.md) |

원고(md)를 고친 뒤 PDF 를 다시 만들기 (개발 서버를 켠 상태, `web-typescript/` 에서):
```bash
node tools/build/guide-shots/simulator.mjs   # 화면 캡처 → simulator/img (번호 표시 포함)
node tools/build/guide-shots/teacher.mjs     # 화면 캡처 → course/img
node tools/build/guide-shots/diagrams.mjs    # 설명 그림 (d-*.png)
node tools/build/guides.mjs                  # md → PDF, 인쇄 쪽 검사
```
`guides.mjs` 는 인쇄한 쪽마다 제목이 쪽 맨 아래에 홀로 남았는지, 쪽이 많이 비었는지, 글꼴에 없는 글자가 있는지 검사합니다.
원고 형식: `# ` 장 · `## ` 절, `![캡션](img/x.png){w=70}` 번호 붙는 그림, `::: step 제목` … `:::` 따라 하기 카드,
`::: marks` 화면의 빨간 번호 설명, `::: cols` … `+++` … `:::` 나란히, `> 팁:` `> 주의:` `> 참고:` `> 안전:` 상자, `[버튼]` 버튼 이름.

## `simulator/` — 시뮬레이터 사용 매뉴얼

| 안내서 | 내용 |
| --- | --- |
| [`simulator-guide.md`](simulator/simulator-guide.md) | 배포용 매뉴얼의 원고 (PDF 와 같은 내용, 그림은 `simulator/img/`) |

## `setup/` — 설치 · 준비 (처음 한 번)

| 안내서 | 내용 |
| --- | --- |
| [`usb-kit.md`](setup/usb-kit.md) | USB 키트로 로봇 준비 — 처음 한 번 명령 한 줄, 그 뒤로는 `wifi.txt` 에 Wi-Fi 이름·비밀번호만 적어 꽂기 (로봇팔·myAGV 공통) |
| [`pc-simulator.md`](setup/pc-simulator.md) | PC 에 시뮬레이터 설치하기 — 로봇 없이, 인터넷 없이 연습 (크롬·엣지 앱 설치, Windows 실행 파일) |

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
| [`robotics-course.md`](course/robotics-course.md) | 로봇공학 · 피지컬 AI — 윗줄 [교육] 탭: 대상 · 장비 → 커리큘럼 지도(8개 단원 · 28차시) → 단원 미리보기 → 수업 화면(단계 막대 · 활동 패널 · 수업 카드), 자료실 PDF 26종, 시연 GIF |
