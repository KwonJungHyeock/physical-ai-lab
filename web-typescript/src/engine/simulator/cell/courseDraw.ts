/**
 * 입문 과정 4장 (장별 가이드라인 v1): 좌표와 궤적선 그리기 on the 글씨 부스 mat, the card put away.
 *  - 4-2: two points, gone to with a joint move and then a straight (linear) move.
 *  - 4-3: shapes from their corners (꼭짓점 표): a triangle and a square, closed by the app.
 *  - 4-4: a circle as short straight lines (8 points, then 24).
 *  - 4장 미션: a star in one stroke through five given corners (each line skips one).
 * The programs are the 실습 셀's own `robot.move_to` lines, so the real robot runs the same; the
 * verdicts read the ink (the pen's trail on the paper, robot mm). No React.
 */

import { CARD_HOME, CARD_MM, LIFT_MM, MAT, readInkFor } from './draw';

export type Pt = readonly [number, number];
export type Ink = readonly (readonly Pt[])[];

/** 4-2: the two points, A then B (robot mm, on the mat). */
export const LINE_A: Pt = [150, -60];
export const LINE_B: Pt = [250, 40];
/** 4-3: the triangle and the square (the square's side 56 mm, as G3's). */
export const TRIANGLE: readonly Pt[] = [
  [160, -50],
  [240, -50],
  [200, 20],
];
export const SQUARE: readonly Pt[] = [
  [170, -40],
  [226, -40],
  [226, 16],
  [170, 16],
];
/** 4-4: the circle, and the two point counts. */
export const CIRCLE = { x: 200, y: -10, r: 30 } as const;
export const CIRCLE_COUNTS = [8, 24] as const;
/** 4장 미션: the star's five corners (교안 gives them in no order). */
export const STAR: readonly Pt[] = [
  [200, 25],
  [233, 1],
  [221, -38],
  [179, -38],
  [167, 1],
];

/**
 * How near: a corner (and a closed end) 2 mm, a straight side 1 mm, a circle's centre 2 mm and radius
 * ± 2 mm; the 24-point circle 1 mm from the round one (measured: the straight moves themselves stray
 * up to about 0.6 mm, so the drawn 24-point circle is 0.8 mm off where the chords alone are 0.26 mm).
 */
export const TOL = { corner: 2, line: 1, close: 2, centre: 2, radius: 2, circle24: 1 } as const;

/** The mat's area a point may be put on (the robot draws there only). */
export const onMat = ([x, y]: Pt) => x >= MAT.x0 && x <= MAT.x1 && y >= MAT.y0 && y <= MAT.y1;

const r1 = (v: number) => String(Math.round(v * 10) / 10);
const to = (x: number, y: number, z: number, linear = true) => `robot.move_to(${r1(x)}, ${r1(y)}, ${r1(z)}${linear ? '' : ', linear=False'})\n`;

/**
 * The program for a pen path: down onto the first point from above, along the rest (straight or joint
 * moves), back to the first when `close`, and up again. `z`: the pen's height on the paper (펜 값).
 */
export function pathCode(pts: readonly Pt[], o: { linear: boolean; close: boolean; z?: number }): string {
  const z = o.z ?? 0;
  const [x0, y0] = pts[0];
  let code = 'from edu import robot\n\n' + to(x0, y0, z + LIFT_MM) + to(x0, y0, z);
  for (const [x, y] of pts.slice(1)) code += to(x, y, z, o.linear);
  const end = o.close && pts.length > 2 ? pts[0] : pts[pts.length - 1];
  if (o.close && pts.length > 2) code += to(end[0], end[1], z, o.linear);
  code += to(end[0], end[1], z + LIFT_MM);
  return code;
}

/** 4-4: `n` points on the circle, from its right-hand side, counter-clockwise. */
export function circlePoints(c: { x: number; y: number; r: number }, n: number): Pt[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return [c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a)] as Pt;
  });
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Distance from p to the segment a–b. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const strokes = (ink: Ink) => ink.filter((s) => s.length > 1);
const round1 = (v: number) => Math.round(v * 10) / 10;

/** 4-2: how far the line drawn strays from A–B (mm), and whether it reaches both ends. */
export function lineReport(ink: Ink, a: Pt = LINE_A, b: Pt = LINE_B): { drawn: boolean; maxDev: number; ends: boolean } {
  const pts = strokes(ink).flat();
  if (pts.length < 2) return { drawn: false, maxDev: 0, ends: false };
  const maxDev = round1(Math.max(...pts.map((p) => segDist(p, a, b))));
  const near = (q: Pt) => Math.min(...pts.map((p) => dist(p, q)));
  return { drawn: true, maxDev, ends: near(a) <= TOL.corner && near(b) <= TOL.corner };
}

/** The same closed shape: the same corners in the same ring, from any start, either way round (each within 2 mm). */
export function sameShape(got: readonly Pt[], want: readonly Pt[]): boolean {
  if (got.length !== want.length) return false;
  const n = want.length;
  for (const dir of [1, -1]) for (let s = 0; s < n; s += 1) if (want.every((w, k) => dist(got[(s + dir * k + n * 2) % n], w) <= TOL.corner)) return true;
  return false;
}

