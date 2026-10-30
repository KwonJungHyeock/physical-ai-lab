'use client';

/**
 * 공정 짜기, practice-led (engine: plan.ts), for someone doing it the first time: each step is one
 * screen with its icon, one line of what to do, one to three things to do (the one to do now lit),
 * and one silver key for what comes next; numbers, rules and the rows are folded away until asked.
 *   1 준비하기 — the zero (일자 자세 = every joint 0°) checked two ways, linked to 영점 맞추기 when it
 *     is off; the start pose; the movement rules every practice follows (folded).
 *   2 실습 고르기 — the chosen practice large, with a picture; the others in a short list.
 *   3 위치 가르치기 — only the places (jog there, [지금 위치로 저장]) and a few values; the rows are
 *     made from them. 따라하기 runs the ready places, 직접 짜기 opens the row editor (folded).
 *   4 실행 · 확인 — the line running, the last run, the rows (folded), the process file.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { PointMm } from '@/engine/robot/tool';
import {
  BODY_MM,
  DEFAULT_RULES,
  LEVEL_NAME,
  MODE_NAME,
  PLAN_PRACTICES,
  SHAPE_NAME,
  SPEEDS,
  TRAVEL_CHOICES,
  fitSpots,
  freshPlan,
  practiceOf,
  teachOf,
  type Built,
  type FieldDef,
  type Plan,
  type PlanKind,
  type PlanLevel,
  type PlanMode,
  type Rules,
  type ShapeKind,
  type Spot,
} from '@/engine/simulator/plan';
import type { Process } from '@/engine/simulator/process';

import { useLive, type Live } from '../liveStore';
import css from './flow.module.css';

export type FlowStep = 1 | 2 | 3 | 4;
export type StartChoice = 'home' | 'zero' | 'saved' | 'here';

export interface FlowState {
  step: FlowStep;
  kind: PlanKind;
  /** The student's own places and values, per practice (switching practices keeps them). */
  plans: Partial<Record<PlanKind, Plan>>;
  rules: Rules;
  start: StartChoice;
  /** The start pose chosen in 기준 잡기 (joint angles). */
  startJoints: number[];
  /** Name of the saved pose when `start` is 'saved'. */
  startName: string;
  mode: PlanMode;
  /** 영점 확인: the marks lined up (robot), and how far the tip missed the + mark, mm. */
  marksOk: boolean | null;
  missMm: number | null;
}

export const REF_MARK: Spot = { x: 200, y: 0, z: 0 };
/** The tip stops this far above the + mark when checking the zero (a bare flange still clears the desk), mm. */
export const REF_ABOVE_MM = 50;
/** A miss up to this is fine; more points to 영점 맞추기, mm. */
export const MISS_OK_MM = 2;

export function initialFlow(home: readonly number[]): FlowState {
  return { step: 1, kind: 'move1', plans: {}, rules: { ...DEFAULT_RULES }, start: 'home', startJoints: home.slice(), startName: '', mode: 'change', marksOk: null, missMm: null };
}

/** The plan in use: 따라하기 runs the practice's own places; otherwise the student's. */
export function activePlan(f: FlowState): Plan {
  if (f.mode === 'follow') return freshPlan(f.kind);
  return f.plans[f.kind] ?? freshPlan(f.kind);
}

interface Props {
  flow: FlowState;
  onFlow(f: FlowState): void;
  built: Built;
  process: Process;
  live: Live;
  robotMode: boolean;
  busy: boolean;
  /** The arm's joint angles now. */
  pose(): number[];
  tipOf(angles: readonly number[]): PointMm | null;
  armHome: readonly number[];
  armZero: readonly number[];
  poses: Record<string, number[]>;
  /** "마지막 영점 …" (robot mode). */
  calibrated: string;
  /** The fitted tool's kind and name. */
  toolKind: string;
  toolName: string;
  /** 이 실습으로 시작: the practice's tool (simulator) and its blocks. */
  onStart(kind: PlanKind): void;
  onGoJoints(joints: number[], what: string): void;
  onGoTip(at: Spot, what: string): void;
  onZero(): void;
  /** Put the practice's blocks back where they start (simulator). */
  onResetDesk(): void;
  /** The line running now (1-based), -1 none. */
  runningLine: number;
  /** The last simulated run of this process: passed, how long, blocks placed / to place. */
  lastRun: { ok: boolean; seconds: number; placed?: number; total?: number } | null;
  onSaveFile(): void;
  onOpenFile(): void;
  runBar: ReactNode;
  /** The row editor (직접 짜기). */
  editor: ReactNode;
  /** Open the 도구 screen (the practice needs another tool). */
  onTools?(): void;
}

const STEPS: { name: string; short: string; icon: string }[] = [
  { name: '준비하기', short: '준비', icon: 'prep' },
  { name: '실습 고르기', short: '실습', icon: 'grid' },
  { name: '위치 가르치기', short: '위치', icon: 'pin' },
  { name: '실행 · 확인', short: '실행', icon: 'play' },
];

