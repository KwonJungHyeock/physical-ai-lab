/**
 * 작업대 꾸미기 (arm-only theme): what stands on the desk around the robot.
 *
 *  - A scene: a backdrop of fixed furniture (a conveyor, a pallet, a table top …) that the arm must
 *    not run into, plus a few loose objects to start from. "빈 화면" is nothing at all; "AI 키트" is
 *    the kit theme.
 *  - Objects: things a student adds from the library and edits (colour, size, weight, place).
 *  - The practice mat and its four blocks: only when the practice uses them (or turned on).
 *  - Physics: off = exact motion (the arm stops when it touches an object, like the real robot's
 *    collision check would want); on = objects are rigid bodies (Rapier) that the arm pushes,
 *    that fall, slide and topple, and that the pump or a gripper can pick up.
 *
 * Robot base frame, mm, z up, front = +x; desk top = z 0.
 */

export type SceneId = 'empty' | 'lab' | 'factory' | 'logistics' | 'home' | 'kit';

export const SCENES: readonly { id: SceneId; name: string; note: string }[] = [
  { id: 'empty', name: '빈 화면', note: '내가 직접 꾸미기' },
  { id: 'lab', name: '피지컬 AI 실험실', note: '블록 · 컵 · 분류 트레이' },
  { id: 'factory', name: '제조 라인', note: '컨베이어 · 검사 게이트 · OK/NG 함' },
  { id: 'logistics', name: '물류 · 팔레타이징', note: '팔레트 · 상자 · 롤러 컨베이어' },
  { id: 'home', name: '서비스 · 생활', note: '접시 · 과일 · 컵 · 병' },
  { id: 'kit', name: 'AI 키트 (공식)', note: '카메라 · 분류함 · 블록 4개' },
];

export type ObjectKind = 'block' | 'cylinder' | 'box' | 'cup' | 'ball' | 'part' | 'bin' | 'tray' | 'obstacle' | 'puck';
export type ObjectShape = 'box' | 'cylinder' | 'cup' | 'ball' | 'bin';

export interface ObjectKindInfo {
  name: string;
  shape: ObjectShape;
  /** Default size: x, y, z (a cylinder: diameter, diameter, height; a ball: diameter ×3), mm. */
  size: [number, number, number];
  color: string;
  massG: number;
}

export const OBJECT_KINDS: Record<ObjectKind, ObjectKindInfo> = {
  block: { name: '블록', shape: 'box', size: [30, 30, 30], color: '#e5484d', massG: 15 },
  cylinder: { name: '원기둥', shape: 'cylinder', size: [40, 40, 60], color: '#7a5cf5', massG: 40 },
  box: { name: '택배 상자', shape: 'box', size: [80, 60, 50], color: '#c89b62', massG: 60 },
  cup: { name: '컵', shape: 'cup', size: [60, 60, 80], color: '#5b8cff', massG: 30 },
  ball: { name: '공 · 과일', shape: 'ball', size: [40, 40, 40], color: '#f5b400', massG: 25 },
  part: { name: '부품', shape: 'cylinder', size: [48, 48, 18], color: '#c7ccd3', massG: 40 },
  bin: { name: '분류함', shape: 'bin', size: [120, 100, 60], color: '#1fae66', massG: 150 },
  tray: { name: '트레이', shape: 'box', size: [160, 100, 10], color: '#dfe4ea', massG: 80 },
  obstacle: { name: '장애물', shape: 'box', size: [40, 120, 160], color: '#f5c400', massG: 400 },
  // 실습 셀's workpiece (Ø125 × 100 mm at shop size): not in the library (OBJECT_ORDER).
  puck: { name: '부품', shape: 'cylinder', size: [25, 25, 20], color: '#c7ccd3', massG: 20 },
};

export const OBJECT_ORDER: readonly ObjectKind[] = ['block', 'cylinder', 'box', 'cup', 'ball', 'part', 'bin', 'tray', 'obstacle'];

export const SWATCHES = ['#e5484d', '#f5b400', '#1fae66', '#2f6fed', '#7a5cf5', '#c89b62', '#c7ccd3', '#ffffff', '#23272d'];

