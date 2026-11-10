'use client';

/**
 * 로봇 카페의 주문 (교육용 장면: 사람 모델 없이 주문 번호표만): each order is a ticket — it comes out of
 * the kiosk, slides into the line before the pickup with its number and how patient the customer still
 * is, then leaves (😄 a right drink, 😞 a wrong one or giving up). Above the pickup, the order board:
 * the numbers being made and the numbers ready. Each cup carries its order's number (cell/cafe.ts gives
 * it when the cup comes down): an order takes only the cup with its number.
 *
 * Read from the world every frame (cell/cafe.ts: queue · exits · spawn); positions eased here, tags
 * changed a few times a second. At most six tickets on screen: the rest are only numbers on the board.
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Group } from 'three';

import type { WorldState } from '@/engine/simulator/sim';

import { F, m } from './kit';

type P = readonly [number, number];
/** Where a new ticket comes from (the kiosk's screen) and where a finished one goes (off to the left). */
const KIOSK: P = [372, -250];
const EXIT: P = [-60, -250];
/** The line: one row before the counter, the pickup window first. */
const SLOTS: P[] = [
  [98, -250],
  [160, -250],
  [222, -250],
  [284, -250],
  [346, -250],
];
/** The tickets' height above the floor (the counter's front). */
const TAG_Z = 150;
const MAX_SHOWN = 6;
/** How fast a ticket slides, mm per (real) second. */
const SPEED = 220;

interface Who {
  id: number;
  /** The order number on the ticket. */
  tag: string;
  mood: 'ok' | 'meh' | 'cross' | 'making' | 'happy' | 'gone';
  patience: number | null;
}

interface Aim {
  to: P;
  leaving: boolean;
}

/** Where each customer is headed now, and doing what. */
function aims(w: WorldState | null): { list: (Who & Aim)[]; making: number[]; ready: number[] } {
  const c = w?.cell?.cafe;
  const t = w?.cell?.line.t ?? 0;
  if (!c) return { list: [], making: [], ready: [] };
  const sp = c.spawn;
  const list: (Who & Aim)[] = [];
  c.queue.forEach((q, k) => {
    const age = sp ? t - q.at : 99;
    const p = sp && !q.started ? Math.max(0, 1 - (t - q.at) / sp.patience) : null;
    const mood: Who['mood'] = q.started ? 'making' : p === null ? 'ok' : p > 0.5 ? 'ok' : p > 0.2 ? 'meh' : 'cross';
    const base = { id: q.id, tag: `#${q.id}`, mood, patience: p, leaving: false };
    list.push({ ...base, to: age < 2 ? KIOSK : SLOTS[Math.min(k, SLOTS.length - 1)] });
  });
  const recent = c.exits.filter((e) => t - e.t < 4);
  for (const e of recent) list.push({ id: e.id, tag: `#${e.id}`, mood: e.happy ? 'happy' : 'gone', patience: null, leaving: true, to: EXIT });
  return {
    list: list.slice(0, MAX_SHOWN),
    making: c.queue.filter((q) => q.started).map((q) => q.id),
    ready: c.exits.filter((e) => e.happy && t - e.t < 8).map((e) => e.id),
  };
}

const FACE: Record<Who['mood'], string> = { ok: '😊', meh: '😐', cross: '😠', making: '☕', happy: '😄', gone: '😞' };

