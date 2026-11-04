'use client';

/**
 * 공정 카드 (입문 트랙 · 로봇 카페): the program as the café's process instead of code
 * (engine/simulator/cell/cafeRecipe.ts). On top, the order (주문, the step's: the drink, its amounts,
 * the cups); below, one card per process — ① 컵 → ② 얼음 → ③ 샷 → ④ 물 → ⑤ 건네기. A station card
 * holds its amount; ▾ opens it into its moves (놓기 → 양 정하고 시작 → [끝] 기다리기 → 집기), the
 * rows that may be switched carrying a switch. Every change makes the cell program at once
 * (onCode); the card and the row being run light up. [모범 순서 불러오기] loads the step's answer.
 * Keyed by the step (Console), so a new step starts from its own cards.
 */

import { useEffect, useMemo, useState } from 'react';

import { ICED_AMERICANO, orderName } from '@/engine/simulator/cell/cafe';
import { PALETTE, POURS, RECIPE_ANSWER, RECIPE_START, cardRows, cardText, recipeCode, type Card, type Recipe } from '@/engine/simulator/cell/cafeRecipe';
import { missionById } from '@/engine/simulator/cell/missions';

import css from './recipe.module.css';

// The kind of card, as a quiet stripe (the HUD keeps colour for meaning): the cup light, the
// stations mid-grey; amber where a person is (handing over).
const KIND_COLOR: Record<Card['k'], string> = {
  cup: '#d6dbe0',
  station: '#8a9199',
  serve: '#f0a23b',
};
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const copy = (r: Recipe): Recipe => ({ cards: r.cards.map((c) => ({ ...c })), times: r.times });

interface Props {
  /** The step (F1 … F4) or null (자유 실습). */
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

export default function RecipeCards({ mission, busy, runningLine, onCode, glow, glowAdd, flow }: Props) {
  const start = (m: string | null) => copy(RECIPE_START[m ?? ''] ?? { cards: [], times: 1 });
  const [recipe, setRecipe] = useState<Recipe>(() => start(mission));
  const [open, setOpen] = useState(false);
  // The cards opened (▾): the quest's cards to change start open, so their switch is in sight.
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set((glow ?? []).map((n) => n - 1)));
  const made = useMemo(() => recipeCode(recipe), [recipe]);
  useEffect(
    () =>
      onCode(made.code, (line) => {
        const k = made.lines.findIndex(([a, b]) => line >= a && line <= b);
        if (k < 0) return '';
        const r = made.rows[k].findIndex(([a, b]) => line >= a && line <= b);
        return `${CIRCLED[k] ?? k + 1} ${cardText(recipe.cards[k]).title}${r < 0 ? '' : ` · ${cardRows(recipe.cards[k])[r].text}`}`;
      }),
    [made, onCode, recipe.cards],
  );
  const setup = mission ? missionById(mission)?.setup : undefined;
  const order = setup?.order ?? ICED_AMERICANO;
  const cups = setup?.orders ?? 1;

  const set = (cards: Card[], times = recipe.times) => setRecipe({ cards, times });
  const edit = (k: number, c: Card) => set(recipe.cards.map((o, i) => (i === k ? c : o)));
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= recipe.cards.length) return;
    const cards = recipe.cards.slice();
    [cards[k], cards[j]] = [cards[j], cards[k]];
    set(cards);
    // The open cards go with their cards.
    setShown((s) => new Set([...s].map((i) => (i === k ? j : i === j ? k : i))));
  };
  const remove = (k: number) => {
    set(recipe.cards.filter((_, i) => i !== k));
    setShown((s) => new Set([...s].filter((i) => i !== k).map((i) => (i > k ? i - 1 : i))));
  };
  const toggleShown = (k: number) => setShown((s) => (s.has(k) ? new Set([...s].filter((i) => i !== k)) : new Set([...s, k])));
  const running = runningLine < 0 ? -1 : made.lines.findIndex(([a, b]) => runningLine >= a && runningLine <= b);
  const runningRow = running < 0 ? -1 : made.rows[running].findIndex(([a, b]) => runningLine >= a && runningLine <= b);
  const answer = mission ? RECIPE_ANSWER[mission] : undefined;

  /** The card's own switch (a row's): the wait for a station's 끝, or handing over through the door. */
  const flip = (k: number, c: Card, toggle: 'wait' | 'door', on: boolean) => {
    if (c.k === 'station' && toggle === 'wait') edit(k, { ...c, wait: on });
    if (c.k === 'serve' && toggle === 'door') edit(k, { ...c, door: on });
  };

  return (
    <div className={css.recipe} data-flow={flow || undefined}>
      <div className={css.head}>
        <span className={css.order} aria-label="주문">
          <em>ORDER</em>
          <b>
            {orderName(order)} · {cups}잔
          </b>
          <small>
            얼음 {order.ice} · 샷 {order.shots}개 · 물 {order.water} ml
          </small>
        </span>
        <span className={css.times}>
          잔 수
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
          const rows = cardRows(c);
          const isOpen = shown.has(k);
          const now = k === running && runningRow >= 0 ? rows[runningRow]?.text : null;
          return (
            <li key={k} className={css.card} data-step data-on={k === running || undefined} data-glow={(running < 0 && glow?.includes(k + 1)) || undefined} style={{ borderLeftColor: KIND_COLOR[c.k] }}>
              <span className={css.n}>{CIRCLED[k] ?? k + 1}</span>
              <div className={css.body}>
                <span className={css.title}>
                  <b>{t.title}</b>
                  {c.k === 'station' ? (
                    <label className={css.amt}>
                      <span>{POURS[c.what].station}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={POURS[c.what].min}
                        max={POURS[c.what].max}
                        step={POURS[c.what].step}
                        value={c.amount}
                        disabled={busy}
                        aria-label={`${t.title} 양`}
                        onChange={(e) => {
                          const p = POURS[c.what];
                          edit(k, { ...c, amount: Math.max(p.min, Math.min(p.max, Math.round(Number(e.target.value) || 0))) });
                        }}
                      />
                      <span>{POURS[c.what].unit === 'shot' ? '샷' : 'ml'}</span>
                    </label>
                  ) : (
                    <small>{t.note}</small>
                  )}
                </span>
                {!isOpen && <small className={css.sum}>{now ? `지금 · ${now}` : rows.filter((r) => r.toggle && !r.on).map((r) => `꺼짐 · ${r.text}`)[0] ?? `동작 ${rows.length}개`}</small>}
                {isOpen && (
                  <ol className={css.rows}>
                    {rows.map((r, i) => (
                      <li key={i} data-on={(k === running && i === runningRow) || undefined} data-off={(r.toggle && !r.on) || undefined}>
                        {r.toggle ? (
                          <label>
                            <input type="checkbox" disabled={busy} checked={!!r.on} onChange={(e) => flip(k, c, r.toggle!, e.target.checked)} />
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
            </li>
          );
        })}
        {!recipe.cards.length && <li className={css.empty}>아래 [+ 카드]로 공정을 차례로 넣어요.</li>}
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
              <small>{cardText(c).note}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
