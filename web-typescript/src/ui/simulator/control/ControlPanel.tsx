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
  /** The tool pointing straight down again, its tip kept. */
  onToolDown?(): void;
  /** Key held: move continuously (joint or tool tip along a base axis) until onJogStop. */
  onJointJog(i: number, dir: -1 | 1): void;
  onTipJog(axis: Axis, dir: -1 | 1, scale?: number): void;
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
/** Base axes as seen from in front of the robot: X away from the base (앞), Y to its left, Z up. */
const AXES: { axis: Axis; minus: string; plus: string; color: string; arrows: [keyof typeof ARROW, keyof typeof ARROW] }[] = [
  { axis: 'x', minus: '뒤', plus: '앞', color: '#ff6b62', arrows: ['down', 'up'] },
  { axis: 'y', minus: '오른쪽', plus: '왼쪽', color: '#4cd18a', arrows: ['right', 'left'] },
  { axis: 'z', minus: '아래', plus: '위', color: '#7aa2ff', arrows: ['down', 'up'] },
];
/** Turning the tool about a base axis, the tip kept in place: what that looks like with the tool pointing down. */
const TURNS: { axis: Axis; color: string; what: string }[] = [
  { axis: 'rx', color: '#ff6b62', what: '좌우 기울기' },
  { axis: 'ry', color: '#4cd18a', what: '앞뒤 기울기' },
  { axis: 'rz', color: '#7aa2ff', what: '돌리기' },
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

/** The arrow drawn on a position key: where the tool tip goes on screen-like terms. */
const ARROW: Record<string, string> = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
};

/**
 * A jog key: tap = one step, hold = keep moving. Big, with what it does written on it
 * (the direction word, or the joint's turn and step), not only an arrow.
 */
