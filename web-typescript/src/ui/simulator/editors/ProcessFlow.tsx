'use client';

/**
 * 공정 짜기, practice-led (engine: plan.ts). Four steps:
 *   1 기준 잡기 — the zero (일자 자세 = every joint 0°) checked two ways, linked to 영점 맞추기 when it
 *     is off; the start pose loaded; the movement rules every practice follows.
 *   2 실습 고르기 — carry (옮기기) and path (궤적) practices by level.
 *   3 위치 가르치기 — only the places (jog there, [지금 위치로 저장]) and a few yellow values; the
 *     rows are made from them. 따라하기 runs the ready places, 직접 짜기 opens the row editor.
 *   4 실행 · 확인 — the last run, the rows, the process file.
 * Chosen things are raised tiles with a red bar or underline; values to change are yellow.
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
}

const STEPS = ['기준 잡기', '실습 고르기', '위치 가르치기', '실행 · 확인'];

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
};

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const xyz = (p: Spot | PointMm) => `X ${r0(p.x)} · Y ${r0(p.y)} · Z ${r0(p.z)}`;
const speedName = (v: number) => SPEEDS.find(([, s]) => s === v)?.[0] ?? `속도 ${v}`;

export default function ProcessFlow(p: Props) {
  const f = p.flow;
  const set = (patch: Partial<FlowState>) => p.onFlow({ ...f, ...patch });
  const prac = practiceOf(f.kind);
  const plan = activePlan(f);
  const teach = teachOf(plan);
  const setPlan = (next: Plan) => set({ plans: { ...f.plans, [f.kind]: fitSpots(next) } });

  const steps = (
    <nav className={css.flowbar} aria-label="공정 짜기 단계">
      {STEPS.map((t, k) => {
        const n = (k + 1) as FlowStep;
        return (
          <button key={t} type="button" aria-current={f.step === n ? 'step' : undefined} data-done={f.step > n || undefined} disabled={p.busy} onClick={() => set({ step: n })}>
            <i>{f.step > n ? '✓' : n}</i>
            <span>{t}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={css.wrap}>
      {f.step >= 3 && (
        <div className={css.top}>
          <div>
            <b>{prac.name}</b>
            <small>
              {LEVEL_NAME[prac.level]} · {prac.tool === 'grip' ? '그리퍼' : '펜'}
            </small>
          </div>
          <div className={css.modes} role="group" aria-label="하는 방법">
            {(['follow', 'change', 'free'] as PlanMode[]).map((m) => (
              <button key={m} type="button" aria-pressed={f.mode === m} disabled={p.busy} onClick={() => set({ mode: m })} title={m === 'follow' ? '완성된 공정을 그대로 실행해요' : m === 'change' ? '위치를 가르치고 노란 값만 바꿔요' : '만들어진 동작 줄을 직접 고쳐요'}>
                {MODE_NAME[m]}
              </button>
            ))}
          </div>
        </div>
      )}
      {steps}
      {f.step === 1 && <BaseStep {...p} />}
      {f.step === 2 && <ChooseStep {...p} />}
      {f.step === 3 && <TeachStep {...p} plan={plan} teach={teach} setPlan={setPlan} />}
      {f.step === 4 && <ResultStep {...p} />}
    </div>
  );
}

/* --- 1 기준 잡기 ------------------------------------------------------------- */

