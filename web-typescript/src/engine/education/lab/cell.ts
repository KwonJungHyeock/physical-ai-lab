/**
 * 문제 해결 실습 (시범) — 컨베이어 공정: the work cell every problem uses. A belt conveyor runs
 * across the front of the myCobot 280, boxes ride it towards −y, photoelectric stop sensors (with
 * a stop gate) hold a box where the arm picks it, and the arm puts it on a wooden pallet at its
 * right. Boxes the arm misses ride off the end of the belt into a reject bin.
 *
 * Robot base frame, millimetres, z up, front = +x (as the rest of the simulator). The 3D drawing
 * (ui/education/lab/ConveyorCell.tsx) and the collision boxes here use the same numbers.
 */

import type { Box } from '../../physics/collide';
import { tcpFor } from '../../simulator/effectors';

export type Mm = [number, number, number];

/** The suction pump (as in the simulator's 물류 scene): flange face → cup face, mm. */
export const TCP_MM = tcpFor('pump', false);
/** Suction cup radius, mm (the official pump head's cup is about 20 mm across). */
export const CUP_R = 10;
/** The cup's bellows give this much: a cup pressed this far into a box top is still fine, mm. */
export const PRESS_MM = 3;

/** The arm's ready pose (the 교육 screens' HOME_POSE). */
export const HOME_Q = [0.61, 45.87, -92.37, -41.3, 2.02, 9.58];

/** Belt conveyor along y at x: belt top height, belt width, where boxes come on and fall off. */
export const BELT = { x: 220, width: 110, top: 70, yIn: 420, yOut: -150 } as const;
/** Outer half-width of the frame (side profiles), mm. */
export const FRAME_HALF = BELT.width / 2 + 12;

/** Wooden pallet at the arm's right: centre, deck height and size, mm. */
export const PALLET = { x: 30, y: -200, top: 30, sx: 240, sy: 200 } as const;
/** Places on the pallet, in the order boxes are put down (centre x, y), mm. */
export const SLOTS: readonly [number, number][] = [
  [85, -150],
  [-15, -150],
  [85, -245],
  [-15, -245],
];

/** Reject bin under the belt's far end, mm. */
export const BIN = { x: BELT.x, y: -238, sx: 120, sy: 110, h: 60, floor: 6 } as const;

/** A box on the belt: size across the belt (x), along it (y) and height, mm. */
export interface BoxSpec {
  id: string;
  name: string;
  size: Mm;
  color: string;
}

export const BOX_A: BoxSpec = { id: 'A', name: '상자 A', size: [60, 60, 50], color: '#c9995f' };
export const BOX_B: BoxSpec = { id: 'B', name: '상자 B', size: [70, 70, 60], color: '#bf8f58' };
export const BOX_C: BoxSpec = { id: 'C', name: '상자 C', size: [50, 50, 40], color: '#d3a56d' };

/** Top of a box standing on the belt, mm. */
export const boxTop = (b: BoxSpec) => BELT.top + b.size[2];

/** Photoelectric sensors sit on posts beside the belt; their beam crosses it this high, mm. */
export const BEAM_Z = BELT.top + 22;
/** Emitter post on the far side of the belt, reflector on the near side (x), mm. */
export const SENSOR_X = { emitter: BELT.x + FRAME_HALF + 14, reflector: BELT.x - FRAME_HALF - 10 } as const;

/** Fixed furniture as the boxes the arm keeps off (the arm's collision check, physics/collide.ts). */
export function fixedBoxes(sensorYs: readonly number[] = []): Box[] {
  return [
    // The belt (a box set on it touches it, no more) and the side profiles that stand 6 mm above it.
    { name: '컨베이어', min: [BELT.x - BELT.width / 2, BELT.yOut - 30, 0], max: [BELT.x + BELT.width / 2, BELT.yIn + 30, BELT.top] },
    ...[-1, 1].map(
      (s): Box => ({
        name: '컨베이어 옆판',
        min: [BELT.x + (s < 0 ? -FRAME_HALF : BELT.width / 2), BELT.yOut - 30, 0],
        max: [BELT.x + (s < 0 ? -BELT.width / 2 : FRAME_HALF), BELT.yIn + 30, BELT.top + 6],
      }),
    ),
    // The drive at the in-feed end, on the far side.
    { name: '컨베이어 모터', min: [BELT.x + FRAME_HALF, BELT.yIn - 30, 20], max: [BELT.x + FRAME_HALF + 64, BELT.yIn + 26, BELT.top + 10] },
    { name: '팔레트', min: [PALLET.x - PALLET.sx / 2, PALLET.y - PALLET.sy / 2, 0], max: [PALLET.x + PALLET.sx / 2, PALLET.y + PALLET.sy / 2, PALLET.top] },
    { name: '불량 상자함', min: [BIN.x - BIN.sx / 2, BIN.y - BIN.sy / 2, 0], max: [BIN.x + BIN.sx / 2, BIN.y + BIN.sy / 2, BIN.h] },
    // Sensor posts: the emitter (far side) and the reflector (near side), up to just above the beam.
    ...sensorYs.flatMap((y): Box[] => [
      { name: '센서', min: [SENSOR_X.emitter - 9, y - 9, 0], max: [SENSOR_X.emitter + 9, y + 9, BEAM_Z + 12] },
      { name: '센서 반사판', min: [SENSOR_X.reflector - 6, y - 9, 0], max: [SENSOR_X.reflector + 6, y + 9, BEAM_Z + 10] },
    ]),
  ];
}
