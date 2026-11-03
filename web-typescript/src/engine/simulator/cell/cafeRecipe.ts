/**
 * 로봇 카페 (입문 트랙): the program as 작업 순서 카드 — no code on screen. Each card is one thing a
 * café robot does (보고 #43 §2-2): take a cup from the dispenser, carry it to a station, start a
 * station and (or not) wait for its 끝 signal, pick the cup up again, open the pickup door, wait for
 * the customer, close the door. The cards are turned into the cell program (the same `robot.*` /
 * `cell.*` lines the 실습 셀 runs), so the reference programs, the checks and the real robot all stay
 * one. `lines` tells which program lines each card made (the running card lights up).
 *
 * No React: RecipeCards.tsx shows them, tests/simulator/cell-f-check.mts runs the starters.
 */

/** Where a cup can stand (the cell's places). */
export const CAFE_SPOTS = ['컵 나오는 곳', '제빙기', '커피 머신', '정수기', '픽업 1', '픽업 2'] as const;
export type CafeSpot = (typeof CAFE_SPOTS)[number];

export type PourKind = 'ice' | 'shot' | 'water';
export const POURS: Record<PourKind, { name: string; out: string; done: string; busy: string; place: CafeSpot }> = {
  ice: { name: '얼음 받기', out: '얼음', done: '얼음 끝', busy: '얼음 나오는 중', place: '제빙기' },
  shot: { name: '샷 추출', out: '추출 시작', done: '추출 끝', busy: '추출 중', place: '커피 머신' },
  water: { name: '물 받기', out: '물', done: '물 끝', busy: '물 나오는 중', place: '정수기' },
};

export type Card =
  | { k: 'cup' }
  | { k: 'place'; to: CafeSpot }
  | { k: 'pick'; from: CafeSpot }
  | { k: 'pour'; what: PourKind; wait: boolean }
  | { k: 'home' }
  | { k: 'open' }
  | { k: 'customer' }
  | { k: 'close' };

export interface Recipe {
  cards: Card[];
  /** How many drinks: the cards run this many times. */
  times: number;
}

/** The card's title and what it does, for the screen. */
export function cardText(c: Card): { title: string; note: string } {
  switch (c.k) {
    case 'cup':
      return { title: '컵 받기', note: '컵 디스펜서에 컵을 달라고 하고, 컵이 나오면 집어요' };
    case 'place':
      return { title: `${c.to}에 놓기`, note: '들고 있는 컵을 그 자리에 내려놓아요' };
    case 'pick':
      return { title: `${c.from}에서 집기`, note: '그 자리의 컵을 집어 들어요' };
    case 'pour':
      return { title: POURS[c.what].name, note: c.wait ? `[${POURS[c.what].done}] 신호가 켜질 때까지 기다려요` : '시작만 누르고 바로 다음 카드로 넘어가요' };
    case 'home':
      return { title: '기본 자세로', note: '팔을 장비에서 빼 기본 자세로 돌아가요' };
    case 'open':
      return { title: '픽업 문 열기', note: '손님 쪽 문을 열어요 (열릴 때까지 기다려요)' };
    case 'customer':
      return { title: '손님이 가져갈 때까지 기다리기', note: '[손 감지]가 켜졌다가 꺼질 때까지' };
    case 'close':
      return { title: '픽업 문 닫기', note: '문을 닫아요 (닫힐 때까지 기다려요)' };
  }
}

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';

function cardCode(c: Card): string {
  switch (c.k) {
    case 'cup':
      return 'cell.set("컵 내리기", True)\ncell.wait("컵 준비됨")\ncell.set("컵 내리기", False)\nrobot.pick("컵 나오는 곳")\n';
    case 'place':
      return `robot.place("${c.to}")\n`;
    case 'pick':
      return `robot.pick("${c.from}")\n`;
    case 'pour': {
      const p = POURS[c.what];
      // Not waiting: a short push (the controller needs to see the start), then on to the next card.
      return c.wait ? `cell.set("${p.out}", True)\ncell.wait("${p.done}")\ncell.set("${p.out}", False)\n` : `cell.set("${p.out}", True)\nrobot.wait(0.2)\ncell.set("${p.out}", False)\n`;
    }
    case 'home':
      return 'robot.home()\n';
    case 'open':
      return 'cell.set("픽업 문", True)\ncell.wait("문 열림")\n';
    case 'customer':
      return 'cell.wait("손 감지")\ncell.wait("손 감지", False)\n';
    case 'close':
      return 'cell.set("픽업 문", False)\ncell.wait("문 닫힘")\n';
  }
}

