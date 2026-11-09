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
  /** Hot water went in (the water dispenser's 온수). */
  warm?: boolean;
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
  /** The water is hot (온수): a hot drink, no ice. */
  hot?: boolean;
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
  pours: 'ice' | 'shot' | 'water';
  ml: number;
  /** The amount the program sets (cell.amount): ml, or shots (SHOT_ML each); timeS is for `ml`. */
  unit: 'ml' | 'shot';
  /** What cell.amount may set, in the unit. */
  range: [number, number];
  /** It pours hot water (the water dispenser's 온수). */
  hot?: boolean;
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

/** One customer's order in the queue (주문 대기열): which menu (1 …), when it came, and whether its cup is under way. */
export interface QueuedOrder {
  id: number;
  menu: number;
  at: number;
  started: boolean;
}

/**
 * 운영 모드: customers keep coming (a seeded random stream, so a class gets the same customers):
 * how many, the gap between two (s, a range), which menus they ask for (weights, menu 1 …), and
 * how long one waits for the robot to start their drink before leaving (s).
 */
export interface CafeSpawn {
  seed: number;
  customers: number;
  gap: [number, number];
  mix?: number[];
  patience: number;
}

export interface Served {
  t: number;
  /** The menu ordered (1 …) and how long the customer waited from ordering, s. */
  menu: number;
  waited: number;
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
  /** The café's menus as the program registered them (cell.menu, 1 …): a drink is judged against its order's menu. */
  menus: (CafeOrder | undefined)[];
  /** Orders not handed over yet, oldest first. */
  queue: QueuedOrder[];
  nextId: number;
  /** 운영 모드: the stream of customers, the next arrival, how many have come and how many gave up waiting. */
  spawn: CafeSpawn | null;
  rng: number;
  nextAt: number;
  came: number;
  left: number;
  /** Customers who went (the scene walks them out): served (happy if the drink was right) or gave up. */
  exits: { id: number; menu: number; t: number; happy: boolean }[];
}

