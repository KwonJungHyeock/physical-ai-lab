/**
 * A 실습 셀 while it runs: its equipment (line.ts), the robot's health (faults.ts), the alerts so far
 * and the run's record (what was picked and placed, when) that the mission checks read.
 *
 * stepCell is the cell's frame: the equipment moves, the physics world steps (the belt carries,
 * the pusher pushes, parts fall), knocks break parts, the motors' load and heat are watched. A 정지
 * or 고장 sets `halt`: the running program stops at its next motion (sim.ts) and the line stands still.
 */

import type { PhysicsEnv, PhysicsWorld } from '../../physics/physics';
import type { Box } from '../../physics/collide';
import type { ChainSegment } from '../../robot/kinematics';
import { tcpPositionMm } from '../../robot/motion';
import type { DeskObject, FixedBox } from '../desk';
import { objectSpec, stepDesk } from '../deskPhysics';
import type { WorldState } from '../sim';
import { CELL_FLOOR_Z, cellLayout, magazineParts, type CellId, type CellLayout } from './cells';
import { knockAlert, newHealth, repair, watchLoad, type CellAlert, type Health } from './faults';
import { guardBoxes, newLine, stepLine, type LineState } from './line';
import { freeSetup, judge, missionById, type CellEvent, type CellMission } from './missions';
import { newVision, type VisionState } from './vision';

/** A machined workpiece's colour (D): bright turned steel. */
export const MACHINED = '#e3e8ee';

export interface CellRun {
  id: CellId;
  layout: CellLayout;
  /** The ladder step being done, or null for 자유 실습. */
  mission: string | null;
  line: LineState;
  health: Health;
  alerts: CellAlert[];
  /** Alerts the screen has not shown yet (it takes them). */
  fresh: CellAlert[];
  /** A 정지 or 고장 that stops the program and the line. */
  halt: CellAlert | null;
  events: CellEvent[];
  /** "다음 칸": how many places of each grid are used. */
  next: Record<string, number>;
  /** Cell time of the first motion and of the run's end (for 사이클 타임). */
  startT: number | null;
  endT: number | null;
  /** The tool tip a frame ago, for its speed. */
  lastTip: { x: number; y: number; z: number } | null;
  /** B's camera: its rule table, set points, what it was taught, its last picture. */
  vision: VisionState;
}

/** The cell's start: its run state and the parts it begins with. */
export function newCellRun(id: CellId, missionId: string | null): { run: CellRun; parts: DeskObject[] } {
  const layout = cellLayout(id);
  const m = missionId ? missionById(missionId) : null;
  const setup = m?.setup ?? freeSetup();
  // 자동 운전 feeds from a magazine or a dispenser; a cell without either is run by hand.
  const line = newLine(layout, setup.auto && !!(layout.line.pusher || layout.line.dispenser), setup.refill ?? 0);
  if (setup.beltOn && layout.line.beltOutput) {
    line.out[layout.line.beltOutput] = true;
    line.phase = 'convey';
    line.requests = 1;
  }
  line.queue = setup.queue?.(layout) ?? [];
  setup.line?.(line);
  const run: CellRun = { id, layout, mission: m?.id ?? null, line, health: newHealth(), alerts: [], fresh: [], halt: null, events: [], next: {}, startT: null, endT: null, lastTip: null, vision: newVision() };
  return { run, parts: setup.parts(layout) };
}

/** The furniture the arm keeps off, and everything the physics world has as solid, and where its floor is. */
export const cellFixed = (run: CellRun): FixedBox[] => [...run.layout.fixed, ...guardBoxes(run.layout, run.line)];
export const cellSolids = (run: CellRun): Box[] => [...run.layout.fixed, ...run.layout.solids];
export const CELL_ENV: PhysicsEnv = { floorZ: CELL_FLOOR_Z, fine: true };

/** Note an alert: a 정지 or 고장 stops the program and the line; a 고장 stays until repaired. */
export function raise(run: CellRun, a: CellAlert): void {
  run.alerts.push(a);
  run.fresh.push(a);
  if (a.level === 'stop' || a.level === 'fault') {
    run.halt ??= a;
    run.line.halted = true;
  }
  if (a.level === 'fault') run.health.fault ??= a;
}

/** Before a new run: a 정지 is over (its cause is the program's); a 고장 stays until [점검 · 복구]. */
export function resumeCell(run: CellRun): void {
  if (run.health.fault) return;
  run.halt = null;
  run.line.halted = false;
}

/** [점검 · 복구]: the broken part replaced, the line free to run again. */
export function repairCell(run: CellRun): void {
  repair(run.health);
  run.halt = null;
  run.line.halted = false;
  run.alerts.push({ t: run.line.t, level: 'info', kind: 'order', title: '점검 · 복구', msg: '고장 난 곳을 고치고 다시 쓸 수 있게 했어요.' });
}