function BaseStep(p: Props) {
  const f = p.flow;
  const set = (patch: Partial<FlowState>) => p.onFlow({ ...f, ...patch });
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

  const now = zeroBad
    ? { tone: 'bad', text: '영점이 어긋났어요. [영점 맞추기]로 맞춘 뒤 다시 확인하세요.' }
    : !zeroOk
      ? { tone: '', text: '영점이 맞는지 두 가지로 확인하고, 공정을 시작할 위치를 불러오세요.' }
      : { tone: 'ok', text: '영점이 맞아요. 시작 위치와 규칙을 확인하고 [다음]을 누르세요.' };

  return (
    <>
      <div className={css.body}>
        <div className={css.now} data-tone={now.tone || undefined}>
          <b>지금 할 일</b>
          <span>{now.text}</span>
        </div>

        <section className={css.sec}>
          <h4>
            영점 확인 <small>기준 = 일자로 편 자세 (모든 관절 0°)</small>
          </h4>
          <div className={css.box}>
            <div className={css.chk}>
              <i data-ok={marks === true || undefined} data-bad={marks === false || undefined}>
                {marks === true ? '✓' : marks === false ? '!' : '1'}
              </i>
              <span>
                <b>일자로 펴기</b>
                <small>{p.robotMode ? '관절 6개가 0° 로 가요. 관절마다 표시 선 두 개가 이어지면 맞아요.' : atZero ? '모든 관절이 0° 예요. 시뮬레이션에서는 표시 선이 늘 이어져 있어요.' : '관절 6개가 모두 0° 로 가요.'}</small>
              </span>
              <span className={css.chkEnd}>
                {p.robotMode && atZero && (
                  <>
                    <button type="button" className={css.btn} data-main={marks !== true || undefined} onClick={() => set({ marksOk: true })}>
                      맞아요
                    </button>
                    <button type="button" className={css.btn} onClick={() => set({ marksOk: false })}>
                      어긋났어요
                    </button>
                  </>
                )}
                {!(p.robotMode && atZero) && (
                  <button type="button" className={css.btn} data-main={!atZero || undefined} disabled={p.busy} onClick={() => p.onGoJoints(p.armZero.slice(), '일자 자세')}>
                    {atZero ? '다시 펴기' : '일자로 펴기'}
                  </button>
                )}
              </span>
            </div>
            <div className={css.chk}>
              <i data-ok={(miss !== null && miss <= MISS_OK_MM) || undefined} data-bad={(miss !== null && miss > MISS_OK_MM) || undefined}>
                {miss === null ? '2' : miss <= MISS_OK_MM ? '✓' : '!'}
              </i>
              <span>
                <b>기준점 찍어 보기</b>
                <small>
                  매트의 + 표시 (X {REF_MARK.x} · Y {REF_MARK.y}) 위 {REF_ABOVE_MM} mm 로 가서 빗나간 거리를 재요.
                </small>
              </span>
              <span className={css.chkEnd}>
                {p.robotMode ? (
                  <label className={css.mm} title="자로 잰 빗나간 거리">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={f.missMm ?? ''}
                      placeholder="?"
                      aria-label="빗나간 거리 (mm)"
                      onChange={(e) => set({ missMm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                    />
                    mm
                  </label>
                ) : (
                  miss !== null && <span className={css.mm}>{r1(miss)} mm</span>
                )}
                <button type="button" className={css.btn} data-main={(marks === true && miss === null) || undefined} disabled={p.busy} onClick={() => p.onGoTip({ ...REF_MARK, z: REF_ABOVE_MM }, '기준점 위')}>
                  기준점으로
                </button>
              </span>
            </div>
            <div className={css.stat}>
              {zeroBad ? <b data-tone="bad">● 영점 어긋남</b> : zeroOk ? <b data-tone="ok">● 영점 맞음</b> : <b>○ 확인 전</b>}
              <span>
                {MISS_OK_MM} mm 이하면 괜찮아요{p.robotMode ? ` · ${p.calibrated}` : ''}
              </span>
              <button type="button" className={css.link} data-tone="red" disabled={!p.robotMode || p.busy} title={p.robotMode ? '영점 맞추기를 열어요' : '로봇을 연결하면 영점을 맞춰요'} onClick={p.onZero}>
                어긋났어요 → 영점 맞추기
              </button>
            </div>
          </div>
        </section>

        <section className={css.sec}>
          <h4>
            시작 위치 불러오기 <small>공정의 첫 자세이자 돌아올 자세</small>
          </h4>
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
            <button type="button" className={css.btn} data-main disabled={p.busy} onClick={() => p.onGoJoints(f.startJoints.slice(), '시작 위치')}>
              이 위치로 보내기
            </button>
          </div>
        </section>

        <section className={css.sec}>
          <h4>
            움직임 규칙 <small>모든 실습에 저절로 적용돼요</small>
          </h4>
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
                <em>책상 위로 떠서</em>
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
        </section>
      </div>
      <div className={css.nav}>
        <span />
        <button type="button" data-main onClick={() => set({ step: 2 })}>
          다음: 실습 고르기 ▶
        </button>
      </div>
    </>
  );
}

/* --- 2 실습 고르기 ----------------------------------------------------------- */

function ChooseStep(p: Props) {
  const f = p.flow;
  const set = (patch: Partial<FlowState>) => p.onFlow({ ...f, ...patch });
  const [lv, setLv] = useState<PlanLevel | 'all'>('all');
  const prac = practiceOf(f.kind);
  const needGrip = prac.tool === 'grip';
  const toolOk = needGrip ? p.toolKind === 'grip' : p.toolKind === 'pen';
  const group = (g: 'carry' | 'path', title: string, sub: string) => (
    <div className={css.grp}>
      <h5>
        {title} <small>{sub}</small>
      </h5>
      <div className={css.cards}>
        {PLAN_PRACTICES.filter((x) => x.group === g && (lv === 'all' || x.level === lv)).map((x) => (
          <button key={x.kind} type="button" className={css.card} aria-pressed={f.kind === x.kind} onClick={() => set({ kind: x.kind })}>
            <span className={css.th}>{ICON[x.kind]}</span>
            <span>
              <b>{x.name}</b>
              <small>
                <span className={css.lv} data-lv={x.level}>
                  {LEVEL_NAME[x.level]}
                </span>
                {x.meta}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
  const start = () => {
    p.onStart(f.kind);
    set({ step: 3, plans: { ...f.plans, [f.kind]: f.plans[f.kind] ?? freshPlan(f.kind) } });
  };
  return (
    <>
      <div className={css.body}>
        <div className={css.tiles} data-compact role="group" aria-label="수준">
          {(['all', 'basic', 'apply', 'challenge'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={lv === k} onClick={() => setLv(k)}>
              {k === 'all' ? '전체' : LEVEL_NAME[k]}
            </button>
          ))}
        </div>
        {group('carry', '물건 옮기기', '집을 곳 · 놓을 곳을 가르쳐요 (그리퍼)')}
        {group('path', '움직임 · 궤적', '길을 따라 그려요 (펜)')}
        <div className={css.learn}>
          <b>
            {prac.name}{' '}
            <span className={css.lv} data-lv={prac.level}>
              {LEVEL_NAME[prac.level]}
            </span>
            <small> · {prac.minutes}분</small>
          </b>
          <ul>
            {prac.learn.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className={css.need}>
            필요한 도구 <b>{needGrip ? '그리퍼' : '펜 홀더'}</b>· 지금 <b data-tone={toolOk ? undefined : 'bad'}>{p.toolName}</b>
            {!toolOk && (p.robotMode ? <span>로봇에 {needGrip ? '그리퍼' : '펜 홀더'}를 달고 [도구]에서 바꿔 주세요.</span> : <span>시작하면 {needGrip ? '그리퍼' : '펜 홀더'}로 바꿔요.</span>)}
          </div>
        </div>
      </div>
      <div className={css.nav}>
        <button type="button" onClick={() => set({ step: 1 })}>
          ◀ 기준 잡기
        </button>
        <button type="button" data-main disabled={p.busy} onClick={start}>
          이 실습으로 시작 ▶
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

  return (
    <>
      <div className={css.body}>
        <div className={css.now} data-tone={now.tone || undefined}>
          <b>지금 할 일</b>
          <span>{now.text}</span>
        </div>

        <section className={css.sec}>
          <h4>
            가르칠 위치{' '}
            <small>
              {teach.length}곳 중 {plan.spots.filter(Boolean).length}곳 저장
            </small>
            {prac.group === 'carry' && !p.robotMode && (
              <button type="button" className={css.link} disabled={p.busy} onClick={p.onResetDesk} title="이 실습의 블록을 처음 자리에 다시 놓아요">
                블록 다시 놓기
              </button>
            )}
          </h4>
          <div className={css.pts}>
            {teach.map((t, k) => {
              const s = plan.spots[k];
              const on = !locked && k === current;
              return (
                <div key={k}>
                  <div className={css.pt} data-on={on || undefined} data-done={s ? true : undefined} onClick={() => !locked && setPicked(k)}>
                    <i>{t.tag}</i>
                    <span>
                      <b>{t.label}</b>
                      <small>{s ? (t.zOnly ? `Z ${r1(s.z)} (종이 높이)` : xyz(s)) : '아직 저장 안 함'}</small>
                    </span>
                    <span className={css.ptEnd}>
                      {s && !t.zOnly && (
                        <button type="button" className={css.btn} disabled={p.busy} onClick={(e) => (e.stopPropagation(), p.onGoTip(s, t.label))} title="손끝을 이 위치로 보내요">
                          가 보기
                        </button>
                      )}
                      {!locked && (
                        <button type="button" className={css.btn} data-main={on || undefined} disabled={p.busy} onClick={(e) => (e.stopPropagation(), save(k))}>
                          {s ? '다시 저장' : '지금 위치로 저장'}
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
        </section>

        {(prac.fields.length > 0 || prac.kind === 'shape') && (
          <section className={css.sec}>
            <h4>
              바꿀 값 <small>{locked ? '따라하기에서는 그대로예요' : '노란 값은 − + 로 바꿔요'}</small>
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
          <section className={css.sec}>
            <h4>
              만들어진 동작 <small>위치와 규칙으로 저절로{p.built.times > 1 ? ` · ${prac.group === 'carry' ? '블록' : '바퀴'} 하나마다` : ''}</small>
            </h4>
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
                MOVE 줄로 보기 <small>· {p.process.rows.length}줄 · 직접 짜기에서 고칠 수 있어요</small>
              </span>
              <span>{open ? '접기 ⌃' : '펼치기 ⌄'}</span>
            </button>
            {open && <RowList rows={p.process.rows} running={p.runningLine} />}
          </section>
        )}
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
  return (
    <>
      <div className={css.body}>
        <div className={css.now} data-tone={r ? (r.ok ? 'ok' : 'bad') : undefined}>
          <b>{r ? (r.ok ? '통과' : '다시') : '지금 할 일'}</b>
          <span>
            {r
              ? r.ok
                ? '시뮬레이션을 통과했어요. [로봇에서 실행]으로 실물에서 해 보거나, 공정 파일로 저장하세요.'
                : '시뮬레이션이 멈췄어요. 알림의 이유를 보고 [위치 가르치기]에서 고쳐 주세요.'
              : '▶ 시뮬레이션으로 공정 전체를 돌려 보세요.'}
          </span>
        </div>
        <div className={css.result}>
          <div>
            <small>결과</small>
            <b data-tone={r ? (r.ok ? 'ok' : 'bad') : undefined}>{r ? (r.ok ? '통과' : '멈춤') : '–'}</b>
          </div>
          <div>
            <small>걸린 시간</small>
            <b>{r ? `${r1(r.seconds)} 초` : '–'}</b>
          </div>
          <div>
            <small>{prac.group === 'carry' ? '옮긴 블록' : '동작 줄'}</small>
            <b>{prac.group === 'carry' ? (r?.total ? `${r.placed ?? 0} / ${r.total}` : '–') : `${p.process.rows.length} 줄`}</b>
          </div>
        </div>
        <section className={css.sec}>
          <h4>
            동작 줄 <small>{p.process.rows.length}줄 · 실행 중인 줄이 밝아져요</small>
          </h4>
          <RowList rows={p.process.rows} running={p.runningLine} />
        </section>
        <section className={css.sec}>
          <h4>공정 파일</h4>
          <div className={css.fileRow}>
            <button type="button" className={css.btn} disabled={p.busy || !p.process.rows.length} onClick={p.onSaveFile}>
              공정 파일로 저장 (.pal)
            </button>
            <button type="button" className={css.btn} disabled={p.busy} onClick={p.onOpenFile}>
              공정 파일 열기
            </button>
          </div>
        </section>
      </div>
      {p.runBar}
    </>
  );
}
