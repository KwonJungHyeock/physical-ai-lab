#!/usr/bin/env python3
"""Round-trip check of the hand camera's block positions (server/camera.py detect_hand).

Development tool, not run on the robot. Needs OpenCV and numpy. Draws blocks the official RDK X5
hand camera would see (the kit's camera matrix, distortion and EyesInHand pose, the arm at the kit's
photo pose, blocks of 25 mm on the table, also with the robot on a 50 mm base) with cv2.projectPoints,
runs detect_hand on that picture and checks each block comes back where it was put.

    python3 robot-python/tools/check_hand_camera.py
"""

import math
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))
import camera  # noqa: E402

# get_coords at the kit's photo pose, as the console's demo arm reports it (URDF forward kinematics)
PHOTO_COORDS = [188.0, -26.0, 232.2, -179.76, -3.07, -137.25]
COLORS_BGR = {"빨강": (30, 30, 220), "초록": (40, 180, 40), "파랑": (200, 60, 20), "노랑": (20, 210, 230)}


def picture(blocks, coords, top_z):
    """640 x 480 picture of square block tops (25 mm) at top_z, seen by the hand camera."""
    img = np.full((480, 640, 3), (150, 150, 145), np.uint8)
    cam = np.array(camera.hand_camera_pose(coords))
    world_to_cam = np.linalg.inv(cam)
    rvec, _ = cv2.Rodrigues(world_to_cam[:3, :3])
    tvec = world_to_cam[:3, 3]
    for color, (x, y) in blocks.items():
        h = 12.5
        corners = np.array([[x - h, y - h, top_z], [x + h, y - h, top_z], [x + h, y + h, top_z], [x - h, y + h, top_z]], np.float64)
        px, _ = cv2.projectPoints(corners, rvec, tvec, np.array(camera.HAND_K), np.array(camera.HAND_DIST))
        cv2.fillConvexPoly(img, np.round(px.reshape(-1, 2)).astype(np.int32), COLORS_BGR[color])
    return img


def check(name, blocks, coords, top_z):
    result = camera.detect_hand(picture(blocks, coords, top_z), coords, camera.HAND_TOOL_MM, top_z)
    worst = 0.0
    for d in result["detections"]:
        x, y = blocks[d["color"]]
        err = math.hypot(d["x"] - x, d["y"] - y)
        worst = max(worst, err)
        print(f"  {name}: {d['color']} at ({x}, {y}) → ({d['x']}, {d['y']})  {err:.1f} mm")
    assert len(result["detections"]) == len(blocks), f"{name}: found {len(result['detections'])} of {len(blocks)}"
    assert worst < 2.0, f"{name}: off by {worst:.1f} mm"
    return worst


def main():
    # where the photo pose looks: a little in front of the robot
    cam = camera.hand_camera_pose(PHOTO_COORDS)
    print(f"camera at ({cam[0][3]:.0f}, {cam[1][3]:.0f}, {cam[2][3]:.0f}) mm, looking {'down' if cam[2][2] < -0.9 else 'sideways'}")
    blocks = {"빨강": (140, -15), "초록": (190, -10), "파랑": (150, 40), "노랑": (190, 35)}
    w1 = check("table", blocks, PHOTO_COORDS, camera.BLOCK_TOP_MM)
    # robot on a 50 mm base: the table (and the block tops) are 50 mm lower in the robot's frame
    w2 = check("on a 50 mm base", blocks, PHOTO_COORDS, camera.BLOCK_TOP_MM - 50)
    print(f"hand camera round trip OK (worst {max(w1, w2):.1f} mm)")


if __name__ == "__main__":
    main()
