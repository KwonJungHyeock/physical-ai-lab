'use client';

/**
 * Jog panel of the control dock, laid out like a robot teach pendant:
 * a coordinate frame switch (base coordinates — position X·Y·Z and rotation
 * RX·RY·RZ, the default as on industrial pendants — or joints), speed override, step size,
 * jog keys (tap = one step, hold = continuous motion at the set speed), and
 * per-joint position bars with the joint limits marked.
 *
 * The parent decides what a step means: in the simulator the arm moves on
 * screen; on the robot the same keys move the real arm (after the same
 * collision check).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { jointMax, jointMin } from '@/engine/robot/limits';

import { JointGlyph, TurnIcon, jointLabels } from './jointInfo';
import { activeArm } from '@/engine/robot/arms';
import { useLive, type Live } from '../liveStore';
import css from '../console.module.css';

/** Base-frame jog: along x / y / z (mm), or turning the tool about x / y / z (rx / ry / rz, °) with its tip kept. */
export type Axis = 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz';
/** The tool now: tip position (mm) and orientation about the base axes (°, as the monitor shows). */
export interface ToolNow {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

interface Props {
  /** Live joint angles (read here: the jog panel redraws, not the whole console). */
  live: Live;
  /** Tool tip position for given angles, mm. */
  tipOf(angles: readonly number[]): ToolNow | null;
  busy: boolean;
  /** Controls move the real robot. */
  real: boolean;
  /** Speed override, percent (the parent scales jog moves by it). */
  speed: number;
  onSpeed(pct: number): void;
  /** Slider dragged: preview the pose (and in the simulator, move there). */
  onJointPreview(i: number, deg: number): void;
  /** Slider let go: on the robot, send the pose. */
  onJointCommit(i: number, deg: number): void;
  onJointStep(i: number, delta: number): void;
  /** One step: mm along x / y / z, ° about rx / ry / rz. */
  onTipStep(axis: Axis, delta: number): void;
  /** Key held: move continuously (joint or tool tip along a base axis) until onJogStop. */
  onJointJog(i: number, dir: -1 | 1): void;
  onTipJog(axis: Axis, dir: -1 | 1, scale?: number): void;
  /** Slide jog: how fast, as a share of the set speed (0.1..1), while it moves. */
  onJogScale(scale: number): void;
  onJogStop(): void;
  /** The joint the jog keys work on (0..5), also picked from its point on the 3D arm. */
  selected: number;
  onSelect(i: number): void;
  /** Joints or tool frame shown (the 3D view shows the joint points in the joint frame). */
  onFrame?(f: Frame): void;
  /** Pointer or keyboard in the panel: the joints are being adjusted (the 3D view shows their points). */
  onActivity?(): void;
  /** The pointer is on the panel (true) or has left it (false). */
  onHold?(on: boolean): void;
}

export type Frame = 'joint' | 'base';
const JOINT_STEPS = [0.5, 1, 5, 10];
const TIP_STEPS = [1, 5, 10, 20];
/** The rotation step that goes with each position step (same chip). */
const TURN_STEPS = [1, 2, 5, 10];
const AXES: { axis: Axis; minus: string; plus: string; color: string }[] = [
  { axis: 'x', minus: '뒤', plus: '앞', color: '#e5484d' },
  { axis: 'y', minus: '오른쪽', plus: '왼쪽', color: '#30a46c' },
  { axis: 'z', minus: '아래', plus: '위', color: '#3e63dd' },
];
const TURNS: { axis: Axis; color: string }[] = [
  { axis: 'rx', color: '#e5484d' },
  { axis: 'ry', color: '#30a46c' },
  { axis: 'rz', color: '#3e63dd' },
];

/** A press shorter than this is a tap (one step); held longer, the axis moves continuously. */
const HOLD_MS = 250;

/**
 * Tap = one step of the chosen size; hold = continuous motion until let go
 * (released anywhere, also when the key gets disabled under the finger).
 */
function usePressJog(step: () => void, start: () => void, stop: () => void) {
  const fns = useRef({ step, start, stop });
  useEffect(() => {
    fns.current = { step, start, stop };
  });
  const press = useRef<{ timer: number; holding: boolean } | null>(null);
  useEffect(() => {
    const up = () => {
      const p = press.current;
      if (!p) return;
      press.current = null;
      window.clearTimeout(p.timer);
      if (p.holding) fns.current.stop();
      else fns.current.step();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      const p = press.current;
      if (p) {
        window.clearTimeout(p.timer);
        if (p.holding) fns.current.stop();
      }
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || press.current) return;
      const p = { timer: 0, holding: false };
      p.timer = window.setTimeout(() => {
        p.holding = true;
        fns.current.start();
      }, HOLD_MS);
      press.current = p;
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) fns.current.step();
      }
    },
  };
}