export interface ShapeReport {
  ok: boolean;
  /** One line per check, as the panel says it. */
  items: { label: string; ok: boolean; detail?: string }[];
}

/**
 * 4-3 (and the star): the ink against the shape's corners, in the order they are joined. Every corner
 * passed within 2 mm, the end back on the start within 2 mm, each side straight within 1 mm, one stroke.
 */
export function shapeReport(ink: Ink, ring: readonly Pt[]): ShapeReport {
  const ss = strokes(ink);
  const pts = ss.flat();
  if (pts.length < 2) return { ok: false, items: [{ label: '선이 그려졌어요', ok: false, detail: '아무것도 안 그려졌어요' }] };
  const miss = ring.map((c) => Math.min(...pts.map((p) => dist(p, c))));
  const worstCorner = round1(Math.max(...miss));
  const first = ss[0][0];
  const lastStroke = ss[ss.length - 1];
  const last = lastStroke[lastStroke.length - 1];
  const gap = round1(dist(first, last));
  const sides = ring.map((c, k) => [c, ring[(k + 1) % ring.length]] as const);
  const dev = round1(Math.max(...pts.map((p) => Math.min(...sides.map(([a, b]) => segDist(p, a, b))))));
  const items = [
    { label: `꼭짓점마다 ${TOL.corner} mm 안`, ok: worstCorner <= TOL.corner, detail: `가장 먼 꼭짓점 ${worstCorner} mm` },
    { label: '닫힌 도형 (끝이 시작점으로)', ok: gap <= TOL.close, detail: `끝과 시작 ${gap} mm` },
    { label: `변이 곧음 (선에서 ${TOL.line} mm 안)`, ok: dev <= TOL.line, detail: `가장 많이 휜 곳 ${dev} mm` },
    { label: '펜을 들지 않고 한 번에', ok: ss.length === 1, detail: ss.length === 1 ? undefined : `선이 ${ss.length}개로 끊겼어요` },
  ];
  return { ok: items.every((i) => i.ok), items };
}

/** 4-4: the circle drawn against the ideal one — the most it strays (mm) and whether it closes. */
export function circleReport(ink: Ink, c: { x: number; y: number; r: number }): { drawn: boolean; maxDev: number; closed: boolean } {
  const ss = strokes(ink);
  const pts = ss.flat();
  if (pts.length < 3) return { drawn: false, maxDev: 0, closed: false };
  const maxDev = Math.round(Math.max(...pts.map((p) => Math.abs(Math.hypot(p[0] - c.x, p[1] - c.y) - c.r))) * 100) / 100;
  const last = ss[ss.length - 1];
  return { drawn: true, maxDev, closed: ss.length === 1 && dist(ss[0][0], last[last.length - 1]) <= TOL.close };
}

/** 4-4 ①: the centre and radius typed in, near enough to (200, −10) and 30. */
export const circleRight = (c: { x: number; y: number; r: number }) => Math.hypot(c.x - CIRCLE.x, c.y - CIRCLE.y) <= TOL.centre && Math.abs(c.r - CIRCLE.r) <= TOL.radius;

/**
 * 4장 미션: the order typed is a star — the five given corners, each once, and every line skipping one
 * (the next corner round the outline is never the next one joined). Any start, either way round.
 */
export function isStarOrder(got: readonly Pt[], corners: readonly Pt[] = STAR): boolean {
  if (got.length !== corners.length) return false;
  const idx = got.map((p) => corners.findIndex((c) => dist(p, c) <= TOL.corner));
  if (idx.some((i) => i < 0) || new Set(idx).size !== corners.length) return false;
  // Round the outline: the corners by their angle about the middle.
  const mx = corners.reduce((s, c) => s + c[0], 0) / corners.length;
  const my = corners.reduce((s, c) => s + c[1], 0) / corners.length;
  const ring = corners.map((c, i) => ({ i, a: Math.atan2(c[1] - my, c[0] - mx) })).sort((p, q) => p.a - q.a);
  const pos = new Map(ring.map((r, k) => [r.i, k]));
  const n = corners.length;
  return idx.every((i, k) => {
    const d = Math.abs(pos.get(i)! - pos.get(idx[(k + 1) % n])!);
    return Math.min(d, n - d) === 2;
  });
}

/** The vertex table's rows → points (rows not filled in are left out; null when one is half filled or off the mat). */
export function rowsToPoints(rows: readonly { x: string; y: string }[]): { pts: Pt[]; bad: string | null } {
  const pts: Pt[] = [];
  for (const [k, r] of rows.entries()) {
    const sx = r.x.trim();
    const sy = r.y.trim();
    if (!sx && !sy) continue;
    const x = Number(sx);
    const y = Number(sy);
    if (!sx || !sy || !Number.isFinite(x) || !Number.isFinite(y)) return { pts, bad: `${k + 1}번 점의 x와 y를 모두 넣어요` };
    if (!onMat([x, y])) return { pts, bad: `${k + 1}번 점이 매트 밖이에요 (x ${MAT.x0}~${MAT.x1} · y ${MAT.y0}~${MAT.y1})` };
    pts.push([x, y]);
  }
  return { pts, bad: null };
}

