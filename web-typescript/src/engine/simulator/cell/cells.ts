/**
 * 실습 셀: industrial work cells around the arm, which stands for a large industrial robot. Every
 * cell is laid out at shop size and drawn at 1/5 (CELL_SCALE): the arm's 280 mm reach is a
 * 1,400 mm reach, a 25 mm part a 125 mm one, a 30 mm belt height above the robot base 150 mm.
 * What the student reads (offsets, tolerances, part sizes) is in shop millimetres (toShop).
 *
 * Robot base frame, simulator mm, z up, front = +x. The robot stands on a pedestal whose top is the
 * base (z 0); the floor is CELL_FLOOR_Z below. Work surfaces (plates, the belt) are above z 0, so the
 * arm's "below the base" rule and the gripper's finger allowance both hold.
 *
 * The furniture is FixedBox (the arm keeps `pad` off it, and the physics world has it as a solid);
 * `solids` are physics-only (stands, frames, the pedestal) — the arm never goes down there.
 */

import type { Box } from '../../physics/collide';
import { makeObject, type DeskObject, type FixedBox } from '../desk';
import type { CafeDef } from './cafe';
import type { DrawDef } from './draw';
import type { BoardDef } from './board';
import type { EffectorId } from '../effectors';

/** Shop size per simulator size. */
export const CELL_SCALE = 5;
/** The floor, simulator mm below the robot base (a 700 mm pedestal). */
export const CELL_FLOOR_Z = -140;

/** Simulator mm as shop mm (rounded). */
export const toShop = (mm: number) => Math.round(mm * CELL_SCALE);
/** Shop mm as simulator mm. */
export const fromShop = (mm: number) => mm / CELL_SCALE;

export type CellId = 'feed' | 'vision' | 'inspect' | 'tend' | 'assembly' | 'cafe' | 'draw' | 'board';

export interface CellInfo {
  id: CellId;
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  name: string;
  /** One line: what happens in the cell. */
  note: string;
  /** Its ladder's missions are built (the others: the cell to look round and run by hand, the steps 준비 중). */
  built: boolean;
  /** The tool the cell is worked with (default: the adaptive gripper). */
  effector?: EffectorId;
  /** A 생활 로봇 place (입문 트랙 /track/life): not listed in the full console. */
  life?: boolean;
}

export const CELLS: readonly CellInfo[] = [
  {
    id: 'feed',
    letter: 'A',
    name: '공급 · 적재 셀',
    note: '매거진 · 공급 실린더 · 컨베이어 · 적재 판',
    built: true,
  },
  {
    id: 'vision',
    letter: 'B',
    name: '비전 분류 셀',
    note: '위 카메라 · 컨베이어 · 분류함 3 · 불량 슈트',
    built: true,
  },
  {
    id: 'inspect',
    letter: 'C',
    name: '검사 · 불량 배출 셀',
    note: '스토퍼 · 높이 · 금속 센서 · 배출 실린더',
    built: true,
  },
  {
    id: 'tend',
    letter: 'D',
    name: '머신 텐딩 셀',
    note: 'CNC 선반 문 · 척 · 소재 · 완성품 트레이',
    built: true,
  },
  {
    id: 'assembly',
    letter: 'E',
    name: '조립 · 삽입 셀',
    note: '핀 피더 · 클램프 지그 · 하우징',
    built: true,
  },
  {
    id: 'cafe',
    letter: 'F',
    name: '로봇 카페',
    note: '컵 디스펜서 · 제빙기 · 커피 머신 · 정수기 · 픽업대',
    built: true,
    life: true,
  },
  {
    id: 'draw',
    letter: 'G',
    name: '로봇 캘리그라피',
    note: '펜 홀더 · 메시지 카드 · 커팅 매트 · 완성 램프',
    built: true,
    life: true,
    effector: 'pen',
  },
  {
    id: 'board',
    letter: 'H',
    name: '보드게임 로봇',
    note: '흡착 펌프 · 9 × 9 오목판 · 흰 돌 상자 · 차례 램프',
    built: true,
    life: true,
    effector: 'pump',
  },
];

export const CELL_BY_ID = Object.fromEntries(CELLS.map((c) => [c.id, c])) as Record<CellId, CellInfo>;

/** A named place the program picks from or places on: the middle of a part's footprint and the surface under it, mm. */
export interface CellPlace {
  x: number;
  y: number;
  /** Top of the surface a part stands on there. */
  z: number;
  /** A bin: parts let go there spread over its four corners (this far off its middle), then a layer up. */
  spread?: number;
  /** Inside a machine: the tool goes in and out through this point in front of its door (at travel height), mm. */
  via?: { x: number; y: number };
}

/** A grid of places (a plate's marked positions; a pallet pattern): `rows` along +x, `cols` along +y. */
export interface CellGrid {
  name: string;
  origin: CellPlace;
  rows: number;
  cols: number;
  /** Centre to centre, simulator mm. */
  pitch: number;
  /** Layers on top of each other, and a layer's height (the part's), simulator mm. */
  layers: number;
  layerH: number;
}

/** Where a grid's k-th place is (0-based; row by row, then layer by layer). */
export function gridPlace(g: CellGrid, k: number): CellPlace & { layer: number } {
  const per = g.rows * g.cols;
  const layer = Math.floor(k / per);
  const i = k % per;
  const row = Math.floor(i / g.cols);
  const col = i % g.cols;
  return {
    x: g.origin.x + row * g.pitch,
    y: g.origin.y + col * g.pitch,
    z: g.origin.z + layer * g.layerH,
    layer,
  };
}

/* --- equipment --------------------------------------------------------------- */

/** A belt conveyor: its top face area and height, which way it carries and how fast, mm and mm/s. */
export interface BeltDef {
  min: [number, number];
  max: [number, number];
  topZ: number;
  dir: [number, number];
  speed: number;
}

/** A pneumatic cylinder's pusher: a box that slides along x between two places in `timeS`, mm. */
export interface PusherDef {
  /** The output that drives it. */
  output: string;
  /** Its end switches (inputs). */
  outEnd: string;
  backEnd: string;
  y: [number, number];
  z: [number, number];
  retracted: [number, number];
  extended: [number, number];
  timeS: number;
}

