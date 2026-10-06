/**
 * The AI Kit ("AI 로봇 확장 키트") laid out exactly as Elephant Robotics ships
 * it, in the robot base frame, millimetres (x forward, y left, z up — the frame
 * pymycobot's coordinates use), with the top of the kit's base plate at z = 0.
 *
 * The kit is the AI Kit 2023 (the proposal's "AI 로봇 확장 키트": four identical
 * open-front bins and a material box).
 *
 * Where every number comes from:
 *   [M] the official AI Kit 2023 model mycobot_description/urdf/mycobot_280_pi/suit_env_v2.dae
 *       (elephantrobotics/mycobot_ros, BSD-3, December 2022), placed at the robot
 *       base as mycobot_280pi_with_vision_v2.urdf does; split into parts by
 *       robot-python/tools/convert_meshes.py kit, and measured there by ray casts
 *   [C] the official kit programs, elephantrobotics/aikit_V2
 *       AiKit_280PI/scripts/aikit_color.py and elephantrobotics/AiKit_UI main.py
 *   [P] the official kit camera photo aikit_V2/AiKit_280PI/res/takephoto.jpeg,
 *       measured with OpenCV's ArUco detector
 *   [S] Elephant Robotics' AI Kit 2023 announcement (camera specification)
 *   [E] estimate — to be replaced by a measurement of the real kit
 *       (see docs/reports/research/07-ai-kit.md, "실물에서 잴 것")
 */

export const BLOCK_MM = 25; // [C] official pick height z=103 + pump 89.3 mm => 25 mm cube top

export type ColorName = '빨강' | '노랑' | '초록' | '파랑';

/**
 * Block colours, chosen so each falls inside the official HSV range for its
 * colour [C] (OpenCV units: red H 0–8, yellow 11–59, green 35–90, blue 100–124).
 * Pure red at hue ~358° would fall outside the official red range (it does not
 * wrap), so the red here is slightly orange, like the painted wooden blocks.
 */
export const COLORS: readonly { name: ColorName; hex: string }[] = [
  { name: '빨강', hex: '#d63a26' },
  { name: '노랑', hex: '#f2c230' },
  { name: '초록', hex: '#2e9e5b' },
  { name: '파랑', hex: '#2c55c9' },
];

export const COLOR_HEX: Record<ColorName, string> = Object.fromEntries(COLORS.map((c) => [c.name, c.hex])) as Record<
  ColorName,
  string
>;

/** Base plate [M]: 396 x 510 x 8 mm acrylic. The bins sit in cut-outs down to the desk. */
export const PLATE = { xMin: -55.7, xMax: 340.5, yMin: -249.6, yMax: 260.4, topZ: 0, thickness: 8 };
/** Desk surface under the kit [M] (underside of the plate and the bins). */
export const DESK_Z = -8;

/** Calibration board [M]: white 150 mm square, flush with the plate. */
export const CAL_BOARD = { x: 160.3, y: 0.4, size: 150 };

/**
 * The two ArUco markers (DICT_6X6_250) on the board's diagonal corners [P]:
 * ids 1 and 2, centres 55 mm from the board centre on each axis, so
 * |dx| + |dy| between them = 220 mm — the constant the official code divides by
 * (`self.ratio = 220.0 / ratio`) [C]. Black square side ~21 mm [P].
 */
export const MARKER_MM = 21;
export const MARKER_SPAN_MM = 220;
export const MARKERS = [
  { id: 1, x: CAL_BOARD.x - 55, y: CAL_BOARD.y + 55 },
  { id: 2, x: CAL_BOARD.x + 55, y: CAL_BOARD.y - 55 },
] as const;

/** 6x6 inner bits of DICT_6X6_250 markers, row by row, 1 = white (cv2.aruco.generateImageMarker). */
export const ARUCO_6X6: Record<number, string> = {
  0: '000111100011110111011000001010100110',
  1: '000011101111101110100011100010010001',
  2: '000101011001000001111110101011001101',
  3: '110010010001101100110000011010011110',
};

export type BinName = 'A' | 'B' | 'C' | 'D';

/**
 * A tub of the kit, for collisions: its footprint, its cavity, and its walls.
 * The kit's bins are open-front parts bins: sides and back rise to `rimZ`, the
 * wall facing the robot only to `lipZ`, and the side walls step down to the lip
 * over the front `lipDepth` millimetres [M].
 */
export interface Tub {
  /** Outside footprint: centre and size, mm [M]. */
  outer: { x: number; y: number; sx: number; sy: number };
  /** Cavity: centre and size, mm [M]. */
  x: number;
  y: number;
  innerX: number;
  innerY: number;
  /** Top of the side and back walls; inside floor, mm [M]. */
  rimZ: number;
  floorZ: number;
  /** Front (robot-facing) wall: its top, how far back the low part reaches, and which way the robot is in y. */
  lipZ: number;
  lipDepth: number;
  toRobot: 1 | -1;
}

