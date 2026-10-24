/**
 * The cell's equipment, frame by frame: the feed cylinder's pusher, the belt, the sensors and the
 * line controller (자동 운전), as a real cell's PLC would run them.
 *
 *  - Outputs (the controller's or the program's): '공급 실린더' (on = extend), '컨베이어' (on = run).
 *  - Inputs (what the program can wait for): the sensors, and the cylinder's end switches.
 *  - 자동 운전: cell.feed() asks for one part; the controller pushes one out of the magazine when the
 *    belt is clear, runs the belt and stops it when the part reaches the end sensor. Off (도전
 *    missions), the program drives the outputs itself.
 *
 * The line does not move the parts: it gives the physics world its moving boxes and running belts,
 * and the parts move by contact (cell/step.ts). It reads where the parts are for its sensors.
 */

import type { Belt, Mover } from '../../physics/physics';
import { OBJECT_KINDS, type DeskObject, type FixedBox } from '../desk';
import type { CellAlert } from './faults';
import { PART_HEIGHT, type CellLayout, type InspectDef, type SensorDef } from './cells';

export interface LineState {
  /** Cell time, s. */
  t: number;
  auto: boolean;
  out: Record<string, boolean>;
  in: Record<string, boolean>;
  /** The pusher's travel, 0 (back) .. 1 (out). */
  ext: number;
  /** C's inspection line adds 'held' (a part stopped at the station), 'send' (on to the stopper) and 'eject'. */
  phase: 'idle' | 'push' | 'back' | 'convey' | 'held' | 'send' | 'eject';
  phaseT: number;
  /** Parts asked for with cell.feed() and not yet at the end. */
  requests: number;
  /** How long the belt has run with a part held at the end, s. */
  blockedT: number;
  /** Signal changes, for the lamps and the timing chart. */
  log: { t: number; name: string; on: boolean }[];
  /** Parts pushed out of the magazine so far. */
  fed: number;
  /** The operator refills an empty magazine (missions that need more parts than it holds). */
  refill: number;
  /** Stopped by a 정지 or 고장: nothing moves until reset. */
  halted: boolean;
  /** Each actuator's travel, 0 (off) .. 1 (on), by its output. */
  act: Record<string, number>;
  /** The machine cycle's time so far, s (null: not running). */
  cycleT: number | null;
  /** Parts waiting at the dispenser (B), in order; and how many times its output has turned on so far (a part drops each time, however short the pulse). */
  queue: DeskObject[];
  gate: number;
  /** C: the part the inspection sensors read last, what they read, and the program's asks (send on / eject). */
  inspected: string | null;
  ask: 'send' | 'eject' | null;
  /** C's record: parts passed on and ejected so far. */
  passed: number;
  ejected: number;
  /** D: cycles finished and cut short so far; the start refused while the machine was not ready. */
  machined: number;
  cut: number;
  refused: boolean;
  /** E: how long the feeder has been bringing the next pin up, s; and whether it has said it ran out. */
  feedT: number;
  feedEmpty: boolean;
}

export function newLine(l: CellLayout, auto: boolean, refill = 0): LineState {
  const out = Object.fromEntries(l.outputs.map((n) => [n, false]));
  const inputs = Object.fromEntries(l.inputs.map((n) => [n, false]));
  const act = Object.fromEntries((l.line.actuators ?? []).map((a) => [a.output, 0]));
  return { t: 0, auto, out, in: inputs, ext: 0, phase: 'idle', phaseT: 0, requests: 0, blockedT: 0, log: [], fed: 0, refill, halted: false, act, cycleT: null, queue: [], gate: 0, inspected: null, ask: null, passed: 0, ejected: 0, machined: 0, cut: 0, refused: false, feedT: 0, feedEmpty: false };
}

/** A part's footprint radius and height, mm. */
const dims = (o: DeskObject) => ({ r: OBJECT_KINDS[o.kind].shape === 'box' ? Math.hypot(o.size[0], o.size[1]) / 2 : o.size[0] / 2, h: o.size[2] });