/** A stack magazine: parts stand in a tube, the bottom one is pushed out through a slot, mm. */
export interface MagazineDef {
  x: number;
  y: number;
  floorZ: number;
  capacity: number;
  /** The input "a part is in the slot". */
  sensor: string;
}

/** A sensor: a light beam between two points, or a zone a part's middle is in, mm. */
export type SensorDef =
  | {
      name: string;
      kind: 'beam';
      a: [number, number, number];
      b: [number, number, number];
    }
  | {
      name: string;
      kind: 'zone';
      min: [number, number, number];
      max: [number, number, number];
    };

/**
 * A piece of equipment an output drives between two ends (a door, a chuck, a clamp, a stopper, an
 * ejector): it travels for `timeS`, its end switches are inputs, and a `box` given moves with it as
 * a solid the parts meet (simulator mm, the box at travel 0 and at 1).
 */
export interface ActuatorDef {
  output: string;
  timeS: number;
  /** The arm keeps off its box too (a door): the name a collision with it reports. */
  guard?: string;
  /** Inputs: fully on (travel 1) and fully off (0). */
  onEnd?: string;
  offEnd?: string;
  box?: {
    off: [[number, number, number], [number, number, number]];
    on: [[number, number, number], [number, number, number]];
  };
}

/** A machine's cycle: its output starts it when the `needs` inputs are on; `busy` while it runs `timeS`, then `done`. */
export interface CycleDef {
  output: string;
  needs: string[];
  busy: string;
  done: string;
  timeS: number;
  /** Where the workpiece sits while it is machined (it comes out machined, or spoiled when the cycle is cut). */
  place?: string;
}

export interface LineDef {
  belt?: BeltDef;
  /** The output that runs the belt. */
  beltOutput?: string;
  pusher?: PusherDef;
  magazine?: MagazineDef;
  sensors: SensorDef[];
  /** The place where the belt brings a part to a stop (the arm picks there). */
  endPlace?: string;
  /** Zone on the belt in front of the pusher: a part left there jams the next push. */
  landing?: { min: [number, number]; max: [number, number] };
  actuators?: ActuatorDef[];
  cycle?: CycleDef;
  /** A dispenser at the belt's start: the next part waiting drops onto the belt at (x, y) (자동 운전: on cell.feed(); by hand: as `output` turns on). */
  dispenser?: { x: number; y: number; output: string };
  /** A camera looking down at an area of the belt (its field of view, mm). */
  camera?: { min: [number, number]; max: [number, number] };
  /** Where parts fall softly (a chute's slide): a knock there does not count. */
  soft?: { min: V3; max: V3 }[];
  /** C's inspection: what each passing part is read for, where the line stops it to decide, and how it goes on. */
  inspect?: InspectDef;
  /**
   * A box at the belt's end (E): a part carried past `past` (along the belt) drops straight down
   * into the box's next free spot (x, y; from `z`), the right way up.
   */
  outBox?: { past: number; spots: [number, number][]; z: number };
  /** A place a clamp holds (D's chuck): nothing goes in or out there while `locked` is on. */
  clamp?: { place: string; locked: string };
  /** E's pin insertion into the housing at the jig. */
  insert?: InsertDef;
  /** F: the café's cup dispenser, stations and pickup (cell/cafe.ts). */
  cafe?: CafeDef;
  /** G: the calligraphy booth's card, customer and lamp (cell/draw.ts). */
  draw?: DrawDef;
  /** H: the board-game robot's board, turns and person (cell/board.ts). */
  board?: BoardDef;
}

/**
 * E: pins into a housing's holes. A pin goes in when the tool's error at the hole is within the
 * housing's clearance (its `clearance`, shop mm; 2 by default): the hand's error grows with the
 * speed, an unclamped housing sits off by `loose`, a rough pin catches once whatever. A caught pin
 * stays in the gripper and `jam` lights (the wrist's force sensor) until the next try.
 */
export interface InsertDef {
  /** The jig's place: the middle of a housing standing there, on the belt. */
  housing: string;
  /** The holes, 구멍 1 ~ 4 (the grid "구멍"): offsets from the housing's middle, mm. */
  holes: [number, number][];
  /** How deep a pin goes in, mm. */
  depth: number;
  jam: string;
  /** The clamp's closed input; unclamped, the housing sits off by `loose` (shop mm). */
  clamped: string;
  loose: number;
  /** The hand's error at the tool, shop mm per speed (%). */
  perSpeed: number;
  /** The vibratory feeder: on, it brings the next pin up the track to the nest in `timeS` (when the nest is empty). */
  feeder: { output: string; timeS: number; nest: string; sensor: string };
}

/**
 * An inspection line (C). Each sensor reads a passing part in its zone and holds what it read until
 * the next part comes to the first one (the PLC's 검사 결과 기억), so the program decides at the
 * station, past the sensors. 자동 운전: cell.feed() drops a part and stops it at the station;
 * cell.send() runs it on to the stopper, cell.eject() pushes it off the belt into the reject bin.
 */
export interface InspectDef {
  /** The beam input at the station (in front of the ejector). */
  station: string;
  reads: { name: string; min: [number, number]; max: [number, number]; sees: 'tall' | 'metal' | 'nonMetal' }[];
  ejector: string;
  ejected: string;
  stopper: string;
  arrived: string;
}

export interface CellLayout {
  id: CellId;
  fixed: FixedBox[];
  solids: Box[];
  places: Record<string, CellPlace>;
  grids: Record<string, CellGrid>;
  line: LineDef;
  /** Inputs and outputs the program can use, in lamp order. */
  inputs: string[];
  outputs: string[];
  /** The hand keys of an output, on and off (자유 실습's panel); default 운전 · 정지. */
  keys?: Record<string, [string, string]>;
}

/* --- A: 공급 · 적재 -------------------------------------------------------------- */

const PART_H = 20;
const BELT_TOP = 30;
const PLATE_TOP = 20;
/** Magazine tube centre and its inside, mm. */
const MAG = { x: 310, y: -370, inner: 27, wall: 3, top: 250, slot: 51 };

const box = (name: string, min: [number, number, number], max: [number, number, number], pad?: number): FixedBox => ({ name, min, max, pad });

