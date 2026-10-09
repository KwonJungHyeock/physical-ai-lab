/**
 * The world map: one island city with nine districts on a 3 × 3 street grid. The middle block is the
 * 로봇 아카데미 (the 28-차시 theory course); the eight around it are theme districts where the
 * myCobot 280 meets a real-life problem (a factory line, a parcel hub, a farm, a hospital lab, a city
 * street, an AI lab, a recycling plant, the data centre's digital twin).
 *
 * World units: 1 ≈ 4 m, a road tile is 2 × 2. x to the right, z towards the viewer, y up; the
 * camera looks from the front right, so tall things stand at the back (low z, low x).
 * Everything is placed by code from a seeded random, so the map is the same every time.
 */

import type { SiteId } from '@/engine/education/park';
import type { RobotModelId } from '@/engine/robot/catalog';

import type { Place, PackId } from './worldAssets';

/** Where each place of the city stands: its block centre (x, z), its yard colour, the pin's height. */
export interface District {
  id: SiteId;
  at: readonly [number, number];
  /** The block's inner ground. */
  ground: string;
  pinY: number;
}

/** Street lines (x and z of the road centrelines); blocks lie between them. */
export const LINES = [-24, -8, 8, 24] as const;

export const DISTRICTS: readonly District[] = [
  { id: 'center', at: [0, 0], ground: '#e8e3d8', pinY: 7.2 },
  { id: 'cafe', at: [-16, -16], ground: '#ddd2bf', pinY: 9.5 },
  { id: 'data', at: [0, -16], ground: '#d6dde6', pinY: 10.5 },
  { id: 'lab', at: [16, -16], ground: '#e4eaee', pinY: 7.6 },
  { id: 'ai', at: [-16, 0], ground: '#dcd9e8', pinY: 6.4 },
  { id: 'factory', at: [16, 0], ground: '#a3a9b1', pinY: 7 },
  { id: 'farm', at: [-16, 16], ground: '', pinY: 4.6 },
  { id: 'energy', at: [0, 16], ground: '#a6acb3', pinY: 5.6 },
  { id: 'logistics', at: [16, 16], ground: '#9fa5ad', pinY: 5.4 },
];

export const DISTRICT_BY_ID: ReadonlyMap<SiteId, District> = new Map(DISTRICTS.map((d) => [d.id, d]));

/** The island's outline half sizes (x, z) and corner radius. */
export const ISLAND = { hx: 32, hz: 31, r: 10 };

/** Flat ground pieces drawn over the grass: a block's yard, a farm plot, a plaza. */
export interface Ground {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  /** 'soil' gets furrows; 'pond' is water in a round bank. */
  kind?: 'plate' | 'soil' | 'disc' | 'pond';
  rot?: number;
}

/** A myCobot 280 shown at a district (scaled up to read on the map), on a pedestal in its colour. */
export interface MapRobot {
  district: SiteId;
  /** Which arm (the myCobot 280 RDK X5 when left out). */
  arm?: RobotModelId;
  x: number;
  z: number;
  rot: number;
  s: number;
  angles: readonly number[];
  pedestal?: number;
  /** Ground height under it (set when the map is built). */
  y?: number;
}

export interface WorldFeatures {
  grounds: Ground[];
  greenhouses: { x: number; z: number; len: number; rot: number }[];
  pavilions: { x: number; z: number; color: string; n: number; y?: number }[];
  hills: { x: number; z: number; rx: number; rz: number; h: number }[];
  robots: MapRobot[];
  /** The digital twin hologram over the data centre's plaza. */
  holo: { x: number; z: number };
  turbines: { x: number; z: number; rot: number; s: number }[];
  /** Conveyor belts (boxes ride them, Life.tsx): centre, length along x before turning `rot`. */
  conveyors: { x: number; z: number; len: number; rot: number }[];
  /** Blocks with a raised slab (every block but the farm). */
  slabs: { x: number; z: number }[];
  /** The harbour: a quay into the sea, a container crane, a ship alongside. */
  harbour: { x: number; z: number };
}

