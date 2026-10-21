/**
 * 공정 짜기 (BEGIN–END): a process as a pendant teaches it, without a PLC. Rows between BEGIN and
 * END run in order: MOVE J / MOVE L to a taught point (the arm's joint angles when [좌표 저장] was
 * pressed), the gripper, a wait. Smooth passes the points of consecutive MOVE rows without
 * stopping (blending); Tick stops at every point. A process is saved as a process file (.pal,
 * JSON) and run by sim.ts `runProcess`.
 */

import { jointMax, jointMin } from '../robot/limits';
import { DEFAULT_SPEED, SPEED_CAP, type Problem } from './program';
import type { Leg, ProcessItem } from './sim';

export type MoveMode = 'J' | 'L';
/** Smooth = blend through the points (이어서), Tick = stop at every point (점마다 멈춤). */
export type Blend = 'smooth' | 'tick';

export type ProcRow =
  /** `joints`: the taught point; null until [좌표 저장]. */
  | { kind: 'move'; mode: MoveMode; joints: number[] | null }
  | { kind: 'grip'; open: boolean }
  | { kind: 'wait'; sec: number };

export interface Process {
  name: string;
  blend: Blend;
  /** 1..SPEED_CAP, as the programs' speed. */
  speed: number;
  rows: ProcRow[];
}

export const PROCESS_FORMAT = 'physical-ai-lab/process';
export const PROCESS_EXT = '.pal';
export const WAIT_MAX_S = 30;

export function emptyProcess(name = '새 공정'): Process {
  return { name, blend: 'tick', speed: DEFAULT_SPEED, rows: [] };
}

/** "P1, P2, …": the point name of each MOVE row (other rows: null). */
export function pointNames(rows: readonly ProcRow[]): (string | null)[] {
  let n = 0;
  return rows.map((r) => (r.kind === 'move' ? `P${(n += 1)}` : null));
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Rows → what runProcess plays. Row k is line k + 1 (BEGIN is not a line). `only`: that row alone (한 줄씩). */
export function compileProcess(p: Process, only?: number): ProcessItem[] {
  const items: ProcessItem[] = [];
  let path: Leg[] | null = null;
  p.rows.forEach((r, i) => {
    if (only !== undefined && i !== only) return;
    const line = i + 1;
    if (r.kind === 'move') {
      if (!r.joints) return;
      const leg: Leg = { mode: r.mode, joints: r.joints.slice(), line };
      if (path) path.push(leg);
      else items.push({ type: 'path', legs: (path = [leg]), blend: p.blend === 'smooth' });
      return;
    }
    path = null;
    if (r.kind === 'grip') items.push({ type: 'grip', open: r.open, line });
    else items.push({ type: 'wait', sec: r.sec, line });
  });
  return items;
}

/** Before anything moves: untaught points, points outside the joint ranges, a gripper row without a gripper. */
export function checkProcess(p: Process, canGrip = true): Problem[] {
  const out: Problem[] = [];
  const names = pointNames(p.rows);
  if (!p.rows.some((r) => r.kind === 'move')) out.push({ line: 0, msg: 'MOVE 줄이 없어요.', fix: '[＋ MOVE J] 로 첫 점을 넣어 주세요.' });
  p.rows.forEach((r, i) => {
    const line = i + 1;
    if (r.kind === 'move') {
      if (!r.joints) {
        out.push({ line, msg: `${line}번 줄 ${names[i]}: 좌표가 아직 없어요.`, fix: '팔을 움직인 뒤 [좌표 저장]을 눌러 주세요.' });
        return;
      }
      r.joints.forEach((v, j) => {
        if (v < jointMin()[j] - 1e-6 || v > jointMax()[j] + 1e-6) {
          out.push({ line, msg: `${line}번 줄 ${names[i]}: J${j + 1} ${round1(v)}° 는 범위(${jointMin()[j]}° ~ ${jointMax()[j]}°) 밖이에요.`, fix: '좌표를 다시 저장해 주세요.' });
        }
      });
    }
    if (r.kind === 'grip' && !canGrip) out.push({ line, msg: `${line}번 줄: 지금 도구는 그리퍼가 아니에요.`, fix: '[수동 제어] → [도구 · 액세서리]에서 그리퍼로 바꾸거나 이 줄을 지워 주세요.' });
    if (r.kind === 'wait' && !(r.sec > 0 && r.sec <= WAIT_MAX_S)) out.push({ line, msg: `${line}번 줄: 대기는 0 ~ ${WAIT_MAX_S}초로 해 주세요.` });
  });
  return out;
}

/**
 * The process as text, one row per line (line k = row k): the robot code's comments quote it, and
 * a passed simulation is tied to it (any change to a point, a row, Smooth / Tick or the speed
 * closes the robot step again).
 */
export function processListing(p: Process): string {
  const names = pointNames(p.rows);
  const rows = p.rows.map((r, i) =>
    r.kind === 'move' ? `MOVE ${r.mode} ${names[i]} [${r.joints ? r.joints.map(round1).join(', ') : ''}]` : r.kind === 'grip' ? `그리퍼 ${r.open ? '열기' : '닫기'}` : `대기 ${r.sec}초`,
  );
  return [...rows, `# ${p.blend === 'smooth' ? 'Smooth' : 'Tick'} · 속도 ${p.speed}`].join('\n');
}

/** The project file's text. */
export function processToFile(p: Process): string {
  const rows = p.rows.map((r) => (r.kind === 'move' ? { ...r, joints: r.joints && r.joints.map(round1) } : r));
  return JSON.stringify({ format: PROCESS_FORMAT, version: 1, name: p.name, blend: p.blend, speed: p.speed, rows }, null, 2) + '\n';
}

/** A project file back to a process; anything malformed is refused with the reason (never half-loaded). */
export function processFromFile(text: string): { process: Process } | { error: string } {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return { error: '공정 파일(.pal)이 아니에요.' };
  }
  const o = d as Record<string, unknown>;
  if (!o || o.format !== PROCESS_FORMAT) return { error: '공정 파일(.pal)이 아니에요.' };
  if (o.version !== 1) return { error: '이 프로그램보다 새 버전에서 만든 파일이에요.' };
  if (!Array.isArray(o.rows)) return { error: '파일에 공정 줄이 없어요.' };
  const rows: ProcRow[] = [];
  for (const [i, raw] of (o.rows as unknown[]).entries()) {
    const r = raw as Record<string, unknown>;
    const bad = { error: `${i + 1}번 줄을 읽을 수 없어요.` };
    if (r?.kind === 'move') {
      if (r.mode !== 'J' && r.mode !== 'L') return bad;
      const j = r.joints;
      if (j !== null && !(Array.isArray(j) && j.length === jointMin().length && j.every((v) => typeof v === 'number' && Number.isFinite(v)))) return bad;
      rows.push({ kind: 'move', mode: r.mode, joints: j === null ? null : (j as number[]).slice() });
    } else if (r?.kind === 'grip' && typeof r.open === 'boolean') rows.push({ kind: 'grip', open: r.open });
    else if (r?.kind === 'wait' && typeof r.sec === 'number' && Number.isFinite(r.sec)) rows.push({ kind: 'wait', sec: r.sec });
    else return bad;
  }
  const speed = typeof o.speed === 'number' && o.speed >= 1 ? Math.min(SPEED_CAP, o.speed) : DEFAULT_SPEED;
  return {
    process: {
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : '불러온 공정',
      blend: o.blend === 'smooth' ? 'smooth' : 'tick',
      speed,
      rows,
    },
  };
}

