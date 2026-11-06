/**
 * 로봇 캘리그라피 (입문 트랙): the program as 공정 카드 — no code on screen, the booth's process in
 * four cards (보고 #44 §2-2): ① 카드 받기 → ② 보정 (where the card
 * lies — its corner, robot mm — and how low the pen goes) → ③ 쓰기 (the phrase; straight or joint
 * moves, the pen lifted between strokes or not: the two switches) → ④ 건네기 (the arm out, the
 * 완성 lamp, the customer takes the card). Each card opens into its rows. The cards become the cell
 * program (`robot.move_to` along every stroke, the same lines the 실습 셀 runs), so the checks and
 * the real robot stay one. `lines` / `rows` tell which program lines each card and row made.
 *
 * No React: DrawCards.tsx shows them, tests/simulator/cell-g-check.mts runs the starters.
 */

import { CARD_HOME, G3_CARD, LIFT_MM, PHRASES, phraseStrokes, placedStrokes, type Phrase } from './draw';

export type DrawCard = { k: 'receive' } | { k: 'setup'; x: number; y: number; z: number } | { k: 'write'; phrase: Phrase; lift: boolean; straight: boolean } | { k: 'give' };

export interface DrawRecipe {
  cards: DrawCard[];
  /** How many customers: the cards run this many times. */
  times: number;
}

export { PHRASES };
/** The pen heights a card can be set to, mm above the paper. */
export const PEN_Z = { min: 0, max: 5 } as const;

/** A row inside a card: what it does, the lines it makes, and the switch it carries (if any). */
export interface DrawRow {
  text: string;
  code: string;
  toggle?: 'straight' | 'lift';
  on?: boolean;
}

/** The card's process name and its one-line summary (the closed card). */
export function drawCardText(c: DrawCard): { title: string; note: string } {
  switch (c.k) {
    case 'receive':
      return { title: '카드 받기', note: '손님이 카드를 놓고 손을 뺄 때까지' };
    case 'setup':
      return { title: '보정', note: `카드 모서리 x ${c.x} · y ${c.y} · 펜 높이 ${c.z} mm` };
    case 'write':
      return { title: '쓰기', note: `'${c.phrase}' · ${c.straight ? '직선 이동' : '관절 이동'} · 획 사이 ${c.lift ? '펜 들기' : '펜 내린 채'}` };
    case 'give':
      return { title: '건네기', note: '팔 빼기 → 완성 램프 → 손님이 가져가요' };
  }
}

const HEAD = 'from edu import robot, cell\n\nrobot.home()\n';
const r1 = (v: number) => String(Math.round(v * 10) / 10);
const to = (x: number, y: number, z: number, straight = true) => `robot.move_to(${r1(x)}, ${r1(y)}, ${r1(z)}${straight ? '' : ', linear=False'})\n`;

/** What the 보정 card says so far. */
interface Settings {
  corner: { x: number; y: number };
  z: number;
}

function writeCode(c: Extract<DrawCard, { k: 'write' }>, s: Settings): string {
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

/** The card's rows, in order (the open card): each row's text and program lines. */
function rowsWith(c: DrawCard, s: Settings): DrawRow[] {
  switch (c.k) {
    case 'receive':
      return [{ text: '[카드 있음]까지 기다리기', code: 'cell.wait("카드 있음")\n' }];
    case 'setup':
      s.corner = { x: c.x, y: c.y };
      s.z = c.z;
      return [
        { text: `카드 왼쪽 아래 모서리: x ${c.x} · y ${c.y} mm`, code: '' },
        { text: `쓸 때 펜 끝 높이: 종이 위 ${c.z} mm`, code: '' },
      ];
    case 'write':
      return [
        { text: `'${c.phrase}' 획 ${phraseStrokes(c.phrase).strokes.length}개 쓰기`, code: writeCode(c, s) },
        { text: '직선 이동으로 쓰기 (끄면 관절 이동)', code: '', toggle: 'straight', on: c.straight },
        { text: '획 사이 펜 들기', code: '', toggle: 'lift', on: c.lift },
      ];
    case 'give':
      return [
        { text: '팔 빼기 (기본 자세)', code: 'robot.home()\n' },
        { text: '완성 램프 켜고 손님이 가져갈 때까지', code: 'cell.set("완성 램프", True)\ncell.wait("카드 있음", False)\ncell.set("완성 램프", False)\n' },
      ];
  }
}

/** The card's rows as the screen shows them (the settings as the card alone says). */
export const drawRows = (c: DrawCard): DrawRow[] => rowsWith(c, { corner: { ...CARD_HOME }, z: 0 });

const indent = (s: string) => s.replace(/^(?=.)/gm, '    ');
const count = (s: string) => s.split('\n').length - 1;

/**
 * The cell program the cards make, which program lines (1-based, inclusive) each card made, and
 * each card's rows ([0, -1]: none — a setting, or a switch).
 */
export function drawCode(r: DrawRecipe): { code: string; lines: [number, number][]; rows: [number, number][][] } {
  const s: Settings = { corner: { ...CARD_HOME }, z: 0 };
  const loop = r.times > 1;
  let line = count(HEAD) + (loop ? 2 : 1);
  const lines: [number, number][] = [];
  const rows: [number, number][][] = [];
  let body = '';
  for (const c of r.cards) {
    const first = line;
    const spans: [number, number][] = [];
    for (const row of rowsWith(c, s)) {
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

const W = (phrase: Phrase, lift = true, straight = true): DrawCard => ({ k: 'write', phrase, lift, straight });
const flow = (write: DrawCard, corner: { x: number; y: number } = CARD_HOME, z = 0): DrawCard[] => [{ k: 'receive' }, { k: 'setup', ...corner, z }, write, { k: 'give' }];

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
export const DRAW_PALETTE: DrawCard[] = [{ k: 'receive' }, { k: 'setup', ...CARD_HOME, z: 0 }, W('사랑해'), W('HELLO'), W('하트'), W('네모'), { k: 'give' }];