function feedLayout(): CellLayout {
  const m = MAG;
  const lo = (v: number) => v - m.inner / 2;
  const hi = (v: number) => v + m.inner / 2;
  const fixed: FixedBox[] = [
    box('컨베이어 벨트', [195, -400, 22], [255, 17, BELT_TOP], 3),
    // Guide rails keep the parts in a 28 mm lane down the middle of the belt (open on the feed side).
    box('컨베이어 가이드', [208, -400, BELT_TOP], [211, 17, 40], 3),
    box('컨베이어 가이드', [239, -400, BELT_TOP], [242, -392, 40], 3),
    box('컨베이어 가이드', [239, -348, BELT_TOP], [242, 17, 40], 3),
    box('끝 멈춤판', [205, 17, 22], [245, 21, 46], 4),
    box('공급대', [259, -392, 0], [340, -348, BELT_TOP], 4),
    box('매거진', [lo(m.x) - m.wall, lo(m.y) - m.wall, BELT_TOP], [hi(m.x) + m.wall, lo(m.y), m.top], 6),
    box('매거진', [lo(m.x) - m.wall, hi(m.y), BELT_TOP], [hi(m.x) + m.wall, hi(m.y) + m.wall, m.top], 6),
    box('매거진', [lo(m.x) - m.wall, lo(m.y), m.slot], [lo(m.x), hi(m.y), m.top], 6),
    box('매거진', [hi(m.x), lo(m.y), m.slot], [hi(m.x) + m.wall, hi(m.y), m.top], 6),
    box('공급 실린더', [418, -392, 22], [482, -348, 58], 6),
    box('소재 판', [82, -188, 0], [178, -92, PLATE_TOP], 3),
    box('적재 판', [82, 82, 0], [178, 178, PLATE_TOP], 3),
  ];
  const solids: Box[] = [
    { name: '로봇 받침대', min: [-100, -75, -140], max: [60, 75, -0.5] },
    { name: '컨베이어 프레임', min: [195, -400, -140], max: [255, 17, 22] },
    { name: '공급대 다리', min: [259, -392, -140], max: [340, -348, 0] },
    { name: '소재 판 받침', min: [92, -178, -140], max: [168, -102, 0] },
    { name: '적재 판 받침', min: [92, 92, -140], max: [168, 168, 0] },
  ];
  const source: CellGrid = {
    name: '소재 판',
    origin: { x: 100, y: -170, z: PLATE_TOP },
    rows: 3,
    cols: 3,
    pitch: 30,
    layers: 1,
    layerH: PART_H,
  };
  const pallet: CellGrid = {
    name: '적재 판',
    origin: { x: 100, y: 100, z: PLATE_TOP },
    rows: 3,
    cols: 3,
    pitch: 30,
    layers: 2,
    layerH: PART_H,
  };
  const places: Record<string, CellPlace> = {
    '끝 위치': { x: 225, y: 17 - 12.5, z: BELT_TOP },
    '기준 자리': { ...pallet.origin },
  };
  for (let k = 0; k < 9; k += 1) {
    const p = gridPlace(source, k);
    places[`소재 ${k + 1}`] = { x: p.x, y: p.y, z: p.z };
  }
  return {
    id: 'feed',
    fixed,
    solids,
    places,
    grids: { '소재 판': source, '적재 판': pallet },
    line: {
      belt: {
        min: [195, -400],
        max: [255, 17],
        topZ: BELT_TOP,
        dir: [0, 1],
        speed: 50,
      },
      beltOutput: '컨베이어',
      pusher: {
        output: '공급 실린더',
        outEnd: '실린더 전진 끝',
        backEnd: '실린더 후진 끝',
        y: [-379, -361],
        z: [30.5, 49.5],
        retracted: [327, 417],
        extended: [237.5, 327.5],
        timeS: 0.6,
      },
      magazine: {
        x: m.x,
        y: m.y,
        floorZ: BELT_TOP,
        capacity: 9,
        sensor: '매거진 있음',
      },
      sensors: [
        {
          name: '매거진 있음',
          kind: 'zone',
          min: [lo(m.x), lo(m.y), BELT_TOP],
          max: [hi(m.x), hi(m.y), BELT_TOP + PART_H],
        },
        { name: '끝 센서', kind: 'beam', a: [205, 12, 40], b: [245, 12, 40] },
      ],
      endPlace: '끝 위치',
      landing: { min: [211, -394], max: [239, -346] },
    },
    inputs: ['매거진 있음', '실린더 전진 끝', '실린더 후진 끝', '끝 센서'],
    outputs: ['공급 실린더', '컨베이어'],
  };
}

/* --- shared pieces --------------------------------------------------------------- */

type V3 = [number, number, number];

/** A bin's four walls (open top) round a floor at z0, inside x0..x1 × y0..y1, mm. */
function binWalls(name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, t = 2): FixedBox[] {
  return [box(name, [x0 - t, y0 - t, z0], [x1 + t, y0, z1], 3), box(name, [x0 - t, y1, z0], [x1 + t, y1 + t, z1], 3), box(name, [x0 - t, y0, z0], [x0, y1, z1], 3), box(name, [x1, y0, z0], [x1 + t, y1, z1], 3)];
}

/** A belt's fixed boxes: the belt, guide rails (a lane `lane` wide down the middle, with gaps), the end stop at the downstream end. */
function beltBoxes(b: BeltDef, lane: number, gaps: [number, number][] = [], endStop = true): FixedBox[] {
  const cx = (b.min[0] + b.max[0]) / 2;
  const out: FixedBox[] = [box('컨베이어 벨트', [b.min[0], b.min[1], b.topZ - 8], [b.max[0], b.max[1], b.topZ], 3)];
  const runs: [number, number][] = [];
  let from = b.min[1];
  for (const [g0, g1] of [...gaps].sort((a, c) => a[0] - c[0])) {
    runs.push([from, g0]);
    from = g1;
  }
  runs.push([from, b.max[1]]);
  for (const sd of [-1, 1])
    for (const [y0, y1] of runs.filter(([a, c]) => c - a > 1)) {
      const x = cx + sd * (lane / 2 + 1.5);
      out.push(box('컨베이어 가이드', [x - 1.5, y0, b.topZ], [x + 1.5, y1, b.topZ + 10], 3));
    }
  if (!endStop) return out;
  const downstream = b.dir[1] > 0 ? b.max[1] : b.min[1];
  const s = b.dir[1] > 0 ? 1 : -1;
  out.push(box('끝 멈춤판', [cx - lane / 2 - 3, Math.min(downstream, downstream + s * 4), b.topZ - 8], [cx + lane / 2 + 3, Math.max(downstream, downstream + s * 4), b.topZ + 16], 4));
  return out;
}

