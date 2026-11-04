/**
 * 실습 셀 F · 로봇 카페 (입문 트랙 ① 생활 로봇): the equipment of a robot café, as the real ones work
 * (docs/reports/education/43-track-life-robot-cafe.md): the arm carries a cup from the cup
 * dispenser to the ice maker, the coffee machine and the water dispenser, then to the pickup shelf
 * behind a door the customer opens.
 *
 *  - Every station is a small state machine driven by one output and read through inputs, as the
 *    café's controller sees it: a cup sensor under the spout, '… 중' while it pours, '… 끝' when done
 *    (a cup sensor + state machine, as in the Cal Poly smart espresso machine, ref. [11]).
 *  - A station started with no cup under it pours onto the drip tray (입문: the mistake is shown; a
 *    real machine refuses — the concept card says so). A cup taken away mid-pour: what is left spills.
 *  - The drink is measured in the cup (ml at shop size): ice, espresso, water; more than the cup
 *    holds overflows. The amounts are a tall iced americano (ref. [13]): ice 145, 2 shots 60, water 150.
 *  - The pickup door (an actuator) is the line between the arm and the customer: with the door open
 *    the arm must not reach in (an interlock stop, ISO 10218 / ISO/TS 15066 idea, ref. [15]); the
 *    customer takes a finished drink a moment after the door opens, then the door may close.
 *
 * Times are real café times (espresso 28 s, ref. [14]); the simulator's ×2 · ×4 speeds shorten the wait.
 * No React: run.ts steps it, tests/simulator/cafe-check.mts runs the missions headless.
 */

import { makeObject, type DeskObject } from '../desk';
import type { CellAlert } from './faults';
import { setIn, type LineState } from './line';
import type { CellLayout } from './cells';

/** What is in a cup, ml (shop size). */
export interface Drink {
  ice: number;
  shot: number;
  water: number;
  /** Poured but spilled over the rim, ml. */
  spilled: number;
}

/** A 12 oz (355 ml) cold cup: Ø90 × 120 mm at shop size, drawn at 1/5. */
export const CUP_ML = 355;
export const CUP_SIZE: [number, number, number] = [18, 18, 24];
/** A tall iced americano (ref. [13]): what each station pours once. */
export const RECIPE: Drink = { ice: 145, shot: 60, water: 150, spilled: 0 };
/** One espresso shot, ml (a double = 60 ml in 28 s). */
export const SHOT_ML = 30;

/**
 * An order, as the café's order screen sends it (주문 층): the drink and its amounts. The robot's
 * program sets each station's amount (cell.amount) before starting it, as a café controller sends
 * the recipe's portion to a machine; the drink handed over is judged against this order.
 */
export interface CafeOrder {
  name: string;
  /** What the customer asked for on top of the menu (shown with the name), e.g. '얼음 적게 · 샷 추가'. */
  note?: string;
  ice: number;
  shots: number;
  water: number;
}
export const ICED_AMERICANO: CafeOrder = { name: '아이스 아메리카노', ice: RECIPE.ice, shots: RECIPE.shot / SHOT_ML, water: RECIPE.water };
/** The order's drink in ml. */
export const orderDrink = (o: CafeOrder): Drink => ({ ice: o.ice, shot: o.shots * SHOT_ML, water: o.water, spilled: 0 });
export const orderName = (o: CafeOrder) => (o.note ? `${o.name} (${o.note})` : o.name);

export interface StationDef {
  /** The station's name on screen. */
  name: string;
  /** The output that starts it (a push; it pours to the end once started). */
  output: string;
  /** Where the cup stands under its spout. */
  place: string;
  /** Inputs: a cup under the spout · pouring · done (on until the next start or the cup is taken). */
  cup: string;
  busy: string;
  done: string;
  timeS: number;
  pours: keyof Omit<Drink, 'spilled'>;
  ml: number;
  /** The amount the program sets (cell.amount): ml, or shots (SHOT_ML each); timeS is for `ml`. */
  unit: 'ml' | 'shot';
  /** What cell.amount may set, in the unit. */
  range: [number, number];
}

export interface CafeDef {
  dispenser: { output: string; place: string; ready: string; stock: number };
  stations: StationDef[];
  pickup: { places: string[]; door: string; open: string; closed: string; hand: string; zone: { min: [number, number]; max: [number, number] } };
}

export interface StationState {
  /** Time poured so far, s (null: idle). */
  t: number | null;
  /** The cup it pours into (null: none — onto the tray). */
  cup: string | null;
  /** This pour: ml and how long it takes (the amount set when it started). */
  ml: number;
  timeS: number;
  /** The output a frame ago (a start is its rising edge). */
  was: boolean;
}

export interface Served {
  t: number;
  drink: Drink;
  /** ok: the recipe, nothing spilled. */
  ok: boolean;
  /** What was wrong, for the screen. */
  why: string;
}

