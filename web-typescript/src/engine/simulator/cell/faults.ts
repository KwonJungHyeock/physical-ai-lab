/**
 * 실습 셀 alerts: what a real cell would tell the operator. Four levels, as on a teach pendant:
 *
 *  - 알림 (info): the line's own news (매거진이 비었어요, 작업자가 채웠어요).
 *  - 주의 (warn): nothing stops, but a habit will break something (부하 85 %, 부품이 6 cm 떨어졌어요).
 *  - 정지 (stop): the program stops; fix the cause and run again (과부하, 충돌 감지, 벨트 미끄러짐).
 *  - 고장 (fault): something broke — the cell is locked until [점검 · 복구] (그리퍼 파손, 모터 과열,
 *    공급 걸림). It is counted in the mission's result.
 *
 * The robot's own limits (joint range, reach, self-collision) keep their RunError messages; a
 * collision becomes a 고장 when the arm was moving fast as it hit (the gripper does not survive it).
 */

import { inverseDynamics, torqueLimits } from '../../physics/dynamics';
import type { ChainSegment } from '../../robot/kinematics';
import { toShop } from './cells';

export type AlertLevel = 'info' | 'warn' | 'stop' | 'fault';
export type AlertKind = 'limit' | 'load' | 'heat' | 'collision' | 'damage' | 'drop' | 'jam' | 'empty' | 'timeout' | 'order' | 'safety';

export const LEVEL_NAME: Record<AlertLevel, string> = { info: '알림', warn: '주의', stop: '정지', fault: '고장' };

export interface CellAlert {
  /** Cell time, s. */
  t: number;
  level: AlertLevel;
  kind: AlertKind;
  title: string;
  msg: string;
  fix?: string;
  /** Where in the cell it happened (a marker in the 3D view), mm. */
  at?: [number, number, number];
}

export interface Health {
  /** Each joint's estimated load (torque ÷ rated), 0..; and its motor's heat, 0..1 (1 = 과열). */
  load: number[];
  heat: number[];
  /** The latched 고장, cleared by [점검 · 복구]. */
  fault: CellAlert | null;
  gripper: 'ok' | 'broken';
  /** Tool tip speed now, mm/s (for a collision's severity). */
  tipSpeed: number;
  /** For the load estimate: the last angles (at cell time t), and the smoothed joint speeds and accelerations. */
  prev: { t: number; q: number[]; qd: number[]; qdd: number[] } | null;
  /** Time a joint has been over its warning load (so a short peak does not warn). */
  overT: number[];
  warned: Set<string>;
}

export function newHealth(joints = 6): Health {
  return { load: Array(joints).fill(0), heat: Array(joints).fill(0), fault: null, gripper: 'ok', tipSpeed: 0, prev: null, overT: Array(joints).fill(0), warned: new Set() };
}

/** Load (torque ÷ rated) that warns, that stops the motion, and that breaks the joint's gear. */
export const LOAD_WARN = 0.85;
export const LOAD_STOP = 1.0;
export const LOAD_BREAK = 1.35;
/** Heat: grows with the load over HEAT_FREE, falls below it; 1 = the motor cuts out. */
const HEAT_FREE = 0.6;
const HEAT_RISE_S = 25;
const HEAT_FALL_S = 60;

const JOINT_NAMES = ['J1 베이스', 'J2 어깨', 'J3 팔꿈치', 'J4 손목 꺾기', 'J5 손목 돌리기', 'J6 손끝 돌리기'];

/**
 * The motors' load and heat over one frame (estimated with the arm's dynamics, as the monitor's
 * load rings): returns the alerts it raises. `payloadKg`: what the tool holds.
 */
