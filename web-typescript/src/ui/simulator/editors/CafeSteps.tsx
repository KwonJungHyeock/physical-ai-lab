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
      <div className={css.stats} style={{ gridTemplateColumns: `repeat(${asks.length}, 1fr)` }} aria-label="O X 퀴즈">
        {asks.map((a, k) => (
          <span key={a.key} data-ok={answered(a.key) || undefined}>
            <b>{answered(a.key) ? '✓' : 'O X'}</b>
            {['컵', '샷', '건네기'][k] ?? `질문 ${k + 1}`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 해 보기 ①: the coffee machine's start button and the signals it answers with. */
function MachineKeys({ world, busy }: { world: RefObject<WorldState | null>; busy: boolean }) {
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
        <button type="button" className={css.ghost} style={{ background: 'var(--hud-silver)', color: 'var(--hud-ink)' }} disabled={busy || s.busy} onClick={() => press(!s.out)}>
          {s.out ? '추출 버튼 놓기' : '추출 버튼 누르기'}
        </button>
      </div>
      <p className={css.tip}>버튼을 누르면 [추출 중]이 켜지고, 다 나오면 [추출 끝]이 켜져요. 다시 추출하려면 버튼을 놓았다가 눌러요.</p>
    </section>
  );
}

/** 해 보기: by hand — the machine's keys (①) or the jog (②, the console's control panel passed in). */
export function HandPane({ mission, world, busy, jog, onCode }: { mission: string; world: RefObject<WorldState | null>; busy: boolean; jog: ReactNode; onCode(code: string, cardOf: (line: number) => string): void }) {
  const m = missionById(mission);
  useEffect(() => {
    // Nothing to run: the step is done by hand (▶ runs an empty program).
    onCode('from edu import robot, cell\n', () => '');
  }, [onCode]);
  return <div className={css.maker}>{m?.target ? <section className={css.plate}>{jog}</section> : <MachineKeys world={world} busy={busy} />}</div>;
}
