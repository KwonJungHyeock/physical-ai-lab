# 문서

과정·결과 문서의 원본입니다. 최종 전달 시 각 문서를 개별 PDF로 변환해 압축 파일로 묶습니다.
보고서 번호(#1~#23)는 쓴 순서이고, 폴더는 내용 갈래입니다.

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

### [`system/`](reports/system/) — 시스템 구성
| 문서 | 내용 |
| --- | --- |
| [`14-system-architecture.md`](reports/system/14-system-architecture.md) | 보고 #14 — 아키텍처 · 배포 경로, 개발 8단계, 순서도, 기능별 구현, 품질 검증, 신규 제품 추가 |
| [`23-accounts-hybrid.md`](reports/system/23-accounts-hybrid.md) | 보고 #23 — 학급 계정과 학습 기록: 교실 학급 서버(교사 PC) + 가명 클라우드, 역할 · 로그인 · 끊김 대응 · xAPI 이벤트 · 법 점검표 |

## `mockup/` — 화면 목업

| 파일 | 내용 |
| --- | --- |
| [`edu-console.html`](mockup/edu-console.html) | 교육 도구 화면 목업 (승인된 디자인 기준). 실제 화면은 웹 주소 `/console` |
| [`myagv/index.html`](mockup/myagv/index.html) | myAGV 주행 · 카메라 실습 목업 (공식 3D 모델 2023 · Plus). 브라우저로 열면 실제로 움직여 볼 수 있음 |
| [`roadmap-products.html`](mockup/roadmap-products.html) | 제품으로 고르는 로드맵 목업 — 제품 사진 카드를 누르면 배울 수 있는 주제 카드가 학문 칸으로 날아와 모임, 추천 순서 · 실물 비율 |
| [`sim-scenes.html`](mockup/sim-scenes.html) | 시뮬레이터 작업대 꾸미기 목업 — 장면(실험실 · 제조 라인 · 물류 · 생활), 오브젝트 추가, 물리 엔진 켜기/끄기. 장면은 웹 주소 `/console?scene=factory` 로 미리 보기 |
| [`sim-hud.html`](mockup/sim-hud.html) | 시뮬레이터 투명 상황 모니터(HUD) 목업 — 관절 각도 · 한계, 손끝 좌표 · 속도, 각도 그래프, 모터 부하 |