export function CafeCustomers({ world }: { world: RefObject<WorldState | null> }) {
  const groups = useRef(new Map<number, Group>());
  const pos = useRef(new Map<number, { x: number; y: number }>());
  const [shown, setShown] = useState<{ list: Who[]; making: number[]; ready: number[]; cups: { id: string; order: number }[] }>({ list: [], making: [], ready: [], cups: [] });
  const cupGroups = useRef(new Map<string, Group>());
  const last = useRef('');
  const tick = useRef(0);
  useFrame((_, dt) => {
    const a = aims(world.current);
    const step = SPEED * Math.min(dt, 0.1);
    for (const who of a.list) {
      let p = pos.current.get(who.id);
      if (!p) {
        // A new order: out of the kiosk (or, already waiting when the step began, at its place).
        const start = world.current?.cell?.cafe?.spawn ? KIOSK : who.to;
        p = { x: start[0], y: start[1] };
        pos.current.set(who.id, p);
      }
      const dx = who.to[0] - p.x;
      const dy = who.to[1] - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const s = Math.min(1, step / d);
        p.x += dx * s;
        p.y += dy * s;
      }
      const g = groups.current.get(who.id);
      if (g) g.position.set(m(p.x), m(p.y), m(F + TAG_Z));
    }
    // The cups' numbers follow the cups (on the shelf, in the hand, on the pickup).
    const objs = world.current?.objects ?? [];
    for (const [id, g] of cupGroups.current) {
      const o = objs.find((x) => x.id === id);
      if (o) g.position.set(m(o.x), m(o.y), m(o.z + 34));
    }
    // The tags a few times a second.
    tick.current += dt;
    if (tick.current < 0.25) return;
    tick.current = 0;
    const list: Who[] = a.list.map((w) => ({ id: w.id, tag: w.tag, mood: w.mood, patience: w.patience === null ? null : Math.round(w.patience * 10) / 10 }));
    const cups = objs.filter((o) => o.drink?.order !== undefined).map((o) => ({ id: o.id, order: o.drink!.order! }));
    const key = JSON.stringify([list, a.making, a.ready, cups]);
    if (key !== last.current) {
      last.current = key;
      setShown({ list, making: a.making, ready: a.ready, cups });
      // Forget those gone from the scene.
      for (const id of [...pos.current.keys()]) if (!list.some((w) => w.id === id)) pos.current.delete(id);
    }
  });
  return (
    <>
      {shown.list.map((w) => (
        <group
          key={w.id}
          ref={(g) => {
            if (g) groups.current.set(w.id, g);
            else groups.current.delete(w.id);
          }}
        >
          <Html center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
            <div style={TAG} data-mood={w.mood}>
              <span>{FACE[w.mood]}</span>
              <b>{w.tag}</b>
              {w.patience !== null && (
                <i style={BAR}>
                  <i style={{ ...FILL, width: `${w.patience * 100}%`, background: w.patience > 0.5 ? '#5bd17a' : w.patience > 0.2 ? '#f0a23b' : '#eb4034' }} />
                </i>
              )}
            </div>
          </Html>
        </group>
      ))}
      {shown.cups.map((c) => (
        <group
          key={`cup${c.id}`}
          ref={(g) => {
            if (g) cupGroups.current.set(c.id, g);
            else cupGroups.current.delete(c.id);
          }}
        >
          <Html center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
            <div style={CUP}>#{c.order}</div>
          </Html>
        </group>
      ))}
      {(shown.making.length > 0 || shown.ready.length > 0) && (
        <Html position={[m(98), m(-176), m(190)]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div style={BOARD}>
            <span>
              <em style={EM}>준비 중</em> {shown.making.map((n) => `#${n}`).join(' ') || '–'}
            </span>
            <span>
              <em style={{ ...EM, color: '#5bd17a' }}>완료</em> {shown.ready.map((n) => `#${n}`).join(' ') || '–'}
            </span>
          </div>
        </Html>
      )}
    </>
  );
}

const TAG: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(21,24,28,0.82)',
  color: '#fff',
  font: '800 11px Pretendard, system-ui, sans-serif',
  whiteSpace: 'nowrap',
  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
};
const BAR: CSSProperties = { display: 'inline-block', width: 26, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' };
const FILL: CSSProperties = { display: 'block', height: '100%' };
const BOARD: CSSProperties = {
  display: 'grid',
  gap: 2,
  padding: '5px 10px',
  borderRadius: 8,
  background: 'rgba(21,24,28,0.88)',
  color: '#fff',
  font: '700 12px Pretendard, system-ui, sans-serif',
  whiteSpace: 'nowrap',
  boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
};
const CUP: CSSProperties = { padding: '1px 6px', borderRadius: 6, background: '#f0a23b', color: '#15181c', font: '800 11px Pretendard, system-ui, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 2px 5px rgba(0,0,0,0.35)' };
const EM: CSSProperties = { fontStyle: 'normal', fontWeight: 800, color: '#f0a23b', marginRight: 4 };
