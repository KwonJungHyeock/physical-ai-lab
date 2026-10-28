"""Official Collada meshes -> one Draco-ready GLB per robot profile.

Development tool, not run on the robot. Needs `pip install trimesh pycollada`
and a clone of elephantrobotics/mycobot_ros2 (for RDK X5) or mycobot_ros (for M5 and
the AI Kit 2023 model).

    python3 convert_meshes.py rdkx5 --description <clone>/mycobot_description/urdf -o rdkx5.glb
    python3 convert_meshes.py kit   --description <clone>/mycobot_description/urdf -o aikit.glb
    python3 convert_meshes.py 320   --description <clone>/mycobot_description/urdf -o mycobot320.glb   (also 280bases, 270, 260, p340)
    python3 convert_meshes.py omx   --description <open_manipulator clone>/open_manipulator_description/meshes -o omx_f.glb
    python3 convert_meshes.py mg400 --description <Dobot-Arm/mg400_ros clone>/mg400_description/meshes -o mg400.glb
    npx gltf-pipeline -i rdkx5.glb -o rdkx5.draco.glb -d --draco.compressionLevel 10

Each source mesh becomes one GLB node named after its file, so the web app can
look parts up by the names the URDF uses. The result is copied into
web-typescript/public/robot/<profile>/ (see ATTRIBUTION.md there).

UNITS. The official meshes do not share a unit: some declare
<unit meter="0.001"> (millimetres), others meter="1". Collada readers are meant
to honour the tag; trimesh does not, so it is applied here. Because a wrong tag
would silently produce a part 1000x off, every mesh's final size is also checked
against the size range a real myCobot 280 part can have, and the run fails if
any mesh falls outside it.

UNREADABLE FILES. A few meshes (e.g. the RDK X5 joint5.dae, a Rhino export using
<polygons> and <instance_node>) come back empty from trimesh. Those are read with
the assimp command-line tool instead. assimp already applies the unit tag, but it
also rotates Z_UP files into Y-up, (x, y, z) -> (x, z, -y); that rotation is undone
so the geometry is in the same raw frame as every other mesh (and as the URDF
visual origins expect). Verified: for files both readers handle, assimp+undo
matches trimesh's bounds to 0.1 mm.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np

import trimesh
from trimesh.transformations import euler_matrix

PROFILES = {
    # myCobot 280 RDK X5 body + the accessories that have official meshes.
    "rdkx5": [
        "mycobot_280_rdkx5/joint1_rdkx5",
        "mycobot_280_rdkx5/joint2",
        "mycobot_280_rdkx5/joint3",
        "mycobot_280_rdkx5/joint4",
        "mycobot_280_rdkx5/joint5",
        "mycobot_280_rdkx5/joint6",
        "mycobot_280_rdkx5/joint7",
        "adaptive_gripper/gripper_base",
        "adaptive_gripper/gripper_left1",
        "adaptive_gripper/gripper_left2",
        "adaptive_gripper/gripper_left3",
        "adaptive_gripper/gripper_right1",
        "adaptive_gripper/gripper_right2",
        "adaptive_gripper/gripper_right3",
        "mycobot_280_m5/pump_head",
        "mycobot_280_m5/pump_box",
        "mycobot_280_m5/camera_flange",
    ],
    # Other myCobot 280 boards: the bases that differ from the RDK X5 / M5 sets (the links are
    # shared — Pi and Jetson Nano use the RDK X5 links, Arduino the M5 links).
    "280bases": [
        "mycobot_280_pi/joint1_pi",
        "mycobot_280_jn/joint1_jet",
        ("mycobot_280_arduino/joint1", "joint1_arduino"),
        "mycobot_280_pi/G_base",
    ],
    # myCobot 320 (2022): one link set, two bases (Pi, M5).
    "320": [
        ("mycobot_320_pi_2022/base", "base_pi"),
        ("mycobot_320_m5_2022/base", "base_m5"),
        "mycobot_320_pi_2022/link1",
        "mycobot_320_pi_2022/link2",
        "mycobot_320_pi_2022/link3",
        "mycobot_320_pi_2022/link4",
        "mycobot_320_pi_2022/link5",
        "mycobot_320_pi_2022/link6",
    ],
    # mechArm 270 (Pi set; the M5 version has the same joint layout).
    "270": [
        "mecharm_270_pi/base",
        "mecharm_270_pi/link1",
        "mecharm_270_pi/link2",
        "mecharm_270_pi/link3",
        "mecharm_270_pi/link4",
        "mecharm_270_pi/link5",
        "mecharm_270_pi/link6",
    ],
    # myPalletizer 260 (Pi): 4 axes, the end kept level by a parallelogram linkage. Node names get a
    # prefix: plain base/link1… are also mechArm 270's.
    "260": [
        ("mypalletizer_260_pi/base", "pal_base"),
        ("mypalletizer_260_pi/link1", "pal_link1"),
        ("mypalletizer_260_pi/link2", "pal_link2"),
        ("mypalletizer_260_pi/link3", "pal_link3"),
        ("mypalletizer_260_pi/link4", "pal_link4"),
    ],
    # ultraArm P340: 3 axes driving the arm (the 4th turns the tool), end kept level.
    "p340": [
        ("ultraArm_p340/ultraArm-base", "ua_base"),
        ("ultraArm_p340/ultraArm-1", "ua_link1"),
        ("ultraArm_p340/ultraArm-2", "ua_link2"),
        ("ultraArm_p340/ultraArm-3", "ua_link3"),
    ],
    # ROBOTIS OMX-F (follower), ROBOTIS-GIT/open_manipulator (Apache 2.0): STL in millimetres, read
    # from open_manipulator_description/meshes (pass that folder as --description).
    "omx": [
        ("omx_f/follower_01_base.stl", "omx_base"),
        ("omx_f/follower_02_base_tilt_Revised.stl", "omx_link1"),
        ("omx_f/follower_03_middle_verticle.stl", "omx_link2"),
        ("omx_f/follower_04_middle_horizontal.stl", "omx_link3"),
        ("omx_f/follower_05_tip.stl", "omx_link4"),
        ("omx_f/follower_06_pan_Revised.stl", "omx_link5"),
        ("omx_f/follower_07_gripper_motorized.stl", "omx_finger1"),
        ("omx_f/follower_08_gripper_gear.stl", "omx_finger2"),
    ],
    # Dobot MG400 (4 axes, parallel linkage), Dobot-Arm/mg400_ros (MIT): STL in metres, read from
    # mg400_description/meshes (pass that folder as --description). The third item is the unit.
    "mg400": [
        ("base_link.STL", "mg400_base", 1.0),
        ("link1.STL", "mg400_link1", 1.0),
        ("link2_1.STL", "mg400_link2_1", 1.0),
        ("link2_2.STL", "mg400_link2_2", 1.0),
        ("link3_1.STL", "mg400_link3_1", 1.0),
        ("link3_2.STL", "mg400_link3_2", 1.0),
        ("link4_1.STL", "mg400_link4_1", 1.0),
        ("link4_2.STL", "mg400_link4_2", 1.0),
        ("link5.STL", "mg400_link5", 1.0),
    ],
    # The original M5 set used by the /spike/twin page.
    "m5": [
        "mycobot_280_m5/G_base",
        "mycobot_280_m5/joint1",
        "mycobot_280_m5/joint2",
        "mycobot_280_m5/joint3",
        "mycobot_280_m5/joint4",
        "mycobot_280_m5/joint5",
        "mycobot_280_m5/joint6",
        "mycobot_280_m5/joint7",
    ],
}

# Largest dimension a single part (or accessory) can plausibly have — a 320 or mechArm link is
# bigger than a 280's, but nothing on these desktop arms is over 35 cm.
MIN_PART_M, MAX_PART_M = 0.005, 0.35
UNIT_RE = re.compile(rb'<unit[^>]*meter\s*=\s*"([0-9.eE+-]+)"')


UNDO_ASSIMP_Z_UP = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float)


def load_with_assimp(path):
    """Returns a mesh in metres, in the file's own (un-rotated) frame."""
    if not shutil.which("assimp"):
        sys.exit(f"{path}: trimesh read no geometry and the assimp CLI is not installed (apt install assimp-utils)")
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "mesh.stl")
        subprocess.run(["assimp", "export", path, out, "-ptv"], check=True, capture_output=True)
        mesh = trimesh.load(out, force="mesh")
    with open(path, "rb") as f:
        z_up = b"Z_UP" in f.read(8192)
    if z_up:
        mesh.apply_transform(UNDO_ASSIMP_Z_UP)
    return mesh


