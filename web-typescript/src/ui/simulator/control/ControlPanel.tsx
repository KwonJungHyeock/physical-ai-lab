'use client';

/**
 * The jog panel, made for a first-time user. Two ways to move the arm, chosen at the top:
 * - 관절 (the default, what robotics starts with): one row per motor, named by what it does
 *   (베이스 · 어깨 · 팔꿈치 · 손목 꺾기 · 손목 돌리기 · 손끝 돌리기) with its J number, a − and a + key,
 *   the angle and where it sits between its limits. [관절 익히기] walks through the six joints once.
 * - 좌표: the tool tip moved in straight lines with a cross pad (앞 · 뒤 · 왼쪽 · 오른쪽) and a 위 · 아래
 *   column, then the hand's direction in three slim rows and [손 아래로].
 * Every key: tap = one step of the size chosen under 「한 번에」, hold = keep moving at the set speed.
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
/** What the panel opens on: joints, one motor at a time (where a beginner starts). */
export const FIRST_FRAME: Frame = 'joint';
const JOINT_STEPS = [0.5, 1, 5, 10];
const TIP_STEPS = [1, 5, 10, 20];
/** The rotation step that goes with each position step (same chip). */
const TURN_STEPS = [1, 2, 5, 10];
/** Turning the tool about a base axis, the tip kept in place: what that looks like with the tool pointing down. */
const TURNS: { axis: Axis; color: string; what: string }[] = [
  { axis: 'rx', color: '#ff7a72', what: '좌우 기울기' },
  { axis: 'ry', color: '#5ad895', what: '앞뒤 기울기' },
  { axis: 'rz', color: '#86abff', what: '손 돌리기' },
];
/** The tip readout's axis colours: the 3D view's X (red) · Y (green) · Z (blue). */
const AXIS_COLOR = { x: '#ff7a72', y: '#5ad895', z: '#86abff' } as const;

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
}: {
  dir: -1 | 1;
  label: string;
  disabled: boolean;
  onStep(): void;
  onStart(): void;
  onStop(): void;
  arrow?: keyof typeof ARROW;
  word?: string;
  kind?: 'pad' | 'lift' | 'slim';
}) {
  const hold = usePressJog(onStep, onStart, onStop);
  return (
    <button type="button" className={css.key} data-kind={kind} disabled={disabled} aria-label={label} title={`${label} · 짧게 누르면 한 칸, 누르고 있으면 계속`} {...hold}>
      {arrow ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d={ARROW[arrow]} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <TurnIcon dir={dir} size={kind === 'slim' ? 18 : 20} />
      )}
      {word && <b>{word}</b>}
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
  const chooseFrame = (f: Frame) => {
    setFrame(f);
    p.onFrame?.(f);
  };

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

  const tipKey = (axis: 'x' | 'y' | 'z', dir: -1 | 1, word: string, arrow: keyof typeof ARROW, kind: 'pad' | 'lift') => (
    <JogKey
      kind={kind}
      dir={dir}
      arrow={arrow}
      word={word}
      label={`${toward(word)} ${tStep}mm (${axis.toUpperCase()}${dir > 0 ? '+' : '−'})`}
      disabled={p.busy}
      onStep={() => p.onTipStep(axis, dir * tStep)}
      onStart={() => p.onTipJog(axis, dir)}
      onStop={p.onJogStop}
    />
  );

  return (
    <div
      className={css.jog}
      data-jog
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
      <div className={css.modes} role="group" aria-label="움직이는 방법">
        <button type="button" aria-pressed={frame === 'joint'} onClick={() => chooseFrame('joint')} title="관절: 모터(J1 ~ J6)를 하나씩 돌려요">
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
          <b>좌표</b>
          <small>손끝을 곧게 옮기기</small>
        </button>
      </div>

      <div className={css.opts}>
        <span className={css.optName}>한 번에</span>
        <span className={css.chips} role="group" aria-label="한 번 누를 때 움직이는 양">
          {steps.map((v) => (
            <button key={v} type="button" aria-pressed={step === v} onClick={() => (frame === 'joint' ? setJStep(v) : setTStep(v))}>
              {v}
              <i>{unit}</i>
            </button>
          ))}
        </span>
        <span className={css.optName}>속도</span>
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
                  <div className={css.mid} title={`${names[i].name} (J${i + 1}) · ${lo}° ~ ${hi}°. 3D 의 관절 점 ${i + 1} 을 눌러도 골라져요`}>
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
          {!lesson && (
            <div className={css.tip}>
              <span>
                <b>짧게 누르면 {jStep}°</b>, 누르고 있으면 계속 돌아요.
              </span>
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
          <div className={css.readout} aria-label="손끝 위치 (mm)">
            {(['x', 'y', 'z'] as const).map((k) => (
              <span key={k}>
                <b style={{ color: AXIS_COLOR[k] }}>{k.toUpperCase()}</b>
                <output>{tip ? tip[k].toFixed(1) : '—'}</output>
              </span>
            ))}
            <small>mm</small>
          </div>
          <p className={css.cap}>
            손끝 옮기기 <small>로봇이 바라보는 쪽이 앞</small>
          </p>
          <div className={css.padWrap}>
            <div className={css.pad}>
              <span />
              {tipKey('x', 1, '앞', 'up', 'pad')}
              <span />
              {tipKey('y', 1, '왼쪽', 'left', 'pad')}
              <span className={css.padHub} aria-hidden="true">
                로봇에서
                <br />본 방향
              </span>
              {tipKey('y', -1, '오른쪽', 'right', 'pad')}
              <span />
              {tipKey('x', -1, '뒤', 'down', 'pad')}
              <span />
            </div>
            <div className={css.lift}>
              {tipKey('z', 1, '위', 'up', 'lift')}
              <span className={css.liftName}>높이</span>
              {tipKey('z', -1, '아래', 'down', 'lift')}
            </div>
          </div>
          <p className={css.cap}>
            손 방향 <small>손끝은 그 자리에서 {turnStep}°씩</small>
            {p.onToolDown && (
              <button type="button" className={css.toolDown} disabled={p.busy} onClick={p.onToolDown} title="손(도구)을 똑바로 아래로 향하게 돌려요. 손끝 위치는 그대로예요">
                손 아래로
              </button>
            )}
          </p>
          <div className={css.turns}>
            {TURNS.map(({ axis, color, what }) => {
              const name = axis.toUpperCase();
              const v = tip?.[axis];
              return (
                <div key={axis} className={css.turn}>
                  <JogKey kind="slim" dir={-1} label={`${what} (${name}) −${turnStep}°`} disabled={p.busy} onStep={() => p.onTipStep(axis, -turnStep)} onStart={() => p.onTipJog(axis, -1)} onStop={p.onJogStop} />
                  <span className={css.turnMid} title={`${name}: 베이스의 ${name.slice(1)}축 둘레로 손을 돌려요. 손끝 위치는 그대로예요`}>
                    <b>{what}</b>
                    <em style={{ color }}>{name}</em>
                    <output>{v === undefined ? '—' : `${v.toFixed(1)}°`}</output>
                  </span>
                  <JogKey kind="slim" dir={1} label={`${what} (${name}) +${turnStep}°`} disabled={p.busy} onStep={() => p.onTipStep(axis, turnStep)} onStart={() => p.onTipJog(axis, 1)} onStop={p.onJogStop} />
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
