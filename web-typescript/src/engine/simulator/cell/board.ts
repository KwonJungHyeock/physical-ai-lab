/**
 * 실습 셀 H · 보드게임 로봇 (입문 트랙 ① 생활 로봇): a desk cobot that plays 오목 (five in a row)
 * with a person on a 9 × 9 board (docs/reports/education/45-track-life-board-game-robot.md).
 *
 *  - At full size like the calligraphy booth: the arm with the suction pump on a table, the board
 *    in front of it (16 mm between lines), the robot's white stones in a tray at its right, the
 *    person across the board at −y with the black stones.
 *  - Turns: the person plays first. While it is the person's turn they think, then reach over the
 *    board (`손 감지`) and put a black stone down; when the hand is out, `로봇 차례` comes on. A white
 *    stone the robot lets go of on the board is its move, and the turn passes back. A hand over the
 *    board while the arm is low over it is an interlock stop (the café's door, the booth's card).
 *  - The board is read by the table's board sensor (the stones on it, by intersection): the robot's
 *    `판단 칸` comes from that and a rule — 이기기 → 막기 → 잇기 — the same rule a person would say
 *    out loud. `빈 칸` (the first free point) and `잇는 칸` (only its own lines) are the rules that
 *    lose: the person (always the same, a plain attacker who opens in the middle) makes five first.
 *  - Five in a row ends the game: `게임 끝` and `로봇 차례` both come on (the program can stop).
 *
 * The rules were run in node before this was built (보고 #45 §5): 빈 칸 loses at the person's 5th
 * stone, 잇는 칸 at their 5th, 이기기 → 막기 → 잇기 wins with its 6th white stone.
 *
 * No React: run.ts steps it, tests/simulator/cell-h-check.mts runs the missions headless.
 */

import { makeObject, type DeskObject } from '../desk';
import type { CellAlert } from './faults';
import { setIn, type LineState } from './line';

/** The board: 9 × 9 points, 16 mm apart; 가로 1 · 세로 1 (the person's front left) at x 136 · y −64, robot mm. */
export const BOARD = { n: 9, pitch: 16, x0: 136, y0: -64, top: 6, margin: 12 } as const;
/** A stone: 14 mm across, 5 mm high. */
export const STONE = { d: 14, h: 5, massG: 4 } as const;
export const WHITE = '#f2f1ec';
export const BLACK = '#1f2124';
/** How far off its point a stone may stand and still be on it, mm. */
export const ON_POINT_MM = 3;

/** A point of the board as the person reads it: 가로 (along x) and 세로 (along y), 1 … 9. */
export interface Pt {
  c: number;
  r: number;
}
export const pointXY = (p: Pt, origin: { x: number; y: number } = { x: BOARD.x0, y: BOARD.y0 }, pitch: number = BOARD.pitch) => ({
  x: origin.x + (p.c - 1) * pitch,
  y: origin.y + (p.r - 1) * pitch,
});
/** The nearest point to (x, y) and how far off it, mm. */
export function nearestPoint(x: number, y: number): { p: Pt; off: number } {
  const c = Math.min(BOARD.n, Math.max(1, Math.round((x - BOARD.x0) / BOARD.pitch) + 1));
  const r = Math.min(BOARD.n, Math.max(1, Math.round((y - BOARD.y0) / BOARD.pitch) + 1));
  const q = pointXY({ c, r });
  return { p: { c, r }, off: Math.hypot(x - q.x, y - q.y) };
}
export const onBoard = (x: number, y: number, pad = 0) =>
  x > BOARD.x0 - BOARD.margin - pad && x < BOARD.x0 + (BOARD.n - 1) * BOARD.pitch + BOARD.margin + pad && y > BOARD.y0 - BOARD.margin - pad && y < BOARD.y0 + (BOARD.n - 1) * BOARD.pitch + BOARD.margin + pad;

/* --- the game ------------------------------------------------------------------ */

/** 0 empty, 1 the person (black), 2 the robot (white); grid[c-1][r-1]. */
export type Grid = number[][];
const N = BOARD.n;
const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;
const inb = (c: number, r: number) => c >= 0 && r >= 0 && c < N && r < N;

/** The line through (c, r) for `who` if a stone stood there: its length and its open ends. */
function lineAt(g: Grid, c: number, r: number, who: number, dc: number, dr: number): { n: number; open: number } {
  let n = 1;
  let open = 0;
  for (const s of [1, -1]) {
    let k = 1;
    while (inb(c + s * k * dc, r + s * k * dr) && g[c + s * k * dc][r + s * k * dr] === who) k += 1;
    n += k - 1;
    const ec = c + s * k * dc;
    const er = r + s * k * dr;
    if (inb(ec, er) && g[ec][er] === 0) open += 1;
  }
  return { n, open };
}