export interface CafeState {
  stations: Record<string, StationState>;
  /** Cups left in the dispenser, and how many it has let down. */
  stock: number;
  dropped: number;
  dropWas: boolean;
  /** Spills onto a drip tray (a station run with no cup) and over a rim, by station. */
  trayPours: string[];
  /** Drinks the customer took, in order. */
  served: Served[];
  /** Orders waiting (the screen's queue). */
  orders: number;
  /** The customer's hand is in the pickup (after the door opened with a drink there), until s. */
  handUntil: number | null;
  /** The arm reached into the pickup while the door was open (counted once per time). */
  doorBreaches: number;
  breaching: boolean;
  /** The order being made (every cup of it the same). */
  order: CafeOrder;
  /** Each station's amount as the program set it (cell.amount), in its unit, by station name. */
  amount: Record<string, number>;
}

export function newCafe(def: CafeDef, orders: number, order: CafeOrder = ICED_AMERICANO): CafeState {
  const stations = Object.fromEntries(def.stations.map((s) => [s.output, { t: null, cup: null, was: false, ml: s.ml, timeS: s.timeS }]));
  const amount = Object.fromEntries(def.stations.map((s) => [s.name, s.unit === 'shot' ? s.ml / SHOT_ML : s.ml]));
  return { stations, stock: def.dispenser.stock, dropped: 0, dropWas: false, trayPours: [], served: [], orders, handUntil: null, doorBreaches: 0, breaching: false, order, amount };
}

/** What a station pours now: the amount set (ml), and the time it takes at the station's own rate. */
export function stationPour(st: StationDef, c: CafeState): { ml: number; timeS: number } {
  const a = c.amount[st.name] ?? (st.unit === 'shot' ? st.ml / SHOT_ML : st.ml);
  const ml = st.unit === 'shot' ? a * SHOT_ML : a;
  return { ml, timeS: (st.timeS * ml) / st.ml };
}

export const emptyDrink = (): Drink => ({ ice: 0, shot: 0, water: 0, spilled: 0 });
export const drinkMl = (d: Drink) => d.ice + d.shot + d.water;

/** How a drink compares with the order: ok, or what is off (one line, the first thing to fix). */
export function drinkVerdict(d: Drink | undefined, o: CafeOrder = ICED_AMERICANO): { ok: boolean; why: string } {
  const want = orderDrink(o);
  if (!d || drinkMl(d) === 0) return { ok: false, why: '빈 컵이에요' };
  if (d.spilled >= 1) return { ok: false, why: `컵이 넘쳤어요 (${Math.round(d.spilled)} ml)` };
  const off = (k: 'shot' | 'ice' | 'water', name: string, none: string, less: string) => {
    const got = Math.round(d[k]);
    if (want[k] > 0 && got < 1) return none;
    if (got < want[k] - 1) return `${less} (${got} / ${want[k]} ml)`;
    if (got > want[k] + 1) return `${name}이 많아요 (${got} / ${want[k]} ml)`;
    return null;
  };
  const why = off('shot', '샷', '커피가 없어요', '샷이 덜 들어갔어요') ?? off('ice', '얼음', '얼음이 없어요 (뜨거운 커피가 됐어요)', '얼음이 덜 들어갔어요') ?? off('water', '물', '물이 없어요 (너무 진해요)', '물이 덜 들어갔어요 (진해요)');
  return why ? { ok: false, why } : { ok: true, why: `${o.name} 완성` };
}

const near = (o: DeskObject, p: { x: number; y: number; z: number }) => Math.hypot(o.x - p.x, o.y - p.y) < 8 && Math.abs(o.z - p.z) < 6;

export interface CafeStep {
  spawned: DeskObject[];
  /** Cups the customer took (the caller removes them from the world). */
  taken: string[];
  alerts: CellAlert[];
}

/**
 * One frame of the café. `parts`: the cups where they are; `carried`: the one in the gripper;
 * `tip`: the tool tip now (the door interlock).
 */
