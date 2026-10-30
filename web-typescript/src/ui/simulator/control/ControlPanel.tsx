'use client';

/**
 * The jog panel, made for a first-time user. Two ways to move the arm, chosen at the top:
 * - 관절 (the default, what robotics starts with): one row per motor, named by what it does
 *   (베이스 · 어깨 · 팔꿈치 · 손목 꺾기 · 손목 돌리기 · 손끝 돌리기) with its J number, a − and a + key,
 *   the angle and where it sits between its limits. [관절 익히기] walks through the six joints once.
 * - 좌표: the tool tip moved in straight lines with a round pad (앞 · 뒤 · 왼쪽 · 오른쪽 around a top view
 *   of the robot) and a 위 · 아래 rocker with the tip's height beside it, then the hand's direction in three
 *   slim rows and [손 아래로]. The keyboard works the pad while it is shown: ↑ ↓ ← → = 앞 · 뒤 · 왼쪽 · 오른쪽,
 *   Shift = 위, Space = 아래.
 * Every key: tap = one step of the size chosen under 「한 번에」, hold = keep moving at the set speed.
 * A key whose last move could not be made (out of reach) stays red until the next move.
 *
 * The parent decides what a step means: in the simulator the arm moves on screen; on the robot the
 * same keys move the real arm (after the same collision check).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { jointMax, jointMin } from '@/engine/robot/limits';
import { activeArm } from '@/engine/robot/arms';

import { TurnIcon, jointLabels } from './jointInfo';
import { useLive, type Live } from '../liveStore';
import css from './jog.module.css';

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
  /** The flange (mm): what get_coords reports, when a tool sticks out past it. */
  flange?: { x: number; y: number; z: number };
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
  /** Back to the ready pose (the joint lesson's last step offers it). */
  onHome?(): void;
  /** Key held: move continuously (joint or tool tip along a base axis) until onJogStop. */
  onJointJog(i: number, dir: -1 | 1): void;
  onTipJog(axis: Axis, dir: -1 | 1, scale?: number): void;
  onJogStop(): void;
  /** The tool move that could not be made last (its key shows red), cleared by the next move. */
  blocked?: { axis: Axis; dir: -1 | 1 } | null;
  /** The joint the jog keys work on (0..5). */
  selected: number;
  onSelect(i: number): void;
}

