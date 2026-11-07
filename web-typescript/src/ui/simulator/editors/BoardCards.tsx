'use client';

/**
 * 공정 카드 (입문 트랙 · 보드게임 로봇): the program as the robot's process instead of code
 * (engine/simulator/cell/boardRecipe.ts), as the other places (the café: CafeMaker.tsx). On top, the game (the
 * person plays black, first, from the middle; how many white moves); below, ① 판 (보정: the board's
 * corner point and its line spacing, number boxes) → ② 한 수 (a point, 가로 · 세로, or a rule; ▾
 * opens its rows — wait for the turn (a switch) → take a stone → put it → the arm out). A game is
 * one 한 수 card repeated. Every change makes the cell program at once (onCode); the card and the
 * row being run light up. [모범 공정 불러오기] loads the step's answer. Keyed by the step (Console).
 */

import { useEffect, useMemo, useState } from 'react';

import { BOARD, RULES, RULE_TEXT, type Rule } from '@/engine/simulator/cell/board';
import { BOARD_PALETTE, H_ANSWER, H_START, PITCH_MM, boardCardText, boardCode, boardRows, type BoardCard, type BoardRecipe } from '@/engine/simulator/cell/boardRecipe';
import { QUESTS } from '@/engine/simulator/cell/quests';

import css from './recipe.module.css';

// The kind of card, as a quiet stripe (the HUD keeps colour for meaning): the setting dark; amber
// where a person is (a move waits for the person's turn).
const KIND_COLOR: Record<BoardCard['k'], string> = {
  board: '#5f666e',
  move: '#f0a23b',
};
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const copy = (r: BoardRecipe): BoardRecipe => ({ cards: r.cards.map((c) => ({ ...c })), times: r.times });

interface Props {
  /** The step (H1 … H4) or null (자유 실습). */
  mission: string | null;
  busy: boolean;
  /** The program line running now (the card and row that made it light up); -1 when none. */
  runningLine: number;
  /** The program, and the card a program line came from (for the replay bar: no code is shown). */
  onCode(code: string, cardOf: (line: number) => string): void;
  /** 퀘스트 모드: the cards to change now (1-based) and whether one has to be added ([+ 카드] lit). */
  glow?: readonly number[];
  glowAdd?: boolean;
  /** Under the quest card in one scrolling panel: the cards take their own height (no inner scroll). */
  flow?: boolean;
}

/** A number box that only takes what it may (whole mm), written as it is typed. */
function Num({ value, min, max, busy, label, onChange }: { value: number; min: number; max: number; busy: boolean; label: string; onChange(v: number): void }) {
  return (
    <label className={css.amt}>
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={min} max={max} step={1} value={value} disabled={busy} aria-label={label} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
    </label>
  );
}

const POINT = '칸 지정';

