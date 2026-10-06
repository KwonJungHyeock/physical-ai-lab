[보고 #12] myAGV(이동 로봇) 조사 — 버전별 사양, 제어 방식, ROS 패키지, 공식 교육 순서, 시뮬레이터 설계안

■ 요약
 - myAGV 는 지금 5가지가 있음: 초기형(2021, Pi) · 2023 Pi · 2023 Jetson Nano · Plus(2026, 최신 교육용) · Pro(2025, 50kg급 산업용).
   교육 현장에 실제로 많이 있는 것은 2023 Pi / 2023 Jetson Nano, 새로 사면 Plus. Pro 는 크기·무게(40kg)상 책상 수업 대상이 아님
 - 모두 바퀴 4개 메카넘(앞뒤·옆·제자리 회전), 2D 라이다(8m), 카메라, IMU. 바퀴 배분은 바닥 보드가 하고, 위 컴퓨터는
   "앞뒤 속도·옆 속도·회전 속도" 3개만 보냄 → 시뮬레이터도 이 3개만 받으면 실물과 같은 방식
 - 공식 교육 순서: 전원·접속 → 블록(myBlockly) → 파이썬 → ROS 키보드 조종 → 지도 만들기(Gmapping) → 지도 위 자율 주행 →
   팔을 얹은 응용(ArUco 인식 → 지정 위치로 이동 → 팔로 집어 옮기기). 우리 3단계(초급 블록·중급 파이썬·고급 ROS 2)와 그대로 맞음
 - 제안: 제어 서버는 가장 많이 쓰이는 2023 Pi/JN 동작 기준(pymycobot MyAgv), 3D 모양은 Plus 공식 모델(바퀴 4개 따로, BSD-3)을 씀.
   시뮬레이터에서 새로 만들 것 = 메카넘 이동 · 바닥 지도 · 2D 라이다 · 주행 오차
 - 확인 요청: 수업에 쓸 myAGV 가 어느 버전인지 (2023 Pi / 2023 Jetson Nano / Plus). 버전에 따라 통신 방식과 ROS 버전이 다름
 - 확인됨 (2026-09-30): 수업용은 myAGV 2023 Pi.
 - 진행 (2026-09-30): 2023 Pi 기준으로 1차 구현 — 주행 콘솔(/agv)과 로봇 서버(agv_server.py),
   모델 선택(2023 Pi · JN · Plus). 실물 제어는 2023 Pi/JN(MyAgv 이동 명령 확인: pymycobot 4.0.7 myagv.py),
   Plus 는 시뮬레이션만. 사용법은 manuals/myagv/agv-console.md, 구현 내용은 보고 #11 의 4-6

 조사 방법: 이 작업 환경에서 제조사 누리집(elephantrobotics.com, docs.elephantrobotics.com)이 막혀 있어, 같은 내용이 올라가 있는
 제조사 GitHub(문서 원본 myAGV-docs · myagvPro_docs · myagvPlus_docs, 코드 myagv_ros · myagv_ros2 · myagv_plus_ros2 ·
 agv_pro_ros2 · pymycobot)를 기준으로 했음. 검색 결과 요약으로만 본 값은 "(검색 요약)", 못 찾은 값은 "미확인" 으로 적음.

■ 1. 버전별 사양

 | | 초기형 (2021) | 2023 Pi | 2023 Jetson Nano | Plus (2026) | Pro (2025) |
 |---|---|---|---|---|---|
 | 컴퓨터 | Raspberry Pi 4B | Raspberry Pi 4B 4GB | Jetson Nano B01 4GB | Jetson Orin Nano Super 8GB | Jetson Orin Nano |
 | 운영체제 | 미확인 | Ubuntu 20.04 | Ubuntu 20.04 | Ubuntu 22.04 | Ubuntu 22.04 |
 | ROS | ROS 1 Melodic | ROS 1 Noetic | ROS 1 Noetic + ROS 2 Galactic | ROS 2 Humble | ROS 2 Humble |
 | 크기 · 무게 | 300×205×145mm · 3.02kg | 약 311×230×110mm (검색 요약) · 4.16kg | Pi 와 같음 | 5kg 미만 · 크기 미확인 | 530×360×245mm · 40kg |
 | 적재 | 미확인 | 5kg | 5kg | 8kg | 50kg |
 | 최고 속도 | 0.9m/s | 0.9m/s | 0.9m/s | 1.6m/s | 1.5m/s (적재 시) |
 | 구동 | 메카넘 4륜 | 메카넘 4륜, 유성 감속 BLDC | 같음 | 메카넘 4륜, FOC BLDC | 전방향, 서스펜션 (바퀴 형식 미확인) |
 | 배터리 | 미확인 | 주행 181분 · 대기 328분, 보조 배터리 6400mAh(선택) | 같음 | 미확인 | 24V 20Ah, 5~6시간 |
 | 라이다 | 미확인 | YDLIDAR X2L, 360°, 0.12~8m | 같음 | 360°, 0.12~8m (모델 미확인) | 선택: 2D 15m / 3D |
 | 카메라 | 5MP | 5MP, 65° | 8MP, 77° | 8MP, 77° | 선택: 깊이 카메라 |
 | 가격 | — | 약 $1,045 (검색 요약) | 약 $1,430 (검색 요약) | 미확인 | 미확인 |

 - 2023 Pi/JN 은 지금도 관리 중(ROS 1 저장소 2026-09 갱신). Plus 는 2026년 새 교육용, ROS 2 저장소가 활발히 갱신 중
 - "2022 Jetson Nano" 제품은 찾지 못함. 첫 Jetson Nano 판은 2023 JN

■ 2. 로봇에게 명령하는 방식

 1) 2023 Pi / JN (바닥 보드 ESP32, 가장 흔한 판)
    - 위 컴퓨터 ↔ 바닥 보드: 시리얼 115200. Pi 는 /dev/ttyAMA2, JN(ROS 2) 은 /dev/ttyS0
    - 이동 명령 8바이트: FE FE 01 0B [앞뒤] [옆] [회전] [합계]
      각 값 = 속도×100 + 128 (앞뒤·옆 m/s, 회전 rad/s, 각각 ±1.0 까지, 0.01 단위)
    - 바닥 보드가 보내는 상태: 실제 속도 3개, 가속도·자이로, 주·보조 배터리 전압, 자세(roll·pitch·yaw).
      펌웨어 v1.0 은 27바이트, v1.1 부터 43바이트 (바이트 위치 세부는 미확인)
    - 주행 거리 계산(odom): 방향은 IMU yaw, 위치는 보고된 속도를 시간으로 적분 → 시간이 지나면 조금씩 어긋남(공식 FAQ 도 인정)
 2) 파이썬 (pymycobot MyAgv) — 초·중급 수업의 기본 API
    - MyAgv('/dev/ttyAMA2', 115200)
    - 이동: go_ahead · retreat · pan_left · pan_right · clockwise_rotation · counterclockwise_rotation (speed 1~127, timeout 초), stop()
      → 0.1초마다 명령을 보내다가 timeout 이 끝나면 스스로 멈춤 (그동안 다음 줄로 안 넘어감). 거리·각도 명령은 없음 = 시간 × 속도
    - 불빛: set_led(모드, r, g, b), set_led_mode · 상태: get_mcu_info()(배터리) · 기타: restore()(모터 멈춤 복구), 자이로·펌웨어 버전
    - speed 단위는 문서에 없음. 이동 명령 형식으로 보면 10 ≈ 0.1m/s 로 추정 (실측 필요)
 3) Plus / Pro — 새 방식, 단위가 m/s · rad/s 로 명확
    - Plus: MyAGVPlus(port="/dev/ttyACM0", 921600) · move_forward/backward, move_left/right_lateral (0.01~1.60m/s),
      turn_left/right (0.01~7.27rad/s), stop, 불빛·팬·펌프·입출력 핀, get_wifi_ip
    - Pro: MyAGVPro(1,000,000bps, 소켓·블루투스판도 있음) · move_forward 0~1.5m/s, 전원 켜기/끄기, 비상정지 상태, 입출력 1~6

