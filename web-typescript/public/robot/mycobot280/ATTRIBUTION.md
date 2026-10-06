# myCobot 280 (M5) 3D model — third-party attribution

`mycobot280.glb` and `mycobot_280_m5.urdf` in this directory are derived from
the `mycobot_description` ROS package of Elephant Robotics' `mycobot_ros`
repository (https://github.com/elephantrobotics/mycobot_ros).

- **License**: BSD 2-Clause. Full text in `LICENSE` in this directory.
- **Copyright**: Copyright (c) 2020, Elephant Robotics. All rights reserved.
- **Upstream package**: `mycobot_description` version 0.3.0
  (`package.xml` declares `<license>BSD</license>`; the package ships the
  BSD 2-Clause text reproduced in `LICENSE`).

## What was changed

- The eight source Collada meshes for the `mycobot_280_m5` variant
  (`G_base.dae`, `joint1.dae` … `joint7.dae`) were merged into a single glTF
  binary, one named node per URDF link.
- `G_base.dae` declares `<unit meter="0.001" name="Millimeters"/>` while
  `joint1.dae` … `joint7.dae` are in metres. That unit tag was applied during
  conversion, so every mesh in the GLB is in metres. (A Collada reader that
  ignores the tag — trimesh does — loads the base 1000× oversized.)
- Duplicate vertices were merged and unreferenced vertices dropped (lossless
  for rendering), then the geometry was Draco-compressed.
- Source textures were dropped; the viewer applies flat materials instead.
- `mycobot_280_m5.urdf` is copied verbatim; mesh references are resolved to the
  GLB node names at load time rather than by rewriting the file.

The conversion is reproducible with `robot-python/tools/convert_meshes.py` in this
repository.

BSD 2-Clause permits redistribution in source and binary form, including in a
commercial product, provided the copyright notice, the conditions and the
disclaimer are retained — which is the purpose of this file and `LICENSE`.
Note that the license grants no trademark rights: it does not permit implying
endorsement by Elephant Robotics.

## Other boards (bases.glb, tex/)

`bases.glb` holds the bases that differ between myCobot 280 boards — `joint1_pi` (Raspberry Pi),
`joint1_jet` (Jetson Nano), `joint1_arduino` (Arduino; upstream `mycobot_280_arduino/joint1.dae`) and
`G_base` — from `mycobot_ros2` (humble, BSD 2-Clause), converted like the other models
(`robot-python/tools/convert_meshes.py 280bases`, then simplified and Draco-compressed). The Pi, Jetson
Nano and Arduino URDFs are the upstream files; the Arduino one points its base at `joint1_arduino`.
`tex/joint1.jpg` … `joint6.jpg` are the M5 set's official textures (`mycobot_280_m5/*.png`) as JPEG.
