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
import { OBJECT_KINDS, type DeskObject } from '../desk';
import type { CellAlert } from './faults';
import { type CellLayout, type SensorDef } from './cells';

export interface LineState {
  /** Cell time, s. */
  t: number;
  auto: boolean;
  out: Record<string, boolean>;
  in: Record<string, boolean>;
  /** The pusher's travel, 0 (back) .. 1 (out). */
  ext: number;
  phase: 'idle' | 'push' | 'back' | 'convey';
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
}

export function newLine(l: CellLayout, auto: boolean, refill = 0): LineState {
  const out = Object.fromEntries(l.outputs.map((n) => [n, false]));
  const inputs = Object.fromEntries(l.inputs.map((n) => [n, false]));
  return { t: 0, auto, out, in: inputs, ext: 0, phase: 'idle', phaseT: 0, requests: 0, blockedT: 0, log: [], fed: 0, refill, halted: false };
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

function setIn(s: LineState, name: string, on: boolean): void {
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

  // Sensors.
  for (const sd of l.line.sensors) setIn(s, sd.name, free.some((p) => sees(sd, p)));
  const pu = l.line.pusher;

  // The magazine ran empty: the operator fills it (when the mission has parts to spare).
  const mag = l.line.magazine;
  if (mag && !s.in[mag.sensor] && s.ext === 0 && s.refill > 0 && !free.some((p) => Math.hypot(p.x - mag.x, p.y - mag.y) < 15)) {
    refilled = Math.min(mag.capacity, s.refill);
    s.refill -= refilled;
    alerts.push({ t: s.t, level: 'info', kind: 'empty', title: '매거진 채움', msg: `매거진이 비어서 작업자가 부품 ${refilled}개를 채웠어요.` });
  }

  // The line controller (자동 운전).
  const end = l.line.endPlace ? l.line.sensors.find((x) => x.kind === 'beam')?.name : undefined;
  if (s.auto && !s.halted && pu) {
    const go = (phase: LineState['phase']) => {
      s.phase = phase;
      s.phaseT = 0;
    };
    switch (s.phase) {
      case 'idle': {
        const beltClear = !free.some((p) => onBelt(l, p));
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
        if (s.in[pu.outEnd]) {
          setOut(s, pu.output, false);
          go('back');
        }
        break;
      case 'back':
        if (s.in[pu.backEnd] && l.line.beltOutput) {
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

  return { movers, belts, alerts, refilled };
}
