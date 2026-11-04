/**
 * 로봇 카페 (입문 트랙): the program as 공정 카드 — no code on screen. The cards are the café's
 * process, not the arm's moves (보고 #43 §2-2; as cobots are programmed on the shop floor, function
 * blocks with values, and as a process is written in steps and the conditions to go on, GRAFCET /
 * SFC): ① 컵 → ② 얼음 → ③ 샷 → ④ 물 → ⑤ 건네기. A station card holds its amount (the order's ml
 * or shots) and opens into its moves — 놓기 → 양 정하고 시작 → [끝] 기다리기 → 집기 — each a row
 * that may be switched off where the lesson is (the wait, the door). The order (주문 층) is the
 * step's (missions.ts setup.order); the student sets the amounts to it.
 *
 * The cards are turned into the cell program (the same `robot.*` / `cell.*` lines the 실습 셀 runs),
 * so the reference programs, the checks and the real robot all stay one. `lines` / `rows` tell which
 * program lines each card and each of its rows made (the running one lights up).
 *
 * No React: RecipeCards.tsx shows them, tests/simulator/cell-f-check.mts runs the starters.
 */

import { ICED_AMERICANO, type CafeOrder } from './cafe';

export type PourKind = 'ice' | 'shot' | 'water';
export const POURS: Record<PourKind, { name: string; station: string; out: string; done: string; busy: string; unit: 'ml' | 'shot'; min: number; max: number; step: number }> = {
  ice: { name: '얼음', station: '제빙기', out: '얼음', done: '얼음 끝', busy: '얼음 나오는 중', unit: 'ml', min: 0, max: 300, step: 5 },
  shot: { name: '샷', station: '커피 머신', out: '추출 시작', done: '추출 끝', busy: '추출 중', unit: 'shot', min: 1, max: 4, step: 1 },
  water: { name: '물', station: '정수기', out: '물', done: '물 끝', busy: '물 나오는 중', unit: 'ml', min: 0, max: 300, step: 5 },
};
export const unitText = (k: PourKind, v: number) => (POURS[k].unit === 'shot' ? `${v}샷` : `${v} ml`);

export type Card = { k: 'cup' } | { k: 'station'; what: PourKind; amount: number; wait: boolean } | { k: 'serve'; door: boolean };

export interface Recipe {
  cards: Card[];
  /** How many drinks: the cards run this many times. */
  times: number;
}

/** A row inside a card: what it does, the lines it makes, and the switch it carries (if any). */
export interface Row {
  text: string;
  code: string;
  /** This row can be switched on and off (the card's `wait` or `door`); `on` = as it is now. */
  toggle?: 'wait' | 'door';
  on?: boolean;
}

/** The card's process name and its one-line summary (the closed card). */
export function cardText(c: Card): { title: string; note: string } {
  switch (c.k) {
    case 'cup':
      return { title: '컵', note: '컵 디스펜서에서 컵 받기' };
    case 'station': {
      const p = POURS[c.what];
      return { title: p.name, note: `${p.station} · ${unitText(c.what, c.amount)}` };
    }
    case 'serve':
      return { title: '건네기', note: c.door ? '픽업 1 · 픽업 문으로 손님에게' : '픽업 1에 놓기까지' };
  }
}

const CUP_CALL = 'cell.set("컵 내리기", True)\ncell.wait("컵 준비됨")\ncell.set("컵 내리기", False)\n';
const HAND_OVER = 'cell.set("픽업 문", True)\ncell.wait("문 열림")\ncell.wait("손 감지")\ncell.wait("손 감지", False)\ncell.set("픽업 문", False)\ncell.wait("문 닫힘")\n';