def declared_unit(path):
    with open(path, "rb") as f:
        m = UNIT_RE.search(f.read(8192))
    return float(m.group(1)) if m else 1.0


# --- AI Kit environment ------------------------------------------------------
#
# The AI Kit 2023 (the proposal's "AI 로봇 확장 키트") as Elephant Robotics
# models it: mycobot_280_pi/suit_env_v2.dae in elephantrobotics/mycobot_ros
# (noetic branch, BSD 3-Clause; created December 2022). mycobot_280pi_with_vision_v2.urdf
# places it with origin xyz (0.16, 0, 0), rpy (0, 0, pi); its plate top is 4.2 mm
# below that origin and is moved to z = 0 here (the robot stands on the plate).
# The file is in millimetres. Each Collada object keeps its identity (trimesh's
# scene dump), is moved into the robot base frame, and is grouped by where it sits.
#
# Groups (robot frame, mm; A-D named by the official drop points in aikit_V2
# AiKit_280PI/scripts/aikit_color.py, which all fall inside these bins):
#   plate          base plate 396 x 510 x 8
#   bin_A..bin_D   four identical open-front parts bins, 99.8 x 79.2 x 60
#                  A (130.0, 171.1)  B (6.5, 170.9)  C (256.7, -154.1)  D (132.8, -152.5)
#   box_spare      material box 134.8 x 122.5 x 60 at (250.5, 181.4)
#   camera_post    2020 aluminium post (305.5, 0.4), 400 high, with its feet and bracket
#   camera_head    horizontal arm and the camera, lens about 368 above the plate at (165.5, 0.4)
#   pump_box       suction pump box and its stand behind the robot on the -y side
# Left out: the calibration board 150 x 150 at (160.3, 0.4) (the web app draws it
# with its ArUco markers).
KIT_ENV = "mycobot_280_pi/suit_env_v2"
KIT_ORIGIN_MM = (160.0, 0.0, 0.0)   # urdf env origin, yaw pi
PLATE_TOP_MM = -4.2                 # plate top in the model's frame
KIT_DROPS = {"A": (115.8, 177.3), "B": (-6.9, 173.2), "C": (238.8, -124.1), "D": (132.2, -136.9)}


