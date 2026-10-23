/**
 * 공정 짜기 (practice-led): a process made from a practice (실습), a few taught places and the
 * movement rules, instead of row by row. The student teaches only the places (A 집을 곳, B 놓을 곳,
 * 가운데, P1…) and changes a few values (몇 개, 간격, 크기); the MOVE J / MOVE L / 그리퍼 rows are
 * generated here and run by sim.ts `runProcess` like any process.
 *
 * Movement rules (움직임 규칙), the same for every practice:
 *   - positions are the tool tip in the robot base frame (base centre = 0, 0, 0; X forward, Y left,
 *     Z up; mm), the tool pointing down;
 *   - carrying travels at `travelZ` above the desk; down and up are straight (MOVE L, slow);
 *   - going somewhere else is a joint move (MOVE J, fast);
 *   - a place the tool cannot reach pointing down, under the desk or by the robot's body is refused.
 *
 * Checked by tests/simulator/plan-check (every practice runs from its defaults and does its job).
 */

import type { ChainSegment } from '../robot/kinematics';
import { solveToolPose, type ToolOrientation } from '../robot/tool';
import { ARM_STORED, COLORS, type ColorName } from './board';
import { SPEEDS, type Problem } from './program';
import type { Process, ProcRow } from './process';

export type PlanKind = 'move1' | 'stack' | 'grid' | 'swap' | 'points' | 'shape' | 'loop' | 'fill';
export type PlanLevel = 'basic' | 'apply' | 'challenge';
export type ShapeKind = 'square' | 'circle' | 'triangle' | 'star';
/** 따라하기 (run the ready process) · 바꿔 보기 (teach places, change the yellow values) · 직접 짜기 (edit the rows). */
export type PlanMode = 'follow' | 'change' | 'free';

export const LEVEL_NAME: Record<PlanLevel, string> = { basic: '기초', apply: '응용', challenge: '도전' };
export const MODE_NAME: Record<PlanMode, string> = { follow: '따라하기', change: '바꿔 보기', free: '직접 짜기' };
export const SHAPE_NAME: Record<ShapeKind, string> = { square: '네모', circle: '원', triangle: '삼각형', star: '별' };

/** A taught place: where the tool tip goes, mm. */
export interface Spot {
  x: number;
  y: number;
  z: number;
}

export interface Rules {
  /** 옮길 때 높이: carrying travels this high above the desk, mm. */
  travelZ: number;
  /** 멀리 갈 때 (MOVE J). */
  fast: number;
  /** 내려가고 올라올 때 · 그릴 때 (MOVE L). */
  slow: number;
}
export const DEFAULT_RULES: Rules = { travelZ: 80, fast: 50, slow: 20 };
export const TRAVEL_CHOICES = [60, 80, 100, 120];
export { SPEEDS };
/** Tool tip closer than this to the base axis is by the robot's own body, mm. */
export const BODY_MM = 90;
/** The pen is lifted this far off the paper between strokes, mm. */
export const PEN_UP_MM = 20;

export interface Plan {
  kind: PlanKind;
  /** The taught places, in the order of `teachOf(plan)`; null = not taught yet. */
  spots: (Spot | null)[];
  /** 몇 개 (blocks) · 점 몇 개 (points) · 몇 바퀴 (loop). */
  count: number;
  /** 집는 간격: the blocks to pick stand in a row along +Y this far apart, mm. */
  pitch: number;
  /** 쌓기 간격 (stack) · 칸 간격 (grid) · 줄 간격 (fill), mm. */
  gap: number;
  shape: ShapeKind;
  /** 한 변 / 지름 (shape) · 넓이 한 변 (fill), mm. */
  size: number;
  /** 돌리기, degrees. */
  turn: number;
}

export interface TeachDef {
  label: string;
  /** Shown on the 3D marker and the list. */
  tag: string;
  /** Only the height matters (펜 끝 높이). */
  zOnly?: boolean;
}