/** The longest row of `who`'s stones on the board (the scene's 공정 띠 shows it). */
export function longest(g: Grid, who: number): number {
  let best = 0;
  for (let c = 0; c < N; c += 1)
    for (let r = 0; r < N; r += 1)
      if (g[c][r] === who)
        for (const [dc, dr] of DIRS) {
          let k = 1;
          while (inb(c + k * dc, r + k * dr) && g[c + k * dc][r + k * dr] === who) k += 1;
          best = Math.max(best, k);
        }
  return best;
}

/** Five (or more) in a row for `who`. */
export function hasFive(g: Grid, who: number): boolean {
  for (let c = 0; c < N; c += 1)
    for (let r = 0; r < N; r += 1)
      if (g[c][r] === who)
        for (const [dc, dr] of DIRS) {
          let k = 0;
          while (k < 5 && inb(c + k * dc, r + k * dr) && g[c + k * dc][r + k * dr] === who) k += 1;
          if (k >= 5) return true;
        }
  return false;
}

/** How good a point is for `who` (the lines it would make). */
function worth(g: Grid, c: number, r: number, who: number): number {
  let s = 0;
  for (const [dc, dr] of DIRS) {
    const { n, open } = lineAt(g, c, r, who, dc, dr);
    if (n >= 5) s += 100000;
    else if (n === 4) s += open === 2 ? 10000 : open === 1 ? 1000 : 0;
    else if (n === 3) s += open === 2 ? 500 : open === 1 ? 50 : 0;
    else if (n === 2) s += open === 2 ? 20 : open === 1 ? 5 : 0;
    else s += open;
  }
  return s;
}
const nearMiddle = (c: number, r: number) => -(Math.abs(c - 4) + Math.abs(r - 4)) * 0.01;
function free(g: Grid): [number, number][] {
  const e: [number, number][] = [];
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) if (!g[c][r]) e.push([c, r]);
  return e;
}
function best(g: Grid, value: (c: number, r: number) => number): [number, number] | null {
  let at: [number, number] | null = null;
  let top = -Infinity;
  for (const [c, r] of free(g)) {
    const v = value(c, r) + nearMiddle(c, r);
    if (v > top) {
      top = v;
      at = [c, r];
    }
  }
  return at;
}
function winning(g: Grid, who: number): [number, number] | null {
  for (const [c, r] of free(g)) {
    g[c][r] = who;
    const w = hasFive(g, who);
    g[c][r] = 0;
    if (w) return [c, r];
  }
  return null;
}

/** The robot's rules, as the 규칙으로 두기 card offers them (a place name the program goes to). */
export const RULES = ['빈 칸', '잇는 칸', '판단 칸'] as const;
export type Rule = (typeof RULES)[number];
export const RULE_TEXT: Record<Rule, string> = {
  '빈 칸': '빈 칸 차례대로',
  '잇는 칸': '내 돌 잇기만',
  '판단 칸': '이기기 → 막기 → 잇기',
};

/** Where the robot plays by a rule (null: the board is full). */
export function ruleMove(g: Grid, rule: Rule): Pt | null {
  let at: [number, number] | null;
  if (rule === '빈 칸') at = free(g)[0] ?? null;
  else if (rule === '잇는 칸') at = winning(g, 2) ?? best(g, (c, r) => worth(g, c, r, 2));
  else at = winning(g, 2) ?? winning(g, 1) ?? best(g, (c, r) => worth(g, c, r, 2) + 0.3 * worth(g, c, r, 1));
  return at ? { c: at[0] + 1, r: at[1] + 1 } : null;
}

/**
 * The rule as three blocks in an order the student sets (H4): 이기기 (five of mine), 막기 (the
 * person's five), 잇기 (my longest line): the first that finds a point plays it.
 * Written as the place name the program goes to: "이기기 → 막기 → 잇기".
 */
export const RULE_STEPS = ['이기기', '막기', '잇기'] as const;
export type RuleStep = (typeof RULE_STEPS)[number];
export const ruleOrderName = (order: readonly RuleStep[]) => order.join(' → ');
/** The order a place name says, or null (not an order of the three blocks, each once). */
export function parseRuleOrder(name: string): RuleStep[] | null {
  const parts = name.split('→').map((x) => x.trim());
  if (parts.length !== RULE_STEPS.length || new Set(parts).size !== parts.length) return null;
  return parts.every((x) => (RULE_STEPS as readonly string[]).includes(x)) ? (parts as RuleStep[]) : null;
}
/**
 * 막기 plays where the person would make a four (one move from five); 잇기 weighs the person's lines a
 * little, but never a four or a five (that is 막기's). Run in node (all six orders against the person
 * here): 이기기 → 막기 → 잇기 wins with its 7th white stone; 막기 first wins only at the 14th (it blocks
 * where it could have won); 잇기 before 막기 loses at the person's 5th stone.
 */
