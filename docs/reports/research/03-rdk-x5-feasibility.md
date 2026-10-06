[보고 #3] myCobot 280 RDK X5 — Python·ROS2 제어툴 + 시뮬 연동 가능성 검토

■ 결론
가능합니다. 난이도 중.
공식 SDK·ROS2 패키지가 뼈대의 절반 이상을 이미 제공합니다.
다만 "시뮬↔실기 연동"의 공식 구현은 품질이 낮고, 공식 Gazebo는 RDK X5 미지원 + 지원 종료된
Gazebo Classic 기반이라 이 두 곳은 직접 만들어야 합니다.

■ 전제 변경 확인 (중요)
지시서 #1·#2는 "280 AR(M5 ATOM), RDK 아님, PC가 호스트·로봇은 시리얼 슬레이브" 전제였습니다.
RDK X5는 구조가 반대입니다.
- 로봇 안에 리눅스 컴퓨터(D-Robotics RDK X5, 8GB, 10 TOPS)가 있고 ROS2가 로봇 위에서 돕니다.
- 서보 제어: 온보드 UART /dev/ttyS1, 1,000,000 baud (AR은 USB 115200)
- PC → 로봇: USB 시리얼이 아니라 네트워크(공식 TCP 서버 포트 30002 / ROS2 DDS)
→ Web Serial 스파이크(#1)는 RDK X5에 그대로 쓰이지 않습니다. 브라우저 연동은 rosbridge(WebSocket)로 바뀝니다.
→ 재사용 가능: 웹 3D 트윈·FK·IK(#2). URDF 차이가 J1 높이 +8mm뿐이고,
  #2에서 채택한 관절한계가 SDK의 RDK X5 한계와 정확히 같습니다.

■ 공식 코드로 확인한 사실 (문서가 아니라 코드 기준)
- OS/ROS: Ubuntu 22.04 + ROS2 Humble. mycobot_ros2 humble 브랜치, 2026-09-08 커밋(활발)
- Python: pymycobot 4.0.7 MyCobot280RDKX5(시리얼), MyCobot280RDKX5Socket(원격 TCP)
- 원격 서버: pymycobot/demo/Server_280_RDKX5.py (로봇에서 실행, 0.0.0.0:30002)
- ROS2 패키지: mycobot_280_rdkx5 (슬라이더/키보드/GUI/실기 수신),
               mycobot_280rdkx5_moveit2 (MoveIt2 설정),
               mycobot_280_moveit2_control/sync_plan_rdkx5.py (시뮬→실기)
- URDF: mycobot_description/urdf/mycobot_280_rdkx5/ (그리퍼 버전 포함)
- 라이선스: BSD 2-Clause (Elephant Robotics) — 상용 재배포 가능, #2와 동일

■ 요구사항별 판정
 요구사항            | 판정 | 근거
 Python 제어         | 즉시 | pymycobot 공식 클래스 (온보드 시리얼 / 원격 소켓 둘 다)
 ROS2 제어툴         | 즉시 | 공식 humble 패키지 + MoveIt2 설정 존재
 코드 업로드·실행    | 가능 | 로봇이 리눅스라 코드가 로봇 위에서 직접 실행됨 (배포 방식은 설계 필요)
 시뮬레이터          | 이식 | 공식 Gazebo는 M5 전용·Gazebo Classic → RDK X5 + 신형 Gazebo로 이식 필요
 시뮬↔실기 연동      | 재작성 | 공식 구현 있으나 품질 부족 (아래)

■ 공식 연동 구현의 한계 (직접 만들어야 하는 부분)
1) MoveIt2 → 실기: ros2_control 하드웨어가 mock_components/GenericSystem
   (설정 파일 주석: "This won't work on real hardware").
   실기는 별도 노드가 joint_states 메시지마다 send_angles(각도, 속도 80)를 호출하는 방식.
   궤적 타이밍·완료 피드백이 없어 "대략 따라가는" 수준.
   → 해결: ros2_control 하드웨어 인터페이스(또는 FollowJointTrajectory 액션 서버)를 새로 작성.
2) 실기 → 시뮬: get_angles 10Hz 발행. 코드 주석상 30Hz에서 10Hz로 낮춘 이력이 있음.
   시리얼 한 줄을 파일락으로 공유하는 구조라 대역폭이 병목. 실측 필요.
3) Gazebo: 공식 브랜치(280m5_gazebo_humble)는 M5 URDF + Gazebo Classic(2025-01-31 지원 종료),
   ros2_control도 mock. → RDK X5 URDF로 교체 + Gazebo Fortress/Harmonic + gz_ros2_control로 이식.

