'use client';

/**
 * 코딩 탭의 튜토리얼 (engine: tutorials.ts): the language row (블록 · Python · ROS 2), the
 * tutorial card with its steps, the "지금 할 일" bar, the program with only its yellow places open
 * (고칠 곳만) and the mission snippets put in with one press. Chosen = raised tile with a red mark;
 * a place to change = yellow; the rest of the program is locked until 전체 편집.
 */

import { useEffect, useRef, type ReactNode } from 'react';

import type { Level, Practice } from '@/engine/simulator/practices';
import { findSlots, insertSnippet, setSlot, type Tutorial } from '@/engine/simulator/tutorials';

import { highlight } from './CodeEditor';
import css from './tutorial.module.css';

export const LANGS: { level: Level; name: string; sub: string }[] = [
  { level: 'basic', name: '블록', sub: '초급' },
  { level: 'python', name: 'Python', sub: '중급' },
  { level: 'ros', name: 'ROS 2', sub: '고급' },
];

export function LangSeg({ level, busy, onLevel }: { level: Level; busy: boolean; onLevel(l: Level): void }) {
  return (
    <div className={css.langs} role="tablist" aria-label="코딩 언어">
      {LANGS.map((l) => (
        <button key={l.level} type="button" role="tab" aria-selected={level === l.level} disabled={busy && level !== l.level} onClick={() => onLevel(l.level)}>
          {l.name} <small>{l.sub}</small>
        </button>
      ))}
    </div>
  );
}

interface CardProps {
  practice: Practice;
  /** "중급 · 라이브러리 「…」" line. */
  sub: string;
  tut: Tutorial;
  step: number;
  onStep(k: number): void;
  busy: boolean;
  onLibrary(): void;
  onReload(): void;
  action?: { label: string; run(): void; disabled?: boolean };
  need?: { text: string; fit(): void };
}

