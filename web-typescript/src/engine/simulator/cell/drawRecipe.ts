/**
 * 로봇 캘리그라피 (입문 트랙): the program as 작업 순서 카드 — no code on screen. Each card is one
 * thing the booth's robot does or one setting it works with (보고 #44 §2-2): wait for the
 * customer's card, where the card lies (its corner, robot mm), how low the pen goes, write a
 * phrase (straight or joint moves, lifting the pen between strokes or not), go home, light the
 * 완성 lamp and wait for the card to be taken. The cards become the cell program (`robot.move_to`
 * along every stroke, the same lines the 실습 셀 runs), so the checks and the real robot stay one.
 * `lines` tells which program lines each card made (the running card lights up).
 *
 * No React: DrawCards.tsx shows them, tests/simulator/cell-g-check.mts runs the starters.
 */

import { CARD_HOME, G3_CARD, LIFT_MM, PHRASES, placedStrokes, type Phrase } from './draw';

export type DrawCard = { k: 'wait' } | { k: 'corner'; x: number; y: number } | { k: 'pen'; z: number } | { k: 'write'; phrase: Phrase; lift: boolean; straight: boolean } | { k: 'home' } | { k: 'done' };

export interface DrawRecipe {
  cards: DrawCard[];
  /** How many customers: the cards run this many times. */
  times: number;
}

export { PHRASES };
/** The pen heights a card can be set to, mm above the paper. */
export const PEN_Z = { min: 0, max: 5 } as const;

/** The card's title and what it does, for the screen. */
export function drawCardText(c: DrawCard): { title: string; note: string } {
  switch (c.k) {
    case 'wait':
      return {
        title: '카드 기다리기',
        note: '손님이 카드를 놓고 손을 뺄 때까지 ([카드 있음])',
      };
    case 'corner':
      return {
        title: '카드 위치',
        note: `카드 왼쪽 아래 모서리: x ${c.x} · y ${c.y} mm (로봇 좌표)`,
      };
    case 'pen':
      return { title: '펜 높이', note: `쓸 때 펜 끝 높이: 종이 위 ${c.z} mm` };
    case 'write':
      return {
        title: `'${c.phrase}' 쓰기`,
        note: `${c.straight ? '직선 이동' : '관절 이동'} · 획 사이 ${c.lift ? '펜 들기' : '펜 내린 채'}`,
      };
    case 'home':
      return { title: '기본 자세로', note: '팔을 카드 위에서 빼요' };
    case 'done':
      return {
        title: '완성 알리기',
        note: '완성 램프를 켜고 손님이 카드를 가져갈 때까지 기다려요',
      };
  }
}

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';
const r1 = (v: number) => String(Math.round(v * 10) / 10);
const to = (x: number, y: number, z: number, straight = true) => `robot.move_to(${r1(x)}, ${r1(y)}, ${r1(z)}${straight ? '' : ', linear=False'})\n`;

/** What the settings cards say so far. */
interface Settings {
  corner: { x: number; y: number };
  z: number;
}

function cardCode(c: DrawCard, s: Settings): string {
  switch (c.k) {
    case 'wait':
      return 'cell.wait("카드 있음")\n';
    case 'corner':
      s.corner = { x: c.x, y: c.y };
      return '';
    case 'pen':
      s.z = c.z;
      return '';
    case 'write': {
      const strokes = placedStrokes(c.phrase, s.corner);
      const z = s.z;
      let code = '';
      strokes.forEach((l, k) => {
        const [x0, y0] = l[0];
        // The first stroke, or every one when the pen is lifted: come down onto its start from above.
        if (k === 0 || c.lift) code += to(x0, y0, z + LIFT_MM) + to(x0, y0, z);
        else code += to(x0, y0, z, c.straight);
        for (const [x, y] of l.slice(1)) code += to(x, y, z, c.straight);
        const [xe, ye] = l[l.length - 1];
        if (c.lift || k === strokes.length - 1) code += to(xe, ye, z + LIFT_MM);
      });
      return code;
    }
    case 'home':
      return 'robot.home()\n';
    case 'done':
      return 'cell.set("완성 램프", True)\ncell.wait("카드 있음", False)\ncell.set("완성 램프", False)\n';
  }
}

const indent = (s: string) => s.replace(/^(?=.)/gm, '    ');
const count = (s: string) => s.split('\n').length - 1;

/** The cell program the cards make, and which program lines (1-based, inclusive) each card made ([0, -1]: none, a setting). */
export function drawCode(r: DrawRecipe): {
  code: string;
  lines: [number, number][];
} {
  const s: Settings = { corner: { ...CARD_HOME }, z: 0 };
  const parts = r.cards.map((c) => cardCode(c, s));
  const loop = r.times > 1;
  let line = count(HEAD) + (loop ? 2 : 1);
  const lines: [number, number][] = parts.map((p) => {
    const n = count(p);
    const span: [number, number] = n ? [line, line + n - 1] : [0, -1];
    line += n;
    return span;
  });
  const body = parts.join('');
  if (!body) return { code: HEAD, lines };
  return {
    code: loop ? `${HEAD}for _ in range(${r.times}):\n${indent(body)}` : `${HEAD}${body}`,
    lines,
  };
}

/* --- the steps' cards -------------------------------------------------------------- */

const W = (phrase: Phrase, lift = true, straight = true): DrawCard => ({
  k: 'write',
  phrase,
  lift,
  straight,
});
const flow = (write: DrawCard, corner: { x: number; y: number } = CARD_HOME, z = 0): DrawCard[] => [{ k: 'wait' }, { k: 'corner', ...corner }, { k: 'pen', z }, write, { k: 'home' }, { k: 'done' }];

/** Each step's answer (its reference solution in missions.ts is this program). */
export const G_ANSWER: Record<string, DrawRecipe> = {
  G1: { cards: flow(W('사랑해')), times: 1 },
  G2: { cards: flow(W('HELLO'), G3_CARD), times: 1 },
  G3: { cards: flow(W('네모')), times: 1 },
  G4: { cards: flow(W('사랑해')), times: 2 },
};

/**
 * What each step starts with: G1 the whole thing to watch; then the step's gap (G2: the pen 3 mm
 * up and the usual corner; G3: joint moves; G4: the pen down between strokes, 2명 already set).
 */
export const G_START: Record<string, DrawRecipe> = {
  G1: G_ANSWER.G1,
  G2: { cards: flow(W('HELLO'), CARD_HOME, 3), times: 1 },
  G3: { cards: flow(W('네모', true, false)), times: 1 },
  G4: { cards: flow(W('사랑해', false)), times: 2 },
};

/** The cards to add from the palette. */
export const DRAW_PALETTE: DrawCard[] = [{ k: 'wait' }, { k: 'corner', ...CARD_HOME }, { k: 'pen', z: 0 }, W('HELLO'), W('사랑해'), W('하트'), W('네모'), { k: 'home' }, { k: 'done' }];
