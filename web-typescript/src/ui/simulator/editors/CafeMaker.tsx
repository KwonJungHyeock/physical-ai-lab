'use client';

/**
 * 나만의 카페 (입문 트랙 · 로봇 카페 4~8단계), in the side panel under the quest card: the student's
 * menus and the robot's motion for each (engine/simulator/cell/cafeMenu.ts).
 *
 *  - 메뉴 만들기: a menu card per drink (up to three): start from an example, name it, hot or iced,
 *    shots, ice and water — the cup gauge shows what goes in against the 355 ml rim.
 *  - 동작 만들기: the menu's motion as time bars — the arm's steps (white), each station's pour
 *    (grey) and the arm's wait there (amber). Drag a wait's end: near the pour's end it snaps to the
 *    station's 끝 signal (the magnet); shorter, the rest spills. The last step hands over on the shelf
 *    or through the pickup door.
 *  - 운영 (8단계): the day as it goes — customers, the queue, served, failed, gone — and its report.
 *
 * Every change makes the café program at once (onCode); the step being run lights up. The menus are
 * kept in this browser across the steps (one café, made once, changed by each mission).
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import { CUP_ML, SHOT_ML, type CafeOrder } from '@/engine/simulator/cell/cafe';
import { MENU_PRESETS, cafeProgram, cycleS, motionSteps, newRecipe, waitVerdict, type MenuRecipe, type MotionStep, type StationKey, type WaitMode } from '@/engine/simulator/cell/cafeMenu';
import { missionById } from '@/engine/simulator/cell/missions';
import type { WorldState } from '@/engine/simulator/sim';

import css from './cafeMaker.module.css';

const KEY = 'robot-console-life-cafe-menus';
const MAX_MENUS = 3;

function load(): MenuRecipe[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as MenuRecipe[] | null;
    if (Array.isArray(v) && v.length && v.every((r) => r && r.menu && r.waits)) return v.slice(0, MAX_MENUS);
  } catch {
    /* a fresh café */
  }
  return [newRecipe()];
}
function save(r: MenuRecipe[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* this session only */
  }
}

interface Props {
  mission: string | null;
  busy: boolean;
  runningLine: number;
  onCode(code: string, cardOf: (line: number) => string): void;
  /** The café as it runs (운영's live numbers and report). */
  world: RefObject<WorldState | null>;
  /** The quest's thing to change: the door (5단계), a second menu (7단계). */
  focus?: 'door' | 'menu2' | null;
}

/** The cup: what the menu puts in, stacked, against the rim. */
function CupGauge({ m }: { m: CafeOrder }) {
  const shot = m.shots * SHOT_ML;
  const total = m.ice + shot + m.water;
  const pct = (v: number) => `${Math.min(100, (v / CUP_ML) * 100)}%`;
  return (
    <span className={css.cup} data-over={total > CUP_ML || undefined} title={`${total} / ${CUP_ML} ml`}>
      <span className={css.glass}>
        <i style={{ height: pct(m.ice), background: '#d9eef7' }} />
        <i style={{ height: pct(shot), background: '#5a3420' }} />
        <i style={{ height: pct(m.water), background: m.hot ? '#d98a5a' : '#7fb2d0' }} />
      </span>
      <small>
        <b>{total}</b> / {CUP_ML} ml{total > CUP_ML && <em> 넘쳐요</em>}
      </small>
    </span>
  );
}

/** One motion step as a time bar: the arm's time, then (a station) its pour and the arm's wait, draggable. */
function StepBar({ s, x0, scale, busy, on, onWait }: { s: MotionStep; x0: number; scale: number; busy: boolean; on: boolean; onWait(w: WaitMode): void }) {
  const track = useRef<HTMLDivElement>(null);
  const px = (sec: number) => `${Math.max(0, sec * scale)}%`;
  const v = waitVerdict(s);
  const start = x0 + s.armS / 2;
  const drag = (e: ReactPointerEvent) => {
    if (busy || s.pourS === undefined) return;
    const el = track.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const sec = ((ev.clientX - r.left) / r.width) * (100 / scale) - start;
      // Near the pour's end: on its 끝 signal (the magnet); else a number of seconds.
      if (Math.abs(sec - s.pourS!) < 1.5) onWait({ k: 'signal' });
      else onWait({ k: 'sec', s: Math.round(Math.max(0.2, Math.min(60, sec)) * 2) / 2 });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={css.track} ref={track}>
      <i className={css.arm} style={{ left: px(x0), width: px(s.armS) }} data-on={on || undefined} />
      {s.pourS !== undefined && (
        <>
          <i className={css.pour} style={{ left: px(start), width: px(s.pourS) }} />
          <i className={css.wait} data-v={v} data-signal={s.wait?.k === 'signal' || undefined} style={{ left: px(start), width: px(s.waitS ?? 0) }}>
            <b className={css.handle} onPointerDown={drag} role="slider" aria-label={`${s.label} 기다림`} aria-valuenow={s.waitS} tabIndex={0} />
          </i>
        </>
      )}
    </div>
  );
}

