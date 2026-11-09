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

import { useEffect, useMemo, useState, type RefObject } from 'react';

import { CUP_ML, SHOT_ML, type CafeOrder } from '@/engine/simulator/cell/cafe';
import { MENU_PRESETS, cafeProgram, cycleS, motionSteps, newRecipe, orderOf, waitVerdict, type MenuRecipe, type MotionKey, type MotionStep } from '@/engine/simulator/cell/cafeMenu';
import { missionById } from '@/engine/simulator/cell/missions';
import type { WorldState } from '@/engine/simulator/sim';

import css from './cafeMaker.module.css';

const KEY = 'robot-console-life-cafe-menus';
const MAX_MENUS = 3;
/** A motion block's picture. */
const BLOCK_ICON: Record<MotionKey | 'hot', string> = { cup: '🥤', ice: '🧊', shot: '☕', water: '💧', hot: '♨️', serve: '🛎️' };

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

export default function CafeMaker({ mission, busy, runningLine, onCode, world, focus }: Props) {
  const [recipes, setRecipes] = useState<MenuRecipe[]>(() => [newRecipe()]);
  const [sel, setSel] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // 미션 2 (두 잔 연속): how many times the program repeats one drink — the student sets it to the orders.
  const [repeat, setRepeat] = useState(1);
  const [dragKey, setDragKey] = useState<MotionKey | null>(null);
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
    const times = mission === 'F6' ? repeat : (st?.spawn?.customers ?? st?.orders ?? 1);
    return cafeProgram(mission === 'F4' ? recipes.slice(0, 1) : recipes, times);
  }, [mission, recipes, repeat]);
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

  const order = (
    <div className={css.order} key="order">
      <em>ORDER</em>
      <b>{setup?.spawn ? `손님 ${orders}명 · 내 메뉴 중 무작위` : `주문 ${orders}잔 · ${setup?.menuQueue ? setup.menuQueue.map((q) => `메뉴 ${q}`).join(' → ') : '메뉴 1'}`}</b>
    </div>
  );
  // 메뉴 카드: one per drink.
  const tabs = (
    <div className={css.tabs} role="tablist">
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
          data-lead="add"
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
    <section className={css.plate} key="menu" data-lead="menu">
      <header>
        <em>MENU</em>
        <b>메뉴 만들기</b>
        <CupGauge m={cur.menu} />
      </header>
      {(mission !== 'F4' || recipes.length > 1) && tabs}
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
          <span>
            얼음 <b>{cur.menu.ice} ml</b>
          </span>
          <input type="range" min={0} max={200} step={5} value={cur.menu.ice} disabled={busy || cur.menu.hot} onChange={(e) => setMenu({ ice: Number(e.target.value) })} />
        </label>
        <label className={css.range}>
          <span>
            {cur.menu.hot ? '온수' : '물'} <b>{cur.menu.water} ml</b>
          </span>
          <input type="range" min={0} max={250} step={5} value={cur.menu.water} disabled={busy} onChange={(e) => setMenu({ water: Number(e.target.value) })} />
        </label>
      </div>
    </section>
  );
  // 로봇 동작 블록: the menu's motion as blocks in order (drag or ▲▼ to move), a station's wait on its block
  // (🧲 끝 신호 or seconds), the hand-over a module. Around them, as the quests go on: 🔁 반복 (6), ❓ 메뉴 조건 (7), ⚡ 주문 이벤트 (8).
  const seq = orderOf(cur);
  const move = (key: MotionKey, to: number) => {
    const o = seq.filter((k) => k !== key);
    o.splice(Math.max(0, Math.min(o.length, to)), 0, key);
    edit({ ...cur, order: o });
  };
  const loops = !mission || mission === 'F6' || mission === 'F7' || mission === 'F8';
  const branches = (!mission || mission === 'F7' || mission === 'F8') && shown.length > 1;
  const event = !mission || mission === 'F8';
  const block = (s: MotionStep, i: number) => {
    const v = waitVerdict(s);
    const on = !!running && running.k === ci && running.i === i;
    const k = s.key as MotionKey;
    const title =
      k === 'cup' ? '컵 받기' : k === 'ice' ? `얼음 ${cur.menu.ice} ml` : k === 'shot' ? `샷 ${cur.menu.shots}개` : k === 'water' ? `${cur.menu.hot ? '온수' : '물'} ${cur.menu.water} ml` : '건네기';
    const station = k === 'ice' || k === 'shot' || k === 'water';
    return (
      <li
        key={k}
        className={css.block}
        data-kind={k}
        data-on={on || undefined}
        data-drag={dragKey === k || undefined}
        draggable={!busy}
        onDragStart={(e) => {
          setDragKey(k);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDragKey(null)}
        onDragOver={(e) => {
          if (dragKey && dragKey !== k) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragKey && dragKey !== k) move(dragKey, seq.filter((x) => x !== dragKey).indexOf(k));
          setDragKey(null);
        }}
      >
        <i className={css.grip} aria-hidden="true">
          ⠿
        </i>
        <span className={css.icon} aria-hidden="true">
          {BLOCK_ICON[k === 'water' && cur.menu.hot ? 'hot' : k]}
        </span>
        <b className={css.btitle}>{title}</b>
        {station && s.wait && (
          <span className={css.waitChip} data-v={v}>
            <button
              type="button"
              disabled={busy}
              onClick={() => edit({ ...cur, waits: { ...cur.waits, [k]: s.wait!.k === 'signal' ? { k: 'sec', s: Math.round(s.pourS ?? 3) } : { k: 'signal' } } })}
              title="🧲 끝 신호까지 기다리기 ↔ 초로 기다리기"
            >
              {s.wait.k === 'signal' ? '🧲 끝 신호까지' : `⏳ ${s.waitS?.toFixed(0)}초`}
            </button>
            {s.wait.k === 'sec' && (
              <>
                <button type="button" disabled={busy} aria-label="1초 줄이기" onClick={() => edit({ ...cur, waits: { ...cur.waits, [k]: { k: 'sec', s: Math.max(1, (s.waitS ?? 1) - 1) } } })}>
                  −
                </button>
                <button type="button" disabled={busy} aria-label="1초 늘리기" onClick={() => edit({ ...cur, waits: { ...cur.waits, [k]: { k: 'sec', s: Math.min(60, (s.waitS ?? 1) + 1) } } })}>
                  +
                </button>
              </>
            )}
            {v === 'short' && <em>쏟아져요</em>}
            {v === 'long' && <em>길어요</em>}
          </span>
        )}
        {k === 'serve' && (
          <span className={css.serve} data-lead="door" data-glow={(focus === 'door' && !cur.door) || undefined}>
            <select disabled={busy} value={cur.door ? 'door' : 'place'} onChange={(e) => setRecipes((all) => all.map((r) => ({ ...r, door: e.target.value === 'door' })))} aria-label="건네는 방법">
              <option value="place">픽업대에 놓기</option>
              <option value="door">문으로 건네기 (모듈)</option>
            </select>
          </span>
        )}
        <span className={css.moveKeys}>
          <button type="button" disabled={busy || i === 0} onClick={() => move(k, i - 1)} aria-label={`${title} 위로`}>
            ▲
          </button>
          <button type="button" disabled={busy || i === steps.length - 1} onClick={() => move(k, i + 1)} aria-label={`${title} 아래로`}>
            ▼
          </button>
        </span>
        {k === 'serve' && cur.door && (
          <ol className={css.module} aria-label="문으로 건네기 안의 순서">
            <li>🚪 문 열기 · [문 열림] 기다리기</li>
            <li>✋ 손님이 가져갈 때까지 ([손 감지] 켜졌다 꺼짐)</li>
            <li>🚪 문 닫기 · [문 닫힘] 기다리기</li>
          </ol>
        )}
      </li>
    );
  };
  const blocks = <ol className={css.blocks}>{steps.map(block)}</ol>;
  const others = shown
    .map((r, k) => ({ r, k }))
    .filter(({ k }) => k !== ci)
    .map(({ r, k }) => (
      <button key={k} type="button" className={css.branchOff} disabled={busy} onClick={() => setSel(k)}>
        ❓ 주문이 메뉴 {k + 1}이면 · {r.menu.name} · 블록 {motionSteps(r).length}개 ▸
      </button>
    ));
  const inner = branches ? (
    <>
      <div className={css.wrap} data-kind="if">
        <span className={css.wrapHead}>❓ 주문이 메뉴 {ci + 1}이면 · {cur.menu.name}</span>
        {blocks}
      </div>
      {others}
    </>
  ) : (
    blocks
  );
  const looped = loops ? (
    <div className={css.wrap} data-kind="loop">
      <span className={css.wrapHead} data-lead={mission === 'F6' ? 'repeat' : undefined} data-glow={(mission === 'F6' && repeat !== orders) || undefined}>
        🔁 주문마다 반복
        {mission === 'F6' ? (
          <span className={css.step}>
            <button type="button" disabled={busy || repeat <= 1} onClick={() => setRepeat(repeat - 1)} aria-label="반복 줄이기">
              −
            </button>
            <b>{repeat}</b>
            <button type="button" disabled={busy || repeat >= 5} onClick={() => setRepeat(repeat + 1)} aria-label="반복 늘리기">
              +
            </button>
            번
          </span>
        ) : (
          <b> {orders}번</b>
        )}
        {mission === 'F6' && <small>{repeat < orders ? `주문은 ${orders}잔인데 ${repeat}번만 만들어요` : repeat > orders ? '주문보다 많아요: 남는 번은 다음 주문을 기다려요' : '주문 수만큼 되풀이해요'}</small>}
      </span>
      {inner}
    </div>
  ) : (
    inner
  );
  const motion = (
    <section className={css.plate} key="motion" data-lead="motion">
      <header>
        <em>PROGRAM</em>
        <b>로봇 동작 블록</b>
        <span className={css.cycle}>
          한 잔 약 <b>{Math.round(total)}초</b>
        </span>
      </header>
      {event ? (
        <div className={css.wrap} data-kind="event">
          <span className={css.wrapHead}>⚡ 주문이 들어오면</span>
          {looped}
        </div>
      ) : (
        looped
      )}
      <p className={css.tip}>블록을 끌거나 ▲▼로 순서를 바꿔요. 🧲는 장비의 끝 신호까지 기다리고, 초로 정하면 붓는 시간보다 짧을 때 쏟아져요.</p>
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
      <label className={css.doorBig} data-glow={!cur.door || undefined} data-lead="door">
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
  const parts = { order, menu: menuPlate, door, motion, day, foot };
  const want = mission ? FOCUS[mission] : undefined;
  // 자유 연습 (and a step without a focus): everything, as before.
  if (!want) return <div className={css.maker}>{[order, menuPlate, motion, day, foot]}</div>;
  // 입문 퀘스트: the one thing this quest changes; the rest folded under 자세히.
  const rest = (['order', 'menu', 'motion', 'day', 'foot'] as const).filter((k) => !want.includes(k)).map((k) => parts[k]);
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
 * 4 내 메뉴 + 블록(순서 · 기다림) · 5 건네기 모듈 · 6 반복 블록 · 7 메뉴 2 + 조건 블록 · 8 운영.
 */
const FOCUS: Record<string, readonly ('order' | 'menu' | 'door' | 'motion' | 'day' | 'foot')[]> = {
  F4: ['menu', 'motion'],
  F5: ['motion'],
  F6: ['order', 'motion'],
  F7: ['menu', 'motion'],
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
