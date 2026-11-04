'use client';

/**
 * 작업 순서 카드 (입문 트랙 · 로봇 카페): the program as a list of cards instead of code
 * (engine/simulator/cell/cafeRecipe.ts). The student puts cards in order, picks where a cup goes,
 * says whether to wait for a station's 끝 signal, sets how many drinks, and presses ▶ 시뮬레이션.
 * Every change makes the cell program at once (onCode); the card being run lights up.
 * [모범 순서 불러오기] loads the step's ready answer — the provided program, run as it is.
 * Keyed by the step (Console), so a new step starts from its own cards.
 */

import { useEffect, useMemo, useState } from 'react';

import { CAFE_SPOTS, PALETTE, POURS, RECIPE_ANSWER, RECIPE_START, cardText, recipeCode, type CafeSpot, type Card, type Recipe } from '@/engine/simulator/cell/cafeRecipe';

import css from './recipe.module.css';

// The kind of card, as a quiet stripe (the HUD keeps colour for meaning): moves light, waits on a
// machine mid-grey, settings dark; amber where a person is (the door, the customer).
const KIND_COLOR: Record<Card['k'], string> = {
  cup: '#8a9199',
  place: '#d6dbe0',
  pick: '#d6dbe0',
  pour: '#8a9199',
  home: '#5f666e',
  open: '#f0a23b',
  customer: '#f0a23b',
  close: '#f0a23b',
};

const copy = (r: Recipe): Recipe => ({ cards: r.cards.map((c) => ({ ...c })), times: r.times });

interface Props {
  /** The step (F1 … F6) or null (자유 실습). */
  mission: string | null;
  busy: boolean;
  /** The program line running now (the card that made it lights up); -1 when none. */
  runningLine: number;
  /** The program, and the card a program line came from (for the replay bar: no code is shown). */
  onCode(code: string, cardOf: (line: number) => string): void;
}

export default function RecipeCards({ mission, busy, runningLine, onCode }: Props) {
  const start = (m: string | null) => copy(RECIPE_START[m ?? ''] ?? { cards: [], times: 1 });
  const [recipe, setRecipe] = useState<Recipe>(() => start(mission));
  const [open, setOpen] = useState(false);
  const made = useMemo(() => recipeCode(recipe), [recipe]);
  useEffect(
    () =>
      onCode(made.code, (line) => {
        const k = made.lines.findIndex(([a, b]) => line >= a && line <= b);
        return k < 0 ? '' : `카드 ${k + 1} · ${cardText(recipe.cards[k]).title}`;
      }),
    [made, onCode, recipe.cards],
  );

  const set = (cards: Card[], times = recipe.times) => setRecipe({ cards, times });
  const edit = (k: number, c: Card) => set(recipe.cards.map((o, i) => (i === k ? c : o)));
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= recipe.cards.length) return;
    const cards = recipe.cards.slice();
    [cards[k], cards[j]] = [cards[j], cards[k]];
    set(cards);
  };
  const running = runningLine < 0 ? -1 : made.lines.findIndex(([a, b]) => runningLine >= a && runningLine <= b);
  const answer = mission ? RECIPE_ANSWER[mission] : undefined;

  return (
    <div className={css.recipe}>
      <div className={css.head}>
        <b>작업 순서</b>
        <span className={css.times}>
          음료
          <button type="button" disabled={busy || recipe.times <= 1} onClick={() => set(recipe.cards, recipe.times - 1)} aria-label="한 잔 줄이기">
            −
          </button>
          <em>{recipe.times}잔</em>
          <button type="button" disabled={busy || recipe.times >= 3} onClick={() => set(recipe.cards, recipe.times + 1)} aria-label="한 잔 늘리기">
            +
          </button>
        </span>
      </div>
      <ol className={css.list}>
        {recipe.cards.map((c, k) => {
          const t = cardText(c);
          return (
            <li key={k} className={css.card} data-on={k === running || undefined} style={{ borderLeftColor: KIND_COLOR[c.k] }}>
              <span className={css.n}>{k + 1}</span>
              <div className={css.body}>
                {c.k === 'place' || c.k === 'pick' ? (
                  <label className={css.title}>
                    <select
                      disabled={busy}
                      value={c.k === 'place' ? c.to : c.from}
                      onChange={(e) => edit(k, c.k === 'place' ? { k: 'place', to: e.target.value as CafeSpot } : { k: 'pick', from: e.target.value as CafeSpot })}
                    >
                      {CAFE_SPOTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {c.k === 'place' ? '에 놓기' : '에서 집기'}
                  </label>
                ) : (
                  <b className={css.title}>{t.title}</b>
                )}
                {c.k === 'pour' ? (
                  <label className={css.wait}>
                    <input type="checkbox" disabled={busy} checked={c.wait} onChange={(e) => edit(k, { ...c, wait: e.target.checked })} />
                    [{POURS[c.what].done}]까지 기다리기
                  </label>
                ) : (
                  <small>{t.note}</small>
                )}
              </div>
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
          );
        })}
        {!recipe.cards.length && <li className={css.empty}>아래 [+ 카드]로 로봇이 할 일을 차례로 넣어요.</li>}
      </ol>
      <div className={css.foot}>
        <button type="button" className={css.add} disabled={busy} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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
          {PALETTE.map((c, k) => (
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
              {cardText(c).title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