export interface Bin extends Tub {
  name: BinName;
  /** Drop point in the official program (flange, M5/PI frame) [C]. */
  official: { x: number; y: number; z: number };
  /**
   * Where "분류함 위로 가기" goes: the official drop x/y, except C, moved 10 mm
   * into the bin so a 25 mm block clears the front wall (the official point is
   * 7 mm inside it).
   */
  drop: { x: number; y: number };
}

/** The four bins [M]: 99.8 x 79.2 x 60 outside, cavity 85 x 66, back wall 52, front lip 34.7, floor -6. */
function bin(name: BinName, ox: number, oy: number, official: Bin['official'], drop: Bin['drop']): Bin {
  const toRobot = oy > 0 ? -1 : 1;
  return {
    name,
    outer: { x: ox, y: oy, sx: 99.8, sy: 79.2 },
    x: ox,
    y: oy + toRobot * 4, // cavity: 37 mm to the front wall, 29 mm to the back wall
    innerX: 85,
    innerY: 66,
    rimZ: 52,
    floorZ: -6,
    lipZ: 34.7,
    lipDepth: 18,
    toRobot,
    official,
    drop,
  };
}

/**
 * Sorting targets. A and B on the robot's left, C and D on its right; the
 * official colour program sends red to D, green to C, blue to A and yellow to B
 * [C]. Each official drop point falls inside the matching bin of the model [M].
 */
export const BINS: Record<BinName, Bin> = {
  A: bin('A', 130.0, 171.1, { x: 115.8, y: 177.3, z: 210.6 }, { x: 115.8, y: 177.3 }),
  B: bin('B', 6.5, 170.9, { x: -6.9, y: 173.2, z: 201.5 }, { x: -6.9, y: 173.2 }),
  C: bin('C', 256.7, -154.1, { x: 238.8, y: -124.1, z: 204.3 }, { x: 238.8, y: -134.1 }),
  D: bin('D', 132.8, -152.5, { x: 132.2, y: -136.9, z: 200.8 }, { x: 132.2, y: -136.9 }),
};
export const BIN_NAMES: readonly BinName[] = ['A', 'B', 'C', 'D'];

/** Height of a tub's wall at y (the front part is lower), mm. */
export function wallTopAt(t: Tub, y: number): number {
  const front = t.outer.y + (t.toRobot * t.outer.sy) / 2;
  return Math.abs(y - front) < t.lipDepth ? t.lipZ : t.rimZ;
}

/** Official colour -> bin mapping (aikit_color.py: red 0 = D, green 1 = C, blue 2 = A, yellow 3 = B) [C]. */
export const COLOR_TO_BIN: Record<ColorName, BinName> = { 빨강: 'D', 초록: 'C', 파랑: 'A', 노랑: 'B' };

/**
 * Kit camera, looking straight down. Image "up" points at the robot and image
 * "right" is +y — the orientation the official pixel-to-robot formula assumes:
 * x = (v - c_v) * ratio + camera_x, y = (u - c_u) * ratio + camera_y [C].
 *
 * Position [M]: the camera body hangs from the stand's arm centred at
 * (165.5, 0.4), its underside 368 mm above the plate.
 * Field of view [S]+[E]: the AI Kit 2023 camera is sold as 1920 x 1080 at 30 fps,
 * "110°, no distortion", 2.8 mm lens; the official software captures 640 x 480
 * (AiKit_UI main.py). Taking 110° as the diagonal of the 16:9 sensor and
 * 640 x 480 as its centre 4:3, the picture spans 86.1° across and 70° down.
 * Whether 110° is diagonal and how the camera makes 4:3 are not published —
 * the console can fit these to a photo from the real camera (see calibration).
 * The official pipeline does not depend on them: it measures the scale from the
 * two markers in every frame.
 */
export const TOP_CAMERA = { x: 165.5, y: 0.4, z: 368, hfovDeg: 86.1, width: 640, height: 480 };

/**
 * Camera flange's USB camera at 640 x 480, the size every official example
 * captures. The datasheet only says "about 60°" (not whether horizontal or
 * diagonal); Elephant Robotics' own RDK X5 vision kit calibrates it at
 * fx = 639.5 px (mycobot280RDKX5_vision_kit color_demo.py), which is 53.2°
 * across — the value used here.
 */
export const HAND_CAMERA = { hfovDeg: 53.2, width: 640, height: 480 };

