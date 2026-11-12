'use client';

/**
 * 공정 카드 (입문 트랙 · 로봇 캘리그라피): the program as the booth's process instead of code
 * (engine/simulator/cell/drawRecipe.ts), as the other places (the café: CafeMaker.tsx). On top, the order (the
 * customer's phrase, the cards to write); below, ① 카드 받기 → ② 보정 (카드 위치 · 펜 높이: number
 * boxes) → ③ 쓰기 (the phrase; ▾ opens its rows, two of them switches: 직선 이동, 획 사이 펜 들기)
 * → ④ 건네기. Every change makes the cell program at once (onCode); the card and the row being run
 * light up. [모범 공정 불러오기] loads the step's answer. Keyed by the step (Console).
 */

import { useEffect, useMemo, useState } from 'react';

import { DRAW_PALETTE, G_ANSWER, G_START, PEN_Z, PHRASES, drawCardText, drawCode, drawRows, type DrawCard, type DrawRecipe } from '@/engine/simulator/cell/drawRecipe';
import { MAT, type Phrase } from '@/engine/simulator/cell/draw';
import { missionById } from '@/engine/simulator/cell/missions';
import { QUESTS } from '@/engine/simulator/cell/quests';

import css from './recipe.module.css';

// The kind of card, as a quiet stripe (the HUD keeps colour for meaning): the setting dark, the
// writing light; amber where a person is (the customer's card coming and going).
const KIND_COLOR: Record<DrawCard['k'], string> = {
  receive: '#f0a23b',
  setup: '#5f666e',
  write: '#d6dbe0',
  give: '#f0a23b',
};
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const copy = (r: DrawRecipe): DrawRecipe => ({ cards: r.cards.map((c) => ({ ...c })), times: r.times });

interface Props {
  /** The step (G1 … G4) or null (자유 실습). */
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
  /** The cards as they stand now (입문 과정 5-2: which of its steps is done). */
  onRecipe?: (r: DrawRecipe) => void;
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

export default function DrawCards({ mission, busy, runningLine, onCode, glow, glowAdd, flow, onRecipe }: Props) {
  const start = (m: string | null) => copy(G_START[m ?? ''] ?? { cards: [], times: 1 });
  const [recipe, setRecipe] = useState<DrawRecipe>(() => start(mission));
  const [open, setOpen] = useState(false);
  // The cards opened (▾): the quest's cards to change start open, so their boxes and switches are in sight.
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set((glow ?? []).map((n) => n - 1)));
  const made = useMemo(() => drawCode(recipe), [recipe]);
  useEffect(() => onRecipe?.(recipe), [recipe, onRecipe]);
  useEffect(
    () =>
      onCode(made.code, (line) => {
        const k = made.lines.findIndex(([a, b]) => line >= a && line <= b);
        if (k < 0) return '';
        const r = made.rows[k].findIndex(([a, b]) => line >= a && line <= b);
        return `${flow ? '' : `${CIRCLED[k] ?? k + 1} `}${drawCardText(recipe.cards[k]).title}${r < 0 ? '' : ` · ${drawRows(recipe.cards[k])[r].text}`}`;
      }),
    [made, onCode, recipe.cards, flow],
  );
  // The order: the customer's phrase (the step's answer writes it) and how many cards.
  const answer = mission ? G_ANSWER[mission] : undefined;
  const phrase = answer?.cards.find((c) => c.k === 'write');
  const customers = (mission ? missionById(mission)?.setup?.orders : undefined) ?? 1;

  const set = (cards: DrawCard[], times = recipe.times) => setRecipe({ cards, times });
  const edit = (k: number, c: DrawCard) => set(recipe.cards.map((o, i) => (i === k ? c : o)));
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

  const flip = (k: number, c: DrawCard, toggle: 'straight' | 'lift', on: boolean) => {
    if (c.k === 'write') edit(k, { ...c, [toggle]: on });
  };