/**
 * Ready-made processes (프리셋) for the 280 on the arm-only desk: a pick and place with J moves
 * above the spots and L descents (tool straight down at x 180, y ∓80, z 110 / 40 for the adaptive
 * gripper), and a square traced in L at z 30 (corners x 150 / 230, y ±50), where Smooth shows.
 * Checked by tests/simulator/process-check.
 */
export const PRESETS: readonly Process[] = [
  {
    name: '집어서 옮기기',
    blend: 'tick',
    speed: DEFAULT_SPEED,
    rows: [
      { kind: 'grip', open: true },
      { kind: 'move', mode: 'J', joints: [-4.8, -9.7, -68.3, -12, 0, -70.8] },
      { kind: 'move', mode: 'L', joints: [-4.9, -15.5, -103.8, 29.4, 0, -70.9] },
      { kind: 'grip', open: false },
      { kind: 'move', mode: 'L', joints: [-4.8, -9.7, -68.3, -12, 0, -70.8] },
      { kind: 'move', mode: 'J', joints: [43.1, -9.7, -68.3, -12, 0, -70.8] },
      { kind: 'move', mode: 'L', joints: [43.1, -15.5, -103.8, 29.4, 0, -70.9] },
      { kind: 'grip', open: true },
      { kind: 'move', mode: 'L', joints: [43.1, -9.7, -68.3, -12, 0, -70.8] },
    ],
  },
  {
    name: '네모 그리기',
    blend: 'smooth',
    speed: 25,
    rows: [
      { kind: 'move', mode: 'J', joints: [5.7, -2.2, -133.8, 45.9, 0, -65.8] },
      { kind: 'move', mode: 'L', joints: [42.6, -2.2, -133.9, 46.1, 0, -65.9] },
      { kind: 'move', mode: 'L', joints: [28.2, -38.2, -80.3, 28.5, 0, -74] },
      { kind: 'move', mode: 'L', joints: [3.7, -38.2, -80.2, 28.5, 0, -74] },
      { kind: 'move', mode: 'L', joints: [5.7, -2.2, -133.8, 45.9, 0, -65.8] },
    ],
  },
];
