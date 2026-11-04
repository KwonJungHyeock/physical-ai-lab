# 보고 #44 — 입문 트랙 ① 생활 로봇: 로봇 캘리그라피 부스 시뮬레이터 설계와 근거

> 상태: 1차 구현 (엔진 · 4단계 · 장면 · 작업 순서 카드, `engine/simulator/cell/draw.ts` · `drawRecipe.ts` · `tests/simulator/cell-g-check.mts`) · 2026-11-04 · 브랜치 `track/life` · 주소 `/track/life` (환경 › 실습 셀 › G 로봇 캘리그라피)
> 이 문서는 단계(차시)마다 **무엇을 실제처럼 만들었는지, 그 근거와 참고 자료가 무엇인지**를 적는다.
> 숫자 옆의 [n]은 맨 아래 참고 자료 번호. 모든 결과는 **시뮬레이션** 기준이며, 실물 로봇의 펜 홀더로는 아직 확인하지 않았다(§6).

## 1. 목적

- 입문 상품의 두 번째 현장. 학생이 행사장에서 본 적 있는 **'로봇이 써 주는 메시지 카드' 부스**를 코드 없이 카드로 움직여 본다.
- 결과가 카드 위 글씨로 바로 보여야 한다: 펜이 뜨면 선이 안 나오고, 카드 자리를 잘못 알려 주면 글씨가 밖으로 나가고, 관절 이동이면 변이 휘고, 펜을 안 들면 글자 사이에 줄이 생긴다.
- 배우는 개념은 공장의 **실링 · 접착제 도포**와 같다: 정해진 길을 일정한 높이로, 곧게, 필요할 때만 닿으며 따라가기.

## 2. 실제 로봇은 어떻게 글씨를 쓰나 (조사)

### 2-1. 사례

| 분야 | 사례 | 내용 | 근거 |
| --- | --- | --- | --- |
| 행사 부스 | FotoMaster Draw Me Bot | 로봇 팔 + 종이 받침 + 마커. 설치 때 **종이 위치와 펜 누르는 힘을 먼저 보정**. 한 장 평균 40초 | [4] |
| 행사 부스 | Plotterpix | 사진을 찍어 펜으로 그려 주는 부스. 6×4 in 종이에 40초~3분 | [5] |
| 전시장 | 가와사키 로봇스테이지(국내) duAro | 방문객 얼굴을 인식해 초상화를 그림 | [1] |
| 시연 | DOBOT · 로케(Rokae) 서예 로봇 | 협동로봇이 붓으로 서예 시연(알리페이 박람회 2019, 베이징 2023) | [2][3] |
| 연구 | 서울대 SketcherX | 사람과 상호작용하며 개인 초상화를 그리는 로봇 | [6] |
| 베이커리 | Apex Baker-Bot · Epson · Unifiller | 케이크 위 크림 글씨 · 테두리. 노즐을 데워 굳지 않게, 케이크 높이를 재서 노즐 높이를 맞춤 | [7][8][9] |
| 공장 | 접착제 · 실링 도포 | 같은 '선 긋기'를 노즐로. 로봇 속도가 모서리에서 바뀌면 선(비드) 굵기가 바뀜 → 경로 · 속도 · 토출을 함께 맞춤 | [10][11][12][13] |

### 2-2. 공통 구조 (여러 사례에서 반복되는 것)

1. **보정 먼저**: 종이(작업물)가 어디에, 어느 높이에 있는지 로봇에게 알려 준다 [4][8].
2. **경로 따라가기**: 글자 · 그림은 점을 이은 길(획)이다. 펜이 닿은 채 가는 '그리기 이동'과 들고 가는 '빈 이동'이 번갈아 나온다.
3. **곧게 가기**: 획이 곧으려면 펜 끝이 직선으로 가야 한다(직선 이동). 도포 로봇도 같은 이유로 경로와 속도를 맞춘다 [10][11].
4. **손님과 주고받기**: 사람이 종이를 놓고 가져간다. 그동안 로봇은 기다린다.

### 2-3. 현장 모습 (장면을 꾸민 근거)

- 행사용 흰 테이블, 손님 쪽 앞판에 부스 이름 인쇄, 뒤에 배너 벽 [4][5].
- 로봇은 탁상형 협동로봇에 펜 홀더 [4]. 종이는 받침(우리: 눈금이 있는 커팅 매트) 위.
- 샘플 카드 보드, 여분 펜, 빈 카드 더미, 손님 쪽의 완성 표시 램프.

## 3. 시뮬레이터로 옮기는 원칙

- **실제 크기(1:1)**: 다른 셀은 큰 산업 로봇을 1/5로 줄였지만, 이 부스는 실제로 탁상형 로봇이 쓰므로 myCobot 280 그대로, 카드도 실제 120 × 80 mm 메시지 카드다. 사람 모델은 실제 크기라 카메라를 가리지 않도록 손님은 손만, 나머지 손님은 옆으로 줄을 세웠다.
- **글씨 = 펜 자국**: 시뮬레이터의 펜 규칙(펜 끝 높이 0.8 mm 이하에서만 자국, 스프링 1 mm까지 눌림)을 그대로 쓴다. 채점은 이 자국을 글귀의 정답 선과 비교한다.
- **좌표는 로봇 좌표**: 매트 눈금이 로봇의 x · y(mm)다. 학생은 눈금을 읽어 카드 모서리를 알려 준다(보정).
- **코드 없음**: 카드(카드 기다리기 · 카드 위치 · 펜 높이 · 쓰기 · 기본 자세 · 완성 알리기)가 셀 프로그램(`robot.move_to` …)을 만들고, 그 프로그램이 그대로 돈다.