/** A small seeded random generator (mulberry32): the same seed, the same customers. */
function rand(c: CafeState): number {
  c.rng = (c.rng + 0x6d2b79f5) | 0;
  let t = c.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The menu an order is judged against: the program's (cell.menu), else the step's order. */
export const menuOf = (c: CafeState, menu: number): CafeOrder => c.menus[menu - 1] ?? (menu === 1 ? c.order : c.order);

/**
 * A café at the start of a step: `orders` customers already waiting (each for menu `queue[k]`, default
 * menu 1), or — 운영 모드 — a stream of customers (`spawn`).
 */
export function newCafe(def: CafeDef, orders: number, order: CafeOrder = ICED_AMERICANO, opts: { queue?: number[]; spawn?: CafeSpawn } = {}): CafeState {
  const stations = Object.fromEntries(def.stations.map((s) => [s.output, { t: null, cup: null, was: false, ml: s.ml, timeS: s.timeS }]));
  const amount = Object.fromEntries(def.stations.map((s) => [s.name, s.unit === 'shot' ? s.ml / SHOT_ML : s.ml]));
  const menus = opts.spawn ? [] : (opts.queue ?? Array<number>(orders).fill(1));
  const queue = menus.map((menu, k) => ({ id: k + 1, menu, at: 0, started: false }));
  const spawn = opts.spawn ?? null;
  return {
    stations,
    stock: def.dispenser.stock,
    dropped: 0,
    dropWas: false,
    trayPours: [],
    served: [],
    orders: spawn ? spawn.customers : queue.length,
    handUntil: null,
    doorBreaches: 0,
    breaching: false,
    order,
    amount,
    menus: [],
    queue,
    nextId: queue.length + 1,
    spawn,
    rng: spawn?.seed ?? 1,
    nextAt: 2,
    came: queue.length,
    left: 0,
    exits: [],
  };
}

/** The café's order inputs (the order screen, as the robot's controller reads it). */
export const ORDER_INPUTS = { next: '주문 확인', closed: '영업 끝', menu: (k: number) => `주문 ${k}` } as const;
export const MENU_SLOTS = 3;

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
  const temp = o.hot && d.water > 0 && !d.warm ? '찬물이 들어갔어요 (따뜻한 메뉴예요)' : !o.hot && d.warm ? '뜨거운 물이 들어갔어요 (차가운 메뉴예요)' : null;
  const why =
    off('shot', '샷', '커피가 없어요', '샷이 덜 들어갔어요') ??
    off('ice', '얼음', o.hot ? '얼음이 없어요' : '얼음이 없어요 (뜨거운 커피가 됐어요)', '얼음이 덜 들어갔어요') ??
    off('water', '물', '물이 없어요 (너무 진해요)', '물이 덜 들어갔어요 (진해요)') ??
    temp;
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

  // 운영 모드: the next customer comes; one who has waited too long for their drink to start goes.
  const sp = c.spawn;
  if (sp && c.came < sp.customers && t >= c.nextAt) {
    const n = Math.max(1, c.menus.filter(Boolean).length);
    const w = (sp.mix ?? []).slice(0, n);
    const weights = w.length === n ? w : Array<number>(n).fill(1);
    let r = rand(c) * weights.reduce((a, b) => a + b, 0);
    let menu = 1;
    for (let k = 0; k < n; k += 1) {
      r -= weights[k];
      if (r <= 0) {
        menu = k + 1;
        break;
      }
    }
    c.queue.push({ id: c.nextId, menu, at: t, started: false });
    c.nextId += 1;
    c.came += 1;
    c.nextAt = t + sp.gap[0] + rand(c) * (sp.gap[1] - sp.gap[0]);
  }
  if (sp)
    for (const o of c.queue.filter((q) => !q.started && t - q.at > sp.patience)) {
      c.queue.splice(c.queue.indexOf(o), 1);
      c.left += 1;
      c.exits.push({ id: o.id, menu: o.menu, t, happy: false });
      c.orders = Math.max(0, c.orders - 1);
      out.alerts.push({ t, level: 'info', kind: 'order', title: '손님이 기다리다 갔어요', msg: `${menuOf(c, o.menu).name} 주문이 ${Math.round(sp.patience)}초 넘게 시작되지 않았어요.` });
    }
  // The order screen: an order to make (or the day is over), and which menu it is.
  const pending = c.queue.find((q) => !q.started);
  const closed = !pending && (!sp || c.came >= sp.customers);
  setIn(s, ORDER_INPUTS.next, !!pending || closed);
  setIn(s, ORDER_INPUTS.closed, closed);
  for (let k = 1; k <= MENU_SLOTS; k += 1) setIn(s, ORDER_INPUTS.menu(k), pending?.menu === k);
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
      // The cup is for the first order not started yet: it carries that number (the 번호표).
      const next = c.queue.find((q) => !q.started);
      if (next) next.started = true;
      out.spawned.push(makeObject('cup', { x: p.x, y: p.y, z: p.z + 0.3 }, { size: [...CUP_SIZE], color: '#f3efe6', massG: 12, drink: { ...emptyDrink(), ...(next && sp ? { order: next.id } : {}) } }));
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
        if (st.hot && share > 0) d.warm = true;
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
      // Each customer takes the cup with their number (a cup without one: the oldest order under way,
      // or, with none marked, the oldest one).
      const mine = p.drink?.order === undefined ? -1 : c.queue.findIndex((q) => q.id === p.drink!.order);
      const k =
        mine >= 0
          ? mine
          : Math.max(
              0,
              c.queue.findIndex((q) => q.started),
            );
      const o = c.queue.splice(k, 1)[0] ?? { id: 0, menu: 1, at: 0, started: true };
      const v = drinkVerdict(p.drink, menuOf(c, o.menu));
      c.served.push({ t, menu: o.menu, waited: t - o.at, drink: { ...(p.drink ?? emptyDrink()) }, ok: v.ok, why: v.why });
      c.exits.push({ id: o.id, menu: o.menu, t, happy: v.ok });
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
