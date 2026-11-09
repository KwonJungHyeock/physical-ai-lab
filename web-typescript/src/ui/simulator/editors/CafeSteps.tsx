'use client';

/**
 * 로봇 카페 1~3단계 in the side panel (입문 트랙): 미리보기 (the ready program is played, nothing to
 * set — 주문 한 잔 따라가기: the bubbles and the O · X come over the scene; here only how far the O · X went) and 해 보기 (by hand: the coffee machine's button and
 * its signals, or the jog). Their checks are read as it goes (Console), so there is no ▶ to press
 * for 해 보기.
 */

import { useEffect, useState, type ReactNode, type RefObject } from 'react';

import { asksOf } from '@/engine/simulator/cell/guides';
import { setOut } from '@/engine/simulator/cell/line';
import { missionById } from '@/engine/simulator/cell/missions';
import type { WorldState } from '@/engine/simulator/sim';

import css from './cafeMaker.module.css';

/** 미리보기: the ready program, and how many of the O · X have been answered. */
export function WatchPane({ mission, answered, onCode }: { mission: string; answered: (key: string) => boolean; onCode(code: string, cardOf: (line: number) => string): void }) {
  const m = missionById(mission);
  useEffect(() => {
    if (m?.solution) onCode(m.solution, () => '');
  }, [m, onCode]);
  const asks = asksOf(mission);
  // Only how far the O · X have gone: what happens is said over the scene (말풍선), the questions come as a modal.
  return (
    <div className={css.maker}>
      <section className={css.plate} aria-label="O X 퀴즈">
        <header>
          <em>QUIZ</em>
          <b>O · X</b>
          <span className={css.cycle}>
            <b>{asks.filter((a) => answered(a.key)).length}</b> / {asks.length}
          </span>
        </header>
        {/* One socket a question, filled as it is answered (a game's badge slots). */}
        <ol className={css.sockets}>
          {asks.map((a, k) => (
            <li key={a.key} data-ok={answered(a.key) || undefined}>
              <i>{answered(a.key) ? '✓' : k + 1}</i>
              {['컵', '샷', '건네기'][k] ?? `질문 ${k + 1}`}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** 해 보기 ①: the coffee machine's start button and the signals it answers with. */
function MachineKeys({ world, busy, fast, onFast, onGoing }: { world: RefObject<WorldState | null>; busy: boolean } & Speedy) {
  const [s, setS] = useState({ out: false, cup: false, busy: false, done: false, shot: 0 });
  useEffect(() => {
    const id = window.setInterval(() => {
      const run = world.current?.cell;
      if (!run) return;
      const cup = world.current?.objects.find((o) => o.kind === 'cup');
      setS({ out: !!run.line.out['추출 시작'], cup: !!run.line.in['머신 컵 감지'], busy: !!run.line.in['추출 중'], done: !!run.line.in['추출 끝'], shot: Math.round(cup?.drink?.shot ?? 0) });
    }, 150);
    return () => window.clearInterval(id);
  }, [world]);
  // The machine pouring: the quest's 관찰 (the view goes to it; ▶▶ shortens the wait).
  useEffect(() => {
    onGoing?.(s.busy);
  }, [s.busy, onGoing]);
  const press = (on: boolean) => {
    const run = world.current?.cell;
    if (run) setOut(run.line, '추출 시작', on);
  };
  return (
    <section className={css.plate}>
      <header>
        <em>MACHINE</em>
        <b>커피 머신</b>
        <span className={css.cycle}>
          컵 속 샷 <b>{s.shot} ml</b>
        </span>
      </header>
      <div className={css.stats}>
        <span data-ok={s.cup || undefined}>
          <b>{s.cup ? '●' : '○'}</b>머신 컵 감지
        </span>
        <span data-bad={s.busy || undefined}>
          <b>{s.busy ? '●' : '○'}</b>추출 중
        </span>
        <span data-ok={s.done || undefined}>
          <b>{s.done ? '●' : '○'}</b>추출 끝
        </span>
      </div>
      <div className={css.foot} style={{ marginTop: 10 }}>
        <button
          type="button"
          className={css.ghost}
          style={{ minHeight: 40, padding: '0 22px', fontSize: 15, background: 'var(--hud-silver)', color: 'var(--hud-ink)' }}
          data-lead={s.out ? undefined : 'press'}
          disabled={busy || s.busy}
          onClick={() => press(!s.out)}
        >
          {s.out ? '추출 떼기' : '추출'}
        </button>
        {onFast && (
          <button
            type="button"
            className={css.ghost}
            style={{ minHeight: 40, padding: '0 16px', fontSize: 15 }}
            data-on={fast || undefined}
            aria-pressed={!!fast}
            disabled={!s.busy}
            onClick={() => onFast(!fast)}
            title="기다리는 동안 4배 빠르게"
          >
            ▶▶ {fast ? '×4' : '빨리'}
          </button>
        )}
      </div>
    </section>
  );
}

/** 해 보기 ①: the wait made short — ▶▶ runs the cell 4 × while the machine pours (`onGoing`: it pours now). */
interface Speedy {
  fast?: boolean;
  onFast?(on: boolean): void;
  onGoing?(on: boolean): void;
}

/** 해 보기: by hand — the machine's keys (①) or the jog (②, the console's control panel passed in). */
export function HandPane({
  mission,
  world,
  busy,
  jog,
  onCode,
  fast,
  onFast,
  onGoing,
  aim,
}: {
  mission: string;
  world: RefObject<WorldState | null>;
  busy: boolean;
  jog: ReactNode;
  onCode(code: string, cardOf: (line: number) => string): void;
  /** 해 보기 ② (조그): where the tool tip is now (robot mm), for the distance to the ring. */
  aim?: () => { x: number; y: number; z: number } | null;
} & Speedy) {
  const m = missionById(mission);
  useEffect(() => {
    // Nothing to run: the step is done by hand (▶ runs an empty program).
    onCode('from edu import robot, cell\n', () => '');
  }, [onCode]);
  return (
    <div className={css.maker}>
      {m?.target ? (
        <section className={css.plate}>
          {aim && <AimBoard target={m.target} aim={aim} />}
          {jog}
        </section>
      ) : (
        <MachineKeys world={world} busy={busy} fast={fast} onFast={onFast} onGoing={onGoing} />
      )}
    </div>
  );
}

/** Within this on an axis it is lit (the ring takes 15 mm in all). */
const AXIS_OK_MM = 8;

/**
 * 해 보기 ② (조그): the ring minus the tip, axis by axis — 앞뒤 (X) · 좌우 (Y) · 높이 (Z) — so the jog is
 * read as coordinates: press the key whose sign the number has until it is near 0.
 */
function AimBoard({ target, aim }: { target: readonly [number, number, number]; aim: () => { x: number; y: number; z: number } | null }) {
  const [d, setD] = useState<[number, number, number] | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = aim();
      setD(t ? [target[0] - t.x, target[1] - t.y, target[2] - t.z] : null);
    }, 150);
    return () => window.clearInterval(id);
  }, [aim, target]);
  const all = d ? Math.hypot(...d) : null;
  const axis = (name: string, key: string, v: number | undefined) => (
    <span data-ok={(v !== undefined && Math.abs(v) <= AXIS_OK_MM) || undefined}>
      <b>{v === undefined ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)}`}</b>
      {name} ({key})
    </span>
  );
  return (
    <div className={css.aim} aria-label="고리까지 거리">
      <em>고리까지 (mm) · 목표 높이 {target[2]} mm</em>
      {axis('앞뒤', 'X', d?.[0])}
      {axis('좌우', 'Y', d?.[1])}
      {axis('높이', 'Z', d?.[2])}
      <small>{all === null ? '' : all <= 15 ? '고리 안!' : `${Math.round(all)} mm 남음`}</small>
    </div>
  );
}
