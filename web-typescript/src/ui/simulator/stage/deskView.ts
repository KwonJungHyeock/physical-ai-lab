/**
 * 입문 과정 무대 (courseStage.ts): keeps every view on the desk. The desk top has to fill the bottom
 * of the picture and nothing may show past an edge of the desk that faces the camera (its legs,
 * the space under it); past the far edges is only the plain background, which is allowed. A view
 * that would show more comes closer to what it looks at, a step at a time, until it does not.
 *
 * Three.js coordinates (y up; robot x -> x, robot y -> -z, robot z -> y), metres; the desk in robot mm.
 */

import { PerspectiveCamera, Vector3 } from 'three';

export interface DeskRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const probe = new PerspectiveCamera();
const ray = new Vector3();
const N = 9;
/** The desk top's height (the paper, the robot's base: z 0). */
const TOP_Y = 0;

/**
 * What of the picture shows, normalised device coordinates: the right edge (a panel over the scene's
 * right side hides the rest) and the top edge (the bars over it). The menu bar, the mini arm and the
 * view tools float over the scene and do not count.
 */
export interface Shown {
  right: number;
  top: number;
}

/** What shows of a w × h view, from the pixels a panel hides on the right and the bars on top. */
export const shownOf = (hide: { r: number; t: number } | null | undefined, w: number, h: number): Shown => ({ right: hide && w > 0 ? 1 - (2 * hide.r) / w : 1, top: hide && h > 0 ? 1 - (2 * hide.t) / h : 1 });

/** How many of the rays along the picture's bottom and sides show what they must not (0: the view is fine). */
export function deskMisses(pos: Vector3, target: Vector3, camera: PerspectiveCamera, desk: DeskRect, shown: Shown = { right: 1, top: 1 }): number {
  probe.fov = camera.fov;
  probe.aspect = camera.aspect;
  probe.near = camera.near;
  probe.far = camera.far;
  probe.updateProjectionMatrix();
  probe.position.copy(pos);
  probe.up.set(0, 1, 0);
  probe.lookAt(target);
  probe.updateMatrixWorld();
  const X0 = desk.x0 / 1000;
  const X1 = desk.x1 / 1000;
  const Z0 = -desk.y1 / 1000;
  const Z1 = -desk.y0 / 1000;
  // The edges the camera is outside of face it: seen past, they would show their side and what is under them.
  const facing = { x0: pos.x < X0, x1: pos.x > X1, z0: pos.z < Z0, z1: pos.z > Z1 };
  const left = -1;
  const right = shown.right;
  const bottom = -1;
  const top = shown.top;
  const hit = (u: number, v: number): { x: number; z: number } | null => {
    ray.set(u, v, 0.5).unproject(probe).sub(pos).normalize();
    if (ray.y >= -1e-6) return null;
    const t = (TOP_Y - pos.y) / ray.y;
    return { x: pos.x + ray.x * t, z: pos.z + ray.z * t };
  };
  let miss = 0;
  for (let k = 0; k < N; k += 1) {
    // The bottom: all of it on the desk.
    const h = hit(left + ((right - left) * k) / (N - 1), bottom);
    if (!h || h.x < X0 || h.x > X1 || h.z < Z0 || h.z > Z1) miss += 1;
    // The sides: nothing past an edge that faces the camera.
    for (const u of [left, right]) {
      const s = hit(u, bottom + ((top - bottom) * k) / (N - 1));
      if (!s) continue;
      if ((s.x < X0 && facing.x0) || (s.x > X1 && facing.x1) || (s.z < Z0 && facing.z0) || (s.z > Z1 && facing.z1)) miss += 1;
    }
  }
  return miss;
}

/** The camera position for a view of `target` from `pos` that keeps to the desk (closer along the same line if need be). */
export function deskSafe(pos: Vector3, target: Vector3, camera: PerspectiveCamera, desk: DeskRect, shown?: Shown): Vector3 {
  const p = pos.clone();
  for (let i = 0; i < 20 && deskMisses(p, target, camera, desk, shown) > 0; i += 1) p.sub(target).multiplyScalar(0.94).add(target);
  return p;
}