const S = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICON: Record<string, ReactNode> = {
  axis: S('M5 19V5M5 19h14M5 19l9-9'),
  up: S('M12 20V6M7 11l5-5 5 5M4 4h16'),
  down: S('M12 4v14M7 13l5 5 5-5M4 21h16'),
  far: S('M4 17c4-10 12-10 16 0M17 13l3 4-4 1'),
  ban: S('M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M6.5 6.5l11 11'),
  move1: S('M3 14h5v5H3zM5.5 11V6h13v8M16 11.5l2.5 2.5 2.5-2.5'),
  stack: S('M8 15h8v5H8zM8 9.5h8v5H8zM8 4h8v5H8z'),
  grid: S('M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z'),
  swap: S('M7 4L4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8'),
  points: S('M5 17l6-10 8 7M5 17h.01M11 7h.01M19 14h.01'),
  shape: S('M5 5h9v9H5zM15.5 11a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9'),
  loop: S('M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5'),
  fill: S('M4 5h16M4 5l16 5M20 10L4 15M4 15h16M20 15L4 20'),
  square: S('M5 5h14v14H5z'),
  circle: S('M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15'),
  triangle: S('M12 4.5l8 14H4z'),
  star: S('M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z'),
  prep: S('M6 21h12M8.5 21v-4h7v4M12 17V4M9.5 6.5L12 4l2.5 2.5'),
  pin: S('M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 8.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4'),
  play: S('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M10 8.5l5.5 3.5-5.5 3.5z'),
  target: S('M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14M12 2v4M12 18v4M2 12h4M18 12h4'),
  home: S('M4 11l8-7 8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5'),
  sliders: S('M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M11 16v4'),
  hash: S('M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16'),
  list: S('M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5'),
  check: S('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 12.5l3 3 5-6'),
  clock: S('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3.5 2'),
  cube: S('M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5'),
  file: S('M6 3h8l4 4v14H6zM14 3v4h4'),
  tool: S('M12 3v6M8 9h8v3H8zM9 12v5l2 3M15 12v5l-2 3'),
  tick: S('M6 12.5l4 4 8-9'),
};

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const xyz = (p: Spot | PointMm) => `X ${r0(p.x)} · Y ${r0(p.y)} · Z ${r0(p.z)}`;
const speedName = (v: number) => SPEEDS.find(([, s]) => s === v)?.[0] ?? `속도 ${v}`;
const LEVEL_DOTS: Record<PlanLevel, number> = { basic: 1, apply: 2, challenge: 3 };

/** The level as one, two or three dots (기초 · 응용 · 도전), not a colour. */
function Level({ level }: { level: PlanLevel }) {
  return (
    <span className={css.dots} title={LEVEL_NAME[level]} aria-label={LEVEL_NAME[level]}>
      {[0, 1, 2].map((k) => (
        <i key={k} data-on={k < LEVEL_DOTS[level] || undefined} />
      ))}
    </span>
  );
}

/** A folded part (rules, numbers, rows): its icon, one line, opened when asked. */
function Fold({ icon, title, open, children }: { icon: string; title: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className={css.fold} open={open}>
      <summary>
        {ICON[icon]}
        <span>{title}</span>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className={css.foldBody}>{children}</div>
    </details>
  );
}

/** The step's head: its icon, "n / 4", its name and the one line of what to do now. */
function Head({ step, now }: { step: FlowStep; now: { tone: string; text: string } }) {
  const s = STEPS[step - 1];
  return (
    <div className={css.head}>
      <span className={css.headIcon}>{ICON[s.icon]}</span>
      <div>
        <em>{step} / 4</em>
        <h3>{s.name}</h3>
      </div>
      <p data-tone={now.tone || undefined}>{now.text}</p>
    </div>
  );
}

/** One thing to do: an icon (✓ when done), its name and one line, its key at the end. */
function Item({ icon, done, bad, now, title, line, children }: { icon: string; done?: boolean; bad?: boolean; now?: boolean; title: string; line: ReactNode; children?: ReactNode }) {
  return (
    <div className={css.item} data-now={now || undefined} data-done={done || undefined} data-bad={bad || undefined}>
      <span className={css.itemIcon}>{done ? ICON.check : ICON[icon]}</span>
      <span>
        <b>{title}</b>
        <small>{line}</small>
      </span>
      <span className={css.itemEnd}>{children}</span>
    </div>
  );
}

