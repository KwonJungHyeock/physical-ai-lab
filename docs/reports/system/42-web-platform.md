# 보고 #42 — 웹 플랫폼용 정리: 학급 서버 · 로컬 LLM 제거

2026-11-02. 이 프로그램을 플랫폼(웹, HTTPS)에 넣어 쓰기로 했다. 그에 맞춰 쓰지 않을 기능을 코드까지 지웠다.
여기에는 무엇이 있었는지, 무엇이 남았는지, 다시 살리는 법을 적는다.

## 1. 왜

| 기능 | 빼는 까닭 |
|---|---|
| 학급 계정 · 학급 서버 | 학교망에서 교사 PC 서버에 학생 PC 가 붙지 못하는 경우가 많다(기기끼리 막은 Wi-Fi, 방화벽). 플랫폼에는 자체 계정이 있다 |
| 로컬 LLM (AI 버튼 · 말로 만들기) | 실습 PC 성능으로는 Ollama 모델이 느리다(그래픽카드 없으면 수십 초). Claude API 쪽은 학급 서버가 있어야 동작했다 |

실습은 교실 공유기 Wi-Fi 와 랜선 직결로 로봇에 연결하는 것만 남긴다.

## 2. 지운 것

| 무엇 | 어디 (지운 줄 수) |
|---|---|
| 학급 계정 엔진: 로그인 · 세션 · xAPI 학습 이벤트 · 오프라인 큐 · 실시간 현황 · 명단 · PIN · 학생별 진도 · 교사 주도 수업 서버 동기화 | `web-typescript/src/engine/account/` (2150) |
| 학급 계정 화면: 로그인 · 계정 칩 · 학급 관리(교사 대시보드) · 로그인 카드 · 운영자 화면 · LLM 설정 · 차시 열기 잠금 | `web-typescript/src/ui/account/` (4499) |
| 학급 서버 (exe `-class`, `교사용 학급 서버.cmd`): 계정 · 기록 저장 · 교사 주도 수업 · Claude/Ollama 중계 · 클라우드 동기화 | `desktop-go/classroom/` (5712), `desktop-go/classmode.go` |
| 가명 클라우드 수신기 (참고 구현) | `desktop-go/cloud/` (467) |
| 말로 만들기 (학급 서버의 AI) | `ui/simulator/editors/SpeakPanel.tsx` (238), `engine/simulator/speak.ts` (237) |
| AI 에게 시키기 (exe + 이 PC 의 Ollama) | `ui/simulator/editors/AiChat.tsx` (362), `engine/simulator/localAi.ts` (68), `desktop-go/localai.go` (90) |
| 학생 화면이 선생님을 따라오는 수업 | `ui/education/lead/LeadStudent.tsx` (328), 함께하기 · 초대 창 |
| 점검 | `tests/account/` (572), `tests/simulator/speak-check.mts`, `tools/check/class-load.mts` (부하 시험) |

모두 합쳐 87개 파일, 약 17,000줄이 줄었다.

## 3. 바뀐 동작 (지금)

- **로그인 없음.** 예전의 '계정 없이 쓰기'(자유 모드)가 유일한 모드다. 교사용 보기 · 검수 시연 · 모든 현장 열기는 누구나 켤 수 있다(예전 자유 모드와 같다).
- **진도 · 결과는 그 브라우저에 남는다.** 반 전체 결과는 예전처럼 파일로 모은다. 학생이 지도에서 [선생님께 내 결과 내기]로 파일을 내면, 선생님이 관제센터 [반 결과]에 넣는다(`engine/education/classReport.ts`, 서버 없음).
- **선생님과 함께 수업 = 프로젝터 방식만.** 선생님 PC 하나로 단계를 열고, 정답을 보이고, 실물 허락과 모든 로봇 정지를 한다. 상태는 `engine/education/leadState.ts`(이 PC 메모리)에 둔다. 학생 답은 손을 들어 받는다.
- **실습 셀 예시 프로그램 불러오기는 없다.** 예전에도 교사 계정에서만 보였고, 자유 모드에는 없었다.
- **데스크톱 프로그램(exe)은 설치 도구로 남는다.** 로봇 USB 만들기와 새 로봇 설치는 PC 의 USB 와 랜선을 직접 다뤄서 웹에서는 안 된다. exe 는 회사가 받아 별도 자료실 서버에 올린다.

## 4. 웹(HTTPS)에서 로봇 연결

- 로봇 서버의 `/api/state` 는 어느 주소의 요청이든 받는다(CORS `*`, `Access-Control-Allow-Private-Network`). 그래서 웹 화면에서도 로봇 찾기와 연결 확인이 된다.
- HTTPS 페이지가 `http://192.168.x.x` 를 부르려면 크롬 · 엣지(141 이상)의 **로컬 네트워크 접근 허용**이 필요하다. 처음 한 번 허용 창이 뜬다.
- 연결이 확인되면 지금처럼 **로봇 자기 화면**(`http://<로봇>/console`)으로 넘어가고, 열려 있던 프로그램도 함께 넘긴다. 로봇 서버는 고치지 않았다.
- 실물 로봇과 실제 학교망에서는 아직 시험하지 않았다. 확인은 코드와 자동 점검으로만 했다.

## 5. 다시 살리는 법

- 지우기 직전 커밋은 `7e41fc3` 이다. 이 보고서와 함께 들어간 커밋을 `git revert` 하면 모두 돌아온다.
- 일부만 살리려면 그 커밋에서 폴더를 꺼낸다. 예: `git checkout 7e41fc3 -- web-typescript/src/engine/account web-typescript/src/ui/account desktop-go/classroom desktop-go/classmode.go`. 그다음 `Console.tsx` · `LearnView.tsx` · `console/page.tsx`(AccountProvider) 연결을 되돌린다.
- 설계와 법 점검은 보고 #23(학급 계정), #28(선생님과 함께), #29(한 로봇 한 PC), #31(부하 시험), #41(말로 만들기)에 그대로 있다.
- 플랫폼 계정과 붙일 때 다시 쓸 만한 것:
  - xAPI 모양 학습 이벤트(`events.ts`)
  - 오프라인 큐(`queue.ts`): 학생별 큐, 지수 백오프와 지터, 중복 전송 무시

## 6. 함께 고친 문서

- `CLAUDE.md`, `README.md`, `desktop-go/README.txt`, `build.sh`: `-class` 와 `교사용 학급 서버.cmd` 를 뺐다.
- 매뉴얼:
  - `basic/teacher.md`: 학급 계정 · 말로 만들기 절과 설정 메뉴의 학급 로그인 줄을 뺐다.
  - `course/teacher-guide.md`: 8장을 프로젝터 방식으로 다시 썼다. 학생 화면 · 학급 관리 그림 3장을 뺐다.
  - `simulator/guide.md`, `setup/tablet.md`, `robot-arm/robot-console.md`