export type Frame = 'joint' | 'base';
/** What the panel opens on: joints, one motor at a time (where a beginner starts). */
export const FIRST_FRAME: Frame = 'joint';
const JOINT_STEPS = [0.5, 1, 5, 10];
const TIP_STEPS = [1, 5, 10, 20];
/** The rotation step that goes with each position step (same chip). */
const TURN_STEPS = [1, 2, 5, 10];
/** Turning the tool about a base axis, the tip kept in place: what that looks like with the tool pointing down. */
const TURNS: { axis: Axis; color: string; what: string; icon: string }[] = [
  // The tool (a stick) and how it turns: swung left-right (arc over it), front-back (arc beside it), twisted.
  { axis: 'rx', color: '#ff7a72', what: '좌우 기울기', icon: 'M12 21V10M12 10l-1.5 2M5.5 8.5a8 8 0 0 1 13 0M18.5 8.5l.6-3M18.5 8.5l-3-.4' },
  { axis: 'ry', color: '#5ad895', what: '앞뒤 기울기', icon: 'M12 21V6M16 3.5a8 8 0 0 1 0 11M16 14.5l-2.7.2M16 14.5l.6-2.6' },
  { axis: 'rz', color: '#86abff', what: '손 돌리기', icon: 'M12 21V4M5 9.5c0 1.7 3.1 3 7 3s7-1.3 7-3M19 9.5c0-1.7-3.1-3-7-3M19 9.5l1.6-2.4M19 9.5l-2.8-.6' },
];
/** The round pad's four keys, clockwise from the top, and the keyboard key for each (Shift / Space: 위 / 아래). */
const PAD: { side: 'up' | 'right' | 'down' | 'left'; axis: 'x' | 'y'; dir: -1 | 1; word: string; key: string }[] = [
  { side: 'up', axis: 'x', dir: 1, word: '앞', key: '↑' },
  { side: 'right', axis: 'y', dir: -1, word: '오른쪽', key: '→' },
  { side: 'down', axis: 'x', dir: -1, word: '뒤', key: '↓' },
  { side: 'left', axis: 'y', dir: 1, word: '왼쪽', key: '←' },
];
const PAD_KEYS: Record<string, { axis: 'x' | 'y' | 'z'; dir: -1 | 1 }> = {
  ArrowUp: { axis: 'x', dir: 1 },
  ArrowDown: { axis: 'x', dir: -1 },
  ArrowLeft: { axis: 'y', dir: 1 },
  ArrowRight: { axis: 'y', dir: -1 },
  Shift: { axis: 'z', dir: 1 },
  ' ': { axis: 'z', dir: -1 },
};
/** Where the edge of each pad key is drawn on the bezel (viewBox 0..100): a quarter of the ring, centred on its side. */
const ARC: Record<(typeof PAD)[number]['side'], string> = {
  up: 'M16.5 16.5A47.4 47.4 0 0 1 83.5 16.5',
  right: 'M83.5 16.5A47.4 47.4 0 0 1 83.5 83.5',
  down: 'M83.5 83.5A47.4 47.4 0 0 1 16.5 83.5',
  left: 'M16.5 83.5A47.4 47.4 0 0 1 16.5 16.5',
};
/** The bezel's scale: a tick every 5°, longer every 30° and at the four directions. */
const TICKS = Array.from({ length: 72 }, (_, k) => {
  const a = (k * 5 * Math.PI) / 180;
  const r2 = k % 18 === 0 ? 47.6 : k % 6 === 0 ? 48.4 : 49;
  const at = (r: number) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)].map((v) => v.toFixed(2));
  const [x1, y1] = at(49.8);
  const [x2, y2] = at(r2);
  return { d: `M${x1} ${y1}L${x2} ${y2}`, big: k % 6 === 0 };
});

/** The joint lesson: one joint at a time, what to look at while it turns (6-axis arms). */
const LESSON: { see: string }[] = [
  { see: '몸통 전체가 좌우로 돌아요. 로봇이 바라보는 쪽이 바뀌어요.' },
  { see: '팔 전체가 앞뒤로 숙여져요. 손끝이 멀어지거나 가까워져요.' },
  { see: '팔을 굽히고 펴요. 손끝 높이가 크게 바뀌어요.' },
  { see: '손목이 위아래로 꺾여요. 손이 바라보는 쪽만 바뀌어요.' },
  { see: '손목이 좌우로 돌아요.' },
  { see: '손끝(도구)이 제자리에서 돌아요. 물건 방향을 맞출 때 써요.' },
];
/** How far (°) a joint must turn for its lesson step to count. */
const LESSON_TURN = 15;

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

/** The arrow drawn on a position key. */
const ARROW = {
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
};