export interface DeskObject {
  id: string;
  kind: ObjectKind;
  color: string;
  size: [number, number, number];
  massG: number;
  /** Centre of the footprint and the bottom face, mm; turn about z, degrees. */
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  /** Physics only: the object's full orientation (quaternion x, y, z, w) once it has tipped. */
  q?: [number, number, number, number];
  /** 실습 셀: broken by a hard knock (it counts as a reject). */
  damaged?: boolean;
  /** 실습 셀: a workpiece's outline seen from above, when not round — a prism of this many sides (6: 육각). */
  sides?: number;
}

/** A fixed part of a scene the arm must keep off, mm. */
export interface FixedBox {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  /** How far the arm keeps off it, mm (default 12; a 실습 셀's work tables and belt: less, the tool works there). */
  pad?: number;
}

export interface Desk {
  scene: SceneId;
  objects: DeskObject[];
  /** The practice mat and its four blocks even when the practice does not use them. */
  mat: boolean;
}

export const EMPTY_DESK: Desk = { scene: 'empty', objects: [], mat: false };

let seq = 0;
export const newObjectId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeObject(kind: ObjectKind, at: { x: number; y: number; z?: number }, over: Partial<DeskObject> = {}): DeskObject {
  const k = OBJECT_KINDS[kind];
  return { id: newObjectId(), kind, color: k.color, size: [...k.size], massG: k.massG, x: at.x, y: at.y, z: at.z ?? 0, yawDeg: 0, ...over };
}

/** Footprint radius (the object turned any way), mm. */
const reachOf = (o: DeskObject) => Math.hypot(o.size[0], o.size[1]) / 2;

