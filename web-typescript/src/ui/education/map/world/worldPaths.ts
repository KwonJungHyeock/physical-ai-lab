/**
 * Routes for the things that move on the world map: closed loops (a rounded rectangle or a circle,
 * walked at constant speed) and back-and-forth runs. A route answers "where, heading which way, after
 * s units along it" — heading as a turn about y with 0 facing +z (how the packs' cars face).
 * Pure maths, no three.js.
 */

export interface Pose {
  x: number;
  z: number;
  /** Turn about y, radians; 0 faces +z. */
  rot: number;
}

export interface Route {
  /** Length, units. */
  length: number;
  at(s: number): Pose;
}

/** A polyline route; closed loops wrap, open runs go to the end and come back. */
function polyline(pts: readonly (readonly [number, number])[], closed: boolean): Route {
  const P = closed ? [...pts, pts[0]] : [...pts];
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  const length = closed ? L : 2 * L;
  return {
    length,
    at(s0: number): Pose {
      let s = ((s0 % length) + length) % length;
      let back = false;
      if (!closed && s > L) {
        s = 2 * L - s;
        back = true;
      }
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1] || 1;
      const k = (s - cum[i - 1]) / seg;
      const [ax, az] = P[i - 1];
      const [bx, bz] = P[i];
      const dx = (bx - ax) * (back ? -1 : 1);
      const dz = (bz - az) * (back ? -1 : 1);
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, rot: Math.atan2(dx, dz) };
    },
  };
}

/**
 * A loop round a rounded rectangle centred (cx, cz), half sizes hx × hz, corner radius r. `cw`: the
 * way the clock's hands go seen from above (+x along the far side, then +z down the right side) —
 * with right-hand traffic, a clockwise car round a block keeps to the inner lane.
 */
export function rectLoop(cx: number, cz: number, hx: number, hz: number, r: number, cw = true): Route {
  const pts: [number, number][] = [];
  const corner = (ox: number, oz: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([ox + r * Math.cos(a), oz + r * Math.sin(a)]);
    }
  };
  // Clockwise seen from above with z towards the viewer: far side (−z) left → right, then down the right.
  corner(cx - hx + r, cz - hz + r, Math.PI);
  corner(cx + hx - r, cz - hz + r, (3 * Math.PI) / 2);
  corner(cx + hx - r, cz + hz - r, 0);
  corner(cx - hx + r, cz + hz - r, Math.PI / 2);
  return polyline(cw ? pts : pts.reverse(), true);
}

export function circleLoop(cx: number, cz: number, r: number, cw = true, n = 48): Route {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * (cw ? 1 : -1);
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return polyline(pts, true);
}

/** Back and forth along the points (turns round at each end). */
export function run(pts: readonly (readonly [number, number])[]): Route {
  return polyline(pts, false);
}

/** A boustrophedon over a field: rows along x, `rows` of them `gap` apart from z0. */
export function rows(x0: number, x1: number, z0: number, gap: number, n: number): Route {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const z = z0 + i * gap;
    if (i % 2 === 0) pts.push([x0, z], [x1, z]);
    else pts.push([x1, z], [x0, z]);
  }
  return polyline(pts, false);
}