/** Vertical field of view for three.js cameras, from a horizontal one. */
export function verticalFov(hfovDeg: number, width: number, height: number): number {
  return (2 * Math.atan(Math.tan((hfovDeg * Math.PI) / 360) * (height / width)) * 180) / Math.PI;
}

/** Collision boxes of the camera stand [M], mm. */
export const STAND_BOXES = [
  { xMin: 295.5, xMax: 315.5, yMin: -9.6, yMax: 10.4, zMin: -8, zMax: 400, name: '카메라 거치대 기둥' },
  { xMin: 276.2, xMax: 315.5, yMin: -28.9, yMax: 29.7, zMin: -8, zMax: 19.3, name: '카메라 거치대 받침' },
  { xMin: 250.5, xMax: 295.5, yMin: -9.6, yMax: 10.4, zMin: 360.7, zMax: 400, name: '카메라 거치대 팔' },
  { xMin: 135.5, xMax: 250.5, yMin: -29.6, yMax: 30.4, zMin: 360.7, zMax: 403, name: '키트 카메라' },
];

/**
 * Blocks start in a 2 x 2 group on the calibration board, 50 mm apart, with a
 * white margin of ~7 mm to the markers: OpenCV's ArUco detector (the one the
 * robot runs) needs the white quiet zone around a marker intact, and a 25 mm
 * block also leans outward in the overhead image by a few millimetres.
 */
export const BLOCK_START: Record<ColorName, { x: number; y: number }> = {
  빨강: { x: 135, y: -25 },
  노랑: { x: 135, y: 25 },
  초록: { x: 185, y: -25 },
  파랑: { x: 185, y: 25 },
};

/**
 * The material box (134.8 x 122.5 x 60, far corner on the +y side) [M] is where
 * the blocks live when a tool that does not pick them is fitted, so the board
 * is clear to draw or press on. Cavity 108.8 x 100.8, floor 2.2 [M].
 */
export const STORAGE_BOX: Tub = {
  outer: { x: 250.5, y: 181.4, sx: 134.8, sy: 122.5 },
  x: 250.5,
  y: 179.1,
  innerX: 108.8,
  innerY: 100.8,
  rimZ: 60,
  floorZ: 2.2,
  lipZ: 60,
  lipDepth: 0,
  toRobot: -1,
};
export const BLOCK_STORED: Record<ColorName, { x: number; y: number }> = {
  빨강: { x: STORAGE_BOX.x - 18, y: STORAGE_BOX.y - 22 },
  노랑: { x: STORAGE_BOX.x - 18, y: STORAGE_BOX.y + 22 },
  초록: { x: STORAGE_BOX.x + 18, y: STORAGE_BOX.y - 22 },
  파랑: { x: STORAGE_BOX.x + 18, y: STORAGE_BOX.y + 22 },
};

/**
 * Official observation pose ("init the point") [C]: the arm folds back over the
 * base so the camera sees the whole board. Every program starts here.
 */
export const HOME_DEG = [0.61, 45.87, -92.37, -41.3, 2.02, 9.58];

/**
 * Hand camera's photo pose: the arm leans out and the camera flange looks
 * down at the table in front of the robot. Elephant Robotics' RDK X5 vision
 * kit (mycobot280RDKX5_vision_kit color_demo.py `photo_angles`).
 */
export const HAND_PHOTO_DEG = [12.48, -8.78, -60.9, -22.85, -1.75, 59.76];

/** Clearance above a block for "위로 가기", mm above its top. */
export const ABOVE_MM = 60;
/** Clearance of a held block's bottom above a bin rim when dropping, mm. */
export const DROP_CLEARANCE_MM = 15;

/** Push button for the cylinder exercise — not part of the kit, shown only with the cylinder. */
export const BUTTON = { x: CAL_BOARD.x, y: CAL_BOARD.y, radiusMm: 13, heightMm: 18, travelMm: 4 };

/** "블록 섞기" keeps blocks on the board (the camera only looks there), clear of the markers. */
export const SHUFFLE_AREA = { xMin: 100, xMax: 220, yMin: -60, yMax: 60, markerClearanceMm: 34 };
/** Centre-to-centre spacing so open gripper fingers fit between neighbouring blocks. */
export const MIN_BLOCK_SPACING_MM = 45;