/** The top of a block's slab: models standing in a block are lifted to it. */
export const SLAB_TOP = 0.16;

/** A seeded random (mulberry32), so the map never changes between loads. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const P = (pack: PackId, model: string, x: number, z: number, rot = 0, s = 1, y = 0): Place => ({ pack, model, x, z, rot, s, y });
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

/** The street grid: KayKit road tiles every 2 units along each line, junctions where lines cross. */
function streets(): Place[] {
  const out: Place[] = [];
  const lo = LINES[0];
  const hi = LINES[LINES.length - 1];
  const isLine = (v: number) => (LINES as readonly number[]).includes(v);
  for (const z of LINES)
    for (let x = lo; x <= hi; x += 2)
      if (!isLine(x)) out.push(P('city', x % 6 === 0 && Math.abs(x) < 20 ? 'road_straight_crossing' : 'road_straight', x, z, 90));
  for (const x of LINES) for (let z = lo; z <= hi; z += 2) if (!isLine(z)) out.push(P('city', 'road_straight', x, z, 0));
  for (const x of LINES) {
    for (const z of LINES) {
      const edgeX = x === lo || x === hi;
      const edgeZ = z === lo || z === hi;
      if (edgeX && edgeZ) {
        const rot = x === lo ? (z === lo ? 0 : 90) : z === lo ? 270 : 180;
        out.push(P('city', 'road_corner_curved', x, z, rot));
      } else if (edgeX || edgeZ) {
        const rot = edgeZ ? (z === lo ? 180 : 0) : x === lo ? 270 : 90;
        out.push(P('city', 'road_tsplit', x, z, rot));
      } else out.push(P('city', 'road_junction', x, z, 0));
    }
  }
  return out;
}

/** A block's slab (a raised kerb all round, drawn in Features). */
function sidewalk(cx: number, cz: number): Place[] {
  F.slabs.push({ x: cx, z: cz });
  return [];
}

/** Street trees and lights on a block's sidewalk ring (front and right sides: the ones in view). */
function streetDress(r: () => number, cx: number, cz: number, trees = true): Place[] {
  const out: Place[] = [];
  for (let k = -5; k <= 5; k += 2.5) {
    if (trees && r() < 0.8) out.push(P('nature', pick(r, ['CommonTree_1', 'CommonTree_2', 'CommonTree_4']), cx + k, cz + 6.35, r() * 360, 0.6 + r() * 0.15));
    if (trees && r() < 0.8) out.push(P('nature', pick(r, ['CommonTree_1', 'CommonTree_2', 'CommonTree_4']), cx + 6.35, cz + k, r() * 360, 0.6 + r() * 0.15));
  }
  out.push(
    P('city', 'streetlight', cx - 6.5, cz + 6.5, 45),
    P('city', 'streetlight', cx + 6.5, cz - 6.5, 225),
    P('city', 'streetlight', cx + 6.5, cz + 6.5, 135),
  );
  return out;
}

const F: WorldFeatures = {
  grounds: [],
  greenhouses: [],
  pavilions: [],
  hills: [],
  robots: [],
  holo: { x: 0, z: -16 },
  turbines: [],
  conveyors: [],
  slabs: [],
  harbour: { x: 29.5, z: 3 },
};

