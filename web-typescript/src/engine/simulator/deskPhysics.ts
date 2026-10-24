/**
 * The rigid-body world beside the simulator, frame by frame (stage/DeskObjects.tsx runs it on the
 * screen; the 실습 셀 tests run it headless): the arm pushes the desk's objects, they fall and topple;
 * what the tool carries is the simulator's (exact, like the real tool) and the physics holds it
 * there, letting it fall when let go.
 */

import type { BlockSpec, PhysicsWorld } from '../physics/physics';
import { OBJECT_KINDS, type DeskObject } from './desk';
import type { WorldState } from './sim';

const yawQ = (deg: number): [number, number, number, number] => [0, 0, Math.sin((deg * Math.PI) / 360), Math.cos((deg * Math.PI) / 360)];

/** A desk object as a rigid body. */
export function objectSpec(o: DeskObject): BlockSpec {
  const shape = OBJECT_KINDS[o.kind].shape;
  return {
    id: o.id,
    color: o.color,
    at: [o.x, o.y, o.z + o.size[2] / 2],
    massG: o.massG,
    // A 실습 셀 part is stacked flat on flat: as a box (Rapier's cylinders touch at one point and a
    // stack of them wobbles and sinks).
    shape: shape === 'ball' ? 'ball' : o.kind !== 'puck' && (shape === 'cylinder' || shape === 'cup') ? 'cylinder' : 'box',
    dims: o.size,
    yawDeg: o.yawDeg,
    q: o.q,
    friction: o.kind === 'ball' ? 0.4 : 0.7,
    noSpin: o.kind === 'puck',
    ccd: o.kind !== 'puck',
  };
}

/**
 * One frame: the carried object where the simulator put it, the arm to its angles (or to `angles`,
 * a pose on its way there when a long frame is cut into steps), the objects back from the physics.
 */
export function stepDesk(w: WorldState, p: PhysicsWorld, dt: number, angles: readonly number[] = w.angles): void {
  const carried = w.carry ? w.objects.find((k) => k.id === w.carry!.id) : undefined;
  if (carried) p.pin(carried.id, [carried.x, carried.y, carried.z + carried.size[2] / 2], carried.q ?? yawQ(carried.yawDeg));
  else p.pin(null);
  p.stepTo(angles, dt);
  for (const pose of p.blocks()) {
    if (pose.id === carried?.id) continue;
    const o = w.objects.find((k) => k.id === pose.id);
    // Gone from the scene (a pin pressed into a housing): out of the physics world too.
    if (!o) {
      p.remove(pose.id);
      continue;
    }
    o.x = pose.at.x;
    o.y = pose.at.y;
    o.z = pose.at.z - o.size[2] / 2;
    o.q = [pose.q.x, pose.q.y, pose.q.z, pose.q.w];
    // Its turn about the vertical, for the simulator's grip and footprint rules.
    o.yawDeg = (Math.atan2(2 * (pose.q.w * pose.q.z + pose.q.x * pose.q.y), 1 - 2 * (pose.q.y * pose.q.y + pose.q.z * pose.q.z)) * 180) / Math.PI;
  }
}
