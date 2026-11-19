# 에셋 출처 · 라이선스 장부

프로젝트에 들여온 외부 에셋을 한 줄씩 적는다. 허용 라이선스는 CC0 · MIT · BSD · Apache (CC0 우선).
에셋 라이브러리(`C:\work\physical-ai-assets`)에서 가져온 것은 그 `catalog.json` 값을, 원 출처에서 바로 받은 것은 저장소 주소와 커밋을 적는다.
(같은 모델이 나중에 라이브러리에도 있으면 출처 URL로 같은 것인지 확인하고, 한 줄로 합친다.)

## 1장 수행평가 사진 6장 (파트 18, 2026-11-19)

원 출처(GitHub)에서 바로 받아 한 자세로 조립한 GLB(`assets/models/test1/`)를 같은 배경 · 같은 각도 · 같은 크기 · 한 가지 회색으로 렌더함
(`robot-python/tools/build_test_photo_models.py` → `web-typescript/tools/build/test-photos/`). 로고 · 회사 색은 보이지 않음.
결과는 `web-typescript/public/course/assets/test1-photo1~6.png`.

| 파일 | 모델 | 출처 URL (커밋) | 작성자 | 라이선스 | 받은 날 | 쓰는 곳 |
| --- | --- | --- | --- | --- | --- | --- |
| `assets/models/test1/mycobot.glb` | myCobot 280 RDK X5 (협동로봇) | https://github.com/elephantrobotics/mycobot_ros2 (humble, d42ff61) `mycobot_description/urdf/mycobot_280_rdkx5` | Elephant Robotics | BSD 2-Clause (`licenses/mycobot_ros2.LICENSE`) | 2026-11-19 | test1-photo1 |
| `assets/models/test1/drone.glb` | Skydio X2 (드론) | https://github.com/google-deepmind/mujoco_menagerie (370c439) `skydio_x2` | Skydio · Google DeepMind | Apache 2.0 (`licenses/skydio_x2.LICENSE`) | 2026-11-19 | test1-photo2 |
| `assets/models/test1/doosan.glb` | Doosan A0509 (협동로봇) | https://github.com/doosan-robotics/doosan-robot2 (humble, 385f2a2) `dsr_description2/mujoco_models/a0509` | Doosan Robotics | BSD 3-Clause (`licenses/doosan-robot2.LICENSE`) | 2026-11-19 | test1-photo3 |
| `assets/models/test1/mobile.glb` | myAGV 2023 (이동 로봇) | 이 저장소 `web-typescript/public/robot/myagv/myagv2023.glb` (원 출처 https://github.com/elephantrobotics/myagv_ros2) | Elephant Robotics | BSD (`licenses/myagv_ros2.LICENSE`) | 2026-11-19 | test1-photo4 |
| `assets/models/test1/quadruped.glb` | ANYmal C (4족 로봇) | https://github.com/google-deepmind/mujoco_menagerie (370c439) `anybotics_anymal_c` | ANYbotics | BSD 3-Clause (`licenses/anymal_c.LICENSE`) | 2026-11-19 | test1-photo5 |
| `assets/models/test1/rainbow.glb` | Rainbow Robotics RB5-850E (협동로봇) | https://github.com/RainbowRobotics/rbpodo_ros2 (5e8294a) `rbpodo_description/robots/rb5_850e_u.urdf` | Rainbow Robotics | Apache 2.0 (`licenses/rbpodo_description.LICENSE`) | 2026-11-19 | test1-photo6 |