## 4. 장비 모델 (상태와 신호)

| 이름 | 종류 | 동작 |
| --- | --- | --- |
| 카드 있음 | 입력 | 손님이 카드를 놓고 손을 빼면 켜짐, 가져가면 꺼짐 |
| 손 감지 | 입력 | 손님 손이 매트 위에 있는 1.5초 동안 켜짐 |
| 완성 램프 | 출력 | 켜면 손님이 카드를 가져감(1.5초), 다음 손님은 3초 뒤 새 카드를 놓음 |
| 인터록 | 안전 | 손이 있을 때 펜 끝이 카드(+10 mm) 위 60 mm 아래로 오면 정지 |

글귀: HELLO(104 × 30 mm) · 사랑해(100 × 30 mm) · 하트(50 mm) · 네모(56 mm). 카드 가운데에 놓인다.

## 5. 단계(차시) 구성과 각 단계의 근거

| 단계 | 할 일 | 시작 카드의 틀린 곳 | 배우는 개념 | 근거 · 측정 |
| --- | --- | --- | --- | --- |
| G1 | '사랑해' 카드 한 장 (둘러보기) | 없음 | 작업 흐름: 카드 받기 → 쓰기 → 완성 알리기 | [4] |
| G2 | 보정: 펜 높이 · 카드 위치 ('HELLO') | 펜이 3 mm 떠 있음 → 선이 안 나옴, 카드가 x 140 · y −60에 놓였는데 늘 쓰던 x 150 · y −40 기준 → 글씨가 밖으로 | 접촉 높이 · 작업물 좌표(원점) 보정 | [4] 설치 보정. 0.8 mm만 떠도 자국이 없다(시뮬레이터 펜 규칙) |
| G3 | 네모 그리기 | 관절 이동 → 변이 휨 | 관절 이동 vs 직선 이동 | 우리 측정: 관절 이동으로 50~60 mm 변을 그리면 2.0~3.4 mm 휘고 펜이 뜬다(쓴 비율 60%), 직선 이동은 0.5 mm 이내 |
| G4 | 펜 들기 · 손님 2명 '사랑해' | 펜을 내린 채 다음 획으로 → 글자 사이 선 134 mm | 그리기 이동 vs 빈 이동, 반복 · 손님과 주고받기(인터록) | 2-2의 2, [4] 한 장 40초 |

입문에 맞춰 6단계를 개념 중심 4단계로 묶었다(2026-11-04): 펜 높이와 카드 위치는 '보정' 한 단계로, 펜 들기와 손님 반복은 한 단계로.

채점 기준(코드: `draw.ts readInk · inkVerdict`):
- 또렷하게: 정답 선의 90% 이상에 1.2 mm 안으로 자국, 정답 선 밖(2 mm 넘게) 자국 3 mm 이하, 카드 밖 자국 2 mm 이하.
- 가운데: 글씨 가운데가 카드 가운데에서 3 mm 안. 곧은 변: 자국이 정답 선에서 1 mm 안.

## 6. 확인 필요

- 실물 myCobot 280 + 펜 홀더로 같은 카드를 써 보고, 시뮬레이터의 펜 규칙(0.8 mm · 스프링 1 mm)과 관절 이동 휨(2~3 mm)이 실제와 맞는지 확인.
- 행사 부스 한 장 시간(40초)은 업체 자료[4]다. 독립 측정은 아니다.
- 한글 글자 모양은 직선 · 타원으로 만든 단순한 획이다(붓글씨 굵기 변화 없음).

## 7. 참고 자료

1. Kawasaki Robotics, 로봇스테이지 안내(국문), 2016 — https://robotics.kawasaki.com/userAssets1/files/news/ko/20161014_kawasaki_K.pdf
2. DOBOT, "Calligraphy robot shows magic at Alipay's code vendor fair in Xi'an" — https://www.dobot-robots.com/insights/news/calligraphy-robot-shows-magic-at-alipays-code-vendor-fair-in-xian.html
3. China Daily, "Shandong-made calligraphy robot wows visitors in Beijing", 2023-11-12 — https://shandong.chinadaily.com.cn/2023-11/12/c_938268.htm
4. FotoMaster, Draw Me Bot 제품 · 설치 안내 — https://fotomaster.com/pages/draw-me-bot · https://support.fotomaster.com/en-US/draw-me-booth-setup-927694
5. Plotterpix, Drawing Bot Technology — https://plotterpix.com/
6. SketcherX (서울대), arXiv 2409.15292 — https://arxiv.org/pdf/2409.15292v1
7. Milling and Grain, "Baker-Bot Quad transforms bakery operations" (Apex Motion Control) — https://millingmea.com/baker-bot-quad-transforms-bakery-operations/
8. Epson, Cake Decorating case study — https://www.epson.co.th/case-study-cake-decorating
9. Trend Hunter, "The Unifiller HIRO Robot Supports High-Volume Bakery Scenarios" — https://www.trendhunter.com/trends/unifiller-hiro-robot
10. Universal Robots, Glue & Adhesive Application — https://www.universal-robots.com/industries/automotive-manufacturing/glue-adhesive-application/
11. US 2020/0078945, "Zero Teach for Robotic Continuous Path" — https://patents.justia.com/patent/20200078945
12. HVL Open, "Programming Fine Manufacturing Tasks on Collaborative Robots: A Case Study on Industrial Gluing", 2023 — https://hvlopen.brage.unit.no/hvlopen-xmlui/handle/11250/3125740
13. Frontiers in Robotics and AI, "Quick Setup of Force-Controlled Industrial Gluing Tasks Using Learning From Demonstration", 2021 — https://www.frontiersin.org/articles/10.3389/frobt.2021.767878
