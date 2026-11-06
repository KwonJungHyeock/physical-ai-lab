/**
 * 보드게임 로봇 (입문 트랙): the program as 공정 카드 — no code on screen (보고 #45; as the process cards go,
 * cafeMenu.ts): ① 판 (where the board is and how far apart its lines are: 보정) → ② 한 수 (one
 * of the robot's moves: wait for its turn → take a white stone → put it on a point, 가로 · 세로, or
 * where a rule says, the board sensor reading the stones → the arm out). A game is one 한 수 card
 * repeated; each card opens into its rows, the wait a switch. The cards become the cell program
 * (`robot.pick` · `robot.move_to` · `robot.pump.off()` · `robot.place`), so the checks and the real
 * robot stay one. `lines` / `rows` tell which program lines each card and row made.
 *
 * No React: BoardCards.tsx shows them, tests/simulator/cell-h-check.mts runs the starters.
 */

import { BOARD, RULE_TEXT, STONE, type Pt, type Rule } from './board';

export type BoardCard = { k: 'board'; x: number; y: number; pitch: number } | { k: 'move'; wait: boolean; c: number; r: number; rule: Rule | null };

export interface BoardRecipe {
  cards: BoardCard[];
  /** How many of the robot's moves: the cards run this many times (a game stops at its end). */
  times: number;
}

/** The line spacings a card can be set to, mm. */
export const PITCH_MM = { min: 10, max: 24 } as const;

/** A row inside a card: what it does, the lines it makes, and the switch it carries (if any). */
export interface BoardRow {
  text: string;
  code: string;
  toggle?: 'wait';
  on?: boolean;
}

/** The card's process name and its one-line summary (the closed card). */
export function boardCardText(c: BoardCard): { title: string; note: string } {
  switch (c.k) {
    case 'board':
      return { title: '판', note: `가로 1 · 세로 1: x ${c.x} · y ${c.y} mm, 줄 사이 ${c.pitch} mm` };
    case 'move':
      return { title: '한 수', note: c.rule ? `규칙 '${RULE_TEXT[c.rule]}'로 두기` : `가로 ${c.c} · 세로 ${c.r}에 두기` };
  }
}

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';
const r1 = (v: number) => String(Math.round(v * 10) / 10);
const to = (x: number, y: number, z: number) => `robot.move_to(${r1(x)}, ${r1(y)}, ${r1(z)})\n`;
/** Travel height over the board, and where the tool lets a stone go (on its top), mm. */
const TRAVEL_Z = 40;
const DROP_Z = BOARD.top + STONE.h + 1;

interface Settings {
  x: number;
  y: number;
  pitch: number;
}

function rowsWith(c: BoardCard, s: Settings, loop: boolean): BoardRow[] {
  switch (c.k) {
    case 'board':
      Object.assign(s, { x: c.x, y: c.y, pitch: c.pitch });
      return [
        { text: `가로 1 · 세로 1 교차점: x ${c.x} · y ${c.y} mm`, code: '' },
        { text: `줄 사이 간격: ${c.pitch} mm`, code: '' },
      ];
    case 'move': {
      const x = s.x + (c.c - 1) * s.pitch;
      const y = s.y + (c.r - 1) * s.pitch;
      return [
        // In a game (the cards repeated), the end is checked once it is the robot's turn.
        { text: '[로봇 차례]까지 기다리기', code: c.wait ? `cell.wait("로봇 차례")\n${loop ? 'if cell.is_on("게임 끝"):\n    break\n' : ''}` : '', toggle: 'wait', on: c.wait },
        { text: '흰 돌 집기 (돌 상자)', code: 'robot.pick("돌 상자 다음 칸")\n' },
        c.rule
          ? { text: `판 센서로 읽고 '${RULE_TEXT[c.rule]}'로 두기`, code: `robot.place("${c.rule}")\n` }
          : { text: `가로 ${c.c} · 세로 ${c.r}에 두기 (x ${r1(x)} · y ${r1(y)})`, code: to(x, y, TRAVEL_Z) + to(x, y, DROP_Z) + 'robot.pump.off()\n' + to(x, y, TRAVEL_Z) },
        { text: '팔 빼기 (기본 자세)', code: 'robot.home()\n' },
      ];
    }
  }
}