const PED: Box = {
  name: '로봇 받침대',
  min: [-100, -75, -140],
  max: [60, 75, -0.5],
};
/** The floor under a table or a belt: its frame, as a physics solid. */
const under = (name: string, min: [number, number], max: [number, number], top: number): Box => ({
  name,
  min: [min[0], min[1], CELL_FLOOR_Z],
  max: [max[0], max[1], top],
});

/* --- B: 비전 분류 ------------------------------------------------------------------- */

/** Where B's camera hangs (the gantry over the belt, upstream of the pick zone so the wrist passes under it), mm. */
export const B_CAMERA = { x: 225, y: -112, z: 236, lookAt: [225, -35, 30] as V3, posts: [174, 276] as [number, number], beamZ: 258 };
/** B's sorting bins: three padded totes in a row at the robot's left; a part is let go just over the rim and drops in, mm. */
export const B_BINS = { x: 125, ys: [70, 130, 190], inner: 54, wall: 22, floor: PLATE_TOP };

function visionLayout(): CellLayout {
  const belt: BeltDef = { min: [195, -420], max: [255, 20], topZ: BELT_TOP, dir: [0, 1], speed: 50 };
  const B = B_BINS;
  const half = B.inner / 2;
  const fixed: FixedBox[] = [
    ...beltBoxes(belt, 50),
    ...B.ys.flatMap((y, k) => binWalls(`함 ${k + 1}`, B.x - half, B.x + half, y - half, y + half, B.floor, B.floor + B.wall)),
    box('함 받침', [B.x - half - 4, B.ys[0] - half - 4, 0], [B.x + half + 4, B.ys[2] + half + 4, B.floor], 3),
    ...binWalls('불량 슈트', 87, 133, -183, -137, -40, 30),
    box('카메라 기둥', [B_CAMERA.posts[0] - 6, B_CAMERA.y - 6, belt.topZ - 8], [B_CAMERA.posts[0] + 6, B_CAMERA.y + 6, B_CAMERA.beamZ + 6], 8),
    box('카메라 기둥', [B_CAMERA.posts[1] - 6, B_CAMERA.y - 6, belt.topZ - 8], [B_CAMERA.posts[1] + 6, B_CAMERA.y + 6, B_CAMERA.beamZ + 6], 8),
    box('카메라 보', [B_CAMERA.posts[0] - 6, B_CAMERA.y - 6, B_CAMERA.beamZ - 6], [B_CAMERA.posts[1] + 6, B_CAMERA.y + 6, B_CAMERA.beamZ + 6], 8),
    box('위 카메라', [B_CAMERA.x - 16, B_CAMERA.y - 18, B_CAMERA.z - 16], [B_CAMERA.x + 16, B_CAMERA.y + 18, B_CAMERA.beamZ - 6], 8),
  ];
  const solids: Box[] = [PED, under('컨베이어 프레임', belt.min, belt.max, belt.topZ - 8), under('함 받침 다리', [B.x - half, B.ys[0] - half], [B.x + half, B.ys[2] + half], 0), under('불량 상자', [87, -183], [133, -137], -40)];
  const places: Record<string, CellPlace> = {
    '끝 위치': { x: 225, y: belt.max[1] - 12.5, z: BELT_TOP },
    // A reject goes down the chute: let go just over the box's rim.
    '불량 슈트': { x: 110, y: -160, z: 32 },
  };
  B.ys.forEach((y, k) => (places[`함 ${k + 1}`] = { x: B.x, y, z: B.floor + B.wall + 4, spread: 12 }));
  return {
    id: 'vision',
    fixed,
    solids,
    places,
    grids: {},
    line: {
      belt,
      beltOutput: '컨베이어',
      sensors: [{ name: '끝 센서', kind: 'beam', a: [199, 15, 40], b: [251, 15, 40] }],
      endPlace: '끝 위치',
      actuators: [{ output: '조명', timeS: 0.05 }],
      dispenser: { x: 225, y: -400, output: '투입' },
      camera: { min: [194, -95], max: [256, 26] },
      soft: [{ min: [87, -183, -60], max: [133, -137, 40] }, ...B.ys.map((y) => ({ min: [B.x - half, y - half, 0] as V3, max: [B.x + half, y + half, 70] as V3 }))],
    },
    inputs: ['끝 센서'],
    outputs: ['컨베이어', '조명', '투입'],
    keys: { 조명: ['켜기', '끄기'], 투입: ['넣기', '닫기'] },
  };
}

/* --- C: 검사 · 불량 배출 ------------------------------------------------------------- */

/** C's line, along the belt (y, mm): the height sensor, the two proximity sensors, the ejector, the stopper. */
export const C_AT = {
  height: -385,
  metal: -335,
  nonMetal: -305,
  eject: -250,
  /** The station's beam: a part stops with its middle at the ejector's (the beam meets its leading edge). */
  station: -250 + 12,
  stop: -6,
};