/** 로봇 아카데미: a square round the robot statue, eight 학문 pavilions in a ring, the main hall behind. */
function academy(r: () => number): Place[] {
  const [cx, cz] = [0, 0];
  const out = [...sidewalk(cx, cz), ...streetDress(r, cx, cz)];
  F.grounds.push(
    { x: cx, z: cz, w: 10, d: 10, color: '#8fc46f' },
    { x: cx, z: cz + 0.8, w: 1.4, d: 10, color: '#e6dfd0' },
    { x: cx, z: cz + 0.8, w: 10, d: 1.4, color: '#e6dfd0' },
  );
  F.grounds.push(
    { x: cx, z: cz + 0.8, w: 8.4, d: 8.4, color: '#e9e3d6', kind: 'disc' },
    { x: cx, z: cz + 0.8, w: 3.2, d: 3.2, color: '#d4ccbb', kind: 'disc' },
  );
  out.push(P('commercial', 'building-h', cx - 2.2, cz - 4.4, 0, 1.15), P('commercial', 'building-j', cx + 2.6, cz - 4.4, 0, 1.15));
  const colors = ['#2f5be7', '#e0662b', '#12935f', '#d23c6a', '#7a4fe0', '#e3a21a', '#0fa3b8', '#5a6b84'];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 0.9 + (i / 7) * Math.PI * 1.2;
    F.pavilions.push({
      x: cx + Math.cos(a) * 3.5,
      z: cz + 0.8 - Math.sin(a) * 3.5,
      color: colors[i],
      n: i + 1,
    });
  }
  F.robots.push({
    district: 'center',
    x: cx,
    z: cz + 0.8,
    rot: -40,
    s: 13,
    angles: [0, -20, -50, -20, 0, 0],
    pedestal: 1.3,
  });
  for (const [dx, dz] of [
    [-4.3, 4.6],
    [4.3, 4.6],
    [-4.5, -1.6],
    [4.5, -1.6],
    [-2.2, 4.8],
    [2.2, 4.8],
  ])
    out.push(P('nature', pick(r, ['CommonTree_1', 'CommonTree_3']), cx + dx, cz + dz, r() * 360, 0.6));
  out.push(P('city', 'bench', cx - 1.4, cz + 3.6, 0), P('city', 'bench', cx + 1.4, cz + 3.6, 0));
  return out;
}

/** 스마트시티: towers at the back, shops round the edge, a café square with a serving robot. */
function city(r: () => number): Place[] {
  const [cx, cz] = [-16, -16];
  const out = [...sidewalk(cx, cz), ...streetDress(r, cx, cz)];
  F.grounds.push({ x: cx, z: cz, w: 10, d: 10, color: '#ded3c0' });
  out.push(P('commercial', 'building-skyscraper-d', cx - 3.4, cz - 3.4, 0, 1.25), P('commercial', 'building-skyscraper-a', cx + 0.3, cz - 3.7, 0, 1.05));
  out.push(P('commercial', 'building-skyscraper-b', cx + 3.6, cz - 3.5, 0, 1.1));
  const shops = [
    'building_A_withoutBase',
    'building_B_withoutBase',
    'building_C_withoutBase',
    'building_D_withoutBase',
    'building_E_withoutBase',
    'building_F_withoutBase',
    'building_G_withoutBase',
    'building_H_withoutBase',
  ];
  [-0.4, 1.6, 3.6].forEach((dz, i) => out.push(P('city', shops[(i + 2) % 8], cx - 4, cz + dz, 270)));
  [0.2, 2.2].forEach((dz, i) => out.push(P('city', shops[(i + 6) % 8], cx + 4, cz + dz, 90)));
  out.push(P('city', shops[1], cx + 4, cz + 4, 0), P('city', shops[4], cx - 1.6, cz + 4, 0));
  out.push(
    P('commercial', 'detail-parasol-a', cx + 0.2, cz + 0.4, 0, 0.75),
    P('commercial', 'detail-parasol-b', cx + 1.9, cz + 1.2, 0, 0.75),
    P('commercial', 'detail-parasol-a', cx + 0.4, cz + 2.2, 0, 0.75),
  );
  out.push(P('city', 'bench', cx + 1.6, cz + 3.2, 0), P('city', 'firehydrant', cx + 5.2, cz + 5.4), P('city', 'trash_A', cx - 2.6, cz + 5.2));
  F.robots.push({
    district: 'cafe',
    x: cx - 1.4,
    z: cz + 1.6,
    rot: 30,
    s: 9,
    angles: [30, -10, -60, -10, 0, 0],
    pedestal: 0.75,
  });
  return out;
}

