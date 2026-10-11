/**
 * Model solutions of the 대학 과제 (pyTasks.ts), one per task. Only the check
 * (tests/education/pytask-check.mts) imports this file: it runs each through Python to prove the
 * task can be passed. Nothing on the page imports it, so the answers are not shipped to students.
 */

import type { LabId } from '../park';
import type { SiteProblem } from './siteText';

export const PY_SOLUTIONS: Record<LabId, Record<SiteProblem, string>> = {
  factory: {
    1: `import math


def turn_j1(x, y, dq_deg):
    a = math.radians(dq_deg)
    return (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a))
`,
    2: `import math

BELT_X = 220


def max_sensor_y(reach_mm, box_len_mm):
    centre_y = math.sqrt(reach_mm ** 2 - BELT_X ** 2)
    return centre_y - box_len_mm / 2
`,
    3: `SENSOR_Y = 250
HALF_LEN = 30
PITCH = 600


def catch_plan(belt_mm_s, wait_y, down_s):
    box_s = (SENSOR_Y + HALF_LEN - wait_y) / belt_mm_s
    return (box_s - down_s, PITCH / belt_mm_s)
`,
  },
  logistics: {
    1: `Z1 = 58
SLOTS = [(109, -189), (61, -189), (109, -141), (61, -141)]


def place_point(k, pitch_mm, gap_mm):
    layer = (k - 1) // 4
    x, y = SLOTS[(k - 1) % 4]
    return (x, y, Z1 + layer * pitch_mm + gap_mm)
`,
    2: `import math

G = 9.81
F20 = 2.8


def carry_speed(mass_g, cup_d_mm, acc100):
    force = F20 * (cup_d_mm / 20) ** 2
    a = force / (mass_g / 1000) - G
    if a <= 0:
        return 0
    return min(100, 100 * math.sqrt(a / acc100))
`,
    3: `import math


def place_xy(ref_x, ref_y, theta_deg, dx, dy):
    t = math.radians(theta_deg)
    return (ref_x + math.cos(t) * dx - math.sin(t) * dy, ref_y + math.sin(t) * dx + math.cos(t) * dy)
`,
  },
  bio: {
    1: `import math


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def tilt_deg(rx, ry, rz):
    x, y, z = math.radians(rx), math.radians(ry), math.radians(rz)
    Rx = [[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]]
    Ry = [[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]]
    Rz = [[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]]
    R = matmul(Rz, matmul(Ry, Rx))
    c = max(-1.0, min(1.0, -R[2][2]))
    return math.degrees(math.acos(c))
`,
    2: `import math


def fit_j1_error(radii, misses):
    top = sum(r * e for r, e in zip(radii, misses))
    bottom = sum(r * r for r in radii)
    return math.degrees(top / bottom)
`,
    3: `import math

SRC = (150, 100)
DST = (150, -100)
CORNERS = [(150, -30), (150, 30)]
TUBE_R = 6


def point_seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def path_gap(vx):
    via = (vx, 0)
    d = min(point_seg(c, a, b) for c in CORNERS for a, b in [(SRC, via), (via, DST)])
    return d - TUBE_R
`,
  },
  farm: {
    1: `def hue_deg(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        return 0
    if mx == r:
        h = 60 * (g - b) / d
    elif mx == g:
        h = 120 + 60 * (b - r) / d
    else:
        h = 240 + 60 * (r - g) / d
    if h > 180:
        h -= 360
    return h
`,
    2: `MARKER_MM = 220
C_U, C_V = 320, 240
CAM_X, CAM_Y = 200, 20


def pixel_to_mm(u, v, marker_px):
    ratio = MARKER_MM / marker_px
    return ((v - C_V) * ratio + CAM_X, (u - C_U) * ratio + CAM_Y)
`,
    3: `K = 1.2
OVER = 0.03


def peak_force(d_real, d_seen, squeeze, speed):
    target = d_seen - squeeze
    depth = d_real - target + OVER * speed
    return K * max(0, depth)
`,
  },
  cafe: {
    1: `import math


def carry_time(dist_mm, vmax_mm_s, acc_m_s2):
    a = acc_m_s2 * 1000
    if vmax_mm_s ** 2 / a >= dist_mm:
        return 2 * math.sqrt(dist_mm / a)
    return dist_mm / vmax_mm_s + vmax_mm_s / a
`,
    2: `import math

HAND = 250
BRAKE = 2000


def max_zone_speed(detect_mm, react_s):
    # v² / 2a + v (t + h / a) + (h t - D) = 0
    A = 1 / (2 * BRAKE)
    B = react_s + HAND / BRAKE
    C = HAND * react_s - detect_mm
    if C >= 0:
        return 0
    return (-B + math.sqrt(B * B - 4 * A * C)) / (2 * A)
`,
    3: `import math

W_MAX = 200


def min_turn_time(dq_deg, inertia, tau_max):
    dq = abs(dq_deg)
    t_torque = math.sqrt(5.7735 * math.radians(dq) * inertia / tau_max)
    t_speed = 1.875 * dq / W_MAX
    return max(t_torque, t_speed)
`,
  },
  ai: {
    1: `def color_name(h, s, v, yellow_hi, green_lo):
    ranges = [
        ("yellow", (11, 85, 70), (yellow_hi, 255, 245)),
        ("red", (0, 43, 46), (8, 255, 255)),
        ("green", (green_lo, 43, 35), (90, 255, 255)),
        ("blue", (100, 43, 46), (124, 255, 255)),
        ("cyan", (78, 43, 46), (99, 255, 255)),
    ]
    for name, lo, hi in ranges:
        if all(a <= x <= b for x, a, b in zip((h, s, v), lo, hi)):
            return name
    return None
`,
    2: `import math

DEMOS = [(135, -25), (110, -55), (160, -55), (210, -55), (110, 0), (160, 0), (210, 0), (110, 55), (160, 55), (210, 55)]


def blend_xy(x, y, p):
    w = [1 / max(1e-6, math.hypot(x - dx, y - dy)) ** p for dx, dy in DEMOS]
    s = sum(w)
    return (sum(wi * d[0] for wi, d in zip(w, DEMOS)) / s, sum(wi * d[1] for wi, d in zip(w, DEMOS)) / s)
`,
    3: `CAM_X, CAM_Y = 165.5, 0.4
CAM_Z = 368


def parallax_fix(x, y, h):
    k = (CAM_Z - h) / CAM_Z
    return (CAM_X + (x - CAM_X) * k, CAM_Y + (y - CAM_Y) * k)
`,
  },
  energy: {
    1: `CAN_V = 200


def kind_of(h, s, v, clear_v):
    if s >= 43:
        if 11 <= h <= 34:
            return "pack"
        if 35 <= h <= 90:
            return "color"
        return None
    if v < CAN_V:
        return "can"
    if v < clear_v:
        return "clear"
    return "board"
`,
    2: `import math

G = 9.81


def piece_speed(mass_g, hold_n, mu, acc100):
    a = mu * (hold_n / (mass_g / 1000) - G)
    if a <= 0:
        return 0
    return min(100, 100 * math.sqrt(a / acc100))
`,
    3: `import math

SIZE = {"can": (32,), "clear": (50, 34), "color": (42, 28), "pack": (60, 40)}


def full_area(kind):
    s = SIZE[kind]
    return math.pi * (s[0] / 2) ** 2 if len(s) == 1 else s[0] * s[1]


def pick_order(kinds, areas):
    ratio = [a / full_area(k) for k, a in zip(kinds, areas)]
    return sorted(range(len(kinds)), key=lambda i: (-ratio[i], -areas[i]))
`,
  },
};