export function randomBlockLayout(rng: () => number = Math.random): Record<ColorName, { x: number; y: number }> {
  const A = SHUFFLE_AREA;
  for (;;) {
    const placed: { x: number; y: number }[] = [];
    for (let attempt = 0; attempt < 400 && placed.length < COLORS.length; attempt += 1) {
      const p = {
        x: Math.round(A.xMin + rng() * (A.xMax - A.xMin)),
        y: Math.round(A.yMin + rng() * (A.yMax - A.yMin)),
      };
      const ok =
        MARKERS.every((m) => Math.hypot(m.x - p.x, m.y - p.y) > A.markerClearanceMm) &&
        placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= MIN_BLOCK_SPACING_MM);
      if (ok) placed.push(p);
    }
    if (placed.length === COLORS.length) {
      return Object.fromEntries(COLORS.map((c, i) => [c.name, placed[i]])) as Record<ColorName, { x: number; y: number }>;
    }
  }
}

/** Is (x, y) over a bin's opening (with `margin` mm to spare on each side)? */
export function binAt(x: number, y: number, margin = 0): Bin | null {
  for (const n of BIN_NAMES) {
    const b = BINS[n];
    if (Math.abs(x - b.x) <= b.innerX / 2 - margin && Math.abs(y - b.y) <= b.innerY / 2 - margin) return b;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Arm-only theme: the robot on a plain desk, no kit                          */
/* -------------------------------------------------------------------------- */

/** "AI 키트" = the kit as shipped; "로봇팔 단독" = the arm alone on a desk (desk top = z 0). */
export type Theme = 'kit' | 'arm';
export const THEMES: readonly { id: Theme; name: string }[] = [
  { id: 'kit', name: 'AI 키트' },
  { id: 'arm', name: '로봇팔 단독' },
];

/** Work mat printed on paper in front of the robot (arm-only theme), mm. */
export const ARM_MAT = { xMin: 60, xMax: 280, yMin: -150, yMax: 150 };

/** Place squares on the mat ("자리 1".."자리 4"), where blocks are carried to. */
export const SPOT_NAMES = ['자리 1', '자리 2', '자리 3', '자리 4'] as const;
export type SpotName = (typeof SPOT_NAMES)[number];
export const SPOTS: Record<SpotName, { x: number; y: number }> = {
  '자리 1': { x: 130, y: -100 },
  '자리 2': { x: 190, y: -100 },
  '자리 3': { x: 130, y: 100 },
  '자리 4': { x: 190, y: 100 },
};
/** A spot counts a block as placed when its centre is within this distance, mm. */
export const SPOT_TOLERANCE_MM = 12;

export function spotAt(x: number, y: number): SpotName | null {
  for (const n of SPOT_NAMES) if (Math.hypot(x - SPOTS[n].x, y - SPOTS[n].y) <= SPOT_TOLERANCE_MM) return n;
  return null;
}

/** Arm-only theme: blocks not needed by the fitted tool wait at the back corner of the desk. */
export const ARM_STORED: Record<ColorName, { x: number; y: number }> = {
  빨강: { x: -20, y: 190 },
  노랑: { x: 20, y: 190 },
  초록: { x: -20, y: 230 },
  파랑: { x: 20, y: 230 },
};

/** The upright pose, every joint at its zero mark: what zero calibration makes true. */
export const ZERO_DEG = [0, 0, 0, 0, 0, 0];

/* --- the arm-only layout per arm ----------------------------------------- */

const LAYOUT_BASE = {
  mat: { ...ARM_MAT },
  spots: Object.fromEntries(SPOT_NAMES.map((n) => [n, { ...SPOTS[n] }])) as Record<SpotName, { x: number; y: number }>,
  blocks: Object.fromEntries(COLORS.map((c) => [c.name, { ...BLOCK_START[c.name] }])) as Record<ColorName, { x: number; y: number }>,
  button: BUTTON.x,
  shuffle: { xMin: SHUFFLE_AREA.xMin, xMax: SHUFFLE_AREA.xMax },
};

/**
 * Arm-only theme: the mat, its spots and blocks, the button and the shuffle area slide `dx` mm
 * along x, so they sit where the open arm reaches with the tool pointing down (myCobot 280: 0;
 * the bigger 320 further out, mechArm 270 closer in). The AI kit is only for the 280, so the
 * blocks' kit start is never shifted while the kit is open.
 */
export function setArmLayoutShift(dx: number): void {
  ARM_MAT.xMin = LAYOUT_BASE.mat.xMin + dx;
  ARM_MAT.xMax = LAYOUT_BASE.mat.xMax + dx;
  for (const n of SPOT_NAMES) SPOTS[n].x = LAYOUT_BASE.spots[n].x + dx;
  for (const c of COLORS) BLOCK_START[c.name].x = LAYOUT_BASE.blocks[c.name].x + dx;
  BUTTON.x = LAYOUT_BASE.button + dx;
  SHUFFLE_AREA.xMin = LAYOUT_BASE.shuffle.xMin + dx;
  SHUFFLE_AREA.xMax = LAYOUT_BASE.shuffle.xMax + dx;
}