/** 디지털 트윈 관제센터: a tall glass tower and server halls round a plaza with the twin hologram. */
function data(r: () => number): Place[] {
  const [cx, cz] = [0, -16];
  const out = [...sidewalk(cx, cz), ...streetDress(r, cx, cz)];
  F.grounds.push({ x: cx, z: cz, w: 10, d: 10, color: '#d7dee7' }, { x: cx + 1, z: cz + 1.6, w: 4.6, d: 4.6, color: '#bfd9e3', kind: 'disc' });
  out.push(P('commercial', 'building-skyscraper-e', cx - 3.2, cz - 3.2, 0, 1.45));
  out.push(P('industry', 'building-k', cx + 2.8, cz - 3.6, 0, 1.1), P('industry', 'building-k', cx - 3.6, cz + 2.4, 90, 1.0));
  out.push(P('industry', 'solar-panel-portrait-group', cx + 2.8, cz - 3.6, 0, 0.7, 1.4));
  for (let i = 0; i < 4; i++) out.push(P('space', 'containers_B', cx + 4.4, cz - 0.6 + i * 1.2, 90, 2.2));
  out.push(P('space', 'structure_tall', cx - 1.0, cz - 4.6, 0, 1.0));
  F.holo = { x: cx + 1, z: cz + 1.6 };
  return out;
}

/** 바이오·헬스케어: a white hospital and lab modules, a helipad, ambulances. */
function bio(r: () => number): Place[] {
  const [cx, cz] = [16, -16];
  const out = [...sidewalk(cx, cz), ...streetDress(r, cx, cz)];
  F.grounds.push({ x: cx, z: cz, w: 10, d: 10, color: '#e3e9ed' });
  out.push(P('commercial', 'building-skyscraper-c', cx - 3, cz - 3.4, 0, 1.15), P('commercial', 'building-n', cx - 3.6, cz + 0.6, 90, 1.2));
  out.push(
    P('space', 'basemodule_A', cx + 1.4, cz - 3.4, 0, 1.25),
    P('space', 'basemodule_C', cx + 3.8, cz - 3.4, 0, 1.25),
    P('space', 'basemodule_B', cx + 3.8, cz - 0.8, 270, 1.25),
  );
  out.push(P('space', 'landingpad_large', cx - 1.6, cz + 3.0, 0, 1.0));
  out.push(P('cars', 'ambulance', cx + 2.6, cz + 4.0, 0), P('cars', 'ambulance', cx + 3.8, cz + 4.0, 0));
  F.robots.push({
    district: 'lab',
    x: cx + 1.0,
    z: cz + 0.4,
    rot: 200,
    s: 9,
    angles: [0, -30, -40, -20, 0, 0],
    pedestal: 0.75,
  });
  return out;
}

