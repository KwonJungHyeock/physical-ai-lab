// 입문 과정 (결정 회신 파트 9-2): where the 관찰 bubbles stand while a 확인 문제 holds the scene — at the scene's
// left, in the place that covers least of the arm and of the card and the line (the points the bubbles are about).
import { Vector3, type BufferAttribute, type Camera, type Mesh, type Object3D } from 'three';

/** A bubble's room (canvas px): the widest 관찰 line and one row of the stack. */
export const ASIDE_BUBBLE = { w: 280, row: 52, edge: 16 };

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The arm on the canvas (CSS px): its mesh points, a few hundred per part. */
export function armBox(root: Object3D, camera: Camera, w: number, h: number): Box | null {
  const v = new Vector3();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  root.updateWorldMatrix(true, true);
  const shown = (o: Object3D) => {
    for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  root.traverse((o) => {
    const m = o as Mesh;
    const pos = m.isMesh && shown(m) ? (m.geometry?.getAttribute('position') as BufferAttribute | undefined) : undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 200));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  });
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** The stack's top left (canvas px): left edge, under the bars on top — at the top, the middle or the bottom, whichever covers least. */
export function asideSlot(o: { w: number; h: number; top: number; arm: Box | null; points: readonly (readonly [number, number])[]; n: number }): [number, number] {
  const { edge, row } = ASIDE_BUBBLE;
  const bw = ASIDE_BUBBLE.w;
  const bh = Math.max(1, o.n) * row;
  const top = o.top + edge;
  const bottom = Math.max(top, o.h - edge - bh);
  const tries: [number, number][] = [
    [edge, top],
    [edge, bottom],
    [edge, Math.round((top + bottom) / 2)],
  ];
  const cost = ([x, y]: [number, number]) => {
    const a = o.arm;
    const over = a ? Math.max(0, Math.min(x + bw, a.x1) - Math.max(x, a.x0)) * Math.max(0, Math.min(y + bh, a.y1) - Math.max(y, a.y0)) : 0;
    // A point the bubbles are about (the pen, the card, the line) under the stack weighs more than any of the arm.
    const hits = o.points.filter(([px, py]) => px > x - edge && px < x + bw + edge && py > y - edge && py < y + bh + edge).length;
    return hits * 1e7 + over;
  };
  return tries.reduce((best, t) => (cost(t) < cost(best) ? t : best), tries[0]);
}