■ 3. ROS 패키지와 3D 모델

 | 저장소 | 대상 · ROS | 라이선스 | 3D 모델 | 비고 |
 |---|---|---|---|---|
 | myagv_ros | 2023 Pi/JN · ROS 1 Noetic | 표기 없음(TODO) | myAGV.urdf + DAE 3개(몸체·윗판·전체). 바퀴·센서 없음 | 키보드·패드 조종, Gmapping, move_base 자율 주행, 팔 연동 예제 |
 | myagv_ros2 | 2023 JN · ROS 2 Galactic | BSD-3 | 위와 같은 2개 부품 모델 | Gmapping, Nav2, EKF(robot_localization) |
 | myagv_plus_ros2 | Plus · ROS 2 Humble | BSD-3 | xacro + STL(몸체·라이다·바퀴 4개) | 바퀴 반지름 0.04m, 바퀴 간격 앞뒤 0.233m·좌우 0.239m, 메카넘 컨트롤러, Gazebo(Ignition)·Isaac Sim |
 | agv_pro_ros2 | Pro · ROS 2 Humble | BSD-3 | URDF + STL | Gazebo, 3D 라이다 SLAM, 자동 충전 |

 - 공식 명령(2023 Pi, ROS 1): 라이다 전원 ./start_ydlidar.sh → roslaunch myagv_odometry myagv_active.launch →
   roslaunch myagv_teleop myagv_teleop.launch (i , j l u o k 키) → roslaunch myagv_navigation myagv_slam_laser.launch (지도 만들기) →
   rosrun map_server map_saver → roslaunch myagv_navigation navigation_active.launch (지도 위 주행)
 - ROS 2(JN): ros2 launch myagv_odometry myagv_active.launch.py → slam_gmapping → teleop_twist_keyboard →
   nav2_map_server map_saver_cli → ros2 launch myagv_navigation2 navigation2_active.launch.py map:=…
 - 좌표 이름(실물과 맞출 것): map · odom · base_footprint · laser_frame(Plus 는 laser_link) · imu_link · camera_link,
   명령 토픽 cmd_vel, 결과 odom · scan · imu
 - 2023 판에는 Gazebo 모델이 없음. Plus·Pro 에는 있음