/** 피지컬 AI 연구소: futuristic lab modules, solar roofs, an antenna, a drone pad and an AGV track. */
function ailab(r: () => number): Place[] {
  const [cx, cz] = [-16, 0];
  const out = [...sidewalk(cx, cz), ...streetDress(r, cx, cz)];
  F.grounds.push(
    { x: cx, z: cz, w: 10, d: 10, color: '#dcd9e7' },
    {
      x: cx + 1.4,
      z: cz + 2.2,
      w: 4.6,
      d: 4.6,
      color: '#c9c3df',
      kind: 'disc',
    },
  );
  out.push(P('space', 'basemodule_D', cx - 3, cz - 3, 0, 1.4), P('space', 'roofmodule_solarpanels', cx - 3, cz - 3, 0, 1.4, 1.4));
  out.push(P('space', 'basemodule_E', cx + 1.0, cz - 3.2, 0, 1.4), P('space', 'basemodule_C', cx + 3.8, cz - 3.2, 0, 1.2));
  out.push(P('space', 'basemodule_garage', cx - 3.2, cz + 1.2, 90, 1.25), P('space', 'structure_tall', cx - 3.8, cz + 4, 0, 1.2));
  out.push(P('space', 'landingpad_small', cx + 3.6, cz + 0, 0, 1.2), P('space', 'cargo_B', cx - 1.2, cz + 4.6, 30, 1.2));
  F.robots.push({
    district: 'ai',
    x: cx + 1.4,
    z: cz + 2.2,
    rot: 20,
    s: 9,
    angles: [-20, -40, -30, -30, 0, 0],
    pedestal: 0.75,
  });
  F.robots.push({ district: 'ai', arm: 'mecharm270-pi', x: cx + 3.7, z: cz + 3.7, rot: 210, s: 8, angles: [0, -10, -20, 0, 0, 0], pedestal: 0.6 });
  return out;
}

/** 스마트팩토리: big halls, a chimney and tanks; in the yard a conveyor between two arms (myCobot 280 and 320). */
function factory(r: () => number): Place[] {
  const [cx, cz] = [16, 0];
  const out = [...sidewalk(cx, cz), ...streetDress(r, cx, cz, false)];
  F.grounds.push({ x: cx, z: cz, w: 10, d: 10, color: '#a6acb4' });
  out.push(P('industry', 'building-a', cx - 2.4, cz - 3.2, 0, 1.25), P('industry', 'building-d', cx + 2.8, cz - 3.2, 0, 1.05));
  out.push(P('industry', 'chimney-large', cx + 4.4, cz - 0.4, 0, 0.9), P('industry', 'detail-tank-large', cx + 4.0, cz + 2.4, 0, 0.75));
  out.push(P('industry', 'shipping-container-a', cx - 4.0, cz + 4.4, 0), P('industry', 'shipping-container-c', cx - 3.3, cz + 4.4, 0));
  out.push(P('cars', 'truck', cx + 2.6, cz + 4.4, 270));
  F.robots.push({ district: 'factory', x: cx + 0.6, z: cz + 1.0, rot: 220, s: 9, angles: [0, -25, -60, -5, 0, 0], pedestal: 0.75 });
  F.robots.push({ district: 'factory', arm: 'mycobot320-pi', x: cx - 1.6, z: cz + 3.9, rot: 30, s: 5.5, angles: [0, -20, -50, -15, 0, 0], pedestal: 0.6 });
  F.conveyors.push({ x: cx - 0.4, z: cz + 2.6, len: 5.6, rot: 0 });
  return out;
}