/** The card's rows as the screen shows them (on the board's own lines, or as the 판 card before it says). */
export function boardRows(cards: readonly BoardCard[], k: number, loop: boolean): BoardRow[] {
  const s: Settings = { x: BOARD.x0, y: BOARD.y0, pitch: BOARD.pitch };
  for (let i = 0; i < k; i += 1) rowsWith(cards[i], s, loop);
  return rowsWith(cards[k], s, loop);
}

const indent = (s: string) => s.replace(/^(?=.)/gm, '    ');
const count = (s: string) => s.split('\n').length - 1;

/** The cell program the cards make, which program lines (1-based, inclusive) each card and row made ([0, -1]: none — a setting, or the wait off). */
export function boardCode(r: BoardRecipe): { code: string; lines: [number, number][]; rows: [number, number][][] } {
  const s: Settings = { x: BOARD.x0, y: BOARD.y0, pitch: BOARD.pitch };
  const loop = r.times > 1;
  let line = count(HEAD) + (loop ? 2 : 1);
  const lines: [number, number][] = [];
  const rows: [number, number][][] = [];
  let body = '';
  for (const c of r.cards) {
    const first = line;
    const spans: [number, number][] = [];
    for (const row of rowsWith(c, s, loop)) {
      const n = count(row.code);
      spans.push(n ? [line, line + n - 1] : [0, -1]);
      line += n;
      body += row.code;
    }
    lines.push(line > first ? [first, line - 1] : [0, -1]);
    rows.push(spans);
  }
  if (!body) return { code: HEAD, lines, rows };
  return { code: loop ? `${HEAD}for _ in range(${r.times}):\n${indent(body)}` : `${HEAD}${body}`, lines, rows };
}

/* --- the steps' cards -------------------------------------------------------------- */

const BOARD_CARD: BoardCard = { k: 'board', x: BOARD.x0, y: BOARD.y0, pitch: BOARD.pitch };
const move = (p: Pt, wait = true): BoardCard => ({ k: 'move', wait, c: p.c, r: p.r, rule: null });
const byRule = (rule: Rule): BoardCard => ({ k: 'move', wait: true, c: 5, r: 5, rule });

/** Each step's answer (its reference solution in missions.ts is this program). */
export const H_ANSWER: Record<string, BoardRecipe> = {
  H1: { cards: [BOARD_CARD, move({ c: 5, r: 4 })], times: 1 },
  H2: { cards: [BOARD_CARD, move({ c: 7, r: 6 })], times: 1 },
  H3: { cards: [BOARD_CARD, move({ c: 5, r: 4 }), move({ c: 6, r: 4 })], times: 1 },
  H4: { cards: [BOARD_CARD, byRule('판단 칸')], times: 9 },
};

/**
 * What each step starts with: H1 the whole thing to watch; then the step's gap (H2: 15 mm between
 * the lines, the board's are 16; H3: no waiting for the turn; H4: the first free point, 9 moves set).
 */
export const H_START: Record<string, BoardRecipe> = {
  H1: H_ANSWER.H1,
  H2: { cards: [{ ...BOARD_CARD, pitch: 15 }, move({ c: 7, r: 6 })], times: 1 },
  H3: { cards: [BOARD_CARD, move({ c: 5, r: 4 }, false), move({ c: 6, r: 4 }, false)], times: 1 },
  H4: { cards: [BOARD_CARD, byRule('빈 칸')], times: 9 },
};

/** The cards to add from the palette. */
export const BOARD_PALETTE: BoardCard[] = [BOARD_CARD, move({ c: 5, r: 4 }), byRule('판단 칸')];
