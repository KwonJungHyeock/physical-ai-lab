/**
 * 실습 셀 G · 로봇 캘리그라피 부스 (입문 트랙 ① 생활 로봇): a robot that writes a customer's message
 * card at an event booth, as the real ones work (docs/reports/education/44-track-life-robot-calligraphy.md).
 *
 *  - Unlike the other cells this one is at full size: the arm is itself (a desk cobot with a pen
 *    holder, as the booths' arms are), the message card a real 120 × 80 mm card on a cutting mat.
 *  - The customer puts a card on the mat (`카드 있음` comes on when the hand is out), the robot writes,
 *    turns the 완성 램프 on, and the customer takes the card. A hand over the mat while the arm is
 *    there is an interlock stop (the same idea as the café's pickup door).
 *  - The pen draws where its tip touches the paper (sim.ts: tip z ≤ 0.8 mm, the holder's spring
 *    lets it press 1 mm). What is on the card is the world's pen trail; a card taken away keeps it.
 *  - The checks compare the ink with the phrase as it should stand on the card: how much of it is
 *    written (coverage), ink off it (stray: lines between letters), how far off the line it strays
 *    (a joint move bends a side), and whether the writing is inside the card and in its middle.
 *
 * No React: run.ts steps it, tests/simulator/cell-g-check.mts runs the missions headless.
 */

import type { CellAlert } from './faults';
import { setIn, type LineState } from './line';

/** The message card: 120 mm along x (the text's way), 80 mm along y; the customer stands at −y and reads it. */
export const CARD_MM = { w: 120, h: 80 } as const;

/** The usual place of the card's bottom-left corner on the mat (robot base frame, mm). */
export const CARD_HOME = { x: 150, y: -40 } as const;

/** G3: the card put down off the usual corner (the mat's grid tells where). */
export const G3_CARD = { x: 140, y: -60 } as const;

/** The cutting mat the card lies on (its printed grid is in robot mm). */
export const MAT = { x0: 110, x1: 300, y0: -90, y1: 70 } as const;

/** Travel height above the paper between strokes, mm. */
export const LIFT_MM = 10;

/* --- the phrases ----------------------------------------------------------------- */

export type Pt = [number, number];
/** Strokes (each a polyline the pen draws without lifting), in a phrase box from (0, 0), mm. */
export type Strokes = Pt[][];

export const PHRASES = ['HELLO', '사랑해', '하트', '네모'] as const;
export type Phrase = (typeof PHRASES)[number];

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 24, from = Math.PI / 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = from + (k * 2 * Math.PI) / n;
    return [r1(cx + rx * Math.cos(a)), r1(cy + ry * Math.sin(a))];
  });
const r1 = (v: number) => Math.round(v * 10) / 10;
const shift = (s: Strokes, dx: number): Strokes => s.map((l) => l.map(([x, y]) => [r1(x + dx), y] as Pt));

/** Letters 16 mm wide, 30 mm tall, 6 mm apart. */
const LETTER: Record<string, Strokes> = {
  H: [
    [
      [0, 30],
      [0, 0],
    ],
    [
      [16, 30],
      [16, 0],
    ],
    [
      [0, 15],
      [16, 15],
    ],
  ],
  E: [
    [
      [16, 30],
      [0, 30],
      [0, 0],
      [16, 0],
    ],
    [
      [0, 15],
      [12, 15],
    ],
  ],
  L: [
    [
      [0, 30],
      [0, 0],
      [15, 0],
    ],
  ],
  O: [ellipse(8, 15, 8, 15)],
};

/** 한글 in 30 × 30 boxes, 5 mm apart: 사 · 랑 · 해 (each 자모 a few straight strokes or an ㅇ). */
const HANGUL: Strokes[] = [
  // 사: ㅅ + ㅏ
  [
    [
      [10, 28],
      [1, 3],
    ],
    [
      [7, 17],
      [16, 3],
    ],
    [
      [22, 30],
      [22, 0],
    ],
    [
      [22, 15],
      [29, 15],
    ],
  ],
  // 랑: ㄹ + ㅏ over ㅇ
  [
    [
      [2, 29],
      [16, 29],
      [16, 23],
      [2, 23],
      [2, 17],
      [17, 17],
    ],
    [
      [23, 30],
      [23, 14],
    ],
    [
      [23, 22],
      [29, 22],
    ],
    ellipse(14, 6, 9, 6, 20),
  ],
  // 해: ㅎ + ㅐ
  [
    [
      [6, 29],
      [12, 29],
    ],
    [
      [2, 24],
      [16, 24],
    ],
    ellipse(9, 13, 6, 6, 18),
    [
      [22, 30],
      [22, 0],
    ],
    [
      [29, 30],
      [29, 0],
    ],
    [
      [22, 15],
      [29, 15],
    ],
  ],
];