export function watchLoad(h: Health, chain: readonly ChainSegment[], angles: readonly number[], payloadKg: number, tcpMm: number, t: number): CellAlert[] {
  const out: CellAlert[] = [];
  const q = angles.slice();
  const p = h.prev;
  // Speeds and accelerations over at least 30 ms, smoothed as the monitor's (frame to frame they flicker).
  if (!p) {
    h.prev = { t, q, qd: q.map(() => 0), qdd: q.map(() => 0) };
    return out;
  }
  const dt = t - p.t;
  if (dt < 0.03) return out;
  const k = Math.min(1, dt / 0.12);
  const v = q.map((a, i) => (a - p.q[i]) / dt);
  const acc = v.map((x, i) => (x - p.qd[i]) / dt);
  const qd = p.qd.map((x, i) => x + (v[i] - x) * k);
  const qdd = p.qdd.map((x, i) => x + (acc[i] - x) * k * 0.5);
  h.prev = { t, q, qd, qdd };
  const tau = inverseDynamics(chain, q, qd, qdd, { payloadKg, tcpMm });
  const lim = torqueLimits(chain, tcpMm);
  tau.forEach((v, i) => {
    const r = lim[i] > 0 ? Math.abs(v) / lim[i] : 0;
    h.load[i] = r;
    const load = r;
    h.heat[i] = Math.max(0, h.heat[i] + (load > HEAT_FREE ? ((load * load - HEAT_FREE * HEAT_FREE) * dt) / HEAT_RISE_S : -dt / HEAT_FALL_S));
    h.overT[i] = load > LOAD_WARN ? h.overT[i] + dt : 0;
    const name = JOINT_NAMES[i] ?? `J${i + 1}`;
    if (h.warned.has(`stop${i}`)) {
      // Stopped for this joint already: one alert, not one a frame (it holds the load while it waits).
    } else if (load > LOAD_BREAK && h.overT[i] > 0.15) {
      h.warned.add(`stop${i}`);
      out.push({ t, level: 'fault', kind: 'load', title: `${name} 과부하 고장`, msg: `${name} 모터가 견딜 수 있는 힘의 ${Math.round(load * 100)}%를 받았어요. 감속기가 상했어요.`, fix: '무거운 부품은 팔을 접은 채(몸 가까이) 옮기고, 속도를 낮춰 주세요.' });
    } else if (load > LOAD_STOP && h.overT[i] > 0.2) {
      h.warned.add(`stop${i}`);
      out.push({ t, level: 'stop', kind: 'load', title: `${name} 과부하`, msg: `${name}의 부하가 ${Math.round(load * 100)}%예요. 로봇이 스스로 멈췄어요.`, fix: '팔을 덜 뻗거나 속도를 낮춰 주세요.' });
    } else if (load > LOAD_WARN && h.overT[i] > 0.3 && !h.warned.has(`load${i}`)) {
      h.warned.add(`load${i}`);
      out.push({ t, level: 'warn', kind: 'load', title: `${name} 부하 ${Math.round(load * 100)}%`, msg: '이대로 오래 버티면 모터가 뜨거워져요.', fix: '부품을 들고는 팔을 덜 뻗어 주세요.' });
    }
    if (h.heat[i] >= 1 && !h.warned.has(`hot${i}`)) {
      h.heat[i] = 1;
      h.warned.add(`hot${i}`);
      out.push({ t, level: 'fault', kind: 'heat', title: `${name} 모터 과열`, msg: '부하가 큰 상태로 너무 오래 움직여서 모터가 뜨거워졌어요.', fix: '[점검 · 복구] 뒤 쉬는 시간을 두고, 부하를 낮춰 주세요.' });
    } else if (h.heat[i] > 0.7 && !h.warned.has(`heat${i}`)) {
      h.warned.add(`heat${i}`);
      out.push({ t, level: 'warn', kind: 'heat', title: `${name} 모터 온도 상승`, msg: '부하가 계속 높아요.' });
    }
    if (h.heat[i] < 0.4) h.warned.delete(`heat${i}`);
    if (load < 0.6) {
      h.warned.delete(`load${i}`);
      h.warned.delete(`stop${i}`);
    }
  });
  return out;
}

/**
 * Tool tip speed above which a collision breaks the gripper, mm/s (450 mm/s at shop size). Measured:
 * straight-line moves run ~340 mm/s at speed 35 and ~490 at 50; joint moves up to ~900 at 35.
 */
export const CRASH_SPEED = 90;

/** A collision the motion check stopped at: a 정지, or a 고장 when the arm was moving fast. */
export function collisionAlert(h: Health, msg: string, t: number, at?: [number, number, number]): CellAlert {
  const fast = h.tipSpeed > CRASH_SPEED;
  if (fast) h.gripper = 'broken';
  return fast
    ? { t, level: 'fault', kind: 'collision', title: '충돌 · 그리퍼 파손', msg: `${msg} 빠르게(${toShop(h.tipSpeed)} mm/s) 부딪혀서 그리퍼가 망가졌어요.`, fix: '장비 가까이에서는 느리게, 위로 충분히 올라간 뒤 옮겨 주세요.', at }
    : { t, level: 'stop', kind: 'collision', title: '충돌 감지', msg: `${msg} ${toShop(h.tipSpeed)} mm/s로 닿아서 로봇이 멈췄어요.`, fix: '부딪힌 곳을 피해 더 높이 지나가게 해 주세요.', at };
}

/** A knock as the height a part would have fallen from to get it, shop mm. */
export function knockHeight(dv: number): number {
  return toShop((dv * dv) / (2 * 9.81) * 1000);
}
/** Falls a part takes without harm, and that break it, shop mm. */
export const DROP_WARN_MM = 60;
export const DROP_BREAK_MM = 250;

/** Severity of a part's knock: null (fine), a 주의, or broken. */
export function knockAlert(dv: number, t: number, at: [number, number, number]): CellAlert | null {
  const h = knockHeight(dv);
  if (h >= DROP_BREAK_MM) return { t, level: 'warn', kind: 'damage', title: '부품 파손', msg: `부품이 ${h} mm 높이에서 떨어진 만큼 세게 부딪혀 깨졌어요. 불량으로 세어요.`, fix: '부품은 놓을 자리 바로 위까지 내려가서 놓아 주세요.', at };
  if (h >= DROP_WARN_MM) return { t, level: 'warn', kind: 'drop', title: '부품 충격', msg: `부품이 ${h} mm 높이에서 떨어진 만큼 부딪혔어요.`, fix: '더 낮게 내려가서 놓아 주세요.', at };
  return null;
}

/** [점검 · 복구]: the cell is back in order (the broken gripper replaced, the motors cooled). */
export function repair(h: Health): void {
  h.fault = null;
  h.gripper = 'ok';
  h.heat = h.heat.map(() => 0);
  h.load = h.load.map(() => 0);
  h.overT = h.overT.map(() => 0);
  h.warned.clear();
  h.prev = null;
}
