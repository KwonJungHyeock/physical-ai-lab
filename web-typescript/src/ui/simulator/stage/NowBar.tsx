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

import { useLive, type Live } from '../liveStore';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { LifeTutorial, TutCtx, TutTarget } from '@/engine/simulator/lifeTutorials';

import { buttonName, commonLine } from '@/engine/simulator/cell/courseText';

import Icon from '../Icon';
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
  /** `label`: the meter's words instead of 'v / of' (입문 3장: 지금 값 → 목표 값, 수정 지시서 v5 파트 1-2). */
  meter?: { v: number; of: number; unit: string; label?: string } | null;
  next?: NowNext;
  /** 장면 보기 (수정 지시서 v3 파트 2-2): the line names the scene and carries [다시 보기] (no '지금 할 일', no step). */
  replay?: { onClick(): void; disabled?: boolean };
  /** 'N / M 단계' and its bar, left of [다음으로 →] (수정 지시서 v4 파트 2-5): the step reached of the 절's steps (all done: M / M). */
  steps?: { n: number; of: number };
  /** A key of the line's own in [다음으로 →]'s place, lit (입문 3-5 미션: [확인], 동결 뒤 고침 파트 1). */
  action?: { label: string; onClick(): void; disabled?: boolean };
  /** 자유 실습 (응용 활동, 지시서 파트 6): [자유 실습], left of [다음으로 →], once the 절 is done. */
  free?: { onClick(): void; disabled?: boolean };
  /** In 자유 실습: [처음 상태로] · [자유 실습 끝내기] at the line's right (no number, no steps); `values`: numbers shown large (4-1: 손끝 X · Y · Z). */
  freeKeys?: { onReset(): void; onEnd(): void; disabled?: boolean; values?: readonly { name: string; v: string }[]; extra?: { label: string; onClick(): void } };
}