function sees(s: SensorDef, o: DeskObject): boolean {
  const { r, h } = dims(o);
  if (s.kind === 'zone') return o.x > s.min[0] && o.x < s.max[0] && o.y > s.min[1] && o.y < s.max[1] && o.z + h / 2 > s.min[2] && o.z + h / 2 < s.max[2];
  // A beam: the part's round footprint crosses the line at the beam's height.
  const z = (s.a[2] + s.b[2]) / 2;
  if (z < o.z || z > o.z + h) return false;
  const ax = s.b[0] - s.a[0];
  const ay = s.b[1] - s.a[1];
  const len2 = ax * ax + ay * ay;
  const f = len2 ? Math.max(0, Math.min(1, ((o.x - s.a[0]) * ax + (o.y - s.a[1]) * ay) / len2)) : 0;
  return Math.hypot(o.x - (s.a[0] + ax * f), o.y - (s.a[1] + ay * f)) < r;
}

export function setIn(s: LineState, name: string, on: boolean): void {
  if (s.in[name] === on) return;
  s.in[name] = on;
  s.log.push({ t: s.t, name, on });
}

export function setOut(s: LineState, name: string, on: boolean): void {
  if (s.out[name] === on) return;
  s.out[name] = on;
  s.log.push({ t: s.t, name, on });
}

export interface LineStep {
  movers: Mover[];
  belts: Belt[];
  alerts: CellAlert[];
  /** Parts the operator put back into the magazine (the caller adds them to the world). */
  refilled: number;
  /** Parts the dispenser dropped onto the belt (the caller adds them to the world). */
  spawned: DeskObject[];
  /** D: the machine's cycle ended this frame, finished or cut short (the caller marks the workpiece). */
  cycleEnd?: 'done' | 'cut';
}

const onBelt = (l: CellLayout, o: DeskObject) => {
  const b = l.line.belt;
  return !!b && o.x > b.min[0] && o.x < b.max[0] && o.y > b.min[1] && o.y < b.max[1] && Math.abs(o.z - b.topZ) < 3;
};