/** 스마트팜: soil plots with crop rows, greenhouses, a barn, silos and a windmill; fields past the grid. */
function farm(r: () => number): Place[] {
  const [cx, cz] = [-16, 16];
  const out: Place[] = [];
  out.push(P('farm', 'BigBarn', cx - 4.2, cz - 4.2, 90, 1), P('farm', 'Silo', cx - 1.6, cz - 5.2, 0, 1), P('farm', 'Silo', cx - 0.5, cz - 5.2, 0, 0.9));
  out.push(P('farm', 'Windmill', cx + 4.6, cz - 4.4, 200, 1.05));
  F.greenhouses.push({ x: cx + 1.6, z: cz - 1.6, len: 6.6, rot: 0 }, { x: cx + 1.6, z: cz + 0.6, len: 6.6, rot: 0 });
  const crops: [string, number][] = [
    ['Tomato_4', 2.0],
    ['Lettuce_4', 2.6],
    ['Corn_4', 1.7],
    ['Carrot_4', 2.6],
  ];
  [
    [-3.6, 3.2],
    [1.6, 3.2],
  ].forEach(([dx, dz], f) => {
    F.grounds.push({
      x: cx + dx,
      z: cz + dz,
      w: 4.6,
      d: 4.4,
      color: '#8d6a4b',
      kind: 'soil',
    });
    for (let row = 0; row < 5; row++)
      for (let k = 0; k < 7; k++) {
        const [crop, s] = crops[(f * 2 + (row % 2)) % crops.length];
        out.push(P('farm', crop, cx + dx - 1.95 + k * 0.65, cz + dz - 1.7 + row * 0.85, r() * 360, s * (0.9 + r() * 0.2)));
      }
  });
  out.push(P('cars', 'tractor', cx - 4.6, cz + 0.2, 300));
  F.robots.push({
    district: 'farm',
    x: cx - 3.4,
    z: cz - 0.6,
    rot: 30,
    s: 9,
    angles: [10, -40, -20, -40, 0, 0],
    pedestal: 0.9,
  });
  // Fields beyond the grid (left): soil plots of wheat and corn, a farmhouse.
  for (let i = 0; i < 3; i++) {
    const z = -2 + i * 9;
    F.grounds.push({
      x: -29.5,
      z,
      w: 6,
      d: 7,
      color: i === 1 ? '#a8894f' : '#8d6a4b',
      kind: 'soil',
    });
    for (let row = 0; row < 6; row++)
      for (let k = 0; k < 7; k++) out.push(P('farm', i === 1 ? 'Wheat_4' : 'Corn_4', -32.2 + k * 0.85, z - 3 + row * 1.15, r() * 360, 1.6 + r() * 0.3));
  }
  out.push(P('farm', 'SmallBarn', -29.5, 25.5, 0, 1));
  return out;
}

/** 에너지·자원순환: a recycling plant on a yard, a solar field; wind turbines on the far hill. */
function energy(r: () => number): Place[] {
  const [cx, cz] = [0, 16];
  const out = [...sidewalk(cx, cz)];
  F.grounds.push({ x: cx, z: cz - 2.5, w: 10, d: 5, color: '#a9afb6' }, { x: cx, z: cz + 2.5, w: 10, d: 5, color: '#8fbf6a' });
  out.push(
    P('industry', 'building-m', cx - 2.8, cz - 3.4, 0, 1.0),
    P('industry', 'building-l', cx + 0.9, cz - 3.6, 0, 0.9),
    P('industry', 'chimney-small', cx - 0.8, cz - 4.4, 0, 1),
  );
  out.push(P('cars', 'garbage-truck', cx + 3.8, cz - 1.6, 0));
  ['containers_A', 'containers_C', 'containers_D'].forEach((m, i) => out.push(P('space', m, cx - 3.6 + i * 1.1, cz - 0.8, 0, 2)));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) out.push(P('industry', 'solar-panel-landscape-group', cx - 3.2 + i * 3.1, cz + 1.4 + j * 2.0, 0, 0.95));
  F.robots.push({
    district: 'energy',
    x: cx + 1.6,
    z: cz - 0.9,
    rot: 160,
    s: 9,
    angles: [0, -35, -45, -10, 0, 0],
    pedestal: 0.75,
  });
  for (let i = 0; i < 3; i++) F.turbines.push({ x: 24 + i * 3.4, z: -28 + i * 1.6, rot: 45, s: 2.2 });
  for (let i = 0; i < 2; i++) F.turbines.push({ x: -29 + i * 3.4, z: -28.5 + i * 0.8, rot: 45, s: 2.0 });
  void r;
  return out;
}