/** Half-widths of an object's footprint along x and y with its turn, mm (round things: the radius). */
export function footprint(o: DeskObject): { hx: number; hy: number } {
  const shape = OBJECT_KINDS[o.kind].shape;
  if (shape !== 'box' && shape !== 'bin') return { hx: o.size[0] / 2, hy: o.size[0] / 2 };
  const a = (o.yawDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { hx: (c * o.size[0] + s * o.size[1]) / 2, hy: (s * o.size[0] + c * o.size[1]) / 2 };
}

/** The box an object fills, ignoring its turn (wide enough for any yaw), mm. */
export function objectBox(o: DeskObject): FixedBox {
  const r = OBJECT_KINDS[o.kind].shape === 'box' || OBJECT_KINDS[o.kind].shape === 'bin' ? reachOf(o) : o.size[0] / 2;
  return { name: OBJECT_KINDS[o.kind].name, min: [o.x - r, o.y - r, o.z], max: [o.x + r, o.y + r, o.z + o.size[2]] };
}

/* --- scenes -------------------------------------------------------------- */

/** Fixed furniture of each scene (drawn by ScenePreset.tsx), as boxes the arm keeps off. */
export const SCENE_FIXED: Record<SceneId, readonly FixedBox[]> = {
  empty: [],
  kit: [],
  lab: [],
  factory: [
    { name: '컨베이어', min: [175, -410, 0], max: [305, 410, 70] },
    { name: '검사 게이트', min: [155, 290, 0], max: [325, 310, 160] },
    { name: '라이트 커튼 기둥', min: [430, -390, 0], max: [450, -370, 324] },
    { name: '라이트 커튼 기둥', min: [430, 370, 0], max: [450, 390, 324] },
  ],
  logistics: [
    { name: '팔레트', min: [60, -310, 0], max: [300, -110, 30] },
    { name: '롤러 컨베이어', min: [148, 40, 0], max: [312, 420, 81] },
    { name: '라벨 프린터', min: [-120, -305, 0], max: [0, -215, 92] },
  ],
  home: [
    { name: '접시', min: [105, -135, 0], max: [295, 55, 8] },
    { name: '그릇', min: [230, -240, 0], max: [370, -100, 55] },
    { name: '쟁반', min: [-50, -290, 0], max: [170, -150, 10] },
  ],
};

/** The loose objects a scene starts with (they can be moved, edited, removed). */
export function sceneObjects(scene: SceneId): DeskObject[] {
  const o = makeObject;
  switch (scene) {
    case 'lab':
      return [
        o('block', { x: 190, y: -70 }, { color: '#e5484d' }),
        o('block', { x: 215, y: -10 }, { color: '#f5b400', yawDeg: 23 }),
        o('block', { x: 190, y: 50 }, { color: '#2f6fed', yawDeg: 46 }),
        o('block', { x: 245, y: 60 }, { color: '#1fae66', yawDeg: 69 }),
        o('cup', { x: 150, y: 120 }, { color: '#ffffff', size: [72, 72, 80] }),
        o('cylinder', { x: 255, y: -120 }, { size: [44, 44, 95] }),
        o('tray', { x: 60, y: -200 }, { size: [200, 80, 12] }),
      ];
    case 'factory':
      return [
        o('part', { x: 240, y: -150, z: 70 }),
        o('part', { x: 240, y: -30, z: 70 }, { color: '#e5484d' }),
        o('part', { x: 240, y: 110, z: 70 }),
        o('bin', { x: 90, y: -250 }, { color: '#1fae66', size: [130, 110, 80] }),
        o('bin', { x: 90, y: 250 }, { color: '#e5484d', size: [130, 110, 80] }),
      ];
    case 'logistics':
      return [
        o('box', { x: 125, y: -255, z: 30 }, { size: [100, 80, 60] }),
        o('box', { x: 235, y: -255, z: 30 }, { size: [100, 80, 60] }),
        o('box', { x: 125, y: -165, z: 30 }, { size: [100, 80, 60] }),
        o('box', { x: 230, y: 150, z: 81 }, { size: [110, 90, 70] }),
      ];
    case 'home':
      return [
        o('ball', { x: 210, y: -60, z: 8 }, { color: '#e5484d', size: [44, 44, 44] }),
        o('ball', { x: 185, y: -15, z: 8 }, { color: '#f5b400' }),
        o('ball', { x: 230, y: -20, z: 8 }, { color: '#7cc242', size: [36, 36, 36] }),
        o('cup', { x: 110, y: 110 }, { size: [76, 76, 90] }),
        o('cylinder', { x: 270, y: 120 }, { color: '#2fbf8f', size: [52, 52, 150], massG: 300 }),
      ];
    default:
      return [];
  }
}

/** Fixed furniture and objects together, as the boxes the arm checks against. */
export function deskBoxes(scene: SceneId, objects: readonly DeskObject[]): FixedBox[] {
  return [...SCENE_FIXED[scene], ...objects.map(objectBox)];
}

/** Height of whatever is under (x, y) for an object of footprint radius r: the desk, furniture or another object, mm. */
export function restingZ(scene: SceneId, objects: readonly DeskObject[], self: DeskObject): number {
  const r = OBJECT_KINDS[self.kind].shape === 'box' ? Math.min(self.size[0], self.size[1]) / 2 : self.size[0] / 2;
  let z = 0;
  for (const b of [...SCENE_FIXED[scene], ...objects.filter((o) => o.id !== self.id).map(objectBox)]) {
    if (self.x + r > b.min[0] && self.x - r < b.max[0] && self.y + r > b.min[1] && self.y - r < b.max[1]) z = Math.max(z, b.max[2]);
  }
  return z;
}

/** A free place on the desk in front of the robot for a new object, mm. */
export function freeSpot(scene: SceneId, objects: readonly DeskObject[], kind: ObjectKind): { x: number; y: number } {
  const k = OBJECT_KINDS[kind];
  const r = Math.hypot(k.size[0], k.size[1]) / 2 + 8;
  const boxes = deskBoxes(scene, objects);
  for (const d of [170, 220, 130, 260, 110, 300]) {
    for (const a of [0, 20, -20, 40, -40, 60, -60, 80, -80, 100, -100, 120, -120]) {
      const x = d * Math.cos((a * Math.PI) / 180);
      const y = d * Math.sin((a * Math.PI) / 180);
      if (!boxes.some((b) => x + r > b.min[0] && x - r < b.max[0] && y + r > b.min[1] && y - r < b.max[1])) return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return { x: 200, y: 0 };
}

/* --- practices that use the mat ------------------------------------------ */

/** Practices that work on the mat and its blocks (arm-only theme): the others start on an empty desk. */
const MAT_PRACTICES = new Set(['place', 'tools', 'pen', 'press', 'free']);
export const practiceUsesMat = (id: string) => MAT_PRACTICES.has(id);

/* --- the desk in use ----------------------------------------------------- */

let active: Desk = EMPTY_DESK;
// On unless the console says otherwise (the headless checks run the mat practices).
let matNeeded = true;

export const activeDesk = (): Desk => active;
export function setActiveDesk(d: Desk): void {
  active = d;
}
/** The open practice uses the mat. */
export function setMatNeeded(on: boolean): void {
  matNeeded = on;
}
/** The practice mat and its blocks are on the desk now (arm-only theme). */
export const matShown = (): boolean => matNeeded || active.mat;
