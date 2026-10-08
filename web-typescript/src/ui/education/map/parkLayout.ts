/**
 * Where everything stands in the 산업단지 (교육 홈 map). Units are Kenney Factory Kit units (a site
 * deck is 4.8 across), z up, the deck top at z = 0. Positions on a site are offsets from its centre.
 * Kenney models (public/education/park/kit, CC0, recoloured atlas) dress the sites; the robots are
 * ours (myCobot 280 from its URDF, myAGV, the AI kit), scaled up to read at map size.
 */

import type { SiteId } from '@/engine/education/park';

export type Xyz = readonly [number, number, number];

export const SITE_AT: Record<SiteId, readonly [number, number]> = {
  center: [0, 0],
  factory: [9, 0],
  logistics: [18, 0],
  lab: [18, 9],
  farm: [9, 9],
  cafe: [0, 9],
  ai: [9, 18],
};

/** The road between sites, in route order (the AI 연구소 is reached from the farm). */
export const ROADS: readonly (readonly [SiteId, SiteId])[] = [
  ['center', 'factory'],
  ['factory', 'logistics'],
  ['logistics', 'lab'],
  ['lab', 'farm'],
  ['farm', 'cafe'],
  ['farm', 'ai'],
];

export const DECK = 4.8;
export const SLAB = { centre: [9, 9] as const, size: 25.2 };

export type Prop =
  | { kind: 'kit'; name: string; at: Xyz; rot?: number; s?: number }
  | { kind: 'box'; size: Xyz; at: Xyz; color: string }
  | { kind: 'cyl'; r: number; h: number; at: Xyz; color: string }
  | { kind: 'ball'; r: number; at: Xyz; color: string }
  /** myCobot 280 at a pose (deg), turned `rot`° about z, `s` times its real size; `sway` = idle motion. */
  | { kind: 'arm'; at: Xyz; rot: number; angles: readonly number[]; s: number; sway?: boolean }
  | { kind: 'agv'; at: Xyz; rot: number; s: number }
  | { kind: 'aikit'; at: Xyz; rot: number; s: number };

const kit = (name: string, at: Xyz, rot = 0, s = 1): Prop => ({ kind: 'kit', name, at, rot, s });