■ 4. 팔을 얹는 구성 (복합 로봇)
 - 윗판에 레고 키 또는 M4 나사 4개로 앞·뒤에 고정, 전원은 myAGV 의 12V 5A 출력
 - 제어: 둘 다 같은 Wi-Fi → 팔에서 pymycobot 소켓 서버, myAGV 가 팔에 소켓으로 명령 (예: 목적지에 도착하면 팔 동작)
 - 2023 판에 얹는 팔: myCobot 280 Pi/M5/JN, myPalletizer 260, myCobot 270 M5, myArm 300 Pi
 - 공식 응용 예제 흐름: ArUco(QR) 인식 → 지정 위치로 주행 → 팔로 집어 옮기기 → 우리 280 실습·AI 키트와 자연스럽게 이어짐

■ 5. 공식 교육 순서 (2023 Pi 문서 목차 기준)
  1. 전원 켜고 확인  2. 접속(핫스팟·VNC·SSH)  3. 블록 코딩(myBlockly: 불빛·이동)  4. 펌웨어(myStudio)  5. 앱(AGV_UI)
  6. 파이썬 API  7. ROS 기초  8. 키보드·게임패드 조종  9. 지도 만들기(Gmapping)  10. 지도 위 자율 주행
  11. 응용: 280 Pi 소켓 제어 → ArUco 인식·운반, 280 M5·JN, 270 M5 게임패드
 - JN 은 여기에 Cartographer, RTAB-Map(라이다+3D 카메라), ROS 2 Gmapping·Nav2 추가
 - Plus: 블록(불빛·이동·입출력) → 파이썬 → ROS 2 → 조종 → Gmapping → Nav2 → RTAB-Map → 게임패드+팔 → 사람 따라가기
 - 선 따라가기(라인 트레이싱) 공식 강의는 찾지 못함

■ 6. 현장에서 주의할 점 (공식 FAQ·코드)
 - 라이다는 먼저 전원을 켜야 함(./start_ydlidar.sh, GPIO 20). JN 이미지에 이 스크립트 폴더가 빠진 경우가 있음
 - 기본 핫스팟 ElephantRobotics_AP_XXXX, 주소 10.42.0.1(인터넷 없음), 계정 er / Elephant
 - 바닥 보드 펌웨어(v1.0·1.1·1.2)와 운영체제 이미지가 짝이 맞아야 함 (상태 메시지 길이가 다름). 확인: cat /etc/version
 - 주행 오차: 목적지 근처에서 맴돌거나 여러 지점을 돌면 오차가 쌓임. 공식 권장: 지도 만들 때 직진 0.2m/s·회전 0.4rad/s,
   도착 허용 오차 +0.05
 - 라이다가 뒤집혀 달려 있음(좌표 변환에 roll 180°). 직접 처리하면 좌우가 뒤집혀 보임
 - pymycobot 이동 명령은 끝날 때까지 기다림 → 수업 화면의 [정지] 가 바로 듣게 하려면 서버에서 따로 처리해야 함