function JogKey({
  dir,
  label,
  disabled,
  onStep,
  onStart,
  onStop,
  turn,
  arrow,
  word,
  sub,
}: {
  dir: -1 | 1;
  label: string;
  disabled: boolean;
  onStep(): void;
  onStart(): void;
  onStop(): void;
  turn?: boolean;
  arrow?: keyof typeof ARROW;
  word?: string;
  sub?: string;
}) {
  const hold = usePressJog(onStep, onStart, onStop);
  return (
    <button type="button" className={css.bigKey} data-dir={dir} disabled={disabled} aria-label={label} title={`${label} · 짧게 누르면 한 칸, 누르고 있으면 계속`} {...hold}>
      {turn ? (
        <TurnIcon dir={dir} size={22} />
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d={ARROW[arrow ?? (dir < 0 ? 'left' : 'right')]} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {word && <b>{word}</b>}
      {sub && <small>{sub}</small>}
    </button>
  );
}

export default function ControlPanel(p: Props) {
  const angles = useLive(p.live, (v) => v.angles);
  const { tipOf } = p;
  const tip = useMemo(() => tipOf(angles), [tipOf, angles]);
  const [frame, setFrame] = useState<Frame>('base');
  const [jStep, setJStep] = useState(5);
  const [tStep, setTStep] = useState(10);
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
          <button type="button" aria-pressed={frame === 'base'} onClick={() => chooseFrame('base')} title="좌표: 손끝 위치 X · Y · Z, 회전 RX · RY · RZ">
            <b>좌표</b>
          </button>
          <button type="button" aria-pressed={frame === 'joint'} onClick={() => chooseFrame('joint')} title="관절: J1 ~ J6 하나씩">
            <b>관절</b>
          </button>
        </span>
        <span className={css.stepSeg} role="group" aria-label="한 번 누를 때 움직이는 양">
          <em className={css.stepLabel}>단위</em>
          {steps.map((v) => (
            <button key={v} type="button" aria-pressed={step === v} onClick={() => (frame === 'joint' ? setJStep(v) : setTStep(v))}>
              {v}
            </button>
          ))}
          <i>{frame === 'joint' ? '°' : 'mm'}</i>
        </span>
      </div>

      <label className={css.speedRow}>
        <span>속도</span>
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
        <div className={css.jogArea} role="group" aria-label="관절 조그 (↑↓ 관절 고르기, ←→ 돌리기)">
          {angles.slice(0, activeArm().dof).map((a, i) => {
            const shown = drag?.i === i ? drag.deg : a;
            const lo = jointMin()[i];
            const hi = jointMax()[i];
            const pos = ((shown - lo) / (hi - lo)) * 100;
            const zero = ((0 - lo) / (hi - lo)) * 100;
            const near = Math.min(shown - lo, hi - shown) < 10;
            const sel = i === p.selected;
            return (
              <div
                key={i}
                className={css.jogRow}
                data-sel={sel || undefined}
                onPointerDown={() => {
                  if (!sel) p.onSelect(i);
                }}
              >
                <JogKey turn dir={-1} label={`J${i + 1} −${jStep}°`} sub={`−${jStep}°`} disabled={p.busy} onStep={() => p.onJointStep(i, -jStep)} onStart={() => p.onJointJog(i, -1)} onStop={p.onJogStop} />
                <div className={css.jogMid} title={`${jointLabels()[i].name} (J${i + 1}). 3D 의 관절 점 ${i + 1} 을 눌러도 골라져요`}>
                  <span className={css.jogHead}>
                    <span className={css.jpGlyph}>
                      <JointGlyph joint={i} active={sel} />
                    </span>
                    <b>{jointLabels()[i].name}</b>
                    <em>J{i + 1}</em>
                    <output htmlFor={`j${i + 1}`} className={css.jogValue} data-near={near || undefined}>
                      {shown >= 0 ? '+' : '−'}
                      {Math.abs(shown).toFixed(1)}
                      <i>°</i>
                    </output>
                  </span>
                  <div className={css.jpBar} data-near={near || undefined}>
                    <span className={css.jpTrack}>
                      <span className={css.jpFill} style={{ left: `${Math.min(pos, zero)}%`, width: `${Math.abs(pos - zero)}%` }} />
                      <span className={css.jpZero} style={{ left: `${zero}%` }} />
                      <span className={css.jpKnob} style={{ left: `${pos}%` }} />
                    </span>
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
                      <i>{hi}°</i>
                    </span>
                  </div>
                </div>
                <JogKey turn dir={1} label={`J${i + 1} +${jStep}°`} sub={`+${jStep}°`} disabled={p.busy} onStep={() => p.onJointStep(i, jStep)} onStart={() => p.onJointJog(i, 1)} onStop={p.onJogStop} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={css.jogArea}>
          <p className={css.jogGroup}>
            손끝 위치 <small>mm · 로봇이 바라보는 쪽이 앞</small>
          </p>
          {AXES.map(({ axis, minus, plus, color, arrows }) => {
            const name = axis.toUpperCase();
            const v = tip?.[axis];
            return (
              <div key={axis} className={css.jogRow}>
                <JogKey dir={-1} arrow={arrows[0]} word={minus} sub={`${name}−`} label={`${name}− ${minus}으로 ${tStep}mm`} disabled={p.busy} onStep={() => p.onTipStep(axis, -tStep)} onStart={() => p.onTipJog(axis, -1)} onStop={p.onJogStop} />
                <span className={css.jogMid} data-axis>
                  <b style={{ color }}>{name}</b>
                  <output>{v === undefined ? '—' : v.toFixed(1)}</output>
                </span>
                <JogKey dir={1} arrow={arrows[1]} word={plus} sub={`${name}+`} label={`${name}+ ${plus}으로 ${tStep}mm`} disabled={p.busy} onStep={() => p.onTipStep(axis, tStep)} onStart={() => p.onTipJog(axis, 1)} onStop={p.onJogStop} />
              </div>
            );
          })}
          <p className={css.jogGroup}>
            손 방향 <small>° · 손끝은 그 자리에서</small>
            {p.onToolDown && (
              <button type="button" className={css.toolDown} disabled={p.busy} onClick={p.onToolDown} title="손(도구)을 똑바로 아래로 향하게 돌려요. 손끝 위치는 그대로예요">
                손 아래로
              </button>
            )}
          </p>
          {TURNS.map(({ axis, color, what }) => {
            const name = axis.toUpperCase();
            const v = tip?.[axis];
            const step = TURN_STEPS[TIP_STEPS.indexOf(tStep)] ?? 5;
            return (
              <div key={axis} className={css.jogRow} data-turn>
                <JogKey turn dir={-1} sub={`${name}−`} label={`${name}− ${what} ${step}°`} disabled={p.busy} onStep={() => p.onTipStep(axis, -step)} onStart={() => p.onTipJog(axis, -1)} onStop={p.onJogStop} />
                <span className={css.jogMid} data-axis title={`${name}: 베이스의 ${name.slice(1)}축 둘레로 손을 돌려요. 손끝 위치는 그대로예요`}>
                  <span className={css.jogName}>
                    <b style={{ color }}>{name}</b>
                    <small>{what}</small>
                  </span>
                  <output>{v === undefined ? '—' : v.toFixed(1)}</output>
                </span>
                <JogKey turn dir={1} sub={`${name}+`} label={`${name}+ ${what} ${step}°`} disabled={p.busy} onStep={() => p.onTipStep(axis, step)} onStart={() => p.onTipJog(axis, 1)} onStop={p.onJogStop} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