def kit_group(c, e):
    """Group name for an object with centre c and extent e (mm, robot frame), or None to drop it."""
    x, y, z = c
    if max(e[0], e[1]) > 300:
        return "plate"
    if abs(x - 160) < 10 and abs(y) < 10 and abs(e[0] - 150) < 2 and e[2] < 10:
        return None                                   # calibration board
    if abs(e[0] - 99.6) < 1.5 and abs(e[1] - 79) < 1.5 and abs(e[2] - 60) < 1:
        return "bin_" + min(KIT_DROPS, key=lambda k: (KIT_DROPS[k][0] - x) ** 2 + (KIT_DROPS[k][1] - y) ** 2)
    if abs(e[0] - 134.8) < 1.5 and abs(e[1] - 122.5) < 1.5:
        return "box_spare"
    if z > 300 and x < 290:
        return "camera_head"
    if x > 280 and abs(y) < 45:
        return "camera_post"
    if x < 70 and y < -90:
        return "pump_box"
    return None


def convert_kit(description, output):
    path = os.path.join(description, KIT_ENV + ".dae")
    scene = trimesh.load(path)
    to_robot = np.eye(4)
    to_robot[0, 0] = to_robot[1, 1] = -1.0            # yaw pi
    to_robot[:3, 3] = [KIT_ORIGIN_MM[0], KIT_ORIGIN_MM[1], -PLATE_TOP_MM]
    to_robot[:3, :] /= 1000.0                           # mm -> m (and keeps rotation scaled consistently)
    to_robot[3, 3] = 1.0
    groups, dropped = {}, []
    for part in scene.dump():
        part = part.copy()
        part.apply_transform(to_robot)
        b = part.bounds * 1000
        name = kit_group((b[0] + b[1]) / 2, b[1] - b[0])
        if name is None:
            dropped.append([round(v, 1) for v in (b[0] + b[1]) / 2])
            continue
        groups.setdefault(name, []).append(part)
    out, report = trimesh.Scene(), {}
    for name, parts in sorted(groups.items()):
        g = trimesh.util.concatenate(parts)
        b = g.bounds * 1000
        report[name] = {"parts": len(parts), "faces": int(len(g.faces)),
                        "min_mm": [round(v, 1) for v in b[0]], "max_mm": [round(v, 1) for v in b[1]]}
        print(f"{name:13s} parts={len(parts):3d} faces={len(g.faces):6d} "
              f"x {b[0][0]:7.1f}..{b[1][0]:6.1f}  y {b[0][1]:7.1f}..{b[1][1]:6.1f}  z {b[0][2]:6.1f}..{b[1][2]:6.1f}")
        out.add_geometry(g, node_name=name, geom_name=name)
    print(f"dropped {len(dropped)} objects (calibration board and anything unplaced): {dropped[:8]}")
    out.export(output)
    with open(os.path.splitext(output)[0] + ".report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nwrote {output} ({os.path.getsize(output)} bytes)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("profile", choices=sorted(PROFILES) + ["kit"])
    ap.add_argument("--description", required=True, help="path to mycobot_description/urdf (open_manipulator_description/meshes for omx, mg400_description/meshes for mg400)")
    ap.add_argument("-o", "--output", required=True)
    args = ap.parse_args()
    if args.profile == "kit":
        convert_kit(args.description, args.output)
        return

    scene = trimesh.Scene()
    report, bad = {}, []
    for entry in PROFILES[args.profile]:
        # An entry is a mesh path, or (path, node name) when two sources share a file name, or
        # (path, node name, unit) for an STL that is not in millimetres.
        rel, name = entry[:2] if isinstance(entry, tuple) else (entry, os.path.basename(entry))
        if rel.lower().endswith(".stl"):
            # STL has no unit tag: ROBOTIS's URDF scales these by 0.001 (millimetres); Dobot's are in metres.
            path, unit = os.path.join(args.description, rel), entry[2] if isinstance(entry, tuple) and len(entry) > 2 else 0.001
        else:
            path = os.path.join(args.description, rel + ".dae")
            unit = declared_unit(path)
        mesh = trimesh.load(path, force="mesh")
        reader = "trimesh"
        if mesh.is_empty:
            mesh, reader, unit = load_with_assimp(path), "assimp", 1.0   # assimp applied the unit already
        raw = float(max(mesh.extents))
        if unit != 1.0:
            mesh.apply_scale(unit)
        mesh.merge_vertices()
        mesh.remove_unreferenced_vertices()
        size = float(max(mesh.extents))
        ok = MIN_PART_M <= size <= MAX_PART_M
        if not ok:
            bad.append(name)
        report[name] = {"reader": reader, "unit": unit, "raw_max_extent": round(raw, 4), "max_extent_m": round(size, 4),
                        "faces": int(len(mesh.faces)), "dae_bytes": os.path.getsize(path), "ok": ok}
        print(f"{name:16s} {reader:7s} unit={unit:<6g} raw={raw:9.4f} -> {size:7.4f} m  faces={len(mesh.faces):6d} {'' if ok else '<-- OUT OF RANGE'}")
        scene.add_geometry(mesh, node_name=name, geom_name=name)

    if bad:
        sys.exit(f"\nRefusing to write: implausible part size for {', '.join(bad)}. Check the unit tags.")
    scene.export(args.output)
    with open(os.path.splitext(args.output)[0] + ".report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nwrote {args.output} ({os.path.getsize(args.output)} bytes)")


if __name__ == "__main__":
    main()