export default function NowBar({ n, text, state = 'do', meter, next, replay, steps, action, free, freeKeys }: BarProps) {
  // A number and its unit: a space before mm (110 mm), none before ° or 곳.
  const unit = meter ? (meter.unit === 'mm' ? ' mm' : meter.unit) : '';
  return (
    <div className={css.now} data-state={state} data-now role="status" aria-live="polite">
      {!replay && <em>지금 할 일</em>}
      {n ? <i className={css.n}>{n}</i> : state === 'ok' ? <i className={css.ok}>✓</i> : null}
      <p>
        <PlayText text={text} size={26} />
      </p>
      {meter && (
        <span className={css.meter} aria-label={meter.label ?? `${Math.min(meter.v, meter.of).toFixed(0)} / ${meter.of}${meter.unit}`}>
          <i>
            <i style={{ width: `${Math.min(100, (100 * meter.v) / Math.max(1, meter.of))}%` }} />
          </i>
          {meter.label ? (
            <output>{meter.label}</output>
          ) : (
            <output>
              {Math.min(meter.v, meter.of).toFixed(0)}
              {unit} / {meter.of}
              {unit}
            </output>
          )}
        </span>
      )}
      {steps && steps.of > 0 && (
        <span className={css.steps} aria-label={commonLine('stepOf', { n: steps.n, of: steps.of })}>
          <output>{commonLine('stepOf', { n: steps.n, of: steps.of })}</output>
          <span aria-hidden="true">
            {Array.from({ length: steps.of }, (_, k) => (
              <i key={k} data-on={k < steps.n || undefined} />
            ))}
          </span>
        </span>
      )}
      {replay && (
        <button type="button" className={css.replay} disabled={replay.disabled} onClick={replay.onClick}>
          <Icon name="play" size={16} />
          {buttonName('replay')}
        </button>
      )}
      {freeKeys?.values && (
        <span className={css.values}>
          {freeKeys.values.map((x) => (
            <span key={x.name}>
              <small>{x.name}</small>
              <output>{x.v}</output>
            </span>
          ))}
        </span>
      )}
      {freeKeys && (
        <>
          {freeKeys.extra && (
            <button type="button" className={css.free} data-step="free-extra" disabled={freeKeys.disabled} onClick={freeKeys.extra.onClick}>
              {freeKeys.extra.label}
            </button>
          )}
          <button type="button" className={css.free} data-step="free-reset" disabled={freeKeys.disabled} onClick={freeKeys.onReset}>
            {buttonName('freeReset')}
          </button>
          <button type="button" className={css.next} data-step="free-end" onClick={freeKeys.onEnd}>
            {buttonName('freeEnd')}
          </button>
        </>
      )}
      {free && (
        <button type="button" className={css.free} data-step="free" disabled={free.disabled} onClick={free.onClick}>
          {buttonName('free')}
        </button>
      )}
      {next && (
        <button type="button" className={css.next} data-lit={next.lit || undefined} onClick={next.onClick}>
          {buttonName('next')}
        </button>
      )}
      {action && (
        <button type="button" className={css.next} data-lit disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

const shown = (e: Element | null): e is HTMLElement => !!e && (e as HTMLElement).getBoundingClientRect().width > 0;

/** The element a tutorial target names (its selector, or a button showing its text), if on screen. */
/** 지금 할 일 with a meter read from the joint angles as they change (입문 3-1 · 3-2: 지금 값 → 목표 값). */
export function LiveNowBar({ live, meterOf, ...bar }: BarProps & { live: Live; meterOf(angles: readonly number[]): BarProps['meter'] }) {
  const angles = useLive(live, (v) => v.angles);
  return <NowBar {...bar} meter={meterOf(angles)} />;
}

/** 자유 실습's line with numbers read from the joint angles as they change (4-1: 손끝 X · Y · Z). */
export function LiveFreeBar({ live, valuesOf, freeKeys, ...bar }: BarProps & { live: Live; freeKeys: NonNullable<BarProps['freeKeys']>; valuesOf(angles: readonly number[]): { name: string; v: string }[] }) {
  const angles = useLive(live, (v) => v.angles);
  return <NowBar {...bar} freeKeys={{ ...freeKeys, values: valuesOf(angles) }} />;
}

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
  const [sight, setSight] = useState<{ top: number; bottom: number; zoom: number }>({ top: 2, bottom: Infinity, zoom: 1 });
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
      setSight(sightOf(t));
      undim();
      const row = t?.closest('[data-row]');
      row?.parentElement?.querySelectorAll<HTMLElement>(':scope > [data-row]').forEach((r) => {
        if (r === row) return;
        // (가독성 정리: 0.8, not 0.55 — the rows set back still read at 4.5 : 1; the number and the ring show the one to press.)
        r.style.opacity = '0.8';
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
  // (파트 11-2: in a scrolled panel the ring is cut to what shows of it — never over the panel's head or the 정지 row — and
  // the number stays at or under the top of that part, never over the head row or the 지금 할 일 line.)
  const top = Math.max(at.top - 4, sight.top);
  const bottom = Math.min(at.bottom + 4, sight.bottom);
  if (bottom - top < 8) return null;
  return createPortal(
    <>
      <span className={css.ring} style={{ left: at.left - 4, top, width: at.width + 8, height: bottom - top }} aria-hidden="true" />
      {/* The badge sits outside the ring's top-left corner: nothing inside the ring is covered (수정 지시서 v3 파트 4-1). */}
      <i className={css.badge} style={{ left: Math.max(2, at.left - 28), top: Math.max(2, at.top - 28, sight.top + 26 * (sight.zoom - 1)) }} aria-hidden="true">
        {n}
      </i>
    </>,
    document.body,
  );
}

/** Where a control to press can show: inside the box that scrolls it (under the panel's head, over the rows kept at the
    panel's foot), and under the 지금 할 일 line — viewport px. */
function sightOf(el: HTMLElement | null): { top: number; bottom: number; zoom: number } {
  let top = 2;
  let bottom = window.innerHeight;
  const now = document.querySelector('[data-now]')?.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  if (now && r && r.top >= now.top) top = Math.max(top, now.bottom);
  for (let s = el?.parentElement; s && s.tagName !== 'BODY'; s = s.parentElement) {
    const y = getComputedStyle(s).overflowY;
    if (y !== 'auto' && y !== 'scroll') continue;
    const b = s.getBoundingClientRect();
    top = Math.max(top, b.top);
    bottom = Math.min(bottom, b.bottom);
    // The 정지 row kept at the panel's foot, over the box's end.
    for (const f of s.closest('aside')?.querySelectorAll('[data-foot], [class*="poseDock"]') ?? []) {
      const t = f.getBoundingClientRect().top;
      if (!f.contains(el) && t > b.top && t < bottom) bottom = t;
    }
    break;
  }
  // (A window shown larger: the badge is drawn that many times larger, growing up and left from its foot — 26 px × zoom.)
  const zoom = document.documentElement.hasAttribute('data-zoomed') ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--course-zoom')) || 1 : 1;
  return { top, bottom, zoom };
}

/** A key's line, said as a sentence lead: "앞 (X+) 키를 눌러요" → "앞 (X+) 키를 눌러". */
const asLead = (say: string) => say.replace(/눌러요$/, '눌러');

/** 기초 조작 (입문 tutorial) as 지금 할 일: the step's sentence, its meter, its one place to press. */
/** `shorts` · `done`: the sentences and the line when done as the caller has them (입문 과정: its 문구 파일), in place of the tutorial's own. */
/** `count`: show 'N / M 단계' (입문 과정). */
export function TutNow({
  tut,
  step,
  start,
  read,
  next,
  shorts,
  done,
  count,
  free,
}: {
  tut: LifeTutorial;
  step: number;
  start: TutCtx;
  read(): TutCtx;
  next?: NowNext;
  shorts?: readonly string[];
  done?: string;
  count?: boolean;
  free?: BarProps['free'];
}) {
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
  const of = tut.steps.length;
  if (!cur) return <NowBar state="ok" text={done ?? `다 했어요 · ${tut.concept.term}: ${tut.concept.def}`} next={next ? { ...next, lit: true } : undefined} steps={count ? { n: of, of } : undefined} free={free} />;
  const short = shorts?.[step] ?? cur.short;
  const targets = cur.lead && now ? cur.lead(now) : cur.target;
  // The first of the targets on screen is the one to press (a lead's others are where to go first).
  const pick = () => targets.map(findTarget).find(Boolean) ?? null;
  const say = targets.find((t) => t.say && findTarget(t))?.say;
  const text = say ? `${asLead(say)} ${short}` : short;
  const m = cur.meter && now ? cur.meter(now, start) : null;
  return (
    <>
      <NowBar n={step + 1} text={text} meter={m} next={next ? { ...next, lit: false } : undefined} steps={count ? { n: step + 1, of } : undefined} free={free} />
      {targets.length > 0 && <NowMark key={step} find={pick} n={step + 1} />}
    </>
  );
}

/** A 현장 quest as 지금 할 일: its controls in turn (one at a time), then the run and the result. */
/** `at`: the step reached as the caller reads it (입문 과정 5-2: from the cards' values), instead of moving on with each press. */
/** `done`: the line when it passed (입문 과정: '다 했어요 · …'), in place of '통과했어요'. */
/** `count`: show 'N / M 단계' (입문 과정). */
export function QuestNow({
  steps,
  sels,
  phase,
  passed,
  next,
  at: atNow,
  done,
  count,
  free,
}: {
  steps: readonly string[];
  sels: readonly string[];
  phase: 'do' | 'run' | 'result';
  passed: boolean | null;
  next?: NowNext;
  at?: number;
  done?: string;
  count?: boolean;
  free?: BarProps['free'];
}) {
  const [k, setK] = useState(0);
  // A new try starts from the first place again.
  const key = `${sels.join('|')}:${phase}`;
  const [was, setWas] = useState(key);
  if (was !== key) {
    setWas(key);
    if (phase === 'do') setK(0);
  }
  const of = steps.length;
  const at = Math.min(atNow ?? k, Math.max(0, steps.length - 1));
  if (phase === 'run') return <NowBar state="run" text={commonLine('running')} next={next} steps={count ? { n: of, of } : undefined} free={free} />;
  if (phase === 'result' && passed) return <NowBar state="ok" text={done ?? '통과했어요'} next={next ? { ...next, lit: true } : undefined} steps={count ? { n: of, of } : undefined} free={free} />;
  const text = phase === 'result' ? commonLine('notYet', { step: steps[at] ?? `▶ ${buttonName('run')}` }) : (steps[at] ?? '');
  const sel = sels[at];
  return (
    <>
      <NowBar state={phase === 'result' ? 'no' : 'do'} n={at + 1} text={text} next={next} steps={count ? { n: at + 1, of } : undefined} free={free} />
      {sel && <NowMark key={at} find={() => [...document.querySelectorAll<HTMLElement>(sel)].find(shown) ?? null} n={at + 1} onHit={atNow == null ? () => setK((x) => Math.min(x + 1, sels.length - 1)) : undefined} />}
    </>
  );
}