export type FieldKey = 'count' | 'pitch' | 'gap' | 'size' | 'turn';
export interface FieldDef {
  key: FieldKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface PlanPractice {
  kind: PlanKind;
  name: string;
  level: PlanLevel;
  group: 'carry' | 'path';
  tool: 'grip' | 'pen';
  /** One line on the card. */
  meta: string;
  minutes: number;
  /** What the practice teaches (the card's summary). */
  learn: string[];
  fields: FieldDef[];
  /** The ready process (따라하기): places that work on the practice desk. */
  start: Plan;
}

const BLOCK_Z = 15; // the tool tip when gripping a 25 mm mat block (its centre is 12.5; a little above, so it is set down, not pressed in)
const PEN_Z = 0; // the paper in the simulator

const plan = (kind: PlanKind, spots: Spot[], over: Partial<Plan> = {}): Plan => ({
  kind,
  spots,
  count: 1,
  pitch: 50,
  gap: 25,
  shape: 'square',
  size: 80,
  turn: 0,
  ...over,
});
const s = (x: number, y: number, z: number): Spot => ({ x, y, z });

const F = {
  count: (label: string, unit: string, min: number, max: number): FieldDef => ({ key: 'count', label, unit, min, max, step: 1 }),
  pitch: { key: 'pitch', label: '집는 간격', unit: 'mm', min: 35, max: 70, step: 5 } as FieldDef,
  gap: (label: string, min: number, max: number, step = 5): FieldDef => ({ key: 'gap', label, unit: 'mm', min, max, step }),
  size: (label: string, min: number, max: number): FieldDef => ({ key: 'size', label, unit: 'mm', min, max, step: 10 }),
  turn: { key: 'turn', label: '돌리기', unit: '°', min: -90, max: 90, step: 15 } as FieldDef,
};

export const PLAN_PRACTICES: readonly PlanPractice[] = [
  {
    kind: 'move1',
    name: '블록 하나 옮기기',
    level: 'basic',
    group: 'carry',
    tool: 'grip',
    meta: '위치 2곳',
    minutes: 10,
    learn: ['집을 곳 · 놓을 곳 두 곳만 가르치면 동작 8줄이 저절로 만들어져요.', '옮길 때는 높이 떠서, 내려갈 때는 곧게 천천히 가요.', '배우는 것: 접근 높이, MOVE J 와 MOVE L 의 차이.'],
    fields: [],
    start: plan('move1', [s(185, -25, BLOCK_Z), s(190, -100, BLOCK_Z)]),
  },
  {
    kind: 'stack',
    name: '블록 3개 쌓기',
    level: 'apply',
    group: 'carry',
    tool: 'grip',
    meta: '위치 2곳 + 쌓기 간격',
    minutes: 15,
    learn: ['집을 곳 · 놓을 곳 두 곳만 가르치면 블록마다 동작이 저절로 만들어져요.', '블록은 집을 곳에서 +Y 쪽으로 집는 간격만큼 떨어져 줄지어 있어요.', '쌓을 때마다 놓는 높이가 쌓기 간격(블록 높이 25 mm)만큼 올라가요.'],
    fields: [F.count('몇 개', '개', 2, 4), F.gap('쌓기 간격', 20, 35), F.pitch],
    start: plan('stack', [s(140, -60, BLOCK_Z), s(205, -85, BLOCK_Z)], { count: 3, gap: 25 }),
  },
  {
    kind: 'grid',
    name: '줄 맞춰 놓기 (2×2)',
    level: 'apply',
    group: 'carry',
    tool: 'grip',
    meta: '위치 2곳 + 칸 간격',
    minutes: 15,
    learn: ['B 는 첫 칸이에요. 나머지 칸은 칸 간격으로 계산해요 (팔레타이징).', '칸이 좁으면 그리퍼 손가락이 옆 블록에 닿아요. 간격을 바꿔 보세요.', '배우는 것: 기준점 하나와 간격으로 여러 위치 만들기.'],
    fields: [F.count('몇 개', '개', 2, 4), F.gap('칸 간격', 35, 60), F.pitch],
    start: plan('grid', [s(130, -75, BLOCK_Z), s(195, -95, BLOCK_Z)], { count: 4, gap: 45 }),
  },
  {
    kind: 'swap',
    name: '두 블록 자리 바꾸기',
    level: 'challenge',
    group: 'carry',
    tool: 'grip',
    meta: '위치 3곳 · 빈 자리 거치기',
    minutes: 20,
    learn: ['A 와 B 의 블록을 서로 바꿔요. 손이 하나라서 빈 자리 C 를 거쳐야 해요.', '순서: A → C, B → A, C → B.', '배우는 것: 작업 순서 세우기, 임시 위치.'],
    fields: [],
    start: plan('swap', [s(150, -70, BLOCK_Z), s(150, 70, BLOCK_Z), s(215, 0, BLOCK_Z)]),
  },
  {
    kind: 'points',
    name: '점 잇기',
    level: 'basic',
    group: 'path',
    tool: 'pen',
    meta: '점 3~6개를 차례로',
    minutes: 10,
    learn: ['가르친 점을 차례로 곧게(MOVE L) 이어 그려요.', '첫 점 위에서 펜을 내리고, 마지막 점에서 올려요.', '배우는 것: 점 가르치기, 직선 이동.'],
    fields: [F.count('점 몇 개', '개', 3, 6)],
    start: plan('points', [s(0, 0, PEN_Z), s(160, -60, PEN_Z), s(230, -40, PEN_Z), s(230, 40, PEN_Z), s(160, 60, PEN_Z), s(130, 0, PEN_Z), s(190, 0, PEN_Z)], { count: 4 }),
  },
  {
    kind: 'shape',
    name: '도형 그리기',
    level: 'basic',
    group: 'path',
    tool: 'pen',
    meta: '네모 · 원 · 삼각형 · 별',
    minutes: 15,
    learn: ['가운데 한 곳과 크기만 정하면 꼭짓점이 저절로 계산돼요.', '원은 점 36개로 나눠 이어서(Smooth) 그려요.', '배우는 것: 좌표 계산, 직선 보간.'],
    fields: [F.size('크기', 40, 120), F.turn],
    start: plan('shape', [s(0, 0, PEN_Z), s(200, 0, PEN_Z)], { size: 80 }),
  },
  {
    kind: 'loop',
    name: '같은 길 반복하기',
    level: 'apply',
    group: 'path',
    tool: 'pen',
    meta: '같은 길을 여러 바퀴',
    minutes: 15,
    learn: ['점 3개로 만든 세모 길을 여러 바퀴 돌아요.', '실물 로봇에서는 선이 굵어지는 만큼이 반복 오차예요.', '배우는 것: 반복 정밀도, 사이클 시간.'],
    fields: [F.count('몇 바퀴', '바퀴', 2, 10)],
    start: plan('loop', [s(0, 0, PEN_Z), s(170, -50, PEN_Z), s(240, 0, PEN_Z), s(170, 50, PEN_Z)], { count: 3 }),
  },
  {
    kind: 'fill',
    name: '지그재그로 칠하기',
    level: 'challenge',
    group: 'path',
    tool: 'pen',
    meta: '넓이를 줄 간격으로 채우기',
    minutes: 20,
    learn: ['네모 칸을 지그재그로 오가며 채워요.', '줄 간격이 좁을수록 촘촘하지만 오래 걸려요.', '배우는 것: 반복 계산, 시간과 품질의 균형.'],
    fields: [F.size('넓이 한 변', 40, 100), F.gap('줄 간격', 5, 20)],
    start: plan('fill', [s(0, 0, PEN_Z), s(200, 0, PEN_Z)], { size: 60, gap: 10 }),
  },
];

export const practiceOf = (kind: PlanKind): PlanPractice => PLAN_PRACTICES.find((p) => p.kind === kind)!;
export const freshPlan = (kind: PlanKind): Plan => structuredClone(practiceOf(kind).start);

const PEN_TEACH: TeachDef = { label: '펜 끝 높이', tag: '펜', zOnly: true };

/** The places this plan asks for, in order (the index is the plan's `spots` index). */
export function teachOf(p: Plan): TeachDef[] {
  switch (p.kind) {
    case 'move1':
    case 'stack':
    case 'grid':
      return [
        { label: p.kind === 'move1' ? '집을 곳' : '집을 곳 (첫 블록)', tag: 'A' },
        { label: p.kind === 'grid' ? '놓을 곳 (첫 칸)' : '놓을 곳', tag: 'B' },
      ];
    case 'swap':
      return [
        { label: 'A 블록 자리', tag: 'A' },
        { label: 'B 블록 자리', tag: 'B' },
        { label: '빈 자리', tag: 'C' },
      ];
    case 'points':
      return [PEN_TEACH, ...Array.from({ length: p.count }, (_, k) => ({ label: `점 ${k + 1}`, tag: `P${k + 1}` }))];
    case 'loop':
      return [PEN_TEACH, ...[1, 2, 3].map((k) => ({ label: `점 ${k}`, tag: `P${k}` }))];
    case 'shape':
    case 'fill':
      return [PEN_TEACH, { label: '가운데', tag: '+' }];
  }
}

/** Keep `spots` as long as the teach list (a new point starts untaught, or from the practice's own). */
export function fitSpots(p: Plan): Plan {
  const n = teachOf(p).length;
  const start = practiceOf(p.kind).start.spots;
  const spots = Array.from({ length: n }, (_, k) => (k < p.spots.length ? p.spots[k] : (start[k] ?? null)));
  return { ...p, spots };
}

/* --- geometry -------------------------------------------------------------- */

/** One carry: from a pick to a place. */
interface Carry {
  from: Spot;
  to: Spot;
  /** Names for the rows ("A", "B 위 2층" …). */
  fromName: string;
  toName: string;
}

const add = (a: Spot, dx: number, dy: number, dz: number): Spot => ({ x: a.x + dx, y: a.y + dy, z: a.z + dz });

function carries(p: Plan): Carry[] | null {
  const [A, B, C] = p.spots;
  if (!A || !B) return null;
  switch (p.kind) {
    case 'move1':
      return [{ from: A, to: B, fromName: 'A', toName: 'B' }];
    case 'stack':
      return Array.from({ length: p.count }, (_, i) => ({ from: add(A, 0, i * p.pitch, 0), to: add(B, 0, 0, i * p.gap), fromName: `블록 ${i + 1}`, toName: `B ${i + 1}층` }));
    case 'grid':
      return Array.from({ length: Math.min(4, p.count) }, (_, i) => ({ from: add(A, 0, i * p.pitch, 0), to: add(B, Math.floor(i / 2) * p.gap, (i % 2) * p.gap, 0), fromName: `블록 ${i + 1}`, toName: `칸 ${i + 1}` }));
    case 'swap':
      if (!C) return null;
      return [
        { from: A, to: C, fromName: 'A', toName: 'C' },
        { from: B, to: A, fromName: 'B', toName: 'A' },
        { from: C, to: B, fromName: 'C', toName: 'B' },
      ];
    default:
      return null;
  }
}

/** Corners of the shape around `c` (closed: the first point again at the end), mm. */
export function shapePoints(kind: ShapeKind, c: Spot, size: number, turnDeg: number): Spot[] {
  const t = (turnDeg * Math.PI) / 180;
  const at = (r: number, a: number): Spot => ({ x: c.x + r * Math.cos(a + t), y: c.y + r * Math.sin(a + t), z: c.z });
  let pts: Spot[];
  switch (kind) {
    case 'square': {
      const h = size / 2;
      pts = [
        [h, h],
        [h, -h],
        [-h, -h],
        [-h, h],
      ].map(([dx, dy]) => ({ x: c.x + dx * Math.cos(t) - dy * Math.sin(t), y: c.y + dx * Math.sin(t) + dy * Math.cos(t), z: c.z }));
      break;
    }
    case 'triangle': {
      const r = size / Math.sqrt(3);
      pts = [0, 1, 2].map((k) => at(r, (k * 2 * Math.PI) / 3));
      break;
    }
    case 'star':
      // A five-pointed star drawn in one stroke: every second tip.
      pts = [0, 2, 4, 1, 3].map((k) => at(size / 2, (k * 2 * Math.PI) / 5));
      break;
    case 'circle':
      pts = Array.from({ length: 36 }, (_, k) => at(size / 2, (-k * 2 * Math.PI) / 36));
      break;
  }
  return [...pts, pts[0]];
}

/** The zigzag over a size × size square around `c`, `gap` apart. */
function fillPoints(c: Spot, size: number, gap: number): Spot[] {
  const h = size / 2;
  const n = Math.max(1, Math.floor(size / gap));
  const out: Spot[] = [];
  for (let k = 0; k <= n; k += 1) {
    const x = c.x - h + (size * k) / n;
    const [a, b] = k % 2 ? [h, -h] : [-h, h];
    out.push({ x, y: c.y + a, z: c.z }, { x, y: c.y + b, z: c.z });
  }
  return out;
}

/** The strokes of a pen plan (each a polyline drawn with the pen down), or null while places are missing. */
export function strokes(p: Plan): Spot[][] | null {
  const pen = p.spots[0];
  const pts = p.spots.slice(1);
  if (!pen || pts.some((q) => !q)) return null;
  const onPaper = (q: Spot): Spot => ({ x: q.x, y: q.y, z: pen.z });
  const list = (pts as Spot[]).map(onPaper);
  switch (p.kind) {
    case 'points':
      return [list];
    case 'loop':
      return [Array.from({ length: p.count }, () => list).flat().concat([list[0]])];
    case 'shape':
      return [shapePoints(p.shape, list[0], p.size, p.turn)];
    case 'fill':
      return [fillPoints(list[0], p.size, p.gap)];
    default:
      return null;
  }
}

/* --- rows ------------------------------------------------------------------ */

export interface Solved {
  joints: number[];
  orientation: ToolOrientation;
}
/** Joint angles for the tool tip at `p` pointing down (keeping `keep` when given), or null. */
export type Solver = (p: Spot, seed: readonly number[], keep?: ToolOrientation) => Solved | null;

export function makeSolver(chain: readonly ChainSegment[], tcpMm: number): Solver {
  return (p, seed, keep) => {
    const pt = { x: p.x, y: p.y, z: p.z };
    let r = keep ? solveToolPose(chain, pt, seed, { tcpMm, orientation: keep, toleranceMm: 0.2 }) : null;
    if (!r?.converged) r = solveToolPose(chain, pt, seed, { tcpMm, toleranceMm: 0.2 });
    return r.converged ? { joints: r.anglesDeg.map((v) => Math.round(v * 10) / 10), orientation: r.orientation } : null;
  };
}

/** One chip of the "만들어진 동작" strip: a row kind and its short name. */
export interface Chip {
  label: string;
  kind: 'J' | 'L' | 'grip';
}

export interface Built {
  rows: ProcRow[];
  /** The rows of one cycle (one block · one lap), for the strip; `times` how often it repeats. */
  cycle: Chip[];
  times: number;
  blend: Process['blend'];
  problems: Problem[];
  /** Things the rules changed on their own (not problems). */
  notes: string[];
  /** What the 3D view shows: the taught places and the planned path (the tool tip), mm. */
  marks: { tag: string; label: string; at: Spot }[];
  path: Spot[];
}

const fmt = (p: Spot) => `X ${Math.round(p.x)} · Y ${Math.round(p.y)} · Z ${Math.round(p.z)}`;

/** Places that cannot be used before anything is solved: under the desk, by the robot's body. */
function placeProblem(p: Spot, name: string): Problem | null {
  if (p.z < -0.5) return { line: 0, msg: `${name} (${fmt(p)}): 책상 아래예요.`, fix: '조그로 더 위에서 저장해 주세요.' };
  if (Math.hypot(p.x, p.y) < BODY_MM) return { line: 0, msg: `${name} (${fmt(p)}): 로봇 몸통에 너무 가까워요.`, fix: `로봇 가운데에서 ${BODY_MM} mm 보다 멀리 잡아 주세요.` };
  return null;
}

/**
 * The process rows of a plan from the start pose. Every place goes through the solver; a place it
 * cannot reach is a problem (the rows are then not complete, and the panel shows why).
 */
export function buildPlan(p: Plan, rules: Rules, solve: Solver, start: readonly number[]): Built {
  const prac = practiceOf(p.kind);
  const teach = teachOf(p);
  const problems: Problem[] = [];
  const notes: string[] = [];
  const marks = teach.flatMap((t, k) => (p.spots[k] && !t.zOnly ? [{ tag: t.tag, label: t.label, at: p.spots[k]! }] : []));
  const rows: ProcRow[] = [];
  const path: Spot[] = [];
  let seed = start.slice();
  const missing = teach.filter((_, k) => !p.spots[k]);
  if (missing.length) {
    problems.push({ line: 0, msg: `${missing.map((t) => t.label).join(', ')}: 아직 저장하지 않았어요.`, fix: '조그로 데려간 뒤 [지금 위치로 저장]을 눌러 주세요.' });
    return { rows, cycle: [], times: 0, blend: 'tick', problems, notes, marks, path };
  }

  const move = (mode: 'J' | 'L', at: Spot, note: string, keep?: ToolOrientation): Solved | null => {
    const bad = placeProblem(at, note);
    if (bad) {
      problems.push(bad);
      return null;
    }
    const r = solve(at, seed, keep);
    if (!r) {
      problems.push({ line: 0, msg: `${note} (${fmt(at)}): 도구를 아래로 향한 채 닿을 수 없어요.`, fix: '로봇에 더 가까운 곳이나 더 높은 곳으로 바꿔 주세요.' });
      return null;
    }
    seed = r.joints;
    rows.push({ kind: 'move', mode, joints: r.joints, note, speed: mode === 'J' ? rules.fast : rules.slow });
    path.push(at);
    return r;
  };
  const home = (note: string) => {
    rows.push({ kind: 'move', mode: 'J', joints: start.slice(), note, speed: rules.fast });
    seed = start.slice();
  };

  home('시작 위치로');
  let cycle: Chip[] = [];
  let times = 1;
  let blend: Process['blend'] = 'tick';

  if (prac.group === 'carry') {
    const list = carries(p) ?? [];
    const top = Math.max(...list.flatMap((c) => [c.from.z, c.to.z]));
    // The carried block hangs under the tip as far as it was gripped above its bottom: travelling
    // 15 mm above the highest place keeps it clear of the stack it goes onto.
    const travel = Math.max(rules.travelZ, top + 15);
    if (travel > rules.travelZ) notes.push(`쌓은 블록 위로 지나가야 해서, 옮길 때 높이를 ${rules.travelZ} mm 대신 ${travel} mm 로 했어요.`);
    rows.push({ kind: 'grip', open: true, note: '그리퍼 열기' });
    for (const c of list) {
      const upFrom = { ...c.from, z: travel };
      const upTo = { ...c.to, z: travel };
      const a = move('J', upFrom, `${c.fromName} 위로 가기`);
      move('L', c.from, `${c.fromName} 로 내려가기`, a?.orientation);
      rows.push({ kind: 'grip', open: false, note: '잡기' });
      move('L', upFrom, '올라오기', a?.orientation);
      const b = move('J', upTo, `${c.toName} 위로 옮기기`);
      move('L', c.to, `${c.toName} 에 내려놓기`, b?.orientation);
      rows.push({ kind: 'grip', open: true, note: '놓기' });
      move('L', upTo, '올라오기', b?.orientation);
    }
    cycle = [
      { label: '가기', kind: 'J' },
      { label: '내려가기', kind: 'L' },
      { label: '잡기', kind: 'grip' },
      { label: '올라오기', kind: 'L' },
      { label: '옮기기', kind: 'J' },
      { label: '내려놓기', kind: 'L' },
      { label: '놓기', kind: 'grip' },
      { label: '올라오기', kind: 'L' },
    ];
    times = list.length;
  } else {
    const lines = strokes(p) ?? [];
    for (const line of lines) {
      const first = line[0];
      const up = (q: Spot) => ({ ...q, z: q.z + PEN_UP_MM });
      const a = move('J', up(first), '첫 점 위로 가기');
      move('L', first, '펜 내리기', a?.orientation);
      line.slice(1).forEach((q, k) => move('L', q, `${k + 1} → ${k + 2}`, a?.orientation));
      move('L', up(line[line.length - 1]), '펜 올리기', a?.orientation);
    }
    const n = lines[0]?.length ?? 0;
    cycle =
      p.kind === 'loop'
        ? [
            { label: 'P1 → P2', kind: 'L' },
            { label: 'P2 → P3', kind: 'L' },
            { label: 'P3 → P1', kind: 'L' },
          ]
        : [
            { label: '위로 가기', kind: 'J' },
            { label: '펜 내리기', kind: 'L' },
            { label: p.kind === 'shape' && p.shape === 'circle' ? '원 36칸' : `선 ${Math.max(0, n - 1)}개`, kind: 'L' },
            { label: '펜 올리기', kind: 'L' },
          ];
    times = p.kind === 'loop' ? p.count : 1;
    blend = p.kind === 'shape' && p.shape === 'circle' ? 'smooth' : 'tick';
  }
  home('돌아오기');
  return { rows, cycle, times, blend, problems, notes, marks, path };
}

/* --- the practice desk ------------------------------------------------------ */

/**
 * Where the mat's four blocks stand for a carry practice (arm-only theme): one on each place a
 * block is picked from, the rest at the back corner of the desk. Pen practices put them away.
 */
export function blockLayout(p: Plan): Record<ColorName, { x: number; y: number }> {
  const out = Object.fromEntries(COLORS.map((c) => [c.name, { ...ARM_STORED[c.name] }])) as Record<ColorName, { x: number; y: number }>;
  const picks = p.kind === 'swap' ? [p.spots[0], p.spots[1]] : (carries(p) ?? []).map((c) => c.from);
  picks.forEach((q, k) => {
    if (q && k < COLORS.length) out[COLORS[k].name] = { x: q.x, y: q.y };
  });
  return out;
}

/** A rough "done" check after a simulated run of a carry practice: blocks where they should be. */
export function carryTargets(p: Plan): Spot[] {
  if (p.kind === 'swap') {
    const [A, B] = p.spots;
    return A && B ? [B, A] : [];
  }
  return (carries(p) ?? []).map((c) => c.to);
}
