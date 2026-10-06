# myCobot 280 RDK X5 3D model and accessories — third-party attribution

`rdkx5.glb` and the two URDF files in this directory are derived from the
`mycobot_description` package of Elephant Robotics' `mycobot_ros2` repository
(https://github.com/elephantrobotics/mycobot_ros2, `humble` branch).

- **License**: BSD 2-Clause. Full text in `LICENSE` in this directory.
- **Copyright**: Copyright (c) 2020, Elephant Robotics. All rights reserved.

## Parts included (one GLB node per source file)

| Node | Source |
| --- | --- |
| `joint1_rdkx5`, `joint2` … `joint7` | `urdf/mycobot_280_rdkx5/` — robot body |
| `gripper_base`, `gripper_left1..3`, `gripper_right1..3` | `urdf/adaptive_gripper/` — adaptive gripper |
| `pump_head`, `pump_box` | `urdf/mycobot_280_m5/` — suction pump |
| `camera_flange` | `urdf/mycobot_280_m5/` — camera flange |

`aikit.glb` is the AI Kit 2023 environment from Elephant Robotics' `mycobot_ros`
repository (https://github.com/elephantrobotics/mycobot_ros, noetic branch):
`mycobot_description/urdf/mycobot_280_pi/suit_env_v2.dae`, placed at the robot
base as `mycobot_280pi_with_vision_v2.urdf` places it, split into its parts
(plate, bins A-D, material box, camera post, camera head, pump box) and moved into
the robot base frame with the plate top at z = 0
(`robot-python/tools/convert_meshes.py kit`). The calibration board was left out (the
web app draws it with its ArUco markers).

- **License**: BSD 3-Clause. Full text in `LICENSE-mycobot_ros` in this directory.

`mycobot_280_rdkx5.urdf` and `mycobot_280_rdkx5_adaptive_gripper.urdf` are copied
verbatim. The pump and camera-flange mounting offsets come from
`mycobot_280_m5_with_pump.urdf` and `mycobot_280_m5_with_camera_flange.urdf`.

## What was changed

- Units: the source meshes mix millimetres (`<unit meter="0.001">`) and metres.
  The unit tag was applied so every node is in metres, and each part's size was
  checked against the range a real part can have.
- `joint5.dae` (a Rhino export trimesh cannot read) was read with assimp; assimp's
  Z-up rotation was undone so it sits in the same frame as the other meshes.
- Duplicate vertices merged, textures dropped (the viewer applies flat
  materials), geometry Draco-compressed.

Reproduce with `robot-python/tools/convert_meshes.py rdkx5` and `... kit` (repository root).

Accessories with no official mesh (parallel gripper, flexible gripper, pen
holder, phone holder, cylinder) are drawn by the web app as simplified shapes;
they are not part of this file.

BSD 2-Clause permits redistribution, including in a commercial product, with
the copyright notice, conditions and disclaimer retained. It grants no trademark
rights and does not imply endorsement by Elephant Robotics.

## Textures

`tex/joint2.jpg` … `tex/joint6.jpg` are the official texture images of the same meshes
(`mycobot_description/urdf/mycobot_280_rdkx5/joint2.png` … `joint6.png`, mycobot_ros2 `humble`,
BSD 2-Clause), re-saved as JPEG. They carry the cable connectors and the wrist's ATOM screen.