function inspectLayout(): CellLayout {
  const belt: BeltDef = {
    min: [195, -432],
    max: [255, 20],
    topZ: BELT_TOP,
    dir: [0, 1],
    speed: 50,
  };
  const ej = C_AT.eject;
  const fixed: FixedBox[] = [
    ...beltBoxes(belt, 28, [[ej - 14, ej + 14]]),
    box('높이 센서', [186, C_AT.height - 7, 52], [264, C_AT.height + 7, 64], 6),
    box('근접 센서', [244, C_AT.metal - 6, BELT_TOP + 2], [256, C_AT.metal + 6, BELT_TOP + 16], 4),
    box('근접 센서', [244, C_AT.nonMetal - 6, BELT_TOP + 2], [256, C_AT.nonMetal + 6, BELT_TOP + 16], 4),
    box('배출 실린더', [70, ej - 13, 28], [118, ej + 13, 52], 6),
    ...binWalls('불량함', 264, 330, ej - 33, ej + 33, -60, 22),
    box('스토퍼', [186, C_AT.stop - 4, 52], [264, C_AT.stop + 4, 64], 4),
    box('양품 트레이', [82, 82, 0], [178, 178, PLATE_TOP], 3),
    box('비금속 트레이', [82, -188, 0], [178, -92, PLATE_TOP], 3),
  ];
  const solids: Box[] = [PED, under('컨베이어 프레임', belt.min, belt.max, belt.topZ - 8), under('불량함 받침', [264, ej - 33], [330, ej + 33], -60), under('양품 트레이 받침', [92, 92], [168, 168], 0), under('비금속 트레이 받침', [92, -178], [168, -102], 0)];
  const good: CellGrid = {
    name: '양품 트레이',
    origin: { x: 100, y: 100, z: PLATE_TOP },
    rows: 3,
    cols: 3,
    pitch: 30,
    layers: 1,
    layerH: PART_H,
  };
  const nonMetal: CellGrid = {
    name: '비금속 트레이',
    origin: { x: 100, y: -170, z: PLATE_TOP },
    rows: 3,
    cols: 3,
    pitch: 30,
    layers: 1,
    layerH: PART_H,
  };
  const stopY = C_AT.stop - 4 - 12.5;
  const lane = (y: number, h: number): { min: [number, number]; max: [number, number] } => ({ min: [205, y - h], max: [245, y + h] });
  return {
    id: 'inspect',
    fixed,
    solids,
    places: { '스토퍼 앞': { x: 225, y: stopY, z: BELT_TOP } },
    grids: { '양품 트레이': good, '비금속 트레이': nonMetal },
    line: {
      belt,
      beltOutput: '컨베이어',
      sensors: [
        {
          name: '부품 도착',
          kind: 'beam',
          a: [205, stopY + 2, 40],
          b: [245, stopY + 2, 40],
        },
        // The station's beam stops a part with its middle in front of the ejector's head.
        {
          name: '검사 위치',
          kind: 'beam',
          a: [205, C_AT.station, 40],
          b: [245, C_AT.station, 40],
        },
      ],
      endPlace: '스토퍼 앞',
      dispenser: { x: 225, y: -420, output: '투입' },
      inspect: {
        station: '검사 위치',
        reads: [
          { name: '높이 정상', ...lane(C_AT.height, 10), sees: 'tall' },
          { name: '금속', ...lane(C_AT.metal, 8), sees: 'metal' },
          { name: '비금속', ...lane(C_AT.nonMetal, 8), sees: 'nonMetal' },
        ],
        ejector: '배출 실린더',
        ejected: '배출 끝',
        stopper: '스토퍼',
        arrived: '부품 도착',
      },
      soft: [{ min: [264, ej - 33, -60], max: [330, ej + 33, 30] }],
      actuators: [
        // The stopper's bar drops across the lane (on) and lifts to let the part go (off).
        {
          output: '스토퍼',
          timeS: 0.25,
          box: {
            off: [
              [209, C_AT.stop - 4, 52],
              [241, C_AT.stop + 4, 58],
            ],
            on: [
              [209, C_AT.stop - 4, 31],
              [241, C_AT.stop + 4, 58],
            ],
          },
        },
        // The ejector pushes across the belt through the guides' gap into the reject bin.
        {
          output: '배출 실린더',
          timeS: 0.4,
          onEnd: '배출 끝',
          box: {
            off: [
              [120, ej - 11, 31],
              [187, ej + 11, 49],
            ],
            on: [
              [205, ej - 11, 31],
              [272, ej + 11, 49],
            ],
          },
        },
      ],
    },
    inputs: ['높이 정상', '금속', '비금속', '검사 위치', '배출 끝', '부품 도착'],
    outputs: ['투입', '컨베이어', '배출 실린더', '스토퍼', '경광등'],
    keys: { 투입: ['넣기', '닫기'], 스토퍼: ['막기', '열기'], 경광등: ['켜기', '끄기'] },
  };
}

/* --- D: 머신 텐딩 -------------------------------------------------------------------- */

/**
 * D's machine in its own frame (mm): its door on the -x face, the chuck standing up inside. The
 * machine stands at the robot's right, turned so the door faces the robot (and the camera): its
 * frame's (x, y) is the cell's (y + D_POSE.dx, -x + D_POSE.dy).
 */
export const D_MACHINE = {
  x0: 190,
  x1: 380,
  y0: -125,
  y1: 190,
  top: 240,
  /** The opening runs up into the roof (an auto door with a roof flap): a gripper reaching down to the chuck has its wrist high. */
  door: { y0: -62, y1: 62, z1: 240 },
  chuck: { x: 245, y: 0, r: 20, top: 25 },
};
export const D_POSE = { dx: 65, dy: 15 };
/** A stand in front of the door where the next blank waits while the machine works (D6), mm. */
export const D_WAIT = { x: 80, y: -85 };
/** A point of the machine's frame in the cell's. */
export const dCell = (x: number, y: number): [number, number] => [y + D_POSE.dx, -x + D_POSE.dy];
/** A box of the machine's frame in the cell's. */
function dBox(name: string, min: V3, max: V3, pad?: number): FixedBox {
  const [ax, ay] = dCell(min[0], min[1]);
  const [bx, by] = dCell(max[0], max[1]);
  return box(name, [Math.min(ax, bx), Math.min(ay, by), min[2]], [Math.max(ax, bx), Math.max(ay, by), max[2]], pad);
}