/** 물류 허브: a big warehouse, a container yard, trucks at the docks, a palletizing robot. */
function logistics(r: () => number): Place[] {
  const [cx, cz] = [16, 16];
  const out = [...sidewalk(cx, cz)];
  F.grounds.push({ x: cx, z: cz, w: 10, d: 10, color: '#a1a7af' });
  out.push(P('industry', 'building-b', cx - 2.0, cz - 3.0, 0, 1.45));
  const box = ['shipping-container-a', 'shipping-container-b', 'shipping-container-c'];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      const h = 1 + Math.floor(r() * 3);
      for (let k = 0; k < h; k++) out.push(P('industry', box[(i + j + k) % 3], cx + 2.0 + i * 0.75, cz - 3.4 + j * 1.6, 0, 1, k * 0.61));
    }
  for (let i = 0; i < 3; i++) out.push(P('industry', box[i], cx + 2.0 + i * 0.75, cz + 2.6, 0, 1));
  out.push(P('cars', 'truck-flat', cx - 3.8, cz + 1.4, 90), P('cars', 'truck', cx - 3.8, cz + 3.2, 90), P('cars', 'delivery', cx + 4.4, cz + 4.4, 0));
  out.push(P('city', 'box_A', cx - 0.6, cz + 3.6, 0, 3), P('city', 'box_B', cx - 0.1, cz + 3.8, 20, 3), P('city', 'box_A', cx - 0.4, cz + 4.3, 45, 3));
  F.robots.push({
    district: 'logistics',
    x: cx + 0.2,
    z: cz + 1.4,
    rot: 210,
    s: 9,
    angles: [0, -10, -70, 0, 0, 0],
    pedestal: 0.75,
  });
  F.robots.push({ district: 'logistics', arm: 'mypalletizer260-pi', x: cx + 1.6, z: cz + 3.9, rot: 200, s: 7, angles: [0, 10, 20, 0], pedestal: 0.6 });
  F.conveyors.push({ x: cx - 1.6, z: cz + 0.6, len: 3.2, rot: 90 });
  // The harbour quay beyond the hub: container rows waiting for the ship.
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 1 + ((i + j) % 2); k++) out.push(P('industry', box[(i + j + k) % 3], 28.0 + i * 0.75, -2.2 + j * 1.7, 0, 1, 0.35 + k * 0.61));
  out.push(P('cars', 'truck-flat', 27.4, 4.6, 0), P('cars', 'truck', 28.6, 7.2, 180));
  return out;
}

