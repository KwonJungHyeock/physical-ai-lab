'use client';

/**
 * 실습 환경: a floating panel above the 실습 환경 dock (it stays open while objects are dragged in 3D).
 * 환경 — a scene (빈 화면 · 실험실 · 제조 · 물류 · 생활 · AI 키트), each with its ▶ 데모, and the practice mat with its blocks;
 * 물건 — add from the library, pick one (here or in 3D) and edit colour, size, weight, place;
 * 물리 — off: exact motion, the arm stops at an object; on: objects fall, slide, topple and get pushed.
 */

import { useState, type ReactNode } from 'react';

import { CELLS, type CellId } from '@/engine/simulator/cell/cells';
import { OBJECT_KINDS, OBJECT_ORDER, SCENES, SWATCHES, type Desk, type DeskObject, type ObjectKind, type SceneId } from '@/engine/simulator/desk';

import css from './desk.module.css';

/** ▶ 데모 on a 실습 환경's picture: the arm doing that place's job (off when this arm has no demo there). */
export function DemoPill({ name, ok, busy, onClick, className }: { name: string; ok: boolean; busy: boolean; onClick(): void; className: string }) {
  return (
    <button
      type="button"
      className={className}
      disabled={busy || !ok}
      onClick={onClick}
      aria-label={`${name} 데모 보기`}
      title={ok ? `${name}: 로봇팔이 하는 일을 4단계로 보여 줘요` : '이 로봇팔에 맞춘 데모는 아직 없어요'}
    >
      ▶ 데모
    </button>
  );
}

/** Library icons (the same drawings as docs/mockup/sim-scenes.html). */
const ICON: Record<ObjectKind, ReactNode> = {
  puck: (
    <>
      <path d="M8 11v8c0 2 14 2 14 0v-8" fill="#9aa3ad" />
      <ellipse cx="15" cy="11" rx="7" ry="3" fill="#c7ccd3" />
    </>
  ),
  block: (
    <>
      <path d="M8 9l7-4 7 4v8l-7 4-7-4z" fill="#e5484d" />
      <path d="M8 9l7 4 7-4M15 13v8" stroke="#fff" strokeOpacity=".5" fill="none" />
    </>
  ),
  cylinder: (
    <>
      <path d="M8 7v12c0 2 14 2 14 0V7" fill="#7a5cf5" />
      <ellipse cx="15" cy="7" rx="7" ry="3" fill="#a99bff" />
    </>
  ),
  box: (
    <>
      <path d="M5 9l10-5 10 5v10l-10 5-10-5z" fill="#c89b62" />
      <path d="M5 9l10 5 10-5M15 14v10" stroke="#8a6436" fill="none" />
    </>
  ),
  cup: (
    <>
      <path d="M9 5h12l-2 17h-8z" fill="#5b8cff" />
      <ellipse cx="15" cy="5" rx="6" ry="2" fill="#9fc0ff" />
    </>
  ),
  ball: (
    <>
      <circle cx="11" cy="15" r="6" fill="#e5484d" />
      <circle cx="19" cy="12" r="5" fill="#f5b400" />
    </>
  ),
  part: (
    <>
      <circle cx="15" cy="13" r="8" fill="#b9c0c8" />
      <circle cx="15" cy="13" r="3" fill="#6c7580" />
    </>
  ),
  bin: (
    <>
      <path d="M6 8h18v12H6z" fill="#1fae66" />
      <path d="M8 10h14v8H8z" fill="#0f6b3f" />
    </>
  ),
  tray: <path d="M4 14l11-5 11 5-11 5z" fill="#dfe4ea" stroke="#b9c0c8" />,
  obstacle: (
    <>
      <path d="M8 4h14v18H8z" fill="#f5c400" />
      <path d="M8 8l14 6M8 14l14 6" stroke="#1b1b1b" strokeWidth="2.5" />
    </>
  ),
};

const THUMB: Partial<Record<SceneId, string>> = { lab: '/sim/scenes/lab.jpg', factory: '/sim/scenes/factory.jpg', logistics: '/sim/scenes/logistics.jpg', home: '/sim/scenes/home.jpg' };

interface Props {
  desk: Desk;
  /** The scene shown: the desk's, or 'kit' in the AI kit theme. */
  scene: SceneId;
  kitAvailable: boolean;
  /** This arm has a ▶ 데모 for the place. */
  demoOk(id: SceneId): boolean;
  onDemo(id: SceneId): void;
  busy: boolean;
  /** The open practice works on the mat (it is on whatever the switch says). */
  matNeeded: boolean;
  /** Payload the active arm can lift, g (a heavier object gets a note). */
  payloadG: number;
  canPick: boolean;
  selected: string | null;
  onSelect(id: string | null): void;
  onScene(id: SceneId): void;
  onMat(on: boolean): void;
  onShuffle(): void;
  onReset(): void;
  /** AI kit: one block from the storage box onto the camera's board. */
  onPlaceOne?(): void;
  onAdd(kind: ObjectKind): void;
  onUpdate(id: string, patch: Partial<DeskObject>): void;
  onRemove(id: string): void;
  onClear(): void;
  onClose(): void;
  /** The tab to open on (the dock's [물건 놓기] opens 물건). */
  initialTab?: Tab;
  /** Opened from the left menu bar (a window beside it) rather than above the bottom dock. */
  docked?: boolean;
  /** The 실습 셀 open (it replaces the desk's scene), or null. */
  cell?: CellId | null;
  onCell?: (id: CellId) => void;
}