/** One frame of the cell, `dt` seconds of cell time; `angles`: the arm's pose for this step when a long frame is cut into steps. */
export function stepCell(w: WorldState, phys: PhysicsWorld, dt: number, chain: readonly ChainSegment[], tcpMm: number, angles: readonly number[] = w.angles): void {
  const run = w.cell;
  if (!run) return;
  const ls = stepLine(run.layout, run.line, w.objects, dt, w.carry?.id ?? null);
  const added = [...(ls.refilled ? magazineParts(run.layout, ls.refilled) : []), ...ls.spawned];
  for (const o of added) {
    w.objects.push(o);
    phys.add(objectSpec(o));
  }
  if (added.length) w.version += 1;
  phys.setMovers(ls.movers);
  phys.setBelts(ls.belts);
  ls.alerts.forEach((a) => raise(run, a));
  // The door moves: the arm keeps off it where it is now.
  if (run.layout.line.actuators?.some((a) => a.guard)) w.fixed = cellFixed(run);
  // D: the workpiece in the machine comes out machined, or spoiled when its cycle was cut short.
  const at = run.layout.line.cycle?.place ? run.layout.places[run.layout.line.cycle.place] : null;
  if (ls.cycleEnd && at) {
    const o = w.objects.find((p) => p.id !== w.carry?.id && Math.hypot(p.x - at.x, p.y - at.y) < 10 && Math.abs(p.z - at.z) < 8);
    if (o && ls.cycleEnd === 'done') {
      o.machined = true;
      o.color = MACHINED;
    }
    if (o && ls.cycleEnd === 'cut') o.damaged = true;
    w.version += 1;
  }

  // E: a housing carried off the belt's end drops into the box's next free spot.
  const ob = run.layout.line.outBox;
  const belt = run.layout.line.belt;
  if (ob && belt) {
    for (const o of w.objects) {
      if (!o.pins || o.id === w.carry?.id || o.y > ob.past || o.z < belt.topZ - 6) continue;
      const free = ob.spots.find(([x, y]) => !w.objects.some((k) => k !== o && k.pins && Math.hypot(k.x - x, k.y - y) < 14 && k.z < belt.topZ - 6));
      const [x, y] = free ?? ob.spots[ob.spots.length - 1];
      const z = ob.z + (free ? 0 : 20);
      phys.teleport(o.id, [x, y, z + o.size[2] / 2], [0, 0, 0, 1]);
      Object.assign(o, { x, y, z, q: [0, 0, 0, 1], yawDeg: 0 });
    }
  }

  stepDesk(w, phys, dt, angles);
  w.version += 1;

  const t = run.line.t;
  const mag = run.layout.line.magazine;
  for (const k of phys.impacts()) {
    const o = w.objects.find((p) => p.id === k.id);
    if (!o || o.damaged) continue;
    // A magazine's stack drops one part's height each push: that is how it feeds, not a knock.
    if (mag && Math.hypot(o.x - mag.x, o.y - mag.y) < 20) continue;
    // Down a chute: it slides, nothing breaks.
    if (run.layout.line.soft?.some((z) => o.x > z.min[0] && o.x < z.max[0] && o.y > z.min[1] && o.y < z.max[1] && o.z > z.min[2] && o.z < z.max[2])) continue;
    const a = knockAlert(k.dv, t, [o.x, o.y, o.z + o.size[2]]);
    if (!a) continue;
    if (a.kind === 'damage') o.damaged = true;
    raise(run, a);
  }

  // The tool tip's speed (a collision's severity) and the motors' load and heat.
  const tip = tcpPositionMm(chain, angles, tcpMm);
  if (run.lastTip && dt > 0) {
    const v = Math.hypot(tip.x - run.lastTip.x, tip.y - run.lastTip.y, tip.z - run.lastTip.z) / dt;
    run.health.tipSpeed += (v - run.health.tipSpeed) * Math.min(1, dt / 0.08);
    if (run.startT === null && v > 1) run.startT = t;
  }
  run.lastTip = { x: tip.x, y: tip.y, z: tip.z };
  const held = w.carry ? w.objects.find((o) => o.id === w.carry!.id) : undefined;
  for (const a of watchLoad(run.health, chain, angles, held ? held.massG / 1000 : 0, tcpMm, t)) raise(run, a);
}

/** The mission's checks now. */
export function cellChecks(w: WorldState): { mission: CellMission; items: ReturnType<typeof judge> } | null {
  const run = w.cell;
  const m = run?.mission ? missionById(run.mission) : null;
  if (!run || !m) return null;
  const end = run.endT ?? run.line.t;
  // A part still in the tool is not placed anywhere.
  const items = judge(m, { parts: w.objects.filter((o) => o.id !== w.carry?.id), l: run.layout, line: run.line, alerts: run.alerts, events: run.events, elapsed: run.startT === null ? 0 : end - run.startT, vision: run.vision });
  return { mission: m, items };
}