/** Trees in clumps, bushes, rocks and flowers on the grass round the grid; low hills at the back. */
function nature(r: () => number): Place[] {
  const out: Place[] = [];
  const broad = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
  const pines = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'];
  const inGrid = (x: number, z: number) => Math.abs(x) < 25.6 && Math.abs(z) < 25.6;
  const busy = (x: number, z: number) => (x < -25 && z > -7 && z < 27) || (x > 25.5 && z > -5 && z < 11) || Math.hypot(x + 6, z - 28.6) < 3.4;
  const onIsland = (x: number, z: number, m: number) => {
    const ax = Math.max(0, Math.abs(x) - (ISLAND.hx - ISLAND.r));
    const az = Math.max(0, Math.abs(z) - (ISLAND.hz - ISLAND.r));
    return Math.hypot(ax, az) < ISLAND.r - m;
  };
  F.hills.push(
    { x: -28, z: -27, rx: 7, rz: 5, h: 2.6 },
    { x: -12, z: -29.5, rx: 6, rz: 3.2, h: 1.6 },
    { x: 22, z: -29, rx: 7, rz: 3.4, h: 1.8 },
    { x: 28.5, z: -13, rx: 3.4, rz: 5, h: 1.5 },
  );
  // A pond on the front lawn, with reeds and rocks round it.
  F.grounds.push({
    x: -6,
    z: 28.6,
    w: 5.2,
    d: 5.2,
    color: '#5fb4cf',
    kind: 'pond',
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    out.push(
      P('nature', i % 3 === 0 ? 'Rock_Medium_2' : 'Grass_Common_Tall', -6 + Math.cos(a) * 2.8, 28.6 + Math.sin(a) * 2.6, r() * 360, i % 3 === 0 ? 0.7 : 1.8),
    );
  }
  // Clumps: a few placed, the rest at random; a centre, a radius, a mix.
  const fixed: [number, number][] = [
    [-21, 28.5],
    [6, 29],
    [16, 28.5],
    [-29, -15],
    [-19, -28.5],
    [14, -28.5],
  ];
  for (let c = 0; c < 76; c++) {
    const x0 = c < fixed.length ? fixed[c][0] : (r() * 2 - 1) * (ISLAND.hx - 2);
    const z0 = c < fixed.length ? fixed[c][1] : (r() * 2 - 1) * (ISLAND.hz - 2);
    if (inGrid(x0, z0) || busy(x0, z0) || !onIsland(x0, z0, 2)) continue;
    const back = z0 < -20 || x0 < -26;
    const n = 4 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 3.2;
      const x = x0 + Math.cos(a) * d;
      const z = z0 + Math.sin(a) * d;
      if (inGrid(x, z) || busy(x, z) || !onIsland(x, z, 1.4)) continue;
      out.push(P('nature', pick(r, back && r() < 0.6 ? pines : broad), x, z, r() * 360, 0.85 + r() * 0.55));
    }
  }
  for (let i = 0; i < 700 && out.length < 520; i++) {
    const x = (r() * 2 - 1) * ISLAND.hx;
    const z = (r() * 2 - 1) * ISLAND.hz;
    if (inGrid(x, z) || busy(x, z) || !onIsland(x, z, 1)) continue;
    const t = r();
    if (t < 0.35) out.push(P('nature', r() < 0.5 ? 'Bush_Common' : 'Bush_Common_Flowers', x, z, r() * 360, 1.1 + r() * 0.6));
    else if (t < 0.5) out.push(P('nature', pick(r, ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']), x, z, r() * 360, 0.7 + r() * 0.8));
    else if (t < 0.8) out.push(P('nature', r() < 0.5 ? 'Flower_3_Group' : 'Flower_4_Group', x, z, r() * 360, 1.6));
    else out.push(P('nature', 'Grass_Common_Tall', x, z, r() * 360, 1.8));
  }
  return out;
}

/** The ground height at (x, z): 0 on the flat, up a hill's surface where there is one. */
export function groundY(f: WorldFeatures, x: number, z: number) {
  return Math.max(0, ...f.hills.map((h) => h.h * Math.sqrt(Math.max(0, 1 - ((x - h.x) / h.rx) ** 2 - ((z - h.z) / h.rz) ** 2))));
}

let cached: { places: Place[]; features: WorldFeatures } | null = null;

/** Every model on the map and the procedural features (built once). */
export function world(): { places: Place[]; features: WorldFeatures } {
  if (cached) return cached;
  const r = rng(20261009);
  const places = [
    ...streets(),
    ...academy(r),
    ...city(r),
    ...data(r),
    ...bio(r),
    ...ailab(r),
    ...factory(r),
    ...farm(r),
    ...energy(r),
    ...logistics(r),
    ...nature(r),
  ];
  const onSlab = (x: number, z: number) => F.slabs.some((b) => Math.abs(x - b.x) < 6.9 && Math.abs(z - b.z) < 6.9);
  for (const p of places) if (onSlab(p.x, p.z)) p.y = (p.y ?? 0) + SLAB_TOP;
  for (const o of [...F.robots, ...F.pavilions]) o.y = onSlab(o.x, o.z) ? SLAB_TOP + 0.04 : 0.04;
  // The ship's deck cargo.
  const { x: hx, z: hz } = F.harbour;
  const box = ['shipping-container-a', 'shipping-container-b', 'shipping-container-c'];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 5; j++)
      for (let k = 0; k < 1 + ((i * 3 + j) % 3 === 0 ? 0 : 1); k++)
        places.push(P('industry', box[(i + j * 2 + k) % 3], hx + 9.6 + i * 0.68, hz - 4.2 + j * 1.5, 0, 1, 0.55 + k * 0.61));
  cached = { places, features: F };
  return cached;
}