■ 7. 우리 시뮬레이터 설계안
 1) 기준
    - 명령·속도·한계: 2023 Pi/JN (0.9m/s, 명령 ±1.0, 0.01 단위, 라이다 8m) — 학교에 가장 많고 pymycobot MyAgv 가 이 판용
    - 3D 모양: Plus 공식 모델(바퀴 4개 따로 돌릴 수 있음, BSD-3). 2023 판 DAE 는 바퀴가 몸체와 한 덩어리.
      2023 판 모양이 꼭 필요하면 제조사 STEP 파일을 변환
    - 수업용 버전을 확인하면 Plus 쪽 API(m/s 단위)도 같은 화면에서 고를 수 있게 "로봇 프로필"로 분리
 2) 새로 만들 것
    - 메카넘 이동: 앞뒤·옆·회전 속도로 위치를 적분(실물 바닥 보드와 같은 방식), 바퀴는 ω = (vx ∓ vy ∓ (lx+ly)·wz)/r 로 돌려 보이기
    - 바닥 지도: 교실 크기 격자 지도(벽·장애물·목적지 표시). 공식 지도 형식(map.pgm + map.yaml)으로 저장·불러오기
    - 2D 라이다: 360°, 0.12~8m, 초당 약 7바퀴를 격자 지도에 광선 쏘기로 계산, 3D 에 점으로 표시
    - 주행 오차: 방향이 조금씩 틀어지는 오차를 넣어 "지도로 위치 바로잡기(AMCL)"의 필요를 보여 줌
    - 충돌: 몸체 사각형과 벽·장애물 충돌 시 멈춤 (팔과 같은 "부딪히면 실행 전 검사" 원칙)
 3) 실습 단계 (공식 순서 + 우리 3단계)
    - 초급(블록): 불빛 → 앞뒤·옆·회전 N초 → 사각형 그리기 → 장애물 피해 목적지 도착
    - 중급(파이썬 MyAgv): 같은 과제를 go_ahead·pan_left… 로, 라이다 거리 읽고 멈추기, 벽 따라가기
    - 고급(ROS 2): cmd_vel 로 조종 → 지도 만들기 → Nav2 로 목적지 주행. 좌표·토픽 이름을 실물과 같게 해서 launch 파일이 그대로 쓰이게
    - 응용: 280 을 얹은 복합 로봇 — ArUco 인식 → 주행 → 팔로 집기 (이미 만든 280·AI 키트 시뮬레이터 재사용)
 4) 로봇 서버 (로봇 안, 280 과 같은 구조)
    - 표준 라이브러리 + pymycobot MyAgv, 같은 화면 규칙: 0.1초마다 상태, 유지 신호가 끊기면 멈춤, [정지] 는 즉시
    - 이동 명령이 끝날 때까지 기다리는 pymycobot 대신 짧은 간격 명령 반복으로 바로 멈출 수 있게
 5) 작업량 가늠 (280 Pi·Arduino 대비)
    - 280 Pi·Arduino: 팔·3D·기구학 그대로, 연결 방식만 추가 → 작음
    - myAGV: 3D 장면(바닥·지도), 이동·라이다·충돌, 실습 목록, 서버를 새로 → 큼. 먼저 "로봇 프로필"(모델별 설정 묶음)을 만들어 두면
      280 Pi·Arduino·myAGV·다른 팔이 같은 틀에 들어감

■ 8. 확인이 필요한 것
 - 수업용 myAGV 버전(2023 Pi / 2023 Jetson Nano / Plus)과 펌웨어 버전(cat /etc/version)
 - 실물이 있으면 실측: pymycobot speed 값과 실제 m/s 관계, 배터리 전압 범위, 라이다 초당 회전 수
 - 미확인: 초기형의 운영체제·라이다, Plus·Pro 가격, Pro 바퀴 형식, 상태 메시지 바이트 위치

■ 출처 (제조사 GitHub)
 - 2023 문서: github.com/elephantrobotics/myAGV-docs (MYAGV_PI_2023_EN · MYAGV_JN_2023_EN)
 - Plus 문서: github.com/elephantrobotics/myagvPlus_docs · Pro 문서: github.com/elephantrobotics/myagvPro_docs
 - ROS: github.com/elephantrobotics/myagv_ros (브랜치 myagv_ros_2023Pi · myagv_ros_2023JN · melodic-devel),
   myagv_ros2 (galactic-JN), myagv_plus_ros2, agv_pro_ros2, myagv_plus_isaac_sim
 - 파이썬: github.com/elephantrobotics/pymycobot (pymycobot/myagv.py, docs/MyAGVPro_en.md)
 - 초기형: github.com/elephantrobotics/myAGV-en (2022-03 보관 처리)
