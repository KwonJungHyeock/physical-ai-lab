# 문서

과정·결과 문서의 원본입니다. 최종 전달 시 각 문서를 개별 PDF로 변환해 압축 파일로 묶습니다.
보고서 번호(#1~#24)는 쓴 순서이고, 폴더는 내용 갈래입니다.

| 폴더 | 내용 |
| --- | --- |
| [`reports/`](reports/) | **보고서** — 아래 다섯 갈래 |
| [`mockup/`](mockup/) | **화면 목업** — 브라우저로 여는 HTML |

교육 원고(앱의 [교육] 탭과 자료실 PDF 가 그대로 읽는 md)는 저장소 맨 위 [`content-markdown/`](../content-markdown/) 로 옮겼습니다
(형식 · 그림 · GIF · PDF 만들기는 [`content-markdown/README.md`](../content-markdown/README.md)).

보고서 안의 파일 경로는 지금 저장소 구성에 맞춰 고쳐 두었습니다. 저장소를 정리하며 바뀐 경로는 다음과 같습니다.
- 언어별 폴더: `src/…` → `web/src/…` → 지금 `web-typescript/src/…`, `python/` → `robot-python/`, `desktop/` → `desktop-go/`,
  `docs/curriculum/` → `content-markdown/`.
- 웹 앱 안: `src/components/console/` → `src/ui/simulator/`, `src/components/learn/` → `src/ui/education/`,
  `src/components/{agv,twin}/` → `src/ui/{agv,twin}/`, `src/lib/` → `src/engine/`
  (`robot/` + `robots/` → `robot/`, `robotics/` → `physics/`, `console/` → `simulator/`, `learn/` → `education/`,
  `pysim/` → `python/`, `mycobot/` → `serial/`), `tests/console/` → `tests/simulator/`, `tests/learn/` → `tests/education/`,
  그림 주소 `/learn/…` → `/education/…` (`public/education/`).
- 로봇 쪽: `python/robot_console/` → `robot-python/server/` (로봇에 설치되는 폴더 이름은 그대로 `~/robot_console/`),
  `python/tests/` → `robot-python/checks/`, `python/usb_kit/` → `robot-python/usb-kit/`.

## `reports/` — 보고서

### [`prototype/`](reports/prototype/) — 초기 시제품 · 연결 검증
| 문서 | 내용 |
| --- | --- |
| [`01-web-serial-spike.md`](reports/prototype/01-web-serial-spike.md) | 보고 #1 — 리포 초기화, Web Serial 스파이크 (myCobot 280 AR) |
| [`02-digital-twin.md`](reports/prototype/02-digital-twin.md) | 보고 #2 — 관절 한계 재확정, 디지털 트윈 3D 뷰어 |

### [`research/`](reports/research/) — 조사 · 사양 · 방향
| 문서 | 내용 |
| --- | --- |
| [`03-rdk-x5-feasibility.md`](reports/research/03-rdk-x5-feasibility.md) | 보고 #3 — myCobot 280 RDK X5 시장조사 · 가능성 검토 |
| [`07-ai-kit.md`](reports/research/07-ai-kit.md) | 보고 #7 — AI 로봇 확장 키트: 공식 모델·코드·사진으로 시뮬레이터 맞추기, 실측할 값 |
| [`10-direction.md`](reports/research/10-direction.md) | 보고 #10 — 사양 전수조사(틀린 곳·미확정), 흡착 펌프 제어 핀, 연결 구조, 수준별 3단계 제안 |
| [`12-myagv.md`](reports/research/12-myagv.md) | 보고 #12 — myAGV(이동 로봇) 조사: 버전 5종 사양, 명령 방식, ROS 패키지 · 3D 모델, 시뮬레이터 설계안 |
| [`21-model-assets.md`](reports/research/21-model-assets.md) | 보고 #21 — 3D 모델 자산: 코드로 만든 소품 현황(1단계), CC0 모델 팩 9개 · 바닥/벽 재질 7종 수집, 현장 7곳을 실제 크기 작업대 · 방으로 교체(2~4단계), 남은 한계 |

### [`console/`](reports/console/) — 실습 콘솔 · 실기 점검 · 검수
| 문서 | 내용 |
| --- | --- |
| [`06-console.md`](reports/console/06-console.md) | 보고 #6 — 실습 콘솔: RDK X5 실물 모델, 엔드이펙터 8종, 부드러운 동작, 카메라 2화면 |
| [`08-robot-check.md`](reports/console/08-robot-check.md) | 보고 #8 — 실기 점검 결과: 좌표 기준 일치(0.2 mm), 관절 정확도, 정지 거리 |
| [`09-robot-console.md`](reports/console/09-robot-console.md) | 보고 #9 — 로봇 연결 콘솔: 검수항목 7종 실습, 테마 2개, 제어판 · 영점, 실제 카메라 |
| [`11-roadmap.md`](reports/console/11-roadmap.md) | 보고 #11 — 실습/검수 시연 분리, 실시간 조그 · 3D 표시, 브랜드, 현장 세팅, 모델 확장 순서 |
| [`13-check-audit.md`](reports/console/13-check-audit.md) | 보고 #13 — 검수항목 7종 실기 구현 가능성 점검과 반영 목록 |
| [`27-acceptance-rehearsal.md`](reports/console/27-acceptance-rehearsal.md) | 보고 #27 — 전체 검수(중복 · 누락 · 실물 연동 · 화면 이동) 수정 목록, 검수 7종 전 경로 리허설(데모 로봇, 7/7), 실물로만 확인되는 것, 기초교육 자료 |
| [`34-simulator-features.md`](reports/console/34-simulator-features.md) | 보고 #34 — 시뮬레이터 기능 정리(화면 · 탭 5개 · 겹치는 것 · 숨긴 것)와 공정 짜기(BEGIN–END · MOVE J/L · Tick/Smooth · 프로젝트 파일) 간소화 버전 |
| [`38-jog-physics-review.md`](reports/console/38-jog-physics-review.md) | 보고 #38 — 조그 패널 크게 · 좌표 조그 검토(이 팔에 맞음, 쓰는 자리) · 메뉴 제어/작업/보기 · 공정 예제가 실제로 블록을 옮기게 · 물리 늘 켜기와 책상에서 멈춤 |
| [`39-easy-jog-logo-intro.md`](reports/console/39-easy-jog-logo-intro.md) | 보고 #39 — 쉬운 조그 패널(관절 기본 · 하는 일로 이름 · 작은 버튼 큰 글자) · 관절 익히기 · 왼쪽 메뉴 구분 · 시뮬레이터 로고 C · 실사 사진 인트로 |

### [`education/`](reports/education/) — 교육 과정 · 교재
| 문서 | 내용 |
| --- | --- |
| [`04-education-workflow.md`](reports/education/04-education-workflow.md) | 보고 #4 — 한국 초보자용 교육 도구 동작 방식 추천 |
| [`05-on-robot-plan.md`](reports/education/05-on-robot-plan.md) | 보고 #5 — 로봇 안 수업 환경 구조, 공식 자료 정렬, 12차시 커리큘럼 초안 |
| [`15-robotics-curriculum.md`](reports/education/15-robotics-curriculum.md) | 보고 #15 — 로봇공학 교육과정 기획(기구학 → 경로계획), 물리엔진 검토 |
| [`16-physical-ai-course-plan.md`](reports/education/16-physical-ai-course-plan.md) | 보고 #16 — Physical AI 교육 재설계: 카테고리 · 주제, 자료실 PDF, 용어 |
| [`17-robotics-roadmap.md`](reports/education/17-robotics-roadmap.md) | 보고 #17 — 교육 탭을 로봇공학 로드맵(8개 학문 · 28주제)으로, md 원고 → 앱 |
| [`18-education-quality.md`](reports/education/18-education-quality.md) | 보고 #18 — 기호 풀이 · 실습교육서 양식 · GIF · 28주제 검수 |
| [`19-lesson-structure.md`](reports/education/19-lesson-structure.md) | 보고 #19 — 수업 순서(도입 → 개념 → 탐구 활동 → 정리 → 평가), 빈 곳 채우기, 오타 · 정렬 · 쏠림 · 내용 검수 |
| [`20-world-map-plan.md`](reports/education/20-world-map-plan.md) | 보고 #20 — 통합 월드맵: 로봇 아카데미(이론 28차시) + 현장 테마 7곳 + 디지털 트윈 관제센터를 섬 도시 하나로, CC0 모델 자산 |
| [`22-course-flow.md`](reports/education/22-course-flow.md) | 보고 #22 — 교육 전개 점검과 수정 1~5단계: 먼저 배울 차시 · 이론과 현장을 번갈아 · 주차별 계획 2안, 정확성, 스스로 생각하게(식 보기 · 7문항 평가), 대학 Python 과제 · 반 결과, 실물 연동 |
| [`24-lesson-screen.md`](reports/education/24-lesson-screen.md) | 보고 #24 — 수업 화면 개편(왼쪽 레일: 개념 · 질문 · 해 보기 · 결과 색 구분), 3D 수업 그림, 학급 계정 화면, 1-4 단면 수정, 실물 연동 시험 순서 |
| [`25-easy-track-plan.md`](reports/education/25-easy-track-plan.md) | 보고 #25 — 쉬운 실습 트랙 기획안(시연 피드백) → 최종 반영: 로봇 실습 7 (검수 7가지를 단순한 5단계 패널로, 색은 구역 구분 · 강조에만, 시뮬레이션 → 실물 로봇 → 검수 기록), 2안 · 1안 기획 |
| [`26-easy-reading.md`](reports/education/26-easy-reading.md) | 보고 #26 — 쉽게 읽히는 교재 화면(단어 안 끊기 · 한 문장 한 줄 · 쉬운 말, 한 줄 문장 65 % → 100 %), 순서대로 따라가는 수업(결과 전엔 다음 잠금 · 교사만 건너뛰기 · ✓ 는 한 것만), 겹친 이동 정리, 깊은 내용은 단원 이론서 PDF 의 그 쪽으로 |
| [`28-teacher-led-class.md`](reports/education/28-teacher-led-class.md) | 보고 #28 — 선생님과 함께 수업: 선생님 화면이 단계를 열면 학생 화면이 따라옴, 로봇은 허락 뒤 · 모든 로봇 정지, 일곱 수업 대본과 기초교육 차시, 브라우저 4개 점검 |
| [`29-one-robot-results.md`](reports/education/29-one-robot-results.md) | 보고 #29 — 한 로봇 한 PC (로봇 서버 조작권 · 조마다 로봇 담당 한 명), 로봇 실습 7 실물 결과를 학급 관리로, 매뉴얼 두 권을 지금 화면에 맞춤, 시연 GIF 84개를 수업 레일 + 3D 화면으로 다시 녹화 |
| [`32-theory-review.md`](reports/education/32-theory-review.md) · [`부록 문항`](reports/education/32-theory-review-quiz.md) | 보고 #32 — 이론 검증 자료: 28차시의 정의 · 원리 · 자세히 · 수식 · 기호 · 활동 정답과 이유, 현장 실습 21문제 · 마무리 평가 · 로봇 실습 7의 원리와 계산 정답, 확인 문항 560개 정답 · 풀이 (앱 데이터에서 그대로, `tools/build/theory-review.mts`) |
| [`32-review-u12-result.md`](reports/education/32-review-u12-result.md) | 보고 #32 결과 — 1·2단원 검증 지시서 반영: 고친 문장, 질문 · 결정, 파트 4 조사 |
| [`33-lesson-rail-design.md`](reports/education/33-lesson-rail-design.md) | 보고 #33 — 수업 레일 공통 양식(미션 카드 · 지금 할 일 · 고정 색), 실물 연동 막대 한 줄, 1·2단원 반영 이론서 · 문항지 다시 만듦, 디자인 원칙 점검, GitHub `release` 브랜치에 시뮬레이터 · USB 키트 두 파일 |
| [`35-imitation-teaching-plan.md`](reports/education/35-imitation-teaching-plan.md) | 보고 #35 — 가변저항 티칭 팔(아두이노) → 시뮬레이터 · 280 따라 하기 → 기록 · 재생 · 학습: 시험용 기획(구성 · 시험 T1~T7 · 8차시 초안 · 준비물 · 걱정되는 점) |
| [`36-education-direction.md`](reports/education/36-education-direction.md) | 보고 #36 — 교육 자료 방향(보류): 자료는 모두 자료실 · 화면은 안내만, 실습 매뉴얼 + 이론 PDF 두 층, PinkLAB 모방학습 자료 분석, 실습 매뉴얼 초안(검수 7종과 겹침) |
| [`37-theory-review-u38.md`](reports/education/37-theory-review-u38.md) | 보고 #37 — 로봇공학 이론 검토 3 ~ 8단원(보고 #32 후속): 오류 61 (상 5) · 보완 · 추가 제안 · 삭제 · 확인 필요, 위치와 고친 문장 · 다시 계산한 숫자 |
| [`43-track-life-robot-cafe.md`](reports/education/43-track-life-robot-cafe.md) | 보고 #43 — 입문 트랙 ① 생활 로봇 · 로봇 카페 시뮬레이터 설계와 근거: 실제 로봇 카페 조사(비트 · 레인보우 · HD현대 · 라운지랩 · Artly), 1/5 축척 · 장비 상태와 신호, 4단계와 단계별 근거 · 참고 자료 |
| [`44-track-life-robot-calligraphy.md`](reports/education/44-track-life-robot-calligraphy.md) | 보고 #44 — 입문 트랙 ① 생활 로봇 · 로봇 캘리그라피 부스 시뮬레이터 설계와 근거: 행사 부스 · 서예 · 케이크 레터링 · 접착제 도포 조사, 실제 크기 · 카드와 손님 신호, 4단계(둘러보기 · 보정 · 직선 이동 · 펜 들기)와 근거 · 참고 자료 |
| [`45-track-life-board-game-robot.md`](reports/education/45-track-life-board-game-robot.md) | 보고 #45 — 입문 트랙 ① 생활 로봇 · 보드게임 로봇(오목) 시뮬레이터 설계와 근거: 체스 로봇 사고 · 연구 사례 조사, 9 × 9 판 · 차례 신호 · 손 인터록, 4단계(한 수 · 격자 좌표 · 차례 기다리기 · 판단 규칙)와 규칙별 대국 결과 · 참고 자료 |
| [`46-track-life-classroom.md`](reports/education/46-track-life-classroom.md) | 보고 #46 — 입문 로봇 카페를 교실 수업형으로: 한 원본(수업 설계) · 차시 구성 4 · 6 · 8 · 교안 쪽 표시 · 확인 문제 · 학습 기록(LMS, 파일 방식) · 교사 열쇠 · 교안 · 학습지 PDF |

### [`system/`](reports/system/) — 시스템 구성
| 문서 | 내용 |
| --- | --- |
| [`14-system-architecture.md`](reports/system/14-system-architecture.md) | 보고 #14 — 아키텍처 · 배포 경로, 개발 8단계, 순서도, 기능별 구현, 품질 검증, 신규 제품 추가 |
| [`23-accounts-hybrid.md`](reports/system/23-accounts-hybrid.md) | 보고 #23 (지움, #42) — 학급 계정과 학습 기록: 교실 학급 서버(교사 PC) + 가명 클라우드, 역할 · 로그인 · 끊김 대응 · xAPI 이벤트 · 법 점검표 |
| [`30-usb-maker.md`](reports/system/30-usb-maker.md) | 보고 #30 — 로봇 USB 만들기: 시뮬레이터 프로그램에 로봇 키트를 넣어, Wi-Fi 를 칸에 적고 버튼 하나로 USB 를 만들고 로봇마다 결과를 봄 |
| [`40-wired-wireless.md`](reports/system/40-wired-wireless.md) | 보고 #40 — 로봇 연결 무선 / 유선 두 갈래: 직결 주소 169.254.127.10 · `와이파이=끔` · 결과 파일 주소 종류 · 연결 창 [유선 직결] · USB 만들기 연결 방법 |
| [`41-omx-and-speak.md`](reports/system/41-omx-and-speak.md) | 보고 #41 — 다른 로봇팔 OMX-F (시뮬레이터 5관절 · 그리퍼 · 선생님 설정으로 켜기) · 말로 만들기 (AI, 지움 #42): 학생 문장 → 학급 서버의 Claude → 블록 줄 → 블록 검사 · 시뮬레이션 뒤 실행, 키 · 횟수 · 기록 · 모델 |
| [`31-load-tool-reading.md`](reports/system/31-load-tool-reading.md) | 보고 #31 — 학급 서버 부하 시험(학생 30 · 60명, 실패 0, 단계 전달 최대 1.5초), 실제 팔의 도구가 화면과 다를 때 안내 · 막기, 쉬운 글 기준을 매뉴얼 PDF 세 권 · 마무리 평가 · 관제센터 · 지도 카드까지 (두 줄 넘는 문장 0) |
| [`42-web-platform.md`](reports/system/42-web-platform.md) | 보고 #42 — 웹 플랫폼용 정리: 학급 서버 · 학급 계정 · 로컬 LLM(AI 버튼 · 말로 만들기)을 코드까지 지움, 선생님과 함께는 프로젝터 방식만, exe 는 설치 도구로, 웹(HTTPS)에서 로봇 연결, 다시 살리는 법 |

## `mockup/` — 화면 목업

| 파일 | 내용 |
| --- | --- |
| [`class-lead/index.html`](mockup/class-lead/index.html) | **시안 · 선생님이 이끄는 수업** (로봇 실습 7-4) — 선생님 노트북(프로젝터 화면 + 선생님만 보는 진행 칸)과 학생 PC 를 나란히. [다음 단계 열기] 를 누르면 학생 화면이 따라 넘어가고, 실물 로봇은 선생님이 허락해야 열림. 캡처는 `class-lead/shots/` |
| [`edu-console.html`](mockup/edu-console.html) | 교육 도구 화면 목업 (승인된 디자인 기준). 실제 화면은 웹 주소 `/console` |
| [`myagv/index.html`](mockup/myagv/index.html) | myAGV 주행 · 카메라 실습 목업 (공식 3D 모델 2023 · Plus). 브라우저로 열면 실제로 움직여 볼 수 있음 |
| [`roadmap-products.html`](mockup/roadmap-products.html) | 제품으로 고르는 로드맵 목업 — 제품 사진 카드를 누르면 배울 수 있는 주제 카드가 학문 칸으로 날아와 모임, 추천 순서 · 실물 비율 |
| [`sim-scenes.html`](mockup/sim-scenes.html) | 시뮬레이터 작업대 꾸미기 목업 — 장면(실험실 · 제조 라인 · 물류 · 생활), 오브젝트 추가, 물리 엔진 켜기/끄기. 장면은 웹 주소 `/console?scene=factory` 로 미리 보기 |
| [`sim-hud.html`](mockup/sim-hud.html) | 시뮬레이터 투명 상황 모니터(HUD) 목업 — 관절 각도 · 한계, 손끝 좌표 · 속도, 각도 그래프, 모터 부하 |