const BLOCK_AT = 1000;
const LINK_CAP = 999;
function threat(g: Grid): [number, number] | null {
  const at = best(g, (c, r) => worth(g, c, r, 1));
  return at && worth(g, at[0], at[1], 1) >= BLOCK_AT ? at : null;
}
export function orderMove(g: Grid, order: readonly RuleStep[]): Pt | null {
  for (const st of order) {
    const at = st === '이기기' ? winning(g, 2) : st === '막기' ? (winning(g, 1) ?? threat(g)) : best(g, (c, r) => worth(g, c, r, 2) + 0.3 * Math.min(worth(g, c, r, 1), LINK_CAP));
    if (at) return { c: at[0] + 1, r: at[1] + 1 };
  }
  return null;
}

/** The person: opens in the middle, then always lengthens their own lines (they never block). */
export function personMove(g: Grid): Pt | null {
  if (free(g).length === N * N) return { c: 5, r: 5 };
  const at = best(g, (c, r) => worth(g, c, r, 1));
  return at ? { c: at[0] + 1, r: at[1] + 1 } : null;
}

/* --- the board while it runs ---------------------------------------------------- */

export interface BoardDef {
  /** Inputs: the robot may move; the person's hand over the board; five in a row. */
  turn: string;
  hand: string;
  over: string;
}

export interface Stone {
  id: string;
  who: 1 | 2;
  p: Pt;
  /** How far off its point it stands, mm. */
  off: number;
  t: number;
}

export interface BoardState {
  grid: Grid;
  stones: Stone[];
  turn: 'person' | 'robot';
  /** The person's turn: thinking until `reachAt`, the stone down at `dropAt`, the hand out at `putAt`. */
  person: { reachAt: number; dropAt: number; putAt: number; move: Pt; dropped: boolean } | null;
  winner: 1 | 2 | null;
  /** Interlock stops so far (and the one going on). */
  breaches: number;
  breaching: boolean;
  /** Robot stones let go of off the board, or on a point already taken. */
  bad: { t: number; why: string }[];
  /** The robot did not wait for its turn: white stones it let go of on the board (ids), and times the arm came low over the board, in the person's turn. */
  early: string[];
  earlyOver: number;
  /** The arm was low over the board last frame. */
  overEarly: boolean;
}

const THINK_S = 8;
const HAND_S = 3;
/** The stone goes down this long after the hand starts in (then the hand goes back out), s. */
const DROP_S = 1.7;
/** The person looks this far ahead before reaching in (and waits while the arm is still over the board), s. */
const dtGuard = 0.25;

export function newBoard(t0 = 0): BoardState {
  const grid = Array.from({ length: N }, () => Array<number>(N).fill(0));
  const b: BoardState = { grid, stones: [], turn: 'person', person: null, winner: null, breaches: 0, breaching: false, bad: [], early: [], earlyOver: 0, overEarly: false };
  startPerson(b, t0);
  return b;
}

function startPerson(b: BoardState, t: number): void {
  const move = personMove(b.grid);
  b.turn = 'person';
  b.person = move ? { reachAt: t + THINK_S, dropAt: t + THINK_S + DROP_S, putAt: t + THINK_S + HAND_S, move, dropped: false } : null;
}

/** A stone at a point (x, y on the board's top). */
export const stoneAt = (who: 1 | 2, x: number, y: number, z: number = BOARD.top): DeskObject => makeObject('puck', { x, y, z }, { size: [STONE.d, STONE.d, STONE.h], color: who === 1 ? BLACK : WHITE, massG: STONE.massG });

/** The robot's stones in their tray (its grid's places). */
export const isWhite = (o: DeskObject) => o.color === WHITE && o.size[2] === STONE.h;

export interface BoardStep {
  alerts: CellAlert[];
  /** A black stone the person put down (the cell adds it to the world). */
  spawned: DeskObject[];
}