export default function ProcessFlow(p: Props) {
  const f = p.flow;
  const set = (patch: Partial<FlowState>) => p.onFlow({ ...f, ...patch });
  const plan = activePlan(f);
  const teach = teachOf(plan);
  const setPlan = (next: Plan) => set({ plans: { ...f.plans, [f.kind]: fitSpots(next) } });

  const steps = (
    <nav className={css.flowbar} aria-label="공정 짜기 단계">
      {STEPS.map((s, k) => {
        const n = (k + 1) as FlowStep;
        return (
          <button key={s.name} type="button" aria-current={f.step === n ? 'step' : undefined} data-done={f.step > n || undefined} disabled={p.busy} onClick={() => set({ step: n })} title={s.name}>
            <i>{f.step > n ? ICON.tick : ICON[s.icon]}</i>
            <span>{s.short}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={css.wrap}>
      {steps}
      {f.step === 1 && <BaseStep {...p} />}
      {f.step === 2 && <ChooseStep {...p} />}
      {f.step === 3 && <TeachStep {...p} plan={plan} teach={teach} setPlan={setPlan} />}
      {f.step === 4 && <ResultStep {...p} />}
    </div>
  );
}

/* --- 1 준비하기 -------------------------------------------------------------- */

function BaseStep(p: Props) {
  const f = p.flow;
  const set = (patch: Partial<FlowState>) => p.onFlow({ ...f, ...patch });
  const [pickStart, setPickStart] = useState(false);
  const angles = useLive(p.live, (v) => v.angles);
  const atZero = angles.length === p.armZero.length && angles.every((v, i) => Math.abs(v - p.armZero[i]) < 0.6);
  const tip = p.tipOf(angles);
  const overMark = !!tip && Math.hypot(tip.x - REF_MARK.x, tip.y - REF_MARK.y) < 3 && Math.abs(tip.z - REF_ABOVE_MM) < 3;
  // In the simulator the zero is always right: the miss is what the 3D tip shows.
  const miss = p.robotMode ? f.missMm : overMark && tip ? Math.hypot(tip.x - REF_MARK.x, tip.y - REF_MARK.y) : f.missMm;
  const marks = p.robotMode ? f.marksOk : atZero ? true : f.marksOk;
  // Simulator: what the 3D arm showed once stays checked (the robot asks the student instead).
  const seenMiss = !p.robotMode && overMark && tip ? Math.round(Math.hypot(tip.x - REF_MARK.x, tip.y - REF_MARK.y) * 10) / 10 : null;
  useEffect(() => {
    if (p.robotMode) return;
    if ((atZero && f.marksOk !== true) || (seenMiss !== null && seenMiss !== f.missMm)) p.onFlow({ ...f, marksOk: atZero ? true : f.marksOk, missMm: seenMiss ?? f.missMm });
  });
  const zeroBad = marks === false || (miss !== null && miss > MISS_OK_MM);
  const zeroOk = !zeroBad && marks === true && miss !== null;
  const savedNames = Object.keys(p.poses);
  const startTip = p.tipOf(f.startJoints);
  const choose = (start: StartChoice, name = f.startName) => {
    const j = start === 'home' ? p.armHome.slice() : start === 'zero' ? p.armZero.slice() : start === 'saved' ? (p.poses[name] ?? f.startJoints).slice() : p.pose();
    set({ start, startJoints: j.map((v) => Math.round(v * 10) / 10), startName: name });
  };
  const rules = f.rules;
  const setRules = (r: Partial<Rules>) => set({ rules: { ...rules, ...r } });
  const rulesDefault = (Object.keys(DEFAULT_RULES) as (keyof Rules)[]).every((k) => rules[k] === DEFAULT_RULES[k]);
  const startName = f.start === 'home' ? '기본 자세 (관찰 자세)' : f.start === 'zero' ? '일자 자세 (모두 0°)' : f.start === 'saved' ? `저장한 자세 ${f.startName}` : '지금 위치';

  const now = zeroBad
    ? { tone: 'bad', text: '영점이 어긋났어요. [영점 맞추기]로 맞춘 뒤 다시 확인하세요.' }
    : !zeroOk
      ? { tone: '', text: '로봇이 바르게 서 있는지 두 가지로 확인해요.' }
      : { tone: 'ok', text: '영점이 맞아요. 시작 자세를 확인하고 [다음]을 누르세요.' };

  return (
    <>
      <div className={css.body}>
        <Head step={1} now={now} />

        <Item
          icon="prep"
          done={marks === true}
          bad={marks === false}
          now={marks !== true}
          title="일자로 펴기"
          line={p.robotMode ? '관절 6개가 0°. 관절마다 표시 선 두 개가 이어지면 맞아요' : '관절 6개가 모두 0°'}
        >
          {p.robotMode && atZero ? (
            <>
              <button type="button" className={css.btn} data-main={marks !== true || undefined} onClick={() => set({ marksOk: true })}>
                맞아요
              </button>
              <button type="button" className={css.btn} onClick={() => set({ marksOk: false })}>
                어긋났어요
              </button>
            </>
          ) : (
            <button type="button" className={css.btn} data-main={!atZero || undefined} disabled={p.busy} onClick={() => p.onGoJoints(p.armZero.slice(), '일자 자세')}>
              {atZero ? '다시' : '펴기'}
            </button>
          )}
        </Item>

        <Item
          icon="target"
          done={miss !== null && miss <= MISS_OK_MM}
          bad={miss !== null && miss > MISS_OK_MM}
          now={marks === true && miss === null}
          title="기준점 확인"
          line={`+ 표시 위로 가서 빗나간 거리 보기 (${MISS_OK_MM} mm 이하면 맞아요)`}
        >
          {p.robotMode ? (
            <label className={css.mm} title="자로 잰 빗나간 거리">
              <input type="number" min={0} max={50} step={0.5} value={f.missMm ?? ''} placeholder="?" aria-label="빗나간 거리 (mm)" onChange={(e) => set({ missMm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
              mm
            </label>
          ) : (
            miss !== null && <span className={css.mm}>{r1(miss)} mm</span>
          )}
          <button type="button" className={css.btn} data-main={(marks === true && miss === null) || undefined} disabled={p.busy} onClick={() => p.onGoTip({ ...REF_MARK, z: REF_ABOVE_MM }, '기준점 위')}>
            가 보기
          </button>
        </Item>
        {(zeroBad || p.robotMode) && (
          <div className={css.stat}>
            {zeroBad ? <b data-tone="bad">● 영점 어긋남</b> : zeroOk ? <b data-tone="ok">● 영점 맞음</b> : <b>○ 확인 전</b>}
            <span>{p.robotMode ? p.calibrated : ''}</span>
            <button type="button" className={css.link} data-tone="red" disabled={!p.robotMode || p.busy} title={p.robotMode ? '영점 맞추기를 열어요' : '로봇을 연결하면 영점을 맞춰요'} onClick={p.onZero}>
              영점 맞추기 ›
            </button>
          </div>
        )}

        <Item icon="home" done={zeroOk} now={zeroOk} title="시작 자세" line={`${startName} · 공정을 시작하고 돌아올 자세`}>
          <button type="button" className={css.btn} aria-expanded={pickStart} onClick={() => setPickStart(!pickStart)}>
            바꾸기 {pickStart ? '⌃' : '⌄'}
          </button>
        </Item>
        {pickStart && (
          <div className={css.tiles} role="group" aria-label="시작 위치">
            <button type="button" aria-pressed={f.start === 'home'} onClick={() => choose('home')}>
              기본 자세<small>관찰 자세</small>
            </button>
            <button type="button" aria-pressed={f.start === 'zero'} onClick={() => choose('zero')}>
              일자 자세<small>모두 0°</small>
            </button>
            <button type="button" aria-pressed={f.start === 'saved'} disabled={!savedNames.length} title={savedNames.length ? '[자세]에서 저장한 자세' : '[자세]에서 자세를 저장하면 고를 수 있어요'}>
              저장한 자세<small>{f.start === 'saved' && f.startName ? `${f.startName} ▾` : savedNames.length ? `${savedNames.length}개 ▾` : '없음'}</small>
              {savedNames.length > 0 && (
                <select aria-label="저장한 자세" value={f.start === 'saved' ? f.startName : ''} onChange={(e) => e.target.value && choose('saved', e.target.value)}>
                  <option value="">고르기…</option>
                  {savedNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </button>
            <button type="button" aria-pressed={f.start === 'here'} onClick={() => choose('here')} title="조그로 맞춘 지금 자세">
              지금 위치<small>조그로 맞춘 곳</small>
            </button>
          </div>
        )}

        <Fold icon="sliders" title={<>움직임 규칙 · {rulesDefault ? '기본값' : '바꿈'}</>}>
          <div className={css.rules}>
            <div className={css.rule}>
              {ICON.axis}
              <b>위치 기준</b>
              <span>로봇 바닥 가운데 = (0, 0, 0) · X 앞 · Y 왼쪽 · Z 위, 단위 mm</span>
            </div>
            <div className={css.rule}>
              {ICON.up}
              <b>옮길 때 높이</b>
              <span className={css.pick}>
                {TRAVEL_CHOICES.map((z) => (
                  <button key={z} type="button" aria-pressed={rules.travelZ === z} onClick={() => setRules({ travelZ: z })}>
                    {z} mm
                  </button>
                ))}
              </span>
            </div>
            <div className={css.rule}>
              {ICON.down}
              <b>내려가고 올라올 때</b>
              <span className={css.pick}>
                {SPEEDS.map(([n, v]) => (
                  <button key={v} type="button" aria-pressed={rules.slow === v} onClick={() => setRules({ slow: v })}>
                    {n}
                  </button>
                ))}
                <em>곧게 (MOVE L)</em>
              </span>
            </div>
            <div className={css.rule}>
              {ICON.far}
              <b>멀리 갈 때</b>
              <span className={css.pick}>
                {SPEEDS.map(([n, v]) => (
                  <button key={v} type="button" aria-pressed={rules.fast === v} onClick={() => setRules({ fast: v })}>
                    {n}
                  </button>
                ))}
                <em>관절로 (MOVE J)</em>
              </span>
            </div>
            <div className={css.rule}>
              {ICON.ban}
              <b>못 가는 곳</b>
              <span>도구를 아래로 향해 닿지 않는 곳 · 책상 아래 · 몸통 {BODY_MM} mm 안 → 저장해도 실행 안 돼요</span>
            </div>
          </div>
        </Fold>

        <Fold icon="hash" title="시작 자세의 관절 · 좌표 숫자">
          <div className={css.jv}>
            {f.startJoints.map((v, i) => (
              <span key={i}>
                <small>J{i + 1}</small>
                {r1(v)}°
              </span>
            ))}
          </div>
          <div className={css.xv}>
            <span>
              <small>손끝 X</small>
              {startTip ? r1(startTip.x) : '–'} mm
            </span>
            <span>
              <small>Y</small>
              {startTip ? r1(startTip.y) : '–'} mm
            </span>
            <span>
              <small>Z (책상 위)</small>
              {startTip ? r1(startTip.z) : '–'} mm
            </span>
            <button type="button" className={css.btn} disabled={p.busy} onClick={() => p.onGoJoints(f.startJoints.slice(), '시작 위치')}>
              이 위치로 보내기
            </button>
          </div>
        </Fold>
      </div>
      <div className={css.nav}>
        <span />
        <button type="button" data-main onClick={() => set({ step: 2 })}>
          다음: 실습 고르기 ›
        </button>
      </div>
    </>
  );
}

/* --- 2 실습 고르기 ----------------------------------------------------------- */

/** The chosen practice as a picture: a block carried from A to B, or a path drawn with the pen. */
function PracticePicture({ group }: { group: 'carry' | 'path' }) {
  return (
    <svg className={css.pic} viewBox="0 0 220 88" aria-hidden="true">
      <rect x="4" y="4" width="212" height="80" rx="8" className={css.picPlate} />
      {group === 'carry' ? (
        <>
          <rect x="32" y="46" width="22" height="22" rx="3" className={css.picBlock} />
          <rect x="164" y="46" width="22" height="22" rx="3" className={css.picGhost} />
          <path d="M43 40C68 4 150 4 175 40" className={css.picLine} />
          <path d="M168 36l7 5 2-8" className={css.picLine} />
          <text x="43" y="80">
            A
          </text>
          <text x="175" y="80">
            B
          </text>
        </>
      ) : (
        <>
          <path d="M30 64L70 26L110 56L150 22L190 50" className={css.picLine} strokeDasharray="5 5" />
          {[
            [30, 64],
            [70, 26],
            [110, 56],
            [150, 22],
            [190, 50],
          ].map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r="4.5" className={css.picBlock} />
          ))}
        </>
      )}
    </svg>
  );
}

function ChooseStep(p: Props) {
  const f = p.flow;
  const set = (patch: Partial<FlowState>) => p.onFlow({ ...f, ...patch });
  const prac = practiceOf(f.kind);
  const needGrip = prac.tool === 'grip';
  const toolOk = needGrip ? p.toolKind === 'grip' : p.toolKind === 'pen';
  const others = PLAN_PRACTICES.filter((x) => x.kind !== f.kind);
  const row = (x: (typeof PLAN_PRACTICES)[number]) => (
    <button key={x.kind} type="button" className={css.prow} onClick={() => set({ kind: x.kind })} title={x.meta}>
      {ICON[x.kind]}
      <span>{x.name}</span>
      <Level level={x.level} />
    </button>
  );
  const start = () => {
    p.onStart(f.kind);
    set({ step: 3, plans: { ...f.plans, [f.kind]: f.plans[f.kind] ?? freshPlan(f.kind) } });
  };
  const now = { tone: '', text: f.kind === 'move1' ? '처음이면 이 실습부터 해 보세요. 다른 실습은 아래에서 골라요.' : '고른 실습이에요. [이 실습으로 시작]을 누르세요.' };
  return (
    <>
      <div className={css.body}>
        <Head step={2} now={now} />
        <div className={css.pcard}>
          <PracticePicture group={prac.group} />
          <div className={css.pcardHead}>
            <span className={css.itemIcon}>{ICON[prac.kind]}</span>
            <span>
              <b>{prac.name}</b>
              <small>
                <Level level={prac.level} /> {LEVEL_NAME[prac.level]} · {prac.minutes}분 · {needGrip ? '그리퍼' : '펜 홀더'}
              </small>
            </span>
          </div>
          <p>{prac.learn[0]}</p>
          {!toolOk && <p className={css.pneed}>{p.robotMode ? `로봇에 ${needGrip ? '그리퍼' : '펜 홀더'}를 달고 [도구]에서 바꿔 주세요.` : `시작하면 ${needGrip ? '그리퍼' : '펜 홀더'}로 바꿔요.`}</p>}
        </div>
        <div className={css.plist}>{others.slice(0, 4).map(row)}</div>
        {others.length > 4 && (
          <Fold icon="list" title={`실습 ${others.length - 4}개 더 보기`}>
            <div className={css.plist}>{others.slice(4).map(row)}</div>
          </Fold>
        )}
      </div>
      <div className={css.nav}>
        <button type="button" onClick={() => set({ step: 1 })} aria-label="준비하기로">
          ‹
        </button>
        <button type="button" data-main disabled={p.busy} onClick={start}>
          이 실습으로 시작 ›
        </button>
      </div>
    </>
  );
}

/* --- 3 위치 가르치기 --------------------------------------------------------- */

function TeachStep(p: Props & { plan: Plan; teach: ReturnType<typeof teachOf>; setPlan(next: Plan): void }) {
  const f = p.flow;
  const { plan, teach, setPlan } = p;
  const prac = practiceOf(f.kind);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState<number | null>(null);
  const locked = f.mode === 'follow';
  const first = teach.findIndex((_, k) => !plan.spots[k]);
  const [picked, setPicked] = useState<number>(-1);
  const current = picked >= 0 && picked < teach.length ? picked : first;
  const tipNow = () => p.tipOf(p.pose());
  const save = (k: number) => {
    const t = tipNow();
    if (!t) return;
    const spots = plan.spots.slice();
    const at = { x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, z: Math.round(t.z * 10) / 10 };
    spots[k] = teach[k].zOnly ? { x: 0, y: 0, z: at.z } : at;
    setPlan({ ...plan, spots });
    setPicked(-1);
  };
  const typeSpot = (k: number, axis: 'x' | 'y' | 'z', v: number) => {
    const spots = plan.spots.slice();
    const base = spots[k] ?? { x: 200, y: 0, z: 15 };
    spots[k] = { ...base, [axis]: v };
    setPlan({ ...plan, spots });
  };
  const blocking = p.built.problems;
  const toolOk = prac.tool === 'grip' ? p.toolKind === 'grip' : p.toolKind === 'pen';
  const now = !toolOk
    ? { tone: 'bad', text: `이 실습은 ${prac.tool === 'grip' ? '그리퍼' : '펜 홀더'}가 필요해요. [도구]에서 바꿔 주세요.` }
    : locked
      ? { tone: '', text: '완성된 공정이에요. ▶ 시뮬레이션을 눌러 어떻게 움직이는지 보세요. 그다음 [바꿔 보기]로 위치를 직접 가르쳐요.' }
      : first >= 0
        ? { tone: '', text: `조그로 손끝을 ${teach[first].tag === '펜' ? '종이에 닿을 때까지 내린' : `${teach[first].label} 에 데려간`} 뒤 [지금 위치로 저장]을 누르세요.` }
        : blocking.length
          ? { tone: 'bad', text: `${blocking[0].msg} ${blocking[0].fix ?? ''}` }
          : { tone: 'ok', text: '준비됐어요. ▶ 시뮬레이션으로 확인하세요. 노란 값을 바꾸면 동작이 바로 다시 만들어져요.' };

  const saved = plan.spots.filter(Boolean).length;
  return (
    <>
      <div className={css.body}>
        <div className={css.practice}>
          {ICON[prac.kind]}
          <b>{prac.name}</b>
          <Level level={prac.level} />
          {prac.group === 'carry' && !p.robotMode && (
            <button type="button" className={css.link} disabled={p.busy} onClick={p.onResetDesk} title="이 실습의 블록을 처음 자리에 다시 놓아요">
              블록 다시 놓기
            </button>
          )}
        </div>
        <Head step={3} now={!toolOk ? { tone: '', text: '이 실습에 맞는 도구를 먼저 달아요.' } : now} />
        {!toolOk && (
          <div className={css.need}>
            {ICON.tool}
            <span>
              이 실습은 <b>{prac.tool === 'grip' ? '그리퍼' : '펜 홀더'}</b>가 필요해요
            </span>
            {p.onTools && (
              <button type="button" className={css.btn} data-main onClick={p.onTools}>
                도구 달기
              </button>
            )}
          </div>
        )}

        {!locked && teach.length > 1 && (
          <div className={css.track} aria-label={`가르칠 위치 ${teach.length}곳 중 ${saved}곳 저장`}>
            {teach.map((t, k) => (
              <span key={k} data-done={plan.spots[k] ? true : undefined} data-on={k === current || undefined}>
                <i>{plan.spots[k] ? ICON.tick : t.tag}</i>
              </span>
            ))}
          </div>
        )}

        <div className={css.pts}>
          {teach.map((t, k) => {
            const s = plan.spots[k];
            const on = !locked && k === current;
            return (
              <div key={k}>
                <div className={css.pt} data-on={on || undefined} data-done={s ? true : undefined} onClick={() => !locked && setPicked(k)}>
                  <i>{s ? ICON.tick : t.tag}</i>
                  <span>
                    <b>
                      {t.tag} {t.label}
                    </b>
                    <small>{s ? (t.zOnly ? `Z ${r1(s.z)} (종이 높이)` : xyz(s)) : on ? '[제어]로 팔을 옮긴 뒤 저장하세요' : '아직 저장 안 함'}</small>
                  </span>
                  <span className={css.ptEnd}>
                    {s && !t.zOnly && (
                      <button type="button" className={css.btn} disabled={p.busy} onClick={(e) => (e.stopPropagation(), p.onGoTip(s, t.label))} title="손끝을 이 위치로 보내요">
                        가 보기
                      </button>
                    )}
                    {!locked && (
                      <button type="button" className={css.btn} data-main={on || undefined} disabled={p.busy} onClick={(e) => (e.stopPropagation(), save(k))}>
                        {s ? '다시 저장' : '지금 위치 저장'}
                      </button>
                    )}
                  </span>
                </div>
                {on && (
                  <div className={css.how}>
                    다른 방법
                    {typing === k ? (
                      <span className={css.nums}>
                        {(t.zOnly ? (['z'] as const) : (['x', 'y', 'z'] as const)).map((a) => (
                          <label key={a}>
                            {a.toUpperCase()}
                            <input type="number" step={1} value={s ? r0(s[a]) : ''} aria-label={`${t.label} ${a.toUpperCase()} (mm)`} onChange={(e) => typeSpot(k, a, Number(e.target.value))} />
                          </label>
                        ))}
                      </span>
                    ) : (
                      <button type="button" className={css.btn} onClick={() => setTyping(k)}>
                        숫자로 넣기
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {(prac.fields.length > 0 || prac.kind === 'shape') && (
          <section className={css.sec}>
            <h4>
              바꿀 값 <small>{locked ? '따라하기에서는 그대로예요' : '− + 로 바꾸면 동작이 바로 다시 만들어져요'}</small>
            </h4>
            {prac.kind === 'shape' && (
              <div className={css.tiles} role="group" aria-label="모양">
                {(['square', 'circle', 'triangle', 'star'] as ShapeKind[]).map((k) => (
                  <button key={k} type="button" aria-pressed={plan.shape === k} disabled={locked} onClick={() => setPlan({ ...plan, shape: k })}>
                    {ICON[k]}
                    {SHAPE_NAME[k]}
                  </button>
                ))}
              </div>
            )}
            <div className={css.fields}>
              {prac.fields.map((d) => (
                <Field key={d.key} d={d} value={plan[d.key] as number} locked={locked} onChange={(v) => setPlan({ ...plan, [d.key]: v })} />
              ))}
            </div>
          </section>
        )}

        {f.mode === 'free' ? (
          <section className={css.sec}>
            <h4>
              동작 줄 <small>직접 고친 줄은 위치를 다시 저장해도 바뀌지 않아요</small>
            </h4>
            <div className={css.free}>{p.editor}</div>
          </section>
        ) : (
          <Fold
            icon="list"
            open={blocking.length > 0}
            title={
              <>
                만들어진 동작 <b>{p.process.rows.length}줄</b> · {blocking.length ? `고칠 곳 ${blocking.length}` : '범위 안 ✓'}
              </>
            }
          >
            {p.built.cycle.length > 0 && (
              <div className={css.chips}>
                {p.built.cycle.map((c, k) => (
                  <span key={k}>
                    {c.label} <em data-k={c.kind}>{c.kind === 'grip' ? '손' : c.kind}</em>
                  </span>
                ))}
                {p.built.times > 1 && <b>× {p.built.times}</b>}
              </div>
            )}
            <Checks {...p} />
            <button type="button" className={css.more} onClick={() => setOpen(!open)} aria-expanded={open}>
              <span>
                MOVE 줄로 보기 <small>· 직접 짜기에서 고칠 수 있어요</small>
              </span>
              <span>{open ? '접기 ⌃' : '펼치기 ⌄'}</span>
            </button>
            {open && <RowList rows={p.process.rows} running={p.runningLine} />}
          </Fold>
        )}

        <Fold icon="sliders" title={<>하는 방법 · {MODE_NAME[f.mode]}</>}>
          <div className={css.modes} role="group" aria-label="하는 방법">
            {(['follow', 'change', 'free'] as PlanMode[]).map((m) => (
              <button key={m} type="button" aria-pressed={f.mode === m} disabled={p.busy} onClick={() => p.onFlow({ ...f, mode: m })} title={m === 'follow' ? '완성된 공정을 그대로 실행해요' : m === 'change' ? '위치를 가르치고 값만 바꿔요' : '만들어진 동작 줄을 직접 고쳐요'}>
                {MODE_NAME[m]}
              </button>
            ))}
          </div>
          <small className={css.modeNote}>따라하기: 완성된 공정을 그대로 · 바꿔 보기: 위치를 가르쳐요 · 직접 짜기: 동작 줄을 직접 고쳐요</small>
        </Fold>
      </div>
      {p.runBar}
    </>
  );
}

function Field({ d, value, locked, onChange }: { d: FieldDef; value: number; locked: boolean; onChange(v: number): void }) {
  const clamp = (v: number) => Math.min(d.max, Math.max(d.min, v));
  return (
    <div className={css.fd}>
      <small>{d.label}</small>
      <div>
        <output data-fixed={locked || undefined}>
          {value} {d.unit}
        </output>
        {!locked && (
          <span className={css.step}>
            <button type="button" aria-label={`${d.label} 줄이기`} disabled={value <= d.min} onClick={() => onChange(clamp(value - d.step))}>
              −
            </button>
            <button type="button" aria-label={`${d.label} 늘리기`} disabled={value >= d.max} onClick={() => onChange(clamp(value + d.step))}>
              +
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function Checks(p: Props) {
  const b = p.built;
  const prac = practiceOf(p.flow.kind);
  if (b.problems.length)
    return (
      <div className={css.checks}>
        {b.problems.slice(0, 3).map((q, k) => (
          <span key={k} data-tone="bad">
            ✕ {q.msg}
            {q.fix && <small>{q.fix}</small>}
          </span>
        ))}
      </div>
    );
  return (
    <div className={css.checks}>
      <span data-tone="ok">✓ 모든 위치가 작업 범위 안이에요</span>
      {prac.group === 'carry' ? (
        <span data-tone="ok">
          ✓ 옮길 땐 {p.flow.rules.travelZ} mm 높이로 · 내려갈 땐 곧게 ({speedName(p.flow.rules.slow)})
        </span>
      ) : (
        <span data-tone="ok">✓ 그릴 땐 곧게 (MOVE L){p.flow.kind === 'shape' && activePlan(p.flow).shape === 'circle' ? ' · 원은 점 36개를 이어서 (Smooth)' : ''}</span>
      )}
      {b.notes.map((n) => (
        <span key={n} data-tone="note">
          ● {n}
        </span>
      ))}
    </div>
  );
}

function RowList({ rows, running }: { rows: Process['rows']; running: number }) {
  return (
    <ol className={css.rows}>
      {rows.map((r, i) => (
        <li key={i} data-run={running === i + 1 || undefined}>
          <i>{i + 1}</i>
          <span>{r.note ?? (r.kind === 'move' ? `MOVE ${r.mode}` : r.kind === 'grip' ? (r.open ? '그리퍼 열기' : '그리퍼 닫기') : `대기 ${r.sec}초`)}</span>
          <em data-k={r.kind === 'move' ? r.mode : undefined}>{r.kind === 'move' ? `MOVE ${r.mode}` : r.kind === 'grip' ? '그리퍼' : '대기'}</em>
        </li>
      ))}
    </ol>
  );
}

/* --- 4 실행 · 확인 ------------------------------------------------------------ */

function ResultStep(p: Props) {
  const r = p.lastRun;
  const prac = practiceOf(p.flow.kind);
  const rows = p.process.rows;
  const run = p.runningLine > 0 ? rows[p.runningLine - 1] : null;
  const now = r
    ? r.ok
      ? { tone: 'ok', text: '통과했어요. [로봇에서 실행]으로 실물에서 해 보거나, 공정 파일로 저장하세요.' }
      : { tone: 'bad', text: '멈췄어요. 알림의 이유를 보고 [위치 가르치기]에서 고쳐 주세요.' }
    : { tone: '', text: '먼저 ▶ 시뮬레이션으로 확인하고, 되면 로봇으로 해요.' };
  // The ring: how far through the rows the run is (all the way after a run).
  const frac = run ? p.runningLine / Math.max(1, rows.length) : r ? 1 : 0;
  return (
    <>
      <div className={css.body}>
        <Head step={4} now={now} />
        <div className={css.running}>
          <span className={css.ring}>
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16" />
              <circle cx="20" cy="20" r="16" strokeDasharray={`${(frac * 100.5).toFixed(1)} 101`} />
            </svg>
            <b>{run ? p.runningLine : rows.length}</b>
          </span>
          <span>
            <small>{run ? `지금 실행 중 · ${p.runningLine} / ${rows.length}` : `동작 ${rows.length}줄`}</small>
            <b>{run ? (run.note ?? (run.kind === 'move' ? `MOVE ${run.mode}` : run.kind === 'grip' ? '그리퍼' : '대기')) : r ? (r.ok ? '끝까지 실행했어요' : '중간에 멈췄어요') : '아직 실행 전'}</b>
          </span>
          {run && <em>{run.kind === 'move' ? `MOVE ${run.mode}` : run.kind === 'grip' ? '그리퍼' : '대기'}</em>}
        </div>
        <div className={css.result}>
          <div>
            {ICON.check}
            <small>결과</small>
            <b data-tone={r ? (r.ok ? 'ok' : 'bad') : undefined}>{r ? (r.ok ? '통과' : '멈춤') : '–'}</b>
          </div>
          <div>
            {ICON.clock}
            <small>걸린 시간</small>
            <b>{r ? `${r1(r.seconds)} 초` : '–'}</b>
          </div>
          <div>
            {ICON.cube}
            <small>{prac.group === 'carry' ? '옮긴 블록' : '동작 줄'}</small>
            <b>{prac.group === 'carry' ? (r?.total ? `${r.placed ?? 0} / ${r.total}` : '–') : `${rows.length} 줄`}</b>
          </div>
        </div>
        <Fold icon="list" title={<>동작 줄 전체 <b>{rows.length}줄</b> · 실행 중인 줄이 밝아져요</>}>
          <RowList rows={rows} running={p.runningLine} />
        </Fold>
        <div className={css.fileRow}>
          {ICON.file}
          <button type="button" className={css.link} disabled={p.busy || !rows.length} onClick={p.onSaveFile}>
            공정 파일 저장 (.pal)
          </button>
          <button type="button" className={css.link} disabled={p.busy} onClick={p.onOpenFile}>
            파일 열기
          </button>
        </div>
      </div>
      {p.runBar}
    </>
  );
}