/** One frame of the equipment. `parts`: the cell's workpieces where they are now; `carried`: the one in the tool. */
export function stepLine(l: CellLayout, s: LineState, parts: readonly DeskObject[], dt: number, carried: string | null): LineStep {
  s.t += dt;
  s.phaseT += dt;
  const alerts: CellAlert[] = [];
  const free = parts.filter((p) => p.id !== carried);
  let refilled = 0;
  const spawned: DeskObject[] = [];

  // Sensors.
  for (const sd of l.line.sensors) setIn(s, sd.name, free.some((p) => sees(sd, p)));
  const pu = l.line.pusher;

  // C's inspection sensors: a part coming to the first one starts a new reading; each sensor holds what it read.
  const ins = l.line.inspect;
  if (ins) {
    const inZone = (r: InspectDef['reads'][number], o: DeskObject) => o.x > r.min[0] && o.x < r.max[0] && o.y > r.min[1] && o.y < r.max[1] && onBelt(l, o);
    const first = free.find((o) => inZone(ins.reads[0], o));
    if (first && first.id !== s.inspected) {
      s.inspected = first.id;
      for (const r of ins.reads) setIn(s, r.name, false);
    }
    for (const r of ins.reads) {
      const o = free.find((p) => p.id === s.inspected && inZone(r, p));
      if (o && (r.sees === 'tall' ? o.size[2] >= PART_HEIGHT - 2 : r.sees === 'metal' ? !!o.metal : !o.metal)) setIn(s, r.name, true);
    }
  }

  // The magazine ran empty: the operator fills it (when the mission has parts to spare).
  const mag = l.line.magazine;
  if (mag && !s.in[mag.sensor] && s.ext === 0 && s.refill > 0 && !free.some((p) => Math.hypot(p.x - mag.x, p.y - mag.y) < 15)) {
    refilled = Math.min(mag.capacity, s.refill);
    s.refill -= refilled;
    alerts.push({ t: s.t, level: 'info', kind: 'empty', title: '매거진 채움', msg: `매거진이 비어서 작업자가 부품 ${refilled}개를 채웠어요.` });
  }

  // The dispenser (B): the next part waiting drops onto the belt's start, when the way is clear.
  const dsp = l.line.dispenser;
  const drop = (): CellAlert | null => {
    if (!dsp || !l.line.belt) return null;
    if (free.some((p) => Math.hypot(p.x - dsp.x, p.y - dsp.y) < 22)) return { t: s.t, level: 'warn', kind: 'jam', title: '투입구 막힘', msg: '벨트 입구에 앞 부품이 아직 있어서 넣지 못했어요.', fix: '컨베이어로 앞 부품을 먼저 보내 주세요.' };
    const next = s.queue.shift();
    if (!next) return { t: s.t, level: 'info', kind: 'empty', title: '투입할 부품 없음', msg: '투입기에 남은 부품이 없어요.' };
    spawned.push({ ...next, x: dsp.x, y: dsp.y, z: l.line.belt.topZ + 0.5 });
    s.fed += 1;
    return null;
  };
  if (dsp && !s.auto && !s.halted) {
    const pulses = s.log.filter((e) => e.name === dsp.output && e.on).length;
    if (pulses > s.gate) {
      const a = drop();
      if (a) alerts.push(a);
    }
    s.gate = pulses;
  }

  // E's vibratory feeder: on, it brings the next pin (of the queue) up the track to the empty nest.
  const fd = l.line.insert?.feeder;
  if (fd && s.out[fd.output] && !s.halted && !s.in[fd.sensor]) {
    s.feedT += dt;
    if (s.feedT >= fd.timeS) {
      s.feedT = 0;
      const nest = l.places[fd.nest];
      const next = s.queue.shift();
      if (next) spawned.push({ ...next, x: nest.x, y: nest.y, z: nest.z + 0.3 });
      else if (!s.feedEmpty) {
        s.feedEmpty = true;
        alerts.push({ t: s.t, level: 'info', kind: 'empty', title: '핀 없음', msg: '피더에 남은 핀이 없어요.' });
      }
    }
  } else s.feedT = 0;

  // The line controller (자동 운전).
  const end = l.line.endPlace ? l.line.sensors.find((x) => x.kind === 'beam')?.name : undefined;
  if (s.auto && !s.halted && (pu || dsp)) {
    const go = (phase: LineState['phase']) => {
      s.phase = phase;
      s.phaseT = 0;
    };
    if (ins && l.line.beltOutput) inspectLine(s, ins, l.line.beltOutput, alerts, drop, go);
    else switch (s.phase) {
      case 'idle': {
        const beltClear = !free.some((p) => onBelt(l, p));
        if (!pu) {
          // A dispenser line: drop the next part and run the belt to the end.
          if (s.requests > 0 && beltClear && !(end && s.in[end]) && l.line.beltOutput) {
            const a = drop();
            if (a) {
              alerts.push(a);
              s.requests = 0;
              break;
            }
            setOut(s, l.line.beltOutput, true);
            go('convey');
          }
          break;
        }
        if (s.requests > 0 && beltClear && !(end && s.in[end])) {
          if (mag && !s.in[mag.sensor]) {
            if (s.phaseT > 1 && s.refill === 0) {
              alerts.push({ t: s.t, level: 'info', kind: 'empty', title: '매거진 빔', msg: '매거진에 부품이 없어 공급하지 못했어요.' });
              s.requests = 0;
            }
            break;
          }
          setOut(s, pu.output, true);
          go('push');
        }
        break;
      }
      case 'push':
        if (pu && s.in[pu.outEnd]) {
          setOut(s, pu.output, false);
          go('back');
        }
        break;
      case 'back':
        if (pu && s.in[pu.backEnd] && l.line.beltOutput) {
          setOut(s, l.line.beltOutput, true);
          go('convey');
        }
        break;
      case 'convey':
        // The belt runs a moment past the sensor, so the part comes up against the end stop.
        if (end && s.in[end] && s.blockedT > 0.3) {
          setOut(s, l.line.beltOutput!, false);
          s.requests = Math.max(0, s.requests - 1);
          go('idle');
        } else if (s.phaseT > 20) {
          setOut(s, l.line.beltOutput!, false);
          alerts.push({ t: s.t, level: 'stop', kind: 'timeout', title: '부품 도착 안 함', msg: '20초 동안 부품이 끝 센서에 오지 않았어요. 벨트에서 떨어졌을 수 있어요.', fix: '벨트 위를 살펴보고 [처음 상태로] 다시 시작해 주세요.' });
          s.requests = 0;
          go('idle');
        }
        break;
    }
  }

  // The cylinder: it travels to where its output says (and stops where it is when the line halts).
  const movers: Mover[] = [];
  if (pu) {
    const want = s.halted ? s.ext : s.out[pu.output] ? 1 : 0;
    if (want > s.ext && s.ext === 0 && l.line.landing) {
      // About to push: a part left on the belt in front jams the slot.
      const ld = l.line.landing;
      const stuck = free.find((p) => p.x > ld.min[0] && p.x < ld.max[0] && p.y > ld.min[1] && p.y < ld.max[1]);
      if (stuck) {
        setOut(s, pu.output, false);
        s.halted = true;
        alerts.push({ t: s.t, level: 'fault', kind: 'jam', title: '공급 걸림', msg: '벨트 입구에 부품이 남아 있는데 실린더가 밀었어요. 부품끼리 끼였어요.', fix: '컨베이어로 앞 부품을 먼저 보낸 뒤 공급해 주세요.', at: [stuck.x, stuck.y, stuck.z + 20] });
      }
    }
    const was = s.ext;
    const step = dt / pu.timeS;
    if (!s.halted) s.ext = want > s.ext ? Math.min(want, s.ext + step) : Math.max(want, s.ext - step);
    if (s.ext !== was && s.ext === 1) s.fed += 1;
    setIn(s, pu.outEnd, s.ext >= 1);
    setIn(s, pu.backEnd, s.ext <= 0);
    const x0 = pu.retracted[0] + (pu.extended[0] - pu.retracted[0]) * s.ext;
    const x1 = pu.retracted[1] + (pu.extended[1] - pu.retracted[1]) * s.ext;
    movers.push({ id: pu.output, min: [x0, pu.y[0], pu.z[0]], max: [x1, pu.y[1], pu.z[1]] });
  }

  // Doors, chucks, clamps, stoppers, ejectors: each travels to where its output says (and stays put while the line is halted).
  for (const a of l.line.actuators ?? []) {
    const cur = s.act[a.output] ?? 0;
    const want = s.halted ? cur : s.out[a.output] ? 1 : 0;
    const step = dt / a.timeS;
    const v = want > cur ? Math.min(want, cur + step) : Math.max(want, cur - step);
    s.act[a.output] = v;
    if (a.onEnd) setIn(s, a.onEnd, v >= 1);
    if (a.offEnd) setIn(s, a.offEnd, v <= 0);
    if (a.box) {
      const lerp = (k: 0 | 1, i: number) => a.box!.off[k][i] + (a.box!.on[k][i] - a.box!.off[k][i]) * v;
      movers.push({ id: a.output, min: [lerp(0, 0), lerp(0, 1), lerp(0, 2)], max: [lerp(1, 0), lerp(1, 1), lerp(1, 2)] });
    }
  }

  // A machine's cycle: started by its output when what it needs is on (a closed door, a locked chuck), busy, then done.
  const cy = l.line.cycle;
  let cycleEnd: LineStep['cycleEnd'];
  if (cy) {
    const go = s.out[cy.output] && !s.halted;
    const ready = cy.needs.every((n) => s.in[n]);
    // Once started the cycle runs to its end whatever the start signal does (a start is a push, not a hold).
    const midCycle = s.cycleT !== null && s.cycleT < cy.timeS;
    if ((!go && !midCycle) || s.halted) {
      s.cycleT = null;
      s.refused = false;
    } else if (s.cycleT === null) {
      if (ready && !s.in[cy.done]) s.cycleT = 0;
      else if (!ready && !s.in[cy.done] && !s.refused) {
        // Asked to start with the door open or the chuck loose: the machine does not start, and says why.
        s.refused = true;
        const why = cy.needs.filter((n) => !s.in[n]).join(' · ');
        alerts.push({ t: s.t, level: 'info', kind: 'order', title: '가공 시작 안 함', msg: `가공 시작 신호가 왔지만 ${why}이 아니라서 기계가 시작하지 않았어요.`, fix: `${cy.needs.join(' · ')}이 모두 켜진 뒤에 가공을 시작해 주세요.` });
      }
    } else {
      s.cycleT += dt;
      if (!ready) {
        // The door opened or the chuck let go mid-cycle: the machine stops, and the piece is spoiled.
        if (s.cycleT < cy.timeS) {
          s.cut += 1;
          cycleEnd = 'cut';
          alerts.push({ t: s.t, level: 'warn', kind: 'damage', title: '가공 중단', msg: '가공 중에 문이 열리거나 척이 풀려서 기계가 멈췄어요. 그 부품은 불량이에요.', fix: `${cy.done} 신호를 기다린 뒤에 문을 열어 주세요.` });
        }
        s.cycleT = null;
      }
    }
    setIn(s, cy.busy, s.cycleT !== null && s.cycleT < cy.timeS);
    if (s.cycleT !== null && s.cycleT >= cy.timeS && !s.in[cy.done]) {
      setIn(s, cy.done, true);
      s.machined += 1;
      cycleEnd = 'done';
    }
    if (!s.out[cy.output]) setIn(s, cy.done, false);
  }

  // The belt, and a part held at its end while it runs (it slips under the part).
  const belts: Belt[] = [];
  const bd = l.line.belt;
  const running = !!bd && !!l.line.beltOutput && s.out[l.line.beltOutput] && !s.halted;
  if (bd && running) belts.push({ min: bd.min, max: bd.max, topZ: bd.topZ, v: [bd.dir[0] * bd.speed, bd.dir[1] * bd.speed] });
  if (running && end && s.in[end]) {
    s.blockedT += dt;
    if (s.blockedT > 10) {
      setOut(s, l.line.beltOutput!, false);
      s.halted = true;
      alerts.push({ t: s.t, level: 'fault', kind: 'jam', title: '컨베이어 과부하', msg: '끝에 부품이 막힌 채로 벨트가 10초 넘게 돌아서 모터 보호 장치가 끊겼어요.', fix: '끝 센서가 켜지면 컨베이어를 꺼 주세요.' });
    } else if (s.blockedT > 3 && s.blockedT - dt <= 3) {
      alerts.push({ t: s.t, level: 'warn', kind: 'jam', title: '벨트 미끄러짐', msg: '끝에 부품이 멈춰 있는데 벨트가 계속 돌아요.', fix: '끝 센서가 켜지면 컨베이어를 꺼 주세요.' });
    }
  } else s.blockedT = 0;

  return { movers, belts, alerts, refilled, spawned, cycleEnd };
}