function heart(): Strokes {
  // The classic heart curve, 50 mm wide, from its bottom tip round and back.
  const n = 40;
  const pts: Pt[] = Array.from({ length: n + 1 }, (_, k) => {
    const t = Math.PI + (k * 2 * Math.PI) / n;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [r1(25 + x * 1.5), r1(25.5 + y * 1.5)];
  });
  return [pts];
}

/** A phrase's strokes in its own box (from (0, 0)), and the box's size, mm. */
export function phraseStrokes(p: Phrase): {
  strokes: Strokes;
  w: number;
  h: number;
} {
  if (p === 'HELLO') {
    const s = [...'HELLO'].flatMap((c, k) => shift(LETTER[c], k * 22));
    return { strokes: s, w: 104, h: 30 };
  }
  if (p === '사랑해')
    return {
      strokes: HANGUL.flatMap((g, k) => shift(g, k * 35)),
      w: 100,
      h: 30,
    };
  if (p === '하트') return { strokes: heart(), w: 50, h: 50 };
  return {
    strokes: [
      [
        [0, 0],
        [56, 0],
        [56, 56],
        [0, 56],
        [0, 0],
      ],
    ],
    w: 56,
    h: 56,
  };
}

/** Where a phrase stands written with the card's corner taken as (x, y): in the card's middle, robot mm. */
export function placedStrokes(p: Phrase, corner: { x: number; y: number }): Strokes {
  const { strokes, w, h } = phraseStrokes(p);
  const ox = corner.x + (CARD_MM.w - w) / 2;
  const oy = corner.y + (CARD_MM.h - h) / 2;
  return strokes.map((l) => l.map(([x, y]) => [r1(ox + x), r1(oy + y)] as Pt));
}

/* --- reading the ink --------------------------------------------------------------- */

