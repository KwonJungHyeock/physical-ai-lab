'use client';

/**
 * 작업 순서 카드 (입문 트랙 · 로봇 캘리그라피): the program as cards instead of code
 * (engine/simulator/cell/drawRecipe.ts). The settings cards (카드 위치, 펜 높이) take numbers, the
 * 쓰기 card a phrase and two switches (직선 이동, 획 사이 펜 들기); every change makes the cell
 * program at once (onCode) and the card being run lights up. [모범 순서 불러오기] loads the step's
 * ready answer. Keyed by the step (Console), so a new step starts from its own cards.
 */

import { useEffect, useMemo, useState } from 'react';

import { DRAW_PALETTE, G_ANSWER, G_START, PEN_Z, PHRASES, drawCardText, drawCode, type DrawCard, type DrawRecipe } from '@/engine/simulator/cell/drawRecipe';
import type { Phrase } from '@/engine/simulator/cell/draw';

import css from './recipe.module.css';

const KIND_COLOR: Record<DrawCard['k'], string> = {
  wait: '#c2410c',
  corner: '#8a5a2b',
  pen: '#8a5a2b',
  write: '#2f6fed',
  home: '#6b7280',
  done: '#0f766e',
};

const copy = (r: DrawRecipe): DrawRecipe => ({
  cards: r.cards.map((c) => ({ ...c })),
  times: r.times,
});

interface Props {
  /** The step (G1 … G6) or null (자유 실습). */
  mission: string | null;
  busy: boolean;
  /** The program line running now (the card that made it lights up); -1 when none. */
  runningLine: number;
  onCode(code: string): void;
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

export default function DrawCards({ mission, busy, runningLine, onCode }: Props) {
  const start = (m: string | null) => copy(G_START[m ?? ''] ?? { cards: [], times: 1 });
  const [recipe, setRecipe] = useState<DrawRecipe>(() => start(mission));
  const [open, setOpen] = useState(false);
  const made = useMemo(() => drawCode(recipe), [recipe]);
  useEffect(() => onCode(made.code), [made.code, onCode]);

  const set = (cards: DrawCard[], times = recipe.times) => setRecipe({ cards, times });
  const edit = (k: number, c: DrawCard) => set(recipe.cards.map((o, i) => (i === k ? c : o)));
  const move = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= recipe.cards.length) return;
    const cards = recipe.cards.slice();
    [cards[k], cards[j]] = [cards[j], cards[k]];
    set(cards);
  };
  const running = runningLine < 0 ? -1 : made.lines.findIndex(([a, b]) => runningLine >= a && runningLine <= b);
  const answer = mission ? G_ANSWER[mission] : undefined;

  const body = (c: DrawCard, k: number) => {
    const t = drawCardText(c);
    switch (c.k) {
      case 'corner':
        return (
          <>
            <b className={css.title}>카드 위치 (왼쪽 아래 모서리)</b>
            <span className={css.nums}>
              <Num label="x" value={c.x} min={100} max={300} busy={busy} onChange={(x) => edit(k, { ...c, x })} />
              <Num label="y" value={c.y} min={-100} max={80} busy={busy} onChange={(y) => edit(k, { ...c, y })} />
              <small>mm · 매트 눈금으로 읽어요</small>
            </span>
          </>
        );
      case 'pen':
        return (
          <>
            <b className={css.title}>펜 높이</b>
            <span className={css.nums}>
              <Num label="종이 위" value={c.z} min={PEN_Z.min} max={PEN_Z.max} busy={busy} onChange={(z) => edit(k, { ...c, z })} />
              <small>mm · 0이면 종이에 닿아요</small>
            </span>
          </>
        );
      case 'write':
        return (
          <>
            <label className={css.title}>
              <select disabled={busy} value={c.phrase} onChange={(e) => edit(k, { ...c, phrase: e.target.value as Phrase })}>
                {PHRASES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              쓰기
            </label>
            <span className={css.switches}>
              <label className={css.wait}>
                <input type="checkbox" disabled={busy} checked={c.straight} onChange={(e) => edit(k, { ...c, straight: e.target.checked })} />
                직선 이동
              </label>
              <label className={css.wait}>
                <input type="checkbox" disabled={busy} checked={c.lift} onChange={(e) => edit(k, { ...c, lift: e.target.checked })} />획 사이 펜 들기
              </label>
            </span>
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
    <div className={css.recipe}>
      <div className={css.head}>
        <b>작업 순서</b>
        <span className={css.times}>
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
      <ol className={css.list}>
        {recipe.cards.map((c, k) => (
          <li key={k} className={css.card} data-on={k === running || undefined} style={{ borderLeftColor: KIND_COLOR[c.k] }}>
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
