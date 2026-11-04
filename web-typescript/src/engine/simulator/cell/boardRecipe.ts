/**
 * 보드게임 로봇 (입문 트랙): the program as 작업 순서 카드 — no code on screen. Each card is one thing
 * the robot does or one setting it works with (보고 #45): wait for its turn, where the board is and
 * how far apart its lines are, take a white stone from the tray, put it on a point (가로 · 세로), put
 * it where a rule says (the board sensor reads the stones), go home. The cards become the cell
 * program (`robot.pick` · `robot.move_to` · `robot.pump.off()` · `robot.place`), so the checks and
 * the real robot stay one. `lines` tells which program lines each card made (the running card lights).
 *
 * No React: BoardCards.tsx shows them, tests/simulator/cell-h-check.mts runs the starters.
 */

import { BOARD, RULE_TEXT, STONE, type Pt, type Rule } from './board';

export type BoardCard = { k: 'wait' } | { k: 'board'; x: number; y: number; pitch: number } | { k: 'take' } | { k: 'put'; c: number; r: number } | { k: 'rule'; rule: Rule } | { k: 'home' };

export interface BoardRecipe {
  cards: BoardCard[];
  /** How many of the robot's moves: the cards run this many times (a game stops at its end). */
  times: number;
}

/** The line spacings a card can be set to, mm. */
export const PITCH_MM = { min: 10, max: 24 } as const;

/** The card's title and what it does, for the screen. */
export function boardCardText(c: BoardCard): { title: string; note: string } {
  switch (c.k) {
    case 'wait':
      return { title: '차례 기다리기', note: '사람이 돌을 두고 손을 뺄 때까지 ([로봇 차례])' };
    case 'board':
      return { title: '판 위치 · 칸 간격', note: `가로 1 · 세로 1: x ${c.x} · y ${c.y} mm, 줄 사이 ${c.pitch} mm` };
    case 'take':
      return { title: '흰 돌 집기', note: '돌 상자에서 다음 돌을 흡착해 들어요' };
    case 'put':
      return { title: `가로 ${c.c} · 세로 ${c.r}에 두기`, note: '판 위치와 칸 간격으로 그 점의 좌표를 계산해요' };
    case 'rule':
      return { title: '규칙으로 두기', note: `판 센서로 돌을 읽고 '${RULE_TEXT[c.rule]}'로 칸을 골라요` };
    case 'home':
      return { title: '기본 자세로', note: '팔을 판 위에서 빼요' };
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

function cardCode(c: BoardCard, s: Settings, loop: boolean): string {
  switch (c.k) {
    case 'wait':
      // In a game (the cards repeated), the end is checked once it is the robot's turn.
      return `cell.wait("로봇 차례")\n${loop ? 'if cell.is_on("게임 끝"):\n    break\n' : ''}`;
    case 'board':
      Object.assign(s, { x: c.x, y: c.y, pitch: c.pitch });
      return '';
    case 'take':
      return 'robot.pick("돌 상자 다음 칸")\n';
    case 'put': {
      const x = s.x + (c.c - 1) * s.pitch;
      const y = s.y + (c.r - 1) * s.pitch;
      return to(x, y, TRAVEL_Z) + to(x, y, DROP_Z) + 'robot.pump.off()\n' + to(x, y, TRAVEL_Z);
    }
    case 'rule':
      return `robot.place("${c.rule}")\n`;
    case 'home':
      return 'robot.home()\n';
  }
}

const indent = (s: string) => s.replace(/^(?=.)/gm, '    ');
const count = (s: string) => s.split('\n').length - 1;

/** The cell program the cards make, and which program lines (1-based, inclusive) each card made ([0, -1]: none, a setting). */
export function boardCode(r: BoardRecipe): { code: string; lines: [number, number][] } {
  const s: Settings = { x: BOARD.x0, y: BOARD.y0, pitch: BOARD.pitch };
  const loop = r.times > 1;
  const parts = r.cards.map((c) => cardCode(c, s, loop));
  let line = count(HEAD) + (loop ? 2 : 1);
  const lines: [number, number][] = parts.map((p) => {
    const n = count(p);
    const span: [number, number] = n ? [line, line + n - 1] : [0, -1];
    line += n;
    return span;
  });
  const body = parts.join('');
  if (!body) return { code: HEAD, lines };
  return { code: loop ? `${HEAD}for _ in range(${r.times}):\n${indent(body)}` : `${HEAD}${body}`, lines };
}

/* --- the steps' cards -------------------------------------------------------------- */

const BOARD_CARD: BoardCard = { k: 'board', x: BOARD.x0, y: BOARD.y0, pitch: BOARD.pitch };
const put = (p: Pt): BoardCard => ({ k: 'put', c: p.c, r: p.r });
const W: BoardCard = { k: 'wait' };
const TAKE: BoardCard = { k: 'take' };
const HOME: BoardCard = { k: 'home' };

/** Each step's answer (its reference solution in missions.ts is this program). */
export const H_ANSWER: Record<string, BoardRecipe> = {
  H1: { cards: [W, BOARD_CARD, TAKE, put({ c: 5, r: 4 }), HOME], times: 1 },
  H2: { cards: [W, BOARD_CARD, TAKE, put({ c: 7, r: 6 }), HOME], times: 1 },
  H3: { cards: [BOARD_CARD, W, TAKE, put({ c: 5, r: 4 }), HOME, W, TAKE, put({ c: 6, r: 4 }), HOME], times: 1 },
  H4: { cards: [W, TAKE, { k: 'rule', rule: '판단 칸' }, HOME], times: 9 },
};

/**
 * What each step starts with: H1 the whole thing to watch; then the step's gap (H2: 15 mm between
 * the lines, the board's are 16; H3: no waiting for the turn; H4: the first free point, 9 moves set).
 */
export const H_START: Record<string, BoardRecipe> = {
  H1: H_ANSWER.H1,
  H2: { cards: [W, { ...BOARD_CARD, pitch: 15 }, TAKE, put({ c: 7, r: 6 }), HOME], times: 1 },
  H3: { cards: [BOARD_CARD, TAKE, put({ c: 5, r: 4 }), HOME, TAKE, put({ c: 6, r: 4 }), HOME], times: 1 },
  H4: { cards: [W, TAKE, { k: 'rule', rule: '빈 칸' }, HOME], times: 9 },
};

/** The cards to add from the palette. */
export const BOARD_PALETTE: BoardCard[] = [W, BOARD_CARD, TAKE, put({ c: 5, r: 4 }), { k: 'rule', rule: '판단 칸' }, HOME];