export function stepCafe(l: CellLayout, def: CafeDef, s: LineState, c: CafeState, parts: readonly DeskObject[], dt: number, carried: string | null, tip: { x: number; y: number; z: number }): CafeStep {
  const out: CafeStep = { spawned: [], taken: [], alerts: [] };
  const t = s.t;
  const free = parts.filter((p) => p.id !== carried);
  const at = (place: string) => free.find((p) => near(p, l.places[place]));

  // The cup dispenser: each start lets one cup down onto its shelf, if the shelf is clear.
  const dp = def.dispenser;
  const dOn = !!s.out[dp.output];
  const shelf = at(dp.place);
  if (dOn && !c.dropWas) {
    if (c.stock <= 0) out.alerts.push({ t, level: 'warn', kind: 'order', title: '컵이 떨어졌어요', msg: '컵 디스펜서가 비었어요. 컵을 채워야 해요.' });
    else if (shelf) out.alerts.push({ t, level: 'info', kind: 'order', title: '컵이 이미 있어요', msg: '컵 나오는 곳에 컵이 있어 새 컵을 내리지 않았어요.' });
    else {
      const p = l.places[dp.place];
      out.spawned.push(makeObject('cup', { x: p.x, y: p.y, z: p.z + 0.3 }, { size: [...CUP_SIZE], color: '#f3efe6', massG: 12, drink: emptyDrink() }));
      c.stock -= 1;
      c.dropped += 1;
    }
  }
  c.dropWas = dOn;
  setIn(s, dp.ready, !!shelf || out.spawned.length > 0);

  // The stations: a cup sensor; a start pours for timeS into the cup there (or onto the tray).
  for (const st of def.stations) {
    const ss = c.stations[st.output];
    const cup = at(st.place);
    setIn(s, st.cup, !!cup);
    const on = !!s.out[st.output];
    if (on && !ss.was && ss.t === null) {
      ss.t = 0;
      ss.cup = cup?.id ?? null;
      Object.assign(ss, stationPour(st, c));
      setIn(s, st.done, false);
      if (!cup) {
        c.trayPours.push(st.name);
        out.alerts.push({ t, level: 'warn', kind: 'order', title: `${st.name}: 컵이 없어요`, msg: `컵 없이 시작해서 받침대로 쏟아졌어요. 실제 기계는 컵 감지 센서가 꺼져 있으면 시작하지 않아요.` });
      }
    }
    ss.was = on;
    if (ss.t !== null) {
      const before = ss.t;
      ss.t = Math.min(ss.timeS, ss.t + dt);
      const share = ss.timeS > 0 ? ((ss.t - before) / ss.timeS) * ss.ml : 0;
      const target = ss.cup ? parts.find((p) => p.id === ss.cup) : undefined;
      // The cup is still under the spout: it fills (an overflow spills); taken away, the rest spills.
      if (target && near(target, l.places[st.place]) && target.id !== carried) {
        const d = (target.drink ??= emptyDrink());
        const room = Math.max(0, CUP_ML - drinkMl(d));
        d[st.pours] += Math.min(room, share);
        // (Rounding: a cup filled exactly to the brim is not an overflow.)
        if (share > room + 0.01) {
          if (d.spilled === 0) out.alerts.push({ t, level: 'warn', kind: 'order', title: '컵이 넘쳤어요', msg: `${st.name}에서 컵(${CUP_ML} ml)보다 많이 부어 넘쳤어요.` });
          d.spilled += share - room;
        }
      } else if (ss.cup) {
        ss.cup = null;
        c.trayPours.push(st.name);
        out.alerts.push({ t, level: 'warn', kind: 'order', title: `${st.name}: 붓는 중에 컵이 빠졌어요`, msg: `'${st.done}'을 기다리지 않고 컵을 옮겨 나머지가 쏟아졌어요.` });
      }
      if (ss.t >= ss.timeS) {
        ss.t = null;
        ss.cup = null;
        setIn(s, st.done, true);
      }
    }
    // Done holds until the cup is taken away.
    if (s.in[st.done] && !cup && ss.t === null) setIn(s, st.done, false);
    setIn(s, st.busy, ss.t !== null);
  }

  // The pickup: door (an actuator: s.act), the customer's hand, the interlock.
  const pk = def.pickup;
  const open = (s.act[pk.door] ?? 0) >= 1;
  const drinkThere = pk.places.map(at).find((p) => p && p.drink && drinkMl(p.drink) > 0);
  if (open && drinkThere && c.handUntil === null) c.handUntil = t + 2;
  const hand = c.handUntil !== null && t < c.handUntil;
  setIn(s, pk.hand, hand);
  if (c.handUntil !== null && t >= c.handUntil) {
    // The customer has taken the drink(s) on the shelf.
    for (const name of pk.places) {
      const p = at(name);
      if (!p) continue;
      const v = drinkVerdict(p.drink, c.order);
      c.served.push({ t, drink: { ...(p.drink ?? emptyDrink()) }, ok: v.ok, why: v.why });
      c.orders = Math.max(0, c.orders - 1);
      out.taken.push(p.id);
    }
    c.handUntil = null;
  }
  const z = pk.zone;
  const inside = tip.x > z.min[0] && tip.x < z.max[0] && tip.y > z.min[1] && tip.y < z.max[1];
  const opening = (s.act[pk.door] ?? 0) > 0;
  if (inside && opening && !c.breaching) {
    c.breaching = true;
    c.doorBreaches += 1;
    out.alerts.push({ t, level: 'stop', kind: 'safety', title: '픽업 문이 열려 있어요', msg: hand ? '손님 손이 있는 픽업대에 팔이 들어가 멈췄어요.' : '문이 열린 픽업대에 팔이 들어가 멈췄어요. 문을 닫고 넣어야 해요.' });
  }
  if (!inside) c.breaching = false;
  return out;
}
