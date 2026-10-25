# OMX-F 3D model — third-party attribution

The GLB and URDF files in this directory are derived from the `open_manipulator_description` package of
ROBOTIS' `open_manipulator` repository (https://github.com/ROBOTIS-GIT/open_manipulator, commit ee9a720,
October 2026), `meshes/omx_f/` and `urdf/omx_f/omx_f.urdf`.

- **License**: Apache License 2.0. Full text in `LICENSE` in this directory.
- **Copyright**: ROBOTIS Co., Ltd.

## What was changed

- The eight follower STL meshes (millimetres) were merged into one glTF binary, one node per mesh file,
  named `omx_base`, `omx_link1` … `omx_link5`, `omx_finger1`, `omx_finger2`
  (`robot-python/tools/convert_meshes.py omx`), scaled to metres, then welded, simplified to about a third
  of the triangles and Draco-compressed with glTF-Transform.
- `omx_f.urdf`: the official joints, origins and axes. The gripper joints are left out of the arm (the
  simulator draws the two fingers as the arm's tool and turns them with the gripper command); a fixed
  `flange` link is added on link5 for the simulator's tools; the joint limits are the servo position
  limits from `ros2_control/omx_f.ros2_control.xacro` (joint2 −107° to 95°, joint3 −90° to 96°) instead of
  the file's ±2π, joints 1, 4 and 5 ±180°.
- `../thumbs/omx-f.png` and `../parts/omx.png` are renders of these meshes.
