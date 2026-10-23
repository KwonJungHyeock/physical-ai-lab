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

/** Shop size per simulator size. */
export const CELL_SCALE = 5;
/** The floor, simulator mm below the robot base (a 700 mm pedestal). */
export const CELL_FLOOR_Z = -140;

/** Simulator mm as shop mm (rounded). */
export const toShop = (mm: number) => Math.round(mm * CELL_SCALE);
/** Shop mm as simulator mm. */
export const fromShop = (mm: number) => mm / CELL_SCALE;

export type CellId = 'feed' | 'vision' | 'inspect' | 'tend' | 'assembly';

export interface CellInfo {
  id: CellId;
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  name: string;
  /** One line: what happens in the cell. */
  note: string;
  /** Its 3D cell and missions are built (the others show their ladder only). */
  built: boolean;
}

export const CELLS: readonly CellInfo[] = [
  { id: 'feed', letter: 'A', name: '공급 · 적재 셀', note: '매거진 · 공급 실린더 · 컨베이어 · 적재 판', built: true },
  { id: 'vision', letter: 'B', name: '비전 분류 셀', note: '위 카메라 · 컨베이어 · 분류함 3 · 불량 슈트', built: false },
  { id: 'inspect', letter: 'C', name: '검사 · 불량 배출 셀', note: '스토퍼 · 높이 · 금속 센서 · 배출 실린더', built: false },
  { id: 'tend', letter: 'D', name: '머신 텐딩 셀', note: 'CNC 선반 문 · 척 · 소재 · 완성품 트레이', built: false },
  { id: 'assembly', letter: 'E', name: '조립 · 삽입 셀', note: '핀 피더 · 클램프 지그 · 하우징', built: false },
];

export const CELL_BY_ID = Object.fromEntries(CELLS.map((c) => [c.id, c])) as Record<CellId, CellInfo>;

/** A named place the program picks from or places on: the middle of a part's footprint and the surface under it, mm. */
export interface CellPlace {
  x: number;
  y: number;
  /** Top of the surface a part stands on there. */
  z: number;
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
  return { x: g.origin.x + row * g.pitch, y: g.origin.y + col * g.pitch, z: g.origin.z + layer * g.layerH, layer };
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
  | { name: string; kind: 'beam'; a: [number, number, number]; b: [number, number, number] }
  | { name: string; kind: 'zone'; min: [number, number, number]; max: [number, number, number] };

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
  const source: CellGrid = { name: '소재 판', origin: { x: 100, y: -170, z: PLATE_TOP }, rows: 3, cols: 3, pitch: 30, layers: 1, layerH: PART_H };
  const pallet: CellGrid = { name: '적재 판', origin: { x: 100, y: 100, z: PLATE_TOP }, rows: 3, cols: 3, pitch: 30, layers: 2, layerH: PART_H };
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
      belt: { min: [195, -400], max: [255, 17], topZ: BELT_TOP, dir: [0, 1], speed: 50 },
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
      magazine: { x: m.x, y: m.y, floorZ: BELT_TOP, capacity: 9, sensor: '매거진 있음' },
      sensors: [
        { name: '매거진 있음', kind: 'zone', min: [lo(m.x), lo(m.y), BELT_TOP], max: [hi(m.x), hi(m.y), BELT_TOP + PART_H] },
        { name: '끝 센서', kind: 'beam', a: [205, 12, 40], b: [245, 12, 40] },
      ],
      endPlace: '끝 위치',
      landing: { min: [211, -394], max: [239, -346] },
    },
    inputs: ['매거진 있음', '실린더 전진 끝', '실린더 후진 끝', '끝 센서'],
    outputs: ['공급 실린더', '컨베이어'],
  };
}

const LAYOUTS: Partial<Record<CellId, () => CellLayout>> = { feed: feedLayout };

const cache = new Map<CellId, CellLayout>();
/** A cell's layout (only built cells have one). */
export function cellLayout(id: CellId): CellLayout {
  const hit = cache.get(id);
  if (hit) return hit;
  const make = LAYOUTS[id];
  if (!make) throw new Error(`셀 ${id}은(는) 아직 없어요.`);
  const l = make();
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