function tendLayout(): CellLayout {
  const M = D_MACHINE;
  const fixed: FixedBox[] = [
    dBox('CNC 머신', [290, M.y0, 0], [M.x1, M.y1, M.top], 8),
    dBox('CNC 머신', [M.x0, M.y0, 0], [290, M.door.y0, M.top], 8),
    dBox('CNC 머신', [M.x0, M.door.y1, 0], [290, M.y1, M.top], 8),
    dBox('척', [M.chuck.x - M.chuck.r, M.chuck.y - M.chuck.r, 0], [M.chuck.x + M.chuck.r, M.chuck.y + M.chuck.r, M.chuck.top - 6], 3),
    box('소재 트레이', [90, 60, 0], [170, 140, PLATE_TOP], 3),
    box('완성품 트레이', [90, -60, 0], [170, 20, PLATE_TOP], 3),
    box('라이트 커튼', [209, -86, CELL_FLOOR_Z], [221, -74, 110], 6),
    box('라이트 커튼', [209, 154, CELL_FLOOR_Z], [221, 166, 110], 6),
    box('대기 자리', [D_WAIT.x - 15, D_WAIT.y - 15, 0], [D_WAIT.x + 15, D_WAIT.y + 15, PLATE_TOP], 3),
  ];
  const floorOf = dBox('', [M.x0, M.y0, CELL_FLOOR_Z], [M.x1, M.y1, 0]);
  const solids: Box[] = [PED, { name: 'CNC 머신 바닥', min: floorOf.min, max: floorOf.max }, under('소재 트레이 받침', [100, 70], [160, 130], 0), under('완성품 트레이 받침', [100, -50], [160, 10], 0), under('대기 자리 받침', [D_WAIT.x - 10, D_WAIT.y - 10], [D_WAIT.x + 10, D_WAIT.y + 10], 0)];
  const raw: CellGrid = {
    name: '소재 트레이',
    origin: { x: 105, y: 75, z: PLATE_TOP },
    rows: 3,
    cols: 3,
    pitch: 25,
    layers: 1,
    layerH: PART_H,
  };
  const done: CellGrid = {
    name: '완성품 트레이',
    origin: { x: 105, y: -45, z: PLATE_TOP },
    rows: 3,
    cols: 3,
    pitch: 25,
    layers: 1,
    layerH: PART_H,
  };
  const [cx, cy] = dCell(M.chuck.x, M.chuck.y);
  const places: Record<string, CellPlace> = {
    // The workpiece stands on the chuck's body, between its jaws.
    척: { x: cx, y: cy, z: M.chuck.top - 6, via: { x: cx, y: cy + 110 } },
    '대기 자리': { x: D_WAIT.x, y: D_WAIT.y, z: PLATE_TOP },
  };
  for (let k = 0; k < 9; k += 1) {
    const a = gridPlace(raw, k);
    const b = gridPlace(done, k);
    places[`소재 ${k + 1}`] = { x: a.x, y: a.y, z: a.z };
    places[`완성품 ${k + 1}`] = { x: b.x, y: b.y, z: b.z };
  }
  const door = (y0: number, y1: number): [V3, V3] => {
    const b = dBox('', [M.x0 - 4, y0, 0], [M.x0, y1, M.door.z1]);
    return [b.min, b.max];
  };
  return {
    id: 'tend',
    fixed,
    solids,
    places,
    grids: { '소재 트레이': raw, '완성품 트레이': done },
    line: {
      sensors: [],
      actuators: [
        // The sliding door (on = open): a panel across the opening that runs aside
        {
          output: '문',
          timeS: 1.6,
          guard: '문',
          onEnd: '문 열림',
          offEnd: '문 닫힘',
          box: {
            off: door(M.door.y0, M.door.y1),
            on: door(M.door.y1, M.door.y1 + 124),
          },
        },
        { output: '척', timeS: 0.5, onEnd: '척 잠김', offEnd: '척 풀림' },
      ],
      cycle: {
        output: '가공 시작',
        needs: ['문 닫힘', '척 잠김'],
        busy: '가공 중',
        done: '가공 끝',
        timeS: 12,
        place: '척',
      },
      clamp: { place: '척', locked: '척 잠김' },
    },
    inputs: ['문 열림', '문 닫힘', '척 잠김', '척 풀림', '가공 중', '가공 끝'],
    outputs: ['문', '척', '가공 시작'],
    keys: {
      문: ['열기', '닫기'],
      척: ['잠금', '풀기'],
      '가공 시작': ['시작', '멈춤'],
    },
  };
}

/* --- E: 조립 · 삽입 ------------------------------------------------------------------- */

/** E's pieces, mm: the work table with the bowl feeder and the pin track, the jig station on the housing belt. */
export const E_AT = {
  table: { x0: 30, x1: 160, y0: -310, y1: -100, top: PLATE_TOP },
  bowl: { x: 85, y: -255, r: 45, top: 72 },
  nest: { x: 130, y: -130 },
  jig: { x: 200, y: 40 },
  housing: [30, 30, 16] as V3,
  /** The holes' offset from the housing's middle, along and across the belt, mm. */
  hole: 7,
  pin: [8, 8, 22] as V3,
};