function segDist(p: Pt, a: Pt, b: Pt): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}
function distTo(p: Pt, lines: Strokes): number {
  let best = Infinity;
  for (const l of lines) for (let i = 1; i < l.length; i += 1) best = Math.min(best, segDist(p, l[i - 1], l[i]));
  if (best === Infinity) for (const l of lines) for (const q of l) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return best;
}
/** Points every ~1 mm along strokes. */
function samples(lines: Strokes): Pt[] {
  const out: Pt[] = [];
  for (const l of lines)
    for (let i = 1; i < l.length; i += 1) {
      const [a, b] = [l[i - 1], l[i]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let k = 0; k < n; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  return out;
}

export interface InkReport {
  /** Share of the phrase written (each point of it within 1.2 mm of ink), 0..1. */
  coverage: number;
  /** Ink farther than 2 mm off the phrase, mm of line. */
  stray: number;
  /** The farthest the ink gets from the phrase's lines, mm. */
  maxDev: number;
  /** Ink outside the card, mm of line. */
  outside: number;
  /** How far the writing's middle is from the card's middle, mm. */
  offCentre: number;
  /** All ink, mm of line. */
  length: number;
}

/** How the ink on a card compares with the phrase as it should stand on it. */
export function readInk(ink: Strokes, phrase: Phrase, corner: { x: number; y: number }): InkReport {
  return readInkFor(ink, placedStrokes(phrase, corner), corner);
}

/** How the ink on a card compares with any strokes as they should stand on it (robot mm). */
export function readInkFor(ink: Strokes, want: Strokes, corner: { x: number; y: number }): InkReport {
  const lines = ink.filter((l) => l.length > 1);
  const got = samples(lines);
  const covered = samples(want).filter((p) => distTo(p, lines) <= 1.2);
  const wantN = samples(want).length;
  let stray = 0;
  let maxDev = 0;
  let outside = 0;
  for (const p of got) {
    const d = distTo(p, want);
    maxDev = Math.max(maxDev, d);
    if (d > 2) stray += 1;
    if (p[0] < corner.x || p[0] > corner.x + CARD_MM.w || p[1] < corner.y || p[1] > corner.y + CARD_MM.h) outside += 1;
  }
  let offCentre = 0;
  if (got.length) {
    const xs = got.map((p) => p[0]);
    const ys = got.map((p) => p[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2;
    offCentre = Math.hypot(mx - (corner.x + CARD_MM.w / 2), my - (corner.y + CARD_MM.h / 2));
  }
  return {
    coverage: wantN ? covered.length / wantN : 0,
    stray,
    maxDev,
    outside,
    offCentre,
    length: got.length,
  };
}

/** Good enough to hand over: nearly all of it written, almost nothing off it, inside the card. */
export function inkVerdict(r: InkReport): { ok: boolean; why: string } {
  if (r.length < 3) return { ok: false, why: '카드에 아무것도 안 써졌어요' };
  if (r.outside > 2)
    return {
      ok: false,
      why: `글씨가 카드 밖으로 나갔어요 (${Math.round(r.outside)} mm)`,
    };
  if (r.coverage < 0.9)
    return {
      ok: false,
      why: `글씨가 덜 써졌어요 (${Math.round(r.coverage * 100)}%)`,
    };
  if (r.stray > 3)
    return {
      ok: false,
      why: `글자 사이에 줄이 그어졌어요 (${Math.round(r.stray)} mm)`,
    };
  return { ok: true, why: '또렷하게 써졌어요' };
}

/* --- the booth --------------------------------------------------------------------- */

export interface DrawDef {
  /** Inputs: a card on the mat · the customer's hand over it. Output: the 완성 lamp. */
  card: string;
  hand: string;
  lamp: string;
  /** Where the hand comes: over the card (and this far round it), mm. */
  margin: number;
}

/** A card handed over, with what is written on it. */
export interface DoneCard {
  t: number;
  corner: { x: number; y: number };
  ink: Strokes;
}

export interface DrawState {
  /** Cards still to write (the queue). */
  orders: number;
  /** The card on the mat now: its corner (null: none). */
  corner: { x: number; y: number } | null;
  /** Where each next card is put down (the mission's). */
  place: { x: number; y: number };
  /** The customer's hand over the mat: putting a card down or taking it, until s; then what happens. */
  hand: { until: number; then: 'put' | 'take' } | null;
  /** The next customer comes at s. */
  nextAt: number | null;
  done: DoneCard[];
  breaches: number;
  breaching: boolean;
}

export function newDraw(orders: number, place: { x: number; y: number } = CARD_HOME): DrawState {
  // The first customer has just put their card down.
  return {
    orders,
    corner: orders > 0 ? { ...place } : null,
    place: { ...place },
    hand: null,
    nextAt: null,
    done: [],
    breaches: 0,
    breaching: false,
  };
}

export interface DrawStep {
  alerts: CellAlert[];
  /** The ink to move off the mat with the card the customer took (the caller clears the trail). */
  took: boolean;
}

/** How long a hand is over the mat (putting a card down, taking one), s; and between two customers. */
const HAND_S = 1.5;
const NEXT_S = 3;

/** One frame of the booth. `tip`: the tool tip now; `ink`: the pen's trail (on the card on the mat). */
export function stepDraw(def: DrawDef, s: LineState, d: DrawState, tip: { x: number; y: number; z: number }, ink: Strokes): DrawStep {
  const out: DrawStep = { alerts: [], took: false };
  const t = s.t;
  const lamp = !!s.out[def.lamp];
  // The lamp on with a card there: the customer reaches in to take it.
  if (lamp && d.corner && !d.hand) d.hand = { until: t + HAND_S, then: 'take' };
  // The next customer comes with a new card.
  if (!d.corner && !d.hand && d.nextAt !== null && t >= d.nextAt) {
    d.nextAt = null;
    d.hand = { until: t + HAND_S, then: 'put' };
  }
  if (d.hand && t >= d.hand.until) {
    if (d.hand.then === 'take' && d.corner) {
      d.done.push({ t, corner: d.corner, ink: ink.map((l) => l.slice()) });
      d.corner = null;
      d.orders = Math.max(0, d.orders - 1);
      out.took = true;
      if (d.orders > 0) d.nextAt = t + NEXT_S;
    } else if (d.hand.then === 'put') d.corner = { ...d.place };
    d.hand = null;
  }
  setIn(s, def.card, !!d.corner);
  setIn(s, def.hand, !!d.hand);
  // The interlock: the arm low over the card while a hand is there.
  const c = d.corner ?? d.place;
  const m = def.margin;
  const over = tip.x > c.x - m && tip.x < c.x + CARD_MM.w + m && tip.y > c.y - m && tip.y < c.y + CARD_MM.h + m && tip.z < 60;
  if (over && d.hand && !d.breaching) {
    d.breaching = true;
    d.breaches += 1;
    out.alerts.push({
      t,
      level: 'stop',
      kind: 'safety',
      title: '손님 손이 카드 위에 있어요',
      msg: '손님이 카드를 놓거나 가져가는 동안 팔이 카드 위로 와서 멈췄어요. [카드 있음]이 바뀔 때까지 기다려야 해요.',
    });
  }
  if (!over || !d.hand) d.breaching = false;
  return out;
}

/** Every card so far (handed over, then the one on the mat) with its ink. */
export function cardsOf(d: DrawState, trail: Strokes): DoneCard[] {
  return d.corner ? [...d.done, { t: Infinity, corner: d.corner, ink: trail }] : d.done;
}
