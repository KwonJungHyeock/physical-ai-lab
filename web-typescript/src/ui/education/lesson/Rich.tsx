'use client';

/**
 * Lesson text with glossary terms and symbols:
 *   [[용어]]  underlined; pressing it opens a bubble with the plain meaning (and the English term)
 *   [실행]    a button or slider on screen, drawn like a key
 *   `Kp`      a symbol chip; pressing it opens how it is read, what it means and its unit.
 *             The first one on a page (`Kp`*) carries its short name above it in small type.
 * The topic's symbols come from <SymbolsProvider> (LearnView wraps the controls and the theory).
 */

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { findTerm, type Term } from '@/engine/education/glossary';
import { sentencesOf } from '@/engine/education/sentences';
import { splitRich, type Sym } from '@/engine/education/symbols';

import css from '../learn.module.css';

const Symbols = createContext<readonly Sym[]>([]);

export function SymbolsProvider({ symbols, children }: { symbols: readonly Sym[]; children: ReactNode }) {
  return <Symbols.Provider value={symbols}>{children}</Symbols.Provider>;
}

/** Plain text (no terms or symbols), one sentence per line. */
export function Lines({ text }: { text: string }) {
  const parts = sentencesOf(text);
  if (parts.length < 2) return <>{text}</>;
  return (
    <>
      {parts.map((t, i) => (
        <span key={i} className={css.line}>
          {t}
        </span>
      ))}
    </>
  );
}

/**
 * `inert`: no buttons inside (for text that sits in a button, like a quiz choice) — symbols set, terms plain.
 * Text of two or more sentences is set one sentence per line (`inline` keeps it running).
 */
export function Rich({ text, inert, inline }: { text: string; inert?: boolean; inline?: boolean }) {
  const parts = inert || inline ? [text] : sentencesOf(text);
  if (parts.length > 1)
    return (
      <>
        {parts.map((t, i) => (
          <span key={i} className={css.line}>
            <RichRun text={t} />
          </span>
        ))}
      </>
    );
  return <RichRun text={text} inert={inert} />;
}

function RichRun({ text, inert }: { text: string; inert?: boolean }) {
  if (inert)
    return (
      <>
        {splitRich(text).map((p, i) =>
          'sym' in p ? <SymGlyph key={i} sym={p.sym} /> : 'ui' in p ? <UiKey key={i} name={p.ui} /> : <span key={i}>{'term' in p ? p.shown : p.text}</span>,
        )}
      </>
    );
  return (
    <>
      {splitRich(text).map((p, i) =>
        'term' in p ? (
          <TermWord key={i} term={p.term} shown={p.shown} />
        ) : 'sym' in p ? (
          <SymWord key={i} sym={p.sym} gloss={p.gloss} />
        ) : 'ui' in p ? (
          <UiKey key={i} name={p.ui} />
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** A button or slider name on screen, drawn like a key so it is easy to find: [실행]. */
export function UiKey({ name }: { name: string }) {
  return (
    <kbd className={css.uiKey} title="화면의 버튼·슬라이더 이름">
      {name}
    </kbd>
  );
}

/** Closes a bubble on a press outside it or Esc. */
function useBubble() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return { open, setOpen, box };
}

export function TermWord({ term, shown, chip }: { term: Term; shown?: string; chip?: boolean }) {
  const { open, setOpen, box } = useBubble();
  const id = useId();
  return (
    <span className={css.termWrap} ref={box}>
      <button type="button" className={chip ? css.termChip : css.term} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        {shown ?? term.ko}
      </button>
      {open && (
        <span role="tooltip" id={id} className={css.termBubble}>
          <b>
            {term.ko} <small>{term.en}</small>
          </b>
          <span>{term.short}</span>
          {term.more && <span className={css.termMore}>{term.more}</span>}
        </span>
      )}
    </span>
  );
}

/** How a symbol is set: letters in italic serif like a textbook, subscripts and Greek kept. */
export function SymGlyph({ sym }: { sym: string }) {
  return <span className={css.symGlyph}>{sym}</span>;
}

/**
 * A symbol in the text. `gloss` adds its short name after it ("Kp 비례 게인");
 * unknown symbols (not in the topic's 기호) show plain.
 */
export function SymWord({ sym, gloss }: { sym: string; gloss?: boolean }) {
  const s = useContext(Symbols).find((x) => x.sym === sym);
  const { open, setOpen, box } = useBubble();
  const id = useId();
  if (!s) return <SymGlyph sym={sym} />;
  return (
    <span className={css.termWrap} ref={box}>
      <button type="button" className={css.sym} aria-expanded={open} aria-describedby={open ? id : undefined} aria-label={`${sym} (${s.name})`} onClick={() => setOpen((o) => !o)}>
        {gloss ? (
          // The name rides above the letter (ruby), so the sentence reads on without a break.
          <ruby>
            <SymGlyph sym={sym} />
            <rt className={css.symGloss}>{s.name}</rt>
          </ruby>
        ) : (
          <SymGlyph sym={sym} />
        )}
      </button>
      {open && (
        <span role="tooltip" id={id} className={css.termBubble}>
          <b>
            <SymGlyph sym={sym} /> {s.name} <small>읽기: {s.read}</small>
          </b>
          {s.meaning && <span>{s.meaning}</span>}
          <span className={css.termMore}>단위: {s.unit}</span>
        </span>
      )}
    </span>
  );
}

/** For the topic panels: a control's letter with its name under it (<Sym s="Kp" /> → Kp / 비례 게인). */
export function Sym({ s, name = true }: { s: string; name?: boolean }) {
  const d = useContext(Symbols).find((x) => x.sym === s);
  return (
    <span className={css.symLabel} title={d ? `${d.name}${d.meaning ? `: ${d.meaning}` : ''} (단위: ${d.unit})` : undefined}>
      <SymGlyph sym={s} />
      {name && d && <small>{d.name}</small>}
    </span>
  );
}

/** "이 주제의 기호" — every letter the topic uses, how to read it, what it is, its unit. */
export function SymbolTable({ symbols }: { symbols: readonly Sym[] }) {
  if (!symbols.length) return null;
  return (
    <section className={css.symTable} aria-label="이 주제의 기호">
      <h3>
        <span aria-hidden="true">Σ</span> 이 주제의 기호
      </h3>
      <table>
        <thead>
          <tr>
            <th>기호</th>
            <th>읽기</th>
            <th>뜻</th>
            <th>단위</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((s) => (
            <tr key={s.sym}>
              <td>
                <SymGlyph sym={s.sym} />
              </td>
              <td>{s.read}</td>
              <td>
                <b>{s.name}</b>
                {s.meaning && <span>: {s.meaning}</span>}
              </td>
              <td>{s.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TermChips({ keys }: { keys: readonly string[] }) {
  return (
    <span className={css.termChips}>
      {keys.map((k) => {
        const t = findTerm(k);
        return t ? <TermWord key={k} term={t} chip /> : null;
      })}
    </span>
  );
}
