/**
 * Screen-only drawing aids of the 3D view, switched on and off from the
 * view's 표시 menu: the base frame, the tool frame, each joint's axis, and
 * the reach of the arm. All in the URDF frame (Z up, metres), drawn over the
 * model (no depth test) like the frame triads of robot software, and on the
 * screen-only layer so the simulated cameras never see them.
 *
 * Also the framing maths of the view: how far back the camera has to be for
 * a box (the arm and its work area) to fill the view.
 */

import {
  Box3,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  RingGeometry,
  CircleGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';

export const AXIS_COLORS = { x: '#e5484d', y: '#30a46c', z: '#3e63dd' } as const;
const JOINT_COLOR = '#f08c00';

/** What the 3D view draws besides the scene (the 표시 menu). */
export interface DisplayOpts {
  /** Robot base frame: X, Y, Z arrows at the base. */
  baseAxes: boolean;
  /** Tool frame at the tool tip. */
  toolAxes: boolean;
  /** Each joint's rotation axis, J1..J6. */
  jointAxes: boolean;
  /** The tool tip's recent path. */
  path: boolean;
  /** Floor grid (1 cm cells, 10 cm sections). */
  grid: boolean;
  /** Reach of the arm on the table (280 mm). */
  reach: boolean;
  /** Fold the control panel and the editor while a program runs, so the 3D view is whole. */
  autoFold: boolean;
  /** The see-through side-view arm with each joint's angle, bottom left. */
  mini: boolean;
  /** Before a run (블록 코딩): where the program will leave the arm, as a see-through arm. */
  ghost: boolean;
}

export const DEFAULT_DISPLAY: DisplayOpts = { baseAxes: true, toolAxes: false, jointAxes: false, path: true, grid: true, reach: false, autoFold: true, ghost: true, mini: true };

/** Horizontal reach of the myCobot 280 from the J1 axis, mm. */
export const REACH_MM = 280;

/**
 * Scene colours of the 3D views (simulator and lessons): a dark slate studio, so the white arm is
 * the brightest thing on screen. The desk is lit like a spot under the robot (`spot` in the middle
 * fading to `desk` towards the edges, which is the sky colour, so the far floor melts into the
 * background with no horizon line).
 */
export const SCENE = { sky: '#24272b', desk: '#24272b', spot: '#4a4f56', cell: '#50555c', section: '#6c7177' };

/** The bright studio for a black arm (ArmSpec.finish 'black'): a light grey the black frames stand out against. */
export const SCENE_LIGHT: typeof SCENE = { sky: '#dfe3e8', desk: '#dfe3e8', spot: '#f5f7f9', cell: '#c8ced6', section: '#a6afba' };

/** The studio an arm is shown in. */
export const sceneFor = (finish?: 'black'): typeof SCENE => (finish === 'black' ? SCENE_LIGHT : SCENE);

/** Size of the desk plane, m; the spot under the robot fades out within the middle third. */
export const DESK_M = 6;

/** The desk's colours (SCENE's by default; the 교육 lessons can use a lighter set). */
export type DeskColors = Pick<typeof SCENE, 'desk' | 'spot'>;

/** The desk's picture: the spot under the robot (dispose it with the desk). */
export function deskSpot(colors: DeskColors = SCENE): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256 / 3);
  g.addColorStop(0, colors.spot);
  g.addColorStop(0.45, colors.spot);
  g.addColorStop(1, colors.desk);
  ctx.fillStyle = colors.desk;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function onTop(o: Object3D, layer: number, order = 20): void {
  o.traverse((c) => {
    c.layers.set(layer);
    c.renderOrder = order;
  });
}

const basic = (color: string, opacity = 1) =>
  new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity, toneMapped: false });

/** A text label that always faces the camera; `size` = letter height, metres. */
export function textSprite(text: string, color: string, size = 0.016): Sprite {
  const px = 96;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  // The page's own font (Pretendard, loaded by next/font under a generated family name).
  const family = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'system-ui, sans-serif';
  const font = `700 ${px * 0.62}px ${family}`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + px * 0.5);
  c.width = w;
  c.height = px;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // White halo so the label reads over the arm and the floor alike.
  g.lineWidth = px * 0.14;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineJoin = 'round';
  g.strokeText(text, w / 2, px / 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, px / 2);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false }));
  s.scale.set((size * w) / px / 0.62, size / 0.62, 1);
  return s;
}

/** One arrow from the origin along +Y of its own frame (turned onto `dir` by the caller). */
function arrow(length: number, radius: number, color: string, from = 0): Group {
  const g = new Group();
  const m = basic(color);
  const headLen = Math.min(length * 0.28, radius * 7);
  const shaft = new Mesh(new CylinderGeometry(radius, radius, length - from - headLen, 12), m);
  shaft.position.y = from + (length - from - headLen) / 2;
  const head = new Mesh(new ConeGeometry(radius * 2.6, headLen, 16), m);
  head.position.y = length - headLen / 2;
  g.add(shaft, head);
  return g;
}

const UP = new Vector3(0, 1, 0);

function arrowAlong(dir: Vector3, length: number, radius: number, color: string, from = 0): Group {
  const a = arrow(length, radius, color, from);
  a.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  return a;
}

