'use client';

/**
 * 입문 과정 (경미 묶음 3): a number box that keeps what is typed as it is typed. Pressed (focus), its whole value
 * is selected (each press, also when it has the focus already), so a new number replaces it. While typing nothing is limited: the value is passed on only when
 * it is already a number within min · max (else the box just shows the typing). Once set (blur or Enter) the
 * number is brought within min · max (and to a whole number with `whole`); an empty box goes back to the last
 * value, or stays empty where `empty` allows it (the 꼭짓점 표's new rows).
 * (150 in the box, '160' typed after it: 150160 shows, and becomes the max only when the box is left.)
 */

import { useRef, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'defaultValue' | 'onMouseDown'> & {
  value: number | string;
  min?: number;
  max?: number;
  /** Whole numbers only (rounded once set). */
  whole?: boolean;
  /** An empty box is a value too (else it goes back to the last value). */
  empty?: boolean;
  /** The value as a string: while typing (only when it already fits) and once set. */
  onValue(v: string): void;
};

export default function NumberBox({ value, min, max, whole, empty, onValue, onFocus, onBlur, onKeyDown, onMouseUp, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  /** Just focused by a press: the mouse-up that follows would put the caret in and undo the selection. */
  const fresh = useRef(false);
  const num = (t: string) => (t.trim() === '' ? NaN : Number(t));
  const fits = (t: string) => {
    if (t.trim() === '') return !!empty;
    const n = num(t);
    return Number.isFinite(n) && (!whole || Number.isInteger(n)) && (min === undefined || n >= min) && (max === undefined || n <= max);
  };
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() === '') {
      if (empty && String(value) !== '') onValue('');
      return;
    }
    let n = num(draft);
    if (!Number.isFinite(n)) return;
    if (whole) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (String(n) !== String(value)) onValue(String(n));
  };
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={draft ?? value}
      onFocus={(e) => {
        fresh.current = true;
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onMouseDown={() => {
        // Pressed again while it has the focus (after Enter): the whole value is selected again too.
        fresh.current = true;
      }}
      onMouseUp={(e) => {
        if (fresh.current) {
          e.preventDefault();
          e.currentTarget.select();
        }
        fresh.current = false;
        onMouseUp?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value;
        fresh.current = false;
        setDraft(t);
        if (fits(t) && t !== String(value)) onValue(t);
      }}
      onBlur={(e) => {
        fresh.current = false;
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          // Set: the box still has the focus, its new value selected again (a next number replaces it).
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }
        onKeyDown?.(e);
      }}
    />
  );
}