/** The card's rows, in order (the open card): each row's text and program lines. */
export function cardRows(c: Card): Row[] {
  switch (c.k) {
    case 'cup':
      return [
        { text: '컵 내리기 → [컵 준비됨] 기다리기', code: CUP_CALL },
        { text: '컵 집기', code: 'robot.pick("컵 나오는 곳")\n' },
      ];
    case 'station': {
      const p = POURS[c.what];
      return [
        { text: `${p.station}에 놓기`, code: `robot.place("${p.station}")\n` },
        { text: `양 ${unitText(c.what, c.amount)}으로 시작`, code: `cell.amount("${p.station}", ${c.amount})\ncell.set("${p.out}", True)\n` },
        // Not waiting: a short push (the controller needs to see the start), then on to the next row.
        c.wait
          ? { text: `[${p.done}]까지 기다리기`, code: `cell.wait("${p.done}")\ncell.set("${p.out}", False)\n`, toggle: 'wait', on: true }
          : { text: `[${p.done}]까지 기다리기`, code: `robot.wait(0.2)\ncell.set("${p.out}", False)\n`, toggle: 'wait', on: false },
        { text: `${p.station}에서 집기`, code: `robot.pick("${p.station}")\n` },
      ];
    }
    case 'serve':
      return [
        { text: '픽업 1에 놓기', code: 'robot.place("픽업 1")\n' },
        { text: '팔 빼기 (기본 자세)', code: 'robot.home()\n' },
        { text: '픽업 문 열기 → 손님이 가져갈 때까지 → 문 닫기', code: c.door ? HAND_OVER : '', toggle: 'door', on: c.door },
      ];
  }
}

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';
const indent = (s: string) => s.replace(/^(?=.)/gm, '    ');
const count = (s: string) => s.split('\n').length - 1;

/**
 * The cell program the cards make, which program lines (1-based, inclusive) each card made, and
 * each card's rows (a row that makes no line, a door switched off, spans nothing: [a, a − 1]).
 */
export function recipeCode(r: Recipe): { code: string; lines: [number, number][]; rows: [number, number][][] } {
  const loop = r.times > 1;
  let line = count(HEAD) + (loop ? 2 : 1);
  const lines: [number, number][] = [];
  const rows: [number, number][][] = [];
  let body = '';
  for (const c of r.cards) {
    const first = line;
    const spans: [number, number][] = [];
    for (const row of cardRows(c)) {
      const n = count(row.code);
      spans.push([line, line + n - 1]);
      line += n;
      body += row.code;
    }
    lines.push([first, line - 1]);
    rows.push(spans);
  }
  if (!r.cards.length) return { code: HEAD, lines, rows };
  return { code: loop ? `${HEAD}for _ in range(${r.times}):\n${indent(body)}` : `${HEAD}${body}`, lines, rows };
}

/* --- the steps' orders and cards ----------------------------------------------------------- */

/** F3's order: the menu changed by the customer (얼음 적게 · 샷 추가) — the amounts, and the cup's 355 ml. */
export const LESS_ICE_EXTRA_SHOT: CafeOrder = { name: '아이스 아메리카노', note: '얼음 적게 · 샷 추가', ice: 100, shots: 3, water: 150 };

const S = (what: PourKind, amount: number, wait = true): Card => ({ k: 'station', what, amount, wait });
const CUP: Card = { k: 'cup' };
const serve = (door: boolean): Card => ({ k: 'serve', door });
/** Cup → ice → shot → water, at an order's amounts. */
const FOUR = (o: CafeOrder): Card[] => [CUP, S('ice', o.ice), S('shot', o.shots), S('water', o.water)];
const O1 = ICED_AMERICANO;
const O3 = LESS_ICE_EXTRA_SHOT;

/** Each step's answer (the reference solution in missions.ts is made from it). */
export const RECIPE_ANSWER: Record<string, Recipe> = {
  F1: { cards: [...FOUR(O1), serve(true)], times: 1 },
  F2: { cards: [...FOUR(O1), serve(false)], times: 1 },
  F3: { cards: [...FOUR(O3), serve(false)], times: 1 },
  F4: { cards: [...FOUR(O1), serve(true)], times: 2 },
};

/**
 * What each step starts with: F1 the whole thing to watch; then a start with the step's gap
 * (F2: the shot not waited for; F3: the menu's amounts and no water; F4: no door, the 2잔 already set).
 */
export const RECIPE_START: Record<string, Recipe> = {
  F1: RECIPE_ANSWER.F1,
  F2: { cards: [CUP, S('ice', O1.ice), S('shot', O1.shots, false), S('water', O1.water), serve(false)], times: 1 },
  F3: { cards: [CUP, S('ice', O1.ice), S('shot', O1.shots), serve(false)], times: 1 },
  F4: { cards: [...FOUR(O1), serve(false)], times: 2 },
};

/** The cards to add from the palette (the menu's amounts). */
export const PALETTE: Card[] = [CUP, S('ice', O1.ice), S('shot', O1.shots), S('water', O1.water), serve(true)];
