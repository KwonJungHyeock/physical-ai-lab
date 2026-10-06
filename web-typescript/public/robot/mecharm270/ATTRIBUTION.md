# mecharm270 3D model — third-party attribution

The GLB and URDF files in this directory are derived from the `mycobot_description` package of
Elephant Robotics' `mycobot_ros2` repository (https://github.com/elephantrobotics/mycobot_ros2,
`humble` branch).

- **License**: BSD 2-Clause. Full text in `LICENSE` in this directory.
- **Copyright**: Copyright (c) 2020, Elephant Robotics. All rights reserved.

## What was changed

- The Collada meshes were merged into one glTF binary, one node per mesh file
  (`robot-python/tools/convert_meshes.py 270`), the declared units applied, then welded,
  simplified to about a quarter of the triangles and Draco-compressed with glTF-Transform.