/** One frame: the person's turn, the robot's stones that came down on the board, the interlock. */
export function stepBoard(def: BoardDef, s: LineState, b: BoardState, objects: readonly DeskObject[], carry: string | null, tip: { x: number; y: number; z: number }): BoardStep {
  const out: BoardStep = { alerts: [], spawned: [] };
  const t = s.t;
  // A white stone let go of on the board in the person's turn: the robot did not wait for its turn.
  if (b.turn === 'person' && !b.winner)
    for (const o of objects) {
      if (o.id === carry || !isWhite(o) || b.early.includes(o.id) || b.stones.some((k) => k.id === o.id)) continue;
      if (!onBoard(o.x, o.y) || o.z > BOARD.top + 1.5) continue;
      b.early.push(o.id);
      out.alerts.push({ t, level: 'warn', kind: 'order', title: '차례가 아닐 때 둔 돌', msg: '사람 차례인데 흰 돌을 뒀어요. [로봇 차례]가 켜질 때까지 기다려야 해요.' });
    }
  // The robot's move: a white stone let go of, resting on the board, not counted yet.
  if (b.turn === 'robot' && !b.winner) {
    for (const o of objects) {
      if (o.id === carry || !isWhite(o) || b.stones.some((k) => k.id === o.id)) continue;
      if (!onBoard(o.x, o.y) || o.z > BOARD.top + 1.5) continue;
      const { p, off } = nearestPoint(o.x, o.y);
      if (b.grid[p.c - 1][p.r - 1]) {
        b.bad.push({ t, why: `가로 ${p.c} · 세로 ${p.r}에는 이미 돌이 있어요` });
        out.alerts.push({ t, level: 'warn', kind: 'order', title: '이미 돌이 있는 칸', msg: `가로 ${p.c} · 세로 ${p.r}에는 이미 돌이 있어요. 빈 칸에 둬야 해요.` });
      }
      if (off > ON_POINT_MM) out.alerts.push({ t, level: 'warn', kind: 'order', title: '줄에서 벗어난 돌', msg: `흰 돌이 가로 ${p.c} · 세로 ${p.r} 교차점에서 ${off.toFixed(1)} mm 벗어났어요. 칸 간격을 판 눈금으로 다시 재 보세요.` });
      b.stones.push({ id: o.id, who: 2, p, off, t });
      if (!b.grid[p.c - 1][p.r - 1]) b.grid[p.c - 1][p.r - 1] = 2;
      if (hasFive(b.grid, 2)) b.winner = 2;
      else startPerson(b, t);
      break;
    }
  }
  // The person's turn: they wait for the arm to be clear of the board before they reach in, put the stone, take the hand out.
  const armNear = onBoard(tip.x, tip.y, 20) && tip.z < 90;
  if (b.person && t < b.person.reachAt + dtGuard && t + dtGuard >= b.person.reachAt && armNear) {
    b.person.reachAt = t + dtGuard;
    b.person.dropAt = b.person.reachAt + DROP_S;
    b.person.putAt = b.person.reachAt + HAND_S;
  }
  const hand = !!b.person && t >= b.person.reachAt && !b.winner;
  if (b.person && !b.person.dropped && t >= b.person.dropAt && !b.winner) {
    const { move } = b.person;
    const q = pointXY(move);
    const o = stoneAt(1, q.x, q.y);
    out.spawned.push(o);
    b.stones.push({ id: o.id, who: 1, p: move, off: 0, t });
    b.grid[move.c - 1][move.r - 1] = 1;
    b.person.dropped = true;
    if (hasFive(b.grid, 1)) {
      b.winner = 1;
      out.alerts.push({ t, level: 'warn', kind: 'order', title: '사람이 이겼어요', msg: '사람이 검은 돌 5개를 먼저 이었어요. 막아야 할 칸을 먼저 둬야 해요.' });
    }
  }
  if (b.person && t >= b.person.putAt) {
    b.person = null;
    if (!b.winner) b.turn = 'robot';
  }
  setIn(s, def.hand, hand && !!b.person);
  setIn(s, def.turn, b.turn === 'robot' || !!b.winner);
  setIn(s, def.over, !!b.winner);
  // The interlock: the arm low over the board while the person's hand is there.
  const over = onBoard(tip.x, tip.y, 6) && tip.z < 50;
  if (over && hand && b.person && !b.breaching) {
    b.breaching = true;
    b.breaches += 1;
    out.alerts.push({
      t,
      level: 'stop',
      kind: 'safety',
      title: '사람 손이 판 위에 있어요',
      msg: '사람이 돌을 두는 동안 팔이 판 위로 와서 멈췄어요. [로봇 차례]가 켜질 때까지 기다려야 해요.',
    });
  }
  if (!over || !hand) b.breaching = false;
  // Coming over the board in the person's turn (hand there or not): it did not wait for [로봇 차례].
  // (Still over it as the turn passes, just after its own stone, is not that.)
  if (over && !b.overEarly && b.turn === 'person' && !b.winner) {
    b.earlyOver += 1;
    if (!hand) out.alerts.push({ t, level: 'warn', kind: 'order', title: '차례가 아닐 때 판 위로', msg: '사람 차례인데 팔이 판 위로 왔어요. [로봇 차례]가 켜질 때까지 기다려야 해요.' });
  }
  b.overEarly = over;
  return out;
}

/** The robot's stones on the board so far. */
export const robotStones = (b: BoardState) => b.stones.filter((k) => k.who === 2);
