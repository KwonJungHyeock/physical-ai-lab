# myAGV 3D models — third-party attribution

Both GLB files were converted from Elephant Robotics' official robot
descriptions (trimesh → GLB, Draco-compressed; wheels kept as separate nodes
`wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` so the simulator can turn them).

## `myagv2023.glb` — myAGV 2023 (Raspberry Pi / Jetson Nano)

- Body: `myagv_description/meshes/myagv_base.dae` and `myagv_up.dae` from
  https://github.com/elephantrobotics/myagv_ros2 (`galactic-JN` branch, commit afb054b).
  The same two files, byte for byte, are in `myagv_ros` (`myagv_ros_2023Pi` branch).
- Wheels: the mecanum wheel meshes of the Plus model below, scaled into the 2023
  body's wheel openings (the 2023 files have the wheels merged into the body).
- **License**: BSD 3-Clause, Copyright (c) 2024, Elephant Robotics. Full text in
  `LICENSE-myagv_ros2`.

## `myagvplus.glb` — myAGV Plus

- `myagv_plus_description/meshes/base_link.stl`, `laser_link.stl`,
  `wheel_{fl,fr,rl,rr}_link.stl` from
  https://github.com/elephantrobotics/myagv_plus_ros2 (commit 856b59e), placed as the
  package's xacro places them.
- **License**: BSD 3-Clause, Copyright (c) 2025, Elephant Robotics. Full text in
  `LICENSE-myagv_plus_ros2`.
