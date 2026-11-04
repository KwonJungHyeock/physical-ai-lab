'use client';

/**
 * 로봇 카페의 공정 띠 (입문 트랙): over the scene, what the café is doing and how far the drink has got,
 * read off the run every few frames (engine/simulator/cell/cafe.ts) — the order, the five processes
 * (the one pouring lit, with its time left), and the cup: what is in it against the order and the
 * 355 ml rim. The cause and its effect are seen where they happen: a shot cut short shows 16 / 60 ml,
 * an extra shot with the menu's ice runs past the rim.
 */

import { useEffect, useState, type RefObject } from 'react';

import { CUP_ML, drinkMl, orderDrink, type Drink } from '@/engine/simulator/cell/cafe';
import type { WorldState } from '@/engine/simulator/sim';

import css from './cafeStrip.module.css';

interface Snap {
  order: string;
  note?: string;
  want: Drink;
  cups: number;
  served: number;
  /** The cup being made: carried, at a station, or the last one let down. */
  drink: Drink | null;
  hasCup: boolean;
  /** Each station now: pouring (time so far / time), or not. */
  st: Record<'ice' | 'shot' | 'water', { t: number; of: number } | null>;
  door: boolean;
}

const KEYS = ['ice', 'shot', 'water'] as const;
const NAME = { ice: '얼음', shot: '샷', water: '물' } as const;

function snapOf(w: WorldState | null): Snap | null {
  const run = w?.cell;
  const c = run?.cafe;
  const def = run?.layout.line.cafe;
  if (!w || !run || !c || !def) return null;
  const cups = w.objects.filter((o) => o.kind === 'cup');
  const cup = (w.carry && cups.find((o) => o.id === w.carry!.id)) || cups.find((o) => def.stations.some((s) => Math.hypot(o.x - run.layout.places[s.place].x, o.y - run.layout.places[s.place].y) < 8)) || cups[cups.length - 1];
  const st = { ice: null, shot: null, water: null } as Snap['st'];
  for (const s of def.stations) {
    const ss = c.stations[s.output];
    if (ss && ss.t !== null) st[s.pours] = { t: ss.t, of: ss.timeS };
  }
  return {
    order: c.order.name,
    note: c.order.note,
    want: orderDrink(c.order),
    cups: c.orders + c.served.length,
    served: c.served.filter((d) => d.ok).length,
    // No cup in the café any more: the last drink handed over (what the customer got).
    drink: cup?.drink ? { ...cup.drink } : !cup && c.served.length ? { ...c.served[c.served.length - 1].drink } : null,
    hasCup: !!cup || c.served.length > 0,
    st,
    door: (run.line.act['픽업 문'] ?? 0) > 0,
  };
}

export default function CafeStrip({ world }: { world: RefObject<WorldState | null> }) {
  const [snap, setSnap] = useState<Snap | null>(() => snapOf(world.current));
  useEffect(() => {
    const id = window.setInterval(() => setSnap(snapOf(world.current)), 150);
    return () => window.clearInterval(id);
  }, [world]);
  if (!snap) return null;
  const d = snap.drink;
  const total = d ? drinkMl(d) : 0;
  const pct = (ml: number) => `${Math.min(100, (ml / CUP_ML) * 100)}%`;
  const wantTotal = drinkMl(snap.want);
  return (
    <div className={css.strip} aria-label="공정 띠">
      <span className={css.order}>
        <em>ORDER</em>
        <b>{snap.order}</b>
        <small>
          {snap.note ? `${snap.note} · ` : ''}
          {snap.served} / {snap.cups}잔
        </small>
      </span>
      <ol className={css.flow}>
        <li data-done={snap.hasCup || undefined}>
          <b>컵</b>
          <small>{snap.hasCup ? '받음' : '—'}</small>
        </li>
        {KEYS.map((k) => {
          const got = d ? Math.round(d[k]) : 0;
          const want = snap.want[k];
          const on = snap.st[k];
          const state = on ? 'on' : got > want + 1 ? 'over' : want > 0 && got >= want - 1 ? 'done' : got > 0 ? 'short' : undefined;
          return (
            <li key={k} data-state={state}>
              <b>{NAME[k]}</b>
              <small>
                {got} / {want} ml
              </small>
              {on && (
                <span className={css.timer}>
                  <i style={{ width: `${Math.min(100, (on.t / Math.max(0.01, on.of)) * 100)}%` }} />
                  {Math.ceil(Math.max(0, on.of - on.t))}초 남음
                </span>
              )}
            </li>
          );
        })}
        <li data-state={snap.door ? 'on' : undefined} data-done={snap.served > 0 || undefined}>
          <b>건네기</b>
          <small>{snap.door ? '문 열림' : snap.served ? `${snap.served}잔 건넴` : '—'}</small>
        </li>
      </ol>
      {/* The cup: what is in it, stacked as poured, against the order (the line) and the rim. */}
      <span className={css.cup} title={`컵 ${Math.round(total)} / ${CUP_ML} ml`}>
        <span className={css.glass} data-over={(d && d.spilled >= 1) || undefined}>
          <i className={css.ice} style={{ height: pct(d?.ice ?? 0) }} />
          <i className={css.shot} style={{ height: pct(d?.shot ?? 0) }} />
          <i className={css.water} style={{ height: pct(d?.water ?? 0) }} />
          <u style={{ bottom: pct(wantTotal) }} aria-hidden="true" />
        </span>
        <small>
          {Math.round(total)}
          <br />/ {CUP_ML} ml
          {d && d.spilled >= 1 && (
            <>
              <br />
              <b>넘침 {Math.round(d.spilled)}</b>
            </>
          )}
        </small>
      </span>
    </div>
  );
}
