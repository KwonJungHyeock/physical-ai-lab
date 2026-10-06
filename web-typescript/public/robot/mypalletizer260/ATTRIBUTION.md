# mypalletizer260 3D model — third-party attribution

The GLB and URDF files in this directory are derived from the `mycobot_description` package of
Elephant Robotics' `mycobot_ros2` repository (https://github.com/elephantrobotics/mycobot_ros2,
`humble` branch), `urdf/mypalletizer_260_pi/`.

- **License**: BSD 2-Clause. Full text in `LICENSE` in this directory.
- **Copyright**: Copyright (c) 2020, Elephant Robotics. All rights reserved.

## What was changed

- The Collada meshes (base, link1–link4) were merged into one glTF binary, one node per mesh file,
  named `pal_base`, `pal_link1` … (`robot-python/tools/convert_meshes.py 260`), the declared units
  applied, then welded, simplified to about a quarter of the triangles and Draco-compressed with
  glTF-Transform.
- `mypalletizer_260.urdf`: the official joints, origins, axes and limits, plus the parallelogram
  linkage the official file leaves out — it fixes the head (link4) to the forearm, so the head
  tilted with joints 2 and 3. Two `<mimic>` joints (`joint3_level`, `joint2_level`) turn it back by
  −joint 3 and −joint 2, so it stays level and the tool points straight down, as on the real arm.
  The mesh paths point at the `pal_*` node names; the flange cylinder (link5) has no mesh.
