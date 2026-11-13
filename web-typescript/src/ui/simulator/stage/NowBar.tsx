'use client';

/**
 * 지금 할 일 (입문 트랙, 피드백 v2 파트 3): one line right under the 위치 줄, the same in every scene —
 * the number of the place to press, the sentence (it names the button), a progress bar where the
 * step is a number, and [다음 단계 →]. The place to press carries the same number and the one accent
 * (NowMark); the other rows of its group are dimmed. One place at a time.
 *
 *  - TutNow: a 기초 조작 tutorial's step (lifeTutorials.ts), done when the arm shows it.
 *  - QuestNow: a 현장 quest's controls in turn (quests.ts QUEST_LEAD), then the run, then the result.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { LifeTutorial, TutCtx, TutTarget } from '@/engine/simulator/lifeTutorials';

import PlayText from '../PlayText';
import css from './nowBar.module.css';

export interface NowNext {
  onClick(): void;
  /** Lit (the accent): this step is done. */
  lit: boolean;
}

interface BarProps {
  /** The place's number (none: nothing to press now). */
  n?: number;
  text: string;
  state?: 'do' | 'run' | 'ok' | 'no';
  meter?: { v: number; of: number; unit: string } | null;
  next?: NowNext;
}

export default function NowBar({ n, text, state = 'do', meter, next }: BarProps) {
  return (
    <div className={css.now} data-state={state} role="status" aria-live="polite">
      <em>지금 할 일</em>
      {n ? <i className={css.n}>{n}</i> : state === 'ok' ? <i className={css.ok}>✓</i> : null}
      <p>
        <PlayText text={text} size={26} />
      </p>
      {meter && (
        <span className={css.meter} aria-label={`${Math.min(meter.v, meter.of).toFixed(0)} / ${meter.of}${meter.unit}`}>
          <i>
            <i style={{ width: `${Math.min(100, (100 * meter.v) / Math.max(1, meter.of))}%` }} />
          </i>
          <output>
            {Math.min(meter.v, meter.of).toFixed(0)}
            {meter.unit} / {meter.of}
            {meter.unit}
          </output>
        </span>
      )}
      {next && (
        <button type="button" className={css.next} data-lit={next.lit || undefined} onClick={next.onClick}>
          다음 단계 →
        </button>
      )}
    </div>
  );
}

const shown = (e: Element | null): e is HTMLElement => !!e && (e as HTMLElement).getBoundingClientRect().width > 0;

/** The element a tutorial target names (its selector, or a button showing its text), if on screen. */
export function findTarget(t: TutTarget): HTMLElement | null {
  if ('sel' in t) return [...document.querySelectorAll<HTMLElement>(t.sel)].find(shown) ?? null;
  return [...document.querySelectorAll<HTMLElement>('button')].find((b) => shown(b) && (b.textContent ?? '').trim().includes(t.text)) ?? null;
}

/**
 * The place to press now: its number at the top-left corner and the accent round it; the rows beside
 * it (the group's other `[data-row]`) dimmed. `onHit`: it was pressed.
 */
export function NowMark({ find, n, onHit }: { find: () => HTMLElement | null; n: number; onHit?: () => void }) {
  const [at, setAt] = useState<DOMRect | null>(null);
  const el = useRef<HTMLElement | null>(null);
  const findRef = useRef(find);
  const hitRef = useRef(onHit);
  useEffect(() => {
    findRef.current = find;
    hitRef.current = onHit;
  });
  useEffect(() => {
    const dimmed = new Set<HTMLElement>();
    const undim = () => {
      dimmed.forEach((d) => (d.style.opacity = ''));
      dimmed.clear();
    };
    const look = () => {
      const t = findRef.current();
      el.current = t;
      setAt(t ? t.getBoundingClientRect() : null);
      undim();
      const row = t?.closest('[data-row]');
      row?.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-row]').forEach((r) => {
        if (r === row) return;
        r.style.opacity = '0.35';
        dimmed.add(r);
      });
    };
    look();
    const id = window.setInterval(look, 250);
    const hit = (e: Event) => {
      if (el.current && e.target instanceof Node && el.current.contains(e.target)) hitRef.current?.();
    };
    document.addEventListener('pointerup', hit, true);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('pointerup', hit, true);
      undim();
    };
  }, [n]);
  if (typeof document === 'undefined' || !at) return null;
  return createPortal(
    <>
      <span className={css.ring} style={{ left: at.left - 4, top: at.top - 4, width: at.width + 8, height: at.height + 8 }} aria-hidden="true" />
      <i className={css.badge} style={{ left: at.left - 12, top: at.top - 12 }} aria-hidden="true">
        {n}
      </i>
    </>,
    document.body,
  );
}