export default function CafeMaker({ mission, busy, runningLine, onCode, world, focus }: Props) {
  const [recipes, setRecipes] = useState<MenuRecipe[]>(() => [newRecipe()]);
  const [sel, setSel] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
    setRecipes(load());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) save(recipes);
  }, [recipes, loaded]);

  const m = mission ? missionById(mission) : null;
  const setup = m?.setup;
  const orders = setup?.spawn?.customers ?? setup?.orders ?? 1;
  // 4단계 starts with one menu; the missions use what the student has made.
  const shown = useMemo(() => (mission === 'F4' ? recipes.slice(0, 1) : recipes), [mission, recipes]);
  const made = useMemo(() => {
    const st = mission ? missionById(mission)?.setup : undefined;
    return cafeProgram(mission === 'F4' ? recipes.slice(0, 1) : recipes, st?.spawn?.customers ?? st?.orders ?? 1);
  }, [mission, recipes]);
  useEffect(
    () =>
      onCode(made.code, (line) => {
        for (let k = 0; k < made.lines.length; k += 1) {
          const i = made.lines[k].findIndex(([a, b]) => line >= a && line <= b);
          if (i >= 0) return `메뉴 ${k + 1} · ${motionSteps(recipes[k])[i].label}`;
        }
        return '';
      }),
    [made, onCode, recipes],
  );
  const running = (() => {
    for (let k = 0; k < made.lines.length; k += 1) {
      const i = made.lines[k].findIndex(([a, b]) => runningLine >= a && runningLine <= b);
      if (i >= 0) return { k, i };
    }
    return null;
  })();

  const cur = shown[Math.min(sel, shown.length - 1)] ?? shown[0];
  const ci = shown.indexOf(cur);
  const edit = (r: MenuRecipe) => setRecipes((all) => all.map((o, i) => (i === ci ? r : o)));
  const setMenu = (p: Partial<CafeOrder>) => edit({ ...cur, menu: { ...cur.menu, ...p } });
  const steps = motionSteps(cur);
  const total = cycleS(cur);
  // The bars' scale: the drink's time, at least a minute (so a long wait can be dragged out).
  const span = Math.max(60, Math.ceil((total + 10) / 10) * 10);
  const scale = 100 / span;
  const xs: number[] = [];
  for (let k = 0; k < steps.length; k += 1) xs.push(k ? xs[k - 1] + steps[k - 1].armS + (steps[k - 1].waitS ?? 0) : 0);

  const order = (
    <div className={css.order} key="order">
      <em>{setup?.spawn ? 'DAY' : 'ORDER'}</em>
      <b>{setup?.spawn ? `손님 ${orders}명 · 내 메뉴 중 무작위` : `주문 ${orders}잔 · ${setup?.menuQueue ? setup.menuQueue.map((q) => `메뉴 ${q}`).join(' → ') : '메뉴 1'}`}</b>
    </div>
  );
  // 메뉴 카드: one per drink.
  const tabs = (
    <div className={css.tabs} role="tablist" key="tabs">
      {shown.map((r, k) => (
        <button key={k} type="button" role="tab" aria-selected={k === ci} className={css.tab} data-on={k === ci || undefined} disabled={busy} onClick={() => setSel(k)}>
          <i>메뉴 {k + 1}</i>
          {r.menu.name}
        </button>
      ))}
      {mission !== 'F4' && recipes.length < MAX_MENUS && (
        <button
          type="button"
          className={css.add}
          data-glow={(focus === 'menu2' && recipes.length < 2) || undefined}
          disabled={busy}
          onClick={() => {
            setRecipes((all) => [...all, newRecipe(MENU_PRESETS[all.length % MENU_PRESETS.length], all[0]?.door ?? true)]);
            setSel(recipes.length);
          }}
        >
          + 메뉴
        </button>
      )}
    </div>
  );
  const menuPlate = (
    <section className={css.plate} key="menu">
      <header>
        <em>MENU</em>
        <b>메뉴 만들기</b>
        <CupGauge m={cur.menu} />
      </header>
      <div className={css.presets}>
        {MENU_PRESETS.map((p) => (
          <button key={p.name} type="button" disabled={busy} data-on={p.name === cur.menu.name || undefined} onClick={() => setMenu({ ...p })}>
            {p.name}
          </button>
        ))}
      </div>
      <div className={css.fields}>
        <label className={css.name}>
          이름
          <input value={cur.menu.name} maxLength={14} disabled={busy} onChange={(e) => setMenu({ name: e.target.value.replace(/"/g, '') || '내 메뉴' })} />
        </label>
        <span className={css.seg} role="group" aria-label="따뜻하게 · 차갑게">
          <button type="button" disabled={busy} data-on={!cur.menu.hot || undefined} onClick={() => setMenu({ hot: false })}>
            아이스
          </button>
          <button type="button" disabled={busy} data-on={cur.menu.hot || undefined} onClick={() => setMenu({ hot: true, ice: 0 })}>
            핫
          </button>
        </span>
        <span className={css.step}>
          샷
          <button type="button" disabled={busy || cur.menu.shots <= 0} onClick={() => setMenu({ shots: cur.menu.shots - 1 })} aria-label="샷 빼기">
            −
          </button>
          <b>{cur.menu.shots}</b>
          <button type="button" disabled={busy || cur.menu.shots >= 4} onClick={() => setMenu({ shots: cur.menu.shots + 1 })} aria-label="샷 더하기">
            +
          </button>
        </span>
        <label className={css.range}>
          얼음 <b>{cur.menu.ice} ml</b>
          <input type="range" min={0} max={200} step={5} value={cur.menu.ice} disabled={busy || cur.menu.hot} onChange={(e) => setMenu({ ice: Number(e.target.value) })} />
        </label>
        <label className={css.range}>
          {cur.menu.hot ? '온수' : '물'} <b>{cur.menu.water} ml</b>
          <input type="range" min={0} max={250} step={5} value={cur.menu.water} disabled={busy} onChange={(e) => setMenu({ water: Number(e.target.value) })} />
        </label>
      </div>
    </section>
  );
  const motion = (
    <section className={css.plate} key="motion">
      <header>
        <em>MOTION</em>
        <b>로봇 동작 만들기</b>
        <span className={css.cycle}>
          한 잔 약 <b>{Math.round(total)}초</b>
        </span>
      </header>
      <div className={css.axis}>
        {Array.from({ length: span / 10 + 1 }, (_, k) => (
          <i key={k} style={{ left: `${k * 10 * scale}%` }}>
            {k * 10}s
          </i>
        ))}
      </div>
      <ol className={css.rows}>
        {steps.map((s, i) => {
          const v = waitVerdict(s);
          const on = !!running && running.k === ci && running.i === i;
          return (
            <li key={s.key} data-on={on || undefined}>
              <span className={css.label}>
                <b>{s.label}</b>
                {s.wait && (
                  <small data-v={v}>
                    {s.wait.k === 'signal' ? '🧲 끝 신호까지' : `${s.waitS?.toFixed(1)}초 기다림`}
                    {v === 'short' ? ' · 쏟아져요' : v === 'long' ? ' · 길어요' : ''}
                  </small>
                )}
                {s.key === 'serve' && (
                  <label className={css.door} data-glow={(focus === 'door' && !cur.door) || undefined}>
                    <input type="checkbox" disabled={busy} checked={cur.door} onChange={(e) => setRecipes((all) => all.map((r) => ({ ...r, door: e.target.checked })))} />
                    픽업 문으로
                  </label>
                )}
              </span>
              <StepBar s={s} x0={xs[i]} scale={scale} busy={busy} on={on} onWait={(w) => edit({ ...cur, waits: { ...cur.waits, [s.key as StationKey]: w } })} />
            </li>
          );
        })}
      </ol>
      <p className={css.tip}>주황 막대 끝을 끌어 기다림을 정해요. 회색(장비가 붓는 시간) 끝에 가까우면 🧲 끝 신호에 붙어요.</p>
    </section>
  );
  const day = setup?.spawn ? <DayBoard key="day" world={world} customers={setup.spawn.customers} /> : null;
  // 5단계: the one switch, on its own (the same as the 픽업대에 놓기 row's).
  const door = (
    <section className={css.plate} key="door">
      <header>
        <em>SERVE</em>
        <b>건네기</b>
      </header>
      <label className={css.doorBig} data-glow={!cur.door || undefined}>
        <input type="checkbox" disabled={busy} checked={cur.door} onChange={(e) => setRecipes((all) => all.map((r) => ({ ...r, door: e.target.checked })))} />
        <span>
          <b>픽업 문으로 건네기</b>
          <small>{cur.door ? '문을 열고 손님이 가져갈 때까지 기다린 뒤 닫아요' : '지금은 픽업대에 놓기만 해요'}</small>
        </span>
      </label>
    </section>
  );
  const foot = (
    <div className={css.foot} key="foot">
      <button
        type="button"
        className={css.ghost}
        disabled={busy}
        onClick={() => {
          if (window.confirm('메뉴 카드를 처음(아이스 아메리카노 하나)으로 돌릴까요?')) {
            setRecipes([newRecipe(undefined, recipes[0]?.door ?? false)]);
            setSel(0);
          }
        }}
      >
        처음으로
      </button>
      {recipes.length > 1 && mission !== 'F4' && (
        <button
          type="button"
          className={css.ghost}
          disabled={busy}
          onClick={() => {
            setRecipes((all) => all.filter((_, i) => i !== ci));
            setSel(0);
          }}
        >
          이 메뉴 빼기
        </button>
      )}
    </div>
  );
  const parts = { order, tabs, menu: menuPlate, door, motion, day, foot };
  const want = mission ? FOCUS[mission] : undefined;
  // 자유 연습 (and a step without a focus): everything, as before.
  if (!want) return <div className={css.maker}>{[order, tabs, menuPlate, motion, day, foot]}</div>;
  // 입문 퀘스트: the one thing this quest changes; the rest folded under 자세히.
  const rest = (['order', 'tabs', 'menu', 'motion', 'day', 'foot'] as const).filter((k) => !want.includes(k)).map((k) => parts[k]);
  return (
    <div className={css.maker}>
      {want.map((k) => parts[k])}
      <details className={css.more}>
        <summary>자세히 ▾</summary>
        {rest}
      </details>
    </div>
  );
}

/**
 * 입문 퀘스트: what each café step shows (the one thing it is about); the rest is under 자세히.
 * 4 내 메뉴 · 5 픽업 문 · 6 주문 2잔 (nothing to change) · 7 메뉴 2 · 8 운영.
 */
const FOCUS: Record<string, readonly ('order' | 'tabs' | 'menu' | 'door' | 'motion' | 'day' | 'foot')[]> = {
  F4: ['menu'],
  F5: ['door'],
  F6: ['order'],
  F7: ['tabs', 'menu'],
  F8: ['order', 'day'],
};

/** 운영: the day as it goes (customers, queue, served, failed, gone), then its report. */
function DayBoard({ world, customers }: { world: RefObject<WorldState | null>; customers: number }) {
  const [s, setS] = useState<{ came: number; queue: number; ok: number; bad: number; left: number; t: number; wait: number; why: [string, number][] } | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const c = world.current?.cell?.cafe;
      const t = world.current?.cell?.line.t ?? 0;
      if (!c) return setS(null);
      const ok = c.served.filter((d) => d.ok);
      const why = new Map<string, number>();
      for (const d of c.served.filter((x) => !x.ok)) why.set(d.why.replace(/\s*\(.*\)$/, ''), (why.get(d.why.replace(/\s*\(.*\)$/, '')) ?? 0) + 1);
      if (c.trayPours.length) why.set('붓는 중에 컵을 뺌 · 쏟음', c.trayPours.length);
      if (c.left) why.set('기다리다 돌아감', c.left);
      setS({
        came: c.came,
        queue: c.queue.filter((q) => !q.started).length,
        ok: ok.length,
        bad: c.served.length - ok.length,
        left: c.left,
        t,
        wait: ok.length ? ok.reduce((a, d) => a + d.waited, 0) / ok.length : 0,
        why: [...why.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
      });
    }, 300);
    return () => window.clearInterval(id);
  }, [world]);
  if (!s) return null;
  const perHour = s.t > 30 ? Math.round((s.ok / s.t) * 3600) : 0;
  return (
    <section className={css.plate} aria-label="운영 현황">
      <header>
        <em>DAY</em>
        <b>운영 현황</b>
        <span className={css.cycle}>
          {Math.floor(s.t / 60)}분 {Math.round(s.t % 60)}초
        </span>
      </header>
      <div className={css.stats}>
        <span>
          <b>
            {s.came}/{customers}
          </b>
          손님
        </span>
        <span>
          <b>{s.queue}</b>대기 줄
        </span>
        <span data-ok>
          <b>{s.ok}</b>성공
        </span>
        <span data-bad>
          <b>{s.bad + s.left}</b>실패 · 돌아감
        </span>
        <span>
          <b>{perHour}</b>시간당 잔
        </span>
        <span>
          <b>{Math.round(s.wait)}초</b>평균 대기
        </span>
      </div>
      {s.why.length > 0 && (
        <ul className={css.why}>
          {s.why.map(([w, n]) => (
            <li key={w}>
              {w} <b>{n}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