/** A jog key: tap = one step, hold = keep moving. Says what it does: a turn sign and its step, or an arrow and a direction word. */
function JogKey({
  dir,
  label,
  disabled,
  onStep,
  onStart,
  onStop,
  arrow,
  word,
  kind,
  sub,
  side,
  state,
}: {
  dir: -1 | 1;
  label: string;
  disabled: boolean;
  onStep(): void;
  onStart(): void;
  onStop(): void;
  arrow?: keyof typeof ARROW;
  word?: string;
  kind?: 'wedge' | 'lift' | 'slim';
  /** A small line under the word (the axis: X+ · Y−). */
  sub?: string;
  side?: string;
  /** Pressed from the keyboard, moving while held, or its last move could not be made. */
  state?: 'on' | 'hold' | 'blocked';
}) {
  const hold = usePressJog(onStep, onStart, onStop);
  const why = state === 'blocked' ? ' · 이쪽으로는 더 못 가요' : '';
  return (
    <button type="button" className={css.key} data-kind={kind} data-side={side} data-state={state} disabled={disabled} aria-label={label} title={`${label} · 짧게 누르면 한 칸, 누르고 있으면 계속${why}`} {...hold}>
      {arrow ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d={ARROW[arrow]} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <TurnIcon dir={dir} size={kind === 'slim' ? 18 : 20} />
      )}
      {word && <b>{word}</b>}
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** 「…로」 after a word ending in a vowel (위로 · 뒤로), 「…으로」 after a consonant (앞으로 · 왼쪽으로). */
const toward = (word: string) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${c >= 0 && c < 11172 && c % 28 !== 0 ? '으로' : '로'}`;
};

const signed = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;

export default function ControlPanel(p: Props) {
  const angles = useLive(p.live, (v) => v.angles);
  const { tipOf } = p;
  const tip = useMemo(() => tipOf(angles), [tipOf, angles]);
  const [frame, setFrame] = useState<Frame>(FIRST_FRAME);
  const [jStep, setJStep] = useState(5);
  const [tStep, setTStep] = useState(10);
  const [drag, setDrag] = useState<{ i: number; deg: number } | null>(null);
  const dof = activeArm().dof;
  const names = jointLabels();

  const commit = () => {
    if (drag) p.onJointCommit(drag.i, drag.deg);
    setDrag(null);
  };
  const steps = frame === 'joint' ? JOINT_STEPS : TIP_STEPS;
  const step = frame === 'joint' ? jStep : tStep;
  const unit = frame === 'joint' ? '°' : 'mm';
  const turnStep = TURN_STEPS[TIP_STEPS.indexOf(tStep)] ?? 5;
  const chooseFrame = (f: Frame) => setFrame(f);

  // The joint lesson: which step (dof = all done), and the joint's angle when the step began.
  const [lesson, setLesson] = useState<{ at: number; from: number } | null>(null);
  const lessonJoint = lesson && lesson.at < dof ? lesson.at : null;
  const turned = lessonJoint !== null && lesson ? Math.abs(angles[lessonJoint] - lesson.from) : 0;
  const { onSelect } = p;
  useEffect(() => {
    if (lessonJoint !== null) onSelect(lessonJoint);
  }, [lessonJoint, onSelect]);
  useEffect(() => {
    if (lesson && lessonJoint !== null && turned >= LESSON_TURN) {
      const t = window.setTimeout(() => {
        const next = lesson.at + 1;
        setLesson({ at: next, from: next < dof ? angles[next] : 0 });
      }, 700);
      return () => window.clearTimeout(t);
    }
  }, [lesson, lessonJoint, turned, dof, angles]);
  const startLesson = () => {
    chooseFrame('joint');
    setLesson({ at: 0, from: angles[0] });
  };

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
      p.onSelect((p.selected + (e.key === 'ArrowUp' ? dof - 1 : 1)) % dof);
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

  // The tool key being worked (from the keyboard: pressed or held; by pointer: held), for its look.
  const [active, setActive] = useState<{ axis: Axis; dir: -1 | 1; hold: boolean } | null>(null);
  const stateOf = (axis: Axis, dir: -1 | 1): 'on' | 'hold' | 'blocked' | undefined =>
    active?.axis === axis && active.dir === dir ? (active.hold ? 'hold' : 'on') : p.blocked?.axis === axis && p.blocked.dir === dir ? 'blocked' : undefined;

  // Keyboard on the round pad while 좌표 is shown (not while typing): ↑ ↓ ← → move the tip, Shift lifts it,
  // Space lowers it. Tap = one step, hold = keep moving. Caught before the focused key sees it, so Space
  // does not also press that key.
  const root = useRef<HTMLDivElement>(null);
  const keyFns = useRef({ step: p.onTipStep, jog: p.onTipJog, stop: p.onJogStop, tStep, busy: p.busy });
  useEffect(() => {
    keyFns.current = { step: p.onTipStep, jog: p.onTipJog, stop: p.onJogStop, tStep, busy: p.busy };
  });
  useEffect(() => {
    if (frame !== 'base') return;
    let held: { key: string; axis: Axis; dir: -1 | 1; timer: number; holding: boolean } | null = null;
    const end = (tap: boolean) => {
      const k = held;
      if (!k) return;
      held = null;
      window.clearTimeout(k.timer);
      setActive(null);
      if (k.holding) keyFns.current.stop();
      else if (tap) keyFns.current.step(k.axis, k.dir * keyFns.current.tStep);
    };
    const ours = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.isContentEditable);
      return !!PAD_KEYS[e.key] && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !!root.current?.getClientRects().length;
    };
    const down = (e: KeyboardEvent) => {
      if (!ours(e) || keyFns.current.busy) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || held) return;
      const { axis, dir } = PAD_KEYS[e.key];
      const k = { key: e.key, axis, dir, timer: 0, holding: false };
      k.timer = window.setTimeout(() => {
        k.holding = true;
        setActive({ axis, dir, hold: true });
        keyFns.current.jog(axis, dir);
      }, HOLD_MS);
      held = k;
      setActive({ axis, dir, hold: false });
    };
    const up = (e: KeyboardEvent) => {
      if (held?.key === e.key) {
        e.preventDefault();
        end(true);
      } else if (e.key === ' ' && ours(e)) e.preventDefault();
    };
    const lost = () => end(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', lost);
    return () => {
      end(false);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', lost);
    };
  }, [frame]);

  const tipKey = (axis: 'x' | 'y' | 'z', dir: -1 | 1, word: string, arrow: keyof typeof ARROW, kind: 'wedge' | 'lift', side?: string) => (
    <JogKey
      kind={kind}
      side={side}
      dir={dir}
      arrow={arrow}
      word={word}
      sub={`${axis.toUpperCase()}${dir > 0 ? '+' : '−'}`}
      state={stateOf(axis, dir)}
      label={`${toward(word)} ${tStep}mm (${axis.toUpperCase()}${dir > 0 ? '+' : '−'})`}
      disabled={p.busy}
      onStep={() => p.onTipStep(axis, dir * tStep)}
      onStart={() => {
        setActive({ axis, dir, hold: true });
        p.onTipJog(axis, dir);
      }}
      onStop={() => {
        setActive(null);
        p.onJogStop();
      }}
    />
  );
  const zTop = Math.round(activeArm().reachMm * 1.5);
  const zFill = tip ? Math.max(0, Math.min(1, tip.z / zTop)) : 0;

  return (
    <div
      ref={root}
      className={css.jog}
      data-jog
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => endKey(false)}
    >
      <div className={css.modes} role="group" aria-label="움직이는 방법">
        <button type="button" aria-pressed={frame === 'joint'} onClick={() => chooseFrame('joint')} title="관절: 모터(J1 ~ J6)를 하나씩 돌려요">
          <em aria-hidden="true">JOINT</em>
          <b>관절</b>
          <small>모터 하나씩 돌리기</small>
        </button>
        <button
          type="button"
          aria-pressed={frame === 'base'}
          onClick={() => {
            setLesson(null);
            chooseFrame('base');
          }}
          title="좌표: 손끝을 앞뒤 · 좌우 · 위아래로 곧게 옮겨요"
        >
          <em aria-hidden="true">COORD</em>
          <b>좌표</b>
          <small>손끝을 곧게 옮기기</small>
        </button>
      </div>

      <div className={css.opts}>
        <span className={css.optName} title="한 번 누를 때 움직이는 양">
          STEP
        </span>
        <span className={css.chips} role="group" aria-label="한 번 누를 때 움직이는 양">
          {steps.map((v) => (
            <button key={v} type="button" aria-pressed={step === v} onClick={() => (frame === 'joint' ? setJStep(v) : setTStep(v))} aria-label={`${v}${unit}`}>
              {v}
            </button>
          ))}
          <i className={css.chipUnit}>{unit}</i>
        </span>
        <span className={css.optName} title="움직이는 빠르기">
          SPEED
        </span>
        <label className={css.speed}>
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
      </div>

      {frame === 'joint' ? (
        <>
          {lesson && (
            <div className={css.lesson} role="status" aria-live="polite">
              {lessonJoint !== null ? (
                <>
                  <span className={css.lessonDots} aria-label={`${lessonJoint + 1} / ${dof}`}>
                    {Array.from({ length: dof }, (_, k) => (
                      <i key={k} data-on={k <= lessonJoint || undefined} />
                    ))}
                  </span>
                  <b>
                    {lessonJoint + 1}. <em>{names[lessonJoint].name}</em>를 − 나 + 로 돌려 보세요
                  </b>
                  <span>{LESSON[lessonJoint]?.see}</span>
                  <span className={css.lessonMeter} style={{ '--got': `${Math.min(1, turned / LESSON_TURN) * 100}%` } as React.CSSProperties}>
                    <i />
                    {turned >= LESSON_TURN ? '잘했어요!' : `${Math.round(turned)}° / ${LESSON_TURN}°`}
                  </span>
                </>
              ) : (
                <>
                  <b>관절 {dof}개를 모두 움직였어요</b>
                  <span>1 ~ 3번은 손을 「어디로」 보낼지, 4 ~ 6번은 손이 「어느 쪽을 볼지」 정해요.</span>
                  {p.onHome && (
                    <button type="button" className={css.lessonGo} disabled={p.busy} onClick={p.onHome}>
                      기본 자세로 돌아가기
                    </button>
                  )}
                </>
              )}
              <button type="button" className={css.lessonClose} onClick={() => setLesson(null)} aria-label="관절 익히기 닫기">
                ×
              </button>
            </div>
          )}
          <div className={css.rows} role="group" aria-label="관절 조그 (↑↓ 관절 고르기, ←→ 돌리기)" data-lesson={lessonJoint !== null || undefined}>
            {angles.slice(0, dof).map((a, i) => {
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
                  className={css.row}
                  data-sel={sel || undefined}
                  data-focus={lessonJoint === i || undefined}
                  onPointerDown={() => {
                    if (!sel) p.onSelect(i);
                  }}
                >
                  <JogKey dir={-1} word={`−${jStep}°`} label={`${names[i].name} (J${i + 1}) −${jStep}°`} disabled={p.busy} onStep={() => p.onJointStep(i, -jStep)} onStart={() => p.onJointJog(i, -1)} onStop={p.onJogStop} />
                  <div className={css.mid} title={`${names[i].name} (J${i + 1}) · ${lo}° ~ ${hi}°`}>
                    <span className={css.head}>
                      <b>{names[i].name}</b>
                      <em>J{i + 1}</em>
                      <output htmlFor={`j${i + 1}`} data-near={near || undefined}>
                        {signed(shown)}°
                      </output>
                    </span>
                    <span className={css.what}>{names[i].what}</span>
                    <span className={css.bar} data-near={near || undefined}>
                      <span className={css.track}>
                        <span className={css.fill} style={{ left: `${Math.min(pos, zero)}%`, width: `${Math.abs(pos - zero)}%` }} />
                        <span className={css.zero} style={{ left: `${zero}%` }} />
                        <span className={css.knob} style={{ left: `${pos}%` }} />
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
                    </span>
                  </div>
                  <JogKey dir={1} word={`+${jStep}°`} label={`${names[i].name} (J${i + 1}) +${jStep}°`} disabled={p.busy} onStep={() => p.onJointStep(i, jStep)} onStart={() => p.onJointJog(i, 1)} onStop={p.onJogStop} />
                </div>
              );
            })}
          </div>
          {!lesson && dof === LESSON.length && (
            <div className={css.tip}>
              {dof === LESSON.length && (
                <button type="button" className={css.learn} onClick={startLesson} disabled={p.busy} title="여섯 관절을 하나씩 돌려 보며 무엇을 움직이는지 알아봐요">
                  관절 익히기
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={css.padWrap}>
            <div className={css.pad} role="group" aria-label="손끝 옮기기 (키보드 ↑ ↓ ← → · Shift 위 · Space 아래)">
              {PAD.map((k) => tipKey(k.axis, k.dir, k.word, k.side, 'wedge', k.side))}
              <svg className={css.padRing} viewBox="0 0 100 100" aria-hidden="true">
                <path d="M17.4 17.4L82.6 82.6M82.6 17.4L17.4 82.6" />
                {TICKS.map((t, k) => (
                  <path key={k} d={t.d} data-tick={t.big ? 'big' : ''} />
                ))}
                {PAD.map((k) => (
                  <path key={k.side} d={ARC[k.side]} data-axis={k.axis} data-state={stateOf(k.axis, k.dir)} />
                ))}
              </svg>
              <span className={css.padHub} aria-hidden="true" title="위에서 본 로봇: 빨간 점(손끝) 쪽이 앞">
                <svg viewBox="-20 -28 40 44">
                  <circle r="11" fill="#1b2433" stroke="#3a4a66" strokeWidth="1.6" />
                  <rect x="-3.6" y="-21" width="7.2" height="19" rx="3.6" fill="#cfd8e6" />
                  <circle cy="-21.5" r="4.4" fill="#e5322d" />
                  <circle r="3.4" fill="#cfd8e6" />
                </svg>
              </span>
            </div>
            <div className={css.lift}>
              <div className={css.rocker}>
                {tipKey('z', 1, '위', 'up', 'lift')}
                <span className={css.liftName}>
                  높이
                  <output>{tip ? Math.round(tip.z) : '—'}</output>
                </span>
                {tipKey('z', -1, '아래', 'down', 'lift')}
              </div>
              <span className={css.gauge} title={`손끝 높이 ${tip ? tip.z.toFixed(1) : '—'} mm (아래 끝 = 0, 책상 높이)`} aria-hidden="true">
                <i style={{ height: `${zFill * 100}%` }} />
                <b style={{ bottom: `${zFill * 100}%` }} />
              </span>
            </div>
          </div>
          <p className={`${css.cap} ${css.turnCap}`}>
            손 방향 <small>{turnStep}°</small>
            {p.onToolDown && (
              <button type="button" className={css.toolDown} disabled={p.busy} onClick={p.onToolDown} title="손(도구)을 똑바로 아래로 향하게 돌려요. 손끝 위치는 그대로예요">
                손 아래로
              </button>
            )}
          </p>
          {/* 손 방향: three cards — the axis drawn, its name and value, ↺ ↻ under them (the words in the tooltip). */}
          <div className={css.turns}>
            {TURNS.map(({ axis, color, what, icon }) => {
              const name = axis.toUpperCase();
              const v = tip?.[axis];
              return (
                <div key={axis} className={css.turn}>
                  <span className={css.turnMid} title={`${what} (${name}): 베이스의 ${name.slice(1)}축 둘레로 손을 돌려요. 손끝 위치는 그대로예요`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={icon} />
                    </svg>
                    <em style={{ color }}>{name}</em>
                    <b className={css.turnWhat}>{what}</b>
                    <output>{v === undefined ? '—' : `${v.toFixed(1)}°`}</output>
                  </span>
                  <JogKey kind="slim" dir={-1} state={stateOf(axis, -1)} label={`${what} (${name}) −${turnStep}°`} disabled={p.busy} onStep={() => p.onTipStep(axis, -turnStep)} onStart={() => p.onTipJog(axis, -1)} onStop={p.onJogStop} />
                  <JogKey kind="slim" dir={1} state={stateOf(axis, 1)} label={`${what} (${name}) +${turnStep}°`} disabled={p.busy} onStep={() => p.onTipStep(axis, turnStep)} onStart={() => p.onTipJog(axis, 1)} onStop={p.onJogStop} />
                </div>
              );
            })}
          </div>
          <div className={css.tip}>
            <span>
              <b>크게 옮길 땐 [관절]</b>, 블록 위에 맞출 땐 [좌표].
            </span>
          </div>
        </>
      )}
    </div>
  );
}