/* --- 5-4 내 글자 쓰기: strokes drawn on the board, written on the card ------------------------------ */

/** The card 5-4 writes on (its bottom-left corner, robot mm) and its size; the board's drawing area inside it (card mm, 10 mm in from each side). */
export const MY_CARD = { corner: CARD_HOME, w: CARD_MM.w, h: CARD_MM.h } as const;
export const MY_AREA = { x0: 10, x1: 110, y0: 10, y1: 70 } as const;
/** A stroke shorter than this (a tap) is dropped, mm; points kept along a stroke at least this far apart, mm. */
export const STROKE_MIN_MM = 2;
export const STROKE_STEP_MM = 1.5;

/** Card mm → robot mm. */
export const onCard = ([u, v]: Pt): Pt => [MY_CARD.corner.x + u, MY_CARD.corner.y + v];

/** A stroke as drawn (card mm) thinned to points at least STROKE_STEP_MM apart (its last point kept); null when it is a tap. */
export function thinStroke(pts: readonly Pt[]): Pt[] | null {
  if (pts.length < 2) return null;
  const out: Pt[] = [pts[0]];
  for (const p of pts.slice(1)) if (dist(p, out[out.length - 1]) >= STROKE_STEP_MM) out.push(p);
  const last = pts[pts.length - 1];
  if (dist(last, out[out.length - 1]) > 0.3) out.push(last);
  let len = 0;
  for (let i = 1; i < out.length; i += 1) len += dist(out[i - 1], out[i]);
  return len >= STROKE_MIN_MM && out.length >= 2 ? out : null;
}

/** How far the line sent may stray from the stroke drawn, mm: points that change the shape less are not sent (6장 확정: 0.3 mm). */
export const SEND_TOL_MM = 0.3;

/** A stroke with the points that change its shape by no more than `tol` mm left out (Ramer–Douglas–Peucker; both ends kept). */
export function simplify(pts: readonly Pt[], tol = SEND_TOL_MM): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const todo: [number, number][] = [[0, pts.length - 1]];
  while (todo.length) {
    const [a, b] = todo.pop()!;
    let far = 0;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > far) [far, at] = [d, i];
    }
    if (at > 0 && far > tol) {
      keep[at] = true;
      todo.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Whether a card point lies in the drawing area (with `slack` mm). */
export const inArea = ([u, v]: Pt, slack = 0) => u >= MY_AREA.x0 - slack && u <= MY_AREA.x1 + slack && v >= MY_AREA.y0 - slack && v <= MY_AREA.y1 + slack;

/**
 * 5-4's program (and 5-5's, sent to the robot as it is): every stroke from above (the pen down onto its
 * start, along it, up again: 획 사이 펜 들기 on), straight moves, the pen at `z`, then back home. A
 * `speed` (5-5's 실물 속도, %) is set first when given. Each stroke is sent simplified (SEND_TOL_MM).
 */
export function cardCode(strokes: readonly (readonly Pt[])[], o: { z?: number; speed?: number } = {}): string {
  const z = o.z ?? 0;
  let code = 'from edu import robot\n\n';
  if (o.speed != null) code += `robot.set_speed(${Math.round(o.speed)})\n`;
  for (const s of strokes) {
    const pts = simplify(s).map(onCard);
    const [x0, y0] = pts[0];
    code += to(x0, y0, z + LIFT_MM) + to(x0, y0, z);
    for (const [x, y] of pts.slice(1)) code += to(x, y, z);
    const [xe, ye] = pts[pts.length - 1];
    code += to(xe, ye, z + LIFT_MM);
  }
  return code + 'robot.home()\n';
}

/** 5-4's checks: the card's ink against the strokes drawn (5-3's own reading: outside ≤ 2 mm, lines between strokes ≤ 3 mm), two strokes or more (the run's own end — no collision, fault or break — is judged by the caller). */
export function myCardReport(ink: Ink, strokes: readonly (readonly Pt[])[]): ShapeReport {
  const want = strokes.map((s) => s.map(onCard) as [number, number][]);
  const r = readInkFor(
    ink.map((s) => s.map(([x, y]) => [x, y] as [number, number])),
    want,
    MY_CARD.corner,
  );
  const items = [
    { label: '획이 2개 이상', ok: strokes.length >= 2, detail: `획 ${strokes.length}개` },
    { label: '글자 전체가 카드 안 (밖 2 mm 이하)', ok: r.length >= 3 && r.outside <= 2, detail: r.length >= 3 ? `카드 밖 ${Math.round(r.outside)} mm` : '쓴 선이 없어요' },
    { label: '획 사이에 필요 없는 줄 3 mm 이하', ok: r.length >= 3 && r.stray <= 3, detail: r.length >= 3 ? `필요 없는 줄 ${Math.round(r.stray)} mm` : '쓴 선이 없어요' },
  ];
  return { ok: items.every((i) => i.ok), items };
}