function assemblyLayout(): CellLayout {
  const T = E_AT.table;
  const belt: BeltDef = {
    min: [175, -120],
    max: [225, 330],
    topZ: BELT_TOP,
    dir: [0, -1],
    speed: 50,
  };
  const J = E_AT.jig;
  const H = E_AT.housing;
  const stopY = J.y - H[1] / 2;
  // The housing's four holes, 구멍 1 ~ 4: along the belt, then across (the grid's order).
  const holes = { name: '구멍', origin: { x: J.x - E_AT.hole, y: J.y - E_AT.hole, z: BELT_TOP + H[2] }, rows: 2, cols: 2, pitch: 2 * E_AT.hole, layers: 1, layerH: 0 };
  const fixed: FixedBox[] = [
    box('작업대', [T.x0, T.y0, 0], [T.x1, T.y1, T.top], 3),
    box('진동 피더', [E_AT.bowl.x - E_AT.bowl.r, E_AT.bowl.y - E_AT.bowl.r, T.top], [E_AT.bowl.x + E_AT.bowl.r, E_AT.bowl.y + E_AT.bowl.r, E_AT.bowl.top], 6),
    box('핀 트랙', [122, -212, T.top], [138, -140, T.top + 8], 3),
    box('핀 받침', [120, -140, T.top], [140, -120, T.top + 8], 3),
    // No end stop: a finished housing runs off the belt's end into the box.
    ...beltBoxes(belt, 32, [[J.y - 15, J.y + 15]], false),
    box('클램프 실린더', [238, J.y - 10, 28], [272, J.y + 10, 50], 6),
    ...binWalls('완성 상자', 168, 232, -200, -124, -80, 22),
  ];
  const solids: Box[] = [PED, under('작업대 다리', [T.x0 + 6, T.y0 + 6], [T.x1 - 6, T.y1 - 6], 0), under('컨베이어 프레임', belt.min, belt.max, belt.topZ - 8), under('완성 상자 받침', [168, -200], [232, -124], -80)];
  return {
    id: 'assembly',
    fixed,
    solids,
    places: {
      '핀 집는 자리': { x: E_AT.nest.x, y: E_AT.nest.y, z: T.top + 8 },
      하우징: { x: J.x, y: J.y, z: BELT_TOP + H[2] },
      ...Object.fromEntries([0, 1, 2, 3].map((k) => [`구멍 ${k + 1}`, (({ x, y, z }) => ({ x, y, z }))(gridPlace(holes, k))])),
    },
    grids: { 구멍: holes },
    line: {
      belt,
      // A finished housing off the belt's end drops into the box: two by two, the right way up.
      outBox: { past: belt.min[1] + 6, spots: [[184, -142], [216, -142], [184, -180], [216, -180]], z: 0 },
      beltOutput: '컨베이어',
      sensors: [
        {
          name: '하우징 도착',
          kind: 'beam',
          a: [185, stopY + 4, 38],
          b: [215, stopY + 4, 38],
        },
        {
          name: '핀 있음',
          kind: 'zone',
          min: [122, -138, T.top + 8],
          max: [138, -122, T.top + 30],
        },
      ],
      endPlace: '하우징',
      // Off the belt's end into the box: a soft landing.
      soft: [{ min: [166, -202, -85], max: [234, -112, 40] }],
      insert: {
        housing: '하우징',
        holes: [0, 1, 2, 3].map((k) => {
          const p = gridPlace(holes, k);
          return [p.x - J.x, p.y - J.y] as [number, number];
        }),
        depth: 10,
        jam: '걸림',
        clamped: '클램프 닫힘',
        loose: 2.5,
        perSpeed: 0.04,
        feeder: { output: '피더', timeS: 4, nest: '핀 집는 자리', sensor: '핀 있음' },
      },
      actuators: [
        // The stopper's bar drops across the lane in front of the jig (on) and lifts to let the housing out (off).
        {
          output: '스토퍼',
          timeS: 0.25,
          box: {
            off: [
              [184, stopY - 6, 52],
              [216, stopY, 58],
            ],
            on: [
              [184, stopY - 6, 31],
              [216, stopY, 58],
            ],
          },
        },
        // The clamp's jaw comes in through the far guide's gap and holds the housing against the near one.
        {
          output: '클램프',
          timeS: 0.35,
          onEnd: '클램프 닫힘',
          offEnd: '클램프 열림',
          box: {
            off: [
              [226, J.y - 12, 31],
              [236, J.y + 12, 45],
            ],
            on: [
              [216.5, J.y - 12, 31],
              [226.5, J.y + 12, 45],
            ],
          },
        },
        { output: '피더', timeS: 0.1 },
      ],
    },
    inputs: ['하우징 도착', '클램프 닫힘', '클램프 열림', '핀 있음', '걸림'],
    outputs: ['컨베이어', '스토퍼', '클램프', '피더'],
    keys: { 스토퍼: ['막기', '열기'], 클램프: ['닫기', '열기'] },
  };
}


/* --- F: 로봇 카페 ------------------------------------------------------------------- */

/**
 * F: a robot café counter (docs/reports/education/43-track-life-robot-cafe.md). The arm stands for a
 * café cobot of ~1,300 mm reach (RB10-1300N class, ref. [4]) at the cells' 1/5: a 12 oz cold cup
 * (Ø90 × 120 mm) is 18 × 24 mm here. Round the arm, left to right: the cup dispenser, the ice maker,
 * the coffee machine, the water dispenser, and the pickup shelf behind its door on the customer's side.
 * Each spout stands 35 mm off its body's face, so the gripper reaches the cup from above.
 */
export const CAFE_AT = {
  cup: { x: 95, y: 165 },
  ice: { x: 185, y: 115 },
  coffee: { x: 210, y: 15 },
  water: { x: 185, y: -85 },
  pickup: [
    { x: 118, y: -168 },
    { x: 78, y: -184 },
  ],
  shelfTop: 4,
  door: { x0: 48, x1: 148, y0: -214, y1: -208, h: 70 },
} as const;