export type Tab = 'scene' | 'objects';

function Num({ label, value, unit, min, max, step = 1, onChange, disabled }: { label: string; value: number; unit: string; min: number; max: number; step?: number; onChange(v: number): void; disabled?: boolean }) {
  return (
    <label className={css.num} title={label}>
      <input
        type="number"
        aria-label={label}
        value={Math.round(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
      <small>{unit}</small>
    </label>
  );
}

export default function DeskPanel(p: Props) {
  const [tab, setTab] = useState<Tab>(p.initialTab ?? 'scene');
  const kit = p.scene === 'kit' && !p.cell;
  const inCell = !!p.cell;
  const sel = p.desk.objects.find((o) => o.id === p.selected) ?? null;
  const shownTab: Tab = (kit || p.cell) && tab !== 'scene' ? 'scene' : tab;
  return (
    <section className={css.panel} aria-label="실습 환경" data-docked={p.docked || undefined}>
      <header className={css.head}>
        <b>실습 환경</b>
        <small>{inCell ? CELLS.find((c) => c.id === p.cell)?.name : SCENES.find((s) => s.id === p.scene)?.name}</small>
        <button type="button" className={css.x} onClick={p.onClose} aria-label="닫기">
          ✕
        </button>
      </header>
      <div className={css.tabs} role="tablist">
        {(
          [
            ['scene', '환경'],
            ['objects', `물건${p.desk.objects.length ? ` ${p.desk.objects.length}` : ''}`],
          ] as const
        ).map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={shownTab === id} disabled={(kit || inCell) && id !== 'scene'} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>

      {shownTab === 'scene' && (
        <>
          <div className={css.sec}>
            <h4>
              환경
            </h4>
            <div className={css.scenes}>
              {SCENES.filter((s) => s.id === 'empty' || (s.id === 'kit' && p.kitAvailable)).map((s) => (
                <span key={s.id} className={css.sceneItem}>
                  <button type="button" className={css.scene} aria-pressed={!inCell && p.scene === s.id} disabled={p.busy} onClick={() => p.onScene(s.id)}>
                    <span className={css.im} data-scene={s.id} style={THUMB[s.id] ? { backgroundImage: `url(${THUMB[s.id]})` } : undefined}>
                      {s.id === 'kit' ? 'AI 키트' : s.id === 'empty' ? '' : null}
                    </span>
                    <b>{s.name}</b>
                    <small>{s.note}</small>
                  </button>
                  <DemoPill name={s.name} ok={p.demoOk(s.id)} busy={p.busy} onClick={() => p.onDemo(s.id)} className={css.demo} />
                </span>
              ))}
            </div>
          </div>
          {p.onCell && (
            <div className={css.sec}>
              <h4>
                실습 셀
                <em>단계마다 조건이 하나씩</em>
              </h4>
              <div className={css.cells}>
                {CELLS.map((c) => (
                  <button key={c.id} type="button" className={css.cellCard} aria-pressed={p.cell === c.id} disabled={p.busy} onClick={() => p.onCell?.(c.id)}>
                    <i>{c.letter}</i>
                    <b>{c.name}</b>
                    <small>
                      {c.note}
                      {!c.built && <span className={css.soon}> · 단계 준비 중</span>}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!inCell && (
          <div className={css.sec}>
            <h4>
              {kit ? 'AI 키트 블록' : '실습 매트 · 블록 4개'}
              {!kit && p.matNeeded && <em>이 실습에서 써요</em>}
            </h4>
            {!kit && (
              <label className={css.switch}>
                <input type="checkbox" checked={p.matNeeded || p.desk.mat} disabled={p.matNeeded || p.busy} onChange={(e) => p.onMat(e.target.checked)} />
                <span>책상에 매트와 블록 놓기</span>
              </label>
            )}
            <div className={css.row}>
              {kit && p.onPlaceOne && (
                <button type="button" className={css.btn} disabled={p.busy} onClick={p.onPlaceOne}>
                  블록 1개 놓기
                </button>
              )}
              <button type="button" className={css.btn} disabled={p.busy || !p.canPick || !(kit || p.matNeeded || p.desk.mat)} onClick={p.onShuffle}>
                블록 섞기
              </button>
              <button type="button" className={css.btn} disabled={p.busy} onClick={p.onReset}>
                처음 상태로
              </button>
            </div>
            {!p.canPick && <p className={css.note}>이 도구로는 블록을 집을 수 없어요</p>}
          </div>
          )}
        </>
      )}

      {shownTab === 'objects' && (
        <>
          <div className={css.sec}>
            <h4>
              물건 놓기
            </h4>
            <div className={css.lib}>
              {OBJECT_ORDER.map((k) => (
                <button key={k} type="button" className={css.obj} disabled={p.busy || p.desk.objects.length >= 24} onClick={() => p.onAdd(k)}>
                  <svg viewBox="0 0 30 26" aria-hidden="true">
                    {ICON[k]}
                  </svg>
                  {OBJECT_KINDS[k].name}
                </button>
              ))}
            </div>
          </div>
          <div className={css.sec}>
            <h4>
              책상 위 물건 {p.desk.objects.length}개
              {p.desk.objects.length > 0 && (
                <button type="button" className={css.link} disabled={p.busy} onClick={p.onClear}>
                  모두 치우기
                </button>
              )}
            </h4>
            {p.desk.objects.length ? (
              <div className={css.list}>
                {p.desk.objects.map((o, i) => (
                  <span key={o.id} className={css.item} data-on={o.id === p.selected || undefined}>
                    <button type="button" aria-pressed={o.id === p.selected} onClick={() => p.onSelect(o.id === p.selected ? null : o.id)}>
                      <i style={{ background: o.color }} />
                      {OBJECT_KINDS[o.kind].name} {i + 1}
                    </button>
                    <button type="button" className={css.itemX} disabled={p.busy} onClick={() => p.onRemove(o.id)} aria-label={`${OBJECT_KINDS[o.kind].name} ${i + 1} 지우기`} title="지우기">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className={css.note}>없음</p>
            )}
          </div>
          {sel && (
            <div className={css.sec}>
              <h4>
                고른 물건 · {OBJECT_KINDS[sel.kind].name}
                <button type="button" className={css.link} disabled={p.busy} onClick={() => p.onRemove(sel.id)}>
                  지우기
                </button>
              </h4>
              <div className={css.props}>
                <span>색</span>
                <div className={css.row}>
                  {SWATCHES.map((c) => (
                    <button key={c} type="button" className={css.sw} style={{ background: c }} aria-label={c} aria-pressed={sel.color === c} disabled={p.busy} onClick={() => p.onUpdate(sel.id, { color: c })} />
                  ))}
                </div>
                <span>크기</span>
                <div className={css.row}>
                  {OBJECT_KINDS[sel.kind].shape === 'ball' ? (
                    <Num label="지름" value={sel.size[0]} unit="mm 지름" min={10} max={120} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { size: [v, v, v] })} />
                  ) : OBJECT_KINDS[sel.kind].shape === 'box' || OBJECT_KINDS[sel.kind].shape === 'bin' ? (
                    <>
                      <Num label="가로 (x)" value={sel.size[0]} unit="x" min={10} max={300} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { size: [v, sel.size[1], sel.size[2]] })} />
                      <Num label="세로 (y)" value={sel.size[1]} unit="y" min={10} max={300} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { size: [sel.size[0], v, sel.size[2]] })} />
                      <Num label="높이" value={sel.size[2]} unit="높이" min={4} max={300} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { size: [sel.size[0], sel.size[1], v] })} />
                    </>
                  ) : (
                    <>
                      <Num label="지름" value={sel.size[0]} unit="지름" min={10} max={200} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { size: [v, v, sel.size[2]] })} />
                      <Num label="높이" value={sel.size[2]} unit="높이" min={4} max={300} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { size: [sel.size[0], sel.size[1], v] })} />
                    </>
                  )}
                  <small className={css.unit}>mm</small>
                </div>
                <span>무게</span>
                <div className={css.row}>
                  <Num label="무게" value={sel.massG} unit="g" min={1} max={5000} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { massG: v })} />
                  <small className={css.unit} data-warn={sel.massG > p.payloadG || undefined}>
                    {sel.massG > p.payloadG ? `가반 ${p.payloadG}g 보다 무거워요` : `가반 ${p.payloadG}g 안`}
                  </small>
                </div>
                <span>위치</span>
                <div className={css.row}>
                  <Num label="x (앞뒤)" value={sel.x} unit="x" min={-450} max={450} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { x: v })} />
                  <Num label="y (좌우)" value={sel.y} unit="y" min={-450} max={450} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { y: v })} />
                  <Num label="돌림" value={sel.yawDeg} unit="°" min={-180} max={180} step={15} disabled={p.busy} onChange={(v) => p.onUpdate(sel.id, { yawDeg: v })} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </section>
  );
}
