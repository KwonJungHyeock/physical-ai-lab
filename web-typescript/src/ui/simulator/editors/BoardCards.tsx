'use client';

/**
 * 작업 순서 카드 (입문 트랙 · 보드게임 로봇): the program as cards instead of code
 * (engine/simulator/cell/boardRecipe.ts). The 판 위치 · 칸 간격 card takes numbers, a 두기 card a
 * point (가로 · 세로), the 규칙으로 두기 card a rule; every change makes the cell program at once
 * (onCode) and the card being run lights up. [모범 순서 불러오기] loads the step's ready answer.
 * Keyed by the step (Console), so a new step starts from its own cards.
 */

import { useEffect, useMemo, useState } from 'react';

import { BOARD, RULES, RULE_TEXT, type Rule } from '@/engine/simulator/cell/board';
import { BOARD_PALETTE, H_ANSWER, H_START, PITCH_MM, boardCardText, boardCode, type BoardCard, type BoardRecipe } from '@/engine/simulator/cell/boardRecipe';

import css from './recipe.module.css';

// The kind of card, as a quiet stripe (the HUD keeps colour for meaning): moves light, settings
// dark, taking a stone mid-grey; amber where the person is (waiting for the turn).
const KIND_COLOR: Record<BoardCard['k'], string> = {
  wait: '#f0a23b',
  board: '#5f666e',
  take: '#8a9199',
  put: '#d6dbe0',
  rule: '#d6dbe0',
  home: '#5f666e',
};

const copy = (r: BoardRecipe): BoardRecipe => ({ cards: r.cards.map((c) => ({ ...c })), times: r.times });

interface Props {
  /** The step (H1 … H4) or null (자유 실습). */
  mission: string | null;
  busy: boolean;
  /** The program line running now (the card that made it lights up); -1 when none. */
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
    <label className={css.num}>
      {label}
      <input type="number" inputMode="numeric" min={min} max={max} step={1} value={value} disabled={busy} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
    </label>
  );
}

export default function BoardCards({ mission, busy, runningLine, onCode, glow, glowAdd, flow }: Props) {
  const start = (m: string | null) => copy(H_START[m ?? ''] ?? { cards: [], times: 1 });
  const [recipe, setRecipe] = useState<BoardRecipe>(() => start(mission));
  const [open, setOpen] = useState(false);
  const made = useMemo(() => boardCode(recipe), [recipe]);
  useEffect(
    () =>
      onCode(made.code, (line) => {
        const k = made.lines.findIndex(([a, b]) => line >= a && line <= b);
        return k < 0 ? '' : `카드 ${k + 1} · ${boardCardText(recipe.cards[k]).title}`;
      }),
    [made, onCode, recipe.cards],
  );

  const set = (cards: BoardCard[], times = recipe.times) => setRecipe({ cards, times });
  const edit = (k: number, c: BoardCard) => set(recipe.cards.map((o, i) => (i === k ? c : o)));
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= recipe.cards.length) return;
    const cards = recipe.cards.slice();
    [cards[k], cards[j]] = [cards[j], cards[k]];
    set(cards);
  };
  const running = runningLine < 0 ? -1 : made.lines.findIndex(([a, b]) => runningLine >= a && runningLine <= b);
  const answer = mission ? H_ANSWER[mission] : undefined;

  const body = (c: BoardCard, k: number) => {
    const t = boardCardText(c);
    switch (c.k) {
      case 'board':
        return (
          <>
            <b className={css.title}>판 위치 · 칸 간격</b>
            <span className={css.nums}>
              <Num label="가로 1 x" value={c.x} min={100} max={200} busy={busy} onChange={(x) => edit(k, { ...c, x })} />
              <Num label="세로 1 y" value={c.y} min={-100} max={0} busy={busy} onChange={(y) => edit(k, { ...c, y })} />
              <Num label="간격" value={c.pitch} min={PITCH_MM.min} max={PITCH_MM.max} busy={busy} onChange={(pitch) => edit(k, { ...c, pitch })} />
              <small>mm · 판 가장자리 눈금으로 읽어요</small>
            </span>
          </>
        );
      case 'put':
        return (
          <>
            <b className={css.title}>칸에 두기</b>
            <span className={css.nums}>
              <Num label="가로" value={c.c} min={1} max={BOARD.n} busy={busy} onChange={(v) => edit(k, { ...c, c: v })} />
              <Num label="세로" value={c.r} min={1} max={BOARD.n} busy={busy} onChange={(v) => edit(k, { ...c, r: v })} />
              <small>판 위치 · 칸 간격으로 좌표를 계산해요</small>
            </span>
          </>
        );
      case 'rule':
        return (
          <>
            <label className={css.title}>
              <select disabled={busy} value={c.rule} onChange={(e) => edit(k, { ...c, rule: e.target.value as Rule })}>
                {RULES.map((r) => (
                  <option key={r} value={r}>
                    {RULE_TEXT[r]}
                  </option>
                ))}
              </select>
              로 두기
            </label>
            <small>판 센서로 돌을 읽고 규칙으로 칸을 골라요</small>
          </>
        );
      default:
        return (
          <>
            <b className={css.title}>{t.title}</b>
            <small>{t.note}</small>
          </>
        );
    }
  };

  return (
    <div className={css.recipe} data-flow={flow || undefined}>
      <div className={css.head}>
        <b>작업 순서</b>
        <span className={css.times}>
          반복
          <button type="button" disabled={busy || recipe.times <= 1} onClick={() => set(recipe.cards, recipe.times - 1)} aria-label="한 번 줄이기">
            −
          </button>
          <em>{recipe.times}수</em>
          <button type="button" disabled={busy || recipe.times >= 12} onClick={() => set(recipe.cards, recipe.times + 1)} aria-label="한 번 늘리기">
            +
          </button>
        </span>
      </div>
      <ol className={css.list}>
        {recipe.cards.map((c, k) => (
          <li key={k} className={css.card} data-on={k === running || undefined} data-glow={(running < 0 && glow?.includes(k + 1)) || undefined} style={{ borderLeftColor: KIND_COLOR[c.k] }}>
            <span className={css.n}>{k + 1}</span>
            <div className={css.body}>{body(c, k)}</div>
            <span className={css.tools}>
              <button type="button" disabled={busy || k === 0} onClick={() => move(k, -1)} aria-label="위로">
                ▲
              </button>
              <button type="button" disabled={busy || k === recipe.cards.length - 1} onClick={() => move(k, 1)} aria-label="아래로">
                ▼
              </button>
              <button type="button" disabled={busy} onClick={() => set(recipe.cards.filter((_, i) => i !== k))} aria-label="빼기">
                ✕
              </button>
            </span>
          </li>
        ))}
        {!recipe.cards.length && <li className={css.empty}>아래 [+ 카드]로 로봇이 할 일을 차례로 넣어요.</li>}
      </ol>
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
              if (window.confirm('지금 카드 대신 이 단계의 모범 순서를 불러올까요?')) setRecipe(copy(answer));
            }}
          >
            모범 순서 불러오기
          </button>
        )}
        <button type="button" className={css.ghost} disabled={busy} onClick={() => setRecipe(start(mission))}>
          처음으로
        </button>
      </div>
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
