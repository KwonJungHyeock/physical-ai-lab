# Dobot MG400 3D model — third-party attribution

The GLB and URDF files in this directory are derived from the `mg400_description` package of Dobot's
`mg400_ros` repository (https://github.com/Dobot-Arm/mg400_ros, commit 2bcf6a9, March 2024),
`meshes/*.STL` and `urdf/mg400_description.urdf`.

- **License**: MIT. Full text in `LICENSE` in this directory.
- **Copyright**: (c) 2022 Dobot.

## What was changed

- The nine STL meshes (metres) were merged into one glTF binary, one node per mesh file, named
  `mg400_base`, `mg400_link1`, `mg400_link2_1`, `mg400_link2_2`, `mg400_link3_1`, `mg400_link3_2`,
  `mg400_link4_1`, `mg400_link4_2`, `mg400_link5` (`robot-python/tools/convert_meshes.py mg400`), then welded,
  simplified to about a third of the triangles and Draco-compressed with glTF-Transform.
- Finish regions: each part's faces are split into child meshes the web app gives their own material (per
  Dobot's product photos; `convert_meshes.py` explains each rule): `<node>__pin` = the pin caps at the pivots,
  `mg400_link1__cover` = the J1 housing's smoked side covers (cut at |y| = 46 mm), `mg400_base__top` = the
  base box's black top panel, `mg400_base__led` = its LED ring, `mg400_link4_1__vent` = the head's vent slots.
  The geometry is unchanged.
- `mg400.urdf`: the official joints, origins, axes, limits, mimics and inertia; the collision meshes are left
  out and the mesh file names are the GLB's node names.
- Not yet in the simulator: its arm loader follows one chain, and the MG400's parallel rods are a second
  branch off link1 (j2_2 -> j3_2 -> j4_2).