■ 시뮬레이터 선택 (학교 환경 기준)
- Gazebo Fortress/Harmonic: ROS2 표준. 단 우분투 필요(윈도우는 WSL2) → 교사·개발용
- 웹 3D 트윈(#2에서 구현): 브라우저만 있으면 됨 → 학생용, 우리 차별점
- MuJoCo: URDF 직접 로드, 윈도우 가능, 강화학습에 강함 → 확장 옵션
- Isaac Sim: RTX GPU 필요 → 학교 부적합
→ 권장: Gazebo(개발) + 웹 트윈(학생)이 같은 ROS2 토픽을 공유하는 구조

■ 시장 비교 (간단)
 제품                   | 가격          | ROS2 | 시뮬           | 비고
 myCobot 280 RDK X5     | $830 (공식몰) | 공식 | RDK X5용 없음  | 온보드 10 TOPS, 8GB
 Hiwonder JetArm        | 미확인        | 있음 | MoveIt/Gazebo  | Jetson 기반
 Yahboom DOFBOT         | 약 $409(구)   | 있음 | -              | 저가 서보
 SO-101 (LeRobot)       | 약 $110~300   | 비주력 | MuJoCo 강함  | 2026 로봇러닝 표준 저가 팔
→ RDK X5 강점: 온보드 AI + 공식 ROS2 + 정밀도(±0.5mm).
  약점: 시뮬 생태계는 SO-101(MuJoCo)·JetArm(Gazebo)보다 얇음 → 우리가 채울 공간.

■ 권장 구조
 [학생 브라우저: 웹 트윈 + 코드 에디터]
        │ WebSocket (rosbridge)
 [RDK X5 온보드 ROS2 Humble]
   ├ rosbridge_server
   ├ 하드웨어 인터페이스 (/dev/ttyS1, 1Mbps)  ← 신규
   ├ MoveIt2 move_group
   └ /joint_states → 웹 트윈 · Gazebo 공통
 [개발 PC: Ubuntu 22.04 + Gazebo Harmonic]  ← RDK X5 URDF로 이식

■ 단계 제안
 P0  실기기에서 공식 데모 재현 (slider_control, listen_real, MoveIt 동기화) + 지연 실측
 P1  하드웨어 인터페이스 + 궤적 추종 (연동 품질의 핵심)
 P2  Gazebo 이식 (RDK X5 URDF, Fortress/Harmonic)
 P3  rosbridge ↔ 웹 트윈 연결, 학생 코드 실행·업로드 경로

■ 결정 필요
 1) 실기기(RDK X5) 보유 여부 — P0 이후는 실기 없이는 검증 불가
 2) 기존 280 AR(M5) 트랙: 대체인지 병행인지 (Web Serial 스파이크 존속 여부가 갈림)
 3) 학생이 돌리는 시뮬레이터: 웹 트윈(브라우저) / Gazebo(우분투) 중 무엇
 4) "코드 업로드"의 의미: 학생 코드를 로봇에서 실행 / 리포에 업로드 / 둘 다

■ 출처
 공식 코드: github.com/elephantrobotics/mycobot_ros2 (humble), github.com/elephantrobotics/pymycobot,
            PyPI pymycobot 4.0.7
 제품: elephantrobotics.com/en/mycobot-280-rdk-x5, shop.elephantrobotics.com/products/mycobot-280-rdk-x5
 Gazebo 지원종료: therobotreport.com (Gazebo Classic EOL), gazebosim.org 마이그레이션 문서
 시장: amazon.com Hiwonder JetArm, roboticscenter.ai SO-101
 ※ docs.elephantrobotics.com 은 이 환경에서 네트워크 차단되어 열람하지 못했습니다.