/** A key's line, said as a sentence lead: "앞 (X+) 키를 눌러요" → "앞 (X+) 키를 눌러". */
const asLead = (say: string) => say.replace(/눌러요$/, '눌러');

/** 기초 조작 (입문 tutorial) as 지금 할 일: the step's sentence, its meter, its one place to press. */
/** `shorts` · `done`: the sentences and the line when done as the caller has them (입문 과정: its 문구 파일), in place of the tutorial's own. */
export function TutNow({ tut, step, start, read, next, shorts, done }: { tut: LifeTutorial; step: number; start: TutCtx; read(): TutCtx; next?: NowNext; shorts?: readonly string[]; done?: string }) {
  const cur = tut.steps[step];
  const [now, setNow] = useState<TutCtx | null>(null);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  useEffect(() => {
    const id = window.setInterval(() => setNow(readRef.current()), 250);
    return () => window.clearInterval(id);
  }, []);
  if (!cur) return <NowBar state="ok" text={done ?? `다 했어요 · ${tut.concept.term}: ${tut.concept.def}`} next={next ? { ...next, lit: true } : undefined} />;
  const short = shorts?.[step] ?? cur.short;
  const targets = cur.lead && now ? cur.lead(now) : cur.target;
  // The first of the targets on screen is the one to press (a lead's others are where to go first).
  const pick = () => targets.map(findTarget).find(Boolean) ?? null;
  const say = targets.find((t) => t.say && findTarget(t))?.say;
  const text = say ? `${asLead(say)} ${short}` : short;
  const m = cur.meter && now ? cur.meter(now, start) : null;
  return (
    <>
      <NowBar n={step + 1} text={text} meter={m} next={next ? { ...next, lit: false } : undefined} />
      {targets.length > 0 && <NowMark key={step} find={pick} n={step + 1} />}
    </>
  );
}

/** A 현장 quest as 지금 할 일: its controls in turn (one at a time), then the run and the result. */
/** `at`: the step reached as the caller reads it (입문 과정 5-2: from the cards' values), instead of moving on with each press. */
/** `done`: the line when it passed (입문 과정: '다 했어요 · …'), in place of '통과했어요'. */
export function QuestNow({ steps, sels, phase, passed, next, at: atNow, done }: { steps: readonly string[]; sels: readonly string[]; phase: 'do' | 'run' | 'result'; passed: boolean | null; next?: NowNext; at?: number; done?: string }) {
  const [k, setK] = useState(0);
  // A new try starts from the first place again.
  const key = `${sels.join('|')}:${phase}`;
  const [was, setWas] = useState(key);
  if (was !== key) {
    setWas(key);
    if (phase === 'do') setK(0);
  }
  if (phase === 'run') return <NowBar state="run" text="실행 중이에요 · 장면을 지켜봐요" next={next} />;
  if (phase === 'result' && passed) return <NowBar state="ok" text={done ?? '통과했어요'} next={next ? { ...next, lit: true } : undefined} />;
  const at = Math.min(atNow ?? k, Math.max(0, steps.length - 1));
  const text = phase === 'result' ? `아직이에요 · ${steps[at] ?? '다시 고쳐서 ▶ 시뮬레이션'}` : (steps[at] ?? '');
  const sel = sels[at];
  return (
    <>
      <NowBar state={phase === 'result' ? 'no' : 'do'} n={at + 1} text={text} next={next} />
      {sel && <NowMark key={at} find={() => [...document.querySelectorAll<HTMLElement>(sel)].find(shown) ?? null} n={at + 1} onHit={atNow == null ? () => setK((x) => Math.min(x + 1, sels.length - 1)) : undefined} />}
    </>
  );
}