/** X / Y / Z arrows (red, green, blue) with letters at their tips. */
export function axesTriad(length: number, radius: number, labels: [string, string, string] | null, layer: number): Group {
  const g = new Group();
  const dirs = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  const colors = [AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z];
  dirs.forEach((d, i) => {
    g.add(arrowAlong(d, length, radius, colors[i]));
    if (labels) {
      const s = textSprite(labels[i], colors[i], length * 0.2);
      s.position.copy(d).multiplyScalar(length * 1.18);
      g.add(s);
    }
  });
  // A small white ball marks the origin.
  const o = new Mesh(new CylinderGeometry(radius * 1.8, radius * 1.8, radius * 1.2, 16), basic('#ffffff'));
  o.rotation.x = Math.PI / 2;
  g.add(o);
  onTop(g, layer);
  return g;
}

/** Each joint's axis: an orange arrow through the joint with its name. Returns a function that removes them. */
export function addJointAxes(joints: readonly { group: Group; axis: Vector3 }[], layer: number): () => void {
  const added: Group[] = [];
  joints.forEach((j, i) => {
    const g = new Group();
    const dir = j.axis.clone().normalize();
    const a = arrowAlong(dir, 0.055, 0.0018, JOINT_COLOR, 0);
    a.position.copy(dir).multiplyScalar(-0.02);
    g.add(a);
    const s = textSprite(`J${i + 1}`, JOINT_COLOR, 0.014);
    s.position.copy(dir).multiplyScalar(0.05);
    g.add(s);
    onTop(g, layer, 21);
    j.group.add(g);
    added.push(g);
  });
  return () => added.forEach((g) => g.removeFromParent());
}

/** The arm's reach on the table: a faint disc with a rim and its radius written on it. */
export function reachDisc(z: number, layer: number, reachMm = REACH_MM): Group {
  const r = reachMm / 1000;
  const g = new Group();
  const fill = new Mesh(new CircleGeometry(r, 96), new MeshBasicMaterial({ color: '#3454d1', transparent: true, opacity: 0.05, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const rim = new Mesh(new RingGeometry(r - 0.0015, r + 0.0015, 128), new MeshBasicMaterial({ color: '#3454d1', transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide, toneMapped: false }));
  g.add(fill, rim);
  const s = textSprite(`작업 범위 ${reachMm}mm`, '#3454d1', 0.014);
  s.position.set(r * 0.72, -r * 0.72, 0.012);
  g.add(s);
  g.position.z = z + 0.0006;
  g.traverse((c) => {
    c.layers.set(layer);
    c.renderOrder = 3;
  });
  return g;
}

/** Render layer of the tool on the arm's flange: drawn by the 3D view and the kit camera, not by the hand camera beside it. */
export const TOOL_LAYER = 2;

/** Bounding box (world coordinates) of the visible meshes under `o` that are on the normal or the tool layer (not desk dressing marked `noFit`). */
export function meshBox(o: Object3D, into = new Box3()): Box3 {
  const tmp = new Box3();
  o.updateWorldMatrix(true, true);
  o.traverseVisible((c) => {
    const m = c as Mesh;
    if (!m.isMesh || !(m.layers.isEnabled(0) || m.layers.isEnabled(TOOL_LAYER)) || !m.geometry || m.userData.noFit) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    into.union(tmp);
  });
  return into;
}

/** The part of the view not covered by floating panels: its size and centre as fractions of the view. */
export interface FreeFrame {
  /** Width and height as a fraction of the view (0..1). */
  sx: number;
  sy: number;
  /** Centre in normalised device coordinates (-1..1, y up). */
  cx: number;
  cy: number;
}

/**
 * Where the camera must be, looking along -`dir`, for the whole box to be
 * inside the view with `margin` (fraction of the view) spare on every side.
 * With `free`, the box is fitted into that part of the view and centred on it
 * (the panels floating over the 3D view do not cover the robot).
 */
export function framing(box: Box3, dir: Vector3, camera: PerspectiveCamera, margin = 0.08, free?: FreeFrame): { position: Vector3; target: Vector3 } {
  const center = box.getCenter(new Vector3());
  const d = dir.clone().normalize();
  const fullV = Math.tan(((camera.fov * Math.PI) / 180) / 2);
  const fullH = fullV * camera.aspect;
  const tanV = fullV * (1 - 2 * margin) * (free?.sy ?? 1);
  const tanH = fullH * (1 - 2 * margin) * (free?.sx ?? 1);
  const forward = d.clone().negate();
  let right = new Vector3().crossVectors(forward, UP);
  const bases: [Vector3, Vector3][] = [];
  if (right.lengthSq() < 1e-6) {
    // Looking straight down: the screen's up could be either way; allow for both.
    bases.push([new Vector3(1, 0, 0), new Vector3(0, 0, -1)], [new Vector3(0, 0, -1), new Vector3(1, 0, 0)]);
  } else {
    right = right.normalize();
    bases.push([right, new Vector3().crossVectors(right, forward).normalize()]);
  }
  let dist = 0;
  const v = new Vector3();
  for (const [r, u] of bases) {
    for (let k = 0; k < 8; k += 1) {
      v.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(center);
      const toward = v.dot(d);
      dist = Math.max(dist, toward + Math.abs(v.dot(r)) / tanH, toward + Math.abs(v.dot(u)) / tanV);
    }
  }
  if (!free || (free.cx === 0 && free.cy === 0)) return { position: center.clone().addScaledVector(d, dist), target: center };
  // Move the camera sideways so the box centre lands at the free area's centre instead of the view's.
  const [r, u] = bases[0];
  const target = center.clone().addScaledVector(r, -free.cx * dist * fullH).addScaledVector(u, -free.cy * dist * fullV);
  return { position: target.clone().addScaledVector(d, dist), target };
}