  /** The card's own boxes (the closed card's title line). */
  const boxes = (c: DrawCard, k: number) => {
    switch (c.k) {
      case 'setup':
        return (
          <>
            <Num label="x" value={c.x} min={MAT.x0} max={MAT.x1} busy={busy} onChange={(x) => edit(k, { ...c, x })} />
            <Num label="y" value={c.y} min={MAT.y0} max={MAT.y1} busy={busy} onChange={(y) => edit(k, { ...c, y })} />
            <Num label="펜" value={c.z} min={PEN_Z.min} max={PEN_Z.max} busy={busy} onChange={(z) => edit(k, { ...c, z })} />
            <span className={css.unit}>mm</span>
          </>
        );
      case 'write':
        return (
          <label className={css.amt}>
            <select disabled={busy} value={c.phrase} aria-label="쓸 글자" onChange={(e) => edit(k, { ...c, phrase: e.target.value as Phrase })}>
              {PHRASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        );
      default:
        return <small>{drawCardText(c).note}</small>;
    }
  };

  const head = (
    <div className={css.head}>
      <span className={css.order} aria-label="주문">
        <em>ORDER</em>
        <b>
          손님 {customers}명 · &apos;{phrase?.k === 'write' ? phrase.phrase : '자유'}&apos;
        </b>
        <small>카드 한 장에 한 번씩 써서 건네요</small>
      </span>
      <span className={css.times} data-lead="times">
        손님
        <button type="button" disabled={busy || recipe.times <= 1} onClick={() => set(recipe.cards, recipe.times - 1)} aria-label="한 명 줄이기">
          −
        </button>
        <em>{recipe.times}명</em>
        <button type="button" disabled={busy || recipe.times >= 3} onClick={() => set(recipe.cards, recipe.times + 1)} aria-label="한 명 늘리기">
          +
        </button>
      </span>
    </div>
  );
  const item = (c: (typeof recipe.cards)[number], k: number, solo = false) => {
    const rows = drawRows(c);
    const isOpen = solo || shown.has(k);
    const now = k === running && runningRow >= 0 ? rows[runningRow]?.text : null;
    const off = rows.find((r) => r.toggle && !r.on);
    return (
      <li key={k} className={css.card} data-step data-flow={flow || undefined} data-on={k === running || undefined} data-glow={(running < 0 && glow?.includes(k + 1)) || undefined} style={{ borderLeftColor: KIND_COLOR[c.k] }}>
        {/* 퀘스트 모드: no card number (the numbers on screen are the order to press, 지시서 v1). */}
        {!flow && <span className={css.n}>{CIRCLED[k] ?? k + 1}</span>}
        <div className={css.body}>
          <span className={css.title}>
            <b>{drawCardText(c).title}</b>
            {boxes(c, k)}
          </span>
          {!isOpen && <small className={css.sum}>{now ? `지금 · ${now}` : off ? `꺼짐 · ${off.text}` : `동작 ${rows.length}개`}</small>}
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
      <button type="button" className={css.add} disabled={busy} aria-expanded={open} data-lead="add-card" data-glow={(glowAdd && !open) || undefined} onClick={() => setOpen((o) => !o)}>
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
          {DRAW_PALETTE.map((c, k) => (
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
              {drawCardText(c).title}
              <small>{drawCardText(c).note}</small>
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
  // The quest's own controls: the repeat when it sets it; when it adds a card, [+ 카드] and the cards added.
  const q = mission ? QUESTS[mission] : undefined;
  const startN = start(mission).cards.length;
  const shownCards = [...focus, ...(q?.add ? recipe.cards.map((_, k) => k).filter((k) => k >= startN) : [])];
  return (
    <div className={css.recipe} data-flow>
      {q?.times && head}
      {shownCards.length > 0 && <ol className={css.list}>{shownCards.map((k) => item(recipe.cards[k], k, true))}</ol>}
      {q?.add && (
        <>
          {foot}
          {palette}
        </>
      )}
      <details className={css.moreAll}>
        <summary>자세히 ▾ · 카드 전체 {recipe.cards.length}장</summary>
        {!q?.times && head}
        {list}
        {!q?.add && foot}
        {!q?.add && palette}
      </details>
    </div>
  );
}