export function TutorialCard(p: CardProps) {
  const n = p.tut.steps.length;
  const st = p.tut.steps[Math.min(p.step, n - 1)];
  return (
    <>
      <section className={css.card} aria-label="튜토리얼">
        <span className={css.cardIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z" />
            <path d="M8 9h6M8 13h4" />
          </svg>
        </span>
        <div className={css.cardText}>
          <b title={p.practice.goal}>{p.practice.title}</b>
          <small>{p.sub}</small>
        </div>
        <div className={css.cardActs}>
          {p.action && (
            <button type="button" className={css.btn} disabled={p.busy || p.action.disabled} onClick={p.action.run}>
              {p.action.label}
            </button>
          )}
          <button type="button" className={css.btn} disabled={p.busy} onClick={p.onLibrary} title="라이브러리에서 다른 튜토리얼 고르기">
            라이브러리에서 바꾸기
          </button>
        </div>
        <div className={css.steps} role="group" aria-label="단계">
          {p.tut.steps.map((s, k) => (
            <button key={k} type="button" title={`${k + 1}. ${s.title}`} data-state={k < p.step ? 'done' : k === p.step ? 'now' : undefined} onClick={() => p.onStep(k)} aria-label={`${k + 1}단계 ${s.title}`} />
          ))}
          <small>
            {Math.min(p.step, n - 1) + 1} / {n}
          </small>
          <button type="button" className={css.link} disabled={p.busy} onClick={p.onReload} title="편집기의 프로그램을 이 실습의 처음 예제로 되돌려요 (고친 내용은 사라져요)">
            처음 예제로
          </button>
        </div>
        {p.need && (
          <p className={css.need} role="status">
            <span>
              이 실습은 <b>{p.need.text}</b>이(가) 있어야 해요
            </span>
            <button type="button" className={css.btn} disabled={p.busy} onClick={p.need.fit}>
              끼우기
            </button>
          </p>
        )}
      </section>
      <div className={css.now}>
        <b>
          {Math.min(p.step, n - 1) + 1}단계 · {st.title}
        </b>
        <span>{st.text}</span>
        {p.step < n - 1 && (
          <button type="button" className={css.next} onClick={() => p.onStep(p.step + 1)}>
            다음 ▶
          </button>
        )}
      </div>
    </>
  );
}

/** The program with only the tutorial's places open; the current step's places blink. */
export function SlotCode({ code, onCode, tut, step, runningLine, errorLines, fileName, full, onFull }: { code: string; onCode(c: string): void; tut: Tutorial; step: number; runningLine: number; errorLines: number[]; fileName: string; full: boolean; onFull(full: boolean): void }) {
  const hits = findSlots(code, tut);
  const hot = new Set(tut.steps[step]?.slots ?? []);
  // The step's places come into view (a long program scrolls to them).
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector('[data-hot]');
    const c = box.current;
    if (!el || !c) return;
    const r = (el as HTMLElement).getBoundingClientRect();
    const b = c.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) c.scrollTop += r.top - b.top - b.height / 3;
  }, [step, tut]);
  const lines = code.replace(/\n$/, '').split('\n');
  // Where each line starts in the program text.
  const starts = lines.reduce<number[]>((acc, t, i) => [...acc, i ? acc[i - 1] + lines[i - 1].length + 1 : 0], []);
  const rows: ReactNode[] = lines.map((text, i) => {
    const start = starts[i];
    const mine = hits.filter((h) => h.start >= start && h.end <= start + text.length);
    const parts: ReactNode[] = [];
    let at = start;
    mine.forEach((h, k) => {
      if (h.start > at) parts.push(<span key={`t${k}`}>{highlight(code.slice(at, h.start))}</span>);
      const width = `${Math.max(2, h.value.length + 1)}ch`;
      parts.push(
        <span key={`s${k}`} className={css.slot} data-hot={hot.has(h.index) || undefined} title={h.label}>
          <sup>{h.index + 1}</sup>
          {h.choices ? (
            <select aria-label={h.label} value={h.value} onChange={(e) => onCode(setSlot(code, tut, h.index, e.target.value))}>
              {[...new Set([h.value, ...h.choices])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input aria-label={h.label} value={h.value} style={{ width }} spellCheck={false} onChange={(e) => onCode(setSlot(code, tut, h.index, e.target.value.replace(/\n/g, '')))} />
          )}
        </span>,
      );
      at = h.end;
    });
    if (at < start + text.length || !mine.length) parts.push(<span key="end">{highlight(code.slice(at, start + text.length))}</span>);
    const line = i + 1;
    return (
      <div key={i} className={css.ln} data-edit={mine.length ? true : undefined} data-run={runningLine === line || undefined} data-err={errorLines.includes(line) || undefined}>
        <span className={css.no}>{line}</span>
        <span className={css.lock} aria-hidden="true">
          {mine.length ? '' : text.trim() ? '🔒' : ''}
        </span>
        <code>{parts}</code>
      </div>
    );
  });
  return (
    <div className={css.ed}>
      <div className={css.edBar}>
        <b>{fileName}</b>
        <span>
          고칠 곳 {tut.slots.length} · 잠긴 줄 {lines.filter((t, i) => t.trim() && !hits.some((h) => h.line === i + 1)).length}
        </span>
        <span className={css.toggle} role="group" aria-label="편집 방식">
          <button type="button" aria-pressed={!full} onClick={() => onFull(false)}>
            고칠 곳만
          </button>
          <button type="button" aria-pressed={full} onClick={() => onFull(true)}>
            전체 편집
          </button>
        </span>
      </div>
      <div ref={box} className={css.code}>
        {rows}
      </div>
    </div>
  );
}

/** The bar over the full editor, to go back to 고칠 곳만. */
export function FullBar({ onFull }: { onFull(full: boolean): void }) {
  return (
    <div className={css.fullBar}>
      <span>전체 편집 중 · 모든 줄을 고칠 수 있어요</span>
      <button type="button" className={css.btn} onClick={() => onFull(false)}>
        고칠 곳만 보기
      </button>
    </div>
  );
}

export function Snippets({ tut, code, onCode, busy }: { tut: Tutorial; code: string; onCode(c: string): void; busy: boolean }) {
  if (!tut.snippets.length) return null;
  return (
    <section className={css.snips} aria-label="미션 코드 조각">
      <h4>
        미션 코드 조각 <small>누르면 알맞은 자리에 들어가요</small>
      </h4>
      <div className={css.snipList}>
        {tut.snippets.map((s) => (
          <button key={s.label} type="button" className={css.snip} disabled={busy} title={s.code} onClick={() => onCode(insertSnippet(code, s))}>
            <i aria-hidden="true">＋</i>
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