const indent = (s: string) => s.replace(/^(?=.)/gm, '    ');
const count = (s: string) => s.split('\n').length - 1;

/** The cell program the cards make, and which program lines (1-based, inclusive) each card made. */
export function recipeCode(r: Recipe): { code: string; lines: [number, number][] } {
  const parts = r.cards.map(cardCode);
  const loop = r.times > 1;
  let line = count(HEAD) + (loop ? 2 : 1);
  const lines: [number, number][] = parts.map((p) => {
    const n = count(p);
    const span: [number, number] = [line, line + n - 1];
    line += n;
    return span;
  });
  const body = parts.join('');
  if (!r.cards.length) return { code: HEAD, lines };
  return { code: loop ? `${HEAD}for _ in range(${r.times}):\n${indent(body)}` : `${HEAD}${body}`, lines };
}

/* --- the steps' cards -------------------------------------------------------------------- */

const P = (what: PourKind, wait = true): Card => ({ k: 'pour', what, wait });
/** The whole iced americano, cup to pickup shelf. */
const AMERICANO: Card[] = [{ k: 'cup' }, { k: 'place', to: '제빙기' }, P('ice'), { k: 'pick', from: '제빙기' }, { k: 'place', to: '커피 머신' }, P('shot'), { k: 'pick', from: '커피 머신' }, { k: 'place', to: '정수기' }, P('water'), { k: 'pick', from: '정수기' }, { k: 'place', to: '픽업 1' }, { k: 'home' }];
const HAND_OVER: Card[] = [{ k: 'open' }, { k: 'customer' }, { k: 'close' }];

/** Each step's answer (the same program as its reference solution in missions.ts). */
export const RECIPE_ANSWER: Record<string, Recipe> = {
  F1: { cards: [...AMERICANO, ...HAND_OVER], times: 1 },
  F2: { cards: [{ k: 'cup' }, { k: 'place', to: '커피 머신' }, { k: 'home' }], times: 1 },
  F3: { cards: [{ k: 'cup' }, { k: 'place', to: '커피 머신' }, P('shot'), { k: 'pick', from: '커피 머신' }, { k: 'place', to: '픽업 1' }, { k: 'home' }], times: 1 },
  F4: { cards: AMERICANO, times: 1 },
  F5: { cards: [...AMERICANO, ...HAND_OVER], times: 1 },
  F6: { cards: [...AMERICANO, ...HAND_OVER], times: 3 },
};

/**
 * What each step starts with: F1 the whole thing to watch; then a start with the step's one gap
 * (F3: the shot not waited for; F4: no water; F5: no door; F6: one drink).
 */
export const RECIPE_START: Record<string, Recipe> = {
  F1: RECIPE_ANSWER.F1,
  F2: { cards: [{ k: 'cup' }], times: 1 },
  F3: { cards: [{ k: 'cup' }, { k: 'place', to: '커피 머신' }, P('shot', false), { k: 'pick', from: '커피 머신' }, { k: 'place', to: '픽업 1' }, { k: 'home' }], times: 1 },
  F4: { cards: AMERICANO.filter((c, k) => k < 7).concat([{ k: 'place', to: '픽업 1' }, { k: 'home' }]), times: 1 },
  F5: { cards: AMERICANO, times: 1 },
  F6: { cards: [...AMERICANO, ...HAND_OVER], times: 1 },
};

/** The cards to add from the palette. */
export const PALETTE: Card[] = [{ k: 'cup' }, { k: 'place', to: '커피 머신' }, { k: 'pick', from: '커피 머신' }, P('ice'), P('shot'), P('water'), { k: 'home' }, { k: 'open' }, { k: 'customer' }, { k: 'close' }];