export default function BoardCards({ mission, busy, runningLine, onCode, glow, glowAdd, flow }: Props) {
  const start = (m: string | null) => copy(H_START[m ?? ''] ?? { cards: [], times: 1 });
  const [recipe, setRecipe] = useState<BoardRecipe>(() => start(mission));
  const [open, setOpen] = useState(false);
  // The cards opened (▾): the quest's cards to change start open, so their switch is in sight.
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set((glow ?? []).map((n) => n - 1)));
  const made = useMemo(() => boardCode(recipe), [recipe]);
  const loop = recipe.times > 1;
  useEffect(
    () =>
      onCode(made.code, (line) => {
        const k = made.lines.findIndex(([a, b]) => line >= a && line <= b);
        if (k < 0) return '';
        const r = made.rows[k].findIndex(([a, b]) => line >= a && line <= b);
        return `${CIRCLED[k] ?? k + 1} ${boardCardText(recipe.cards[k]).title}${r < 0 ? '' : ` · ${boardRows(recipe.cards, k, loop)[r].text}`}`;
      }),
    [made, onCode, recipe.cards, loop],
  );
  const answer = mission ? H_ANSWER[mission] : undefined;
  const moves = (answer ?? recipe).cards.filter((c) => c.k === 'move').length * (answer ?? recipe).times;

  const set = (cards: BoardCard[], times = recipe.times) => setRecipe({ cards, times });
  const edit = (k: number, c: BoardCard) => set(recipe.cards.map((o, i) => (i === k ? c : o)));
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= recipe.cards.length) return;
    const cards = recipe.cards.slice();
    [cards[k], cards[j]] = [cards[j], cards[k]];
    set(cards);
    setShown((s) => new Set([...s].map((i) => (i === k ? j : i === j ? k : i))));
  };
  const remove = (k: number) => {
    set(recipe.cards.filter((_, i) => i !== k));
    setShown((s) => new Set([...s].filter((i) => i !== k).map((i) => (i > k ? i - 1 : i))));
  };
  const toggleShown = (k: number) => setShown((s) => (s.has(k) ? new Set([...s].filter((i) => i !== k)) : new Set([...s, k])));
  const running = runningLine < 0 ? -1 : made.lines.findIndex(([a, b]) => runningLine >= a && runningLine <= b);
  const runningRow = running < 0 ? -1 : made.rows[running].findIndex(([a, b]) => runningLine >= a && runningLine <= b);

  /** The card's own boxes (the closed card's title line). */
  const boxes = (c: BoardCard, k: number) => {
    if (c.k === 'board')
      return (
        <>
          <Num label="x" value={c.x} min={100} max={200} busy={busy} onChange={(x) => edit(k, { ...c, x })} />
          <Num label="y" value={c.y} min={-100} max={0} busy={busy} onChange={(y) => edit(k, { ...c, y })} />
          <Num label="간격" value={c.pitch} min={PITCH_MM.min} max={PITCH_MM.max} busy={busy} onChange={(pitch) => edit(k, { ...c, pitch })} />
          <span className={css.unit}>mm</span>
        </>
      );
    return (
      <>
        <label className={css.amt}>
          <select disabled={busy} value={c.rule ?? POINT} aria-label="둘 곳" onChange={(e) => edit(k, { ...c, rule: e.target.value === POINT ? null : (e.target.value as Rule) })}>
            <option value={POINT}>칸 지정</option>
            {RULES.map((r) => (
              <option key={r} value={r}>
                규칙 · {RULE_TEXT[r]}
              </option>
            ))}
          </select>
        </label>
        {!c.rule && (
          <>
            <Num label="가로" value={c.c} min={1} max={BOARD.n} busy={busy} onChange={(v) => edit(k, { ...c, c: v })} />
            <Num label="세로" value={c.r} min={1} max={BOARD.n} busy={busy} onChange={(v) => edit(k, { ...c, r: v })} />
          </>
        )}
      </>
    );
  };

  const head = (
    <div className={css.head}>
      <span className={css.order} aria-label="게임">
        <em>GAME</em>
        <b>오목 9 × 9 · 흰 돌 {moves}수</b>
        <small>사람(검은 돌)이 먼저 가운데에 둬요</small>
      </span>
      <span className={css.times}>
        반복
        <button type="button" disabled={busy || recipe.times <= 1} onClick={() => set(recipe.cards, recipe.times - 1)} aria-label="한 번 줄이기">
          −
        </button>
        <em>{recipe.times}번</em>
        <button type="button" disabled={busy || recipe.times >= 12} onClick={() => set(recipe.cards, recipe.times + 1)} aria-label="한 번 늘리기">
          +
        </button>
      </span>
    </div>
  );
  const item = (c: (typeof recipe.cards)[number], k: number, solo = false) => {
    const rows = boardRows(recipe.cards, k, loop);
    const isOpen = solo || shown.has(k);
    const now = k === running && runningRow >= 0 ? rows[runningRow]?.text : null;
    const off = rows.find((r) => r.toggle && !r.on);
    return (
      <li key={k} className={css.card} data-step data-on={k === running || undefined} data-glow={(running < 0 && glow?.includes(k + 1)) || undefined} style={{ borderLeftColor: KIND_COLOR[c.k] }}>
        <span className={css.n}>{CIRCLED[k] ?? k + 1}</span>
        <div className={css.body}>
          <span className={css.title}>
            <b>{boardCardText(c).title}</b>
            {boxes(c, k)}
          </span>
          {!isOpen && <small className={css.sum}>{now ? `지금 · ${now}` : off ? `꺼짐 · ${off.text}` : `동작 ${rows.length}개`}</small>}
          {isOpen && (
            <ol className={css.rows}>
              {rows.map((r, i) => (
                <li key={i} data-on={(k === running && i === runningRow) || undefined} data-off={(r.toggle && !r.on) || undefined}>
                  {r.toggle && c.k === 'move' ? (
                    <label>
                      <input type="checkbox" disabled={busy} checked={!!r.on} onChange={(e) => edit(k, { ...c, wait: e.target.checked })} />
                      {r.text}
                    </label>
                  ) : (
                    <span>{r.text}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        {!solo && (
          <span className={css.tools}>
            <button type="button" className={css.more} onClick={() => toggleShown(k)} aria-expanded={isOpen} aria-label={isOpen ? '동작 접기' : '동작 펼치기'}>
              {isOpen ? '▴' : '▾'}
            </button>
            <button type="button" disabled={busy || k === 0} onClick={() => move(k, -1)} aria-label="위로">
              ▲
            </button>
            <button type="button" disabled={busy || k === recipe.cards.length - 1} onClick={() => move(k, 1)} aria-label="아래로">
              ▼
            </button>
            <button type="button" disabled={busy} onClick={() => remove(k)} aria-label="빼기">
              ✕
            </button>
          </span>
        )}
      </li>
    );
  };
  const list = (
    <ol className={css.list}>
      {recipe.cards.map((c, k) => item(c, k))}
      {!recipe.cards.length && <li className={css.empty}>아래 [+ 카드]로 공정을 차례로 넣어요.</li>}
    </ol>
  );
  const foot = (
    <div className={css.foot}>
      <button type="button" className={css.add} disabled={busy} aria-expanded={open} data-glow={(glowAdd && !open) || undefined} onClick={() => setOpen((o) => !o)}>
        + 카드
      </button>
      {answer && (
        <button
          type="button"
          className={css.ghost}
          disabled={busy}
          onClick={() => {
            if (window.confirm('지금 카드 대신 이 단계의 모범 공정을 불러올까요?')) setRecipe(copy(answer));
          }}
        >
          모범 공정 불러오기
        </button>
      )}
      <button type="button" className={css.ghost} disabled={busy} onClick={() => setRecipe(start(mission))}>
        처음으로
      </button>
    </div>
  );
  const palette = (
    <>
      {open && (
        <div className={css.palette} role="menu">
          {BOARD_PALETTE.map((c, k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              disabled={busy}
              style={{ borderLeftColor: KIND_COLOR[c.k] }}
              onClick={() => {
                set([...recipe.cards, { ...c }]);
                setOpen(false);
              }}
            >
              {boardCardText(c).title}
              <small>{boardCardText(c).note}</small>
            </button>
          ))}
        </div>
      )}
    </>
  );
  // 입문 퀘스트: the cards this quest changes, open; the whole recipe (order, every card, + 카드) under 자세히.
  const focus = flow && mission ? (QUESTS[mission]?.cards ?? []).map((n) => n - 1).filter((k) => k < recipe.cards.length) : null;
  if (!focus)
    return (
      <div className={css.recipe} data-flow={flow || undefined}>
        {head}
        {list}
        {foot}
        {palette}
      </div>
    );
  return (
    <div className={css.recipe} data-flow>
      {focus.length > 0 && <ol className={css.list}>{focus.map((k) => item(recipe.cards[k], k, true))}</ol>}
      <details className={css.moreAll}>
        <summary>자세히 ▾ · 카드 전체 {recipe.cards.length}장</summary>
        {head}
        {list}
        {foot}
        {palette}
      </details>
    </div>
  );
}