function cafeLayout(): CellLayout {
  const A = CAFE_AT;
  const D = A.door;
  const fixed: FixedBox[] = [
    box('컵 디스펜서', [70, 200, 0], [120, 245, 150], 4),
    box('제빙기', [222, 90, 0], [275, 142, 130], 4),
    box('커피 머신', [245, -22, 0], [312, 55, 125], 4),
    box('정수기', [222, -112, 0], [266, -58, 115], 4),
    box('픽업대', [D.x0, D.y1 + 6, 0], [D.x1, -150, A.shelfTop], 2),
  ];
  const solids: Box[] = [PED, under('카페 카운터', [-110, -250], [330, 260], 0)];
  const places: Record<string, CellPlace> = {
    '컵 나오는 곳': { ...A.cup, z: 0 },
    제빙기: { ...A.ice, z: 0 },
    '커피 머신': { ...A.coffee, z: 0 },
    정수기: { ...A.water, z: 0 },
    '픽업 1': { ...A.pickup[0], z: A.shelfTop },
    '픽업 2': { ...A.pickup[1], z: A.shelfTop },
  };
  const cafe: CafeDef = {
    dispenser: { output: '컵 내리기', place: '컵 나오는 곳', ready: '컵 준비됨', stock: 20 },
    stations: [
      { name: '제빙기', output: '얼음', place: '제빙기', cup: '제빙기 컵 감지', busy: '얼음 나오는 중', done: '얼음 끝', timeS: 3, pours: 'ice', ml: 145, unit: 'ml', range: [0, 300] },
      { name: '커피 머신', output: '추출 시작', place: '커피 머신', cup: '머신 컵 감지', busy: '추출 중', done: '추출 끝', timeS: 28, pours: 'shot', ml: 60, unit: 'shot', range: [1, 4] },
      { name: '정수기', output: '물', place: '정수기', cup: '정수기 컵 감지', busy: '물 나오는 중', done: '물 끝', timeS: 4, pours: 'water', ml: 150, unit: 'ml', range: [0, 300] },
      // The same tap's hot water (the red button): a hot drink.
      { name: '온수', output: '온수', place: '정수기', cup: '정수기 컵 감지', busy: '온수 나오는 중', done: '온수 끝', timeS: 5, pours: 'water', ml: 150, unit: 'ml', range: [0, 300], hot: true },
    ],
    pickup: { places: ['픽업 1', '픽업 2'], door: '픽업 문', open: '문 열림', closed: '문 닫힘', hand: '손 감지', zone: { min: [D.x0, D.y0], max: [D.x1, -145] } },
  };
  return {
    id: 'cafe',
    fixed,
    solids,
    places,
    grids: {},
    line: {
      sensors: [],
      actuators: [
        // The pickup door slides up to let the customer in (on = open).
        {
          output: '픽업 문',
          timeS: 1.2,
          guard: '픽업 문',
          onEnd: '문 열림',
          offEnd: '문 닫힘',
          box: {
            off: [
              [D.x0, D.y0, 0],
              [D.x1, D.y1, D.h],
            ],
            on: [
              [D.x0, D.y0, D.h],
              [D.x1, D.y1, D.h * 2],
            ],
          },
        },
      ],
      cafe,
    },
    inputs: ['컵 준비됨', '제빙기 컵 감지', '얼음 나오는 중', '얼음 끝', '머신 컵 감지', '추출 중', '추출 끝', '정수기 컵 감지', '물 나오는 중', '물 끝', '온수 나오는 중', '온수 끝', '문 열림', '문 닫힘', '손 감지', '주문 확인', '영업 끝', '주문 1', '주문 2', '주문 3'],
    outputs: ['컵 내리기', '얼음', '추출 시작', '물', '온수', '픽업 문'],
    keys: {
      '컵 내리기': ['내리기', '멈춤'],
      얼음: ['받기', '멈춤'],
      '추출 시작': ['추출', '멈춤'],
      물: ['받기', '멈춤'],
      온수: ['받기', '멈춤'],
      '픽업 문': ['열기', '닫기'],
    },
  };
}

/* --- G: 로봇 캘리그라피 ------------------------------------------------------------- */

/**
 * G: an event booth's calligraphy robot (docs/reports/education/44-track-life-robot-calligraphy.md).
 * Unlike the other cells, at full size: the arm itself with a pen holder on a table (z 0 = the
 * table top, where the card lies), the customer across the table at −y. Nothing on the table is in
 * the arm's way; the pen stand and the sample board stand behind the mat (scene only).
 */
function drawLayout(): CellLayout {
  return {
    id: 'draw',
    fixed: [box('펜 꽂이', [40, 120, 0], [70, 150, 60], 4)],
    solids: [PED],
    places: {},
    grids: {},
    line: { sensors: [], draw: { card: '카드 있음', hand: '손 감지', lamp: '완성 램프', margin: 10 } },
    inputs: ['카드 있음', '손 감지'],
    outputs: ['완성 램프'],
    keys: { '완성 램프': ['켜기', '끄기'] },
  };
}

/* --- H: 보드게임 로봇 ---------------------------------------------------------------- */

/** H: the robot's white stones, 3 × 5 in a tray at its right (robot mm; the tray's top is z 6). */
export const STONE_TRAY = { x: 118, y: 92, rows: 3, cols: 5, pitch: 18, top: 6 } as const;

/**
 * H: a board-game robot at a café table (docs/reports/education/45-track-life-board-game-robot.md).
 * At full size like G: the arm with the suction pump, the 9 × 9 board in front of it (cell/board.ts
 * BOARD), the white stones' tray at its right, the person across the board at −y. The board and the
 * tray are physics solids only (the pump comes down onto them); the table top is z 0.
 */
function boardLayout(): CellLayout {
  const T = STONE_TRAY;
  const b0 = { x: 136 - 14, y: -64 - 14 };
  const b1 = { x: 136 + 128 + 14, y: -64 + 128 + 14 };
  return {
    id: 'board',
    fixed: [],
    solids: [
      PED,
      { name: '테이블', min: [-120, -230, -20], max: [340, 230, 0] },
      { name: '오목판', min: [b0.x, b0.y, 0], max: [b1.x, b1.y, 6] },
      { name: '돌 상자', min: [T.x - 12, T.y - 12, 0], max: [T.x + (T.rows - 1) * T.pitch + 12, T.y + (T.cols - 1) * T.pitch + 12, T.top] },
    ],
    places: {},
    grids: { '돌 상자': { name: '돌 상자', origin: { x: T.x, y: T.y, z: T.top }, rows: T.rows, cols: T.cols, pitch: T.pitch, layers: 1, layerH: 5 } },
    line: { sensors: [], board: { turn: '로봇 차례', hand: '손 감지', over: '게임 끝' } },
    inputs: ['로봇 차례', '손 감지', '게임 끝'],
    outputs: [],
  };
}

const LAYOUTS: Record<CellId, () => CellLayout> = {
  feed: feedLayout,
  vision: visionLayout,
  inspect: inspectLayout,
  tend: tendLayout,
  assembly: assemblyLayout,
  cafe: cafeLayout,
  draw: drawLayout,
  board: boardLayout,
};

const cache = new Map<CellId, CellLayout>();
/** A cell's layout. */
export function cellLayout(id: CellId): CellLayout {
  const hit = cache.get(id);
  if (hit) return hit;
  const l = LAYOUTS[id]();
  cache.set(id, l);
  return l;
}

/* --- parts --------------------------------------------------------------------- */

/** One of the cell's workpieces at (x, y) on a surface at z. */
export function makePart(x: number, y: number, z: number, over: Partial<DeskObject> = {}): DeskObject {
  return makeObject('puck', { x, y, z }, over);
}

/** `n` parts stacked in the magazine (the bottom one in the slot). */
export function magazineParts(l: CellLayout, n: number): DeskObject[] {
  const m = l.line.magazine!;
  return Array.from({ length: n }, (_, k) => makePart(m.x, m.y, m.floorZ + k * PART_H + k * 0.05));
}

export const PART_HEIGHT = PART_H;