/** The boxes of guarded equipment (a door) where it is now: the arm keeps off them like furniture. */
export function guardBoxes(l: CellLayout, s: LineState): FixedBox[] {
  return (l.line.actuators ?? []).flatMap((a) => {
    if (!a.guard || !a.box) return [];
    const v = s.act[a.output] ?? 0;
    const at = (k: 0 | 1) => a.box!.off[k].map((o, i) => o + (a.box!.on[k][i] - o) * v) as [number, number, number];
    return [{ name: a.guard, min: at(0), max: at(1), pad: 0 }];
  });
}

/**
 * C's controller (자동 운전): the stopper stays down; a part asked for drops and runs to the station,
 * where the belt stops and the line waits for the program — cell.send() runs it on to the stopper
 * (once the last one was taken from there), cell.eject() pushes it into the reject bin.
 */
function inspectLine(s: LineState, ins: InspectDef, belt: string, alerts: CellAlert[], drop: () => CellAlert | null, go: (p: LineState['phase']) => void): void {
  setOut(s, ins.stopper, true);
  const stall = (what: string) => {
    setOut(s, belt, false);
    alerts.push({ t: s.t, level: 'stop', kind: 'timeout', title: '부품 도착 안 함', msg: `20초 동안 부품이 ${what}에 오지 않았어요. 벨트에서 떨어졌을 수 있어요.`, fix: '벨트 위를 살펴보고 [처음 상태로] 다시 시작해 주세요.' });
    s.requests = 0;
    s.ask = null;
    go('idle');
  };
  switch (s.phase) {
    case 'idle':
      if (s.requests > 0 && !s.in[ins.station]) {
        const a = drop();
        if (a) {
          alerts.push(a);
          s.requests = 0;
          break;
        }
        setOut(s, belt, true);
        go('convey');
      }
      break;
    case 'convey':
      if (s.in[ins.station]) {
        setOut(s, belt, false);
        s.requests = Math.max(0, s.requests - 1);
        go('held');
      } else if (s.phaseT > 20) stall(ins.station);
      break;
    case 'held':
      if (s.ask === 'eject') {
        setOut(s, ins.ejector, true);
        go('eject');
      } else if (s.ask === 'send' && !s.in[ins.arrived]) {
        setOut(s, belt, true);
        go('send');
      }
      break;
    case 'send':
      // On past the station's beam to the stopper, and a moment more so the part sits against it.
      if (s.in[ins.arrived] && !s.in[ins.station] && s.phaseT > 0.5 && s.blockedT > 0.3) {
        setOut(s, belt, false);
        s.ask = null;
        s.passed += 1;
        go('idle');
      } else if (s.phaseT > 20) stall(ins.arrived);
      break;
    case 'eject':
      if (s.out[ins.ejector] && s.in[ins.ejected]) setOut(s, ins.ejector, false);
      else if (!s.out[ins.ejector] && (s.act[ins.ejector] ?? 0) <= 0) {
        s.ask = null;
        s.ejected += 1;
        go('idle');
      }
      break;
    default:
      go('idle');
  }
}