function JogKey({ dir, label, disabled, onStep, onStart, onStop, turn }: { dir: -1 | 1; label: string; disabled: boolean; onStep(): void; onStart(): void; onStop(): void; turn?: boolean }) {
  const hold = usePressJog(onStep, onStart, onStop);
  return (
    <button type="button" className={turn ? css.jpKey : css.jogKey} disabled={disabled} aria-label={label} title={`${label} · 짧게 누르면 한 칸, 누르고 있으면 계속`} {...hold}>
      {turn ? (
        <TurnIcon dir={dir} />
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d={dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/** Pulled less than this share of the way, the slide jog does not move. */
const SLIDE_DEAD = 0.12;

/**
 * Slide jog: pull the knob left or right; the further it goes, the faster the
 * tool moves. Let go and the knob springs back to the middle and the arm stops.
 */
function SlideJog({ label, disabled, onStart, onScale, onStop }: { label: string; disabled: boolean; onStart(dir: -1 | 1, scale: number): void; onScale(scale: number): void; onStop(): void }) {
  const track = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState<number | null>(null);
  const drag = useRef<{ id: number; dir: 0 | -1 | 1 } | null>(null);
  const fns = useRef({ onStart, onScale, onStop });
  useEffect(() => {
    fns.current = { onStart, onScale, onStop };
  });
  useEffect(
    () => () => {
      if (drag.current?.dir) fns.current.onStop();
    },
    [],
  );
  const move = (clientX: number) => {
    const b = track.current?.getBoundingClientRect();
    const d = drag.current;
    if (!b || !d) return;
    const f = Math.max(-1, Math.min(1, (clientX - (b.left + b.width / 2)) / (b.width / 2 - 14)));
    setPull(f);
    const dir = Math.abs(f) < SLIDE_DEAD ? 0 : f > 0 ? 1 : -1;
    const scale = Math.max(0.1, (Math.abs(f) - SLIDE_DEAD) / (1 - SLIDE_DEAD));
    if (dir !== d.dir) {
      if (d.dir) fns.current.onStop();
      d.dir = dir;
      if (dir) fns.current.onStart(dir, scale);
    } else if (dir) fns.current.onScale(scale);
  };
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    if (drag.current.dir) fns.current.onStop();
    drag.current = null;
    setPull(null);
  };
  return (
    <div
      ref={track}
      className={css.slideJog}
      role="slider"
      aria-label={label}
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-valuenow={Math.round((pull ?? 0) * 100)}
      aria-disabled={disabled || undefined}
      title={`${label} · 끌면 끄는 만큼 빠르게, 놓으면 멈춰요`}
      data-dragging={pull !== null || undefined}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, dir: 0 };
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        if (drag.current?.id === e.pointerId) move(e.clientX);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <i aria-hidden="true">−</i>
      <span className={css.slideKnob} style={{ '--pull': pull ?? 0 } as React.CSSProperties} />
      <i aria-hidden="true">+</i>
    </div>
  );
}

export default function ControlPanel(p: Props) {
  const angles = useLive(p.live, (v) => v.angles);
  const { tipOf } = p;
  const tip = useMemo(() => tipOf(angles), [tipOf, angles]);
  const [frame, setFrame] = useState<Frame>('base');
  /** The coordinate row whose drag handle shows (one at a time keeps the six rows short). */
  const [sel, setSel] = useState<Axis>('z');
  const [jStep, setJStep] = useState(5);
  const [tStep, setTStep] = useState(10);
  // The how-to lines stay behind [?] (the panel stays short; the keys say what they do on hover).
  const [help, setHelp] = useState(false);
  const [drag, setDrag] = useState<{ i: number; deg: number } | null>(null);

  const commit = () => {
    if (drag) p.onJointCommit(drag.i, drag.deg);
    setDrag(null);
  };
  const steps = frame === 'joint' ? JOINT_STEPS : TIP_STEPS;
  const step = frame === 'joint' ? jStep : tStep;
  const chooseFrame = (f: Frame) => {
    setFrame(f);
    p.onFrame?.(f);
  };

  // The panel may go away under the pointer (folded): then it no longer holds the joint points.
  const hovered = useRef(false);
  const holdRef = useRef(p.onHold);
  useEffect(() => {
    holdRef.current = p.onHold;
  });
  useEffect(
    () => () => {
      if (hovered.current) holdRef.current?.(false);
    },
    [],
  );

  // Keyboard in the joint frame: ↑ ↓ pick the joint, ← → turn it (tap = one step, hold = keep turning).
  const keyHold = useRef<{ key: string; timer: number; holding: boolean } | null>(null);
  const endKey = (tap: boolean) => {
    const k = keyHold.current;
    if (!k) return;
    keyHold.current = null;
    window.clearTimeout(k.timer);
    if (k.holding) p.onJogStop();
    else if (tap) p.onJointStep(p.selected, (k.key === 'ArrowLeft' ? -1 : 1) * jStep);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (frame !== 'joint' || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const n = activeArm().dof;
      p.onSelect((p.selected + (e.key === 'ArrowUp' ? n - 1 : 1)) % n);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (e.repeat || keyHold.current || p.busy) return;
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const k = { key: e.key, timer: 0, holding: false };
      k.timer = window.setTimeout(() => {
        k.holding = true;
        p.onJointJog(p.selected, dir);
      }, HOLD_MS);
      keyHold.current = k;
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (keyHold.current?.key === e.key) endKey(true);
  };

  return (
    <div
      className={css.pendant}
      tabIndex={-1}
      onKeyDown={(e) => {
        p.onActivity?.();
        onKeyDown(e);
      }}
      onKeyUp={onKeyUp}
      onBlur={() => endKey(false)}
      onPointerEnter={() => {
        hovered.current = true;
        p.onHold?.(true);
      }}
      onPointerLeave={() => {
        hovered.current = false;
        p.onHold?.(false);
      }}
      onPointerMove={p.onActivity}
      onPointerDown={p.onActivity}
    >
      <div className={css.pendantBar}>
        <span className={css.frameSeg} role="group" aria-label="좌표계">
          <button type="button" aria-pressed={frame === 'base'} onClick={() => chooseFrame('base')} title="베이스 좌표: 손끝 위치(X·Y·Z)를 곧게 옮기거나, 손끝은 그대로 두고 도구 방향(RX·RY·RZ)을 돌려요">
            <b>좌표</b>
            <small>위치 · 회전</small>
          </button>
          <button type="button" aria-pressed={frame === 'joint'} onClick={() => chooseFrame('joint')} title="모터(관절)를 하나씩 돌려요">
            <b>관절</b>
            <small>J1 ~ J6</small>
          </button>
        </span>
        <span className={css.stepSeg} role="group" aria-label="한 번 누를 때 움직이는 양">
          <em className={css.stepLabel}>한 번에</em>
          {steps.map((v) => (
            <button key={v} type="button" aria-pressed={step === v} onClick={() => (frame === 'joint' ? setJStep(v) : setTStep(v))}>
              {v}
            </button>
          ))}
          <i>{frame === 'joint' ? '°' : 'mm'}</i>
        </span>
        <button type="button" className={css.helpBtn} aria-pressed={help} onClick={() => setHelp((h) => !h)} title={help ? '도움말 닫기' : '쓰는 방법 보기'} aria-label="쓰는 방법">
          ?
        </button>
      </div>

      {help && (
        <p className={css.jogHint}>
          <b>◀ ▶</b> 짧게 누르면 한 칸({frame === 'joint' ? `${jStep}°` : `${tStep}mm`}), 누르고 있으면 계속 움직여요.
          {frame === 'joint' ? (
            <>
              {' '}
              3D 의 관절 점 ①~⑥ 이나 이 목록에서 관절을 고르고, 양옆 버튼·막대·3D 의 링으로 돌려요. 키보드 <b>↑↓</b> 고르기 · <b>←→</b> 돌리기.
            </>
          ) : null}
        </p>
      )}
      <label className={css.speedRow}>
        <span>움직이는 속도</span>
        <input
          type="range"
          min={10}
          max={100}
          step={10}
          value={p.speed}
          style={{ '--fill': `${((p.speed - 10) / 90) * 100}%` } as React.CSSProperties}
          onChange={(e) => p.onSpeed(Number(e.target.value))}
          aria-label="속도 조절"
        />
        <output>{p.speed}%</output>
      </label>

      {frame === 'joint' ? (
        <div className={css.jpRows} role="group" aria-label="관절 조그 (↑↓ 관절 고르기, ←→ 돌리기)">
          {angles.slice(0, activeArm().dof).map((a, i) => {
            const shown = drag?.i === i ? drag.deg : a;
            const lo = jointMin()[i];
            const hi = jointMax()[i];
            const pos = ((shown - lo) / (hi - lo)) * 100;
            const zero = ((0 - lo) / (hi - lo)) * 100;
            const near = Math.min(shown - lo, hi - shown) < 10;
            const value = (
              <output htmlFor={`j${i + 1}`} className={css.jpValue} data-near={near || undefined}>
                {shown >= 0 ? '+' : '−'}
                {Math.abs(shown).toFixed(1)}
                <i>°</i>
              </output>
            );
            const track = (
              <span className={css.jpTrack}>
                <span className={css.jpFill} style={{ left: `${Math.min(pos, zero)}%`, width: `${Math.abs(pos - zero)}%` }} />
                <span className={css.jpZero} style={{ left: `${zero}%` }} />
                <span className={css.jpKnob} style={{ left: `${pos}%` }} />
              </span>
            );
            if (i !== p.selected) {
              return (
                <button key={i} type="button" className={css.jpRow} onClick={() => p.onSelect(i)} title={`${jointLabels()[i].name} (J${i + 1}) 고르기. 3D 의 관절 점 ${i + 1} 을 눌러도 돼요`}>
                  <span className={css.jpGlyph}>
                    <JointGlyph joint={i} active={false} />
                  </span>
                  <span className={css.jpName}>
                    <b>{jointLabels()[i].name}</b>
                    <em>J{i + 1}</em>
                  </span>
                  <span className={css.jpMini} data-near={near || undefined}>
                    {track}
                  </span>
                  {value}
                </button>
              );
            }
            return (
              <div key={i} className={`${css.jpRow} ${css.jpSel}`}>
                <div className={css.jpHead}>
                  <span className={css.jpGlyph}>
                    <JointGlyph joint={i} />
                  </span>
                  <span className={css.jpName}>
                    <b>{jointLabels()[i].name}</b>
                    <em>J{i + 1}</em>
                    <small>{jointLabels()[i].what}</small>
                  </span>
                  {value}
                </div>
                <div className={css.jpCtl}>
                  <JogKey turn dir={-1} label={`J${i + 1} −${jStep}°`} disabled={p.busy} onStep={() => p.onJointStep(i, -jStep)} onStart={() => p.onJointJog(i, -1)} onStop={p.onJogStop} />
                  <div className={css.jpBar} data-near={near || undefined}>
                    {track}
                    <input
                      id={`j${i + 1}`}
                      type="range"
                      min={lo}
                      max={hi}
                      step={1}
                      value={Math.round(shown)}
                      disabled={p.busy}
                      aria-label={`J${i + 1} 각도`}
                      onChange={(e) => {
                        const deg = Number(e.target.value);
                        setDrag({ i, deg });
                        p.onJointPreview(i, deg);
                      }}
                      onPointerUp={commit}
                      onKeyUp={commit}
                      onBlur={commit}
                    />
                    <span className={css.jpLimits}>
                      <i>{lo}°</i>
                      <i>0</i>
                      <i>{hi}°</i>
                    </span>
                  </div>
                  <JogKey turn dir={1} label={`J${i + 1} +${jStep}°`} disabled={p.busy} onStep={() => p.onJointStep(i, jStep)} onStart={() => p.onJointJog(i, 1)} onStop={p.onJogStop} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={css.axisRows}>
          {(
            [
              ['위치', 'mm', AXES.map((a) => ({ ...a, step: tStep, hint: `− ${a.minus} · + ${a.plus}` }))],
              ['회전', '°', TURNS.map((a) => ({ ...a, step: TURN_STEPS[TIP_STEPS.indexOf(tStep)] ?? 5, hint: `${a.axis.slice(1).toUpperCase()}축 둘레로, 손끝은 그 자리` }))],
            ] as const
          ).map(([group, unit, rows]) => (
            <div key={group} className={css.axisGroup} role="group" aria-label={group}>
              <p>
                {group}
                <small>
                  한 번에 {rows[0].step}
                  {unit}
                </small>
              </p>
              {rows.map(({ axis, color, step, hint }) => {
                const name = axis.toUpperCase();
                const v = tip?.[axis as 'x'];
                const turn = group === '회전';
                return (
                  <div key={axis} className={css.axisRow} data-on={sel === axis || undefined} title={`${name}: ${hint}`}>
                    <JogKey turn={turn} dir={-1} label={`${name}− ${hint}`} disabled={p.busy} onStep={() => p.onTipStep(axis, -step)} onStart={() => p.onTipJog(axis, -1)} onStop={p.onJogStop} />
                    <button type="button" className={css.axisValue} onClick={() => setSel(axis)} aria-pressed={sel === axis} title={`${name} 고르기 (아래 손잡이로 끌어 움직이기)`}>
                      <span className={css.axisName} style={{ color }}>
                        {name}
                      </span>
                      <b>{v === undefined ? '—' : v.toFixed(1)}</b>
                    </button>
                    <JogKey turn={turn} dir={1} label={`${name}+ ${hint}`} disabled={p.busy} onStep={() => p.onTipStep(axis, step)} onStart={() => p.onTipJog(axis, 1)} onStop={p.onJogStop} />
                  </div>
                );
              })}
            </div>
          ))}
          <div className={css.axisSlide}>
            <span style={{ color: [...AXES, ...TURNS].find((a) => a.axis === sel)?.color }}>{sel.toUpperCase()}</span>
            <SlideJog label={`${sel.toUpperCase()} 밀어서 움직이기`} disabled={p.busy} onStart={(dir, scale) => p.onTipJog(sel, dir, scale)} onScale={p.onJogScale} onStop={p.onJogStop} />
          </div>
        </div>
      )}

    </div>
  );
}