export const SITE_PROPS: Record<SiteId, readonly Prop[]> = {
  center: [
    { kind: 'box', size: [2.0, 1.2, 0.7], at: [0, -0.2, 0.35], color: '#9aa6ba' },
    { kind: 'arm', at: [0, -0.2, 0.7], rot: 30, angles: [0, -15, -55, -20, 0, 0], s: 7.5, sway: true },
    kit('screen-wide', [-1.6, 1.6, 0], 45),
    kit('structure-short', [1.8, 1.8, 0]),
  ],
  factory: [
    kit('conveyor-long-stripe-sides', [-1, -1.2, 0]),
    kit('conveyor-long-stripe-sides', [1, -1.2, 0]),
    kit('scanner-high', [0.9, -1.2, 0]),
    kit('box-small', [-1.3, -1.2, 0.4], 0, 0.7),
    kit('box-small', [0.2, -1.2, 0.4], 15, 0.7),
    { kind: 'arm', at: [-0.3, 0.6, 0], rot: -60, angles: [0, -25, -70, -5, 0, 0], s: 8.5, sway: true },
    kit('machine', [1.5, 1.4, 0], 180, 0.9),
    kit('warning-traffic', [-2, 1.8, 0]),
  ],
  logistics: [
    kit('box-large', [-1.5, 1.5, 0], 0, 0.9),
    kit('box-large', [-1.5, 1.5, 0.55], 0, 0.9),
    kit('box-large', [-0.4, 1.5, 0], 0, 0.9),
    kit('box-large', [-0.4, 1.5, 0.55], 0, 0.9),
    kit('box-large', [-1.5, 0.5, 0], 0, 0.9),
    { kind: 'agv', at: [0.8, -0.6, 0], rot: 30, s: 5 },
    { kind: 'arm', at: [0.8, -0.6, 1.0], rot: 30, angles: [20, -30, -60, -10, 0, 0], s: 6, sway: true },
    kit('door-wide-open', [1.8, 1.9, 0], 0, 0.8),
    kit('structure-high', [-1.9, -1.2, 0], 0, 0.9),
    kit('box-wide', [-1.9, -1.2, 1.0], 0, 0.8),
    kit('conveyor-long-stripe', [1.0, 1.4, 0], 0, 0.9),
  ],
  lab: [
    kit('machine-window', [-1.3, 1.2, 0], 180, 0.9),
    kit('pipe-glass-large-long', [1.2, 1.6, 0], 0, 0.6),
    kit('hopper-round', [1.5, -1.3, 0], 0, 0.7),
    { kind: 'box', size: [2.2, 1.0, 0.6], at: [0.2, -0.4, 0.3], color: '#e9edf3' },
    { kind: 'arm', at: [-0.6, -0.4, 0.6], rot: 20, angles: [-10, -20, -60, -10, 0, 0], s: 7.5, sway: true },
    ...['#2f5be7', '#12935f', '#d9622b', '#7a3fd1'].map((color, i): Prop => ({ kind: 'cyl', r: 0.07, h: 0.4, at: [0.6 + i * 0.22, -0.4, 0.8], color })),
  ],
  farm: [
    ...[0, 1, 2].flatMap((i): Prop[] => [
      kit('hopper-square', [-1.5 + i * 1.2, 1.4, 0], 0, 0.6),
      ...[0, 1, 2].map((j): Prop => ({ kind: 'ball', r: 0.18, at: [-1.7 + i * 1.2 + j * 0.2, 1.4, 0.75], color: '#3a9b3a' })),
      kit('hopper-square', [-1.9, -1.4 + i * 1.0, 0], 90, 0.5),
    ]),
    kit('conveyor-stripe', [0.6, -1.3, 0], 90),
    { kind: 'arm', at: [-0.8, -0.6, 0], rot: 40, angles: [10, -20, -65, -5, 0, 0], s: 8, sway: true },
  ],
  cafe: [
    { kind: 'box', size: [3.4, 0.9, 0.9], at: [0, -0.6, 0.45], color: '#c9b39a' },
    { kind: 'arm', at: [0, 0.5, 0], rot: 200, angles: [0, -10, -50, -30, 0, 0], s: 8, sway: true },
    ...[0, 1, 2].map((i): Prop => ({ kind: 'cyl', r: 0.12, h: 0.28, at: [-1 + i * 0.5, -0.6, 1.04], color: '#ffffff' })),
    kit('screen-panel-small', [1.6, 1.6, 0], 200),
    { kind: 'box', size: [0.5, 0.5, 0.5], at: [-0.8, -1.6, 0.25], color: '#b4530f' },
    { kind: 'box', size: [0.5, 0.5, 0.5], at: [0.5, -1.6, 0.25], color: '#b4530f' },
  ],
  ai: [
    { kind: 'aikit', at: [0.6, -0.5, 0], rot: 30, s: 5 },
    { kind: 'arm', at: [-0.9, 0.2, 0], rot: 30, angles: [0, -20, -60, -10, 0, 0], s: 8.5, sway: true },
    kit('screen-hanging-wide', [-2.2, 2.2, 0], 45, 1.2),
    kit('scanner-low', [2.0, -2.0, 0]),
    kit('structure-high', [2.4, 2.4, 0]),
  ],
};

/** The park around the sites (absolute positions): trees, a car park and a warehouse in the empty corners. */
export const PARK_PROPS: readonly Prop[] = [
  ...(
    [
      [-2.2, 15.8],
      [-2.2, 20.2],
      [2.2, 20.2],
      [15.8, 20.2],
      [20.2, 20.2],
      [20.2, 15.8],
      [-2.6, 4.5],
      [20.6, 4.5],
      [4.5, -2.6],
      [13.5, -2.6],
    ] as const
  ).flatMap(([x, y]): Prop[] => [
    { kind: 'cyl', r: 0.08, h: 0.5, at: [x, y, 0.25], color: '#8a7560' },
    { kind: 'ball', r: 0.45, at: [x, y, 0.75], color: '#5aa55a' },
  ]),
  { kind: 'box', size: [4.2, 2.4, 0.02], at: [0, 17.6, 0.01], color: '#cdd4de' },
  ...['#2f5be7', '#f2f4f7', '#d9622b'].map((color, i): Prop => ({ kind: 'box', size: [0.7, 1.2, 0.4], at: [-1.2 + i * 1.1, 17.6, 0.2], color })),
  { kind: 'box', size: [4.0, 3.0, 2.0], at: [18, 18.6, 1.0], color: '#d7dde6' },
  { kind: 'box', size: [4.2, 3.2, 0.15], at: [18, 18.6, 2.05], color: '#9aa6ba' },
  kit('door-wide-closed', [18, 17.1, 0], 0, 0.9),
  kit('box-large', [16.6, 16.4, 0], 0, 0.8),
  kit('box-large', [17.5, 16.3, 0], 10, 0.8),
];

export const KIT_NAMES = [...new Set([...Object.values(SITE_PROPS).flat(), ...PARK_PROPS].flatMap((p) => (p.kind === 'kit' ? [p.name] : [])))];
export const kitUrl = (name: string) => `/education/park/kit/${name}.glb`;
